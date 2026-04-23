import { Link } from "react-router-dom";
import type { RunItem } from "../lib/types";

type RunListProps = {
  items: RunItem[];
  emptyMessage?: string;
};

export function RunList({ items, emptyMessage = "No runs available." }: RunListProps) {
  if (items.length === 0) {
    return <p>{emptyMessage}</p>;
  }

  return (
    <ul
      className="run-list"
      style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: "0.75rem" }}
    >
      {items.map((run) => (
        <li
          key={run.id}
          className="run-list__item"
          style={{
            border: "1px solid var(--color-border)",
            borderRadius: "14px",
            background: "rgba(10, 16, 31, 0.45)",
          }}
        >
          <Link
            to={`/runs/${run.id}`}
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: "1rem",
              padding: "0.9rem 1rem",
            }}
          >
            <div>
              <strong style={{ display: "block", marginBottom: "0.35rem" }}>{run.label}</strong>
              <span style={{ color: "var(--color-text-muted)" }}>{run.detail}</span>
            </div>
            <span
              style={{
                whiteSpace: "nowrap",
                borderRadius: "999px",
                border: "1px solid var(--color-border-strong)",
                padding: "0.35rem 0.7rem",
                color: "var(--color-accent)",
                fontWeight: 600,
              }}
            >
              {run.status}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
