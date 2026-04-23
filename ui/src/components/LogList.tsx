import type { JournalLogItem } from "../lib/types";

type LogListProps = {
  items: JournalLogItem[];
  emptyMessage?: string;
};

export function LogList({ items, emptyMessage = "No log entries matched the current filter." }: LogListProps) {
  if (items.length === 0) {
    return <p className="log-list__empty">{emptyMessage}</p>;
  }

  return (
    <ul className="log-list" aria-label="Watcher logs">
      {items.map((item, index) => (
        <li key={`${item.timestamp ?? "unknown"}-${index}`} className={`log-list__item log-list__item--${item.level}`}>
          <div className="log-list__meta">
            <strong>{item.source}</strong>
            <span>{item.timestamp ? new Date(item.timestamp).toLocaleString() : "Timestamp unavailable"}</span>
          </div>
          <p>{item.message}</p>
        </li>
      ))}
    </ul>
  );
}
