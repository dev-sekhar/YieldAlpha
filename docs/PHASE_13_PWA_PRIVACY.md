# Phase 13 — PWA, Privacy, and Offline Behavior

Phase 13 hardens the local-first application for intermittent mobile connectivity and device-local privacy.

## Offline behavior

- `sw.js` installs a versioned application shell and serves the cached navigation shell when a device is offline.
- Same-origin static assets use stale-while-revalidate: the cached asset is returned immediately and a successful network response refreshes the cache for the next visit.
- `app.js` shows online/offline state and an offline banner that warns that provider values may be stale or unavailable.
- The dashboard reads portfolio, watchlist, alert, report, audit, and settings data from IndexedDB. It does not invent values when the local workspace is empty.
- Dashboard health shows the last successful data refresh, last provider check, last recommendation evaluation, and source freshness state.
- Mobile background execution remains opportunistic. Alerts are authoritative in the local alert center and are checked again when the app is opened or manually refreshed.

## Privacy controls

The Privacy section exposes device-local controls:

- Export a full JSON workspace backup.
- Restore a backup through the standard mobile file picker.
- Reset the local workspace only after an explicit confirmation that explains the data loss and recommends a backup.

Backup exports omit provider API keys. Export, restore, and reset actions create local audit events. Reset clears local data and leaves a reset event as the only remaining audit record.

## Security and safe rendering

- `index.html` includes a strict same-origin CSP with no inline script or style allowance, while permitting HTTPS provider connections.
- Dashboard values are rendered using `textContent` and DOM node construction. Report values and privacy status messages are escaped or assigned as text.
- No authentication, cloud database, server session, or third-party tracking is introduced; that would contradict the local-only product constraint.

## Mobile compatibility

The shell remains static and dependency-light. It uses the standard manifest, service worker, IndexedDB, notification, file picker, and download APIs with clear fallbacks. Layout controls remain touch-sized and responsive for portrait/landscape phones and tablets.
