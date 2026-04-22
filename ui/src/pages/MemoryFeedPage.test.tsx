import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryFeedPage } from "./MemoryFeedPage";

describe("MemoryFeedPage", () => {
  test("renders feed items from the admin feed payload", () => {
    const client = new QueryClient();
    client.setQueryData(["memory-feed"], {
      items: [
        {
          documentId: "42",
          type: "milestone",
          title: "Snapshot backup completed successfully",
          summary: "Snapshot backup completed without errors.",
          body: "# Snapshot\n\nSnapshot backup completed without errors.",
          createdAt: "2026-04-22T18:00:00.000Z",
          sourceSession: null,
          sourceRun: null,
          sourceCount: 2,
          path: "observations/2026-04-22-snapshot.md",
        },
      ],
    });

    const markup = renderToStaticMarkup(
      <QueryClientProvider client={client}>
        <MemoryFeedPage />
      </QueryClientProvider>,
    );

    expect(markup).toContain("Snapshot backup completed successfully");
    expect(markup).toContain("Snapshot backup completed without errors.");
    expect(markup).toContain("2 source document(s)");
  });
});
