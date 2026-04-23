# Remote LLM Model Config Patch Handoff

## Goal

Capture the current findings from the OpenClaw + ClawMem integration work and define the patch scope for making ClawMem's remote LLM lane configurable enough to use a local `gpt-5.4-mini` proxy cleanly.

## Current Host State

- OpenClaw on the host is already switched to the ClawMem memory plugin:
  - `plugins.slots.memory = "clawmem"`
  - `memory-core` disabled
  - OpenClaw dreaming disabled
  - `agents.defaults.memorySearch.extraPaths = []`
- ClawMem serve/watch/embed services are installed as user services and currently use a host-local launcher:
  - `/home/drj/.openclaw/workspace/scripts/clawmem-host.sh`
- The current active ClawMem corpus is memory-focused, not whole-workspace:
  - `openclaw-main`
  - `coding`
  - `research`
  - `infra-ops`
  - `premiumblends`
  - `pharmacy`
- The embedding lane has already been switched away from local `embeddinggemma` to the existing local TEI service on `127.0.0.1:20010`.

## Confirmed Findings

### 1. ClawMem remote LLM model is not configurable

In the current source, `generateRemote()` hardcodes:

```ts
body: JSON.stringify({
  model: "qwen3",
  messages: [{ role: "user", content: `${prompt} /no_think` }],
  max_tokens: maxTokens,
  temperature,
})
```

Relevant file:
- `src/llm.ts`

Impact:
- Setting `CLAWMEM_LLM_URL` only changes the endpoint URL.
- It does not let operators choose a remote model like `gpt-5.4-mini`.

### 2. ClawMem remote LLM auth is also not configurable

The current remote LLM request does not send a bearer token or any configurable auth header.

Impact:
- A remote LLM proxy must either:
  - require no auth, or
  - be fronted by another local shim that injects auth, or
  - ClawMem must be patched to support `CLAWMEM_LLM_API_KEY` (or similar).

### 3. ChatMock on `127.0.0.1:8000` is viable in principle

Live probes confirmed:

- `GET /` -> `200 {"status":"ok"}`
- `GET /health` -> `200 {"status":"ok"}`
- `GET /v1/models` -> `200` and includes `gpt-5.4-mini`
- `POST /v1/chat/completions` with `model: "gpt-5.4-mini"` -> `200`
- `POST /v1/responses` with `model: "gpt-5.4-mini"` -> `200`
- `POST /v1/completions` with `model: "gpt-5.4-mini"` -> `200`
- Auth was not required for those probes.

But:

- `POST /v1/chat/completions` with `model: "qwen3"` -> `400 {"error":{"message":"Upstream error"}}`

Impact:
- ChatMock is usable as the remote LLM endpoint only after ClawMem stops hardcoding `qwen3`.

### 4. ClawMem remote embedding and remote LLM behave differently

The embedding lane already supports:

- `CLAWMEM_EMBED_URL`
- `CLAWMEM_EMBED_API_KEY`
- `CLAWMEM_EMBED_MODEL`

The LLM lane currently supports only:

- `CLAWMEM_LLM_URL`

There is no matching:

- `CLAWMEM_LLM_MODEL`
- `CLAWMEM_LLM_API_KEY`

This asymmetry is the main design gap.

### 5. OpenClaw plugin schema mirrors the same limitation

The OpenClaw plugin config currently exposes:

- `gpuEmbed`
- `gpuLlm`
- `gpuRerank`

It does not expose:

- a remote LLM model field
- a remote LLM API key field

Relevant files:
- `src/openclaw/openclaw.plugin.json`
- `src/openclaw/index.ts`

Impact:
- Even if `src/llm.ts` gains env-based configurability, the OpenClaw plugin cannot yet surface those settings through plugin config/UI.

## What the Remote LLM Lane Actually Powers

Changing the remote LLM model affects more than query expansion.

The `llm.generate()` lane is used for:

- query expansion
- intent refinement
- entity extraction
- A-MEM keyword/tag/context generation
- memory link generation
- memory evolution
- causal inference
- decision extraction / contradiction checks
- conversation synthesis
- consolidation and deductive guardrails

So a `gpt-5.4-mini` switch is effectively a change to the full ClawMem generation/enrichment lane, not just query rewriting.

## Patch Scope Recommendation

### Minimum viable patch

Add support for:

- `CLAWMEM_LLM_MODEL`

Behavior:

- Default to current behavior (`qwen3`) if unset.
- Use `process.env.CLAWMEM_LLM_MODEL` when present.

This is enough to make ChatMock usable if it does not require auth.

### Recommended patch

Add support for:

- `CLAWMEM_LLM_MODEL`
- `CLAWMEM_LLM_API_KEY`

Behavior:

- Remote LLM request should set:
  - `model = process.env.CLAWMEM_LLM_MODEL || "qwen3"`
  - `Authorization: Bearer <token>` when `CLAWMEM_LLM_API_KEY` is set
- Leave local fallback behavior unchanged.

### OpenClaw plugin follow-through

To make the setting usable from OpenClaw plugin config rather than only host env:

- add `gpuLlmModel` (or similarly named field) to `src/openclaw/openclaw.plugin.json`
- optionally add `gpuLlmApiKey` if the project wants plugin-side secret entry
- pass those through in `src/openclaw/index.ts` as env vars:
  - `CLAWMEM_LLM_MODEL`
  - `CLAWMEM_LLM_API_KEY`

If maintainers do not want plugin-side secret fields, it is still worth adding `gpuLlmModel` and keeping API keys as host env only.

## Suggested File Touches

Primary patch files:

- `src/llm.ts`
- `src/openclaw/openclaw.plugin.json`
- `src/openclaw/index.ts`

Likely docs:

- `README.md`
- `docs/guides/openclaw-plugin.md`
- possibly `docs/contributing.md` if new env/config expectations need mention

Tests:

- add or update tests under `tests/`
- at minimum, add focused coverage for remote LLM request construction:
  - default model behavior
  - env-driven model override
  - optional bearer auth injection

## Contributor Guidance Observed

From this repo's contribution docs:

- use `bun install`
- use `bin/clawmem` for manual testing, not direct `bun src/clawmem.ts`
- run:
  - `bun test`
  - `npx tsc --noEmit`
- keep the PR focused
- include test coverage for bug fixes/features

This suggests the patch should be kept tight:

- one concern: configurable remote LLM model/auth
- docs updated only for that feature
- no unrelated refactors

## Recommended Upstream Framing

Proposed upstream scope:

"Make ClawMem remote LLM integration configurable like remote embedding by adding env-driven model selection and optional bearer auth."

Why this framing works:

- mirrors an existing embedding-side capability rather than introducing a foreign concept
- fixes a real interoperability bug with OpenAI-compatible proxies
- keeps defaults unchanged
- is easy to explain and test

## Source-Built Cutover Plan

Do not keep patching the installed package under:

- `~/.local/share/npm/lib/node_modules/clawmem`

That path is non-durable across reinstalls/upgrades.

### Recommended local development cutover

Use the cloned repo at:

- `/home/drj/tools/ClawMem`

Development steps:

1. `cd /home/drj/tools/ClawMem`
2. `bun install`
3. patch source there
4. run:
   - `bun test`
   - `npx tsc --noEmit`
5. update the host launcher to point at the repo source instead of the npm-installed copy

Current launcher path:

- `/home/drj/.openclaw/workspace/scripts/clawmem-host.sh`

Current source target inside that launcher points at:

- `/home/drj/.local/share/npm/lib/node_modules/clawmem/src/clawmem.ts`

For source-built testing, switch it to:

- `/home/drj/tools/ClawMem/src/clawmem.ts`

Or, if you want to honor contributor guidance more strictly, switch the launcher to invoke:

- `/home/drj/tools/ClawMem/bin/clawmem`

But note:

- the upstream `bin/clawmem` wrapper in this repo currently hardcodes `localhost:8088/8089/8090`
- your host-local launcher was created specifically to avoid those defaults

So the safer immediate cutover is:

- keep the host-local wrapper
- change only its `CLAWMEM_SRC` target to the repo clone

### After patch validation

Once the repo patch works:

- restart:
  - `clawmem-serve.service`
  - `clawmem-watcher.service`
  - `clawmem-embed.service` as needed
  - `openclaw-gateway.service`
- verify OpenClaw still registers `clawmem`
- verify ChatMock-backed LLM calls succeed through the new config

## Immediate Next Session Recommendation

In the next session, work from:

- `/home/drj/tools/ClawMem`

Order:

1. patch `src/llm.ts`
2. add tests for remote LLM request construction
3. run `bun test` and `npx tsc --noEmit`
4. patch OpenClaw plugin config surface if desired
5. switch host launcher to repo source
6. test against ChatMock on `127.0.0.1:8000`

## Success Criteria

The patch is done when all of the following are true:

- `CLAWMEM_LLM_URL=http://127.0.0.1:8000` is honored
- `CLAWMEM_LLM_MODEL=gpt-5.4-mini` is sent in remote LLM requests
- `CLAWMEM_LLM_API_KEY` is optional and works when set
- no default behavior changes when those vars are unset
- OpenClaw can use the patched source-built ClawMem through the existing host launcher
- ChatMock-backed generation works for ClawMem enrichment/query expansion without local code hacks on the ChatMock side
