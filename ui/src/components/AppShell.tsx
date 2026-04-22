import type { ReactNode } from "react";
import { NavLink } from "react-router-dom";

export const appTabs = [
  { to: "/", label: "Overview" },
  { to: "/runs", label: "Runs" },
  { to: "/memory", label: "Memory" },
  { to: "/collections", label: "Collections" },
  { to: "/more", label: "More" },
];

type AppShellProps = {
  children: ReactNode;
};

export function AppShell({ children }: AppShellProps) {
  return (
    <div className="app-shell">
      <header className="app-header">
        <div>
          <p className="app-eyebrow">ClawMem</p>
          <h1 className="app-title">Operator Console</h1>
        </div>
      </header>
      <main className="app-content">{children}</main>
      <nav className="bottom-nav" aria-label="Primary">
        {appTabs.map((tab) => (
          <NavLink
            key={tab.to}
            to={tab.to}
            end={tab.to === "/"}
            className={({ isActive }) =>
              isActive ? "bottom-nav__link bottom-nav__link--active" : "bottom-nav__link"
            }
          >
            {tab.label}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
