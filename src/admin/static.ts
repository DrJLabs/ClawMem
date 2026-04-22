import { existsSync } from "fs";
import { basename, join, normalize } from "path";

function getConsoleDistDir(): string {
  return process.env.CLAWMEM_CONSOLE_DIST_DIR || join(import.meta.dir, "..", "..", "ui", "dist");
}

function isConsolePath(pathname: string): boolean {
  return pathname === "/console" || pathname.startsWith("/console/");
}

function getConsoleAssetPath(pathname: string, consoleDistDir: string): string | null {
  if (pathname === "/console") {
    return null;
  }

  const relative = pathname.replace(/^\/console\/?/, "");
  if (!relative) {
    return null;
  }

  const normalized = normalize(relative).replace(/^(\.\.(\/|\\|$))+/, "");
  if (!normalized || normalized.startsWith("..")) {
    return null;
  }

  return join(consoleDistDir, normalized);
}

export function serveConsoleAsset(pathname: string): Response | null {
  if (!isConsolePath(pathname)) {
    return null;
  }

  const consoleDistDir = getConsoleDistDir();
  if (!existsSync(consoleDistDir)) {
    return null;
  }

  const indexPath = join(consoleDistDir, "index.html");
  if (!existsSync(indexPath)) {
    return null;
  }

  const assetPath = getConsoleAssetPath(pathname, consoleDistDir);
  if (assetPath && existsSync(assetPath)) {
    return new Response(Bun.file(assetPath));
  }

  if (assetPath && basename(assetPath).includes(".")) {
    return null;
  }

  // For SPA routes and /console itself, fall back to the built entrypoint.
  return new Response(Bun.file(indexPath), {
    headers: basename(indexPath) === "index.html"
      ? { "Content-Type": "text/html; charset=utf-8" }
      : undefined,
  });
}
