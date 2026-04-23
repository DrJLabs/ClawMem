import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { AdminPage } from "./AdminPage";

describe("AdminPage", () => {
  test("renders maintenance controls and danger zone copy", () => {
    const markup = renderToStaticMarkup(
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter>
          <AdminPage />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    expect(markup).toContain("Queue full reindex");
    expect(markup).toContain("Preview lifecycle sweep");
    expect(markup).toContain("Danger zone");
    expect(markup).toContain("Type FORGET to enable document deactivation");
    expect(markup).toContain("Forget docid");
    expect(markup).toContain("disabled");
  });
});
