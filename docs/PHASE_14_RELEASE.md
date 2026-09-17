# Phase 14 — Testing, Performance, and Release

Phase 14 adds a lightweight release pipeline suitable for the local-first smartphone/tablet application.

## Verification commands

- `npm run lint` checks JavaScript syntax, manifest metadata, CSP presence, and prohibited inline shell code.
- `npm run security:check` checks restrictive CSP directives, unsafe dynamic rendering patterns, and provider-secret exclusion.
- `npm run typecheck` checks all TypeScript domain modules with strict optional-property rules.
- `npm test` runs the phase contract suite.
- `npm run test:unit` compiles the TypeScript library into a temporary directory and runs financial/domain tests for formulas, dividends, corporate actions, portfolio allocation, freshness/conflicts, and audit hashing.
- `npm run test:integration` runs the cross-phase contract checks.
- `npm run test:e2e` performs a dependency-free shell smoke check across the HTML, dashboard, privacy, install, and service-worker paths.
- `npm run accessibility:check` checks document language, landmarks, mobile viewport, explicit button types, and dynamic status announcements.
- `npm run performance:check` checks bounded feed rendering and mobile overflow safeguards.
- `npm run pwa:check` validates install metadata and offline-shell contracts.
- `npm run build` creates a clean `dist/` static deployment directory and compiles the TypeScript library under `dist/lib/`.
- `npm run release:check` runs the complete release gate.

## Coverage

The domain tests cover financial formulas, inflation conversion, dividend continuity, splits, demergers, allocation/residual cash, stale/conflicting data, and deterministic audit hashes. Existing phase contracts cover backtest point-in-time filtering, benchmark alpha, recommendation transitions, alert deduplication/status, report versioning, backup recovery contracts, offline behavior, and PWA installation.

The static shell checks cover keyboard-oriented semantics, touch/mobile layout safeguards, CSP, safe text rendering, and bounded alert/activity feeds. The shell remains dependency-light to avoid adding a heavy runtime to users’ devices.

## Release boundary

`release:check` is the local/CI gate. It does not claim to replace a real-browser device matrix: before public release, run the built `dist/` directory on at least one current smartphone browser and one tablet browser, testing install, offline reopen, IndexedDB persistence, backup restore, notifications permission, print-to-PDF, zoom, keyboard navigation, and screen-reader announcements.

No mandatory server, PostgreSQL, cloud account, or background job is added by this phase.
