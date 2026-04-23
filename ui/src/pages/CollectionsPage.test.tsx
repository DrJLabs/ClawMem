import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { CollectionsPage } from "./CollectionsPage";

describe("CollectionsPage", () => {
  test("renders collection cards with counts and pattern", () => {
    const client = new QueryClient();
    client.setQueryData(["collections"], {
      items: [
        {
          id: "openclaw-main",
          name: "openclaw-main",
          root: "/home/drj/.openclaw/workspace",
          pattern: "**/*.md",
          documents: 63,
          embeddedDocuments: 60,
          unembeddedDocuments: 3,
          lastActivity: "2026-04-22T18:00:00.000Z",
          updateCommand: null,
        },
      ],
    });

    const markup = renderToStaticMarkup(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={["/collections"]}>
          <Routes>
            <Route path="/collections" element={<CollectionsPage />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    expect(markup).toContain("openclaw-main");
    expect(markup).toContain("**/*.md");
    expect(markup).toContain("63 docs");
    expect(markup).toContain("3 docs waiting on embeddings");
  });
});
