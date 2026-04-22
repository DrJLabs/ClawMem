import type { Store } from "../store.ts";
import { listCollections } from "../collections.ts";
import { indexCollection } from "../indexer.ts";

type ReindexJobPayload = {
  collection: string | null;
};

function getKnownCollectionConfig(name: string) {
  return listCollections().find((collection) => collection.name === name) ?? null;
}

export function recoverPendingAdminJobs(store: Store): void {
  const pending = store.db.prepare(`
    SELECT id
    FROM admin_jobs
    WHERE status IN ('queued', 'running')
  `).all() as Array<{ id: number }>;

  const finishedAt = new Date().toISOString();
  for (const job of pending) {
    store.updateAdminJob(job.id, {
      status: "failed",
      finished_at: finishedAt,
      error_text: "Interrupted by server restart before completion",
    });
  }
}

export async function queueReindexJob(store: Store, collection?: string) {
  const payload: ReindexJobPayload = {
    collection: collection ?? null,
  };

  const jobId = store.createAdminJob({
    kind: "reindex",
    requested_by: "operator-console",
    payload_json: JSON.stringify(payload),
  });

  setTimeout(() => {
    void (async () => {
      try {
        store.updateAdminJob(jobId, {
          status: "running",
          started_at: new Date().toISOString(),
          error_text: null,
        });

        const configuredCollections = collection
          ? [getKnownCollectionConfig(collection)].filter((row): row is NonNullable<typeof row> => row !== null)
          : listCollections();

        if (configuredCollections.length === 0) {
          throw new Error(
            collection
              ? `Collection not configured for reindex: ${collection}`
              : "No configured collections available for reindex",
          );
        }

        let added = 0;
        let updated = 0;
        let removed = 0;

        for (const row of configuredCollections) {
          const stats = await indexCollection(store, row.name, row.path, row.pattern);
          added += stats.added;
          updated += stats.updated;
          removed += stats.removed;
        }

        store.updateAdminJob(jobId, {
          status: "completed",
          finished_at: new Date().toISOString(),
          result_json: JSON.stringify({ added, updated, removed }),
          error_text: null,
        });
      } catch (error: unknown) {
        store.updateAdminJob(jobId, {
          status: "failed",
          finished_at: new Date().toISOString(),
          error_text: error instanceof Error ? error.message : String(error),
        });
      }
    })();
  }, 0);

  return store.getAdminJob(jobId);
}
