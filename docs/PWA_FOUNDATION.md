# YieldAlpha PWA Foundation

## Status

The repository now contains a runnable, installable PWA with a local-first mobile dashboard. The dashboard reads existing IndexedDB workspace records when available and keeps financial values blank until real local portfolio, model, report, and source data exists.

## Run locally

Service workers do not run from `file://` URLs. Start the local static server from the repository root:

```sh
npm start
```

Then open `http://localhost:4173/` in a browser. The same static files can be deployed to any HTTPS static host.

## PWA behavior

- `manifest.webmanifest` defines install metadata, standalone display, theme, scope, and icons.
- `sw.js` caches the application shell during installation and serves the shell when navigation is offline.
- `app.js` registers the service worker, exposes an install prompt when supported, displays online/offline status, and persists the last local workspace check.
- The dashboard explicitly labels itself as a demonstration shell and does not present fabricated financial values.
- `dashboard.js` projects local portfolios, signals, alerts, audit events, refresh runs, reports, and source records into responsive dashboard states without mutating IndexedDB.
- The app is static and local-first; the IndexedDB domain modules remain the source of truth for later workflows.

## Browser limitations

Background refresh and notifications are not guaranteed when a mobile browser suspends the PWA. The authoritative alert history will be implemented in the local workspace in the alert phase. The current shell only provides the install/offline foundation.
