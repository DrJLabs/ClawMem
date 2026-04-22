import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { RouterProvider } from "react-router-dom";
import { consoleBase, createAppMemoryRouter, createAppRouter } from "./router";

describe("App shell", () => {
  test("renders the mobile bottom navigation entries", () => {
    const router = createAppMemoryRouter(["/console/"]);
    const markup = renderToStaticMarkup(
      <RouterProvider router={router} />,
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
