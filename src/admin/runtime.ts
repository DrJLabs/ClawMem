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

function parseEnvironment(value: string | undefined): Record<string, string> {
  if (!value || value.trim().length === 0) return {};

  const tokens: string[] = [];
  let current = "";
  let quote: "'" | "\"" | null = null;
  let escaped = false;

  for (const char of value) {
    if (escaped) {
      current += char;
      escaped = false;
      continue;
    }
    if (char === "\\") {
      escaped = true;
      continue;
    }
    if (quote) {
      if (char === quote) {
        quote = null;
      } else {
        current += char;
      }
      continue;
    }
    if (char === "'" || char === "\"") {
      quote = char;
      continue;
    }
    if (/\s/.test(char)) {
      if (current.length > 0) {
        tokens.push(current);
        current = "";
      }
      continue;
    }
    current += char;
  }

  if (current.length > 0) {
    tokens.push(current);
  }

  return Object.fromEntries(
    tokens
      .map((entry) => {
        const [key, ...rest] = entry.split("=");
        return [key ?? "", rest.join("=")];
      })
      .filter(([key]) => key.length > 0),
  );
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
    environment: parseEnvironment(map.Environment),
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

export type WatcherLogQueryInput = {
  priority?: "err" | "warn" | "info";
  since?: string;
  limit?: number;
};

export type WatcherLogQueryResult = {
  exitCode: number;
  stdout: string;
  stderr: string;
};

export type WatcherLogQueryRunner = (input: WatcherLogQueryInput) => Promise<WatcherLogQueryResult>;

function getPriorityRange(priority?: "err" | "warn" | "info"): string | null {
  if (priority === "err") return "0..3";
  if (priority === "warn") return "4..4";
  if (priority === "info") return "5..7";
  return null;
}

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

function shouldSuppressLog(item: JournalLogEntry): boolean {
  return /outside_window/i.test(item.message) && /skipped/i.test(item.message);
}

async function runWatcherLogQuery(input: WatcherLogQueryInput): Promise<WatcherLogQueryResult> {
  const args = [
    "journalctl",
    "--user",
    "-u",
    "clawmem-watcher.service",
    "--output=json",
    "--no-pager",
    "--reverse",
    "--lines",
    String(input.limit ?? 200),
  ];
  if (input.since) {
    args.push("--since", input.since);
  }
  const priorityRange = getPriorityRange(input.priority);
  if (priorityRange) {
    args.push("--priority", priorityRange);
  }

  const proc = Bun.spawn(args, { stdout: "pipe", stderr: "pipe" });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);

  return { exitCode, stdout, stderr };
}

let watcherLogQueryRunner: WatcherLogQueryRunner = runWatcherLogQuery;

export function setWatcherLogQueryRunnerForTests(runner: WatcherLogQueryRunner): void {
  watcherLogQueryRunner = runner;
}

export function resetWatcherLogQueryRunnerForTests(): void {
  watcherLogQueryRunner = runWatcherLogQuery;
}

export async function queryWatcherLogs(
  input: WatcherLogQueryInput,
  runQuery: WatcherLogQueryRunner = watcherLogQueryRunner,
): Promise<JournalLogEntry[]> {
  const result = await runQuery(input);
  if (result.exitCode !== 0) {
    return [{
      timestamp: null,
      level: "warn",
      source: "journalctl",
      message: result.stderr.trim() || `journalctl exited with code ${result.exitCode}`,
    }];
  }

  const items = result.stdout
    .split("\n")
    .filter(Boolean)
    .map(parseJournalJsonLine)
    .filter((item) => !shouldSuppressLog(item))
    .sort((a, b) => {
      if (a.timestamp === b.timestamp) return 0;
      if (a.timestamp === null) return 1;
      if (b.timestamp === null) return -1;
      return b.timestamp.localeCompare(a.timestamp);
    });

  return input.priority ? items.filter((item) => item.level === input.priority) : items;
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
      environment: {},
      error: result.stderr.trim() || `systemctl exited with code ${result.exitCode}`,
    };
  }

  return parseSystemctlShow(result.stdout);
}
