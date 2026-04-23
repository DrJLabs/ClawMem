import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ActionSheet } from "../components/ActionSheet";
import { Panel } from "../components/Panel";
import { api } from "../lib/api";

type DocumentAction = "pin" | "unpin" | "snooze" | "unsnooze" | "forget";

export function AdminPage() {
  const queryClient = useQueryClient();
  const [docid, setDocid] = useState("");
  const [snoozeUntil, setSnoozeUntil] = useState("");
  const [forgetConfirmation, setForgetConfirmation] = useState("");
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const refreshAdminQueries = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["overview"] }),
      queryClient.invalidateQueries({ queryKey: ["runs"] }),
      queryClient.invalidateQueries({ queryKey: ["collections"] }),
      queryClient.invalidateQueries({ queryKey: ["logs"] }),
    ]);
  };

  const reindexAll = useMutation({
    mutationFn: () => api.queueReindex({ collection: null }),
    onSuccess: async () => {
      setStatusMessage("Queued a full reindex for all configured collections.");
      await refreshAdminQueries();
    },
  });

  const previewSweep = useMutation({
    mutationFn: () => api.lifecycleSweep({ dry_run: true }),
    onSuccess: (result) => {
      setStatusMessage(`Lifecycle preview found ${result.candidates ?? result.documents?.length ?? 0} candidate documents.`);
    },
  });

  const restoreArchived = useMutation({
    mutationFn: () => api.lifecycleRestore({}),
    onSuccess: async (result) => {
      setStatusMessage(`Restored ${result.restored} archived document(s).`);
      await refreshAdminQueries();
    },
  });

  const executeSweep = useMutation({
    mutationFn: () => api.lifecycleSweep({ dry_run: false, confirm: "ARCHIVE" }),
    onSuccess: async (result) => {
      setStatusMessage(`Archived ${result.archived ?? 0} stale document(s).`);
      await refreshAdminQueries();
    },
  });

  const documentMutation = useMutation({
    mutationFn: async (input: { action: DocumentAction; docid: string; until?: string }) => {
      switch (input.action) {
        case "pin":
          return api.pinDocument(input.docid, {});
        case "unpin":
          return api.pinDocument(input.docid, { unpin: true });
        case "snooze":
          return api.snoozeDocument(input.docid, input.until ? { until: input.until } : {});
        case "unsnooze":
          return api.snoozeDocument(input.docid, { unsnooze: true });
        case "forget":
          return api.forgetDocument(input.docid, { confirm: "FORGET" });
      }
    },
    onSuccess: async (_result, variables) => {
      const messages: Record<DocumentAction, string> = {
        pin: `Pinned ${variables.docid}.`,
        unpin: `Unpinned ${variables.docid}.`,
        snooze: `Snoozed ${variables.docid}.`,
        unsnooze: `Removed snooze for ${variables.docid}.`,
        forget: `Forgot ${variables.docid}.`,
      };
      setStatusMessage(messages[variables.action]);
      if (variables.action === "forget") {
        setDocid("");
        setForgetConfirmation("");
      }
      await refreshAdminQueries();
    },
  });

  const isBusy = reindexAll.isPending || previewSweep.isPending || restoreArchived.isPending || executeSweep.isPending || documentMutation.isPending;
  const currentDocid = useMemo(() => docid.trim(), [docid]);

  function confirmAction(message: string): boolean {
    return typeof window === "undefined" ? true : window.confirm(message);
  }

  function runDocumentAction(action: DocumentAction) {
    if (!currentDocid) {
      setStatusMessage("Enter a document id before running a document action.");
      return;
    }

    if (action === "forget") {
      if (forgetConfirmation.trim().toUpperCase() !== "FORGET") {
        setStatusMessage("Type FORGET before deactivating a document.");
        return;
      }
      if (!confirmAction(`Forget document ${currentDocid}? This deactivates it immediately.`)) {
        return;
      }
    }

    documentMutation.mutate({
      action,
      docid: currentDocid,
      until: snoozeUntil.trim() || undefined,
    });
  }

  return (
    <div className="page">
      <Panel
        eyebrow="Operator controls"
        title="More"
        description="Bundle lower-frequency controls behind one mobile-safe surface."
      >
        <div className="page-header page-header--compact">
          <div className="button-row">
            <Link className="button button--secondary" to="/more/logs">Open logs</Link>
            <Link className="button button--secondary" to="/collections">Collections</Link>
          </div>
          <p className="page-header__summary">Logs, admin actions, and destructive mutations live here instead of the primary tabs.</p>
        </div>

        <ActionSheet
          title="Maintenance"
          description="Trackable actions that should stay inside the admin namespace."
        >
          <div className="button-row">
            <button type="button" className="button" disabled={reindexAll.isPending} onClick={() => reindexAll.mutate()}>
              {reindexAll.isPending ? "Queueing…" : "Queue full reindex"}
            </button>
            <button type="button" className="button button--secondary" disabled={previewSweep.isPending} onClick={() => previewSweep.mutate()}>
              {previewSweep.isPending ? "Previewing…" : "Preview lifecycle sweep"}
            </button>
            <button type="button" className="button button--secondary" disabled={restoreArchived.isPending} onClick={() => restoreArchived.mutate()}>
              {restoreArchived.isPending ? "Restoring…" : "Restore archived docs"}
            </button>
          </div>
        </ActionSheet>

        <ActionSheet
          title="Document actions"
          description="Use a known docid to pin, snooze, or reverse a lifecycle mutation without leaving the console."
        >
          <div className="stack">
            <label className="field">
              <span>Document id</span>
              <input
                className="input"
                value={docid}
                onChange={(event) => setDocid(event.target.value)}
                placeholder="e.g. a1b2c3"
                autoCapitalize="off"
                autoCorrect="off"
              />
            </label>
            <label className="field">
              <span>Snooze until (optional ISO timestamp)</span>
              <input
                className="input"
                value={snoozeUntil}
                onChange={(event) => setSnoozeUntil(event.target.value)}
                placeholder="2026-05-01T00:00:00.000Z"
                autoCapitalize="off"
                autoCorrect="off"
              />
            </label>
            <div className="button-row">
              <button type="button" className="button button--secondary" disabled={documentMutation.isPending} onClick={() => runDocumentAction("pin")}>
                Pin
              </button>
              <button type="button" className="button button--secondary" disabled={documentMutation.isPending} onClick={() => runDocumentAction("unpin")}>
                Unpin
              </button>
              <button type="button" className="button button--secondary" disabled={documentMutation.isPending} onClick={() => runDocumentAction("snooze")}>
                Snooze
              </button>
              <button type="button" className="button button--secondary" disabled={documentMutation.isPending} onClick={() => runDocumentAction("unsnooze")}>
                Unsnooze
              </button>
            </div>
          </div>
        </ActionSheet>

        <ActionSheet
          title="Danger zone"
          tone="danger"
          description="These actions archive or deactivate content. They always require an explicit confirmation."
        >
          <div className="stack">
            <p className="danger-copy">Use these only when you are intentionally changing live retrieval behavior.</p>
            <label className="field">
              <span>Type FORGET to enable document deactivation</span>
              <input
                className="input"
                value={forgetConfirmation}
                onChange={(event) => setForgetConfirmation(event.target.value)}
                placeholder="FORGET"
                autoCapitalize="characters"
                autoCorrect="off"
              />
            </label>
            <div className="button-row">
              <button
                type="button"
                className="button button--danger"
                disabled={executeSweep.isPending}
                onClick={() => {
                  if (confirmAction("Archive stale documents now? This is not a dry run.")) {
                    executeSweep.mutate();
                  }
                }}
              >
                {executeSweep.isPending ? "Archiving…" : "Run lifecycle sweep"}
              </button>
              <button
                type="button"
                className="button button--danger"
                disabled={documentMutation.isPending || forgetConfirmation.trim().toUpperCase() !== "FORGET"}
                onClick={() => runDocumentAction("forget")}
              >
                {documentMutation.isPending ? "Applying…" : "Forget docid"}
              </button>
            </div>
          </div>
        </ActionSheet>

        {statusMessage ? <p className="status-note">{statusMessage}</p> : null}
        {(reindexAll.isError || previewSweep.isError || restoreArchived.isError || executeSweep.isError || documentMutation.isError) ? (
          <p className="status-note status-note--error">
            One of the admin actions failed. Check the selected docid or retry when the backend is healthy.
          </p>
        ) : null}
        {isBusy ? <p className="page-header__summary">Applying changes…</p> : null}
      </Panel>
    </div>
  );
}
