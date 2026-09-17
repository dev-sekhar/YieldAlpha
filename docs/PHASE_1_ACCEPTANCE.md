# Phase 1 Acceptance Criteria

Phase 1 is complete when the project has a decision-complete architecture for the local-first mobile PWA and the following questions have documented answers.

## Architecture

- The application is defined as a static, installable PWA with local persistence.
- IndexedDB is the system of record for the device-local workspace.
- Web Workers are assigned to imports, model calculations, backtests, robustness runs, and other heavy tasks.
- UI components do not own financial calculations, provider parsing, persistence, or audit mutation.
- Domain boundaries and data-flow responsibilities are documented.
- The design remains compatible with future Capacitor packaging.

## Mobile and browser behavior

- Smartphone is the primary layout target and tablet is a supported enhancement.
- Required browser capabilities and fallbacks are documented.
- Storage quota, memory, import-size, and rendering constraints are documented.
- Offline, stale-data, unavailable-data, and provider-failure behavior is explicit.
- Background refresh limitations are communicated to users.
- Notification support is optional; the in-app alert center is authoritative.

## Data and provenance

- All financial values have a defined provenance and freshness state.
- Live provider access is limited to browser-compatible integrations or manual imports.
- Provider credentials remain local and are excluded from logs and exports by default.
- Historical-data completeness limitations are visible to the user.
- The design does not silently substitute present-day data into historical analysis.

## Privacy and audit

- No mandatory account, authentication, RBAC, cloud database, or server-side notification service is required for v1.
- Local workspace data remains on the device unless explicitly exported or sent to a configured provider.
- Settings, data imports, model runs, recommendations, alerts, portfolios, reports, backups, restores, migrations, and resets have defined audit events.
- Historical model runs, recommendations, and reports are versioned rather than overwritten.
- The limitations of a local append-only audit log are documented.

## Product acceptance

- The dashboard, alert mechanism, audit history, model, backtesting, reports, and offline behavior each have a defined owner and data flow.
- The implementation sequence for Phases 2–14 is unambiguous.
- Phase 2 can begin by implementing the local schema and repository layer without revisiting the architecture decisions in this document.

## Phase 1 risks to track

| Risk | Impact | Mitigation | Owner phase |
| --- | --- | --- | --- |
| Browser storage quota varies | Imports or historical datasets may fail | Chunking, quota checks, cache cleanup, backup/export | Phase 2 |
| Mobile browser suspends background work | Alerts may not be detected until app open | Last-checked state, active-session refresh, in-app alert center | Phases 9 and 13 |
| Provider API blocks browser access | Live refresh unavailable | Provider capability checks and CSV/JSON import | Phase 3 |
| Large backtests exhaust memory | Poor UX or browser termination | Web Workers, bounded batches, cancellation, progress | Phases 6 and 7 |
| Local audit data is modified outside the app | Absolute tamper evidence is impossible | Append-only application API, hashes, exports, clear limitation | Phase 11 |
| Provider licensing limits local retention | Data cannot be safely cached or exported | Provider-specific retention and export rules | Phase 3 |
