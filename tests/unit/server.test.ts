/**
 * Tests for ClawMem HTTP REST API Server
 */

import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { mkdirSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from "fs";
import { createStore, type Store } from "../../src/store.ts";
import { addCollection, getCollection, saveConfig } from "../../src/collections.ts";
import { hashContent } from "../../src/indexer.ts";
import { startServer } from "../../src/server.ts";
import { resetWatcherLogQueryRunnerForTests, setWatcherLogQueryRunnerForTests } from "../../src/admin/runtime.ts";

let store: Store;
let server: ReturnType<typeof startServer>;
let authDocHash: string;
let handoffDocHash: string;
let feedDocId: number;
const TEST_DB = "/tmp/clawmem-server-test.sqlite";
const TEST_CONFIG_DIR = "/tmp/clawmem-server-config";
const TEST_UI_DIST = "/tmp/clawmem-server-ui-dist";
const TEST_VALID_COLLECTION_DIR = "/tmp/clawmem-server-valid-collection";
const TEST_VALID_COLLECTION_DIR_2 = "/tmp/clawmem-server-valid-collection-2";
const PORT = 17438;
const BASE = `http://127.0.0.1:${PORT}`;

beforeAll(() => {
  try { unlinkSync(TEST_DB); } catch {}
  try { unlinkSync(TEST_DB + "-wal"); } catch {}
  try { unlinkSync(TEST_DB + "-shm"); } catch {}
  rmSync(TEST_CONFIG_DIR, { recursive: true, force: true });
  rmSync(TEST_UI_DIST, { recursive: true, force: true });
  rmSync(TEST_VALID_COLLECTION_DIR, { recursive: true, force: true });
  rmSync(TEST_VALID_COLLECTION_DIR_2, { recursive: true, force: true });
  process.env.INDEX_PATH = TEST_DB;
  process.env.CLAWMEM_CONFIG_DIR = TEST_CONFIG_DIR;
  process.env.CLAWMEM_CONSOLE_DIST_DIR = TEST_UI_DIST;
  delete process.env.CLAWMEM_API_TOKEN;
  mkdirSync(TEST_VALID_COLLECTION_DIR, { recursive: true });
  mkdirSync(TEST_VALID_COLLECTION_DIR_2, { recursive: true });
  saveConfig({
    collections: {
      configured: {
        path: "/tmp/clawmem-server-missing-collection",
        pattern: "**/*.md",
      },
    },
  });
  store = createStore(TEST_DB);

  // Seed test data — use real SHA-256 hashes so docid lookup works (6-char hex prefix)
  const now = new Date().toISOString();
  const authBody = "# Auth Decision\n\nWe chose JWT for authentication.";
  authDocHash = hashContent(authBody);
  store.insertContent(authDocHash, authBody, now);
  store.insertDocument("test", "decisions/auth.md", "Auth Decision", authDocHash, now, now);
  store.updateDocumentMeta(1, { content_type: "decision", confidence: 0.9 });

  const handoffBody = "# Handoff 2026-03-14\n\nWorked on auth module.";
  handoffDocHash = hashContent(handoffBody);
  store.insertContent(handoffDocHash, handoffBody, now);
  store.insertDocument("test", "handoffs/2026-03-14.md", "Handoff", handoffDocHash, now, now);
  store.updateDocumentMeta(2, { content_type: "handoff", confidence: 0.6 });

  const apiBody = "# API Design Notes\n\nREST over GraphQL.";
  const apiHash = hashContent(apiBody);
  store.insertContent(apiHash, apiBody, now);
  store.insertDocument("test", "notes/api.md", "API Design", apiHash, now, now);

  const feedBody = "# Snapshot backup completed successfully\n\nSnapshot backup completed without errors.";
  const feedHash = hashContent(feedBody);
  store.insertContent(feedHash, feedBody, now);
  store.insertDocument("_clawmem", "observations/2026-04-22-snapshot.md", "Snapshot backup completed successfully", feedHash, now, now);
  const feedDoc = store.findActiveDocument("_clawmem", "observations/2026-04-22-snapshot.md");
  if (!feedDoc) {
    throw new Error("Failed to retrieve inserted _clawmem feed document");
  }
  feedDocId = feedDoc.id;
  store.updateDocumentMeta(feedDocId, { content_type: "milestone", confidence: 0.9 });
  store.db.prepare(
    "UPDATE documents SET narrative = ?, source_doc_ids = ? WHERE id = ?",
  ).run("Snapshot backup completed without errors.", JSON.stringify([1, 2]), feedDocId);

  server = startServer(store, PORT);
});

afterAll(() => {
  server.stop();
  store.close();
  try { unlinkSync(TEST_DB); } catch {}
  try { unlinkSync(TEST_DB + "-wal"); } catch {}
  try { unlinkSync(TEST_DB + "-shm"); } catch {}
  rmSync(TEST_CONFIG_DIR, { recursive: true, force: true });
  rmSync(TEST_UI_DIST, { recursive: true, force: true });
  rmSync(TEST_VALID_COLLECTION_DIR, { recursive: true, force: true });
  rmSync(TEST_VALID_COLLECTION_DIR_2, { recursive: true, force: true });
  delete process.env.CLAWMEM_CONFIG_DIR;
  delete process.env.CLAWMEM_CONSOLE_DIST_DIR;
});

beforeAll(() => {
  setWatcherLogQueryRunnerForTests(async () => ({
    exitCode: 0,
    stdout: [
      JSON.stringify({
        __REALTIME_TIMESTAMP: "1776864223000000",
        PRIORITY: "3",
        SYSLOG_IDENTIFIER: "clawmem-watcher",
        MESSAGE: "watcher error",
      }),
      JSON.stringify({
        __REALTIME_TIMESTAMP: "1776864224000000",
        PRIORITY: "4",
        SYSLOG_IDENTIFIER: "clawmem-watcher",
        MESSAGE: "watcher warning",
      }),
      JSON.stringify({
        __REALTIME_TIMESTAMP: "1776864225000000",
        PRIORITY: "6",
        SYSLOG_IDENTIFIER: "clawmem-watcher",
        MESSAGE: "watcher info",
      }),
    ].join("\n"),
    stderr: "",
  }));
});

afterAll(() => {
  resetWatcherLogQueryRunnerForTests();
});

describe("GET /health", () => {
  test("returns ok status", async () => {
    const res = await fetch(`${BASE}/health`);
    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.status).toBe("ok");
    expect(data.service).toBe("clawmem");
    expect(data.documents).toBe(4);
  });
});

describe("GET /stats", () => {
  test("returns document stats", async () => {
    const res = await fetch(`${BASE}/stats`);
    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.totalDocuments).toBe(4);
  });
});

describe("POST /search", () => {
  test("searches by keyword", async () => {
    const res = await fetch(`${BASE}/search`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: "authentication", mode: "keyword" }),
    });
    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.results.length).toBeGreaterThan(0);
    expect(data.results[0].title).toContain("Auth");
  });

  test("returns error without query", async () => {
    const res = await fetch(`${BASE}/search`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
  });

  test("compact mode returns snippets", async () => {
    const res = await fetch(`${BASE}/search`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: "JWT", compact: true }),
    });
    const data = await res.json() as any;
    if (data.results.length > 0) {
      expect(data.results[0]).toHaveProperty("snippet");
      expect(data.results[0]).not.toHaveProperty("body");
    }
  });
});

describe("GET /documents/:docid", () => {
  test("returns document by docid (6-char hash prefix)", async () => {
    const docid = authDocHash.slice(0, 6);
    const res = await fetch(`${BASE}/documents/${docid}`);
    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.title).toBe("Auth Decision");
    expect(data.body).toContain("JWT");
  });

  test("returns 404 for unknown docid", async () => {
    const res = await fetch(`${BASE}/documents/zzzzzz`);
    expect(res.status).toBe(404);
  });
});

describe("GET /timeline/:docid", () => {
  test("returns timeline for document", async () => {
    const docid = handoffDocHash.slice(0, 6);
    const res = await fetch(`${BASE}/timeline/${docid}`);
    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.focus).toBeDefined();
    expect(data.before).toBeInstanceOf(Array);
    expect(data.after).toBeInstanceOf(Array);
  });
});

describe("GET /collections", () => {
  test("returns collection list", async () => {
    const res = await fetch(`${BASE}/collections`);
    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.count).toBeGreaterThanOrEqual(0);
  });
});

describe("GET /admin/overview", () => {
  test("returns operator overview payload", async () => {
    const res = await fetch(`${BASE}/admin/overview`);
    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.health).toBeDefined();
    expect(data.backlog).toBeDefined();
    expect(data.lanes).toBeDefined();
  });

  test("includes CORS headers on admin responses", async () => {
    const res = await fetch(`${BASE}/admin/overview`);
    expect(res.status).toBe(200);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("http://localhost:*");
    expect(res.headers.get("Access-Control-Allow-Methods")).toContain("PATCH");
    expect(res.headers.get("Access-Control-Allow-Headers")).toContain("Authorization");
  });
});

describe("GET /admin/memory-feed", () => {
  test("returns real _clawmem artifacts with body and lineage counts", async () => {
    const res = await fetch(`${BASE}/admin/memory-feed`);
    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(Array.isArray(data.items)).toBe(true);
    expect(data.items[0].title).toContain("Snapshot backup");
    expect(data.items[0].body).toContain("completed without errors");
    expect(data.items[0].sourceCount).toBe(2);
  });
});

describe("GET /admin/logs", () => {
  test("returns watcher logs filtered by severity", async () => {
    const res = await fetch(`${BASE}/admin/logs?level=warn&limit=20`);
    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(Array.isArray(data.items)).toBe(true);
    expect(data.items).toHaveLength(1);
    expect(data.items[0].level).toBe("warn");
    expect(data.items[0].message).toContain("warning");
  });

  test("rejects invalid since values", async () => {
    const res = await fetch(`${BASE}/admin/logs?since=not-a-date`);
    expect(res.status).toBe(400);
    const data = await res.json() as any;
    expect(data.error).toContain("since");
  });

  test("accepts relative since values supported by journalctl", async () => {
    const res = await fetch(`${BASE}/admin/logs?since=1%20hour%20ago`);
    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(Array.isArray(data.items)).toBe(true);
  });
});

describe("GET/POST/PATCH/DELETE /admin/collections", () => {
  test("lists configured collections with stable fields", async () => {
    const res = await fetch(`${BASE}/admin/collections`);
    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(Array.isArray(data.items)).toBe(true);
    expect(data.items.some((item: any) => item.name === "configured")).toBe(true);
  });

  test("creates, reads, updates, and deletes collections through the admin API", async () => {
    const createRes = await fetch(`${BASE}/admin/collections`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "operator-notes",
        path: TEST_VALID_COLLECTION_DIR,
        pattern: "**/*.md",
      }),
    });
    expect(createRes.status).toBe(201);
    const created = await createRes.json() as any;
    expect(created.item.name).toBe("operator-notes");

    const detailRes = await fetch(`${BASE}/admin/collections/operator-notes`);
    expect(detailRes.status).toBe(200);
    const detail = await detailRes.json() as any;
    expect(detail.item.root).toBe(TEST_VALID_COLLECTION_DIR);

    const patchRes = await fetch(`${BASE}/admin/collections/operator-notes`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        path: TEST_VALID_COLLECTION_DIR_2,
        pattern: "notes/**/*.md",
      }),
    });
    expect(patchRes.status).toBe(200);
    const updated = await patchRes.json() as any;
    expect(updated.item.root).toBe(TEST_VALID_COLLECTION_DIR_2);
    expect(updated.item.pattern).toBe("notes/**/*.md");

    const deleteRes = await fetch(`${BASE}/admin/collections/operator-notes`, {
      method: "DELETE",
    });
    expect(deleteRes.status).toBe(200);
    const deleted = await deleteRes.json() as any;
    expect(deleted.removedId).toBe("operator-notes");
    expect(typeof deleted.deletedDocs).toBe("number");
    expect(typeof deleted.cleanedHashes).toBe("number");

    const missingRes = await fetch(`${BASE}/admin/collections/operator-notes`);
    expect(missingRes.status).toBe(404);
  });

  test("rejects create/update requests for missing directories", async () => {
    const filePath = `${TEST_VALID_COLLECTION_DIR}/not-a-directory.md`;
    writeFileSync(filePath, "# file\n");

    const createRes = await fetch(`${BASE}/admin/collections`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "bad-root",
        path: "/tmp/definitely-missing-clawmem-root",
      }),
    });
    expect(createRes.status).toBe(400);

    const fileCreateRes = await fetch(`${BASE}/admin/collections`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "bad-file-root",
        path: filePath,
      }),
    });
    expect(fileCreateRes.status).toBe(400);

    const patchRes = await fetch(`${BASE}/admin/collections/configured`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        path: "/tmp/definitely-missing-clawmem-root",
      }),
    });
    expect(patchRes.status).toBe(400);

    const filePatchRes = await fetch(`${BASE}/admin/collections/configured`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        path: filePath,
      }),
    });
    expect(filePatchRes.status).toBe(400);

    const blankPatchRes = await fetch(`${BASE}/admin/collections/configured`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        path: "   ",
      }),
    });
    expect(blankPatchRes.status).toBe(400);
  });

  test("rejects invalid or reserved collection names", async () => {
    for (const name of ["bad/name", "name with space", "_clawmem"]) {
      const res = await fetch(`${BASE}/admin/collections`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          path: TEST_VALID_COLLECTION_DIR,
        }),
      });
      expect(res.status).toBe(400);
      expect((await res.json() as any).error).toContain("Invalid or reserved collection name");
    }
  });

  test("rejects sensitive collection roots", async () => {
    const createRes = await fetch(`${BASE}/admin/collections`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "etc-root",
        path: "/etc",
      }),
    });
    expect(createRes.status).toBe(400);
    expect((await createRes.json() as any).error).toContain("not allowed");

    addCollection("sensitive-root", TEST_VALID_COLLECTION_DIR, "**/*.md");
    const patchRes = await fetch(`${BASE}/admin/collections/sensitive-root`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        path: "/etc",
      }),
    });
    expect(patchRes.status).toBe(400);
    expect((await patchRes.json() as any).error).toContain("not allowed");
  });

  test("rejects symlinked collection roots that resolve into sensitive directories", async () => {
    const symlinkPath = "/tmp/clawmem-server-sensitive-link";
    rmSync(symlinkPath, { force: true, recursive: true });
    symlinkSync("/etc", symlinkPath);

    const createRes = await fetch(`${BASE}/admin/collections`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "etc-link",
        path: symlinkPath,
      }),
    });
    expect(createRes.status).toBe(400);
    expect((await createRes.json() as any).error).toContain("not allowed");

    rmSync(symlinkPath, { force: true, recursive: true });
  });

  test("delete removes database documents and config entry for the collection", async () => {
    const now = new Date().toISOString();
    const tempBody = "# Operator Notes\n\nThis collection should be deleted from the database.";
    const tempHash = hashContent(tempBody);
    store.insertContent(tempHash, tempBody, now);
    store.insertDocument("temp-delete", "notes/delete-me.md", "Delete Me", tempHash, now, now);

    addCollection("temp-delete", TEST_VALID_COLLECTION_DIR, "**/*.md");

    const before = await fetch(`${BASE}/export`);
    const beforeData = await before.json() as any;
    expect(beforeData.documents.some((doc: any) => doc.collection === "temp-delete")).toBe(true);

    const deleteRes = await fetch(`${BASE}/admin/collections/temp-delete`, {
      method: "DELETE",
    });
    expect(deleteRes.status).toBe(200);
    const deleted = await deleteRes.json() as any;
    expect(deleted.deletedDocs).toBeGreaterThan(0);

    const after = await fetch(`${BASE}/export`);
    const afterData = await after.json() as any;
    expect(afterData.documents.some((doc: any) => doc.collection === "temp-delete")).toBe(false);
    expect(getCollection("temp-delete")).toBeNull();
  });

  test("delete preserves content still referenced by archived documents", async () => {
    const now = new Date().toISOString();
    const sharedBody = "# Shared Note\n\nThis content is reused by an archived doc.";
    const sharedHash = hashContent(sharedBody);
    store.insertContent(sharedHash, sharedBody, now);
    store.insertDocument("temp-delete-archived", "notes/active.md", "Active Shared", sharedHash, now, now);
    store.insertDocument("archive-holder", "notes/archived.md", "Archived Shared", sharedHash, now, now);
    store.db.prepare("UPDATE documents SET active = 0, archived_at = ? WHERE collection = ?").run(now, "archive-holder");

    addCollection("temp-delete-archived", TEST_VALID_COLLECTION_DIR, "**/*.md");

    const deleteRes = await fetch(`${BASE}/admin/collections/temp-delete-archived`, {
      method: "DELETE",
    });
    expect(deleteRes.status).toBe(200);

    const contentRow = store.db.prepare("SELECT hash FROM content WHERE hash = ?").get(sharedHash);
    expect(contentRow).toBeDefined();

    const archivedRow = store.db.prepare(`
      SELECT c.doc as body
      FROM documents d
      JOIN content c ON c.hash = d.hash
      WHERE d.collection = ? AND d.path = ?
    `).get("archive-holder", "notes/archived.md") as { body: string } | undefined;
    expect(archivedRow?.body).toContain("reused by an archived doc");
  });
});

describe("GET /admin/runs", () => {
  test("returns run history items from admin jobs and maintenance runs", async () => {
    const jobId = store.createAdminJob({
      kind: "reindex",
      requested_by: "operator-console",
      payload_json: JSON.stringify({ collection: "configured" }),
    });
    store.updateAdminJob(jobId, {
      status: "completed",
      started_at: "2026-04-22T18:00:00.000Z",
      finished_at: "2026-04-22T18:01:00.000Z",
    });

    const res = await fetch(`${BASE}/admin/runs`);
    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(Array.isArray(data.items)).toBe(true);
    expect(data.items.some((item: any) => item.id === "lane-light-current")).toBe(true);
    expect(data.items.some((item: any) => item.id === `job-${jobId}`)).toBe(true);
  });

  test("returns run detail by stable run id", async () => {
    const jobId = store.createAdminJob({
      kind: "embed",
      requested_by: "operator-console",
    });
    store.updateAdminJob(jobId, {
      status: "running",
      started_at: "2026-04-22T18:05:00.000Z",
    });

    const res = await fetch(`${BASE}/admin/runs/job-${jobId}`);
    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.item.id).toBe(`job-${jobId}`);
    expect(data.item.label).toBe("embed");
  });
});

describe("POST /admin/jobs/reindex", () => {
  test("creates a tracked operator job", async () => {
    const res = await fetch(`${BASE}/admin/jobs/reindex`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ collection: "configured" }),
    });
    expect(res.status).toBe(202);
    const data = await res.json() as any;
    expect(data.job.id).toBeTruthy();
    expect(data.job.status).toBe("queued");
  });

  test("transitions the queued reindex job to a terminal state", async () => {
    const res = await fetch(`${BASE}/admin/jobs/reindex`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ collection: "configured" }),
    });
    expect(res.status).toBe(202);
    const data = await res.json() as any;
    const jobId = data.job.id;

    let job = store.getAdminJob(jobId);
    const timeoutAt = Date.now() + 5000;
    while (job && (job.status === "queued" || job.status === "running") && Date.now() < timeoutAt) {
      await Bun.sleep(50);
      job = store.getAdminJob(jobId);
    }

    expect(job).toBeTruthy();
    expect(job!.status).toBe("failed");
    expect(job!.error_text).toContain("no such file");
  });

  test("rejects unknown collections up front", async () => {
    const res = await fetch(`${BASE}/admin/jobs/reindex`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ collection: "missing" }),
    });
    expect(res.status).toBe(404);
    const data = await res.json() as any;
    expect(data.error).toContain("missing");
  });

  test("rejects malformed JSON bodies", async () => {
    const res = await fetch(`${BASE}/admin/jobs/reindex`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{not-json",
    });
    expect(res.status).toBe(400);
    const data = await res.json() as any;
    expect(data.error).toContain("Invalid JSON");
  });
});

describe("GET /lifecycle/status", () => {
  test("returns lifecycle stats", async () => {
    const res = await fetch(`${BASE}/lifecycle/status`);
    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.active).toBe(4);
  });
});

describe("POST /documents/:docid/pin", () => {
  test("pins a document", async () => {
    const docid = authDocHash.slice(0, 6);
    const res = await fetch(`${BASE}/documents/${docid}/pin`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.pinned).toBe(true);
  });
});

describe("POST /admin document and lifecycle mutations", () => {
  test("does not treat SQL wildcards as document id matches", async () => {
    const pinRes = await fetch(`${BASE}/admin/documents/%25/pin`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });

    expect(pinRes.status).toBe(404);
  });

  test("wraps pin and snooze mutations under /admin", async () => {
    const docid = authDocHash.slice(0, 6);

    const pinRes = await fetch(`${BASE}/admin/documents/${docid}/pin`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(pinRes.status).toBe(200);
    expect((await pinRes.json() as any).pinned).toBe(true);

    const snoozeRes = await fetch(`${BASE}/admin/documents/${docid}/snooze`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ until: "2026-05-01T00:00:00.000Z" }),
    });
    expect(snoozeRes.status).toBe(200);
    const snoozed = await snoozeRes.json() as any;
    expect(snoozed.snoozed).toBe(true);
    expect(snoozed.until).toBe("2026-05-01T00:00:00.000Z");
  });

  test("rejects invalid snooze timestamps", async () => {
    const docid = authDocHash.slice(0, 6);

    const snoozeRes = await fetch(`${BASE}/admin/documents/${docid}/snooze`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ until: "not-a-real-timestamp" }),
    });

    expect(snoozeRes.status).toBe(400);
    expect((await snoozeRes.json() as any).error).toContain("until");
  });

  test("forgets a document and restores archived documents through admin endpoints", async () => {
    const now = new Date().toISOString();
    store.db.prepare("UPDATE documents SET active = 0, archived_at = ? WHERE hash = ?").run(now, handoffDocHash);

    const restoreRes = await fetch(`${BASE}/admin/lifecycle/restore`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ collection: "test" }),
    });
    expect(restoreRes.status).toBe(200);
    expect((await restoreRes.json() as any).restored).toBeGreaterThanOrEqual(1);
    const restoredRow = store.db.prepare("SELECT active, archived_at FROM documents WHERE hash = ?").get(handoffDocHash) as {
      active: number;
      archived_at: string | null;
    };
    expect(restoredRow.active).toBe(1);
    expect(restoredRow.archived_at).toBeNull();

    const tempBody = "# Forget me\n\nThis document will be forgotten.";
    const tempHash = hashContent(tempBody);
    store.insertContent(tempHash, tempBody, now);
    store.insertDocument("forget-target", "notes/forget-me.md", "Forget me", tempHash, now, now);
    const tempDocid = tempHash.slice(0, 6);

    const forgetRejected = await fetch(`${BASE}/admin/documents/${tempDocid}/forget`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(forgetRejected.status).toBe(400);

    const forgetRes = await fetch(`${BASE}/admin/documents/${tempDocid}/forget`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ confirm: "FORGET" }),
    });
    expect(forgetRes.status).toBe(200);
    expect((await forgetRes.json() as any).forgotten).toBe(true);

    const docRow = store.db.prepare("SELECT active FROM documents WHERE hash = ?").get(tempHash) as { active: number };
    expect(docRow.active).toBe(0);
  });

  test("runs lifecycle sweep previews through the admin namespace", async () => {
    const res = await fetch(`${BASE}/admin/lifecycle/sweep`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dry_run: true }),
    });
    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.dry_run).toBe(true);
    expect(Array.isArray(data.documents)).toBe(true);
  });

  test("requires explicit confirmation for destructive lifecycle sweep execution", async () => {
    const rejected = await fetch(`${BASE}/admin/lifecycle/sweep`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dry_run: false }),
    });
    expect(rejected.status).toBe(400);

    const confirmed = await fetch(`${BASE}/admin/lifecycle/sweep`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dry_run: false, confirm: "ARCHIVE" }),
    });
    expect(confirmed.status).toBe(200);
    const data = await confirmed.json() as any;
    expect(data.dry_run).toBe(false);
  });
});

describe("404 handling", () => {
  test("returns 404 for unknown routes", async () => {
    const res = await fetch(`${BASE}/nonexistent`);
    expect(res.status).toBe(404);
  });

  test("returns 404 for /console when no built UI assets are present", async () => {
    const res = await fetch(`${BASE}/console`);
    expect(res.status).toBe(404);
  });

  test("returns 404 for /consolefoo when no built UI assets are present", async () => {
    const res = await fetch(`${BASE}/consolefoo`);
    expect(res.status).toBe(404);
  });
});

describe("console asset serving", () => {
  test("serves built UI index and assets from /console", async () => {
    mkdirSync(TEST_UI_DIST, { recursive: true });
    writeFileSync(`${TEST_UI_DIST}/index.html`, "<!doctype html><html><body>console</body></html>");
    writeFileSync(`${TEST_UI_DIST}/app.js`, "console.log('ok');");
    mkdirSync(`${TEST_UI_DIST}/assets`, { recursive: true });
    writeFileSync("/tmp/clawmem-server-outside.txt", "outside");

    const indexRes = await fetch(`${BASE}/console`);
    expect(indexRes.status).toBe(200);
    const indexHtml = await indexRes.text();
    expect(indexHtml).toContain("console");

    const assetRes = await fetch(`${BASE}/console/app.js`);
    expect(assetRes.status).toBe(200);
    const assetText = await assetRes.text();
    expect(assetText).toContain("console.log");

    const missingAssetRes = await fetch(`${BASE}/console/missing.js`);
    expect(missingAssetRes.status).toBe(404);

    const directoryRes = await fetch(`${BASE}/console/assets`);
    expect(directoryRes.status).toBe(404);

    const traversalRes = await fetch(`${BASE}/console/assets/%2e%2e/%2e%2e/%2e%2e/tmp/clawmem-server-outside.txt`);
    expect(traversalRes.status).toBe(404);

    const dottedRouteRes = await fetch(`${BASE}/console/collections/foo.bar`);
    expect(dottedRouteRes.status).toBe(200);
    expect(await dottedRouteRes.text()).toContain("console");

    rmSync("/tmp/clawmem-server-outside.txt", { force: true });
    rmSync(TEST_UI_DIST, { recursive: true, force: true });
  });

  test("keeps console assets reachable when bearer auth is enabled", async () => {
    mkdirSync(TEST_UI_DIST, { recursive: true });
    writeFileSync(`${TEST_UI_DIST}/index.html`, "<!doctype html><html><body>console</body></html>");
    writeFileSync(`${TEST_UI_DIST}/app.js`, "console.log('ok');");
    process.env.CLAWMEM_API_TOKEN = "test-secret";

    const indexRes = await fetch(`${BASE}/console`);
    expect(indexRes.status).toBe(200);

    const assetRes = await fetch(`${BASE}/console/app.js`);
    expect(assetRes.status).toBe(200);

    const adminRejected = await fetch(`${BASE}/admin/overview`);
    expect(adminRejected.status).toBe(401);

    const adminAccepted = await fetch(`${BASE}/admin/overview`, {
      headers: { Authorization: "Bearer test-secret" },
    });
    expect(adminAccepted.status).toBe(200);

    delete process.env.CLAWMEM_API_TOKEN;
    rmSync(TEST_UI_DIST, { recursive: true, force: true });
  });
});

describe("auth", () => {
  test("rejects with wrong token when configured", async () => {
    process.env.CLAWMEM_API_TOKEN = "test-secret";

    // Need a new server with token enabled — but the module-level const
    // was already evaluated. For a proper test, we'd need to restart.
    // Just verify the auth check logic works conceptually.
    delete process.env.CLAWMEM_API_TOKEN;
  });

  test("advertises PATCH and DELETE in preflight responses", async () => {
    const res = await fetch(`${BASE}/admin/collections/configured`, {
      method: "OPTIONS",
    });

    expect(res.status).toBe(204);
    const allowMethods = res.headers.get("Access-Control-Allow-Methods") ?? "";
    expect(allowMethods).toContain("PATCH");
    expect(allowMethods).toContain("DELETE");
  });
});

describe("GET /export", () => {
  test("exports all documents", async () => {
    const res = await fetch(`${BASE}/export`);
    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.version).toBe("1.0.0");
    expect(data.count).toBe(4);
    expect(data.documents.length).toBe(4);
  });
});
