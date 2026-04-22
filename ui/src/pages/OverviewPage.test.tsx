import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { OverviewPage } from "./OverviewPage";

describe("OverviewPage", () => {
  test("renders health, backlog, active jobs, and alerts", () => {
    const client = new QueryClient();
    client.setQueryData(["overview"], {
      health: {
        service: { state: "healthy", message: "Watcher running" },
        api: { state: "healthy", message: "Operator API responding" },
      },
      lanes: {
        light: { enabled: true, latestRunStatus: "completed" },
        heavy: {
          enabled: true,
          window: "05:00-09:00",
          latestRunStatus: "outside_window",
        },
      },
      backlog: { totalDocuments: 1048, needsEmbedding: 56 },
      activeJobs: [{ id: 7, kind: "reindex", status: "running" }],
      alerts: [{ id: "1", severity: "warn", message: "56 documents need embedding" }],
      checkedAt: "2026-04-22T18:00:00.000Z",
    });

    const markup = renderToStaticMarkup(
      <QueryClientProvider client={client}>
        <OverviewPage />
      </QueryClientProvider>,
    );

    expect(markup).toContain("Watcher running");
    expect(markup).toContain("56 documents need embedding");
    expect(markup).toContain("reindex");
  });
});
