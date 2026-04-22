export type AdminHealthState = "healthy" | "stale" | "degraded" | "unavailable";

export type AdminServiceHealth = {
  state: AdminHealthState;
  message: string;
  checkedAt: string;
};

export type AdminAlert = {
  id: string;
  severity: "info" | "warn" | "error";
  message: string;
};

export type AdminActiveJob = {
  id: number;
  kind: string;
  status: string;
};

export type OverviewModel = {
  health: {
    service: AdminServiceHealth;
    api: AdminServiceHealth;
  };
  lanes: {
    light: { enabled: boolean; latestRunStatus: string | null };
    heavy: { enabled: boolean; window: string | null; latestRunStatus: string | null };
  };
  backlog: {
    totalDocuments: number;
    needsEmbedding: number;
  };
  activeJobs: AdminActiveJob[];
  alerts: AdminAlert[];
  checkedAt: string;
};

export type MemoryFeedItem = {
  documentId: string;
  type: string;
  title: string;
  summary: string;
  createdAt: string;
  sourceSession: string | null;
  sourceRun: number | null;
  path: string;
};

export type WatcherSnapshot = {
  id: string;
  activeState: string;
  subState: string;
  mainPid: number | null;
  startedAt: string | null;
  error?: string | null;
};

export type JournalLogLevel = "err" | "warn" | "info";

export type JournalLogEntry = {
  timestamp: string | null;
  level: JournalLogLevel;
  source: string;
  message: string;
};

export type AdminRunSource = "job" | "maintenance";

export type AdminRunItem = {
  id: string;
  source: AdminRunSource;
  label: string;
  status: string;
  detail: string;
  startedAt: string | null;
  finishedAt: string | null;
};

export type AdminRunsResponse = {
  items: AdminRunItem[];
};
