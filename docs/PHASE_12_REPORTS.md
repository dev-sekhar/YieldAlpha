# Phase 12 — Reports and Exports

Phase 12 provides reproducible, device-local research reports without requiring a server, PostgreSQL, or a background job.

## Report types

The report builders in `src/reports/builders.ts` create versioned records for:

- Stock analysis
- Portfolio
- Point-in-time backtest
- Dividend analysis
- Model validation

Each report stores a typed evidence document containing its report version and generation time, model and settings references, data snapshot, source freshness and confidence, selected and rejected securities, recommendation reasons, portfolio calculations, benchmark comparison, limitations, corporate actions, and related audit-event IDs.

Reports are saved through `saveReportVersion`. Regeneration preserves the earlier report as `superseded`, increments the version, and sets `previousReportId` on the new report. Report creation itself is audited.

## Local export behavior

- JSON is a lossless report export.
- CSV is a flattened field/value export suitable for spreadsheets.
- Print HTML is responsive and sanitizes report values. The browser print dialog can save it as a PDF, including on mobile browsers that support system print/share.
- Full workspace backup is provided by the existing storage backup exporter. It includes reports, audit events, and export manifests; provider API keys are excluded.
- Report exports create an `export-manifest` and an append-only `report-export` audit event.

## Reproducibility and limitations

Reports show source retrieval timestamps and freshness states so cached, stale, imported, unavailable, and conflicting inputs remain visible. A report is a local snapshot; regenerating it after a data refresh intentionally creates a new version instead of silently changing historical output.

PDF generation uses the browser’s print-to-PDF capability rather than bundling a heavy PDF engine, keeping the application suitable for smartphones and tablets.

## Acceptance checks

- All five report builders are exported from `src/index.ts`.
- Reports retain historical versions and link the successor to the previous report.
- JSON, CSV, and print/PDF-ready output are available without a backend.
- Report exports and the existing full workspace backup are auditable.
- `npm run typecheck` and `npm test` pass.
