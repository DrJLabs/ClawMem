import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { CollectionDetailPage } from "./CollectionDetailPage";

describe("CollectionDetailPage", () => {
  test("renders derived counts and editable fields for a configured collection", () => {
    const client = new QueryClient();
    client.setQueryData(["collections", "openclaw-main"], {
      item: {
        id: "openclaw-main",
        name: "openclaw-main",
        root: "/home/drj/.openclaw/workspace",
        pattern: "**/*.md",
        documents: 63,
        embeddedDocuments: 60,
        unembeddedDocuments: 3,
        lastActivity: "2026-04-22T18:00:00.000Z",
        updateCommand: "git pull --ff-only",
      },
    });

    const markup = renderToStaticMarkup(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={["/collections/openclaw-main"]}>
          <Routes>
            <Route path="/collections/:collectionId" element={<CollectionDetailPage />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    expect(markup).toContain("openclaw-main");
    expect(markup).toContain("/home/drj/.openclaw/workspace");
    expect(markup).toContain("git pull --ff-only");
    expect(markup).toContain("Needs embedding");
  });
});
