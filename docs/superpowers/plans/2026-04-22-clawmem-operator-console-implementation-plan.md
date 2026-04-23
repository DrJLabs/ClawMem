# ClawMem Operator Console Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a mobile-first operator console for ClawMem with a repo-local React/Vite UI, an operator-focused admin API inside the Bun server, durable job tracking for manual actions, and a clean path to serve built assets from ClawMem later.

**Architecture:** Add a dedicated `/admin/*` operator namespace to the existing Bun server and keep all browser access behind that backend. Reads come from server-side adapters over SQLite, systemd/runtime state, and journald; writes go through explicit admin endpoints that either mutate collection/config state or create tracked operator jobs. The UI lives in `ui/` as a separate app during development, then is built into static assets that ClawMem can serve under `/console/*` when present.

**Tech Stack:** Bun, TypeScript, existing Bun HTTP server, SQLite, systemd/journald adapters, React, React Router, TanStack Query, Vite, Vitest, Testing Library, markdown docs.

---

## Source Audit Summary

- The current HTTP server is in [src/server.ts](/home/drj/tools/ClawMem/src/server.ts) and already owns route registration plus CORS/auth behavior. It exposes search/retrieve/document/lifecycle/maintenance routes, but there is no admin/operator namespace yet.
- The current server tests in [tests/unit/server.test.ts](/home/drj/tools/ClawMem/tests/unit/server.test.ts) already boot a real Bun server on a temp SQLite DB. Reusing that pattern is the fastest path for admin API coverage.
- Collections are configured through YAML in [src/collections.ts](/home/drj/tools/ClawMem/src/collections.ts), not by hardcoded runtime-only state. Editing collection scope therefore needs a config-write path, not just a DB mutation.
- The current REST docs in [docs/reference/rest-api.md](/home/drj/tools/ClawMem/docs/reference/rest-api.md) document only the public search/lifecycle/maintenance surface. Admin/operator routes will need separate documentation once added.
- The repo already uses TypeScript with `jsx: react-jsx` in [tsconfig.json](/home/drj/tools/ClawMem/tsconfig.json), but it has no frontend app scaffold or React/Vite dependencies yet.
- The repo already ignores `node_modules/` and `dist/` in [.gitignore](/home/drj/tools/ClawMem/.gitignore), so a nested `ui/` app will not create extra ignore churn.

## Stack Decisions Locked By This Plan

- Frontend: React + React Router + TanStack Query + Vite + plain CSS/tokens
- UI location: `ui/`
- Backend host: existing Bun server in `src/server.ts`
- Admin route namespace: `/admin/*`
- UI mount path when built: `/console/*`
- Job tracking: new durable `admin_jobs` table in the main SQLite DB
- Logs: server-side `journalctl` adapter with structured filters
- Service/runtime truth: server-side `systemctl --user` adapter with graceful fallback when unavailable

## File Map

- Modify: `package.json`
  - Add root scripts for UI dev/build/test convenience and optional console-serving workflow.
- Modify: `src/server.ts`
  - Register admin routes and static UI asset serving hooks.
- Modify: `src/store.ts`
  - Create `admin_jobs` table and add job read/write helpers.
- Modify: `src/collections.ts`
  - Add update helpers for collection edits so the admin API does not rewrite YAML ad hoc.
- Modify: `tests/unit/server.test.ts`
  - Add admin endpoint coverage that boots the real server.
- Modify: `docs/reference/rest-api.md`
  - Document the new operator namespace and static console mount.
- Modify: `README.md`
  - Add operator console overview and dev/build usage.

- Create: `src/admin/types.ts`
  - Shared TypeScript types for overview, run rows, feed items, collection cards, logs, system state, and job responses.
- Create: `src/admin/runtime.ts`
  - systemd/journald adapters and parsers.
- Create: `src/admin/service.ts`
  - Read-model assembly for overview, runs, memory feed, collections, logs, and system.
- Create: `src/admin/jobs.ts`
  - Durable job creation, execution, state updates, and retry hooks for update/embed/reindex/consolidate/lifecycle actions.
- Create: `src/admin/router.ts`
  - Admin route registration and handlers for `/admin/*`.
- Create: `src/admin/static.ts`
  - Serve `ui/dist` under `/console/*` when present, with SPA fallback.
- Create: `tests/unit/admin-runtime.test.ts`
  - Parse/adapter tests for `systemctl`/`journalctl` result normalization.
- Create: `tests/unit/admin-jobs.test.ts`
  - Durable job table helper coverage and action lifecycle assertions.
- Create: `tests/unit/admin-service.test.ts`
  - Read-model assembly tests over a temp store.

- Create: `ui/package.json`
  - Separate frontend workspace dependencies and scripts.
- Create: `ui/tsconfig.json`
- Create: `ui/vite.config.ts`
- Create: `ui/index.html`
- Create: `ui/src/main.tsx`
- Create: `ui/src/app/App.tsx`
- Create: `ui/src/app/router.tsx`
- Create: `ui/src/lib/api.ts`
- Create: `ui/src/lib/query-client.ts`
- Create: `ui/src/lib/types.ts`
- Create: `ui/src/styles/tokens.css`
- Create: `ui/src/styles/app.css`
- Create: `ui/src/components/AppShell.tsx`
- Create: `ui/src/components/StatusCard.tsx`
- Create: `ui/src/components/Panel.tsx`
- Create: `ui/src/components/RunList.tsx`
- Create: `ui/src/components/FeedCard.tsx`
- Create: `ui/src/components/CollectionCard.tsx`
- Create: `ui/src/components/LogList.tsx`
- Create: `ui/src/components/ActionSheet.tsx`
- Create: `ui/src/pages/OverviewPage.tsx`
- Create: `ui/src/pages/RunsPage.tsx`
- Create: `ui/src/pages/RunDetailPage.tsx`
- Create: `ui/src/pages/MemoryFeedPage.tsx`
- Create: `ui/src/pages/CollectionsPage.tsx`
- Create: `ui/src/pages/CollectionDetailPage.tsx`
- Create: `ui/src/pages/LogsPage.tsx`
- Create: `ui/src/pages/AdminPage.tsx`
- Create: `ui/src/test/setup.ts`
- Create: `ui/src/app/App.test.tsx`
- Create: `ui/src/pages/OverviewPage.test.tsx`
- Create: `ui/src/pages/CollectionsPage.test.tsx`

### Task 1: Add Durable Operator Job Storage And Collection Update Helpers

**Files:**
- Modify: `src/store.ts`
- Modify: `src/collections.ts`
- Create: `tests/unit/admin-jobs.test.ts`

- [ ] **Step 1: Write the failing Bun tests for durable admin jobs and collection updates**

Create `tests/unit/admin-jobs.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { unlinkSync } from "fs";
import { createStore, type Store } from "../../src/store.ts";
import { addCollection, getCollection, loadConfig, saveConfig, updateCollection } from "../../src/collections.ts";

const TEST_DB = "/tmp/clawmem-admin-jobs-test.sqlite";
const TEST_CONFIG_DIR = "/tmp/clawmem-admin-config";

let store: Store;

beforeEach(() => {
  process.env.CLAWMEM_CONFIG_DIR = TEST_CONFIG_DIR;
  process.env.INDEX_PATH = TEST_DB;
  try { unlinkSync(TEST_DB); } catch {}
  try { unlinkSync(TEST_DB + "-wal"); } catch {}
  try { unlinkSync(TEST_DB + "-shm"); } catch {}
  saveConfig({ collections: {} });
  store = createStore(TEST_DB);
});

afterEach(() => {
  store.close();
  delete process.env.CLAWMEM_CONFIG_DIR;
  delete process.env.INDEX_PATH;
});

describe("admin job storage", () => {
  test("creates and updates durable operator jobs", () => {
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

    const row = store.getAdminJob(jobId);
    expect(row?.kind).toBe("reindex");
    expect(row?.status).toBe("completed");
    expect(JSON.parse(String(row?.result_json)).added).toBe(2);
  });
});

describe("collection updates", () => {
  test("updates collection path and pattern without deleting the entry", () => {
    addCollection("notes", "/tmp/notes", "**/*.md");

    updateCollection("notes", {
      path: "/tmp/notes-updated",
      pattern: "**/*.markdown",
    });

    const updated = getCollection("notes");
    expect(updated?.path).toBe("/tmp/notes-updated");
    expect(updated?.pattern).toBe("**/*.markdown");
    expect(loadConfig().collections.notes).toBeDefined();
  });
});
```

- [ ] **Step 2: Run the new test file and verify it fails on missing helpers**

Run:

```bash
bun test tests/unit/admin-jobs.test.ts
```

Expected:
- `store.createAdminJob` / `store.updateAdminJob` / `store.getAdminJob` missing
- `updateCollection` missing

- [ ] **Step 3: Add `admin_jobs` schema and helpers to `src/store.ts`**

Add a persistent job table during store initialization:

```ts
db.exec(`
  CREATE TABLE IF NOT EXISTS admin_jobs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    kind TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'queued',
    requested_by TEXT NOT NULL,
    payload_json TEXT NOT NULL DEFAULT '{}',
    result_json TEXT,
    error_text TEXT,
    started_at TEXT,
    finished_at TEXT,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
  );
  CREATE INDEX IF NOT EXISTS idx_admin_jobs_created_at ON admin_jobs(created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_admin_jobs_status ON admin_jobs(status, created_at DESC);
`);
```

Expose durable helpers on the store:

```ts
createAdminJob(input: {
  kind: string;
  requested_by: string;
  payload_json?: string;
}): number {
  const row = this.db.prepare(`
    INSERT INTO admin_jobs (kind, requested_by, payload_json)
    VALUES (?, ?, ?)
    RETURNING id
  `).get(input.kind, input.requested_by, input.payload_json ?? "{}") as { id: number };
  return row.id;
}

updateAdminJob(id: number, patch: {
  status?: string;
  started_at?: string | null;
  finished_at?: string | null;
  result_json?: string | null;
  error_text?: string | null;
}): void {
  this.db.prepare(`
    UPDATE admin_jobs
    SET
      status = COALESCE(?, status),
      started_at = COALESCE(?, started_at),
      finished_at = COALESCE(?, finished_at),
      result_json = COALESCE(?, result_json),
      error_text = COALESCE(?, error_text),
      updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
    WHERE id = ?
  `).run(
    patch.status ?? null,
    patch.started_at ?? null,
    patch.finished_at ?? null,
    patch.result_json ?? null,
    patch.error_text ?? null,
    id,
  );
}

getAdminJob(id: number) {
  return this.db.prepare(`SELECT * FROM admin_jobs WHERE id = ?`).get(id);
}

listAdminJobs(limit: number = 25) {
  return this.db.prepare(`
    SELECT * FROM admin_jobs
    ORDER BY created_at DESC
    LIMIT ?
  `).all(limit);
}
```

- [ ] **Step 4: Add `updateCollection` to `src/collections.ts`**

Add a patch helper instead of forcing delete-and-recreate behavior:

```ts
export function updateCollection(
  name: string,
  patch: Partial<Pick<Collection, "path" | "pattern" | "context" | "update">>
): boolean {
  const config = loadConfig();
  const current = config.collections[name];
  if (!current) return false;

  config.collections[name] = {
    ...current,
    ...patch,
  };

  saveConfig(config);
  return true;
}
```

- [ ] **Step 5: Re-run the focused tests**

Run:

```bash
bun test tests/unit/admin-jobs.test.ts
```

Expected:
- all tests pass

- [ ] **Step 6: Commit the durable operator data foundation**

Run:

```bash
git add src/store.ts src/collections.ts tests/unit/admin-jobs.test.ts
git commit -m "feat(admin): add durable operator jobs and collection updates"
```

### Task 2: Build Operator Runtime Adapters And Read Models

**Files:**
- Create: `src/admin/types.ts`
- Create: `src/admin/runtime.ts`
- Create: `src/admin/service.ts`
- Create: `tests/unit/admin-runtime.test.ts`
- Create: `tests/unit/admin-service.test.ts`

- [ ] **Step 1: Write the failing adapter and read-model tests**

Create `tests/unit/admin-runtime.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import { parseSystemctlShow, parseJournalJsonLine } from "../../src/admin/runtime.ts";

describe("admin runtime adapters", () => {
  test("parses systemctl show output into a service snapshot", () => {
    const snapshot = parseSystemctlShow([
      "Id=clawmem-watcher.service",
      "ActiveState=active",
      "SubState=running",
      "MainPID=3166023",
      "ExecMainStartTimestamp=Tue 2026-04-22 03:53:43 EDT",
    ].join("\n"));

    expect(snapshot.activeState).toBe("active");
    expect(snapshot.subState).toBe("running");
    expect(snapshot.mainPid).toBe(3166023);
  });

  test("parses journald JSON lines into structured log entries", () => {
    const entry = parseJournalJsonLine(JSON.stringify({
      __REALTIME_TIMESTAMP: "1776864223000000",
      PRIORITY: "3",
      SYSLOG_IDENTIFIER: "clawmem-host.sh",
      MESSAGE: "[consolidation] Enriched doc 5058",
    }));

    expect(entry.level).toBe("err");
    expect(entry.message).toContain("Enriched doc 5058");
  });
});
```

Create `tests/unit/admin-service.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import { createStore } from "../../src/store.ts";
import { buildOverviewModel, buildMemoryFeedModel } from "../../src/admin/service.ts";

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
});
```

- [ ] **Step 2: Run the new test files and confirm missing module failures**

Run:

```bash
bun test tests/unit/admin-runtime.test.ts tests/unit/admin-service.test.ts
```

Expected:
- module-not-found failures for `src/admin/runtime.ts` and `src/admin/service.ts`

- [ ] **Step 3: Add shared operator types in `src/admin/types.ts`**

Create `src/admin/types.ts`:

```ts
export type AdminServiceHealth = {
  state: "healthy" | "stale" | "degraded" | "unavailable";
  message: string;
  checkedAt: string;
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
  activeJobs: Array<{ id: number; kind: string; status: string }>;
  alerts: Array<{ id: string; severity: "info" | "warn" | "error"; message: string }>;
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
```

- [ ] **Step 4: Add runtime parsers and command adapters in `src/admin/runtime.ts`**

Create parsing-first helpers that keep shell execution separate from shaping:

```ts
export function parseSystemctlShow(raw: string) {
  const map = Object.fromEntries(
    raw.split("\n").filter(Boolean).map((line) => {
      const [key, ...rest] = line.split("=");
      return [key, rest.join("=")];
    }),
  );

  return {
    id: map.Id ?? "",
    activeState: map.ActiveState ?? "unknown",
    subState: map.SubState ?? "unknown",
    mainPid: map.MainPID ? Number(map.MainPID) : null,
    startedAt: map.ExecMainStartTimestamp ?? null,
  };
}

export function parseJournalJsonLine(line: string) {
  const row = JSON.parse(line);
  const priority = Number(row.PRIORITY ?? 6);
  return {
    timestamp: row.__REALTIME_TIMESTAMP,
    level: priority <= 3 ? "err" : priority === 4 ? "warn" : "info",
    source: row.SYSLOG_IDENTIFIER ?? "unknown",
    message: row.MESSAGE ?? "",
  };
}

export async function getWatcherSnapshot() {
  const proc = Bun.spawn(["systemctl", "--user", "show", "clawmem-watcher.service"], {
    stdout: "pipe",
    stderr: "pipe",
  });
  const text = await new Response(proc.stdout).text();
  return parseSystemctlShow(text);
}
```

- [ ] **Step 5: Add read-model assembly in `src/admin/service.ts`**

Create operator-shaped builders that hide raw schema details:

```ts
import type { Store } from "../store.ts";
import type { MemoryFeedItem, OverviewModel } from "./types.ts";

export function buildOverviewModel(
  store: Store,
  runtime: {
    watcher: { activeState: string; subState: string; mainPid: number | null };
    logs: Array<{ level: string; message: string }>;
    heavyLaneWindow: { enabled: boolean; start: number | null; end: number | null };
  },
): OverviewModel {
  const status = store.getStatus();
  const activeJobs = store.listAdminJobs(10).filter((row: any) => row.status === "queued" || row.status === "running");
  const latestHeavy = store.db.prepare(`
    SELECT status, reason FROM maintenance_runs
    WHERE lane = 'heavy'
    ORDER BY started_at DESC
    LIMIT 1
  `).get() as { status: string; reason: string | null } | undefined;

  return {
    health: {
      service: {
        state: runtime.watcher.activeState === "active" ? "healthy" : "degraded",
        message: runtime.watcher.activeState === "active" ? "Watcher running" : "Watcher unavailable",
        checkedAt: new Date().toISOString(),
      },
      api: {
        state: "healthy",
        message: "Operator API responding",
        checkedAt: new Date().toISOString(),
      },
    },
    lanes: {
      light: { enabled: true, latestRunStatus: "completed" },
      heavy: {
        enabled: runtime.heavyLaneWindow.enabled,
        window: runtime.heavyLaneWindow.enabled ? `${runtime.heavyLaneWindow.start}:00-${runtime.heavyLaneWindow.end}:00` : null,
        latestRunStatus: latestHeavy?.status ?? null,
      },
    },
    backlog: {
      totalDocuments: status.totalDocuments,
      needsEmbedding: status.needsEmbedding,
    },
    activeJobs: activeJobs.map((row: any) => ({ id: row.id, kind: row.kind, status: row.status })),
    alerts: runtime.logs.slice(0, 3).map((log, index) => ({
      id: `alert-${index}`,
      severity: log.level === "err" ? "error" : log.level === "warn" ? "warn" : "info",
      message: log.message,
    })),
    checkedAt: new Date().toISOString(),
  };
}

export function buildMemoryFeedModel(store: Store, limit: number): MemoryFeedItem[] {
  const rows = store.db.prepare(`
    SELECT id, title, path, content_type, created_at
    FROM documents
    WHERE active = 1 AND collection = '_clawmem'
    ORDER BY created_at DESC
    LIMIT ?
  `).all(limit) as Array<{
    id: number;
    title: string;
    path: string;
    content_type: string | null;
    created_at: string;
  }>;

  return rows.map((row) => ({
    documentId: String(row.id),
    type: row.content_type ?? "note",
    title: row.title,
    summary: row.title,
    createdAt: row.created_at,
    sourceSession: null,
    sourceRun: null,
    path: row.path,
  }));
}
```

- [ ] **Step 6: Re-run the adapter/read-model tests**

Run:

```bash
bun test tests/unit/admin-runtime.test.ts tests/unit/admin-service.test.ts
```

Expected:
- all tests pass

- [ ] **Step 7: Commit the runtime and read-model layer**

Run:

```bash
git add src/admin/types.ts src/admin/runtime.ts src/admin/service.ts tests/unit/admin-runtime.test.ts tests/unit/admin-service.test.ts
git commit -m "feat(admin): add operator runtime adapters and read models"
```

### Task 3: Add Admin Routes, Job Execution, And Static UI Serving

**Files:**
- Create: `src/admin/jobs.ts`
- Create: `src/admin/router.ts`
- Create: `src/admin/static.ts`
- Modify: `src/server.ts`
- Modify: `tests/unit/server.test.ts`

- [ ] **Step 1: Write failing server tests for `/admin/*` and `/console/*`**

Extend `tests/unit/server.test.ts` with:

```ts
describe("GET /admin/overview", () => {
  test("returns operator overview payload", async () => {
    const res = await fetch(`${BASE}/admin/overview`);
    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.health).toBeDefined();
    expect(data.backlog).toBeDefined();
    expect(data.lanes).toBeDefined();
  });
});

describe("POST /admin/jobs/reindex", () => {
  test("creates a tracked operator job", async () => {
    const res = await fetch(`${BASE}/admin/jobs/reindex`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ collection: "test" }),
    });
    expect(res.status).toBe(202);
    const data = await res.json() as any;
    expect(data.job.id).toBeTruthy();
    expect(data.job.status).toBe("queued");
  });
});

describe("GET /console", () => {
  test("returns 404 when no built UI assets are present", async () => {
    const res = await fetch(`${BASE}/console`);
    expect(res.status).toBe(404);
  });
});
```

- [ ] **Step 2: Run the server test file and verify new endpoint failures**

Run:

```bash
bun test tests/unit/server.test.ts
```

Expected:
- `/admin/overview` and `/admin/jobs/reindex` 404
- `/console` 404 may already pass

- [ ] **Step 3: Add durable admin job execution in `src/admin/jobs.ts`**

Create a small execution layer that wraps existing code paths and records state:

```ts
import type { Store } from "../store.ts";
import { indexCollection } from "../indexer.ts";
import { listCollections } from "../collections.ts";

export async function queueReindexJob(store: Store, collection?: string) {
  const jobId = store.createAdminJob({
    kind: "reindex",
    requested_by: "operator-console",
    payload_json: JSON.stringify({ collection: collection ?? null }),
  });

  queueMicrotask(async () => {
    store.updateAdminJob(jobId, {
      status: "running",
      started_at: new Date().toISOString(),
    });

    try {
      const collections = collection
        ? listCollections().filter((row) => row.name === collection)
        : listCollections();

      let added = 0;
      let updated = 0;
      let removed = 0;

      for (const row of collections) {
        const stats = await indexCollection(store, row.name, row.path, row.pattern);
        added += stats.added;
        updated += stats.updated;
        removed += stats.removed;
      }

      store.updateAdminJob(jobId, {
        status: "completed",
        finished_at: new Date().toISOString(),
        result_json: JSON.stringify({ added, updated, removed }),
      });
    } catch (error: any) {
      store.updateAdminJob(jobId, {
        status: "failed",
        finished_at: new Date().toISOString(),
        error_text: String(error?.message ?? error),
      });
    }
  });

  return store.getAdminJob(jobId);
}
```

- [ ] **Step 4: Add admin route registration in `src/admin/router.ts`**

Create operator handlers and return UI-shaped payloads:

```ts
import type { Store } from "../store.ts";
import { buildOverviewModel, buildMemoryFeedModel } from "./service.ts";
import { getWatcherSnapshot } from "./runtime.ts";
import { queueReindexJob } from "./jobs.ts";

export function createAdminRoutes(store: Store) {
  return [
    {
      method: "GET",
      pattern: /^\/admin\/overview$/,
      handler: async () => {
        const watcher = await getWatcherSnapshot().catch(() => ({
          activeState: "failed",
          subState: "unknown",
          mainPid: null,
        }));
        return Response.json(buildOverviewModel(store, {
          watcher,
          logs: [],
          heavyLaneWindow: {
            enabled: process.env.CLAWMEM_HEAVY_LANE === "true",
            start: process.env.CLAWMEM_HEAVY_LANE_WINDOW_START ? Number(process.env.CLAWMEM_HEAVY_LANE_WINDOW_START) : null,
            end: process.env.CLAWMEM_HEAVY_LANE_WINDOW_END ? Number(process.env.CLAWMEM_HEAVY_LANE_WINDOW_END) : null,
          },
        }));
      },
    },
    {
      method: "GET",
      pattern: /^\/admin\/memory-feed$/,
      handler: async (_req: Request, url: URL) => {
        const limit = Number(url.searchParams.get("limit") ?? "25");
        return Response.json({ items: buildMemoryFeedModel(store, limit) });
      },
    },
    {
      method: "POST",
      pattern: /^\/admin\/jobs\/reindex$/,
      handler: async (req: Request) => {
        const body = await req.json().catch(() => ({}));
        const job = await queueReindexJob(store, body.collection);
        return Response.json({ job }, { status: 202 });
      },
    },
  ] as const;
}
```

- [ ] **Step 5: Add optional static asset serving in `src/admin/static.ts` and wire `src/server.ts`**

Create `src/admin/static.ts`:

```ts
import { existsSync } from "fs";
import { join } from "path";

export function tryServeConsoleAsset(url: URL): Response | null {
  const root = join(import.meta.dir, "..", "..", "ui", "dist");
  if (!existsSync(root)) return null;

  const path = url.pathname === "/console" ? "/console/index.html" : url.pathname;
  const relative = path.replace(/^\/console\/?/, "");
  const filePath = join(root, relative || "index.html");

  if (existsSync(filePath)) {
    return new Response(Bun.file(filePath));
  }

  const spaEntry = join(root, "index.html");
  return existsSync(spaEntry) ? new Response(Bun.file(spaEntry)) : null;
}
```

In `src/server.ts`, check the console mount before the normal 404:

```ts
import { createAdminRoutes } from "./admin/router.ts";
import { tryServeConsoleAsset } from "./admin/static.ts";

const routes: Route[] = [
  ...createAdminRoutes(storePlaceholder as any),
];

// Inside startServer():
const consoleAsset = tryServeConsoleAsset(url);
if (consoleAsset) return consoleAsset;
```

Do not literally use `storePlaceholder`; refactor route creation so `startServer()` composes the base routes and admin routes with the real `store` instance.

- [ ] **Step 6: Re-run server tests**

Run:

```bash
bun test tests/unit/server.test.ts
```

Expected:
- existing server tests still pass
- new `/admin/overview` and `/admin/jobs/reindex` tests pass
- `/console` returns 404 when `ui/dist` is absent

- [ ] **Step 7: Commit the admin route layer**

Run:

```bash
git add src/admin/jobs.ts src/admin/router.ts src/admin/static.ts src/server.ts tests/unit/server.test.ts
git commit -m "feat(admin): add operator routes and console asset serving"
```

### Task 4: Scaffold The `ui/` App And Shared Frontend Data Layer

**Files:**
- Create: `ui/package.json`
- Create: `ui/tsconfig.json`
- Create: `ui/vite.config.ts`
- Create: `ui/index.html`
- Create: `ui/src/main.tsx`
- Create: `ui/src/app/App.tsx`
- Create: `ui/src/app/router.tsx`
- Create: `ui/src/lib/api.ts`
- Create: `ui/src/lib/query-client.ts`
- Create: `ui/src/lib/types.ts`
- Create: `ui/src/styles/tokens.css`
- Create: `ui/src/styles/app.css`
- Create: `ui/src/test/setup.ts`
- Create: `ui/src/app/App.test.tsx`
- Modify: `package.json`

- [ ] **Step 1: Add failing frontend shell tests**

Create `ui/src/app/App.test.tsx`:

```tsx
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { App } from "./App";

describe("App shell", () => {
  it("renders bottom navigation entries for mobile operator flows", () => {
    render(
      <MemoryRouter initialEntries={["/"]}>
        <App />
      </MemoryRouter>,
    );

    expect(screen.getByRole("link", { name: /overview/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /runs/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /memory/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /collections/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /more/i })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Create the nested frontend workspace configuration**

Create `ui/package.json`:

```json
{
  "name": "clawmem-operator-console",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview",
    "test": "vitest run"
  },
  "dependencies": {
    "@tanstack/react-query": "^5.59.0",
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "react-router-dom": "^6.30.1"
  },
  "devDependencies": {
    "@testing-library/jest-dom": "^6.6.3",
    "@testing-library/react": "^16.1.0",
    "@testing-library/user-event": "^14.5.2",
    "@types/react": "^18.3.12",
    "@types/react-dom": "^18.3.1",
    "@vitejs/plugin-react": "^4.3.4",
    "jsdom": "^25.0.1",
    "typescript": "^5.9.3",
    "vite": "^5.4.10",
    "vitest": "^2.1.3"
  }
}
```

Create `ui/vite.config.ts`:

```ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 4173,
    proxy: {
      "/admin": "http://127.0.0.1:7438",
      "/health": "http://127.0.0.1:7438",
    },
  },
  test: {
    environment: "jsdom",
    setupFiles: "./src/test/setup.ts",
  },
  build: {
    outDir: "dist",
  },
});
```

Modify root `package.json` to add convenience scripts:

```json
"scripts": {
  "test": "bun test",
  "dev": "bun src/clawmem.ts",
  "inspector": "npx @modelcontextprotocol/inspector bun src/clawmem.ts mcp",
  "ui:dev": "cd ui && bun run dev",
  "ui:build": "cd ui && bun run build",
  "ui:test": "cd ui && bun run test"
}
```

- [ ] **Step 3: Add the shell, router, and shared API client**

Create `ui/src/lib/types.ts`:

```ts
export type OverviewResponse = {
  health: {
    service: { state: string; message: string };
    api: { state: string; message: string };
  };
  lanes: {
    light: { enabled: boolean; latestRunStatus: string | null };
    heavy: { enabled: boolean; window: string | null; latestRunStatus: string | null };
  };
  backlog: { totalDocuments: number; needsEmbedding: number };
  activeJobs: Array<{ id: number; kind: string; status: string }>;
  alerts: Array<{ id: string; severity: "info" | "warn" | "error"; message: string }>;
  checkedAt: string;
};
```

Create `ui/src/lib/api.ts`:

```ts
async function json<T>(input: RequestInfo, init?: RequestInit): Promise<T> {
  const res = await fetch(input, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    throw new Error(`${res.status} ${res.statusText}`);
  }
  return res.json() as Promise<T>;
}

export const api = {
  getOverview: () => json<import("./types").OverviewResponse>("/admin/overview"),
  getRuns: () => json<any>("/admin/runs"),
  getMemoryFeed: () => json<any>("/admin/memory-feed"),
  getCollections: () => json<any>("/admin/collections"),
  getLogs: (params: URLSearchParams) => json<any>(`/admin/logs?${params.toString()}`),
  queueReindex: (body: { collection?: string | null }) =>
    json<any>("/admin/jobs/reindex", { method: "POST", body: JSON.stringify(body) }),
};
```

Create `ui/src/app/App.tsx` and `ui/src/app/router.tsx`:

```tsx
import { NavLink, Outlet } from "react-router-dom";

const tabs = [
  { to: "/", label: "Overview" },
  { to: "/runs", label: "Runs" },
  { to: "/memory", label: "Memory" },
  { to: "/collections", label: "Collections" },
  { to: "/more", label: "More" },
];

export function App() {
  return (
    <div className="app-shell">
      <main className="app-content">
        <Outlet />
      </main>
      <nav className="bottom-nav" aria-label="Primary">
        {tabs.map((tab) => (
          <NavLink key={tab.to} to={tab.to} className="bottom-nav__link">
            {tab.label}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
```

- [ ] **Step 4: Install frontend deps and run the shell test**

Run:

```bash
cd ui && bun install && bun run test
```

Expected:
- install completes
- App shell test passes

- [ ] **Step 5: Commit the frontend scaffold**

Run:

```bash
git add package.json ui/package.json ui/tsconfig.json ui/vite.config.ts ui/index.html ui/src
git commit -m "feat(ui): scaffold operator console app shell"
```

### Task 5: Implement Overview And Runs Pages

**Files:**
- Create: `ui/src/components/AppShell.tsx`
- Create: `ui/src/components/StatusCard.tsx`
- Create: `ui/src/components/Panel.tsx`
- Create: `ui/src/components/RunList.tsx`
- Create: `ui/src/pages/OverviewPage.tsx`
- Create: `ui/src/pages/RunsPage.tsx`
- Create: `ui/src/pages/RunDetailPage.tsx`
- Create: `ui/src/pages/OverviewPage.test.tsx`

- [ ] **Step 1: Add a failing overview page test**

Create `ui/src/pages/OverviewPage.test.tsx`:

```tsx
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { OverviewPage } from "./OverviewPage";

vi.mock("../lib/api", () => ({
  api: {
    getOverview: async () => ({
      health: {
        service: { state: "healthy", message: "Watcher running" },
        api: { state: "healthy", message: "Operator API responding" },
      },
      lanes: {
        light: { enabled: true, latestRunStatus: "completed" },
        heavy: { enabled: true, window: "05:00-09:00", latestRunStatus: "outside_window" },
      },
      backlog: { totalDocuments: 1048, needsEmbedding: 56 },
      activeJobs: [{ id: 7, kind: "reindex", status: "running" }],
      alerts: [{ id: "1", severity: "warn", message: "56 documents need embedding" }],
      checkedAt: "2026-04-22T18:00:00.000Z",
    }),
  },
}));

describe("OverviewPage", () => {
  it("renders health, backlog, active jobs, and alerts", async () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <OverviewPage />
      </QueryClientProvider>,
    );

    expect(await screen.findByText(/watcher running/i)).toBeInTheDocument();
    expect(screen.getByText(/56 documents need embedding/i)).toBeInTheDocument();
    expect(screen.getByText(/reindex/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Build reusable cards and list components**

Create `ui/src/components/StatusCard.tsx`:

```tsx
type StatusCardProps = {
  label: string;
  value: string;
  tone?: "default" | "good" | "warn" | "bad";
  detail?: string;
};

export function StatusCard({ label, value, tone = "default", detail }: StatusCardProps) {
  return (
    <section className={`status-card status-card--${tone}`}>
      <p className="status-card__label">{label}</p>
      <p className="status-card__value">{value}</p>
      {detail ? <p className="status-card__detail">{detail}</p> : null}
    </section>
  );
}
```

Create `ui/src/pages/OverviewPage.tsx`:

```tsx
import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import { StatusCard } from "../components/StatusCard";

export function OverviewPage() {
  const overview = useQuery({
    queryKey: ["overview"],
    queryFn: api.getOverview,
    refetchInterval: 4000,
  });

  if (overview.isPending) return <p>Loading operator summary…</p>;
  if (overview.isError) return <p>Overview unavailable. Retry from pull-to-refresh.</p>;

  const data = overview.data;
  return (
    <div className="page">
      <header className="page-header">
        <h1>Overview</h1>
        <p>Last checked {new Date(data.checkedAt).toLocaleTimeString()}</p>
      </header>

      <div className="stack">
        <StatusCard label="Watcher" value={data.health.service.message} tone={data.health.service.state === "healthy" ? "good" : "warn"} />
        <StatusCard label="Embedding backlog" value={`${data.backlog.needsEmbedding}`} detail={`${data.backlog.totalDocuments} total documents`} />
        <StatusCard label="Heavy lane" value={data.lanes.heavy.latestRunStatus ?? "unknown"} detail={data.lanes.heavy.window ?? "disabled"} />

        <section className="panel">
          <h2>Active jobs</h2>
          {data.activeJobs.length === 0 ? <p>No active jobs.</p> : (
            <ul>{data.activeJobs.map((job) => <li key={job.id}>#{job.id} {job.kind} · {job.status}</li>)}</ul>
          )}
        </section>

        <section className="panel">
          <h2>Alerts</h2>
          {data.alerts.length === 0 ? <p>No active alerts.</p> : (
            <ul>{data.alerts.map((alert) => <li key={alert.id}>{alert.message}</li>)}</ul>
          )}
        </section>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Add runs page and run detail drill-down**

Create `ui/src/pages/RunsPage.tsx`:

```tsx
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { api } from "../lib/api";

export function RunsPage() {
  const runs = useQuery({
    queryKey: ["runs"],
    queryFn: api.getRuns,
    refetchInterval: 3000,
  });

  if (runs.isPending) return <p>Loading runs…</p>;
  if (runs.isError) return <p>Run history unavailable.</p>;

  return (
    <div className="page">
      <header className="page-header">
        <h1>Runs</h1>
      </header>
      <ul className="run-list">
        {runs.data.items.map((run: any) => (
          <li key={run.id} className="run-list__item">
            <Link to={`/runs/${run.id}`}>
              <strong>{run.kind}</strong>
              <span>{run.status}</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
```

- [ ] **Step 4: Run the targeted UI tests**

Run:

```bash
cd ui && bun run test -- --run src/app/App.test.tsx src/pages/OverviewPage.test.tsx
```

Expected:
- shell and overview tests pass

- [ ] **Step 5: Commit the overview/runs UI**

Run:

```bash
git add ui/src/components ui/src/pages/OverviewPage.tsx ui/src/pages/RunsPage.tsx ui/src/pages/RunDetailPage.tsx ui/src/pages/OverviewPage.test.tsx
git commit -m "feat(ui): add overview and runs pages"
```

### Task 6: Implement Memory Feed And Collections Management

**Files:**
- Create: `ui/src/components/FeedCard.tsx`
- Create: `ui/src/components/CollectionCard.tsx`
- Create: `ui/src/pages/MemoryFeedPage.tsx`
- Create: `ui/src/pages/CollectionsPage.tsx`
- Create: `ui/src/pages/CollectionDetailPage.tsx`
- Create: `ui/src/pages/CollectionsPage.test.tsx`
- Modify: `src/admin/router.ts`
- Modify: `src/admin/service.ts`

- [ ] **Step 1: Add a failing collections page test**

Create `ui/src/pages/CollectionsPage.test.tsx`:

```tsx
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { CollectionsPage } from "./CollectionsPage";

vi.mock("../lib/api", () => ({
  api: {
    getCollections: async () => ({
      items: [
        {
          id: "openclaw-main",
          name: "openclaw-main",
          root: "/home/drj/.openclaw/workspace",
          pattern: "**/*.md",
          documents: 63,
          unembedded: 3,
        },
      ],
    }),
  },
}));

describe("CollectionsPage", () => {
  it("renders collection cards with counts and pattern", async () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <CollectionsPage />
      </QueryClientProvider>,
    );

    expect(await screen.findByText(/openclaw-main/i)).toBeInTheDocument();
    expect(screen.getByText(/\*\*\/\*\.md/)).toBeInTheDocument();
    expect(screen.getByText(/63 docs/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Extend admin service/router with collections and memory feed payloads**

Add to `src/admin/service.ts`:

```ts
import { listCollections } from "../collections.ts";

export function buildCollectionsModel(store: Store) {
  const status = store.getStatus();
  const statusByName = new Map(status.collections.map((row) => [row.name, row]));
  return listCollections().map((collection) => {
    const row = statusByName.get(collection.name);
    return {
      id: collection.name,
      name: collection.name,
      root: collection.path,
      pattern: collection.pattern,
      documents: row?.documents ?? 0,
      unembedded: 0,
      lastActivity: null,
    };
  });
}
```

Add to `src/admin/router.ts`:

```ts
{
  method: "GET",
  pattern: /^\/admin\/collections$/,
  handler: async () => Response.json({ items: buildCollectionsModel(store) }),
},
{
  method: "POST",
  pattern: /^\/admin\/collections$/,
  handler: async (req: Request) => {
    const body = await req.json();
    addCollection(body.name, body.path, body.pattern);
    return Response.json({ ok: true }, { status: 201 });
  },
},
{
  method: "PATCH",
  pattern: /^\/admin\/collections\/([^/]+)$/,
  handler: async (req: Request, url: URL) => {
    const id = url.pathname.split("/").pop()!;
    const body = await req.json();
    const ok = updateCollection(id, body);
    return ok ? Response.json({ ok: true }) : Response.json({ error: "Not found" }, { status: 404 });
  },
},
{
  method: "DELETE",
  pattern: /^\/admin\/collections\/([^/]+)$/,
  handler: async (_req: Request, url: URL) => {
    const id = url.pathname.split("/").pop()!;
    const ok = removeCollection(id);
    return ok ? Response.json({ ok: true }) : Response.json({ error: "Not found" }, { status: 404 });
  },
},
```

- [ ] **Step 3: Build Memory Feed and Collections pages**

Create `ui/src/pages/MemoryFeedPage.tsx`:

```tsx
import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";

export function MemoryFeedPage() {
  const feed = useQuery({
    queryKey: ["memory-feed"],
    queryFn: api.getMemoryFeed,
    refetchInterval: 7000,
  });

  if (feed.isPending) return <p>Loading memory feed…</p>;
  if (feed.isError) return <p>Memory feed unavailable.</p>;

  return (
    <div className="page">
      <header className="page-header"><h1>Memory Feed</h1></header>
      <div className="stack">
        {feed.data.items.map((item: any) => (
          <article key={item.documentId} className="feed-card">
            <p className="feed-card__type">{item.type}</p>
            <h2>{item.title}</h2>
            <p>{item.summary}</p>
            <small>{new Date(item.createdAt).toLocaleString()}</small>
          </article>
        ))}
      </div>
    </div>
  );
}
```

Create `ui/src/pages/CollectionsPage.tsx`:

```tsx
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { api } from "../lib/api";

export function CollectionsPage() {
  const collections = useQuery({
    queryKey: ["collections"],
    queryFn: api.getCollections,
    refetchInterval: 15000,
  });

  if (collections.isPending) return <p>Loading collections…</p>;
  if (collections.isError) return <p>Collections unavailable.</p>;

  return (
    <div className="page">
      <header className="page-header"><h1>Collections</h1></header>
      <div className="stack">
        {collections.data.items.map((collection: any) => (
          <Link key={collection.id} to={`/collections/${collection.id}`} className="collection-card">
            <h2>{collection.name}</h2>
            <p>{collection.root}</p>
            <p>{collection.pattern}</p>
            <p>{collection.documents} docs · {collection.unembedded} unembedded</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run frontend collections tests and server tests**

Run:

```bash
cd ui && bun run test -- --run src/pages/CollectionsPage.test.tsx
cd /home/drj/tools/ClawMem && bun test tests/unit/server.test.ts
```

Expected:
- collections page test passes
- server tests pass with collections CRUD coverage added

- [ ] **Step 5: Commit the feed and collections slice**

Run:

```bash
git add src/admin/router.ts src/admin/service.ts ui/src/components/FeedCard.tsx ui/src/components/CollectionCard.tsx ui/src/pages/MemoryFeedPage.tsx ui/src/pages/CollectionsPage.tsx ui/src/pages/CollectionDetailPage.tsx ui/src/pages/CollectionsPage.test.tsx
git commit -m "feat(ui): add memory feed and collections management"
```

### Task 7: Implement Logs, Admin Actions, And Mobile-Safe Danger Zone

**Files:**
- Create: `ui/src/components/LogList.tsx`
- Create: `ui/src/components/ActionSheet.tsx`
- Create: `ui/src/pages/LogsPage.tsx`
- Create: `ui/src/pages/AdminPage.tsx`
- Modify: `src/admin/router.ts`
- Modify: `src/admin/runtime.ts`
- Modify: `src/admin/jobs.ts`

- [ ] **Step 1: Add journald-backed log query endpoint**

Extend `src/admin/runtime.ts`:

```ts
export async function queryWatcherLogs(input: {
  priority?: "err" | "warn" | "info";
  since?: string;
  limit?: number;
}) {
  const args = [
    "journalctl",
    "--user",
    "-u",
    "clawmem-watcher.service",
    "--output=json",
    "--no-pager",
    "--lines",
    String(input.limit ?? 200),
  ];
  if (input.since) args.push("--since", input.since);

  const proc = Bun.spawn(args, { stdout: "pipe", stderr: "pipe" });
  const raw = await new Response(proc.stdout).text();
  const items = raw.split("\n").filter(Boolean).map(parseJournalJsonLine);

  return input.priority ? items.filter((item) => item.level === input.priority) : items;
}
```

Add to `src/admin/router.ts`:

```ts
{
  method: "GET",
  pattern: /^\/admin\/logs$/,
  handler: async (_req: Request, url: URL) => {
    const limit = Number(url.searchParams.get("limit") ?? "200");
    const level = url.searchParams.get("level") as "err" | "warn" | "info" | null;
    const since = url.searchParams.get("since") ?? undefined;
    const items = await queryWatcherLogs({ limit, since, priority: level ?? undefined });
    return Response.json({ items });
  },
},
```

- [ ] **Step 2: Add admin action endpoints for lifecycle and document mutations**

Wrap existing write paths under the operator namespace:

```ts
{
  method: "POST",
  pattern: /^\/admin\/documents\/([^/]+)\/pin$/,
  handler: async (req, url) => {
    const docid = url.pathname.split("/")[3]!;
    const body = await req.json().catch(() => ({}));
    return handlePin(new Request(req.url, {
      method: "POST",
      headers: req.headers,
      body: JSON.stringify(body),
    }), new URL(`/documents/${docid}/pin`, url.origin), store);
  },
},
{
  method: "POST",
  pattern: /^\/admin\/documents\/([^/]+)\/forget$/,
  handler: async (_req, url) => {
    const docid = url.pathname.split("/")[3]!;
    return handleForget(new Request(`${url.origin}/documents/${docid}/forget`, { method: "POST" }), new URL(`/documents/${docid}/forget`, url.origin), store);
  },
},
```

Do the same for snooze and lifecycle restore/sweep so the UI does not mix public and admin paths.

- [ ] **Step 3: Build mobile-first Logs and Admin pages**

Create `ui/src/pages/LogsPage.tsx`:

```tsx
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";

export function LogsPage() {
  const [level, setLevel] = useState<"err" | "warn" | "info" | "">("");
  const params = useMemo(() => {
    const search = new URLSearchParams({ limit: "200" });
    if (level) search.set("level", level);
    return search;
  }, [level]);

  const logs = useQuery({
    queryKey: ["logs", level],
    queryFn: () => api.getLogs(params),
    refetchInterval: 5000,
  });

  return (
    <div className="page">
      <header className="page-header">
        <h1>Logs</h1>
        <div className="chip-row">
          <button onClick={() => setLevel("")}>All</button>
          <button onClick={() => setLevel("err")}>Errors</button>
          <button onClick={() => setLevel("warn")}>Warnings</button>
        </div>
      </header>
      {logs.isPending ? <p>Loading logs…</p> : (
        <ul className="log-list">
          {logs.data.items.map((item: any, index: number) => (
            <li key={`${item.timestamp}-${index}`} className={`log-list__item log-list__item--${item.level}`}>
              <strong>{item.source}</strong>
              <p>{item.message}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
```

Create `ui/src/pages/AdminPage.tsx`:

```tsx
import { useMutation } from "@tanstack/react-query";
import { api } from "../lib/api";

export function AdminPage() {
  const reindexAll = useMutation({
    mutationFn: () => api.queueReindex({ collection: null }),
  });

  return (
    <div className="page">
      <header className="page-header">
        <h1>Admin</h1>
        <p>Danger zone actions require deliberate confirmation.</p>
      </header>

      <section className="panel panel--danger">
        <h2>Indexing</h2>
        <button onClick={() => {
          if (window.confirm("Queue a full reindex for all collections?")) {
            reindexAll.mutate();
          }
        }}>
          Queue full reindex
        </button>
      </section>
    </div>
  );
}
```

- [ ] **Step 4: Run backend and frontend tests**

Run:

```bash
bun test tests/unit/server.test.ts tests/unit/admin-runtime.test.ts tests/unit/admin-jobs.test.ts
cd ui && bun run test
```

Expected:
- backend tests pass
- frontend tests pass

- [ ] **Step 5: Commit logs and admin**

Run:

```bash
git add src/admin/router.ts src/admin/runtime.ts src/admin/jobs.ts ui/src/components/LogList.tsx ui/src/components/ActionSheet.tsx ui/src/pages/LogsPage.tsx ui/src/pages/AdminPage.tsx
git commit -m "feat(ui): add logs and admin control pages"
```

### Task 8: Document, Build, And Verify Static Serving

**Files:**
- Modify: `README.md`
- Modify: `docs/reference/rest-api.md`
- Modify: `docs/superpowers/specs/2026-04-22-clawmem-operator-console-design.md` (only if implementation-driven clarifications are needed)

- [ ] **Step 1: Document UI development and serving flow**

Update `README.md` with a concise operator-console section:

```md
## Operator console

ClawMem includes a mobile-first operator console for monitoring watcher health,
maintenance runs, extraction output, collections, and admin actions.

### Local development

```bash
bun run ui:dev
./bin/clawmem serve --port 7438
```

### Production-style build

```bash
bun run ui:build
./bin/clawmem serve --port 7438
```

When `ui/dist` exists, the console is served at `/console`.
```

Update `docs/reference/rest-api.md` with an `## Operator console API` section that lists:

- `/admin/overview`
- `/admin/runs`
- `/admin/memory-feed`
- `/admin/collections`
- `/admin/logs`
- `/admin/jobs/*`
- `/console/*`

- [ ] **Step 2: Build the UI and verify the console mount**

Run:

```bash
cd ui && bun run build
cd /home/drj/tools/ClawMem && bun test tests/unit/server.test.ts
./bin/clawmem serve --port 17439 >/tmp/clawmem-console.log 2>&1 &
SERVER_PID=$!
sleep 2
curl -I http://127.0.0.1:17439/console
kill $SERVER_PID
wait $SERVER_PID 2>/dev/null || true
```

Expected:
- Vite build succeeds
- server tests still pass
- `/console` returns `200 OK` or `Content-Type: text/html`

- [ ] **Step 3: Run the smallest complete verification suite**

Run:

```bash
bun test tests/unit/admin-runtime.test.ts tests/unit/admin-jobs.test.ts tests/unit/admin-service.test.ts tests/unit/server.test.ts
cd ui && bun run test
cd ui && bun run build
```

Expected:
- backend operator tests pass
- frontend tests pass
- production build succeeds

- [ ] **Step 4: Commit docs and final verification changes**

Run:

```bash
git add README.md docs/reference/rest-api.md
git commit -m "docs(ui): document operator console workflows"
```

## Self-Review Checklist

- Spec coverage:
  - mobile-first information architecture: covered by Tasks 4 through 7
  - `/admin/*` operator backend: covered by Tasks 2 and 3
  - full operator control: covered by Tasks 3, 6, and 7
  - near real-time polling: covered by Tasks 5 through 7
  - future static serving by ClawMem: covered by Tasks 3 and 8
- Placeholder scan:
  - no `TBD`, `TODO`, or “implement later” markers remain
  - all commands are explicit
  - all new files are named exactly
- Type consistency:
  - operator read shapes are centralized in `src/admin/types.ts` and mirrored in `ui/src/lib/types.ts`
  - `/console/*` is the only static mount path used throughout the plan
  - job tracking consistently uses the `admin_jobs` table, not mixed in-memory and DB state

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-04-22-clawmem-operator-console-implementation-plan.md`. Two execution options:

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

Which approach?
