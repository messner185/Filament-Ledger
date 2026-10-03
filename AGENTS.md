# Repository Guidelines

## Project Structure & Module Organization

Filament Ledger is a local browser application with no backend or build step. Root-level `index.html` and `style.css` define the interface. `script.js` handles events, rendering, browser storage, and file selection. Keep calculations, inventory updates, and backup validation in the pure functions in `core.js`; keep slicer parsing in `importer.js`.

`tests/core.test.js` covers business logic and G-code parsing. `tests/fixtures/` contains synthetic import examples, not printer-ready files. `vendor/` contains JSZip and its license; do not edit the vendored library. Update `README.md` when workflows or supported import behavior change.

## Build, Test, and Development Commands

- `python -m http.server 5500 --bind 127.0.0.1`: serve the repository locally; open `http://localhost:5500`.
- VS Code **Open with Live Server** on `index.html`: alternative local development server.
- `npm test`: run `node --test tests/*.test.js`; use Node.js 22 or newer.

No dependency installation or compilation is required. Serve over HTTP because the application uses JavaScript modules. Keep the same hostname and port to retain access to browser inventory.

## Coding Style & Naming Conventions

Follow the existing two-space indentation, semicolons, and single-quoted JavaScript strings. Use ES modules, `camelCase` functions and variables, and uppercase constants such as `VERSION`. Match existing hyphenated HTML IDs and CSS classes. No formatter or linter is configured; avoid unrelated reformatting.

## Testing Guidelines

Use `node:test` with `node:assert/strict`. Place automated tests in `tests/*.test.js` and give cases descriptive behavior-based names. Cover changed calculations, stock transitions, validation, and parsing edge cases; no numerical coverage threshold is configured. For interface or browser import changes, manually verify affected workflows, refresh persistence, and desktop/mobile layout through the local server.

## Commit & Pull Request Guidelines

This checkout has no available Git history. Use concise imperative commit subjects, such as `Fix duplicate spool consumption`. PRs should describe the behavior change, link relevant issues, report automated and manual checks, and include screenshots for visual changes.

## Data & Configuration Safety

Inventory lives in localStorage under `filament-ledger-v1`. Preserve backup validation and atomic saves; export a backup before storage-format changes. Render user and imported text with `textContent`. Keep missing import estimates available for manual review.
