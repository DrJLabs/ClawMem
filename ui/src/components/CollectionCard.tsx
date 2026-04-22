import { Link } from "react-router-dom";
import type { CollectionItem } from "../lib/types";

type CollectionCardProps = {
  item: CollectionItem;
};

function formatLastActivity(value: string | null): string {
  return value ? new Date(value).toLocaleString() : "No indexed activity yet";
}

export function CollectionCard({ item }: CollectionCardProps) {
  return (
    <Link
      to={encodeURIComponent(item.id)}
      style={{
        display: "block",
        padding: "1rem",
        borderRadius: "1rem",
        border: "1px solid rgba(86, 112, 168, 0.45)",
        background: "rgba(10, 17, 33, 0.46)",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          gap: "1rem",
          alignItems: "baseline",
          marginBottom: "0.5rem",
          flexWrap: "wrap",
        }}
      >
        <h3 style={{ margin: 0, fontSize: "1.125rem" }}>{item.name}</h3>
        <span style={{ color: "var(--color-text-muted)", fontSize: "0.875rem" }}>
          {item.documents} docs
        </span>
      </div>

      <p style={{ margin: "0 0 0.5rem", color: "var(--color-text-muted)", wordBreak: "break-word" }}>
        {item.root}
      </p>
      <p style={{ margin: "0 0 0.75rem", color: "var(--color-text-muted)" }}>{item.pattern}</p>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
          gap: "0.75rem",
        }}
      >
        <div>
          <div style={{ fontSize: "0.75rem", color: "var(--color-text-muted)", textTransform: "uppercase" }}>
            Embeddings
          </div>
          <div>{item.embeddedDocuments} synced</div>
        </div>
        <div>
          <div style={{ fontSize: "0.75rem", color: "var(--color-text-muted)", textTransform: "uppercase" }}>
            Needs embedding
          </div>
          <div>{item.unembeddedDocuments}</div>
        </div>
        <div>
          <div style={{ fontSize: "0.75rem", color: "var(--color-text-muted)", textTransform: "uppercase" }}>
            Last activity
          </div>
          <div>{formatLastActivity(item.lastActivity)}</div>
        </div>
      </div>
    </Link>
  );
}
