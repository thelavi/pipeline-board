# Performance

## Hardware and method

- **Machine:** Apple M4 Pro, 12 cores, 48GB RAM, macOS 26.7 (build 25G229).
- **Browser:** Chrome 154.0.8037.57, automated via the Chrome DevTools Protocol (not manual
  interaction), so every number below is reproducible by re-running the same script rather than
  observed once and described.
- **Build under test:** the production build (`npm run build && npm run preview`), not the dev
  server — React's development-mode extra checks and the unminified bundle would make dev-server
  numbers meaningless as a performance signal.
- **Dataset:** the app's default seed — 12 stages, ~25,000 opportunities total, heaviest column
  (New Lead) holding 10,000.
- Every measurement below states its exact method inline. Where a number is randomized by design
  (simulated network latency), several runs are reported rather than one cherry-picked run.

## Initial board render — time to interactive with the full dataset

**Method:** an init script installed before each page load starts a `requestAnimationFrame` poll
for the first `.card` element to appear in the DOM, resolving with `performance.now()` at that
point (a timestamp already relative to navigation start).

| Run | Config | Time to first card |
|---|---|---|
| 1 | default latency (300–1500ms jittered) | 1553ms |
| 2 | default latency | 442ms |
| 3 | default latency | 1133ms |
| 4 | `latencyMin=0&latencyMax=0` (isolates app cost from simulated network wait) | 63ms |

The spread across runs 1–3 is expected — it's dominated by the simulated jittered latency, by
design. Run 4 isolates what the app itself costs once that wait is removed: **63ms** from
navigation to the first virtualized row painted, for a 25,000-record normalized hydrate plus
initial render. Virtualization is why this number doesn't grow with dataset size — the same
~15–20 DOM rows get mounted whether the heaviest column holds 10,000 or 100,000 ids.

## Heaviest column, sustained scroll — frame timing

**Method:** the New Lead column (10,000 cards) scrolled programmatically end-to-end over 2.5s via
a `requestAnimationFrame` loop that both drives `scrollTop` and records the delta between
consecutive frame callbacks — this measures actual paint/layout/compositing cost per frame, not a
synthetic proxy. Measured idle (no background stream, no concurrent bulk job).

| Metric | Value |
|---|---|
| Total frames over 2.5s | 301 |
| Mean frame time | 8.31ms |
| Worst single frame | 17ms |
| Frames over 16.7ms (60fps budget) | 1 of 301 |
| Frames over 50ms (dropped-frame territory) | 0 |

A mean frame time of ~8.3ms is consistent with this machine's display refreshing at ~120Hz — the
practical read is that scrolling the heaviest column stays within budget essentially every frame,
with a single frame fractionally over threshold. This is the direct, expected payoff of column
virtualization: cost is bounded by the visible row window, not the 10,000 rows behind it.

## Drag-to-drop interaction — input latency

**Honest method note first:** an automated mouse/pointer-based drag (via CDP's synthetic drag
tool) did **not** register as a card move at all — column counts were unchanged before and after.
dnd-kit's `PointerSensor` requires a real sequence of `pointerdown` → multiple `pointermove` past
a 6px activation distance → `pointerup`, and synthetic drag-simulation tools don't reliably
reproduce that sequence (this matches an automation limitation already found earlier in this
build, using a different browser-automation tool). Rather than report a number for an interaction
that didn't functionally occur, this was measured on the **keyboard-drag path** instead — real
`keydown`/`keyup` events, which the browser treats as trusted input and which drive the *exact
same* `onDragEnd → beginOptimisticMove → render` code the mouse path would. The sensor differs;
the cost being measured (the drop's commit into state and the resulting render) does not.

**Method:** a `PerformanceObserver` on `{type: 'event', durationThreshold: 8, buffered: true}` —
the same Event Timing API that backs real INP — installed before the interaction, read back after.

| Event | Duration |
|---|---|
| Each intermediate arrow-key reposition | 16–32ms |
| The drop-committing keydown (Space) | 48ms |

48ms is the cost of the synchronous work the drop triggers: `beginOptimisticMove`'s Map copies,
`orderByStage`/`stageAgg` updates for two stages, and the resulting re-render of both column
headers plus the moved card. Comfortably within interactive-feeling territory (sub-100ms).

## During a large bulk job — interaction regression vs. idle

**Assumption stated plainly:** the brief's example ceiling is 50,000 cards; this build's total
seeded dataset is ~25,000 (see `DESIGN.md`). The job engine itself has no hardcoded cap — this
measures the largest job the current seed can produce, an unfiltered move of all ~25,000 cards.

**Method:** the same scroll frame-timing harness as above, run on the New Lead column while a
25,000-card bulk job (default `bulkJobChunkSize=500`, `bulkJobTickMs=200`) was actively
`running` (confirmed via the job's own progress readout at the moment of measurement, not assumed).

| Metric | Idle | During the bulk job |
|---|---|---|
| Mean frame time | 8.31ms | 218.62ms |
| Worst single frame | 17ms | 325ms |
| Frames over 50ms | 0 of 301 | 7 of 10 |

**This is a real, meaningful regression** — roughly a 26× increase in mean frame time, and the
page is functionally janky (worst frame 325ms) while a large job is actively ticking. Root cause,
identified directly from this session's own change: bulk moves now emit a change-stream event per
successful move (fixed earlier this session, so bulk-moved cards actually reconcile into the
board instead of silently changing server-side only) — every one of those events now pays the
full client reconciliation cost (guard checks, a version comparison, `Map` copies, aggregate
updates, and whatever re-renders result) on the main thread, for up to 500 cards per 200ms tick.
Before that fix, bulk-job ticks were nearly free on the client, because the client didn't know
they were happening — cheap, but silently wrong. This tradeoff is real and worth stating rather
than hiding: correctness (the board now actually reflects bulk moves live) was chosen over this
main-thread cost, and the fix that would resolve both — eliminating the O(n) `opportunitiesById`
copy every stream handler currently does per event — is named directly in **"what I'd do with
another week"** in `DESIGN.md`, motivated by this exact measurement. (It's ranked #2 there, after
a correctness bug found in the same review pass — a wrong-state bug outranks a performance one.)

*(A parallel measurement of keyboard-drag latency specifically during an active bulk job was
attempted but not cleanly captured — the job completed faster in wall-clock time than the retry
could land, at this dataset's ~25,000-card scale. The scroll-regression number above is the
primary, cleanly-captured evidence for this section.)*

## Memory — heap after scrolling the heaviest column end-to-end

**Method:** `performance.memory.usedJSHeapSize` (Chromium-specific; no standard equivalent exists)
read before and after a full programmatic scroll of the New Lead column (10,000 cards) from top
to bottom. Chrome was not launched with `--js-flags=--expose-gc`, so no forced GC ran before
either reading — both numbers include whatever the browser's own allocator/GC had already done,
not a clean immediately-post-GC baseline; stated so the numbers aren't read as more precise than
they are.

| | Used JS heap |
|---|---|
| Before scrolling | 25.38MB |
| After scrolling end-to-end | 33.43MB |
| Delta | +8.05MB |

An 8MB delta after mounting and unmounting several hundred virtualized rows in sequence is modest
and consistent with normal allocator behavior (retained closures, event listener bookkeeping,
some GC lag) rather than a leak — there's no unbounded growth pattern expected here since
`React.memo`'d cards unmount cleanly as they scroll out of the virtualizer's window. This wasn't
cross-checked against a full heap snapshot diff (no signal from this single before/after
delta warranted digging further, and doing so was out of the ~5–6 hour budget for this exercise).
