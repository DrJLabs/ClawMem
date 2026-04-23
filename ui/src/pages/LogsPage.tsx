import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { LogList } from "../components/LogList";
import { Panel } from "../components/Panel";
import { api } from "../lib/api";
import type { JournalLogLevel } from "../lib/types";

type LevelFilter = JournalLogLevel | "";

const levelOptions: Array<{ value: LevelFilter; label: string }> = [
  { value: "", label: "All" },
  { value: "err", label: "Errors" },
  { value: "warn", label: "Warnings" },
  { value: "info", label: "Info" },
];

export function LogsPage() {
  const [level, setLevel] = useState<LevelFilter>("");

  const params = useMemo(() => {
    const search = new URLSearchParams({ limit: "200" });
    if (level) {
      search.set("level", level);
    }
    return search;
  }, [level]);

  const logs = useQuery({
    queryKey: ["logs", level],
    queryFn: () => api.getLogs(params),
    refetchInterval: 5000,
  });

  return (
    <div className="page">
      <Panel
        eyebrow="Watcher journald"
        title="Logs"
        description="Tail recent watcher output without leaving the mobile console."
        actions={<Link to="/more">Back</Link>}
      >
        <div className="page-header">
          <div className="chip-row" role="tablist" aria-label="Log level filters">
            {levelOptions.map((option) => (
              <button
                key={option.label}
                type="button"
                className={option.value === level ? "chip chip--active" : "chip"}
                onClick={() => setLevel(option.value)}
              >
                {option.label}
              </button>
            ))}
          </div>
          <p className="page-header__summary">
            {logs.isRefetching ? "Refreshing log stream…" : "Polling every 5 seconds."}
          </p>
        </div>

        {logs.isPending ? <p>Loading logs…</p> : null}
        {logs.isError ? <p>Watcher logs are unavailable right now.</p> : null}
        {logs.data ? <LogList items={logs.data.items} /> : null}
      </Panel>
    </div>
  );
}
