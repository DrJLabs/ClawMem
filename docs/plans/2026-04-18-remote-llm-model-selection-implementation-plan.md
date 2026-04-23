# Remote LLM Model Selection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add first-class remote LLM model selection so ClawMem can target a configurable model name in addition to a configurable remote LLM URL, while preserving the current `qwen3` default.

**Architecture:** Keep the change narrow: add a `remoteLlmModel` configuration path in `src/llm.ts`, source it from a new `CLAWMEM_LLM_MODEL` env var, and expose that env var through the OpenClaw plugin config and Hermes env passthrough. Do not expand scope to auth in this patch; the old handoff doc was right about the hardcoded model, but it under-counted downstream surfaces that also need to know about the new variable.

**Tech Stack:** Bun, TypeScript, Bun test, OpenClaw plugin manifest JSON, Hermes Python plugin metadata, markdown docs.

---

## Source Audit Summary

- The previous handoff doc is correct that `generateRemote()` hardcodes `model: "qwen3"` in [src/llm.ts](/home/drj/tools/ClawMem/src/llm.ts:924).
- The previous handoff doc is also correct that OpenClaw currently exposes only `gpuLlm` URL config in [src/openclaw/openclaw.plugin.json](/home/drj/tools/ClawMem/src/openclaw/openclaw.plugin.json:38) and only maps that URL to `CLAWMEM_LLM_URL` in [src/openclaw/index.ts](/home/drj/tools/ClawMem/src/openclaw/index.ts:109).
- The previous handoff doc under-scopes the repo-level change because Hermes also maintains its own env metadata and allowlist in [src/hermes/__init__.py](/home/drj/tools/ClawMem/src/hermes/__init__.py:15) and [src/hermes/__init__.py](/home/drj/tools/ClawMem/src/hermes/__init__.py:306). If `CLAWMEM_LLM_MODEL` is not added there, Hermes users cannot benefit from the new setting.
- This plan is intentionally **model-only**. `CLAWMEM_LLM_API_KEY` remains a separate follow-up so this patch stays aligned with the requested scope: choose model in addition to URL for the LLM lane.

## File Map

- Modify: `src/llm.ts`
  - Add `remoteLlmModel` to `LlamaCppConfig`, class state, constructor wiring, env bootstrap, and `generateRemote()` request payload.
- Modify: `src/openclaw/openclaw.plugin.json`
  - Add plugin UI/schema support for `gpuLlmModel`.
- Modify: `src/openclaw/index.ts`
  - Map `gpuLlmModel` into `CLAWMEM_LLM_MODEL`.
- Modify: `src/clawmem.ts`
  - Update `setup openclaw` next-step guidance to show the new config field.
- Modify: `src/hermes/__init__.py`
  - Add `CLAWMEM_LLM_MODEL` to Hermes docs, config metadata, and env passthrough.
- Create: `tests/unit/llm-remote-config.test.ts`
  - Focused request-construction coverage for default vs override behavior.
- Modify: `tests/unit/openclaw-plugin.test.ts`
  - Add assertions for the new OpenClaw plugin schema/help text and setup guidance.
- Create: `tests/unit/hermes-plugin.test.ts`
  - Add lightweight source-level regression coverage for Hermes env exposure.
- Modify: `README.md`
- Modify: `docs/guides/openclaw-plugin.md`
- Modify: `docs/reference/cli.md`
- Modify: `docs/internals/entity-resolution.md`
- Modify: `docs/guides/systemd-services.md`
- Modify: `docs/guides/setup-mcp.md`

### Task 1: Add `CLAWMEM_LLM_MODEL` To The Core LLM Transport

**Files:**
- Modify: `src/llm.ts`
- Create: `tests/unit/llm-remote-config.test.ts`

- [ ] **Step 1: Write the failing request-construction tests**

Create `tests/unit/llm-remote-config.test.ts` with focused assertions that capture the remote request body instead of reusing the broader fallback suite:

```ts
import { afterEach, describe, expect, it } from "bun:test";
import { LlamaCpp, disposeDefaultLlamaCpp, setDefaultLlamaCpp } from "../../src/llm.ts";

const originalFetch = globalThis.fetch;

describe("remote LLM model selection", () => {
  afterEach(async () => {
    globalThis.fetch = originalFetch;
    setDefaultLlamaCpp(null);
    delete process.env.CLAWMEM_LLM_URL;
    delete process.env.CLAWMEM_LLM_MODEL;
    await disposeDefaultLlamaCpp();
  });

  it("defaults remote chat completions to qwen3 when no model override is set", async () => {
    let seenBody: any;
    globalThis.fetch = (async (_url: string, init?: RequestInit) => {
      seenBody = JSON.parse(String(init?.body));
      return new Response(JSON.stringify({
        choices: [{ message: { content: "ok" } }],
        model: seenBody.model,
      }), { status: 200 });
    }) as any;

    const llm = new LlamaCpp({ remoteLlmUrl: "http://localhost:8089" });
    await llm.generate("test prompt");

    expect(seenBody.model).toBe("qwen3");
    expect(seenBody.messages[0].content).toContain("/no_think");
  });

  it("uses CLAWMEM_LLM_MODEL when the override is configured", async () => {
    let seenBody: any;
    globalThis.fetch = (async (_url: string, init?: RequestInit) => {
      seenBody = JSON.parse(String(init?.body));
      return new Response(JSON.stringify({
        choices: [{ message: { content: "ok" } }],
        model: seenBody.model,
      }), { status: 200 });
    }) as any;

    const llm = new LlamaCpp({
      remoteLlmUrl: "http://localhost:8089",
      remoteLlmModel: "gpt-5.4-mini",
    });

    const result = await llm.generate("test prompt");
    expect(seenBody.model).toBe("gpt-5.4-mini");
    expect(result?.model).toBe("gpt-5.4-mini");
  });
});
```

- [ ] **Step 2: Run the new test file and confirm the override case fails**

Run:

```bash
bun test tests/unit/llm-remote-config.test.ts
```

Expected:
- The default-model test passes or is neutral.
- The override test fails because `generateRemote()` still sends `"qwen3"`.

- [ ] **Step 3: Add the new config field in `src/llm.ts`**

Patch `src/llm.ts` so the config object, class state, constructor, and env bootstrap all know about the new model field:

```ts
export type LlamaCppConfig = {
  embedModel?: string;
  generateModel?: string;
  rerankModel?: string;
  modelCacheDir?: string;
  remoteEmbedUrl?: string;
  remoteEmbedApiKey?: string;
  remoteEmbedModel?: string;
  remoteLlmUrl?: string;
  remoteLlmModel?: string;
  inactivityTimeoutMs?: number;
  disposeModelsOnInactivity?: boolean;
};

export class LlamaCpp implements LLM {
  private remoteEmbedUrl: string | null;
  private remoteEmbedApiKey: string | null;
  private remoteEmbedModel: string;
  private remoteLlmUrl: string | null;
  private remoteLlmModel: string;

  constructor(config: LlamaCppConfig = {}) {
    this.remoteEmbedUrl = config.remoteEmbedUrl || null;
    this.remoteEmbedApiKey = config.remoteEmbedApiKey || null;
    this.remoteEmbedModel = config.remoteEmbedModel || "embedding";
    this.remoteLlmUrl = config.remoteLlmUrl || null;
    this.remoteLlmModel = config.remoteLlmModel || "qwen3";
  }
}
```

And wire the env bootstrap:

```ts
defaultLlamaCpp = new LlamaCpp({
  remoteEmbedUrl: embedUrl,
  remoteEmbedApiKey: embedApiKey,
  remoteEmbedModel: process.env.CLAWMEM_EMBED_MODEL || undefined,
  remoteLlmUrl: process.env.CLAWMEM_LLM_URL || undefined,
  remoteLlmModel: process.env.CLAWMEM_LLM_MODEL || undefined,
});
```

- [ ] **Step 4: Replace the hardcoded remote model in `generateRemote()`**

Update the remote request body to use the configured model while preserving the current fallback default:

```ts
const resp = await fetch(`${this.remoteLlmUrl}/v1/chat/completions`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    model: this.remoteLlmModel,
    messages: [{ role: "user", content: `${prompt} /no_think` }],
    max_tokens: maxTokens,
    temperature,
  }),
  signal,
});
```

- [ ] **Step 5: Re-run the focused tests**

Run:

```bash
bun test tests/unit/llm-remote-config.test.ts
```

Expected:
- Both tests pass.
- `/no_think` remains present.
- The returned `result.model` matches the server response or configured override.

- [ ] **Step 6: Commit the core transport change**

Run:

```bash
git add src/llm.ts tests/unit/llm-remote-config.test.ts
git commit -m "feat: add configurable remote llm model selection"
```

### Task 2: Expose LLM Model Selection In The OpenClaw Plugin

**Files:**
- Modify: `src/openclaw/openclaw.plugin.json`
- Modify: `src/openclaw/index.ts`
- Modify: `src/clawmem.ts`
- Modify: `tests/unit/openclaw-plugin.test.ts`

- [ ] **Step 1: Add failing manifest/setup assertions**

Extend `tests/unit/openclaw-plugin.test.ts` with checks that guard the new UI/schema surface and CLI guidance:

```ts
test("openclaw.plugin.json exposes gpuLlmModel in uiHints and configSchema", async () => {
  const file = Bun.file(`${import.meta.dir}/../../src/openclaw/openclaw.plugin.json`);
  const content = await file.json();

  expect(content.uiHints.gpuLlmModel).toBeDefined();
  expect(content.configSchema.properties.gpuLlmModel).toBeDefined();
});

test("cmdSetupOpenClaw guidance includes gpuLlmModel", async () => {
  const file = Bun.file(`${import.meta.dir}/../../src/clawmem.ts`);
  const content = await file.text();

  expect(content).toContain("plugins.entries.clawmem.config.gpuLlmModel");
});
```

- [ ] **Step 2: Run the OpenClaw plugin test file and confirm the new assertions fail**

Run:

```bash
bun test tests/unit/openclaw-plugin.test.ts
```

Expected:
- Existing tests pass.
- The new `gpuLlmModel` assertions fail because the field is not yet present.

- [ ] **Step 3: Add `gpuLlmModel` to the plugin manifest**

Update `src/openclaw/openclaw.plugin.json` in both `uiHints` and `configSchema.properties`:

```json
"gpuLlmModel": {
  "label": "LLM Model",
  "placeholder": "qwen3",
  "help": "Model name sent to the configured LLM endpoint",
  "advanced": true
}
```

```json
"gpuLlmModel": {
  "type": "string"
}
```

- [ ] **Step 4: Map the plugin field to `CLAWMEM_LLM_MODEL`**

Update `src/openclaw/index.ts` so OpenClaw config can drive the new env var:

```ts
env: {
  ...(pluginCfg.gpuEmbed ? { CLAWMEM_EMBED_URL: pluginCfg.gpuEmbed as string } : {}),
  ...(pluginCfg.gpuLlm ? { CLAWMEM_LLM_URL: pluginCfg.gpuLlm as string } : {}),
  ...(pluginCfg.gpuLlmModel ? { CLAWMEM_LLM_MODEL: pluginCfg.gpuLlmModel as string } : {}),
  ...(pluginCfg.gpuRerank ? { CLAWMEM_RERANK_URL: pluginCfg.gpuRerank as string } : {}),
  CLAWMEM_PROFILE: profile,
},
```

- [ ] **Step 5: Update `clawmem setup openclaw` guidance**

Patch `src/clawmem.ts` so the setup output teaches operators the new config path:

```ts
console.log(`     ${c.cyan}openclaw config set plugins.entries.clawmem.config.gpuLlm http://YOUR_GPU:8089${c.reset}`);
console.log(`     ${c.cyan}openclaw config set plugins.entries.clawmem.config.gpuLlmModel qwen3${c.reset}`);
console.log(`     ${c.cyan}openclaw config set plugins.entries.clawmem.config.gpuRerank http://YOUR_GPU:8090${c.reset}`);
```

- [ ] **Step 6: Re-run the OpenClaw plugin tests**

Run:

```bash
bun test tests/unit/openclaw-plugin.test.ts
```

Expected:
- The new manifest/setup assertions pass.
- Existing plugin-manifest regression checks still pass.

- [ ] **Step 7: Commit the OpenClaw plugin surface changes**

Run:

```bash
git add src/openclaw/openclaw.plugin.json src/openclaw/index.ts src/clawmem.ts tests/unit/openclaw-plugin.test.ts
git commit -m "feat: expose remote llm model in openclaw plugin config"
```

### Task 3: Thread The New Env Var Through Hermes

**Files:**
- Modify: `src/hermes/__init__.py`
- Create: `tests/unit/hermes-plugin.test.ts`

- [ ] **Step 1: Add failing regression coverage for Hermes exposure**

Create `tests/unit/hermes-plugin.test.ts` with source-level checks that match the current testing style used elsewhere in the repo for cross-language surfaces:

```ts
import { describe, expect, test } from "bun:test";

describe("Hermes plugin env surface", () => {
  test("documents and forwards CLAWMEM_LLM_MODEL", async () => {
    const file = Bun.file(`${import.meta.dir}/../../src/hermes/__init__.py`);
    const content = await file.text();

    expect(content).toContain("CLAWMEM_LLM_MODEL");
    expect(content).toContain('"env_var": "CLAWMEM_LLM_MODEL"');
  });
});
```

- [ ] **Step 2: Run the Hermes test and confirm it fails**

Run:

```bash
bun test tests/unit/hermes-plugin.test.ts
```

Expected:
- The test fails because `CLAWMEM_LLM_MODEL` does not exist in the Hermes plugin source yet.

- [ ] **Step 3: Update Hermes metadata and passthrough**

Patch `src/hermes/__init__.py` in all three relevant places:

```py
Config via environment variables:
  CLAWMEM_BIN           — Path to clawmem binary (default: auto-detect on PATH)
  CLAWMEM_SERVE_PORT    — REST API port (default: 7438)
  CLAWMEM_SERVE_MODE    — "external" (default) or "managed" (plugin starts/stops serve)
  CLAWMEM_PROFILE       — Retrieval profile: speed, balanced, deep (default: balanced)
  CLAWMEM_EMBED_URL     — GPU embedding server URL (optional)
  CLAWMEM_LLM_URL       — GPU LLM server URL (optional)
  CLAWMEM_LLM_MODEL     — Model name sent to the GPU/cloud LLM endpoint (optional)
  CLAWMEM_RERANK_URL    — GPU reranker server URL (optional)
```

```py
{
    "key": "llm_model",
    "description": "Model name sent to the GPU LLM server (e.g., qwen3, gpt-5.4-mini)",
    "secret": False,
    "env_var": "CLAWMEM_LLM_MODEL",
},
```

```py
for var in (
    "CLAWMEM_EMBED_URL",
    "CLAWMEM_LLM_URL",
    "CLAWMEM_LLM_MODEL",
    "CLAWMEM_RERANK_URL",
    "CLAWMEM_PROFILE",
):
    val = os.environ.get(var)
    if val:
        self._env_extra[var] = val
```

- [ ] **Step 4: Re-run the Hermes regression test**

Run:

```bash
bun test tests/unit/hermes-plugin.test.ts
```

Expected:
- The test passes and protects the new env allowlist entry.

- [ ] **Step 5: Commit the Hermes pass-through change**

Run:

```bash
git add src/hermes/__init__.py tests/unit/hermes-plugin.test.ts
git commit -m "feat: pass remote llm model through hermes integration"
```

### Task 4: Update Operator Docs And Verify The Full Change

**Files:**
- Modify: `README.md`
- Modify: `docs/guides/openclaw-plugin.md`
- Modify: `docs/reference/cli.md`
- Modify: `docs/internals/entity-resolution.md`
- Modify: `docs/guides/systemd-services.md`
- Modify: `docs/guides/setup-mcp.md`

- [ ] **Step 1: Update the env tables and examples to mention `CLAWMEM_LLM_MODEL`**

Patch the highest-signal operator docs so they show both URL and model selection together:

```md
| `CLAWMEM_LLM_URL` | `http://localhost:8089` | LLM server URL for intent/query/A-MEM. Without it, falls to `node-llama-cpp` (if allowed). |
| `CLAWMEM_LLM_MODEL` | `qwen3` | Model name sent to the configured LLM endpoint. Override this for OpenAI-compatible proxies such as `gpt-5.4-mini`. |
```

And update example blocks accordingly:

```bash
CLAWMEM_LLM_URL=http://127.0.0.1:8000
CLAWMEM_LLM_MODEL=gpt-5.4-mini
```

Also update `docs/guides/openclaw-plugin.md` anywhere it describes the OpenClaw-side GPU endpoint configuration so the plugin guide shows both fields together:

```bash
openclaw config set plugins.entries.clawmem.config.gpuLlm http://127.0.0.1:8000
openclaw config set plugins.entries.clawmem.config.gpuLlmModel gpt-5.4-mini
```

- [ ] **Step 2: Update the entity-resolution guidance so the cloud example is actually usable**

Patch `docs/internals/entity-resolution.md` so the cloud/OpenAI-compatible example includes the model variable instead of assuming the endpoint accepts `qwen3`:

```md
```bash
# Example: use an OpenAI-compatible API
CLAWMEM_LLM_URL=https://api.example.com/v1 \
CLAWMEM_LLM_MODEL=gpt-5.4-mini \
clawmem reindex --enrich
```
```

- [ ] **Step 3: Update systemd and MCP examples**

Patch `docs/guides/systemd-services.md` and `docs/guides/setup-mcp.md` so remote LLM examples show the model setting alongside the URL:

```ini
Environment=CLAWMEM_LLM_URL=http://gpu-host:8089
Environment=CLAWMEM_LLM_MODEL=qwen3
```

Use a proxy-specific example where appropriate:

```ini
Environment=CLAWMEM_LLM_URL=http://127.0.0.1:8000
Environment=CLAWMEM_LLM_MODEL=gpt-5.4-mini
```

- [ ] **Step 4: Run a docs grep to verify every primary operator surface mentions the new variable**

Run:

```bash
rg -n "CLAWMEM_LLM_MODEL|gpuLlmModel" README.md docs src/hermes/__init__.py src/openclaw src/clawmem.ts
```

Expected:
- Hits appear in the core env table, OpenClaw setup guidance, Hermes metadata, and remote LLM examples.

- [ ] **Step 5: Run the full verification suite for this patch**

Run:

```bash
bun test tests/unit/llm-remote-config.test.ts tests/unit/openclaw-plugin.test.ts tests/unit/hermes-plugin.test.ts
bun test
npx tsc --noEmit
```

Expected:
- Targeted unit tests pass first.
- Full test suite passes.
- TypeScript emits no type errors.

- [ ] **Step 6: Commit the docs and verification pass**

Run:

```bash
git add README.md docs/reference/cli.md docs/internals/entity-resolution.md docs/guides/systemd-services.md docs/guides/setup-mcp.md
git commit -m "docs: document configurable remote llm model"
```

## Out Of Scope

- `CLAWMEM_LLM_API_KEY`
- Arbitrary custom header support
- Changing the default remote model away from `qwen3`
- Refactoring unrelated remote embedding code or reranker config

## Final Manual Smoke Check

After the code and docs land, validate the real operator path that motivated this work:

```bash
openclaw config set plugins.entries.clawmem.config.gpuLlm http://127.0.0.1:8000
openclaw config set plugins.entries.clawmem.config.gpuLlmModel gpt-5.4-mini
openclaw config get plugins.entries.clawmem.config
```

Expected:
- The config now stores both the endpoint and model choice.
- Future ClawMem shell-outs launched by the OpenClaw plugin receive both `CLAWMEM_LLM_URL` and `CLAWMEM_LLM_MODEL`.

Plan complete and saved to `docs/plans/2026-04-18-remote-llm-model-selection-implementation-plan.md`. Two execution options:

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

**Which approach?**
