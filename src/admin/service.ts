import type { Store } from "../store.ts";
import type { MemoryFeedItem, OverviewModel } from "./types.ts";

type OverviewRuntime = {
  watcher: { activeState: string; subState: string; mainPid: number | null };
  logs: Array<{ level: string; message: string }>;
  heavyLaneWindow: { enabled: boolean; start: number | null; end: number | null };
};

type MaintenanceStatusRow = {
  status: string;
};

type ActiveJobRow = {
  id: number;
  kind: string;
  status: string;
};

type MemoryFeedRow = {
  id: number;
  title: string;
  path: string;
  content_type: string | null;
  created_at: string;
};

function formatWindow(start: number | null, end: number | null): string | null {
  if (start === null || end === null) return null;
  return `${start}:00-${end}:00`;
}

function deriveServiceHealthState(activeState: string): "healthy" | "degraded" | "unavailable" {
  if (activeState === "active") return "healthy";
  if (activeState === "activating" || activeState === "reloading") return "degraded";
  return "unavailable";
}

function deriveServiceHealthMessage(activeState: string): string {
  if (activeState === "active") return "Watcher running";
  if (activeState === "activating" || activeState === "reloading") return "Watcher degraded";
  return "Watcher unavailable";
}

export function buildOverviewModel(store: Store, runtime: OverviewRuntime): OverviewModel {
  const checkedAt = new Date().toISOString();
  const status = store.getStatus();
  const activeJobs = store.db.prepare(`
    SELECT id, kind, status
    FROM admin_jobs
    WHERE status IN ('queued', 'running')
    ORDER BY datetime(created_at) DESC, id DESC
    LIMIT 10
  `).all() as ActiveJobRow[];

  const latestLight = store.db.prepare(`
    SELECT status
    FROM maintenance_runs
    WHERE lane = 'light'
    ORDER BY started_at DESC
    LIMIT 1
  `).get() as MaintenanceStatusRow | undefined;

  const latestHeavy = store.db.prepare(`
    SELECT status
    FROM maintenance_runs
    WHERE lane = 'heavy'
    ORDER BY started_at DESC
    LIMIT 1
  `).get() as MaintenanceStatusRow | undefined;

  return {
    health: {
      service: {
        state: deriveServiceHealthState(runtime.watcher.activeState),
        message: deriveServiceHealthMessage(runtime.watcher.activeState),
        checkedAt,
      },
      api: {
        state: "unavailable",
        message: "Operator API status unavailable",
        checkedAt,
      },
    },
    lanes: {
      light: {
        enabled: true,
        latestRunStatus: latestLight?.status ?? "unknown",
      },
      heavy: {
        enabled: runtime.heavyLaneWindow.enabled,
        window: runtime.heavyLaneWindow.enabled
          ? formatWindow(runtime.heavyLaneWindow.start, runtime.heavyLaneWindow.end)
          : null,
        latestRunStatus: latestHeavy?.status ?? "unknown",
      },
    },
    backlog: {
      totalDocuments: status.totalDocuments,
      needsEmbedding: status.needsEmbedding,
    },
    activeJobs: activeJobs.map((row) => ({
      id: row.id,
      kind: row.kind,
      status: row.status,
    })),
    alerts: runtime.logs.slice(0, 3).map((log, index) => ({
      id: `alert-${index}`,
      severity: log.level === "err" ? "error" : log.level === "warn" ? "warn" : "info",
      message: log.message,
    })),
    checkedAt,
  };
}

export function buildMemoryFeedModel(store: Store, limit: number): MemoryFeedItem[] {
  const rows = store.db.prepare(`
    SELECT id, title, path, content_type, created_at
    FROM documents
    WHERE active = 1 AND collection = '_clawmem'
    ORDER BY created_at DESC
    LIMIT ?
  `).all(limit) as MemoryFeedRow[];

  return rows.map((row) => ({
    documentId: String(row.id),
    type: row.content_type ?? "note",
    title: row.title,
    summary: row.title,
    createdAt: row.created_at,
    sourceSession: null,
    sourceRun: null,
    path: row.path,
  }));
}
