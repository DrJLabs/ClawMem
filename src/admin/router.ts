import type { Store } from "../store.ts";
import { addCollection, getCollection, removeCollection, updateCollection } from "../collections.ts";
import { existsSync, statSync } from "fs";
import { resolve as pathResolve } from "path";
import {
  buildCollectionsModel,
  buildMemoryFeedModel,
  buildOverviewModel,
  buildRunsModel,
  getCollectionDetail,
  getRunDetail,
} from "./service.ts";
import { queueReindexJob } from "./jobs.ts";
import { getWatcherSnapshot, queryWatcherLogs } from "./runtime.ts";

export type AdminRoute = {
  method: string;
  pattern: RegExp;
  handler: (req: Request, url: URL) => Promise<Response> | Response;
};

async function parseJsonBody<T>(req: Request): Promise<{ ok: true; body: T | null } | { ok: false }> {
  const raw = await req.text();
  if (raw.trim().length === 0) {
    return { ok: true, body: null };
  }

  try {
    return { ok: true, body: JSON.parse(raw) as T };
  } catch {
    return { ok: false };
  }
}

function normalizeCollectionPath(input: string): string | null {
  const absPath = pathResolve(input);
  if (!existsSync(absPath)) return null;
  try {
    return statSync(absPath).isDirectory() ? absPath : null;
  } catch {
    return null;
  }
}

function getRouteId(url: URL): string | null {
  const id = url.pathname.split("/").pop();
  if (!id) return null;
  try {
    return decodeURIComponent(id);
  } catch {
    return id;
  }
}

function getAdminDocumentId(url: URL): string | null {
  const id = url.pathname.split("/")[3];
  return id ? decodeURIComponent(id) : null;
}

function resolveActiveDocument(store: Store, docid: string) {
  return store.db.prepare(
    "SELECT id, collection, path FROM documents WHERE hash LIKE ? AND active = 1 ORDER BY id LIMIT 1",
  ).get(`${docid.startsWith("#") ? docid.slice(1) : docid}%`) as { id: number; collection: string; path: string } | undefined;
}

async function loadLifecyclePolicy(dryRun: boolean) {
  const { loadVaultConfig } = await import("../config.ts");
  const config = loadVaultConfig();
  return config.lifecycle
    ?? { archive_after_days: 90, type_overrides: {}, purge_after_days: null, exempt_collections: [], dry_run: dryRun };
}

function normalizeSinceQuery(input: string | null): string | null {
  if (!input) return null;
  const parsed = new Date(input);
  return Number.isNaN(parsed.getTime()) ? null : input;
}

function getHeavyLaneWindow() {
  const start = process.env.CLAWMEM_HEAVY_LANE_WINDOW_START;
  const end = process.env.CLAWMEM_HEAVY_LANE_WINDOW_END;
  return {
    enabled: process.env.CLAWMEM_HEAVY_LANE === "true",
    start: start ? Number(start) : null,
    end: end ? Number(end) : null,
  };
}

export function createAdminRoutes(store: Store): AdminRoute[] {
  return [
    {
      method: "GET",
      pattern: /^\/admin\/overview$/,
      handler: async () => {
        const watcher = await getWatcherSnapshot().catch(() => ({
          id: "clawmem-watcher.service",
          activeState: "unavailable",
          subState: "failed",
          mainPid: null,
          startedAt: null,
          error: "Unable to inspect watcher",
        }));

        return Response.json(buildOverviewModel(store, {
          watcher,
          logs: watcher.error ? [{ level: "warn", message: watcher.error }] : [],
          heavyLaneWindow: getHeavyLaneWindow(),
        }));
      },
    },
    {
      method: "GET",
      pattern: /^\/admin\/memory-feed$/,
      handler: (_req: Request, url: URL) => {
        const rawLimit = Number(url.searchParams.get("limit") ?? "25");
        const limit = Number.isFinite(rawLimit) ? Math.min(Math.max(Math.trunc(rawLimit), 1), 100) : 25;
        return Response.json({ items: buildMemoryFeedModel(store, limit) });
      },
    },
    {
      method: "GET",
      pattern: /^\/admin\/logs$/,
      handler: async (_req: Request, url: URL) => {
        const rawLimit = Number(url.searchParams.get("limit") ?? "200");
        const limit = Number.isFinite(rawLimit) ? Math.min(Math.max(Math.trunc(rawLimit), 1), 500) : 200;
        const rawLevel = url.searchParams.get("level");
        const level = rawLevel === "err" || rawLevel === "warn" || rawLevel === "info" ? rawLevel : undefined;
        const rawSince = url.searchParams.get("since");
        const since = normalizeSinceQuery(rawSince);
        if (rawSince && !since) {
          return Response.json({ error: "since must be a valid timestamp" }, { status: 400 });
        }
        const items = await queryWatcherLogs({ limit, since, priority: level });
        return Response.json({ items });
      },
    },
    {
      method: "GET",
      pattern: /^\/admin\/collections$/,
      handler: () => Response.json({ items: buildCollectionsModel(store) }),
    },
    {
      method: "POST",
      pattern: /^\/admin\/collections$/,
      handler: async (req: Request) => {
        const parsed = await parseJsonBody<{ name?: string; path?: string; pattern?: string }>(req);
        if (!parsed.ok) {
          return Response.json({ error: "Invalid JSON body" }, { status: 400 });
        }

        const name = parsed.body?.name?.trim();
        const rawPath = parsed.body?.path?.trim();
        const pattern = parsed.body?.pattern?.trim() || "**/*.md";

        if (!name || !rawPath) {
          return Response.json({ error: "name and path are required" }, { status: 400 });
        }

        if (getCollection(name)) {
          return Response.json({ error: `Collection already exists: ${name}` }, { status: 409 });
        }

        const path = normalizeCollectionPath(rawPath);
        if (!path) {
          return Response.json({ error: `Directory not found: ${pathResolve(rawPath)}` }, { status: 400 });
        }

        addCollection(name, path, pattern);
        return Response.json({ item: getCollectionDetail(store, name) }, { status: 201 });
      },
    },
    {
      method: "GET",
      pattern: /^\/admin\/collections\/([^/]+)$/,
      handler: (_req: Request, url: URL) => {
        const collectionId = getRouteId(url);
        if (!collectionId) {
          return Response.json({ error: "Collection id is required" }, { status: 400 });
        }

        const item = getCollectionDetail(store, collectionId);
        if (!item) {
          return Response.json({ error: `Collection not found: ${collectionId}` }, { status: 404 });
        }

        return Response.json({ item });
      },
    },
    {
      method: "PATCH",
      pattern: /^\/admin\/collections\/([^/]+)$/,
      handler: async (req: Request, url: URL) => {
        const collectionId = getRouteId(url);
        if (!collectionId) {
          return Response.json({ error: "Collection id is required" }, { status: 400 });
        }

        const parsed = await parseJsonBody<{ path?: string; pattern?: string }>(req);
        if (!parsed.ok) {
          return Response.json({ error: "Invalid JSON body" }, { status: 400 });
        }

        const patch: { path?: string; pattern?: string } = {};
        if (typeof parsed.body?.path === "string") {
          const trimmedPath = parsed.body.path.trim();
          if (trimmedPath.length === 0) {
            return Response.json({ error: "path must not be empty" }, { status: 400 });
          }

          const path = normalizeCollectionPath(trimmedPath);
          if (!path) {
            return Response.json(
              { error: `Directory not found: ${pathResolve(trimmedPath)}` },
              { status: 400 },
            );
          }
          patch.path = path;
        }
        if (typeof parsed.body?.pattern === "string" && parsed.body.pattern.trim().length > 0) {
          patch.pattern = parsed.body.pattern.trim();
        }

        const ok = updateCollection(collectionId, patch);
        if (!ok) {
          return Response.json({ error: `Collection not found: ${collectionId}` }, { status: 404 });
        }

        return Response.json({ item: getCollectionDetail(store, collectionId) });
      },
    },
    {
      method: "DELETE",
      pattern: /^\/admin\/collections\/([^/]+)$/,
      handler: (_req: Request, url: URL) => {
        const collectionId = getRouteId(url);
        if (!collectionId) {
          return Response.json({ error: "Collection id is required" }, { status: 400 });
        }

        const existing = getCollection(collectionId);
        if (!existing) {
          return Response.json({ error: `Collection not found: ${collectionId}` }, { status: 404 });
        }

        const removed = store.removeCollection(collectionId);
        return Response.json({ ok: true, removedId: collectionId, deletedDocs: removed.deletedDocs, cleanedHashes: removed.cleanedHashes });
      },
    },
    {
      method: "GET",
      pattern: /^\/admin\/runs$/,
      handler: (_req: Request, url: URL) => {
        const rawLimit = Number(url.searchParams.get("limit") ?? "25");
        const limit = Number.isFinite(rawLimit) ? Math.min(Math.max(Math.trunc(rawLimit), 1), 100) : 25;
        return Response.json({ items: buildRunsModel(store, limit) });
      },
    },
    {
      method: "GET",
      pattern: /^\/admin\/runs\/([^/]+)$/,
      handler: (_req: Request, url: URL) => {
        const runId = url.pathname.split("/").pop();
        if (!runId) {
          return Response.json({ error: "Run id is required" }, { status: 400 });
        }

        const item = getRunDetail(store, runId);
        if (!item) {
          return Response.json({ error: `Run not found: ${runId}` }, { status: 404 });
        }

        return Response.json({ item });
      },
    },
    {
      method: "POST",
      pattern: /^\/admin\/lifecycle\/sweep$/,
      handler: async (req: Request) => {
        const parsed = await parseJsonBody<{ dry_run?: boolean; confirm?: string }>(req);
        if (!parsed.ok) {
          return Response.json({ error: "Invalid JSON body" }, { status: 400 });
        }

        const dryRun = parsed.body?.dry_run ?? true;
        if (!dryRun && parsed.body?.confirm !== "ARCHIVE") {
          return Response.json({ error: "confirm must equal ARCHIVE for destructive lifecycle sweeps" }, { status: 400 });
        }
        const policy = await loadLifecyclePolicy(dryRun);
        const candidates = store.getArchiveCandidates(policy);

        if (dryRun) {
          return Response.json({
            dry_run: true,
            candidates: candidates.length,
            documents: candidates.map((item) => ({
              id: item.id,
              path: `${item.collection}/${item.path}`,
              title: item.title,
              content_type: item.content_type,
              modified_at: item.modified_at,
              last_accessed_at: item.last_accessed_at,
            })),
          });
        }

        const archived = store.archiveDocuments(candidates.map((candidate) => candidate.id));
        return Response.json({ dry_run: false, archived });
      },
    },
    {
      method: "POST",
      pattern: /^\/admin\/lifecycle\/restore$/,
      handler: async (req: Request) => {
        const parsed = await parseJsonBody<{ collection?: string }>(req);
        if (!parsed.ok) {
          return Response.json({ error: "Invalid JSON body" }, { status: 400 });
        }

        const restored = store.restoreArchivedDocuments(
          parsed.body?.collection ? { collection: parsed.body.collection } : {},
        );
        return Response.json({ restored });
      },
    },
    {
      method: "POST",
      pattern: /^\/admin\/documents\/([^/]+)\/pin$/,
      handler: async (req: Request, url: URL) => {
        const docid = getAdminDocumentId(url);
        if (!docid) {
          return Response.json({ error: "docid is required" }, { status: 400 });
        }

        const parsed = await parseJsonBody<{ unpin?: boolean }>(req);
        if (!parsed.ok) {
          return Response.json({ error: "Invalid JSON body" }, { status: 400 });
        }

        const doc = resolveActiveDocument(store, docid);
        if (!doc) {
          return Response.json({ error: `Document not found: ${docid}` }, { status: 404 });
        }

        const unpin = parsed.body?.unpin ?? false;
        store.pinDocument(doc.collection, doc.path, !unpin);
        return Response.json({ docid, pinned: !unpin });
      },
    },
    {
      method: "POST",
      pattern: /^\/admin\/documents\/([^/]+)\/snooze$/,
      handler: async (req: Request, url: URL) => {
        const docid = getAdminDocumentId(url);
        if (!docid) {
          return Response.json({ error: "docid is required" }, { status: 400 });
        }

        const parsed = await parseJsonBody<{ until?: string; unsnooze?: boolean }>(req);
        if (!parsed.ok) {
          return Response.json({ error: "Invalid JSON body" }, { status: 400 });
        }

        const doc = resolveActiveDocument(store, docid);
        if (!doc) {
          return Response.json({ error: `Document not found: ${docid}` }, { status: 404 });
        }

        const until = parsed.body?.unsnooze
          ? null
          : (parsed.body?.until ?? new Date(Date.now() + 30 * 86400000).toISOString());
        store.snoozeDocument(doc.collection, doc.path, until);
        return Response.json({ docid, snoozed: !parsed.body?.unsnooze, until });
      },
    },
    {
      method: "POST",
      pattern: /^\/admin\/documents\/([^/]+)\/forget$/,
      handler: async (req: Request, url: URL) => {
        const docid = getAdminDocumentId(url);
        if (!docid) {
          return Response.json({ error: "docid is required" }, { status: 400 });
        }

        const parsed = await parseJsonBody<{ confirm?: string }>(req);
        if (!parsed.ok) {
          return Response.json({ error: "Invalid JSON body" }, { status: 400 });
        }
        if (parsed.body?.confirm !== "FORGET") {
          return Response.json({ error: "confirm must equal FORGET for document deactivation" }, { status: 400 });
        }

        const doc = resolveActiveDocument(store, docid);
        if (!doc) {
          return Response.json({ error: `Document not found: ${docid}` }, { status: 404 });
        }

        store.deactivateDocument(doc.collection, doc.path);
        return Response.json({ docid, forgotten: true });
      },
    },
    {
      method: "POST",
      pattern: /^\/admin\/jobs\/reindex$/,
      handler: async (req: Request) => {
        const parsed = await parseJsonBody<{ collection?: string }>(req);
        if (!parsed.ok) {
          return Response.json({ error: "Invalid JSON body" }, { status: 400 });
        }

        const collection = parsed.body?.collection?.trim() || undefined;

        if (collection && !getCollection(collection)) {
          return Response.json(
            { error: `Collection not configured for reindex: ${collection}` },
            { status: 404 },
          );
        }

        const job = await queueReindexJob(store, collection);
        return Response.json({ job }, { status: 202 });
      },
    },
  ];
}
