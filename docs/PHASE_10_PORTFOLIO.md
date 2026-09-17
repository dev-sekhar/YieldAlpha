# Phase 10 — Portfolio and Watchlist Features

## Delivered

- Equal, custom, inverse-risk, and sector-capped allocation plans run on-device.
- Plans calculate whole shares, invested capital, cash residual, expected nominal and real CAGR, weighted dividend yield, expected five-year value, inflation-adjusted value, sector exposure, valuation exposure, and HHI-style risk concentration.
- Portfolio analytics track current value when every holding has a priced local record, unrealised return, and realised return when realised proceeds/cost basis/dividend fields are recorded.
- Portfolio creation and allocation replacement are persisted in IndexedDB with an audit event in the same transaction. Removed positions are explicitly deleted as part of the replacement mutation.
- Watchlists can be created, replaced, and updated by add/remove operations. Each mutation is locally audited.
- The dashboard exposes the active local portfolio summary and watchlist count without inventing values when data is incomplete.
- Device notification preferences now include browser notification enablement and critical/high vibration preference.

## Important data boundary

`PortfolioPosition` currently stores realised aggregates rather than a full transaction ledger. This keeps the Phase 10 schema compatible with the existing smartphone-friendly IndexedDB version. A future transaction-ledger phase can add individual buys, sells, fees, and dividend events without changing the allocation API.

All portfolio values are local calculations. Missing prices, model outputs, or realised aggregates are reported as unavailable rather than estimated silently.
