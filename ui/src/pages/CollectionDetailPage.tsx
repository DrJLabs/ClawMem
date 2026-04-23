import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Panel } from "../components/Panel";
import { api } from "../lib/api";

export function CollectionDetailPage() {
  const { collectionId } = useParams<{ collectionId: string }>();
  const decodedCollectionId = collectionId ?? null;
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const collection = useQuery({
    queryKey: ["collections", decodedCollectionId],
    queryFn: () => api.getCollection(decodedCollectionId!),
    enabled: decodedCollectionId !== null,
    refetchInterval: 15000,
  });

  const updateCollection = useMutation({
    mutationFn: (body: { path: string; pattern: string }) =>
      api.updateCollection(decodedCollectionId!, body),
    onSuccess: async (result) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["collections"] }),
        queryClient.setQueryData(["collections", decodedCollectionId], result),
      ]);
    },
  });

  const deleteCollection = useMutation({
    mutationFn: () => api.deleteCollection(decodedCollectionId!),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["collections"] });
      navigate("/collections");
    },
  });

  const queueReindex = useMutation({
    mutationFn: () => api.queueReindex({ collection: decodedCollectionId }),
  });

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!decodedCollectionId) return;
    const formData = new FormData(event.currentTarget);
    const nextRoot = String(formData.get("root") ?? "").trim();
    const nextPattern = String(formData.get("pattern") ?? "").trim();
    updateCollection.mutate({
      path: nextRoot,
      pattern: nextPattern,
    });
  }

  if (!decodedCollectionId) {
    return (
      <Panel title="Collection detail" description="No collection identifier was provided.">
        <p>Collection not found.</p>
      </Panel>
    );
  }

  if (collection.isPending) {
    return (
      <Panel title="Collection detail" description="Loading collection details from the admin API.">
        <p>Loading collection...</p>
      </Panel>
    );
  }

  if (collection.isError) {
    return (
      <Panel title="Collection detail" description="The selected collection could not be loaded from the admin API.">
        <p>Collection unavailable.</p>
      </Panel>
    );
  }

  const item = collection.data.item;

  return (
    <div className="page">
      <Panel
        eyebrow="Collection detail"
        title={item.name}
        description="Edit the configured root and pattern, inspect indexing coverage, or queue a reindex run."
        actions={<Link to="/collections">Back to collections</Link>}
      >
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
            gap: "0.75rem",
            marginBottom: "1rem",
          }}
        >
          <Metric label="Documents" value={`${item.documents}`} />
          <Metric label="Embedded" value={`${item.embeddedDocuments}`} />
          <Metric label="Needs embedding" value={`${item.unembeddedDocuments}`} />
          <Metric label="Last activity" value={item.lastActivity ? new Date(item.lastActivity).toLocaleString() : "No activity"} />
        </div>

        <form onSubmit={handleSubmit} style={{ display: "grid", gap: "0.75rem", marginBottom: "1rem" }}>
          <label style={{ display: "grid", gap: "0.35rem" }}>
            <span style={{ color: "var(--color-text-muted)", fontSize: "0.875rem" }}>Root path</span>
            <input name="root" defaultValue={item.root} />
          </label>
          <label style={{ display: "grid", gap: "0.35rem" }}>
            <span style={{ color: "var(--color-text-muted)", fontSize: "0.875rem" }}>Pattern</span>
            <input name="pattern" defaultValue={item.pattern} />
          </label>
          <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
            <button type="submit" disabled={updateCollection.isPending}>
              {updateCollection.isPending ? "Saving..." : "Save changes"}
            </button>
            <button type="button" onClick={() => queueReindex.mutate()} disabled={queueReindex.isPending}>
              {queueReindex.isPending ? "Queueing..." : "Queue reindex"}
            </button>
            <button
              type="button"
              onClick={() => {
                if (typeof window !== "undefined" && !window.confirm(`Remove collection "${item.name}"?`)) {
                  return;
                }
                deleteCollection.mutate();
              }}
              disabled={deleteCollection.isPending}
            >
              {deleteCollection.isPending ? "Removing..." : "Remove collection"}
            </button>
          </div>
        </form>

        {updateCollection.isSuccess ? <p>Collection settings saved.</p> : null}
        {updateCollection.isError ? <p>Collection update failed.</p> : null}
        {queueReindex.isSuccess ? <p>Reindex job queued.</p> : null}
        {queueReindex.isError ? <p>Reindex request failed.</p> : null}
        {deleteCollection.isError ? <p>Collection removal failed.</p> : null}

        {item.updateCommand ? (
          <p style={{ color: "var(--color-text-muted)" }}>
            Collection update command: <code>{item.updateCommand}</code>
          </p>
        ) : null}
      </Panel>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        padding: "0.875rem",
        borderRadius: "0.875rem",
        border: "1px solid rgba(86, 112, 168, 0.35)",
        background: "rgba(10, 17, 33, 0.38)",
      }}
    >
      <div style={{ color: "var(--color-text-muted)", fontSize: "0.75rem", textTransform: "uppercase" }}>{label}</div>
      <div style={{ marginTop: "0.35rem", lineHeight: 1.45 }}>{value}</div>
    </div>
  );
}
