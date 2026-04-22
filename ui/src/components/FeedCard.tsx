import type { MemoryFeedItem } from "../lib/types";

type FeedCardProps = {
  item: MemoryFeedItem;
};

function formatDate(value: string): string {
  return new Date(value).toLocaleString();
}

export function FeedCard({ item }: FeedCardProps) {
  return (
    <article
      style={{
        padding: "1rem",
        borderRadius: "1rem",
        border: "1px solid rgba(86, 112, 168, 0.45)",
        background: "rgba(10, 17, 33, 0.46)",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "1rem",
          marginBottom: "0.75rem",
          flexWrap: "wrap",
        }}
      >
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            padding: "0.25rem 0.625rem",
            borderRadius: "999px",
            background: "rgba(99, 211, 255, 0.12)",
            color: "var(--color-accent-strong)",
            fontSize: "0.75rem",
            fontWeight: 700,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
          }}
        >
          {item.type}
        </span>
        <small style={{ color: "var(--color-text-muted)" }}>{formatDate(item.createdAt)}</small>
      </div>

      <h3 style={{ margin: "0 0 0.5rem", fontSize: "1.125rem" }}>{item.title}</h3>
      <p style={{ margin: 0, color: "var(--color-text-muted)", lineHeight: 1.6 }}>{item.summary}</p>

      <details style={{ marginTop: "1rem" }}>
        <summary style={{ cursor: "pointer", fontWeight: 600 }}>Show provenance and full content</summary>
        <dl
          style={{
            margin: "0.875rem 0 0",
            display: "grid",
            gridTemplateColumns: "max-content 1fr",
            gap: "0.5rem 0.75rem",
          }}
        >
          <dt style={{ color: "var(--color-text-muted)" }}>Path</dt>
          <dd style={{ margin: 0, wordBreak: "break-word" }}>{item.path}</dd>
          <dt style={{ color: "var(--color-text-muted)" }}>Lineage</dt>
          <dd style={{ margin: 0 }}>
            {item.sourceCount > 0 ? `${item.sourceCount} source document(s)` : "Direct artifact"}
          </dd>
        </dl>
        <pre
          style={{
            margin: "0.875rem 0 0",
            padding: "0.875rem",
            borderRadius: "0.875rem",
            background: "rgba(4, 9, 20, 0.7)",
            overflowX: "auto",
            whiteSpace: "pre-wrap",
            fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
            fontSize: "0.9rem",
            lineHeight: 1.5,
          }}
        >
          {item.body}
        </pre>
      </details>
    </article>
  );
}
