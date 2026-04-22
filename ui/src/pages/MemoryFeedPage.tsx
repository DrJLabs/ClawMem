import { useQuery } from "@tanstack/react-query";
import { FeedCard } from "../components/FeedCard";
import { Panel } from "../components/Panel";
import { api } from "../lib/api";

export function MemoryFeedPage() {
  const feed = useQuery({
    queryKey: ["memory-feed"],
    queryFn: api.getMemoryFeed,
    refetchInterval: 7000,
  });

  if (feed.isPending) {
    return (
      <Panel title="Memory feed" description="Loading recent extracted artifacts from /admin/memory-feed.">
        <p>Loading memory feed...</p>
      </Panel>
    );
  }

  if (feed.isError) {
    return (
      <Panel title="Memory feed" description="The memory feed payload could not be loaded from the admin API.">
        <p>Memory feed unavailable. Existing operator pages remain usable.</p>
      </Panel>
    );
  }

  const refreshLabel = feed.isRefetching ? "Refreshing..." : "Refresh";

  return (
    <div className="page">
      <Panel
        eyebrow="Recent artifacts"
        title="Memory feed"
        description="Live _clawmem documents surfaced from the admin feed endpoint."
        actions={(
          <button type="button" onClick={() => void feed.refetch()} disabled={feed.isRefetching}>
            {refreshLabel}
          </button>
        )}
      >
        {feed.data.items.length === 0 ? (
          <p>No memory artifacts are available from the current feed.</p>
        ) : (
          <div style={{ display: "grid", gap: "1rem" }}>
            {feed.data.items.map((item) => (
              <FeedCard key={item.documentId} item={item} />
            ))}
          </div>
        )}
      </Panel>
    </div>
  );
}
