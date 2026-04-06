# Release Notes — Tidslinjal v8.3.0

**Release Date:** 2026-04-06

---

## New Features

### Key Terrain Board — Owner Column & Checkbox Filters
- **Owner column** — new column displaying the owner of each linked capability; hidden by default (toggle via Columns visibility panel); sortable by clicking the header
- **Owner field on capabilities** — new "Owner" field added to the capability resource form, separate from the existing "Ownership" (responsible) field; synced automatically to Key Terrain Board entries
- **Capability checkbox filter** — filter panel now includes checkboxes for all capability names present in entries, complementing the existing text search
- **Priority checkbox filter** — checkboxes for priority values 0–10, complementing the existing number input
- **Status checkbox filter** — checkboxes for Working/Degraded/Down/Unknown, complementing the existing dropdown
- **Trend checkbox filter** — checkboxes for Improving/Stable/Worsening, complementing the existing dropdown
- All checkbox filters are unset by default and work as OR within their group, AND across groups

### 8 New Visual Themes
- **Sand** — warm desert tones (tan, beige, amber)
- **Matrix** — green-on-black terminal/hacker aesthetic
- **Sunset** — warm orange, amber, and deep purple tones
- **Light Blue Sky** — bright light theme with sky-blue accents
- **Ocean** — deep ocean blues and teals
- **Forest** — deep greens and earthy tones
- **Accessible** — high-contrast light theme optimized for readability
- **Crimson** — dark theme with deep red/crimson accents

All themes include full CSS variable definitions (backgrounds, borders, accents, text colors, scrollbars, cell hover/lock states) and are selectable in the Settings sidebar.

### Language Additions
- **Japanese (日本語)** — added to sidebar language selector, profile dropdown, and toolbar flag buttons (🇯🇵)
- **Korean (한국어)** — added to sidebar language selector, profile dropdown, and toolbar flag buttons (🇰🇷)
- Tidslinjal now supports **19 languages**

---

## i18n Improvements

### Settings Panel Internationalization
- Wrapped **36 previously hardcoded strings** in the Settings sidebar with `t()` calls for full translation support:
  - Theme button labels and tooltip descriptions (all 12 themes)
  - Timezone section (Browser Default, clock format, Local time, ZULU/UTC, extra clocks)
  - Week number styles (ISO, Year+Week)
  - Notification buttons (Granted, Enable Notifications)
  - Offline/Online status labels
  - Artificial time status indicators (Active, Not set, Disabled)
  - Terminology buttons (Group/Unit/Team, Users/Soldiers/Personnel, Exercise/Incident/Operation)
- Added **11 missing i18n keys** that had fallback values but no translation entries (tactical font settings, show_out_of_hours, show_days_to_epoch, ticker_enable, user_label, operation_mode)
- Added **60+ new translation keys** to all 19 language files

---

## Backend Changes

- Added `Owner` field to `Room` model (capability resources)
- Added `owner_name` field to `KeyTerrainEntry` model
- Owner automatically synced from linked capability to Key Terrain entries (same pattern as zone, status, and responsible)
- HTML sanitization applied to the Owner field on room save

---

## Bug Fixes

- None in this release

---

*Full documentation: [README.md](../README.md) | [User Manual](USER_MANUAL.md)*
