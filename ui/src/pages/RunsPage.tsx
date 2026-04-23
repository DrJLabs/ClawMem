import { useQuery } from "@tanstack/react-query";
import { Panel } from "../components/Panel";
import { RunList } from "../components/RunList";
import { StatusCard } from "../components/StatusCard";
import { api } from "../lib/api";

export function RunsPage() {
  const overview = useQuery({
    queryKey: ["overview"],
    queryFn: api.getOverview,
    refetchInterval: 4000,
  });

  const runs = useQuery({
    queryKey: ["runs"],
    queryFn: api.getRuns,
    refetchInterval: 4000,
  });

  if (runs.isPending) {
    return (
      <Panel title="Runs" description="Loading current run history...">
        <p>Loading runs...</p>
      </Panel>
    );
  }

  if (runs.isError) {
    return (
      <Panel title="Runs" description="The admin runs API did not return a usable payload.">
        <p>Run history unavailable.</p>
      </Panel>
    );
  }

  return (
    <div className="page">
      {overview.data ? (
        <Panel eyebrow="Current lane state" title="Lane snapshots" description="Watcher-hosted lane state from the live overview API.">
          <div
            className="status-grid"
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
              gap: "1rem",
            }}
          >
            <StatusCard
              label="Light lane"
              value={overview.data.lanes.light.latestRunStatus ?? "unknown"}
              detail={overview.data.lanes.light.enabled ? "Enabled" : "Disabled"}
              tone={overview.data.lanes.light.enabled ? "good" : "warn"}
            />
            <StatusCard
              label="Heavy lane"
              value={overview.data.lanes.heavy.latestRunStatus ?? "unknown"}
              detail={overview.data.lanes.heavy.enabled ? overview.data.lanes.heavy.window ?? "Enabled" : "Disabled"}
              tone={overview.data.lanes.heavy.enabled ? "default" : "warn"}
            />
          </div>
        </Panel>
      ) : null}

      <Panel eyebrow="Recent activity" title="Runs" description="Recent operator jobs and maintenance runs from the admin API.">
        <RunList items={runs.data.items} emptyMessage="No runs are available from the admin API." />
      </Panel>
    </div>
  );
}
