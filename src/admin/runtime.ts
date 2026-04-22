import type { JournalLogEntry, WatcherSnapshot } from "./types.ts";

function parseSystemctlMap(raw: string): Record<string, string> {
  return Object.fromEntries(
    raw
      .split("\n")
      .filter(Boolean)
      .map((line) => {
        const [key, ...rest] = line.split("=");
        return [key ?? "", rest.join("=")];
      })
      .filter(([key]) => key.length > 0),
  );
}

function parsePid(value: string | undefined): number | null {
  if (!value || value === "0") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function microsToIso(value: unknown): string | null {
  if (typeof value !== "string" || value.length === 0) return null;
  const micros = Number(value);
  if (!Number.isFinite(micros)) return null;
  return new Date(Math.floor(micros / 1000)).toISOString();
}

export function parseSystemctlShow(raw: string): WatcherSnapshot {
  const map = parseSystemctlMap(raw);
  return {
    id: map.Id ?? "",
    activeState: map.ActiveState ?? "unknown",
    subState: map.SubState ?? "unknown",
    mainPid: parsePid(map.MainPID),
    startedAt: map.ExecMainStartTimestamp ?? null,
    error: null,
  };
}

export function parseJournalJsonLine(line: string): JournalLogEntry {
  let row: Record<string, unknown>;
  try {
    row = JSON.parse(line) as Record<string, unknown>;
  } catch {
    return {
      timestamp: null,
      level: "warn",
      source: "journalctl",
      message: line,
    };
  }
  const priority = Number(row.PRIORITY ?? 6);

  return {
    timestamp: microsToIso(row.__REALTIME_TIMESTAMP),
    level: priority <= 3 ? "err" : priority === 4 ? "warn" : "info",
    source: typeof row.SYSLOG_IDENTIFIER === "string" ? row.SYSLOG_IDENTIFIER : "unknown",
    message: typeof row.MESSAGE === "string" ? row.MESSAGE : "",
  };
}

export type WatcherCommandResult = {
  exitCode: number;
  stdout: string;
  stderr: string;
};

export type WatcherCommandRunner = () => Promise<WatcherCommandResult>;

async function runSystemctlWatcherShow(): Promise<WatcherCommandResult> {
  const proc = Bun.spawn(["systemctl", "--user", "show", "clawmem-watcher.service"], {
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  return { exitCode, stdout, stderr };
}

export async function getWatcherSnapshot(
  runCommand: WatcherCommandRunner = runSystemctlWatcherShow,
): Promise<WatcherSnapshot> {
  const result = await runCommand();
  if (result.exitCode !== 0) {
    return {
      id: "clawmem-watcher.service",
      activeState: "unavailable",
      subState: "failed",
      mainPid: null,
      startedAt: null,
      error: result.stderr.trim() || `systemctl exited with code ${result.exitCode}`,
    };
  }

  return parseSystemctlShow(result.stdout);
}
