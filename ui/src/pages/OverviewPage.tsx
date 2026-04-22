import { useQuery } from "@tanstack/react-query";
import { StatusCard } from "../components/StatusCard";
import { Panel } from "../components/Panel";
import { api } from "../lib/api";

function toneForState(state: string): "good" | "warn" | "bad" {
  if (state === "healthy") return "good";
  if (state === "unavailable") return "bad";
  return "warn";
}

export function OverviewPage() {
  const overview = useQuery({
    queryKey: ["overview"],
    queryFn: api.getOverview,
    refetchInterval: 4000,
  });

  if (overview.isPending) {
    return (
      <Panel title="Overview" description="Loading operator summary...">
        <p>Loading operator summary...</p>
      </Panel>
    );
  }

  if (overview.isError) {
    return (
      <Panel title="Overview" description="The admin overview API did not return a usable payload.">
        <p>Overview unavailable. Use Refresh to retry.</p>
      </Panel>
    );
  }

  const data = overview.data;
  const refreshLabel = overview.isRefetching ? "Refreshing..." : "Refresh";

  return (
    <div className="page">
      <Panel
        eyebrow="Live state"
        title="Overview"
        description={`Last checked ${new Date(data.checkedAt).toLocaleString()}`}
        actions={
          <button type="button" onClick={() => void overview.refetch()} disabled={overview.isRefetching}>
            {refreshLabel}
          </button>
        }
      >
        <p style={{ margin: 0, color: "var(--color-text-muted)" }}>
          Service health, backlog pressure, and operator-visible work are polled from the current
          `/admin/overview` snapshot.
        </p>
      </Panel>

      <div
        className="status-grid"
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          gap: "1rem",
        }}
      >
        <StatusCard
          label="Watcher"
          value={data.health.service.message}
          tone={toneForState(data.health.service.state)}
          detail={`API: ${data.health.api.message}`}
        />
        <StatusCard
          label="Embedding backlog"
          value={`${data.backlog.needsEmbedding}`}
          detail={`${data.backlog.totalDocuments} total documents`}
          tone={data.backlog.needsEmbedding > 0 ? "warn" : "good"}
        />
        <StatusCard
          label="Light lane"
          value={data.lanes.light.latestRunStatus ?? "unknown"}
          detail={data.lanes.light.enabled ? "Enabled" : "Disabled"}
          tone={data.lanes.light.latestRunStatus === "completed" ? "good" : "default"}
        />
        <StatusCard
          label="Heavy lane"
          value={data.lanes.heavy.latestRunStatus ?? "unknown"}
          detail={data.lanes.heavy.enabled ? data.lanes.heavy.window ?? "Enabled" : "Disabled"}
          tone={data.lanes.heavy.enabled ? "default" : "warn"}
        />
      </div>

      <Panel title="Active jobs" description="Queued or running admin jobs visible from the overview feed.">
        {data.activeJobs.length === 0 ? (
          <p>No active jobs.</p>
        ) : (
          <ul style={{ margin: 0, paddingLeft: "1rem" }}>
            {data.activeJobs.map((job) => (
              <li key={job.id}>
                #{job.id} {job.kind} · {job.status}
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Panel title="Alerts" description="Recent operator-facing warnings surfaced by the backend runtime snapshot.">
        {data.alerts.length === 0 ? (
          <p>No active alerts.</p>
        ) : (
          <ul style={{ margin: 0, paddingLeft: "1rem" }}>
            {data.alerts.map((alert) => (
              <li key={alert.id}>{alert.message}</li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}
