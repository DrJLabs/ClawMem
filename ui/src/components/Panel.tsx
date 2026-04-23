import type { ReactNode } from "react";

type PanelProps = {
  title?: string;
  eyebrow?: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
};

export function Panel({ title, eyebrow, description, actions, children }: PanelProps) {
  return (
    <section
      className="placeholder-page panel"
      aria-label={title}
      style={{ marginBottom: "1rem" }}
    >
      {eyebrow ? <p className="placeholder-page__eyebrow">{eyebrow}</p> : null}
      {title || description || actions ? (
        <header
          style={{
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            gap: "1rem",
            marginBottom: "0.75rem",
          }}
        >
          <div>
            {title ? <h2 style={{ margin: 0 }}>{title}</h2> : null}
            {description ? (
              <p style={{ margin: title ? "0.5rem 0 0" : 0, color: "var(--color-text-muted)" }}>
                {description}
              </p>
            ) : null}
          </div>
          {actions ? <div>{actions}</div> : null}
        </header>
      ) : null}
      <div>{children}</div>
    </section>
  );
}
