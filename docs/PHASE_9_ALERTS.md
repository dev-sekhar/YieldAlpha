# Phase 9 — Recommendation Monitoring and Alerts

## Delivered

- `src/alerts/monitor.ts` compares the latest model signal for each company with the prior observed signal.
- `persistSignalsAndMonitor` provides the preferred atomic write path for a new model run: incoming signals, generated alerts, and audit events are committed together.
- Material changes are classified as critical, high, medium, or informational using explicit transition and metric rules.
- Alerts preserve before/after snapshots, changed fields, explanation, source record IDs, model run, settings version, timestamp, deduplication key, and a detail route.
- Alert and audit records are written together through the IndexedDB repository batch transaction.
- Audit records link previous and new state fingerprints and a correlation ID. The fingerprint is local audit linkage, not tamper-proof storage.
- Signal creation now stores scenario calculation snapshots so downside/base/upside changes can be detected later.
- The PWA alert center renders the change details and supports explicit browser notification permission.
- New unread alerts are deduplicated in local device storage. Critical and high alerts vibrate when supported.

## Priority rules

| Priority | Examples |
| --- | --- |
| Critical | BUY → AVOID, failed dividend eligibility, newly conflicting data |
| High | BUY → WATCH, transition to insufficient data, declining expected CAGR, rising debt |
| Medium | WATCH → BUY, valuation/quality/dividend changes |
| Informational | First observation, smaller tracked changes, completed refresh |

## Mobile limitation

The in-app IndexedDB alert center is authoritative. Mobile browsers may suspend a PWA and cannot guarantee background refresh or notification delivery. Notifications require a user gesture and browser permission; the next foreground refresh reconciles any missed changes.
