import type { Store } from "../store.ts";
import { getCollection } from "../collections.ts";
import { buildMemoryFeedModel, buildOverviewModel } from "./service.ts";
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
