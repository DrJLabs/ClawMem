import { afterEach, describe, expect, mock, test } from "bun:test";
import { api, bootstrapConsoleApiToken } from "./api";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("operator API client", () => {
  test("bootstraps token from the console URL and strips it from history", () => {
    const storage = new Map<string, string>();
    const history = {
      replaceState: mock((_state: unknown, _unused: string, _url?: string | URL | null) => {}),
    };

    const token = bootstrapConsoleApiToken(
      "https://example.test/console/runs?token=test-secret&view=grid#details",
      {
        getItem: (key) => storage.get(key) ?? null,
        setItem: (key, value) => void storage.set(key, value),
      },
      history,
    );

    expect(token).toBe("test-secret");
    expect(storage.get("clawmem_api_token")).toBe("test-secret");
    expect(history.replaceState).toHaveBeenCalledWith(null, "", "/console/runs?view=grid#details");
  });

  test("keeps the token in memory and scrubs the URL when storage throws", () => {
    const history = {
      replaceState: mock((_state: unknown, _unused: string, _url?: string | URL | null) => {}),
    };

    const token = bootstrapConsoleApiToken(
      "https://example.test/console/runs?token=test-secret#details",
      {
        getItem: () => {
          throw new Error("storage blocked");
        },
        setItem: () => {
          throw new Error("quota exceeded");
        },
      },
      history,
    );

    expect(token).toBe("test-secret");
    expect(history.replaceState).toHaveBeenCalledWith(null, "", "/console/runs#details");
  });

  test("sends bearer auth when a token has been bootstrapped", async () => {
    const storage = new Map<string, string>([["clawmem_api_token", "test-secret"]]);
    bootstrapConsoleApiToken(
      "https://example.test/console?view=grid",
      {
        getItem: (key) => storage.get(key) ?? null,
        setItem: (key, value) => void storage.set(key, value),
      },
    );

    const fetchMock = mock(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const headers = new Headers(init?.headers);
      expect(headers.get("Authorization")).toBe("Bearer test-secret");
      return new Response(JSON.stringify({
        health: {
          service: { state: "healthy", message: "Watcher running" },
          api: { state: "healthy", message: "Operator API responding" },
        },
        lanes: {
          light: { enabled: true, latestRunStatus: "enabled" },
          heavy: { enabled: false, latestRunStatus: "disabled", window: null },
        },
        backlog: { totalDocuments: 1, needsEmbedding: 0 },
        activeJobs: [],
        alerts: [],
        checkedAt: "2026-04-23T08:00:00.000Z",
      }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });
    globalThis.fetch = fetchMock as typeof fetch;

    await api.getOverview();

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  test("URL-encodes run ids for detail requests", async () => {
    const fetchMock = mock(async (input: RequestInfo | URL) => {
      expect(String(input)).toBe("/admin/runs/lane-light-current%2Fdetail");
      return new Response(JSON.stringify({
        item: {
          id: "lane-light-current/detail",
          source: "lane",
          label: "Light lane",
          status: "enabled",
          detail: "Watcher-hosted consolidation worker",
          startedAt: "2026-04-23T01:00:00.000Z",
          finishedAt: null,
        },
      }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });
    globalThis.fetch = fetchMock as typeof fetch;

    const result = await api.getRunDetail("lane-light-current/detail");

    expect(result.item.id).toBe("lane-light-current/detail");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
