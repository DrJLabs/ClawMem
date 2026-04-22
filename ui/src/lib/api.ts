import type {
  MemoryFeedResponse,
  OverviewResponse,
  ReindexJobRequest,
  ReindexJobResponse,
} from "./types";

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
    typeof value.createdAt === "string" &&
    typeof value.path === "string" &&
    (typeof value.sourceSession === "string" || value.sourceSession === null) &&
    (typeof value.sourceRun === "number" || value.sourceRun === null)
  );
}

function isLaneStatus(value: unknown): boolean {
  return (
    isObject(value) &&
    typeof value.enabled === "boolean" &&
    (typeof value.latestRunStatus === "string" || value.latestRunStatus === null)
  );
}

function isHeavyLaneStatus(value: unknown): boolean {
  return (
    isLaneStatus(value) &&
    (typeof value.window === "string" || value.window === null)
  );
}

function assertOverviewResponse(value: unknown): OverviewResponse {
  if (
    !isObject(value) ||
    !isObject(value.health) ||
    !isHealthMessage(value.health.service) ||
    !isHealthMessage(value.health.api) ||
    !isObject(value.backlog) ||
    typeof value.backlog.totalDocuments !== "number" ||
    typeof value.backlog.needsEmbedding !== "number" ||
    !isObject(value.lanes) ||
    !isLaneStatus(value.lanes.light) ||
    !isHeavyLaneStatus(value.lanes.heavy) ||
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

async function json(input: RequestInfo | URL, init?: RequestInit): Promise<unknown> {
  const response = await fetch(input, {
    ...init,
    headers: {
      "Content-Type": "application/json",
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
  queueReindex: (body: ReindexJobRequest) =>
    json("/admin/jobs/reindex", {
      method: "POST",
      body: JSON.stringify(body),
    }).then(assertReindexJobResponse),
};
