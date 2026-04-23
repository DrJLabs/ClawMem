import type {
  CollectionDetailResponse,
  CollectionsResponse,
  CreateCollectionRequest,
  DeleteCollectionResponse,
  ForgetDocumentRequest,
  ForgetDocumentResponse,
  JournalLogItem,
  LifecycleRestoreRequest,
  LifecycleRestoreResponse,
  LifecycleSweepRequest,
  LifecycleSweepResponse,
  LogsResponse,
  MemoryFeedResponse,
  OverviewResponse,
  PinDocumentRequest,
  PinDocumentResponse,
  ReindexJobRequest,
  ReindexJobResponse,
  RunDetailResponse,
  RunsResponse,
  SnoozeDocumentRequest,
  SnoozeDocumentResponse,
  UpdateCollectionRequest,
} from "./types";

const API_TOKEN_STORAGE_KEY = "clawmem_api_token";
let cachedApiToken: string | null = null;

type TokenStorage = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
};

type TokenHistory = {
  replaceState(data: unknown, unused: string, url?: string | URL | null): void;
};

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isHealthMessage(value: unknown): boolean {
  const validStates = new Set(["healthy", "stale", "degraded", "unavailable"]);
  return (
    isObject(value) &&
    typeof value.state === "string" &&
    validStates.has(value.state) &&
    typeof value.message === "string"
  );
}

function isActiveJob(value: unknown): boolean {
  return (
    isObject(value) &&
    typeof value.id === "number" &&
    typeof value.kind === "string" &&
    typeof value.status === "string"
  );
}

function isAlertItem(value: unknown): boolean {
  const validSeverities = new Set(["info", "warn", "error"]);
  return (
    isObject(value) &&
    typeof value.id === "string" &&
    typeof value.message === "string" &&
    typeof value.severity === "string" &&
    validSeverities.has(value.severity)
  );
}

function isMemoryFeedItem(value: unknown): boolean {
  return (
    isObject(value) &&
    typeof value.documentId === "string" &&
    typeof value.type === "string" &&
    typeof value.title === "string" &&
    typeof value.summary === "string" &&
    typeof value.body === "string" &&
    typeof value.createdAt === "string" &&
    typeof value.path === "string" &&
    (typeof value.sourceSession === "string" || value.sourceSession === null) &&
    (typeof value.sourceRun === "number" || value.sourceRun === null) &&
    typeof value.sourceCount === "number"
  );
}

function isCollectionItem(value: unknown): boolean {
  return (
    isObject(value) &&
    typeof value.id === "string" &&
    typeof value.name === "string" &&
    typeof value.root === "string" &&
    typeof value.pattern === "string" &&
    typeof value.documents === "number" &&
    typeof value.embeddedDocuments === "number" &&
    typeof value.unembeddedDocuments === "number" &&
    (typeof value.lastActivity === "string" || value.lastActivity === null) &&
    (typeof value.updateCommand === "string" || value.updateCommand === null)
  );
}

function isRunItem(value: unknown): boolean {
  const validSources = new Set(["job", "maintenance", "lane"]);
  return (
    isObject(value) &&
    typeof value.id === "string" &&
    typeof value.label === "string" &&
    typeof value.status === "string" &&
    typeof value.detail === "string" &&
    typeof value.source === "string" &&
    validSources.has(value.source) &&
    (typeof value.startedAt === "string" || value.startedAt === null) &&
    (typeof value.finishedAt === "string" || value.finishedAt === null)
  );
}

function isLogItem(value: unknown): value is JournalLogItem {
  const validLevels = new Set(["err", "warn", "info"]);
  return (
    isObject(value) &&
    (typeof value.timestamp === "string" || value.timestamp === null) &&
    typeof value.level === "string" &&
    validLevels.has(value.level) &&
    typeof value.source === "string" &&
    typeof value.message === "string"
  );
}

function isLaneStatus(value: unknown): value is { enabled: boolean; latestRunStatus: string | null } {
  return (
    isObject(value) &&
    typeof value.enabled === "boolean" &&
    (typeof value.latestRunStatus === "string" || value.latestRunStatus === null)
  );
}

function isHeavyLaneStatus(
  value: unknown,
): value is { enabled: boolean; latestRunStatus: string | null; window: string | null } {
  const lane = value as { window?: unknown };
  return (
    isLaneStatus(value) &&
    (typeof lane.window === "string" || lane.window === null)
  );
}

function assertOverviewResponse(value: unknown): OverviewResponse {
  const lanes = isObject(value) && isObject(value.lanes) ? value.lanes : null;
  if (
    !isObject(value) ||
    !isObject(value.health) ||
    !isHealthMessage(value.health.service) ||
    !isHealthMessage(value.health.api) ||
    !isObject(value.backlog) ||
    typeof value.backlog.totalDocuments !== "number" ||
    typeof value.backlog.needsEmbedding !== "number" ||
    !lanes ||
    !isLaneStatus(lanes.light) ||
    !isHeavyLaneStatus(lanes.heavy) ||
    !Array.isArray(value.activeJobs) ||
    value.activeJobs.some((job) => !isActiveJob(job)) ||
    !Array.isArray(value.alerts) ||
    value.alerts.some((alert) => !isAlertItem(alert)) ||
    typeof value.checkedAt !== "string"
  ) {
    throw new Error("Invalid /admin/overview response");
  }
  return value as OverviewResponse;
}

function assertMemoryFeedResponse(value: unknown): MemoryFeedResponse {
  if (
    !isObject(value) ||
    !Array.isArray(value.items) ||
    value.items.some((item) => !isMemoryFeedItem(item))
  ) {
    throw new Error("Invalid /admin/memory-feed response");
  }
  return value as MemoryFeedResponse;
}

function assertCollectionsResponse(value: unknown): CollectionsResponse {
  if (
    !isObject(value) ||
    !Array.isArray(value.items) ||
    value.items.some((item) => !isCollectionItem(item))
  ) {
    throw new Error("Invalid /admin/collections response");
  }

  return value as CollectionsResponse;
}

function assertCollectionDetailResponse(value: unknown): CollectionDetailResponse {
  if (!isObject(value) || !isCollectionItem(value.item)) {
    throw new Error("Invalid /admin/collections/:id response");
  }

  return value as CollectionDetailResponse;
}

function assertDeleteCollectionResponse(value: unknown): DeleteCollectionResponse {
  if (!isObject(value) || value.ok !== true || typeof value.removedId !== "string") {
    throw new Error("Invalid DELETE /admin/collections/:id response");
  }

  return value as DeleteCollectionResponse;
}

function assertReindexJobResponse(value: unknown): ReindexJobResponse {
  if (
    !isObject(value) ||
    !isObject(value.job) ||
    typeof value.job.id !== "number" ||
    typeof value.job.kind !== "string" ||
    typeof value.job.status !== "string" ||
    ("collection" in value.job &&
      value.job.collection !== null &&
      typeof value.job.collection !== "string")
  ) {
    throw new Error("Invalid /admin/jobs/reindex response");
  }
  return value as ReindexJobResponse;
}

function assertRunsResponse(value: unknown): RunsResponse {
  if (!isObject(value) || !Array.isArray(value.items) || value.items.some((item) => !isRunItem(item))) {
    throw new Error("Invalid /admin/runs response");
  }
  return value as RunsResponse;
}

function assertRunDetailResponse(value: unknown): RunDetailResponse {
  if (!isObject(value) || !isRunItem(value.item)) {
    throw new Error("Invalid /admin/runs/:id response");
  }
  return value as RunDetailResponse;
}

function assertLogsResponse(value: unknown): LogsResponse {
  if (!isObject(value) || !Array.isArray(value.items) || value.items.some((item) => !isLogItem(item))) {
    throw new Error("Invalid /admin/logs response");
  }
  return value as LogsResponse;
}

function assertLifecycleSweepResponse(value: unknown): LifecycleSweepResponse {
  if (!isObject(value) || typeof value.dry_run !== "boolean") {
    throw new Error("Invalid /admin/lifecycle/sweep response");
  }
  return value as LifecycleSweepResponse;
}

function assertLifecycleRestoreResponse(value: unknown): LifecycleRestoreResponse {
  if (!isObject(value) || typeof value.restored !== "number") {
    throw new Error("Invalid /admin/lifecycle/restore response");
  }
  return value as LifecycleRestoreResponse;
}

function assertPinDocumentResponse(value: unknown): PinDocumentResponse {
  if (!isObject(value) || typeof value.docid !== "string" || typeof value.pinned !== "boolean") {
    throw new Error("Invalid /admin/documents/:docid/pin response");
  }
  return value as PinDocumentResponse;
}

function assertSnoozeDocumentResponse(value: unknown): SnoozeDocumentResponse {
  if (
    !isObject(value) ||
    typeof value.docid !== "string" ||
    typeof value.snoozed !== "boolean" ||
    (typeof value.until !== "string" && value.until !== null)
  ) {
    throw new Error("Invalid /admin/documents/:docid/snooze response");
  }
  return value as SnoozeDocumentResponse;
}

function assertForgetDocumentResponse(value: unknown): ForgetDocumentResponse {
  if (!isObject(value) || typeof value.docid !== "string" || value.forgotten !== true) {
    throw new Error("Invalid /admin/documents/:docid/forget response");
  }
  return value as ForgetDocumentResponse;
}

function getDefaultTokenStorage(): TokenStorage | null {
  return typeof window !== "undefined" ? window.sessionStorage : null;
}

function getDefaultTokenHistory(): TokenHistory | null {
  return typeof window !== "undefined" ? window.history : null;
}

export function bootstrapConsoleApiToken(
  urlInput?: string | URL | null,
  storage: TokenStorage | null = getDefaultTokenStorage(),
  history: TokenHistory | null = getDefaultTokenHistory(),
): string | null {
  if (!storage) {
    return cachedApiToken;
  }

  const existing = cachedApiToken ?? storage.getItem(API_TOKEN_STORAGE_KEY);
  cachedApiToken = existing;

  const rawUrl = urlInput === undefined
    ? (typeof window !== "undefined" ? window.location.href : null)
    : urlInput;
  if (!rawUrl) {
    return cachedApiToken;
  }

  const url = rawUrl instanceof URL ? new URL(rawUrl.toString()) : new URL(rawUrl, "https://console.local");
  const token = url.searchParams.get("token");
  if (!token || token.trim().length === 0) {
    return cachedApiToken;
  }

  cachedApiToken = token;
  storage.setItem(API_TOKEN_STORAGE_KEY, token);
  url.searchParams.delete("token");
  history?.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
  return token;
}

async function json(input: RequestInfo | URL, init?: RequestInit): Promise<unknown> {
  const token = bootstrapConsoleApiToken(null);
  const response = await fetch(input, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init?.headers ?? {}),
    },
  });

  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}`);
  }

  return response.json();
}

export const api = {
  getOverview: async () => assertOverviewResponse(await json("/admin/overview")),
  getMemoryFeed: async () => assertMemoryFeedResponse(await json("/admin/memory-feed")),
  getCollections: async () => assertCollectionsResponse(await json("/admin/collections")),
  getCollection: async (collectionId: string) =>
    assertCollectionDetailResponse(await json(`/admin/collections/${encodeURIComponent(collectionId)}`)),
  createCollection: async (body: CreateCollectionRequest) =>
    assertCollectionDetailResponse(await json("/admin/collections", {
      method: "POST",
      body: JSON.stringify(body),
    })),
  updateCollection: async (collectionId: string, body: UpdateCollectionRequest) =>
    assertCollectionDetailResponse(await json(`/admin/collections/${encodeURIComponent(collectionId)}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    })),
  deleteCollection: async (collectionId: string) =>
    assertDeleteCollectionResponse(await json(`/admin/collections/${encodeURIComponent(collectionId)}`, {
      method: "DELETE",
    })),
  getLogs: async (params?: URLSearchParams) =>
    assertLogsResponse(await json(`/admin/logs${params && params.toString() ? `?${params.toString()}` : ""}`)),
  getRuns: async () => assertRunsResponse(await json("/admin/runs")),
  getRunDetail: async (runId: string) => assertRunDetailResponse(await json(`/admin/runs/${encodeURIComponent(runId)}`)),
  queueReindex: (body: ReindexJobRequest) =>
    json("/admin/jobs/reindex", {
      method: "POST",
      body: JSON.stringify(body),
    }).then(assertReindexJobResponse),
  lifecycleSweep: (body: LifecycleSweepRequest) =>
    json("/admin/lifecycle/sweep", {
      method: "POST",
      body: JSON.stringify(body),
    }).then(assertLifecycleSweepResponse),
  lifecycleRestore: (body: LifecycleRestoreRequest) =>
    json("/admin/lifecycle/restore", {
      method: "POST",
      body: JSON.stringify(body),
    }).then(assertLifecycleRestoreResponse),
  pinDocument: (docid: string, body: PinDocumentRequest = {}) =>
    json(`/admin/documents/${encodeURIComponent(docid)}/pin`, {
      method: "POST",
      body: JSON.stringify(body),
    }).then(assertPinDocumentResponse),
  snoozeDocument: (docid: string, body: SnoozeDocumentRequest = {}) =>
    json(`/admin/documents/${encodeURIComponent(docid)}/snooze`, {
      method: "POST",
      body: JSON.stringify(body),
    }).then(assertSnoozeDocumentResponse),
  forgetDocument: (docid: string, body: ForgetDocumentRequest) =>
    json(`/admin/documents/${encodeURIComponent(docid)}/forget`, {
      method: "POST",
      body: JSON.stringify(body),
    }).then(assertForgetDocumentResponse),
};
