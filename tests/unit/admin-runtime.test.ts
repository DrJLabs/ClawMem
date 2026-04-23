import { describe, expect, test } from "bun:test";
import {
  getWatcherSnapshot,
  parseJournalJsonLine,
  parseSystemctlShow,
  queryWatcherLogs,
} from "../../src/admin/runtime.ts";

describe("admin runtime adapters", () => {
  test("parses systemctl show output into a service snapshot", () => {
    const snapshot = parseSystemctlShow([
      "Id=clawmem-watcher.service",
      "ActiveState=active",
      "SubState=running",
      "MainPID=3166023",
      "ExecMainStartTimestamp=Tue 2026-04-22 03:53:43 EDT",
    ].join("\n"));

    expect(snapshot.activeState).toBe("active");
    expect(snapshot.subState).toBe("running");
    expect(snapshot.mainPid).toBe(3166023);
    expect(snapshot.environment).toEqual({});
  });

  test("parses environment variables from systemctl show output", () => {
    const snapshot = parseSystemctlShow([
      "Id=clawmem-watcher.service",
      "ActiveState=active",
      "SubState=running",
      "MainPID=3166023",
      "Environment=CLAWMEM_ENABLE_CONSOLIDATION=true CLAWMEM_HEAVY_LANE=true CLAWMEM_HEAVY_LANE_WINDOW_START=5 CLAWMEM_HEAVY_LANE_WINDOW_END=9",
    ].join("\n"));

    expect(snapshot.environment.CLAWMEM_ENABLE_CONSOLIDATION).toBe("true");
    expect(snapshot.environment.CLAWMEM_HEAVY_LANE).toBe("true");
    expect(snapshot.environment.CLAWMEM_HEAVY_LANE_WINDOW_START).toBe("5");
    expect(snapshot.environment.CLAWMEM_HEAVY_LANE_WINDOW_END).toBe("9");
  });

  test("parses journald JSON lines into structured log entries", () => {
    const entry = parseJournalJsonLine(JSON.stringify({
      __REALTIME_TIMESTAMP: "1776864223000000",
      PRIORITY: "3",
      SYSLOG_IDENTIFIER: "clawmem-host.sh",
      MESSAGE: "[consolidation] Enriched doc 5058",
    }));

    expect(entry.level).toBe("err");
    expect(entry.message).toContain("Enriched doc 5058");
  });

  test("falls back safely for malformed journald lines", () => {
    const entry = parseJournalJsonLine("not-json");

    expect(entry.level).toBe("warn");
    expect(entry.source).toBe("journalctl");
    expect(entry.message).toBe("not-json");
  });

  test("queries watcher logs and filters by priority", async () => {
    let seenInput: any = null;
    const items = await queryWatcherLogs(
      { priority: "warn", limit: 50, since: "1 hour ago" },
      async (input) => {
        seenInput = input;
        return {
          exitCode: 0,
          stdout: [
            JSON.stringify({
            __REALTIME_TIMESTAMP: "1776864223000000",
            PRIORITY: "4",
            SYSLOG_IDENTIFIER: "clawmem-host.sh",
            MESSAGE: "watcher warning",
          }),
          JSON.stringify({
            __REALTIME_TIMESTAMP: "1776864224000000",
            PRIORITY: "6",
            SYSLOG_IDENTIFIER: "clawmem-host.sh",
            MESSAGE: "watcher info",
            }),
          ].join("\n"),
          stderr: "",
        };
      },
    );

    expect(seenInput).toEqual({ priority: "warn", limit: 50, since: "1 hour ago" });
    expect(items).toHaveLength(1);
    expect(items[0]?.level).toBe("warn");
    expect(items[0]?.message).toBe("watcher warning");
  });

  test("returns logs newest first", async () => {
    const items = await queryWatcherLogs(
      { limit: 10 },
      async () => ({
        exitCode: 0,
        stdout: [
          JSON.stringify({
            __REALTIME_TIMESTAMP: "1776864223000000",
            PRIORITY: "6",
            SYSLOG_IDENTIFIER: "clawmem-host.sh",
            MESSAGE: "older message",
          }),
          JSON.stringify({
            __REALTIME_TIMESTAMP: "1776864225000000",
            PRIORITY: "6",
            SYSLOG_IDENTIFIER: "clawmem-host.sh",
            MESSAGE: "newer message",
          }),
        ].join("\n"),
        stderr: "",
      }),
    );

    expect(items.map((item) => item.message)).toEqual(["newer message", "older message"]);
  });

  test("suppresses heavy lane outside_window skip noise", async () => {
    const items = await queryWatcherLogs(
      { limit: 10 },
      async () => ({
        exitCode: 0,
        stdout: [
          JSON.stringify({
            __REALTIME_TIMESTAMP: "1776864223000000",
            PRIORITY: "6",
            SYSLOG_IDENTIFIER: "clawmem-host.sh",
            MESSAGE: "[maintenance] heavy gate skipped outside_window",
          }),
          JSON.stringify({
            __REALTIME_TIMESTAMP: "1776864225000000",
            PRIORITY: "6",
            SYSLOG_IDENTIFIER: "clawmem-host.sh",
            MESSAGE: "newer message",
          }),
        ].join("\n"),
        stderr: "",
      }),
    );

    expect(items.map((item) => item.message)).toEqual(["newer message"]);
  });

  test("returns a warning log entry when journalctl fails", async () => {
    const items = await queryWatcherLogs({}, async () => ({
      exitCode: 1,
      stdout: "",
      stderr: "journalctl unavailable",
    }));

    expect(items).toEqual([
      {
        timestamp: null,
        level: "warn",
        source: "journalctl",
        message: "journalctl unavailable",
      },
    ]);
  });

  test("returns an unavailable snapshot when systemctl fails", async () => {
    const snapshot = await getWatcherSnapshot(async () => ({
      exitCode: 1,
      stdout: "",
      stderr: "Unit clawmem-watcher.service could not be found.",
    }));

    expect(snapshot.activeState).toBe("unavailable");
    expect(snapshot.subState).toBe("failed");
    expect(snapshot.environment).toEqual({});
    expect(snapshot.error).toContain("could not be found");
  });
});
