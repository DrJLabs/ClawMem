import { afterEach, describe, expect, mock, test } from "bun:test";
import { api } from "./api";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("operator API client", () => {
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
