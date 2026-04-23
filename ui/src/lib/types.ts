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
  body: string;
  createdAt: string;
  sourceSession: string | null;
  sourceRun: number | null;
  sourceCount: number;
  path: string;
};

export type MemoryFeedResponse = {
  items: MemoryFeedItem[];
};

export type CollectionItem = {
  id: string;
  name: string;
  root: string;
  pattern: string;
  documents: number;
  embeddedDocuments: number;
  unembeddedDocuments: number;
  lastActivity: string | null;
  updateCommand: string | null;
};

export type CollectionsResponse = {
  items: CollectionItem[];
};

export type CollectionDetailResponse = {
  item: CollectionItem;
};

export type CreateCollectionRequest = {
  name: string;
  path: string;
  pattern?: string;
};

export type UpdateCollectionRequest = {
  path?: string;
  pattern?: string;
};

export type DeleteCollectionResponse = {
  ok: true;
  removedId: string;
};

export type RunItem = {
  id: string;
  source: "job" | "maintenance" | "lane";
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

export type JournalLogLevel = "err" | "warn" | "info";

export type JournalLogItem = {
  timestamp: string | null;
  level: JournalLogLevel;
  source: string;
  message: string;
};

export type LogsResponse = {
  items: JournalLogItem[];
};

export type LifecycleSweepRequest = {
  dry_run?: boolean;
  confirm?: string;
};

export type LifecycleSweepResponse = {
  dry_run: boolean;
  candidates?: number;
  archived?: number;
  documents?: Array<{
    id: number;
    path: string;
    title: string;
    content_type: string | null;
    modified_at: string | null;
    last_accessed_at: string | null;
  }>;
};

export type LifecycleRestoreRequest = {
  collection?: string;
};

export type LifecycleRestoreResponse = {
  restored: number;
};

export type PinDocumentRequest = {
  unpin?: boolean;
};

export type PinDocumentResponse = {
  docid: string;
  pinned: boolean;
};

export type SnoozeDocumentRequest = {
  until?: string;
  unsnooze?: boolean;
};

export type SnoozeDocumentResponse = {
  docid: string;
  snoozed: boolean;
  until: string | null;
};

export type ForgetDocumentResponse = {
  docid: string;
  forgotten: true;
};

export type ForgetDocumentRequest = {
  confirm: string;
};
