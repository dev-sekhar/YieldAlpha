# YieldAlpha Phase Plan

## 1. Product Direction

Build YieldAlpha as a local-first, mobile-focused Progressive Web App for Indian equity research.

The application will run primarily on smartphones and tablets, store user data locally, perform calculations on-device, and access live data only through browser-compatible market-data providers or manual imports.

The product must provide:

- Explainable BUY, WATCH, AVOID, and INSUFFICIENT DATA recommendations.
- A modern research dashboard.
- Strong alerts for recommendation and portfolio changes.
- Point-in-time backtesting without look-ahead bias.
- Complete local audit history.
- Offline operation with visible freshness indicators.
- Exportable reports and workspace backups.

## 2. Architecture Principles

- React and TypeScript client application.
- IndexedDB for local structured data.
- Web Workers for backtests, imports, calculations, and large datasets.
- Browser-compatible market-data adapters.
- Optional locally entered provider API keys.
- No PostgreSQL, Redis, backend jobs, mandatory accounts, RBAC, or cloud database in v1.
- Versioned model settings, model runs, recommendations, reports, and audit records.
- Static PWA deployment through a CDN or static host.

## 3. Phase 1 — Requirements and Mobile Architecture

**Goal:** Define the local-only product architecture and mobile constraints.

**Deliverables:**

- Domain and module architecture.
- Mobile and tablet support targets.
- Browser and storage compatibility matrix.
- Local data-retention and dataset-size strategy.
- Offline, stale-data, and provider-failure behavior.
- Security and privacy model.
- Acceptance criteria for dashboard, alerts, audit, model, and backtesting features.

**Key risks:**

- Browser storage limits.
- Restricted background execution on mobile browsers.
- Provider APIs that do not support browser access.
- Large historical datasets affecting memory and performance.

## 4. Phase 2 — Local Database and Workspace Storage

**Goal:** Build the on-device source of truth.

Implement local entities for:

- Companies, securities, exchanges, sectors, industries, and listings.
- Price history, dividends, financial statements, metrics, valuations, and benchmarks.
- Corporate actions and source records.
- Model versions, assumptions, runs, and signals.
- Portfolios, portfolio positions, watchlists, alerts, and reports.
- Audit events, imports, exports, backups, and migrations.

**Deliverables:**

- Typed IndexedDB persistence layer.
- Local schema versioning and migrations.
- Deterministic demonstration dataset.
- Workspace backup and restore format.
- Import and export validation.

## 5. Phase 3 — Market-Data Provider and Import Layer

**Goal:** Retrieve or import financial data without a backend.

Implement:

- Provider adapter interface for quotes, prices, dividends, financials, benchmarks, and corporate actions.
- Browser-compatible live-data adapter.
- Local provider settings and optional API-key storage.
- Manual CSV and JSON import.
- Caching, retries, rate limits, request cancellation, and freshness tracking.
- Provider failure, stale-data, unavailable-data, and conflicting-source states.

Every metric must retain:

- Provider.
- Source URL or endpoint.
- Retrieval timestamp.
- Source date.
- Raw and normalized values.
- Adjustments.
- Confidence.
- Validation status.

## 6. Phase 4 — Dividend and Corporate-Action Engines

**Goal:** Establish eligibility and correctly preserve ownership through corporate events.

Implement:

- Configurable dividend continuity rules.
- Listing-date handling.
- Special-dividend and zero-value rules.
- Dividend yield, CAGR, payout consistency, and growth trend.
- Splits, bonuses, rights issues, mergers, demergers, spin-offs, ticker changes, delistings, and acquisitions.
- Source conflict preservation.
- Adjusted-price, share-count, and ownership reconciliation.

The system must never treat a stock near its 52-week low as automatically undervalued.

## 7. Phase 5 — Explainable Investment Model

**Goal:** Calculate and classify investment opportunities on-device.

Implement:

- Expected EPS, revenue, and profit growth.
- Exit valuation multiple.
- Expected dividends.
- Terminal price and total shareholder value.
- Nominal CAGR and inflation-adjusted real CAGR.
- Downside, base, and upside scenarios.
- Configurable hurdle, inflation, horizon, leverage, quality, earnings, dividend, valuation, and sector limits.
- BUY, WATCH, AVOID, and INSUFFICIENT DATA states.

Every recommendation must include:

- Model version.
- Settings version.
- Input snapshot.
- Data sources.
- Confidence.
- Machine-readable reason codes.
- Human-readable explanation.
- Generation timestamp.

## 8. Phase 6 — Point-in-Time Backtesting

**Goal:** Reconstruct historical decisions without look-ahead bias.

Support:

- Analysis date.
- Execution date.
- End date.
- Starting capital.
- Target CAGR.
- Inflation.
- Benchmark.
- Weighting method.
- Transaction costs.

Calculate:

- Selected and rejected stocks.
- Selection reasons.
- Allocation and shares.
- Execution prices.
- Dividends and corporate actions.
- Terminal value.
- Total return.
- Nominal and real CAGR.
- Benchmark CAGR.
- Alpha.
- Drawdown.
- Volatility.
- Hit rate.
- Model verdict.

The backtest must use only information available by the historical analysis date and clearly flag incomplete data.

## 9. Phase 7 — Robustness and Survivorship Testing

**Goal:** Test whether results depend on a specific period, stock, sector, or survivor set.

Implement:

- Multiple predefined and user-defined cohorts.
- Rolling monthly and quarterly windows where data permits.
- Median, worst, and best CAGR.
- Median and range of alpha.
- Target-beating percentage.
- Benchmark-beating percentages.
- Best-stock exclusion.
- Top-three-stock exclusion.
- Best-sector exclusion.
- Survivorship and data-coverage warnings.

Long-running calculations must run in cancellable Web Workers.

## 10. Phase 8 — Modern Dashboard

**Goal:** Provide a clear, premium research command center.

Dashboard sections:

- Portfolio value.
- Expected five-year CAGR.
- Real CAGR.
- Dividend yield.
- Nifty and Sensex relative return.
- BUY, WATCH, AVOID, and insufficient-data counts.
- Unread critical alerts.
- Recommendation changes since the last refresh.
- Data freshness and provider status.
- Recent backtests and reports.

Charts:

- Portfolio value.
- Benchmark comparison.
- Sector allocation.
- Expected-return distribution.
- Dividend growth.
- Valuation history.
- Signal history.
- Portfolio concentration and risk.

The dashboard must be mobile-first, touch-friendly, readable on tablets, accessible, and usable without relying on color alone.

## 11. Phase 9 — Recommendation Monitoring and Alerts

**Goal:** Detect and communicate every material change in potential portfolio recommendations.

Monitor changes to:

- Signal classification.
- Expected nominal and real CAGR.
- Scenario outcomes.
- Dividend eligibility.
- Dividend yield and growth.
- Valuation and margin of safety.
- Earnings, revenue, ROE, ROCE, free cash flow, and debt.
- Sector attractiveness and risks.
- Data confidence and freshness.
- Portfolio inclusion, exclusion, allocation, and concentration.

Alert priorities:

- **Critical:** BUY → AVOID, severe risk breach, invalidated dividend rule, major data conflict.
- **High:** BUY → WATCH, material expected-return reduction, debt deterioration, major corporate action.
- **Medium:** WATCH → BUY, valuation movement, earnings revision, dividend cut or declaration.
- **Informational:** completed refresh, unchanged signal with updated metrics, completed report or backtest.

Alert channels:

- In-app alert center.
- Dashboard badge.
- Browser notifications where supported and permitted.
- Optional vibration or sound where supported.

Every alert must show:

- Previous state.
- New state.
- What changed.
- Why it changed.
- Affected company or portfolio.
- Source records.
- Model run.
- Settings version.
- Timestamp.
- Link to detailed analysis.

## 12. Phase 10 — Portfolio and Watchlist Features

**Goal:** Support ongoing investment research and simulation.

Implement:

- Equal-weighted allocation.
- User-defined allocation.
- Risk-weighted allocation.
- Sector-capped allocation.
- Shares purchased.
- Cash residual.
- Expected CAGR.
- Weighted dividend yield.
- Sector and valuation exposure.
- Risk concentration.
- Expected five-year value.
- Inflation-adjusted expected value.
- Realised return tracking.
- Local watchlists.
- Signal history.
- On-device notification preferences.

## 13. Phase 11 — Audit and Version History

**Goal:** Make all material changes traceable and reproducible.

Create an append-only local audit log for:

- Settings changes.
- Model-assumption changes.
- Provider changes.
- Data imports and refreshes.
- Data corrections and conflicts.
- Recommendation generation and transitions.
- Portfolio creation and edits.
- Watchlist changes.
- Alert creation and status changes.
- Backtests and reruns.
- Report creation, regeneration, export, and deletion.
- Backup, restore, migration, and local reset events.

Each audit event must include:

- Event ID.
- Timestamp and timezone.
- Actor type.
- Action.
- Entity and entity ID.
- Previous value or hash.
- New value or hash.
- Reason.
- Model version.
- Settings version.
- Source references.
- Application version.
- Correlation ID.

Historical model runs, recommendations, and reports must never be overwritten. Changes create new versions or new events.

## 14. Phase 12 — Reports and Exports

**Goal:** Produce defensible, reproducible research outputs.

Implement:

- Stock Analysis Report.
- Portfolio Report.
- Backtest Report.
- Dividend Report.
- Model Validation Report.

Each report must include:

- Report version.
- Generation time.
- Model version.
- Settings version.
- Data snapshot.
- Sources and freshness.
- Selected and rejected stocks.
- Recommendation reasons.
- Portfolio calculations.
- Benchmark comparison.
- Limitations.
- Corporate actions.
- Relevant audit-event references.

Support PDF, CSV, print-friendly output, and full workspace backup export.

Regenerating a report creates a new version linked to the previous report.

## 15. Phase 13 — PWA, Privacy, and Offline Behavior

**Goal:** Deliver a reliable installable application.

Implement:

- Web app manifest.
- Service worker.
- Install prompt.
- Offline application shell.
- Cached portfolio and watchlist data.
- Stale-while-revalidate behavior.
- Visible last-updated timestamps.
- Offline status indicator.
- Backup and restore.
- Local privacy controls.
- Strict CSP and safe rendering.
- Explicit local-data reset confirmation.

The app must never present cached or stale information as live.

## 16. Phase 14 — Testing, Performance, and Release

**Goal:** Validate correctness and production readiness.

Test:

- Financial formulas.
- Dividend continuity.
- Inflation conversion.
- Dividend reinvestment.
- Splits and demergers.
- Portfolio weighting.
- Benchmark alpha.
- Look-ahead prevention.
- Data conflicts and stale data.
- Recommendation transitions.
- Alert deduplication and acknowledgment.
- Audit completeness.
- Report versioning.
- Import/export and backup recovery.
- Offline behavior.
- Browser notification permissions.
- Mobile storage and memory limits.
- Accessibility and keyboard navigation.

CI must run:

- Linting.
- Type checking.
- Unit tests.
- Integration tests.
- End-to-end tests.
- Security scanning.
- Production build.
- PWA validation.

Release only when critical financial, audit, alert, security, accessibility, and reproducibility tests pass.

## 17. Final Acceptance Criteria

The product is ready for release when:

- It installs and operates on supported smartphones and tablets.
- User data remains local unless explicitly exported or sent to a provider.
- Live and stale data are clearly distinguished.
- Every recommendation is explainable.
- Every recommendation change produces an alert and audit record.
- Every settings change is versioned and auditable.
- Historical reports and backtests remain reproducible.
- Look-ahead bias tests pass.
- Corporate actions are handled correctly.
- Offline mode is functional and transparent.
- The dashboard clearly communicates portfolio status and risks.
- No recommendation, report, or financial result is fabricated or silently overwritten.

## 18. Key Assumptions

- The app remains fully local-first with no mandatory account, RBAC, hosted database, or server-side notification system.
- Browser notifications are the primary external alert channel; the in-app alert center is the authoritative record.
- Alerts are evaluated whenever data or model calculations refresh, with clear last-checked timestamps.
- Audit history is stored locally and included in workspace backups.
- Audit entries are append-only from the application’s perspective, but local storage cannot provide absolute tamper-proof guarantees against a user with device-level storage access.
- Any future cloud synchronization must preserve event IDs, immutable versions, and audit history rather than flattening records.
