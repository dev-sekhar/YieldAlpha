# YieldAlpha Mobile and Browser Constraints

## Support target

The primary target is a current, evergreen mobile browser on a recent smartphone. Tablets receive the same feature set with wider layouts and optional split panes. Desktop browsers are supported as a convenience, but desktop-only interaction patterns must not be required.

The application must support:

- Touch interaction as the primary input.
- Portrait and landscape orientations.
- Keyboard navigation when a physical keyboard is present.
- Screen readers and browser zoom.
- System light/dark preference plus explicit theme overrides.
- Intermittent connectivity and offline reopening.
- Safe recovery after a browser process is killed during an import or calculation.

## Capability matrix

| Capability | Required behavior | Fallback |
| --- | --- | --- |
| IndexedDB | Primary durable workspace storage | Show a blocking compatibility message if unavailable |
| Cache Storage/service worker | Offline application shell and static assets | Online-only shell with a clear limitation message |
| Web Workers | Required for large calculations and imports | Run only small operations on the main thread; warn before large work |
| Notifications | Optional browser alerts | In-app alert center remains authoritative |
| Background sync | Opportunistic only | Check for changes on app open, manual refresh, and active-session refresh |
| File System Access API | Optional convenience for backup files | Standard file picker and download/upload APIs |
| Web Crypto | Preferred for backup protection and local key handling | Unencrypted export with explicit user warning where unavailable |
| Vibration | Optional alert enhancement | No functional dependency |

## Storage policy

The application must not assume unlimited device storage.

- Keep reference data separate from large time series.
- Import historical data in bounded chunks.
- Store dates and numeric values in compact normalized representations.
- Query by security and date range.
- Aggregate chart data before sending it to the UI.
- Display estimated import size before committing a large import.
- Detect quota failures and preserve the previous consistent workspace.
- Allow users to remove provider caches without removing portfolios, reports, or audit history.
- Allow users to archive or remove unused historical datasets through an explicit, audited action.

The initial implementation should define a configurable soft workspace warning threshold rather than relying on one universal byte limit, because browser quotas vary by device and browser.

## Memory and responsiveness budgets

The UI must remain responsive during normal browsing and should target:

- No unbounded rendering of screening rows.
- Pagination or virtualization for long screens.
- Worker-based processing for large imports and backtests.
- Cancellable long-running operations.
- Progress feedback for operations expected to take more than one second.
- A small initial application shell that does not require the entire historical dataset to load.

The release test matrix must include at least one lower-memory smartphone profile and one tablet profile.

## Offline behavior

When offline, the app may:

- Open the application shell.
- Show cached portfolio, watchlist, reports, alerts, settings, and previously completed analyses.
- Run calculations against locally available data.
- Create local portfolio edits, notes, settings changes, reports, and audit events.
- Queue eligible local operations for the next active refresh.

When offline, the app must not:

- Present cached values as live.
- Claim that a provider refresh succeeded.
- Generate a recommendation requiring unavailable data without showing `INSUFFICIENT DATA` or a limitation.
- Promise a notification that depends on a background network check.

The interface must show:

- Current connectivity status.
- Last successful data refresh.
- Last recommendation evaluation.
- Last provider check.
- Whether displayed values are live, cached, stale, imported, unavailable, or conflicting.

## Background execution limitation

Mobile browsers may suspend or terminate a PWA when it is closed. Therefore:

- Recommendation monitoring is guaranteed during explicit refreshes, imports, model runs, and active-session refreshes.
- Background refresh is opportunistic and must be reported as such.
- The alert center must show “Last checked” and “Next check when app is opened” where background checks are unavailable.
- A browser notification is never the sole record of an alert.

## Provider constraints

Only documented, browser-compatible provider integrations are allowed. The product must not depend on scraping an HTML page from a single provider.

Provider configuration must expose:

- Supported data categories.
- Rate limits.
- Required credentials.
- CORS/browser compatibility.
- Cache duration.
- Source timestamp behavior.
- Licensing or redistribution restrictions.
- Fallback and manual-import instructions.

Provider credentials supplied by a user are stored locally and must never be logged, included in reports, or exported by default.

## Mobile UX rules

- Touch targets must be comfortably usable without precision tapping.
- Dense tables must provide a card or horizontally scrollable alternative.
- Filters should open in a sheet or dedicated mobile view.
- Important recommendation changes must be visible from the dashboard without requiring a chart interaction.
- Destructive actions require confirmation and explain whether backup or audit export is recommended first.
- Long numeric values must use consistent Indian-number formatting and avoid layout overflow.
- Charts require text summaries or tabular equivalents.
