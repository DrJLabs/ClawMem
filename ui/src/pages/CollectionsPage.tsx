import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { CollectionCard } from "../components/CollectionCard";
import { Panel } from "../components/Panel";
import { api } from "../lib/api";

export function CollectionsPage() {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    name: "",
    path: "",
    pattern: "**/*.md",
  });

  const collections = useQuery({
    queryKey: ["collections"],
    queryFn: api.getCollections,
    refetchInterval: 15000,
  });

  const createCollection = useMutation({
    mutationFn: api.createCollection,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["collections"] });
      setForm({ name: "", path: "", pattern: "**/*.md" });
    },
  });

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!form.name.trim() || !form.path.trim()) return;
    createCollection.mutate({
      name: form.name.trim(),
      path: form.path.trim(),
      pattern: form.pattern.trim() || "**/*.md",
    });
  }

  if (collections.isPending) {
    return (
      <Panel title="Collections" description="Loading indexed collection configuration from the admin API.">
        <p>Loading collections...</p>
      </Panel>
    );
  }

  if (collections.isError) {
    return (
      <Panel title="Collections" description="The collections payload could not be loaded from the admin API.">
        <p>Collections unavailable.</p>
      </Panel>
    );
  }

  const totals = collections.data.items.reduce(
    (acc, item) => {
      acc.documents += item.documents;
      acc.unembedded += item.unembeddedDocuments;
      return acc;
    },
    { documents: 0, unembedded: 0 },
  );

  return (
    <div className="page">
      <Panel
        eyebrow="Index control plane"
        title="Collections"
        description={`${collections.data.items.length} configured collection(s), ${totals.documents} active docs, ${totals.unembedded} docs waiting on embeddings.`}
      >
        <form
          onSubmit={handleSubmit}
          style={{
            display: "grid",
            gap: "0.75rem",
            gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
            marginBottom: "1rem",
          }}
        >
          <label style={{ display: "grid", gap: "0.35rem" }}>
            <span style={{ color: "var(--color-text-muted)", fontSize: "0.875rem" }}>Name</span>
            <input
              value={form.name}
              onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
            />
          </label>
          <label style={{ display: "grid", gap: "0.35rem" }}>
            <span style={{ color: "var(--color-text-muted)", fontSize: "0.875rem" }}>Root path</span>
            <input
              value={form.path}
              onChange={(event) => setForm((current) => ({ ...current, path: event.target.value }))}
            />
          </label>
          <label style={{ display: "grid", gap: "0.35rem" }}>
            <span style={{ color: "var(--color-text-muted)", fontSize: "0.875rem" }}>Pattern</span>
            <input
              value={form.pattern}
              onChange={(event) => setForm((current) => ({ ...current, pattern: event.target.value }))}
            />
          </label>
          <div style={{ display: "flex", alignItems: "end" }}>
            <button type="submit" disabled={createCollection.isPending}>
              {createCollection.isPending ? "Creating..." : "Add collection"}
            </button>
          </div>
        </form>

        {createCollection.isError ? (
          <p style={{ margin: "0 0 1rem", color: "#ffb4b4" }}>
            Failed to create collection. Check the submitted path and name.
          </p>
        ) : null}

        {collections.data.items.length === 0 ? (
          <p>No collections are configured yet.</p>
        ) : (
          <div style={{ display: "grid", gap: "1rem" }}>
            {collections.data.items.map((collection) => (
              <CollectionCard key={collection.id} item={collection} />
            ))}
          </div>
        )}
      </Panel>
    </div>
  );
}
