import { useQuery } from "@tanstack/react-query";
import { Panel } from "../components/Panel";
import { RunList } from "../components/RunList";
import { api } from "../lib/api";

export function RunsPage() {
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
      <Panel eyebrow="Recent activity" title="Runs" description="Recent operator jobs and maintenance runs from the admin API.">
        <RunList items={runs.data.items} emptyMessage="No runs are available from the admin API." />
      </Panel>
    </div>
  );
}
