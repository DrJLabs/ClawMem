export type AdminHealthState = "healthy" | "stale" | "degraded" | "unavailable";

export type HealthMessage = {
  state: AdminHealthState;
  message: string;
  checkedAt?: string;
};

export type LaneStatus = {
  enabled: boolean;
  latestRunStatus: string | null;
};

export type HeavyLaneStatus = LaneStatus & {
  window: string | null;
};

export type ActiveJob = {
  id: number;
  kind: string;
  status: string;
};

export type AlertItem = {
  id: string;
  severity: "info" | "warn" | "error";
  message: string;
};

export type OverviewResponse = {
  health: {
    service: HealthMessage;
    api: HealthMessage;
  };
  lanes: {
    light: LaneStatus;
    heavy: HeavyLaneStatus;
  };
  backlog: {
    totalDocuments: number;
    needsEmbedding: number;
  };
  activeJobs: ActiveJob[];
  alerts: AlertItem[];
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

export type MemoryFeedResponse = {
  items: MemoryFeedItem[];
};

export type RunItem = {
  id: string;
  source: "job" | "maintenance";
  label: string;
  status: string;
  detail: string;
  startedAt: string | null;
  finishedAt: string | null;
};

export type RunsResponse = {
  items: RunItem[];
};

export type RunDetailResponse = {
  item: RunItem;
};

export type ReindexJobRequest = {
  collection?: string | null;
};

export type ReindexJobResponse = {
  job: {
    id: number;
    kind: string;
    status: string;
    collection?: string | null;
  };
};
