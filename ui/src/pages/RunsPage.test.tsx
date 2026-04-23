import { describe, expect, mock, spyOn, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { RunsPage } from "./RunsPage";
import { RunDetailPage } from "./RunDetailPage";
import * as apiModule from "../lib/api";

describe("Runs pages", () => {
  test("renders runs from the admin runs API", async () => {
    const getRuns = mock(async () => ({
      items: [
        {
          id: "job-7",
          source: "job" as const,
          label: "reindex",
          status: "running",
          detail: "Admin job #7",
          startedAt: "2026-04-22T18:00:00.000Z",
          finishedAt: null,
        },
      ],
    }));
    const getOverview = mock(async () => ({
      health: {
        service: { state: "healthy", message: "Watcher running" },
        api: { state: "healthy", message: "Operator API responding" },
      },
      lanes: {
        light: { enabled: true, latestRunStatus: "enabled" },
        heavy: { enabled: true, window: "5:00-9:00", latestRunStatus: "skipped" },
      },
      backlog: { totalDocuments: 1048, needsEmbedding: 42 },
      activeJobs: [],
      alerts: [],
      checkedAt: "2026-04-23T01:00:00.000Z",
    }));

    const getRunsSpy = spyOn(apiModule.api, "getRuns").mockImplementation(getRuns);
    const getOverviewSpy = spyOn(apiModule.api, "getOverview").mockImplementation(getOverview);

    try {
      const client = new QueryClient();
      await client.prefetchQuery({ queryKey: ["runs"], queryFn: apiModule.api.getRuns });
      await client.prefetchQuery({ queryKey: ["overview"], queryFn: apiModule.api.getOverview });

      const markup = renderToStaticMarkup(
        <QueryClientProvider client={client}>
          <MemoryRouter initialEntries={["/runs"]}>
            <Routes>
              <Route path="/runs" element={<RunsPage />} />
            </Routes>
          </MemoryRouter>
        </QueryClientProvider>,
      );

      expect(markup).toContain("reindex");
      expect(markup).toContain("running");
      expect(markup).toContain("Light lane");
      expect(markup).toContain("enabled");
      expect(markup).toContain("Heavy lane");
      expect(markup).toContain("5:00-9:00");
    } finally {
      getRunsSpy.mockRestore();
      getOverviewSpy.mockRestore();
    }
  });

  test("renders run detail from the admin detail API", async () => {
    const getRunDetail = mock(async () => ({
      item: {
        id: "job-7",
        source: "job" as const,
        label: "reindex",
        status: "running",
        detail: "Admin job #7",
        startedAt: "2026-04-22T18:00:00.000Z",
        finishedAt: null,
      },
    }));

    const getRunDetailSpy = spyOn(apiModule.api, "getRunDetail").mockImplementation(getRunDetail);

    try {
      const client = new QueryClient();
      await client.prefetchQuery({
        queryKey: ["runs", "job-7"],
        queryFn: () => apiModule.api.getRunDetail("job-7"),
      });

      const markup = renderToStaticMarkup(
        <QueryClientProvider client={client}>
          <MemoryRouter initialEntries={["/runs/job-7"]}>
            <Routes>
              <Route path="/runs/:runId" element={<RunDetailPage />} />
            </Routes>
          </MemoryRouter>
        </QueryClientProvider>,
      );

      expect(markup).toContain("reindex");
      expect(markup).toContain("Admin job #7");
    } finally {
      getRunDetailSpy.mockRestore();
    }
  });
});
