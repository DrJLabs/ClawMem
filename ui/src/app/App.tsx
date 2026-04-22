import { NavLink, Outlet } from "react-router-dom";

export const appTabs = [
  { to: "/", label: "Overview" },
  { to: "/runs", label: "Runs" },
  { to: "/memory", label: "Memory" },
  { to: "/collections", label: "Collections" },
  { to: "/more", label: "More" },
];

export function App() {
  return (
    <div className="app-shell">
      <header className="app-header">
        <div>
          <p className="app-eyebrow">ClawMem</p>
          <h1 className="app-title">Operator Console</h1>
        </div>
      </header>
      <main className="app-content">
        <Outlet />
      </main>
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
