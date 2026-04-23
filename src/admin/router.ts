import { parseVirtualPath, type Store } from "../store.ts";
import { addCollection, getCollection, updateCollection } from "../collections.ts";
import { existsSync, statSync } from "fs";
import { resolve as pathResolve } from "path";
import {
  buildCollectionsModel,
  buildMemoryFeedModel,
  buildOverviewModel,
  buildRunsModel,
  type OverviewModel,
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

function normalizeCollectionPath(input: string): { path: string | null; error: string } {
  const absPath = pathResolve(input);
  const deniedPrefixes = ["/etc", "/root", "/var", "/proc", "/sys", "/dev"];
  const deniedPatterns = [".ssh", ".gnupg", ".env", "credentials", "secrets", ".aws", ".kube"];
  if (deniedPrefixes.some((prefix) => absPath === prefix || absPath.startsWith(`${prefix}/`))) {
    return { path: null, error: `Directory not allowed: ${absPath}` };
  }
  if (deniedPatterns.some((pattern) => absPath.toLowerCase().includes(pattern.toLowerCase()))) {
    return { path: null, error: `Directory not allowed: ${absPath}` };
  }
  if (!existsSync(absPath)) return { path: null, error: `Directory not found: ${absPath}` };
  try {
    return statSync(absPath).isDirectory()
      ? { path: absPath, error: "" }
      : { path: null, error: `Directory not found: ${absPath}` };
  } catch {
    return { path: null, error: `Directory not found: ${absPath}` };
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
  const match = url.pathname.match(/^\/admin\/documents\/([^/]+)\/(?:pin|snooze|forget)$/);
  const id = match?.[1];
  if (!id) return null;
  try {
    return decodeURIComponent(id);
  } catch {
    return id;
  }
}

function resolveActiveDocument(store: Store, docid: string) {
  const resolved = store.findDocumentByDocid(docid);
  if (!resolved) return null;

  const parsed = parseVirtualPath(resolved.filepath);
  if (!parsed) return null;

  return {
    collection: parsed.collectionName,
    path: parsed.path,
  };
}

async function loadLifecyclePolicy(dryRun: boolean) {
  const { loadVaultConfig } = await import("../config.ts");
  const config = loadVaultConfig();
  return config.lifecycle
    ?? { archive_after_days: 90, type_overrides: {}, purge_after_days: null, exempt_collections: [], dry_run: dryRun };
}

function normalizeSinceQuery(input: string | null): string | null {
  if (!input) return null;
  const trimmed = input.trim();
  if (!trimmed) return null;
  const parsed = new Date(input);
  if (!Number.isNaN(parsed.getTime())) {
    return trimmed;
  }

  const journalctlRelativePattern = /^(?:\d+\s+(?:second|minute|hour|day|week|month|year)s?\s+ago|yesterday|today|now|last\s+\w+|this\s+\w+)$/i;
  return journalctlRelativePattern.test(trimmed) ? trimmed : null;
}

function isValidTimestamp(input: string): boolean {
  return !Number.isNaN(new Date(input).getTime());
}

function getLaneConfigFromWatcher(watcher: { environment?: Record<string, string> }) {
  const env = watcher.environment ?? {};
  const heavyStart = env.CLAWMEM_HEAVY_LANE_WINDOW_START;
  const heavyEnd = env.CLAWMEM_HEAVY_LANE_WINDOW_END;

  return {
    lightLaneEnabled: env.CLAWMEM_ENABLE_CONSOLIDATION === "true",
    heavyLaneWindow: {
      enabled: env.CLAWMEM_HEAVY_LANE === "true",
      start: heavyStart ? Number(heavyStart) : null,
      end: heavyEnd ? Number(heavyEnd) : null,
    },
  };
}

function buildCurrentLaneRunItems(overview: OverviewModel) {
  return [
    {
      id: "lane-light-current",
      source: "lane" as const,
      label: "Light lane",
      status: overview.lanes.light.latestRunStatus ?? "unknown",
      detail: overview.lanes.light.enabled ? "Watcher-hosted consolidation worker" : "Disabled",
      startedAt: overview.checkedAt,
      finishedAt: null,
    },
    {
      id: "lane-heavy-current",
      source: "lane" as const,
      label: "Heavy lane",
      status: overview.lanes.heavy.latestRunStatus ?? "unknown",
      detail: overview.lanes.heavy.enabled ? overview.lanes.heavy.window ?? "Enabled" : "Disabled",
      startedAt: overview.checkedAt,
      finishedAt: null,
    },
  ];
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
          environment: {},
          error: "Unable to inspect watcher",
        }));
        const laneConfig = getLaneConfigFromWatcher(watcher);
        const overview = buildOverviewModel(store, {
          watcher,
          logs: watcher.error ? [{ level: "warn", message: watcher.error }] : [],
          lightLaneEnabled: laneConfig.lightLaneEnabled,
          heavyLaneWindow: laneConfig.heavyLaneWindow,
        });

        return Response.json(overview);
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

        const normalizedPath = normalizeCollectionPath(rawPath);
        if (!normalizedPath.path) {
          return Response.json({ error: normalizedPath.error }, { status: 400 });
        }

        addCollection(name, normalizedPath.path, pattern);
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

          const normalizedPath = normalizeCollectionPath(trimmedPath);
          if (!normalizedPath.path) {
            return Response.json({ error: normalizedPath.error }, { status: 400 });
          }
          patch.path = normalizedPath.path;
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
      handler: async (_req: Request, url: URL) => {
        const rawLimit = Number(url.searchParams.get("limit") ?? "25");
        const limit = Number.isFinite(rawLimit) ? Math.min(Math.max(Math.trunc(rawLimit), 1), 100) : 25;
        const watcher = await getWatcherSnapshot().catch(() => ({
          id: "clawmem-watcher.service",
          activeState: "unavailable",
          subState: "failed",
          mainPid: null,
          startedAt: null,
          environment: {},
          error: "Unable to inspect watcher",
        }));
        const laneConfig = getLaneConfigFromWatcher(watcher);
        const overview = buildOverviewModel(store, {
          watcher,
          logs: watcher.error ? [{ level: "warn", message: watcher.error }] : [],
          lightLaneEnabled: laneConfig.lightLaneEnabled,
          heavyLaneWindow: laneConfig.heavyLaneWindow,
        });
        const items = [...buildCurrentLaneRunItems(overview), ...buildRunsModel(store, limit)];
        return Response.json({ items: items.slice(0, limit) });
      },
    },
    {
      method: "GET",
      pattern: /^\/admin\/runs\/([^/]+)$/,
      handler: async (_req: Request, url: URL) => {
        const runId = url.pathname.split("/").pop();
        if (!runId) {
          return Response.json({ error: "Run id is required" }, { status: 400 });
        }

        if (runId === "lane-light-current" || runId === "lane-heavy-current") {
          const watcher = await getWatcherSnapshot().catch(() => ({
            id: "clawmem-watcher.service",
            activeState: "unavailable",
            subState: "failed",
            mainPid: null,
            startedAt: null,
            environment: {},
            error: "Unable to inspect watcher",
          }));
          const laneConfig = getLaneConfigFromWatcher(watcher);
          const overview = buildOverviewModel(store, {
            watcher,
            logs: watcher.error ? [{ level: "warn", message: watcher.error }] : [],
            lightLaneEnabled: laneConfig.lightLaneEnabled,
            heavyLaneWindow: laneConfig.heavyLaneWindow,
          });
          const item = buildCurrentLaneRunItems(overview).find((candidate) => candidate.id === runId);
          if (!item) {
            return Response.json({ error: `Run not found: ${runId}` }, { status: 404 });
          }
          return Response.json({ item });
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

        if (typeof parsed.body?.until === "string" && !isValidTimestamp(parsed.body.until)) {
          return Response.json({ error: "until must be a valid timestamp" }, { status: 400 });
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
