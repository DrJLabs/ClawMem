import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "react-router-dom";
import { consoleBase, createAppMemoryRouter, createAppRouter } from "./router";

describe("App shell", () => {
  test("renders the mobile bottom navigation entries", () => {
    const router = createAppMemoryRouter(["/console/"]);
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
        <RouterProvider router={router} />
      </QueryClientProvider>,
    );

    expect(markup).toContain("Overview");
    expect(markup).toContain("Runs");
    expect(markup).toContain("Memory");
    expect(markup).toContain("Collections");
    expect(markup).toContain("More");
  });

  test("keeps the shell aligned with the /console mount", () => {
    expect(consoleBase).toBe("/console");
    expect(typeof createAppRouter).toBe("function");
    const router = createAppMemoryRouter(["/console/runs"]);
    expect(router.basename).toBe("/console");
    expect(router.routes[0]?.children?.map((child) => child.index ? "index" : child.path)).toEqual([
      "index",
      "runs",
      "memory",
      "collections",
      "more",
    ]);
  });
});
