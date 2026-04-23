# ClawMem REST API reference

HTTP REST API for non-MCP clients, web dashboards, cross-machine access, and **OpenClaw agent tools**. Required for OpenClaw integration — the memory plugin serves 5 agent tools (search, get, session_log, timeline, similar) via this API. See the [OpenClaw plugin guide](../guides/openclaw-plugin.md) for details.

## Start the server

```bash
./bin/clawmem serve                          # localhost:7438, no auth
./bin/clawmem serve --port 8080              # custom port
CLAWMEM_API_TOKEN=secret ./bin/clawmem serve # with bearer token auth
```

## Authentication

Set `CLAWMEM_API_TOKEN` to require `Authorization: Bearer <token>` on all requests. If unset, access is open (localhost-only by default).

## Endpoints

### Health & stats

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Liveness probe — returns status, version, doc count |
| GET | `/stats` | Full index statistics with collection list |

### Search & retrieval

| Method | Path | Description |
|--------|------|-------------|
| POST | `/search` | Direct search with mode selection |
| POST | `/retrieve` | Smart retrieve with auto-routing |

**POST /search**

```json
{
  "query": "authentication decisions",
  "mode": "hybrid",
  "collection": "notes",
  "compact": true,
  "limit": 10
}
```

Modes: `auto`, `keyword`, `semantic`, `hybrid`.

**POST /retrieve**

```json
{
  "query": "why did we choose JWT",
  "mode": "auto",
  "compact": true,
  "limit": 10
}
```

Modes: `auto`, `keyword`, `semantic`, `causal`, `timeline`, `hybrid`.

Auto-routing classifies the query:
- Causal queries → intent-aware RRF (boosts vector for WHY, BM25 for WHEN)
- Timeline queries → session history
- Short keyword queries → BM25
- Conceptual queries → vector
- Everything else → hybrid

```bash
# Example: causal query
curl -X POST http://localhost:7438/retrieve \
  -H 'Content-Type: application/json' \
  -d '{"query": "why did we switch to JWT", "compact": true}'

# Example: keyword search
curl -X POST http://localhost:7438/search \
  -H 'Content-Type: application/json' \
  -d '{"query": "CLAWMEM_EMBED_URL", "mode": "keyword"}'
```

### Documents

| Method | Path | Description |
|--------|------|-------------|
| GET | `/documents/:docid` | Single document by 6-char hash prefix |
| GET | `/documents?pattern=...` | Multi-get by glob pattern |

```bash
curl http://localhost:7438/documents/a1b2c3
curl http://localhost:7438/documents?pattern=notes/*.md
```

### Timeline & sessions

| Method | Path | Description |
|--------|------|-------------|
| GET | `/timeline/:docid` | Temporal neighborhood (before/after) |
| GET | `/sessions` | Recent session history |

```bash
curl http://localhost:7438/timeline/a1b2c3?before=3&after=3
curl http://localhost:7438/sessions?limit=5
```

### Graph traversal

| Method | Path | Description |
|--------|------|-------------|
| GET | `/graph/causal/:docid` | Causal chain traversal |
| GET | `/graph/similar/:docid` | k-NN semantic neighbors |
| GET | `/graph/evolution/:docid` | Document evolution timeline |

```bash
curl http://localhost:7438/graph/causal/a1b2c3?direction=both&depth=3
curl http://localhost:7438/graph/similar/a1b2c3?limit=5
```

### Lifecycle

| Method | Path | Description |
|--------|------|-------------|
| GET | `/lifecycle/status` | Active/archived/pinned/snoozed counts |
| POST | `/lifecycle/sweep` | Archive stale docs (dry_run default) |
| POST | `/lifecycle/restore` | Restore archived docs |

### Document mutations

| Method | Path | Description |
|--------|------|-------------|
| POST | `/documents/:docid/pin` | Pin/unpin a document |
| POST | `/documents/:docid/snooze` | Snooze until a date |
| POST | `/documents/:docid/forget` | Deactivate a document |

### Maintenance

| Method | Path | Description |
|--------|------|-------------|
| GET | `/collections` | List all collections |
| GET | `/profile` | Get user profile |
| POST | `/reindex` | Trigger re-scan |
| POST | `/graphs/build` | Rebuild temporal + semantic graphs |
| GET | `/export` | Full vault export as JSON |

## Operator console API

The operator console uses a separate admin namespace intended for local operational surfaces rather than general retrieval clients.

### Overview, runs, memory feed, and logs

| Method | Path | Description |
|--------|------|-------------|
| GET | `/admin/overview` | Operator summary: watcher health, lane state, backlog, alerts |
| GET | `/admin/runs` | Recent admin jobs and maintenance runs |
| GET | `/admin/runs/:id` | One run detail record |
| GET | `/admin/memory-feed` | Recent `_clawmem` artifacts with body + lineage counts |
| GET | `/admin/logs` | Watcher journald view with `level`, `since`, and `limit` filters |

Example:

```bash
curl 'http://localhost:7438/admin/logs?level=warn&limit=50'
curl 'http://localhost:7438/admin/runs'
```

### Collection management

| Method | Path | Description |
|--------|------|-------------|
| GET | `/admin/collections` | Collection cards for the operator console |
| POST | `/admin/collections` | Create a collection (requires an existing directory root) |
| GET | `/admin/collections/:id` | Read one collection detail |
| PATCH | `/admin/collections/:id` | Update collection root/pattern |
| DELETE | `/admin/collections/:id` | Remove collection config and clean its documents from SQLite |

### Admin mutations

| Method | Path | Description |
|--------|------|-------------|
| POST | `/admin/jobs/reindex` | Queue a durable reindex job |
| POST | `/admin/lifecycle/sweep` | Preview or execute lifecycle sweep |
| POST | `/admin/lifecycle/restore` | Restore archived docs |
| POST | `/admin/documents/:docid/pin` | Pin or unpin document |
| POST | `/admin/documents/:docid/snooze` | Snooze or unsnooze document |
| POST | `/admin/documents/:docid/forget` | Deactivate document |

Notes:

- `/admin/jobs/reindex` rejects unknown collections up front.
- `/admin/collections` create/update paths require an existing directory, not just any filesystem path.
- Destructive admin mutations add extra confirmation requirements:
  - `POST /admin/lifecycle/sweep` with `dry_run: false` requires `confirm: "ARCHIVE"`
  - `POST /admin/documents/:docid/forget` requires `confirm: "FORGET"`

Examples:

```bash
curl -X POST http://localhost:7438/admin/jobs/reindex \
  -H 'Content-Type: application/json' \
  -d '{"collection":"my-project"}'

curl -X POST http://localhost:7438/admin/lifecycle/sweep \
  -H 'Content-Type: application/json' \
  -d '{"dry_run":false,"confirm":"ARCHIVE"}'

curl -X POST http://localhost:7438/admin/documents/a1b2c3/forget \
  -H 'Content-Type: application/json' \
  -d '{"confirm":"FORGET"}'
```

## Static console mount

If `ui/dist` exists, `clawmem serve` also mounts the built operator console at:

```text
/console
```

This is intended for local operator use and works well behind a local proxy or Tailscale-served loopback port.

## Response format

All responses are JSON. Search/retrieve responses include:

```json
{
  "query": "authentication",
  "mode": "hybrid",
  "count": 3,
  "results": [
    {
      "docid": "a1b2c3",
      "path": "notes/auth.md",
      "title": "Authentication Decision",
      "score": 0.847,
      "contentType": "decision",
      "snippet": "We chose JWT for authentication because..."
    }
  ]
}
```

When `compact=false`, results include `modifiedAt`, `confidence`, and full `body` instead of `snippet`.

## Running as a systemd service

For production deployments (especially OpenClaw), run the REST API as a persistent service instead of relying on the plugin's `spawnBackground()`:

```bash
cat > ~/.config/systemd/user/clawmem-serve.service << 'EOF'
[Unit]
Description=ClawMem REST API server
After=default.target

[Service]
Type=simple
ExecStart=%h/clawmem/bin/clawmem serve --port 7438
Restart=on-failure
RestartSec=5
Environment=CLAWMEM_API_TOKEN=your-secret-here

[Install]
WantedBy=default.target
EOF

systemctl --user daemon-reload
systemctl --user enable --now clawmem-serve.service
```

When running as a systemd service, set `enableTools: true` and `servePort: 7438` in the OpenClaw plugin manifest — the plugin will connect to the existing server instead of spawning its own.

For remote GPU setups, add environment overrides (same pattern as the [watcher service](../guides/systemd-services.md#remote-gpu)):

```ini
Environment=CLAWMEM_EMBED_URL=http://gpu-host:8088
Environment=CLAWMEM_LLM_URL=http://gpu-host:8089
Environment=CLAWMEM_RERANK_URL=http://gpu-host:8090
```

## CORS

The server allows `localhost:*` origins for local frontend development.
