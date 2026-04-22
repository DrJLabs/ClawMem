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
import { getWatcherSnapshot } from "./runtime.ts";

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
        if (typeof parsed.body?.path === "string" && parsed.body.path.trim().length > 0) {
          const path = normalizeCollectionPath(parsed.body.path.trim());
          if (!path) {
            return Response.json(
              { error: `Directory not found: ${pathResolve(parsed.body.path.trim())}` },
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
