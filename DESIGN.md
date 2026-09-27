# Design

**Framework deviation, stated up front:** this brief specifies Vue 3 + Composition API. This is
built in React 19 + TypeScript instead — a deliberate, disclosed choice, not an oversight. Every
decision below is framework-agnostic in substance; where a library is React-specific, its direct
Vue equivalent is named alongside it, because the brief is explicit that a library decision is
still mine to own and defend as if I'd written it myself.

## Libraries, and why

| Library | Role | Why this one |
|---|---|---|
| **Zustand** | client state | Selector-based subscriptions re-render only the component reading a changed slice — essential at 10k+ rows, where React Context re-renders every consumer on any Provider value change regardless of what it reads. Its direct `store.foo()` call style matches how this state is actually used: imperative commands with encapsulated invariants, not a dispatched-action log anyone needs to replay. (Vue equivalent: Pinia, for the same selector-granularity reason over a single reactive `provide`/`inject` tree.) |
| **dnd-kit/core** | drag-and-drop | Ships `PointerSensor` and `KeyboardSensor` as equally first-class, swappable inputs. react-beautiful-dnd (the obvious alternative) is archived/unmaintained, and its keyboard support — built for reordering within a single list — is known to be unreliable for moving an item across separate lists, which is this board's primary interaction. |
| **@tanstack/react-virtual** | column virtualization | The entire answer to "10,000 cards in one column." Mounts only rows near the visible scroll window. (Vue equivalent: `@tanstack/vue-virtual`, same core.) |
| **Vitest** | test runner | Reuses the exact Vite config already driving the dev server — no second build pipeline to keep in sync. Native ESM, materially faster than Jest, and API-compatible (`describe`/`it`/`expect`) so nothing about test-writing style changes. |

No data-fetching library (React Query, etc.) — the mock API's shape (imperative async functions
plus a push-based change-stream subscription) doesn't fit a request/cache model well; the store
already owns caching, staleness, and merge logic by necessity, so a fetch-caching layer on top
would duplicate that instead of simplifying it.

## Rendering 10,000 cards

Client state is normalized: `opportunitiesById: Map<id, Opportunity>` plus a separate
`orderByStage: Map<stageId, id[]>` for ordering — never opportunities nested inside their stage.
Any card can be found in O(1) by id regardless of which stage it's currently in, which matters
because every background stream event and every rollback references only an id.

Each column virtualizes independently (`@tanstack/react-virtual`, fixed 72px row height, 8-row
overscan): only the rows within the scrolled viewport (plus a small overscan buffer) are ever
mounted as DOM nodes. A column holding 10,000 ids renders roughly 15–20 actual `<Card>`
components at any moment; the rest exist only as an id and an index. Rows are positioned with
`transform: translateY(...)` rather than `top`, so scrolling is a GPU-composited transform, not a
layout recalculation, on every frame.

On top of virtualization, every `Card` is wrapped in `React.memo` and reads its own narrow
per-id selector (`s => s.opportunitiesById.get(id)`). Without this, any store update anywhere —
even a background stream tick touching one unrelated card in a different column — would
re-render every mounted card, because the column's render function creates a new `<Card>`
element on every pass regardless. With memo plus a granular selector, a card only re-renders when
its own data actually changed.

Column header aggregates (count, total value) are maintained **incrementally** — every mutator in
the store calls an `adjustAgg(stageId, deltaCount, deltaValue)` with a signed delta — rather than
recomputed by summing the full per-stage array on every render. This is what keeps header numbers
O(1) regardless of column size, at the cost of an invariant that must hold everywhere: any store
mutation that changes membership or value **must** call `adjustAgg`, or the header silently
drifts from the true state. This invariant is not currently covered by a dedicated property-based
test (see Known gaps).

**What this costs:**

- **Drag** — a card being dragged must render its floating visual in a layer outside any single
  column's stacking context (`<DragOverlay>`, rendered once at the board root), not via a
  transform applied to the card in its original position — a transform on the source card can
  only move it within its own column's stacking context, so a drop target several columns away
  would visually overlap neighboring rows in the *origin* column instead of floating anywhere
  (this was an actual bug caught mid-build, fixed by introducing `CardDragPreview` + `DragOverlay`).
- **Keyboard focus across a virtualization boundary** — a card moving stage unmounts from one
  virtualized list and mounts fresh in another. React cannot preserve a DOM node or its focus
  ring across that boundary. The fix is explicit, not automatic: every card carries a stable
  `id="card-<id>"`, and the move hook re-focuses that id (inside a `requestAnimationFrame`, so it
  runs after the new DOM node exists) after every optimistic move, confirm, and rollback.
- **Find-in-page (Ctrl/Cmd+F)** breaks for any card not currently mounted. The browser's native
  find can only match text in the DOM; a card 8,000 rows below the fold in a 10,000-row column
  simply isn't there to match. This is an accepted, known cost of virtualization, not fixed here —
  a real fix would mean a separate, non-virtualized search index over the full dataset with a
  jump-to-row action, which is out of scope for this brief.

## Server state vs. optimistic state, and how rollback is expressed

`board.store.ts` holds two overlapping representations of truth: `opportunitiesById` (the current,
possibly-optimistic view rendered on screen) and `pendingMoves: Map<id, PendingMove>` (every card
with a move currently in flight, and enough information to undo it).

A drag-drop or keyboard move calls `beginOptimisticMove(id, toStageId)`, which mutates
`opportunitiesById`/`orderByStage`/`stageAgg` **synchronously, before the network call is even
issued** — the UI never waits on a round-trip for the common case. It simultaneously records a
`PendingMove`:

```ts
interface PendingMove {
  fromStageId: string
  fromIndex: number            // fallback only
  fromNeighborId: string | null   // the real rollback anchor
}
```

The move is expressed as an *inverse operation*, not a snapshot: rollback doesn't restore a saved
copy of prior state (which would go stale the instant anything else in that list changes); it
re-derives the correct position from `fromNeighborId` — the id of whichever card sat immediately
before this one at move-start. On rollback, the code finds wherever that neighbor currently sits
(which may have moved, due to the background stream, since the optimistic move began) and
reinserts right after it. A raw saved index would silently point at the wrong slot the instant a
stream event inserted or removed a row above it; anchoring to a neighbor's *identity* stays
correct regardless of what else moved around it in the meantime. If the neighbor itself was also
removed while the move was in flight, rollback falls back to a clamped version of the original
index rather than crashing or losing the card.

On success (`confirmMove`), the pending entry is deleted and the card's local copy is replaced
with the server's authoritative, version-bumped record. On failure (`rollbackMove`), the inverse
operation above runs, then the entry is deleted, and a dismissible toast appears with a **Retry**
button that closes over the exact same move parameters — clicking it re-runs the identical
`beginOptimisticMove` → network call → confirm/rollback sequence.

**Why this recovery shape, specifically, and not the two the brief calls out as wrong:** a silent
rollback with no visible signal leaves a user who glanced away wondering why the card snapped
back, with no path to retry short of redoing the drag from memory of where they left it. A
full-screen error interrupts a workflow where, at a stated 10% failure rate, a user will hit this
several times *per session* — a full-screen blocker at that frequency is disproportionate to the
actual severity (one card, one field, briefly wrong; nothing destructive, nothing lost). A
dismissible toast with an explicit retry sits between those: visible enough to notice, small
enough not to interrupt the next drag, and it hands the user the one action — retry — that
actually resolves it, instead of leaving them to re-discover the gesture.

## Reconciliation rules

Stated precisely enough to implement from this description alone. Every incoming background
change-stream event, for every affected card, passes through two independent gates, **in order**,
before it's allowed to mutate the client's copy:

1. **Protected-from-stream.** If the card's id is a key in `pendingMoves`, or equals the
   currently-tracked `draggingId`, the event is dropped unconditionally — no further checks. A
   card the local user has an in-flight optimistic action on, or is actively holding via drag, can
   never be overwritten by a background event, full stop, regardless of that event's version.
2. **Version gate.** Every opportunity carries a `version` integer, incremented by exactly 1 on
   every server-side write. If the client's existing copy of a card has `version >= incoming.version`,
   the incoming event is dropped — it cannot be newer information than what's already shown.
   Necessary because the mock network has jittered latency: events can arrive out of order, and a
   stale one must never overwrite a fresher local copy.

A **create** event skips rule 1 entirely — a brand-new id cannot already be pending or dragging on
the client, so there's nothing to protect against.

Two secondary guarantees, both enforced structurally rather than by a runtime check:

- **The user's scroll position never jumps from changes elsewhere in the list.** Virtualization
  computes visible rows from scroll offset and item count; a card appearing/disappearing above
  the fold changes which *ids* occupy which slots, but the scroll container's own scrollTop is
  never touched by any store mutation — there is no code path that resets or adjusts scroll
  position in response to a stream event.
- **Every list mutation returns new array references, never splices in place.** `orderByStage` is
  only shallow-copied (`new Map(orderByStage)`) by every store function; the arrays it points to
  are shared with the previous state until explicitly replaced. An early version of this code
  spliced those arrays in place — Zustand's `Object.is` equality check saw no reference change, so
  a column subscribed to that array silently stopped re-rendering on reorder, while its header
  (backed by a separately-replaced aggregate map) kept updating correctly. Fixed by making every
  mutator (`withRemoved`/`withInserted`) return a fresh array via `.slice()`.

## Bulk job state model

A bulk move is modeled as two independent, cooperating state machines — one server-side, one
client-side — because they answer two different questions.

**Server-side (`bulkJobs.ts`):** `startBulkJob(filter, toStageId)` resolves the filter to a
concrete list of ids *once*, at start, stored as `pendingIds` on an in-memory job record with
states `queued → running → completed | failed`. A single shared ticking interval (started lazily,
stopped automatically once no job is active) chunks through up to `bulkJobChunkSize` ids per tick,
applying the same failure-rate roll as any other write, and persists the **full job record** to
`localStorage` after every tick. This is what "the work completes over the following seconds and
can partially fail" actually means mechanically: `processed`, `succeeded`, and `failed` are
independent running counters — `succeeded + failed` always equals `processed`, and the job only
reaches a terminal state once `processed === total`. Nothing is ever inferred; every count is
exact.

**Client-side (`useBulkJob`):** polls `getBulkJobStatus` on its own interval and persists, to a
*separate* `localStorage` key, only a pointer — "which jobId am I currently watching" — not the
job's state itself. On mount, if that pointer exists, it resumes polling that job id immediately.
This is the refresh-survival mechanism: a hard page refresh loses all in-memory state on both
sides, but the server's full job record and the client's "watch this id" pointer both survive in
`localStorage`, so a resumed session picks up exactly where it left off, whether the job finished
while the tab was closed or is still running.

Two things bulk-move deliberately reuses rather than special-cases: (1) a successful bulk move
emits the same `ChangeStreamEvent` a live background edit would, so it reconciles through the
identical `isProtectedFromStream` + version-gate path as any other card update — a card the user
happens to be mid-dragging during a bulk job is still protected; (2) partial failure is reported,
never hidden — the UI explicitly renders "`X` moved, `Y` failed of `Z`" rather than collapsing to
a single success/failure boolean.

**Assumption, stated explicitly:** the brief's "up to 50,000" cards is larger than this build's
total seeded dataset (~25,000 across all 12 stages combined — the heaviest single stage, New
Lead, holds 10,000). A filter matching literally everything therefore caps out around 25,000 in
this environment. The job engine itself has no hardcoded ceiling — `pendingIds` is an arbitrary-
length array processed in fixed-size chunks — so this is a seed-size limitation, not an
architectural one; regenerating the seed with larger `seedCount`s would exercise the full 50,000
path unchanged.

## The keyboard path

Built alongside the mouse path, not after: both sensors (`PointerSensor`, `KeyboardSensor`) are
registered on the same `DndContext`, and every `Card`'s draggable wiring
(`useDraggable`'s spread `attributes`/`listeners`) is what makes it keyboard-operable — no
separate keyboard-only code exists for the drag interaction itself, because dnd-kit's keyboard
sensor operates on the exact same drag lifecycle (`onDragStart`/`onDragEnd`) the mouse path does.

What *is* hand-written specifically for the keyboard/screen-reader path: focus is explicitly
chased to the moved card's stable DOM id after every optimistic move, every confirm, and every
rollback (see rollback section above — the same reasoning applies symmetrically to the happy
path). A bulk-move job has no single card to return focus to when it finishes, so focus instead
moves to the progress summary line itself the moment the job transitions to a terminal state.
Every async outcome — move started, move confirmed, move failed and rolled back, bulk job
progress — is pushed through an `aria-live="polite"` region, so a screen-reader user hears the
outcome without needing to have focus anywhere near where it happened.

The focus-chasing itself has a real edge case, not just a theoretical one — see Known gaps below:
if the target card falls outside the column's current virtualized window, the element it's looking
for doesn't exist yet and the focus call is a silent no-op.

**Verified, not just reasoned about:** a full mouse-free pass was driven directly through the
browser — Tab to a card, Space to pick it up, arrow keys to move it across a column boundary,
Space to drop. The column counts and totals updated correctly on both ends (10,000/5,000 →
9,999/5,001) with no mouse input at any point. This isn't inferred from dnd-kit's documentation or
from reading the sensor's source — it's an observed, reproducible result.

## What breaks at 10×

**100,000 cards in one column:** the first thing to fail is **not** rendering — virtualization
mounts a fixed ~15–20 rows regardless of whether the column holds 10,000 or 100,000, so scroll and
paint cost shouldn't change materially. The first real cost is **memory for the normalized state
itself**: `opportunitiesById` and `orderByStage` hold a live JS object plus an array slot for
every one of the 100,000 ids, all the time, whether or not they're rendered — that's a much larger
resident heap than today's ~25,000-record dataset, and the first thing I'd actually measure before
assuming it's fine.

**A 500,000-card bulk move:** the first thing to fail is `findMatchingIds` — a single synchronous
linear scan (`for (const opp of opportunities.values())`) over the entire dataset, executed
**inside the request that starts the job**, before any chunking begins. At 500,000 records, that
scan alone could be tens to low-hundreds of milliseconds of blocked main thread before the job
handle is even returned — today's job engine already chunks *processing*, but
never chunks or defers the initial *match-finding* step. That's the first thing I'd fix if this
number were real: make `findMatchingIds` itself incremental/chunked, or move it off the main
thread.

## Known gaps, said plainly

- **The rollback guarantee above holds for one in-flight move per card, not two.** Nothing stops a
  card from being dragged again before its first move's network call resolves — `useDraggable` has
  no guard tied to `isPending`. `beginOptimisticMove` unconditionally overwrites the existing
  `pendingMoves` entry, so the second drag's anchor replaces the first's. If the first call
  resolves after that, `confirmMove` deletes what is now the *second* drag's pending entry and
  snaps the card to the first call's destination — visibly wrong, since the card was already moved
  on. If the second call then fails, `rollbackMove` finds no pending entry left (already deleted)
  and silently no-ops, while the toast still fires and claims the card "was returned to its
  previous stage" — which may not be true. Found during this project's own review, not covered by
  the current test suite (which only exercises a single in-flight move per card), and the single
  highest-priority correctness bug in this codebase.
- **Post-move focus can silently fail to land anywhere.** `focusCardWhenRendered` calls
  `document.getElementById('card-' + id)` with no fallback. If the card's post-move or
  post-rollback position falls outside its column's current virtualized visible+overscan window
  (for example: the user scrolls the origin column elsewhere during the 300–1500ms the network
  call is in flight), the element doesn't exist yet and focus goes nowhere — the announcer still
  reports the outcome via `aria-live`, but a keyboard/screen-reader user's focus itself is left
  wherever it happened to be, not "somewhere sensible" as the brief requires.
- `stageAgg`'s incremental-delta invariant (every mutator must call `adjustAgg`) is not covered by
  a dedicated test that would catch a missed call site causing silent header drift.
- The bulk job's `isStalled` heuristic (`STALL_AFTER_MS = 3000`) has never been observed actually
  firing — the mock engine ticks fast enough in practice that a genuine stall hasn't occurred.
- A toast's Retry button has no guard against being clicked twice before the first retry resolves.
- A thrown error inside a bulk job's per-id move call is indistinguishable from a simulated
  random failure — both just increment the same `failed` counter.
- UUID-based id generation is probabilistically collision-free, not provably so — worth stating
  precisely rather than overclaiming "guaranteed."

## What I'd do with another week, ranked

1. **Fix the concurrent re-drag bug.** The brief weighs "how you handle async and optimistic
   state" heaviest of everything it evaluates, and this is a real correctness bug in exactly that
   mechanism: `pendingMoves` only tracks one anchor per card, so a second drag before the first
   resolves corrupts the rollback and can produce a toast that lies about what happened. Fix is
   straightforward — either disable dragging a card while it has a pending move (simplest), or
   queue/chain moves per card instead of overwriting the anchor. Ranked above the bulk-job
   performance regression below because this is a correctness gap, not a performance one.
2. **Batch the change-stream events a bulk job emits, or move its per-tick reconciliation off the
   main thread.** Measured directly in `PERF.md`: emitting one change-stream event per
   successfully-moved card (fixed this session, so bulk moves actually reconcile into the board
   live instead of silently only changing server-side) turned out to cost real main-thread time —
   scroll frame time during a 25,000-card bulk job went from a mean 8.31ms idle to 218.62ms while
   the job was actively ticking, a ~26× regression, with the worst frame at 325ms. The precise
   cause: every `applyStream*` handler does `new Map(opportunitiesById)` — a full O(total
   opportunity count) copy — on every single event, even though no selector needs that particular
   map's reference identity (unlike `orderByStage`'s per-stage arrays, which genuinely do).
   Eliminating that copy removes the dominant cost without touching the correctness fix from
   earlier this session.
3. **Real profiler measurements under a 100,000-row seed and a genuinely 500,000-row bulk filter**
   — confirm or correct the "what breaks at 10×" predictions above with actual numbers instead of
   reasoning from the architecture.
4. **A property-based test for the `stageAgg` invariant** — apply N random sequences of
   moves/edits/creates/deletes and assert the incremental aggregate always equals a full re-sum.
5. **Chunk or defer `findMatchingIds`** so starting a bulk job on a much larger dataset doesn't
   block the main thread proportional to dataset size.
6. **A visible on-board indicator for a card whose retry is already in flight**, closing the
   double-retry gap above (and directly related to item 1).
