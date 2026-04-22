import { describe, expect, test } from "bun:test";
import { createStore } from "../../src/store.ts";
import { buildMemoryFeedModel, buildOverviewModel } from "../../src/admin/service.ts";

describe("admin read models", () => {
  test("builds an overview with service, backlog, lane, and alert sections", () => {
    const store = createStore(":memory:");
    const model = buildOverviewModel(store, {
      watcher: { activeState: "active", subState: "running", mainPid: 1234 },
      logs: [],
      heavyLaneWindow: { start: 5, end: 9, enabled: true },
    });

    expect(model.health.service.state).toBe("healthy");
    expect(model.backlog.needsEmbedding).toBe(0);
    expect(model.lanes.heavy.enabled).toBe(true);
  });

  test("keeps older active jobs when newer completed jobs exceed the limit", () => {
    const store = createStore(":memory:");
    const runningId = store.createAdminJob({
      kind: "embed",
      requested_by: "operator-console",
    });
    store.updateAdminJob(runningId, { status: "running" });

    for (let i = 0; i < 12; i += 1) {
      const id = store.createAdminJob({
        kind: `completed-${i}`,
        requested_by: "operator-console",
      });
      store.updateAdminJob(id, { status: "completed" });
    }

    const model = buildOverviewModel(store, {
      watcher: { activeState: "active", subState: "running", mainPid: 1234 },
      logs: [],
      heavyLaneWindow: { start: 5, end: 9, enabled: true },
    });

    expect(model.activeJobs.some((job) => job.id === runningId && job.status === "running")).toBe(true);
    expect(model.activeJobs.every((job) => job.status === "queued" || job.status === "running")).toBe(true);
  });

  test("builds a typed memory feed from _clawmem documents", () => {
    const store = createStore(":memory:");
    const now = "2026-04-22T18:00:00.000Z";
    store.insertContent("abc123", "# Snapshot backup completed successfully", now);
    store.insertDocument("_clawmem", "observations/2026-04-22-snapshot.md", "Snapshot backup completed successfully", "abc123", now, now);
    store.updateDocumentMeta(1, { content_type: "milestone", confidence: 0.9 });

    const items = buildMemoryFeedModel(store, 10);
    expect(items[0]?.type).toBe("milestone");
    expect(items[0]?.title).toContain("Snapshot");
  });

  test("surfaces unavailable and unknown states when runtime and lane data are missing", () => {
    const store = createStore(":memory:");
    const model = buildOverviewModel(store, {
      watcher: { activeState: "unknown", subState: "dead", mainPid: null },
      logs: [],
      heavyLaneWindow: { start: null, end: null, enabled: false },
    });

    expect(model.health.service.state).toBe("unavailable");
    expect(model.health.api.state).toBe("unavailable");
    expect(model.lanes.light.latestRunStatus).toBe("unknown");
    expect(model.lanes.heavy.latestRunStatus).toBe("unknown");
  });
});
