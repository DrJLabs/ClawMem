import { Panel } from "./Panel";

type StatusCardProps = {
  label: string;
  value: string;
  tone?: "default" | "good" | "warn" | "bad";
  detail?: string;
};

const toneBorderColor: Record<NonNullable<StatusCardProps["tone"]>, string> = {
  default: "var(--color-border)",
  good: "var(--color-accent-strong)",
  warn: "#f3c969",
  bad: "#ff7d7d",
};

export function StatusCard({ label, value, tone = "default", detail }: StatusCardProps) {
  return (
    <Panel>
      <div
        className={`status-card status-card--${tone}`}
        style={{
          borderLeft: `4px solid ${toneBorderColor[tone]}`,
          paddingLeft: "0.75rem",
        }}
      >
        <p
          className="status-card__label"
          style={{
            margin: 0,
            fontSize: "0.75rem",
            fontWeight: 700,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            color: "var(--color-text-muted)",
          }}
        >
          {label}
        </p>
        <p
          className="status-card__value"
          style={{ margin: "0.35rem 0 0", fontSize: "1.35rem", fontWeight: 700 }}
        >
          {value}
        </p>
        {detail ? (
          <p
            className="status-card__detail"
            style={{ margin: "0.5rem 0 0", color: "var(--color-text-muted)" }}
          >
            {detail}
          </p>
        ) : null}
      </div>
    </Panel>
  );
}
