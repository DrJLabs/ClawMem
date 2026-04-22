import { useQuery } from "@tanstack/react-query";
import { useParams } from "react-router-dom";
import { Panel } from "../components/Panel";
import { api } from "../lib/api";

export function RunDetailPage() {
  const params = useParams<{ runId: string }>();
  const runId = params.runId;

  if (!runId) {
    return (
      <Panel title="Run detail" description="No run identifier was provided.">
        <p>Run not found.</p>
      </Panel>
    );
  }

  const runDetail = useQuery({
    queryKey: ["runs", runId],
    queryFn: () => api.getRunDetail(runId),
    refetchInterval: 4000,
  });

  if (runDetail.isPending) {
    return (
      <Panel title="Run detail" description="Loading run detail...">
        <p>Loading run details...</p>
      </Panel>
    );
  }

  if (runDetail.isError) {
    return (
      <Panel title="Run detail" description="The admin runs detail API is currently unavailable.">
        <p>Run detail unavailable.</p>
      </Panel>
    );
  }

  const run = runDetail.data.item;

  return (
    <div className="page">
      <Panel eyebrow={run.source === "job" ? "Admin job" : "Maintenance run"} title={run.label} description="Detailed run information from the admin API.">
        <dl style={{ margin: 0, display: "grid", gridTemplateColumns: "max-content 1fr", gap: "0.75rem 1rem" }}>
          <dt>Status</dt>
          <dd style={{ margin: 0 }}>{run.status}</dd>
          <dt>Source</dt>
          <dd style={{ margin: 0 }}>{run.source === "job" ? "Admin job" : "Maintenance lane run"}</dd>
          <dt>Detail</dt>
          <dd style={{ margin: 0 }}>{run.detail}</dd>
          <dt>Started</dt>
          <dd style={{ margin: 0 }}>{run.startedAt ? new Date(run.startedAt).toLocaleString() : "Unknown"}</dd>
          <dt>Finished</dt>
          <dd style={{ margin: 0 }}>{run.finishedAt ? new Date(run.finishedAt).toLocaleString() : "In progress"}</dd>
        </dl>
      </Panel>
    </div>
  );
}
