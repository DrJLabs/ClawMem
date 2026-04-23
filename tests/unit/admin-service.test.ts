import { describe, expect, test } from "bun:test";
import { createStore } from "../../src/store.ts";
import { buildMemoryFeedModel, buildOverviewModel, buildRunsModel } from "../../src/admin/service.ts";

describe("admin read models", () => {
  test("builds an overview with service, backlog, lane, and alert sections", () => {
    const store = createStore(":memory:");
    const model = buildOverviewModel(store, {
      watcher: {
        activeState: "active",
        subState: "running",
        mainPid: 1234,
        environment: {
          CLAWMEM_ENABLE_CONSOLIDATION: "true",
          CLAWMEM_HEAVY_LANE: "true",
          CLAWMEM_HEAVY_LANE_WINDOW_START: "5",
          CLAWMEM_HEAVY_LANE_WINDOW_END: "9",
        },
      },
      logs: [],
      lightLaneEnabled: true,
      heavyLaneWindow: { start: 5, end: 9, enabled: true },
    });

    expect(model.health.service.state).toBe("healthy");
    expect(model.health.api.state).toBe("healthy");
    expect(model.health.api.message).toBe("Operator API responding");
    expect(model.backlog.needsEmbedding).toBe(0);
    expect(model.lanes.heavy.enabled).toBe(true);
    expect(model.lanes.light.enabled).toBe(true);
    expect(model.lanes.light.latestRunStatus).toBe("enabled");
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
      watcher: { activeState: "active", subState: "running", mainPid: 1234, environment: {} },
      logs: [],
      lightLaneEnabled: false,
      heavyLaneWindow: { start: 5, end: 9, enabled: true },
    });

    expect(model.activeJobs.some((job) => job.id === runningId && job.status === "running")).toBe(true);
    expect(model.activeJobs.every((job) => job.status === "queued" || job.status === "running")).toBe(true);
  });

  test("suppresses heavy lane outside_window runs from the runs model", () => {
    const store = createStore(":memory:");
    store.db.prepare(`
      INSERT INTO maintenance_runs (lane, phase, status, reason, started_at, finished_at)
      VALUES ('heavy', 'gate', 'skipped', 'outside_window', '2026-04-23T00:33:43.272Z', '2026-04-23T00:33:43.272Z')
    `).run();
    store.db.prepare(`
      INSERT INTO maintenance_runs (lane, phase, status, reason, started_at, finished_at)
      VALUES ('light', 'consolidate', 'completed', null, '2026-04-23T00:34:43.272Z', '2026-04-23T00:35:43.272Z')
    `).run();

    const runs = buildRunsModel(store, 10);
    expect(runs.some((item) => item.id.startsWith("maintenance-") && item.detail === "outside_window")).toBe(false);
    expect(runs.some((item) => item.label === "light / consolidate")).toBe(true);
  });

  test("sorts queued jobs by creation time ahead of older started runs", () => {
    const store = createStore(":memory:");
    const runningId = store.createAdminJob({
      kind: "embed",
      requested_by: "operator-console",
    });
    store.updateAdminJob(runningId, {
      status: "running",
      started_at: "2026-04-22T18:00:00.000Z",
    });
    const queuedId = store.createAdminJob({
      kind: "reindex",
      requested_by: "operator-console",
    });

    const runs = buildRunsModel(store, 10).filter((item) => item.source === "job");
    expect(runs[0]?.id).toBe(`job-${queuedId}`);
    expect(runs[1]?.id).toBe(`job-${runningId}`);
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

  test("keeps API health healthy even when watcher and lane data are missing", () => {
    const store = createStore(":memory:");
    const model = buildOverviewModel(store, {
      watcher: { activeState: "unknown", subState: "dead", mainPid: null, environment: {} },
      logs: [],
      lightLaneEnabled: false,
      heavyLaneWindow: { start: null, end: null, enabled: false },
    });

    expect(model.health.service.state).toBe("unavailable");
    expect(model.health.api.state).toBe("healthy");
    expect(model.health.api.message).toBe("Operator API responding");
    expect(model.lanes.light.latestRunStatus).toBe("disabled");
    expect(model.lanes.heavy.latestRunStatus).toBe("disabled");
  });
});
