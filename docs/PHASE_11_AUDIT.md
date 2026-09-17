# Phase 11 — Audit and Version History

## Delivered

- Shared `src/audit/service.ts` creates normalized audit events with event ID, UTC ISO timestamp plus device timezone, actor, action, entity, previous/new state fingerprints, reason, model/settings references, source references, application version, and correlation ID.
- Application audit writes are append-only: an existing audit ID cannot be appended again, and all generated IDs are unique. The local storage limitation remains explicit: a user with device-level storage access can modify IndexedDB outside the app.
- `persistAuditedMutation` commits an entity mutation and its audit event in one IndexedDB transaction. `mutateBatch` supports explicit deletes for audited report/position removal.
- Model settings use immutable version records. Provider settings are versioned instead of overwritten. Model versions are explicit records linked to settings.
- Refresh start/completion/failure, data-import manifests, recommendation transitions, portfolio/watchlist changes, alert status changes, report creation/regeneration/deletion, backup export/restore, and local reset now create audit events.
- Reports are versioned; regeneration creates a new report ID/version and retains the prior report content as superseded history.
- `verifyAuditEvent` validates the required local audit shape and fingerprint format.

## Reproducibility boundary

Historical model signals and runs remain separate records. Audit events link the settings/model/source identifiers when those are available. A local audit log is application-append-only rather than cryptographically tamper-proof; workspace backups should be exported for an external recovery trail.
