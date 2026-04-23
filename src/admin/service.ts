import type { Store } from "../store.ts";
import { getCollection, listCollections, type NamedCollection } from "../collections.ts";
import type {
  AdminCollectionDetail,
  AdminCollectionItem,
  AdminRunItem,
  MemoryFeedItem,
  OverviewModel,
} from "./types.ts";

type OverviewRuntime = {
  watcher: { activeState: string; subState: string; mainPid: number | null; environment?: Record<string, string> };
  logs: Array<{ level: string; message: string }>;
  lightLaneEnabled: boolean;
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
  observation_type: string | null;
  narrative: string | null;
  facts: string | null;
  source_doc_ids: string | null;
  body: string;
};

type CollectionStatsRow = {
  collection: string;
  documents: number;
  embedded_documents: number;
  unembedded_documents: number;
  last_activity: string | null;
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

function shouldSuppressMaintenanceRun(run: MaintenanceStatusRow): boolean {
  return run.lane === "heavy" && run.status === "skipped" && run.reason === "outside_window";
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
        enabled: runtime.lightLaneEnabled,
        latestRunStatus: latestLight?.status ?? (runtime.lightLaneEnabled ? "enabled" : "disabled"),
      },
      heavy: {
        enabled: runtime.heavyLaneWindow.enabled,
        window: runtime.heavyLaneWindow.enabled
          ? formatWindow(runtime.heavyLaneWindow.start, runtime.heavyLaneWindow.end)
          : null,
        latestRunStatus: latestHeavy?.status ?? (runtime.heavyLaneWindow.enabled ? "enabled" : "disabled"),
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
    .filter((item) => {
      if (item.source !== "maintenance") return true;
      const runId = Number(item.id.slice("maintenance-".length));
      const run = maintenance.find((candidate) => candidate.id === runId);
      return run ? !shouldSuppressMaintenanceRun(run) : true;
    })
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
    SELECT d.id,
           d.title,
           d.path,
           d.content_type,
           d.created_at,
           d.observation_type,
           d.narrative,
           d.facts,
           d.source_doc_ids,
           c.doc AS body
    FROM documents d
    JOIN content c ON c.hash = d.hash
    WHERE active = 1 AND collection = '_clawmem'
    ORDER BY datetime(d.created_at) DESC, d.id DESC
    LIMIT ?
  `).all(limit) as MemoryFeedRow[];

  return rows.map((row) => ({
    documentId: String(row.id),
    type: row.observation_type ?? row.content_type ?? "note",
    title: row.title,
    summary: buildFeedSummary(row),
    body: row.body,
    createdAt: row.created_at,
    sourceSession: null,
    sourceRun: null,
    sourceCount: parseSourceCount(row.source_doc_ids),
    path: row.path,
  }));
}

function parseSourceCount(raw: string | null): number {
  if (!raw) return 0;
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed.length : 0;
  } catch {
    return 0;
  }
}

function compactWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function extractFactSummary(raw: string | null): string | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return null;
    const facts = parsed
      .filter((entry): entry is string => typeof entry === "string")
      .map((entry) => compactWhitespace(entry))
      .filter(Boolean);
    if (facts.length === 0) return null;
    return facts.slice(0, 2).join(" ");
  } catch {
    return null;
  }
}

function extractBodySummary(body: string): string {
  const lines = body
    .split("\n")
    .map((line) => compactWhitespace(line))
    .filter((line) => line.length > 0 && !line.startsWith("#") && !line.startsWith("```"));

  const summary = lines.slice(0, 2).join(" ");
  return summary || "No summary available.";
}

function buildFeedSummary(row: MemoryFeedRow): string {
  const narrative = row.narrative ? compactWhitespace(row.narrative) : "";
  if (narrative.length > 0) return narrative;

  const factSummary = extractFactSummary(row.facts);
  if (factSummary) return factSummary;

  return extractBodySummary(row.body);
}

function buildCollectionStatsMap(store: Store): Map<string, CollectionStatsRow> {
  const rows = store.db.prepare(`
    SELECT collection,
           COUNT(*) AS documents,
           SUM(CASE WHEN embed_state = 'synced' THEN 1 ELSE 0 END) AS embedded_documents,
           SUM(CASE WHEN embed_state IS NULL OR embed_state != 'synced' THEN 1 ELSE 0 END) AS unembedded_documents,
           MAX(COALESCE(last_accessed_at, modified_at, created_at)) AS last_activity
    FROM documents
    WHERE active = 1
    GROUP BY collection
  `).all() as CollectionStatsRow[];

  return new Map(rows.map((row) => [row.collection, row]));
}

function toCollectionItem(
  collection: NamedCollection,
  stats: CollectionStatsRow | undefined,
): AdminCollectionItem {
  return {
    id: collection.name,
    name: collection.name,
    root: collection.path,
    pattern: collection.pattern,
    documents: stats?.documents ?? 0,
    embeddedDocuments: stats?.embedded_documents ?? 0,
    unembeddedDocuments: stats?.unembedded_documents ?? 0,
    lastActivity: stats?.last_activity ?? null,
    updateCommand: collection.update ?? null,
  };
}

export function buildCollectionsModel(store: Store): AdminCollectionItem[] {
  const stats = buildCollectionStatsMap(store);
  return listCollections()
    .map((collection) => toCollectionItem(collection, stats.get(collection.name)))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function getCollectionDetail(store: Store, collectionId: string): AdminCollectionDetail | null {
  const collection = getCollection(collectionId);
  if (!collection) return null;
  const stats = buildCollectionStatsMap(store);
  return toCollectionItem(collection, stats.get(collection.name));
}
