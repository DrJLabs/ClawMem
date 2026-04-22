import type { Store } from "../store.ts";
import type { AdminRunItem, MemoryFeedItem, OverviewModel } from "./types.ts";

type OverviewRuntime = {
  watcher: { activeState: string; subState: string; mainPid: number | null };
  logs: Array<{ level: string; message: string }>;
  heavyLaneWindow: { enabled: boolean; start: number | null; end: number | null };
};

type MaintenanceStatusRow = {
  id: number;
  lane: string;
  phase: string;
  status: string;
  reason: string | null;
  started_at: string;
  finished_at: string | null;
};

type ActiveJobRow = {
  id: number;
  kind: string;
  status: string;
  started_at: string | null;
  finished_at: string | null;
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
    SELECT id, kind, status, started_at, finished_at
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

export function buildRunsModel(store: Store, limit: number): AdminRunItem[] {
  const jobs = store.db.prepare(`
    SELECT id, kind, status, started_at, finished_at
    FROM admin_jobs
    ORDER BY datetime(created_at) DESC, id DESC
    LIMIT ?
  `).all(limit) as ActiveJobRow[];

  const maintenance = store.db.prepare(`
    SELECT id, lane, phase, status, reason, started_at, finished_at
    FROM maintenance_runs
    ORDER BY datetime(started_at) DESC, id DESC
    LIMIT ?
  `).all(limit) as MaintenanceStatusRow[];

  const items: AdminRunItem[] = [
    ...jobs.map((job) => ({
      id: `job-${job.id}`,
      source: "job" as const,
      label: job.kind,
      status: job.status,
      detail: `Admin job #${job.id}`,
      startedAt: job.started_at,
      finishedAt: job.finished_at,
    })),
    ...maintenance.map((run) => ({
      id: `maintenance-${run.id}`,
      source: "maintenance" as const,
      label: `${run.lane} / ${run.phase}`,
      status: run.status,
      detail: run.reason ? `${run.reason}` : "Maintenance lane activity",
      startedAt: run.started_at,
      finishedAt: run.finished_at,
    })),
  ];

  return items
    .sort((a, b) => {
      const aTime = a.startedAt ?? a.finishedAt ?? "";
      const bTime = b.startedAt ?? b.finishedAt ?? "";
      return bTime.localeCompare(aTime);
    })
    .slice(0, limit);
}

export function getRunDetail(store: Store, runId: string): AdminRunItem | null {
  if (runId.startsWith("job-")) {
    const id = Number(runId.slice(4));
    if (!Number.isFinite(id)) return null;
    const job = store.getAdminJob(id);
    if (!job) return null;
    return {
      id: runId,
      source: "job",
      label: job.kind,
      status: job.status,
      detail: job.error_text ?? `Admin job #${job.id}`,
      startedAt: job.started_at,
      finishedAt: job.finished_at,
    };
  }

  if (runId.startsWith("maintenance-")) {
    const id = Number(runId.slice("maintenance-".length));
    if (!Number.isFinite(id)) return null;
    const run = store.db.prepare(`
      SELECT id, lane, phase, status, reason, started_at, finished_at
      FROM maintenance_runs
      WHERE id = ?
      LIMIT 1
    `).get(id) as MaintenanceStatusRow | undefined;
    if (!run) return null;
    return {
      id: runId,
      source: "maintenance",
      label: `${run.lane} / ${run.phase}`,
      status: run.status,
      detail: run.reason ? `${run.reason}` : "Maintenance lane activity",
      startedAt: run.started_at,
      finishedAt: run.finished_at,
    };
  }

  return null;
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
