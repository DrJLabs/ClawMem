import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { LogsPage } from "./LogsPage";

describe("LogsPage", () => {
  test("renders log entries and filters copy", () => {
    const client = new QueryClient();
    client.setQueryData(["logs", ""], {
      items: [
        {
          timestamp: "2026-04-22T18:00:00.000Z",
          level: "warn",
          source: "clawmem-watcher",
          message: "watcher warning",
        },
      ],
    });

    const markup = renderToStaticMarkup(
      <QueryClientProvider client={client}>
        <MemoryRouter>
          <LogsPage />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    expect(markup).toContain("Watcher journald");
    expect(markup).toContain("watcher warning");
    expect(markup).toContain("Errors");
  });
});
