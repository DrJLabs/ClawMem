# ClawMem Operator Console Design

## Goal

Design a mobile-compatible operator console for ClawMem that makes background memory operations visible, allows full operator control over indexing and maintenance tasks, and preserves a clean path to ship the UI as static assets served by ClawMem later.

## Scope

This design covers:

- UI information architecture
- operator backend boundaries
- live update behavior
- action and safety model
- mobile-first interaction patterns
- degraded-mode behavior
- v1 success criteria

This design does not yet cover:

- implementation task breakdown
- exact component/file list
- final visual styling details
- auth beyond single trusted localhost operator assumptions

## Product Intent

The console should function as a field-operator tool rather than a desktop dashboard shrunk onto a phone. Its primary job is to let an operator answer, quickly and confidently:

- Is ClawMem healthy right now?
- Are light lane and heavy lane behaving as expected?
- Are memories, decisions, handoffs, and deductions actually being extracted from sessions?
- What is indexed and what is falling behind?
- What failed, why, and what can I do about it now?

The console must make system behavior visible without forcing the operator to inspect journald, raw SQLite tables, or CLI output for routine tasks.

## Hosting Model

The UI will use the approved **Option 3** delivery model:

- During development, the UI runs as a separate app under this repo.
- In production, the UI should be able to ship as compiled static assets and be served by ClawMem later if desired.

The UI code will live **inside this repo**.

Recommended repo placement:

- `ui/` for the frontend app
- operator backend surfaces added to the ClawMem Bun server under a dedicated admin namespace

This preserves:

- clean local development
- clear separation between UI and ClawMem internals
- a future single-service deployment story without redesigning the frontend boundary

## Trust Model

The first version assumes a **single trusted localhost operator**. The design should not depend on multi-user roles or full auth/authorization for v1.

Because the UI will expose destructive and high-cost actions, safety must come from:

- clear action boundaries
- explicit consequence copy
- strong confirmation flows
- operator-proof provenance in the UI

## Architecture

The system has three layers:

### 1. Frontend SPA

A mobile-first operator console living in `ui/`.

Responsibilities:

- render operator-focused views
- poll live status
- present extracted memory artifacts in an understandable feed
- trigger operator actions
- show degraded or stale states clearly

### 2. Operator Backend

A dedicated **operator API namespace** mounted into the existing ClawMem Bun server.

Responsibilities:

- expose UI-shaped JSON contracts
- separate read models from mutation endpoints
- normalize SQLite/runtime state for operators
- keep existing search/retrieval API separate from operator surfaces

### 3. Runtime Adapters

Behind the operator backend, separate adapters should read from:

- SQLite runtime state
- service/process/runtime facts
- recent logs
- existing ClawMem capabilities

Adapters are split by responsibility:

- **read adapter** for operational truth and traceability
- **control adapter** for job execution and high-power actions

## Boundary Rules

### Read path

The browser must never query SQLite directly. All SQLite and system state is read server-side, normalized, and returned through operator-focused API contracts.

### Write path

All mutations must go through explicit admin endpoints. No browser-triggered shell execution or raw internal mutation path should exist without a named operator action.

### Existing public API

The existing ClawMem API (`/search`, `/retrieve`, `/documents`, lifecycle surfaces) remains conceptually separate from the operator console. The operator UI should not be forced to consume raw internal shapes from that API.

## Information Architecture

The approved structure is a **tabbed operator suite** optimized for mobile.

### Primary navigation

- `Overview`
- `Runs`
- `Memory Feed`
- `Collections`
- `Logs`
- `Admin`

### Mobile navigation behavior

Use a bottom tab bar for the highest-frequency destinations:

- `Overview`
- `Runs`
- `Memory`
- `Collections`
- `More`

Inside `More`:

- `Logs`
- `Admin`
- `System`

Desktop can reuse the same information architecture via a side rail.

## Page Designs

### Overview

This is the landing screen and mobile control-room summary.

It must answer within about 5 seconds:

- watcher health
- lane health
- backlog state
- recent extraction activity
- current alerts
- whether operator intervention is needed

Recommended sections:

- watcher/service health
- lane summary
- active jobs
- backlog and embedding coverage
- recent extraction outcomes
- recent failures
- primary operator actions

Each card should include:

- one dominant status
- one or two supporting metrics
- timestamp/freshness
- a proof/drill-down affordance
- one relevant quick action

### Runs

This is the operational center for maintenance and background work.

It shows:

- active jobs
- recent maintenance runs
- lane-specific run history
- per-run timing and counts
- reasons for skips/failures
- rerun/retry affordances where valid

Run detail must include:

- summary
- lane
- phase
- status
- reason
- counts/metrics
- timestamps
- linked extracted artifacts
- linked logs

### Memory Feed

This page exists to prove that sessions are producing usable memory artifacts.

It must surface:

- observations
- decisions
- milestones
- handoffs
- deductions
- problems
- preferences

Each feed item should show:

- type badge
- title
- short summary
- created time
- source lineage
- expand for full content and provenance

### Collections

This is the indexing control plane.

Each collection card should show:

- name
- root path
- include pattern/glob
- doc count
- unembedded count
- last activity
- actions

Collection detail/edit view should allow:

- editing root
- editing include pattern
- viewing derived counts
- viewing embedding coverage
- triggering update/reindex/embed
- removing the collection

### Logs

This is the debugging surface, not the home page.

It needs:

- filter-first layout
- live-tail mode
- severity chips
- service/source selector
- time window selector
- wrapped log rows optimized for mobile
- drill-in for log event details and nearby context

### Admin

This is the full-power surface and danger zone.

It includes:

- lifecycle sweep/restore
- memory mutation tools
- destructive collection actions
- force maintenance operations
- resets and similar high-risk controls

Dangerous actions must use stronger confirmation patterns than normal actions.

## Live Behavior

The console should feel near real-time, but v1 does not require a streaming stack.

Use page-level polling with freshness indicators.

### Recommended polling cadence

- `Overview`: every 3 to 5 seconds
- `Runs`: every 2 to 4 seconds while work is active, slower when idle
- `Memory Feed`: every 5 to 10 seconds
- `Collections`: mostly manual plus slow background refresh
- `Logs`: explicit live-tail mode with pause/resume
- `Admin`: manual refresh after actions

### Freshness behavior

Every page or card should indicate:

- last updated timestamp
- whether data is live, stale, cached, or derived
- whether a polling failure occurred

## Action Model

Actions fall into three categories:

### 1. Instant mutations

Small configuration changes that can complete quickly.

Examples:

- edit collection scope
- toggle lane-related operator settings

### 2. Job-triggering actions

Actions that start work and return immediately with a tracked job/run id.

Examples:

- update
- embed
- reindex
- consolidate
- lifecycle sweep

### 3. Destructive actions

Actions with direct destructive impact or high irreversibility.

Examples:

- forget
- remove collection
- broad restore/sweep actions with destructive side effects

## Safety Model

Because the user selected **full operator power**, the UI must include strong guardrails even in a trusted local deployment.

Rules:

- dangerous actions are visually separated
- destructive actions require consequence-specific confirmation copy
- high-cost actions should display expected impact where possible
- no false optimistic success states for destructive operations
- action result pages must preserve operator context and show exactly what happened

For high-risk actions, the UI should answer:

- what action was requested
- what changed
- whether anything partially completed
- where to inspect logs or run details

## Backend Surfaces

The console needs a dedicated operator API namespace.

Recommended read surfaces:

- `GET /admin/overview`
- `GET /admin/runs`
- `GET /admin/runs/:id`
- `GET /admin/memory-feed`
- `GET /admin/collections`
- `GET /admin/logs`
- `GET /admin/system`

Recommended action surfaces:

- `POST /admin/jobs/update`
- `POST /admin/jobs/embed`
- `POST /admin/jobs/reindex`
- `POST /admin/jobs/consolidate`
- `POST /admin/jobs/lifecycle-sweep`
- `POST /admin/collections`
- `PATCH /admin/collections/:id`
- `DELETE /admin/collections/:id`
- `POST /admin/documents/:id/pin`
- `POST /admin/documents/:id/snooze`
- `POST /admin/documents/:id/forget`
- `POST /admin/lifecycle/restore`
- `POST /admin/config/lanes`

## Read Model Shaping

The operator backend should return normalized operator models, not raw table shapes unless the table is already appropriate.

### Run model

Derived from `maintenance_runs` and related runtime facts:

- `id`
- `kind`
- `lane`
- `phase`
- `status`
- `reason`
- `startedAt`
- `finishedAt`
- `counts`
- `metrics`
- `proofLinks`

### Memory feed item

Derived from `_clawmem` docs and session/run lineage:

- `documentId`
- `type`
- `title`
- `summary`
- `createdAt`
- `sourceSession`
- `sourceRun`
- `path`
- `proofLinks`

### Collection model

- `id` or `name`
- `root`
- `pattern`
- `documents`
- `unembedded`
- `embeddingCoverage`
- `lastActivity`
- `actionsAvailable`

### Overview model

Operator-ready summary rather than raw store status:

- watcher health
- lane state
- active jobs
- backlog metrics
- extraction activity summary
- active alerts
- system freshness block

## Proof And Traceability

Every meaningful operator state should carry enough provenance for the UI to answer “how do we know?”

Responses should include:

- timestamps
- source-of-truth type
- linked run ids
- linked session ids where applicable
- linked document ids
- linked logs where applicable

Examples:

- heavy lane skipped → sourced from `maintenance_runs.reason`
- extraction succeeded → sourced from persisted `_clawmem` docs and linked run/session lineage
- watcher healthy → sourced from service/process truth
- backlog count → sourced from DB summary

## Mobile UX Principles

This should feel like a field operator console rather than a desktop dashboard.

### Mobile rules

- one dominant task per page
- no split-pane dependence
- action placement near the top of each page
- dangerous actions behind stronger confirmation flows
- full-screen detail pages instead of cramped drawers on phones
- filter-first logs
- expandable feed items with compact defaults

### Visual direction

The UI should be:

- high contrast
- daylight-friendly
- dense but not cramped
- hierarchy-driven
- table-light
- chart-light unless charts provide clear operator value

Mini charts are not required for v1. Status, counts, sequences, and event history should dominate.

## Error Handling And Degraded Modes

The UI must degrade **by panel**, not by whole page.

States:

- healthy live data
- stale but usable
- partial failure
- unavailable

Examples:

- `Overview` can show last successful summary if live checks fail
- `Runs` can show persisted history if service-state checks fail
- `Memory Feed` can still show recent extracted docs if watcher state is unavailable
- `Logs` can fail independently without collapsing the rest of the console

### Operator-facing error copy

Errors must tell the operator:

- what failed
- what source failed
- whether shown data is stale
- what is still usable

Preferred style:

- “Watcher status check failed. Showing last successful state from 12:41:08.”
- “Run history loaded from SQLite, but live job state is unavailable.”
- “Log stream disconnected. Historical logs remain available.”

### Failure scenarios the design must tolerate

- watcher down, backend up
- backend up, DB readable, service-state check failing
- DB temporarily busy or locked
- job accepted but tracking delayed
- logs unavailable or truncated
- mobile network instability over Tailscale
- stale polling responses arriving out of order

Frontend needs:

- freshness guards on responses
- visible stale-state indicators
- per-panel retry
- action/result correlation by run id or action id

## Success Criteria

The v1 console succeeds if:

1. From a phone, the operator can determine in under 10 seconds:
   - whether ClawMem is healthy
   - whether background memory work is running
   - whether new memory is being extracted
   - whether intervention is needed

2. From the UI alone, the operator can answer:
   - what ran
   - what succeeded or failed
   - what was extracted from recent sessions
   - what collections are indexed
   - why the summary should be trusted

3. From mobile, the operator can safely perform core actions:
   - edit collection scope
   - trigger update/embed/reindex/consolidate
   - inspect run results
   - inspect logs
   - use high-power maintenance actions with guardrails

4. If one subsystem fails, the rest of the console remains usable enough to operate.

## Design Decisions Summary

- delivery model: separate app in development, assets servable by ClawMem later
- code location: inside this repo
- trust model: single trusted localhost operator
- update model: near-real-time polling
- backend model: hybrid operator backend with API mutations and richer server-side read adapters
- information architecture: tabbed operator suite with a mobile-first overview page
- operator power: full operator control, with strong UI guardrails

## Open Questions Deferred To Planning

These are intentionally deferred to implementation planning rather than left ambiguous in the design:

- exact frontend stack and build tooling under `ui/`
- exact polling library/state management choice
- whether logs are sourced from journald directly, a normalized log adapter, or both
- whether `maintenance_runs` and related operator reads are exposed directly from ClawMem server code or through a thin intermediate service module
- exact static-asset serving integration path for later production packaging
