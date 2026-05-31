# English Version Sync Status

**Last updated:** May 31, 2026
**Hebrew repo:** `mygoalmentorapp/catering-manager-hebrew`
**English repo:** `mygoalmentorapp/catering-manager-english`

---

## Current State

### What was completed:

1. **Logic sync from Hebrew → English** — ALL source code directories were copied from the Hebrew repo:
   - `app/`, `components/`, `lib/`, `hooks/`, `server/`, `admin/`, `scripts/`, `__tests__/`, `tests/`
2. **Dependencies synced** — `package.json` and `pnpm-lock.yaml` are identical to Hebrew (including expo-clipboard removal fix)
3. **Config files synced** — `tailwind.config.js`, `theme.config.js`, `theme.config.d.ts`, `tsconfig.json`, `global.css`, `vitest.config.ts`, `todo.md`
4. **English-specific files preserved** — `app.config.ts`, `eas.json`, `design.md`, `GITHUB-README.md` were NOT overwritten (they have English bundle ID, app name, etc.)

### What still needs to be done:

1. **Translate Hebrew UI text to English** — 85 files contain Hebrew text (UI strings, alerts, placeholders, error messages, i18n keys). These are currently exact copies of the Hebrew source.
2. **Convert RTL → LTR layout** — Files contain `writingDirection: "rtl"`, `textAlign: "right"`, `flexDirection: "row-reverse"` that need to be changed to LTR equivalents.
3. **Currency symbol** — Some files use `₪` (shekel) that should be `$` for the English version.

### Important notes:

- The source files are **clean copies from Hebrew** — no partial/corrupted translations. A previous translation attempt corrupted files (single Hebrew letter "ו" was replaced with "and" inside Hebrew words), so all files were restored to clean Hebrew originals.
- The **logic, features, bug fixes, and dependencies are 100% synced** with the Hebrew version as of May 31, 2026.
- The biggest file to translate is `admin/src/lib/i18n.ts` (~341 Hebrew lines — this is the admin panel internationalization file).

---

## Files with Hebrew text (85 files)

### Top files by Hebrew content:
- `admin/src/lib/i18n.ts` — Admin panel i18n translations (~341 lines)
- `app/products.tsx` — Product management screen (~74 lines)
- `app/settings.tsx` — Settings screen (~45 lines)
- `app/orders.tsx` — Orders list screen (~39 lines)
- `app/order.tsx` — Order detail screen (~37 lines)
- `server/cloud-data-router.ts` — Cloud data API (~36 lines)
- `app/changes-review.tsx` — Changes review screen (~32 lines)
- `components/CateringAuthScreens.tsx` — Auth screens (~30 lines)
- `app/auth/signup.tsx` — Signup screen (~30 lines)
- `components/device-gate.tsx` — Device gate screen (~28 lines)

### All affected directories:
- `app/` — Screen files with Hebrew UI text
- `components/` — Component files with Hebrew UI text
- `lib/` — Utility files with Hebrew strings
- `hooks/` — Hook files with Hebrew strings
- `server/` — Server files with Hebrew error messages
- `admin/` — Admin panel with Hebrew i18n
- `scripts/` — Seed scripts with Hebrew test data
- `tests/` — Test files with Hebrew test strings
- `__tests__/` — Unit tests with Hebrew test strings

---

## How to continue

When resuming work on the English version:

1. Read this file first
2. Do NOT re-copy files from Hebrew (already done)
3. If Hebrew version has new changes since May 31 2026, sync those specific changes first
4. Then translate all Hebrew text to English in the 85 files
5. Convert RTL layout directives to LTR
6. Replace ₪ with $
7. Test and commit

### Translation approach (recommended):
- Use a comprehensive Python dictionary-based replacement script
- Sort replacements by length (longest first) to avoid partial matches
- **DO NOT** include single Hebrew letters (like "ו" → "and") — they corrupt Hebrew words
- Process `admin/src/lib/i18n.ts` separately as it's the largest file
- After dictionary pass, manually review remaining Hebrew strings

---

## Hebrew version reference

The Hebrew version (sandbox + GitHub) was at these versions when sync was done:
- `app.config.ts` version: `1.2.60`
- `expo`: `~54.0.29` (resolved to 54.0.35)
- `expo-clipboard`: **REMOVED** (was causing APK crash)
- Last Hebrew commit: `c420e9d` on `main` branch
