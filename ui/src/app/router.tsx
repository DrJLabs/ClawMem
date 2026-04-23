import { createBrowserRouter, createMemoryRouter } from "react-router-dom";
import { App } from "./App";
import { OverviewPage } from "../pages/OverviewPage";
import { RunsPage } from "../pages/RunsPage";
import { RunDetailPage } from "../pages/RunDetailPage";
import { MemoryFeedPage } from "../pages/MemoryFeedPage";
import { CollectionsPage } from "../pages/CollectionsPage";
import { CollectionDetailPage } from "../pages/CollectionDetailPage";
import { AdminPage } from "../pages/AdminPage";
import { LogsPage } from "../pages/LogsPage";

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
        element: <MemoryFeedPage />,
      },
      {
        path: "collections",
        children: [
          {
            index: true,
            element: <CollectionsPage />,
          },
          {
            path: ":collectionId",
            element: <CollectionDetailPage />,
          },
        ],
      },
      {
        path: "more",
        children: [
          {
            index: true,
            element: <AdminPage />,
          },
          {
            path: "logs",
            element: <LogsPage />,
          },
        ],
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
