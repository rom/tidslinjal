# Release Notes — Tidslinjal v8.6.0

**Release Date:** 2026-04-13

v8.6.0 is a large feature release focused on the **Key Terrain Board** tool. It introduces a new **Battle Rhythm** subsystem — a shared exercise clock with cyclic steps, per-step colored borders, automatic snapshot scheduling, and forward / backward / fast-forward step navigation — plus a new **Comments** column, a significantly expanded zoom range, a step-level hover tooltip, terminology customization, and a fresh **Hungarian** locale (the 20th supported language).

Upgrading from 8.5.0 requires no data migration. Existing `key_terrain_settings.json` files are forward-compatible — the new battle-rhythm and column-label fields are optional and default to safe values when absent.

---

## New Features

### Battle Rhythm — shared exercise clock
A completely new subsystem under **Key Terrain Board → Settings → Battle Rhythm**.

**Configuration**
- **Cycle length** in minutes (e.g. 120 for a two-hour cadence).
- **Steps** — named events timed relative to H0 (the start of the current cycle). Offsets can be negative (`−15` = 15 minutes before H0) to support pre-H0 prep steps. Each step has an optional description, an end offset (leave blank for an instant step), and a **colour picker** that controls the board's outer border while the step is active.
- **Snapshot offsets** — a comma-separated list of minute offsets at which the board should be auto-captured (e.g. `0, 15, 60`).
- **Snapshot formats** — any combination of CSV, JSON, XML, SVG.

**Running the clock**
- **Start** immediately, or arm for a future wall-clock time by entering an `HH:MM` value beside the Start button. Armed clocks show a distinct "⏳ Waiting for 09:00" state with a live countdown and automatically flip to running the instant wall clock reaches H0. If the entered time has already passed today, the clock arms for tomorrow so the operator's intent is preserved.
- **Pause** / **Resume** — freezes and continues the clock without losing position. If a snapshot offset happens while paused, the scheduler holds off until resume.
- **Reset** — stops the clock and clears H0. Step definitions and cycle length are preserved.
- **Backward** `⏮` — rewinds the apparent clock position to the start of the previous step (or to H+0, or one full cycle back if already at H+0). Wall clock continues normally.
- **Forward** `⏭` — ends the current step now and **donates the leftover time to the next step**, which then runs longer than its original definition. The step definitions are mutated in place; the cycle length is untouched. (The mutation persists — reconfigure via Settings to restore the original sizes.)
- **Fast-forward** `⏩` — jumps the clock forward to the next step's nominal start. The current step is cut short, wall clock continues, and the cycle ends sooner than originally scheduled.

**Cross-user synchronization**
- The full clock state lives in `KeyTerrainSettings.BattleRhythm`. Every connected client polls `/api/key-terrain/battle-rhythm` every 2 seconds and extrapolates locally between polls for smooth countdown. Any Start / Pause / Reset / navigation action broadcasts a `key_terrain_change` SSE event so remote clients refresh within one round trip.
- The board's outer border fades smoothly between step colours as the active step changes.
- Cycles-completed counter in the widget and in every entry's new `# Cycles` column.

**Automatic cycle rollover**
- A per-minute server goroutine (`runDueBattleRhythmCycles`) detects cycle rollover and increments the `Rounds` counter on every non-archived entry by the number of cycles that elapsed since the last rollover. `BattleRhythmConfig.LastCycleIdx` persists state so restarts and delayed ticks do not double-increment. A `cycle_rollover` audit entry is written for each rollover.

**Snapshot scheduler**
- Alongside the cycle goroutine, `runDueBattleRhythmSnapshots` fires at each configured offset and writes the board in every configured format under `data/key_terrain_battle_rhythm/<cycle_start>/` on the server. Filenames are `h<offset>.<ext>`; `os.Stat`-based dedup prevents double-writes.
- **Snapshot file list** appears in Settings → Battle Rhythm so teamlead+ can inspect and download past captures directly from the admin UI.

**Step tooltip**
- Hovering the widget's left info block (BATTLE RHYTHM / H-offset / state cluster) pops a floating panel listing every step with its time range (e.g. `H+30 – H+75`), description, and per-step colour swatch. Currently-active steps are highlighted with the accent colour and an "← active" marker.

**Detached clock**
- The **Clocks** popup gains a *Battle Rhythm* button that adds a read-only card showing the same H-offset, current-step name, next-step countdown, and cycles-completed counter next to the other clocks.

**Overlapping steps**
- Two or more steps whose intervals genuinely overlap at the current position are both reported in the widget's "Now" field, joined with ` + ` (e.g. `Brief + Assess`). Step intervals use the half-open convention `[start, end)` so a single-point boundary (step A ending at 60 while step B starts at 60) is no longer a double-count — only step B is active at 60.

### Comments column on Key Terrain entries
A new free-form `comments` field on every Key Terrain entry, visible as a new column between **Actions** and the date columns. The column respects custom column labels, is sortable, is included in the filter panel, and is written to every snapshot format (CSV / JSON / XML / SVG). Line breaks entered in the textarea are preserved in the rendered cell via `white-space:pre-wrap`.

### Customizable column labels
Every Key Terrain Board column can be renamed per-deployment under **Settings → Column Labels**. The override is global (teamlead+ to edit), and the new label is used in the header, the filter panel, the hide-columns grid, the column-order editor, and print/export dialogs. Unset entries fall back to the localized default.

### "Function" terminology rename
The v8.3.0 rename of *Function* to *Capability* is reverted in the Key Terrain Board UI. Every display string that previously read "Capability" (column header, placeholder, load-from, linked-to, validation error) now reads "Function" in all 19 original languages. Backend field names (`capability_id`, `from_capability`) are **intentionally** left unchanged so existing integrations, exports, and the Resources tool keep working.

### Board zoom + window-fill
- The Key Terrain Board has its own zoom slider with **8 levels** (xxs / xs / sm / md / lg / xl / xxl / xxxl) covering font sizes from 9 px to 20 px. Zoom is per-browser (localStorage) so each operator can size the board to their screen without affecting others.
- When opened as the detached `/key-terrain` page, the board now fills the full window width so briefing-room displays get maximum data density.

### Hungarian (`hu`) — language #20
Hungarian has been added as the 20th supported language, bringing the locale list to: **English, Svenska, Français, Deutsch, Nederlands, Suomi, Íslenska, Dansk, Norsk, Eesti, Latviešu, Lietuvių, Italiano, Español, Português, Polski, Українська, Magyar, 日本語, 한국어**.

The initial Hungarian translation covers the visible UI surfaces (toolbar, sidebar, settings, event/layer/group/user dialogs, Key Terrain Board including Battle Rhythm, reports, filters, common status messages). Untranslated keys fall back to English via the i18n loader's `TRANSLATIONS[lang][key] || TRANSLATIONS.en[key]` chain, so every screen remains functional.

---

## Improvements

### In-board `?` help
The Key Terrain Board's `?` button now opens an expanded help modal with a dedicated **Battle Rhythm** section covering configuration, controls, cycle rollover and snapshots, and the detached clock card.

### Filter panel
- Function checkbox list is rebuilt from live entries every time the filter modal opens and is deduplicated case-insensitively.
- Filter match for function and comments is case- and whitespace-insensitive so "Power", " power ", and "POWER" collapse to a single match.
- Filter panel headings respect custom column labels.

### "# Rounds" → "# Cycles"
The `kt_rounds` translation key is relabeled from variants of "Rounds" to "# Cycles" in all 19 pre-existing languages. The column auto-increments by one on every battle-rhythm cycle rollover.

### Widget typography
- Battle rhythm widget fonts bumped one tier across the board (headline 22 → 28 px, state badge 10 → 12 px, info column 12 → 14 px) for readability from across a briefing room.

---

## Bug Fixes

- **Start button unclickable / time input blocked** — the widget's shell rebuild on layout transitions was inserting fresh DOM via `innerHTML=` without re-running the `_bindActions` dispatcher, so the new buttons had no click listeners. Every shell rebuild now re-binds the host immediately. Same fix applied to the per-step editor's remove buttons.
- **Start / Pause flash** — the SSE dispatcher forwarded `key_terrain_change` events without the payload, so `_ktHandleSSE` couldn't distinguish a clock control from an entry change and rebuilt the entire board on every tick. The dispatcher now forwards `CustomEvent` detail, and `_ktHandleSSE` branches on `detail.action` — `battle_rhythm_*` only polls the widget, `cycle_rollover` refetches entries only, everything else does the full refresh.
- **Scheduled → running transition delay** — the widget could sit on "⏳ 0s" for up to 2 s after H0 because the poll interval is 2 s. The frontend now self-heals: when the local countdown crosses zero or the client's wall clock is already past `started_at`, the widget flips to `running` layout immediately and force-triggers a poll guarded by `_ktBrFireOnH0`.
- **JS syntax error from double-escaped apostrophe** in the fast-forward tooltip fallback string (`\\'s` terminated the single-quoted literal early and left the rest as stray syntax inside the surrounding template expression). Fixed to single-backslash `\'`.

---

## Tests added

- `TestComputeBattleRhythmState` — H0 tracking, modulo-cycle position, pause freezing, current/next step selection with negative offsets.
- `TestComputeBattleRhythmStateScheduledTransition` — pins the scheduled→running transition at 5 min before / 1 ns before / exactly at / 30 s after H0; also asserts `state.started_at` is echoed so the "Waiting for HH:MM" subline has a stable value.
- `TestComputeBattleRhythmStateOverlappingSteps` — verifies `CurrentSteps` reporting for real overlaps (e.g. `Brief = [30, 75)` and `Assess = [60, 90)` → both active at H+70) and that single-point boundaries (step A ends at 60, step B starts at 60) do NOT double-count at position 60.
- `TestResolveBattleRhythmStartTime` — empty → now; future HH:MM today → today; past HH:MM today → tomorrow; bad input → error.
- `TestComputeBattleRhythmStepShift` — backward / fast_forward at mid-step, rollover past the last step, rewind from H+30 → H+0, rewind from H+0 → one full cycle back, and the `forward` action explicitly rejected (it goes through `donateLeftoverToNextStep` instead).
- `TestDonateLeftoverToNextStep` — first forward at H+45 in Brief truncates Brief to 45 and moves Assess's start back to 45 (Assess grows from 30 to 45 min), second forward at H+60 inside the grown Assess, forward at H+100 with no next step truncates the current step only, and the input slice is never mutated in place.
- `TestRunDueBattleRhythmCycles` — no-op inside cycle 0, increments every active entry's `Rounds` by the delta on rollover, ignores archived entries, re-running at the same `now` is a no-op (dedup via `LastCycleIdx`), and three cycles → Rounds = 3.
- `TestRunDueBattleRhythmSnapshots` — end-to-end scheduler run against a fresh test app writes the expected files to the snapshots dir and re-running does not overwrite them.
- `TestRenderBattleRhythmCSV/JSON/XML/SVG` — smoke tests that every snapshot format serialises correctly and includes the new `comments` column.

Full `go test ./...` green.

---

## Upgrading

No schema changes. First start after the upgrade:

1. Existing sessions continue to work. Any existing `key_terrain_settings.json` loads cleanly — the new `column_labels`, `battle_rhythm`, and step-colour fields are optional and default to empty / safe values.
2. Hungarian is enabled by default. If you use `--languages` or `--disable-languages` to whitelist/blacklist, adjust the list accordingly (`hu` is a new code to consider).
3. If you want the Key Terrain Board's "# Cycles" column to auto-increment, configure a Battle Rhythm under **Settings → Battle Rhythm** — set *Enable battle rhythm*, pick a cycle length, define at least one step, and press Start. The per-minute scheduler does the rest.
4. Downgrading to 8.5.0 is safe — v8.5.0 parsers will ignore the unknown fields in `key_terrain_settings.json`. The on-disk battle-rhythm snapshot files under `data/key_terrain_battle_rhythm/` will simply be orphaned but harmless.

---

## Acknowledgements

The Hungarian locale was added "as a congratulation to an election where democracy won". Gratulálunk, és isten hozott Magyarország a Tidslinjal közösségében! 🇭🇺
