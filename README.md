# Pipeline Board

A CRM kanban board for opportunities moving through a sales pipeline — built for scale (12
stages, ~25,000 seeded cards, one column holding 10,000), optimistic drag-and-drop, and a
background "other people are editing this too" simulation the board has to reconcile with
without fighting the user.

Built as an SDE-2/3 frontend take-home. **Deviation from the brief, disclosed up front:** the
brief specifies Vue 3 + Composition API. This is built in **React 19 + TypeScript** instead —
a deliberate choice, not an oversight. Every architectural decision in `DESIGN.md` maps
directly onto Vue equivalents (Zustand → Pinia, dnd-kit → vue-dnd-kit or a Vue drag library,
`@tanstack/react-virtual` → `@tanstack/vue-virtual`) and none of it depends on React specifics
beyond component syntax.

## Running it

```bash
npm install && npm run dev
```

One command, on a clean checkout — installs every dependency, then opens on
`http://localhost:5173`. No environment variables, no backend to start — there is no backend; see
[The mock API](#the-mock-api) below.

Other scripts:

```bash
npm run build   # tsc -b && vite build — production build
npm run test    # vitest run — the full test suite
npm run lint    # oxlint
```

## The mock API

There is no backend. `src/mockApi/` is a fake server living entirely in the browser tab:

- an in-memory database (`db.ts`) seeded with 12 stages and ~25,000 opportunities on load
- injectable latency (jittered, default 300–1500ms) and injectable write failures (default
  10%), applied uniformly to every call (`network.ts`)
- a background change stream (`changeStream.ts`) simulating other users — every few seconds
  some cards move, get edited, get created, or get deleted
- an async bulk-move job engine (`bulkJobs.ts`) that chunks through matched ids over several
  ticks, independent of any mounted component, persisting its progress to `localStorage` so it
  survives a page refresh mid-job

### Tuning the simulation at runtime

Every knob is a query parameter, or can be changed live from the **dev panel** (bottom-right
corner of the running app):

| Query param | Controls | Default |
|---|---|---|
| `?latencyMin=` | minimum simulated write latency (ms) | `300` |
| `?latencyMax=` | maximum simulated write latency (ms) | `1500` |
| `?failRate=` | write failure rate, `0`–`1` | `0.1` |
| `?streamInterval=` | ms between background change-stream ticks | `3000` |
| `?streamBatch=` | mutations emitted per change-stream tick | `5` |
| `?streamEnabled=` | `false` to disable the background stream entirely | `true` |
| `?jobChunk=` | ids processed per bulk-job tick | `500` |
| `?jobTick=` | ms between bulk-job ticks | `200` |

Example — hostile settings to stress the failure/rollback path:

```
http://localhost:5173/?failRate=0.9&latencyMin=100&latencyMax=300
```

Or to observe reconciliation with the stream firing rapidly:

```
http://localhost:5173/?streamInterval=300&streamBatch=20
```

## What's implemented

- **Rendering at scale** — every column virtualizes its rows (`@tanstack/react-virtual`); only
  cards near the visible scroll window are ever mounted, regardless of column size. Column
  header count/value totals are maintained incrementally, not recomputed per render.
- **Optimistic moves with honest failure** — dragging a card updates the board instantly. A
  failed write rolls the card back to its exact prior stage and position (anchored to a stable
  neighbor id, not a raw index — safe even if the background stream mutated that column while
  the move was in flight) and surfaces a dismissible, retryable toast. No silent rollback, no
  full-screen error. This guarantee holds for one in-flight move per card at a time — see
  `DESIGN.md`'s known gaps for the untested case where the same card is dragged again before its
  first move resolves.
- **Reconciliation with the background stream** — a card with an in-flight move or an active
  drag is protected from every incoming stream event; a version counter drops any stream event
  older than what the client already has. Scroll position never jumps from changes elsewhere in
  the list, because virtualization only repositions rows, it never re-mounts the scroll container.
- **Bulk move as a real async job** — filter by stage/owner/status/value range, move every match
  in one action. Reports live progress with a stalled/queued/running/done/failed status, handles
  partial failure without lying about counts, and survives a page refresh mid-job. Bulk-moved
  cards reconcile into the board through the exact same change-stream channel a live user's edits
  would use — not a special case. **Measured tradeoff, not hidden:** that reconciliation has a
  real main-thread cost during a large job (a ~26× frame-time regression, see `PERF.md`) — the UI
  doesn't lock up or become unresponsive, but scrolling/dragging noticeably degrades while a big
  job is actively ticking. Named (#2, after a correctness bug) in `DESIGN.md`'s priority list.
- **Keyboard path** — built alongside the mouse path from the start (dnd-kit's `KeyboardSensor`),
  not bolted on after. Focus is explicitly chased to the moved card after every optimistic move,
  confirm, and rollback, and to the bulk-move progress summary when a job finishes. Every async
  outcome is announced via an `aria-live="polite"` region, not just rendered.
- **Tests on the hard parts** — optimistic rollback (including a concurrent *background-stream*
  mutation edge case — see `DESIGN.md`'s known gaps for the one concurrency case that is **not**
  covered: dragging the same card again before its first move resolves), the reconciliation
  guards, and bulk-job state transitions (partial failure, refresh survival). Not a coverage
  number — each test is built to fail if a specific safety mechanism is removed.

## What's not implemented / explicitly out of scope

Per the brief: no auth, no real backend, no routing beyond the single board, no deal detail
pages/forms/notes/tasks/contacts, no custom fields, no pixel-matched design, no dark mode, no
responsive/mobile layout, no i18n, no deployment/CI.

See `DESIGN.md` for the full list of known gaps and what would be fixed first with more time.

## Repository

Real commit history — not one squashed commit. `git log --oneline --reverse` tells the actual
build story: scaffold, then the mock API, then the normalized store (reconciliation rules and
column virtualization landed together in that same commit), then optimistic move with an initial
rollback/toast/keyboard path (also one commit), then an id-collision fix and a small refactor,
then the bulk-move job engine, then a dedicated pass expanding the keyboard path and focus
management, then a run of real fixes found by testing the app live — a status-not-reconciled bug,
an unrequested status badge and a redundant per-card dropdown both removed after re-reading the
brief, a drag-visual bug, the rollback-anchor bug — then the test suite, then one more fix that
same testing pass surfaced (bulk moves not reaching the board), dependency cleanup, then these
docs.
