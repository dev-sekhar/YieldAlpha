YieldAlpha is a production-grade Indian equity research and portfolio-screening application designed to identify investment opportunities among companies that satisfy one mandatory eligibility rule: the company must have paid a dividend in every eligible year from 2016 onwards. Once a company passes this dividend-continuity gate, YieldAlpha analyses it using fresh market and financial data, including business and industry outlook, revenue and earnings growth, ROE/ROCE, balance-sheet strength, debt, cash generation, valuation, dividend yield and growth, and market-price positioning, and estimates five-year shareholder returns under bear, base and bull scenarios. The default objective is to identify eligible companies that, at their current market price, have a credible potential to deliver at least 12% annualised total return over five years, using an 8% annual inflation assumption. These analytical factors do not determine eligibility; they determine whether an already eligible company is classified as BUY, WATCH or AVOID and explain the reasoning behind that decision. All quantitative calculations should be deterministic, based on freshly retrieved and source-attributed data, while point-in-time backtesting tests the same methodology without hindsight and compares portfolio performance with Nifty 50 TRI and Sensex TRI. The ultimate goal is to provide a transparent, repeatable and auditable process for determining which dividend-qualified Indian companies are attractive to purchase today for a five-year holding period, why they are attractive, what return can reasonably be expected, what risks could invalidate the thesis, and whether the methodology has demonstrated an ability to achieve its return objective and outperform the market historically.



The end goal is not simply to build another stock screener. It is to build a repeatable investment-research process:



Discover → Qualify → Analyse → Value → Decide → Monitor → Backtest → Learn



A user should eventually be able to open YieldAlpha and ask:



“If I have ₹10 lakh to invest today for five years, which dividend-qualified Indian companies currently offer a credible ≥12% annualised total-return opportunity, why does the model believe that, what could go wrong, and has this methodology actually worked historically?”



YieldAlpha should answer that question with fresh data, deterministic calculations, visible assumptions, source provenance and reproducible historical evidence.



YieldAlpha must not depend on any paid market-data provider, API key, or YieldAlpha-hosted backend. The installed application must retrieve public financial and market information directly from publicly accessible websites over the internet, using a native HTTP/networking layer rather than browser-only fetch when necessary. Implement source-specific extractors for NSE, BSE, company investor-relations pages, Moneycontrol, Economic Times Markets, Upstox, Dhan, ICICI Direct, Goodreturns, Investing.com, EquityPandit, StockPriceArchive, IPO Central, Reuters, government/ministry sites and Nifty Indices as appropriate. Each extractor must return a common normalized schema containing value, source URL, source tier, observation date, retrieval time, freshness and confidence. The application must cross-check important values across multiple sources, preserve raw responses locally, store normalized data in SQLite, mark stale/conflicting data explicitly, and run all investment calculations on-device. No financial value may be hardcoded, no seed dataset may be used as production truth, and no failed fetch may be replaced with zero. The app must continue to work offline using the last stored snapshot and refresh incrementally when internet access returns.

