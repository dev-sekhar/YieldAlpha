# YieldAlpha Architecture

## Purpose

YieldAlpha is a local-first Progressive Web App for Indian equity research. It is designed for smartphones first, with tablet and desktop enhancements. User workspaces, calculations, recommendation history, alerts, reports, and audit records remain on the device unless the user explicitly exports data or sends a request to a configured market-data provider.

This document defines the Phase 1 architecture. It intentionally does not implement the database, provider adapters, model calculations, or UI; those are subsequent phases.

## Architectural decisions

| Concern | Decision | Rationale |
| --- | --- | --- |
| Application | React with TypeScript | Strong typing and a mature responsive UI ecosystem |
| Delivery | Installable PWA served as static assets | No application server is required for local operation |
| Local persistence | IndexedDB behind a typed repository layer | Durable structured storage available in supported mobile browsers |
| Heavy work | Web Workers | Keeps imports, historical calculations, and backtests from blocking touch interaction |
| Network | Browser-compatible HTTPS provider adapters and manual imports | Live data is useful without introducing a mandatory backend |
| Workspace identity | Device-local profile | No mandatory account, authentication, or cloud identity in v1 |
| Notifications | In-app alert center, with optional browser notifications | The in-app history remains authoritative even when mobile notification support is limited |
| Backup | Explicit workspace export and restore | Provides portability without cloud synchronization |
| Deployment | Static hosting/CDN | Simple distribution and compatibility with future Capacitor wrapping |

## Non-goals for v1

- No PostgreSQL, Redis, server-side job runner, or hosted workspace database.
- No mandatory Google sign-in, email login, RBAC, or cross-device synchronization.
- No server-side provider proxy. Provider access must be browser-compatible or use an explicit import workflow.
- No guaranteed background refresh while the PWA is closed; mobile browsers control background execution.
- No claim that a locally stored audit log is cryptographically tamper-proof against a person with device-level storage access.

## Runtime layers

```text
Presentation
  Dashboard, screening, stock detail, portfolio, alerts, backtests, reports, settings
          |
Application services
  Refresh orchestration, recommendation monitoring, report generation,
  backup/restore, notification dispatch
          |
Domain services
  Dividends, corporate actions, model calculations, portfolio simulation,
  point-in-time backtests, validation, audit event creation
          |
Infrastructure adapters
  IndexedDB repositories, Web Worker bridge, provider adapters, CSV/JSON codecs,
  service worker cache, browser notifications
          |
Browser platform
  IndexedDB, Cache Storage, Web Workers, Notifications, Web App Manifest
```

The presentation layer may request data and commands from application services, but it must not contain financial calculations, provider-specific parsing, persistence details, or direct mutation of audit records.

## Domain boundaries

### Workspace and settings

Owns the device-local profile, model settings, provider configuration, notification preferences, display preferences, schema versions, and backup metadata.

### Companies and securities

Owns company identity, security identity, listings, exchange information, sector taxonomy, ticker/name history, and listing periods.

### Market data and sources

Owns provider adapters, normalized quotes, price history, benchmarks, source records, freshness, confidence, validation status, and source conflicts.

### Dividends and corporate actions

Owns annual dividend history, eligibility, dividend analytics, splits, bonuses, rights issues, mergers, demergers, spin-offs, acquisitions, delistings, and ownership adjustments.

### Investment model

Owns model versions, settings snapshots, assumptions, scenario calculations, signal classifications, reason codes, explanations, and model-run provenance.

### Backtesting and portfolios

Owns point-in-time universe reconstruction, transaction simulation, holdings, allocations, cash, dividends, corporate actions, benchmarks, returns, drawdown, volatility, alpha, and model verdicts.

### Monitoring and alerts

Owns recommendation diffs, portfolio changes, alert priority, deduplication, read/acknowledged/snoozed/archive state, and notification dispatch status.

### Reports and audit

Owns immutable report snapshots, report versions, export records, append-only audit events, correlation IDs, and workspace activity history.

## Data flow

### Refresh flow

1. The user starts a refresh or a refresh is initiated while the PWA is active.
2. The refresh coordinator asks enabled provider adapters for supported data.
3. Responses are normalized and validated before persistence.
4. Each accepted, rejected, stale, or conflicting record receives source metadata and an audit event.
5. A model run is created from a settings snapshot and a data snapshot.
6. Recommendation monitoring compares the new signal state with the previous state.
7. Material differences create alerts and audit events.
8. The dashboard invalidates affected queries and displays freshness, changes, and failures.

### Backtest flow

1. The user selects dates, capital, assumptions, benchmark, weighting, and transaction costs.
2. The application creates immutable input and settings snapshots.
3. A Web Worker reconstructs only records available at the analysis date.
4. The worker simulates execution, dividends, prices, and corporate actions through the end date.
5. Results and limitations are persisted as a versioned backtest.
6. A report can be generated from that immutable result.
7. The run, report, and related user actions are linked by a correlation ID in the audit log.

## Persistence strategy

IndexedDB is the durable application store. The implementation will expose repositories and typed transactions rather than allowing screens to access IndexedDB directly.

Expected storage groups:

- Workspace: profile, preferences, model settings, provider settings, notification settings.
- Reference: companies, securities, listings, sectors, exchanges, benchmarks.
- Time series: prices, dividends, financial statements, metrics, valuations.
- Events: corporate actions, refresh outcomes, alerts, audit events.
- Analysis: model runs, signals, backtests, portfolios, robustness runs.
- Outputs: reports, exports, backups, import manifests.

Large time-series datasets must be queried by security and date range, imported in chunks, and processed in workers. The UI must not load an entire historical universe into memory for a table or chart.

## Worker boundaries

Web Workers will be used for:

- CSV/JSON parsing and validation.
- Large data imports and exports.
- Model calculations over many securities.
- Point-in-time backtests.
- Robustness cohorts and exclusion tests.
- Historical chart aggregation.

Workers receive serializable commands and return typed progress, result, warning, cancellation, and failure messages. A worker must never directly update visible UI state or bypass the repository/audit services.

## Source and freshness states

Every displayed value must be able to communicate one of these states:

- `LIVE`: obtained during the current successful refresh.
- `CACHED`: previously retrieved and still within the configured freshness window.
- `STALE`: available locally but older than the configured threshold.
- `IMPORTED`: supplied by the user through a validated import.
- `UNAVAILABLE`: no usable value exists.
- `NOT_VERIFIED`: value exists but has not passed required validation.
- `CONFLICTING`: multiple sources disagree and no priority rule resolved the conflict.

The UI must show the state and relevant timestamp next to financial data when it affects an analysis or recommendation.

## Error boundaries

- Provider errors are isolated to the affected provider and data request.
- A failed refresh does not delete the last known value.
- Invalid imported rows are retained in an import-error report and never become trusted data.
- A failed model run cannot create a recommendation.
- A cancelled worker leaves the prior completed result intact and records the cancellation.
- Storage quota errors pause the operation and provide recovery guidance.
- Notification permission failures do not suppress in-app alerts.

## Future compatibility

The application services and domain services must not depend on browser-only APIs. This keeps the core suitable for future Capacitor packaging and allows a later optional sync service without rewriting financial logic.
