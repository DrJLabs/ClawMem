import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, unlinkSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { createStore, type Store } from "../../src/store.ts";
import { addCollection, getCollection, loadConfig, saveConfig, updateCollection } from "../../src/collections.ts";

let TEST_DB = "";
let TEST_CONFIG_DIR = "";

let store: Store;

function cleanupFile(path: string): void {
  try {
    unlinkSync(path);
  } catch {
    // ignore missing file
  }
}

beforeEach(() => {
  TEST_CONFIG_DIR = mkdtempSync(join(tmpdir(), "clawmem-admin-config-"));
  TEST_DB = join(mkdtempSync(join(tmpdir(), "clawmem-admin-db-")), "index.sqlite");
  process.env.CLAWMEM_CONFIG_DIR = TEST_CONFIG_DIR;
  process.env.INDEX_PATH = TEST_DB;

  rmSync(TEST_CONFIG_DIR, { recursive: true, force: true });
  cleanupFile(TEST_DB);
  cleanupFile(`${TEST_DB}-wal`);
  cleanupFile(`${TEST_DB}-shm`);

  saveConfig({ collections: {} });
  store = createStore(TEST_DB);
});

afterEach(() => {
  store.close();
  delete process.env.CLAWMEM_CONFIG_DIR;
  delete process.env.INDEX_PATH;
  rmSync(TEST_CONFIG_DIR, { recursive: true, force: true });
  cleanupFile(TEST_DB);
  cleanupFile(`${TEST_DB}-wal`);
  cleanupFile(`${TEST_DB}-shm`);
});

describe("admin job storage", () => {
  test("persists lifecycle updates across store instances", () => {
    const jobId = store.createAdminJob({
      kind: "reindex",
      requested_by: "operator-console",
      payload_json: JSON.stringify({ collection: "notes" }),
    });

    store.updateAdminJob(jobId, {
      status: "running",
      started_at: "2026-04-22T18:00:00.000Z",
    });
    store.updateAdminJob(jobId, {
      status: "completed",
      finished_at: "2026-04-22T18:00:05.000Z",
      result_json: JSON.stringify({ added: 2, updated: 1, removed: 0 }),
    });

    store.close();
    store = createStore(TEST_DB);

    const row = store.getAdminJob(jobId);
    expect(row).not.toBeNull();
    expect(row?.kind).toBe("reindex");
    expect(row?.status).toBe("completed");
    expect(JSON.parse(String(row?.result_json)).added).toBe(2);

    const jobs = store.listAdminJobs();
    expect(jobs).toHaveLength(1);
    expect(jobs[0]?.id).toBe(jobId);
    expect(jobs[0]?.requested_by).toBe("operator-console");
  });

  test("allows nullable fields to be cleared explicitly", () => {
    const jobId = store.createAdminJob({
      kind: "reindex",
      requested_by: "operator-console",
      payload_json: JSON.stringify({ collection: "notes" }),
    });

    store.updateAdminJob(jobId, {
      started_at: "2026-04-22T18:00:00.000Z",
      finished_at: "2026-04-22T18:00:05.000Z",
      result_json: JSON.stringify({ ok: true }),
      error_text: "temporary error",
    });

    store.updateAdminJob(jobId, {
      started_at: null,
      finished_at: null,
      result_json: null,
      error_text: null,
    });

    const row = store.getAdminJob(jobId);
    expect(row?.started_at).toBeNull();
    expect(row?.finished_at).toBeNull();
    expect(row?.result_json).toBeNull();
    expect(row?.error_text).toBeNull();
  });
});

describe("collection updates", () => {
  test("updates collection path and pattern without deleting the entry", () => {
    addCollection("notes", "/tmp/notes", "**/*.md");

    const updated = updateCollection("notes", {
      path: "/tmp/notes-updated",
      pattern: "**/*.markdown",
    });

    expect(updated).toBe(true);

    const collection = getCollection("notes");
    expect(collection?.path).toBe("/tmp/notes-updated");
    expect(collection?.pattern).toBe("**/*.markdown");
    expect(loadConfig().collections.notes).toBeDefined();
  });

  test("returns false when the collection does not exist", () => {
    expect(updateCollection("missing", { path: "/tmp/missing" })).toBe(false);
  });

  test("returns newest jobs first and breaks ties by descending id", () => {
    const firstId = store.createAdminJob({
      kind: "reindex",
      requested_by: "operator-console",
    });
    const secondId = store.createAdminJob({
      kind: "reindex",
      requested_by: "operator-console",
    });

    const sameTimestamp = "2026-04-22T18:10:00.000Z";
    store.db.prepare("UPDATE admin_jobs SET created_at = ? WHERE id IN (?, ?)").run(sameTimestamp, firstId, secondId);

    const jobs = store.listAdminJobs(2);
    expect(jobs.map((job) => job.id)).toEqual([secondId, firstId]);
  });
});
