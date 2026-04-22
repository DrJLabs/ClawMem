import { createBrowserRouter, createMemoryRouter } from "react-router-dom";
import { App } from "./App";
import { OverviewPage } from "../pages/OverviewPage";
import { RunsPage } from "../pages/RunsPage";
import { RunDetailPage } from "../pages/RunDetailPage";

type PlaceholderPageProps = {
  title: string;
  description: string;
};

function PlaceholderPage({ title, description }: PlaceholderPageProps) {
  return (
    <section className="placeholder-page" aria-label={title}>
      <p className="placeholder-page__eyebrow">Task 4 shell</p>
      <h2>{title}</h2>
      <p>{description}</p>
    </section>
  );
}

export const consoleBase = "/console";

export const appRoutes = [
  {
    path: "/",
    element: <App />,
    children: [
      {
        index: true,
        element: <OverviewPage />,
      },
      {
        path: "runs",
        children: [
          {
            index: true,
            element: <RunsPage />,
          },
          {
            path: ":runId",
            element: <RunDetailPage />,
          },
        ],
      },
      {
        path: "memory",
        element: (
          <PlaceholderPage
            title="Memory"
            description="Memory feed and inspection pages are intentionally deferred until the next task."
          />
        ),
      },
      {
        path: "collections",
        element: (
          <PlaceholderPage
            title="Collections"
            description="Collection management UI is deferred. This placeholder preserves the mobile operator path."
          />
        ),
      },
      {
        path: "more",
        element: (
          <PlaceholderPage
            title="More"
            description="Secondary controls and logs remain out of scope for Task 4."
          />
        ),
      },
    ],
  },
];

export function createAppRouter() {
  return createBrowserRouter(appRoutes, { basename: consoleBase });
}

export function createAppMemoryRouter(initialEntries: string[] = ["/"]) {
  return createMemoryRouter(appRoutes, {
    basename: consoleBase,
    initialEntries,
  });
}
