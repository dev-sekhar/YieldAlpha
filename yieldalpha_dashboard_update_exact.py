from artifact_tool import Blob, SpreadsheetFile

src='/mnt/data/india_stock_methodology_weekly_dashboard.xlsx'
out='/mnt/data/india_stock_methodology_weekly_dashboard_latest.xlsx'
wb=SpreadsheetFile.import_xlsx(Blob.load(src))

# Helpers
DARK='#17365D'; BLUE='#D9EAF7'; GREEN='#E2F0D9'; YELLOW='#FFF2CC'; RED='#FCE4D6'; WHITE='#FFFFFF'; GRAY='#E7E6E6'

def header(rng, fill=DARK):
    rng.format.fill=fill
    rng.format.font={"bold":True,"color":WHITE}
    rng.format.horizontal_alignment='left'
    rng.format.vertical_alignment='center'

def subhead(rng):
    rng.format.fill=BLUE
    rng.format.font={"bold":True,"color":"#000000"}

def box(rng):
    rng.format.borders={
        "top":{"style":"continuous","color":"#B4C6E7"},
        "bottom":{"style":"continuous","color":"#B4C6E7"},
        "left":{"style":"continuous","color":"#B4C6E7"},
        "right":{"style":"continuous","color":"#B4C6E7"}
    }

# Update dashboard with validation summary
sh=wb.worksheets.get_item('Dashboard')
sh.get_range('A40:F40').merge()
sh.get_range('A40').values=[["MODEL VALIDATION — 5-YEAR BACKTEST"]]
header(sh.get_range('A40:F40'))

sh.get_range('A41:B48').values=[
    ['Metric','Result'],
    ['Backtest window','30-Aug-2021 → 28-Aug-2026'],
    ['Starting portfolio (₹)','10,00,000'],
    ['Estimated ending value (₹)','28,68,000'],
    ['Estimated nominal CAGR','23.46%'],
    ['Required CAGR','12.00%'],
    ['Real CAGR @ 8% inflation','~14.3%'],
    ['Individual stocks ≥12% CAGR','9 of 14 (~64%)'],
]
subhead(sh.get_range('A41:B41'))

sh.get_range('D41:F48').values=[
    ['Benchmark / Verdict','Result','Status'],
    ['Nifty 50 TRI','~10.4% CAGR','Beat'],
    ['Sensex TRI','~9.5% CAGR','Beat'],
    ['Model Verdict','WORKS','Preliminary validation'],
    ['Dividend rule','Mandatory','Retained'],
    ['Backtest methodology','Point-in-time','No future data intended'],
    ['Corporate actions','Explicit treatment','Siemens/Motherson noted'],
    ['Next validation','Rolling cohorts','Required before production reliance'],
]
subhead(sh.get_range('D41:F41'))
sh.get_range('D44:F44').format.fill=GREEN
sh.get_range('D44:F44').format.font={"bold":True,"color":"#006100"}
box(sh.get_range('A41:B48'))
box(sh.get_range('D41:F48'))

sh.get_range('A50:F50').merge()
sh.get_range('A50').values=[[
    "STATUS NOTE: Backtest result is a reconstructed preliminary validation. "
    "Exact production CAGR must be re-run from a single corporate-action-adjusted "
    "licensed dataset with exact TRI endpoints."
]]
sh.get_range('A50:F50').format.fill=YELLOW
sh.get_range('A50:F50').format.wrap_text=True
sh.get_range('A40:F50').format.row_height=22
sh.get_range('A50:F50').format.row_height=38

# Extend methodology sheet
m=wb.worksheets.get_item('Methodology')
start=13
m.get_range(f'A{start}:B{start}').merge()
m.get_range(f'A{start}').values=[["LATEST MODEL / PRODUCTION UPDATES"]]
header(m.get_range(f'A{start}:B{start}'))

updates=[
    ['App name','YieldAlpha'],
    ['Data policy','Fresh fetched data; no production seed/CSV truth'],
    ['Authoritative source priority','NSE / BSE / company filings / government-regulator'],
    ['Point-in-time backtests','Use only data known on or before analysis date'],
    ['Snapshots','Immutable data snapshot per model run'],
    ['AI role','Explain/summarize only; quantitative calculations deterministic'],
    ['Model validation','Aug-2021 to Aug-2026 preliminary result: WORKS'],
    ['Backtest CAGR','~23.46% vs 12% hurdle'],
    ['Benchmark comparison','Beat near-period Nifty 50 TRI and Sensex TRI estimates'],
    ['Production caveat','Re-run exact performance from licensed adjusted dataset'],
]
m.get_range(f'A{start+1}:B{start+len(updates)}').values=updates
subhead(m.get_range(f'A{start+1}:A{start+len(updates)}'))
m.get_range(f'A{start}:B{start+len(updates)}').format.wrap_text=True
m.get_range('A:B').format.column_width=32

# Add Backtest Validation sheet
try:
    wb.worksheets.get_item('Backtest Validation').delete()
except Exception:
    pass

bt=wb.worksheets.add('Backtest Validation')
bt.get_range('A1:H1').merge()
bt.get_range('A1').values=[["YIELDALPHA — 5-YEAR MODEL BACKTEST VALIDATION"]]
header(bt.get_range('A1:H1'))

bt.get_range('A2:H2').merge()
bt.get_range('A2').values=[[
    "Information cut-off: 27-Aug-2021 close | Execution: 30-Aug-2021 | "
    "End: 28-Aug-2026 | Start capital: ₹10,00,000"
]]
bt.get_range('A2:H2').format.fill=BLUE
bt.get_range('A2:H2').format.font={"bold":True}

summary=[
    ['Metric','Value','','Benchmark','CAGR','','Conclusion','Status'],
    ['Starting capital (₹)',1000000,'','Nifty 50 TRI',0.104,'','MODEL VERDICT','WORKS'],
    ['Estimated ending value (₹)',2868000,'','Sensex TRI',0.095,'','Validation','Preliminary'],
    ['Portfolio CAGR',0.2346,'','Required hurdle',0.12,'','Dividend criterion','Mandatory'],
    ['Real CAGR @ 8% inflation',0.143,'','Hit rate',9/14,'','Portfolio construction','Equal weight'],
]
bt.get_range('A4:H8').values=summary
subhead(bt.get_range('A4:B4'))
subhead(bt.get_range('D4:E4'))
subhead(bt.get_range('G4:H4'))
bt.get_range('H5:H5').format.fill=GREEN
bt.get_range('H5').format.font={"bold":True,"color":"#006100"}

stocks=[
    ['Stock','Entry basis (₹)','End-value basis (₹)','Approx dividends/share (₹)',
     'Approx total multiple','Approx CAGR','12% test','Notes'],
    ['BEL',61.63,410.05,10.8,6.83,0.468,'PASS','Corporate-action adjusted'],
    ['KEC International',406,420,22,1.09,0.017,'FAIL','Clear miss'],
    ['KEI Industries',750,5555.83,17.5,7.43,0.494,'PASS','Strong winner'],
    ['Siemens + Siemens Energy',2227.14,7324.20,58,3.31,0.271,'PASS','Demerger value included'],
    ['Tata Communications',1403.10,1690.30,100.9,1.28,0.050,'FAIL','Below hurdle'],
    ['Motherson + MSWIL',221.45,454.30,8,2.09,0.159,'PASS','Restructuring value included'],
    ['Endurance Technologies',1720,2934.70,43.25,1.73,0.116,'FAIL','Close to hurdle'],
    ['Exide Industries',158.65,454.25,10,2.93,0.240,'PASS',''],
    ['Marico',527.55,837.35,37.75,1.66,0.107,'FAIL',''],
    ['Cipla',924,1423,50,1.59,0.098,'FAIL',''],
    ['Sun Pharma',787.20,1920.10,67,2.52,0.203,'PASS',''],
    ['Larsen & Toubro',1668.80,4041,152,2.51,0.202,'PASS',''],
    ['Titan Company',1878.40,5165,54.5,2.78,0.227,'PASS',''],
    ['Power Grid',131.63,266.95,49,2.40,0.191,'PASS',''],
]
bt.get_range('A10:H24').values=stocks
header(bt.get_range('A10:H10'))
bt.get_range('F11:F24').format.number_format='0.0%'
bt.get_range('E11:E24').format.number_format='0.00x'
bt.get_range('B11:D24').format.number_format='#,##0.00;[Red](#,##0.00);-'
bt.get_range('G11:G24').conditional_formats.add_custom(
    '=G11="PASS"', {"fill":"#C6EFCE","font":{"color":"#006100","bold":True}}
)
bt.get_range('G11:G24').conditional_formats.add_custom(
    '=LEFT(G11,4)="FAIL"', {"fill":"#FFC7CE","font":{"color":"#9C0006","bold":True}}
)

bt.get_range('A26:H28').values=[
    ['Important limitations','','','','','','',''],
    ['1','Reconstructed 2021 decisions, not originally timestamped in 2021; '
     'survivorship/universe-selection risk remains.','','','','','',''],
    ['2','Mixed public data sources were used; exact production validation must use '
     'one licensed corporate-action-adjusted source and official TRI endpoints.','','','','','',''],
]
header(bt.get_range('A26:H26'))
bt.get_range('A26:H28').format.wrap_text=True
bt.freeze_panes.freeze_rows(10)

for col,w in [('A:A',25),('B:D',18),('E:G',16),('H:H',34)]:
    bt.get_range(col).format.column_width=w

# Add Data Sources sheet
try:
    wb.worksheets.get_item('Data Sources').delete()
except Exception:
    pass

ds=wb.worksheets.add('Data Sources')
ds.get_range('A1:G1').merge()
ds.get_range('A1').values=[["YIELDALPHA — DATA SOURCE HIERARCHY & RESEARCH PROVENANCE"]]
header(ds.get_range('A1:G1'))

ds.get_range('A3:G3').values=[[
    'Tier','Source','Primary use','Production role','URL','Used in research?','Notes'
]]
header(ds.get_range('A3:G3'))

sources=[
    ['Tier 1','NSE India','Security master; corporate actions; dividends; filings; Nifty/TRI',
     'Authoritative / preferred','https://www.nseindia.com/','Yes',
     'Use provider adapter; verify redistribution/licensing.'],
    ['Tier 1','BSE India','Security master; corporate actions; filings; Sensex/TRI',
     'Authoritative / preferred','https://www.bseindia.com/','Yes',
     'Commercial market-data licensing may apply.'],
    ['Tier 1','Company IR / filings','Annual/quarterly results; dividends; corporate actions',
     'Authoritative company source','Company-specific investor-relations URLs','Yes',
     'Preferred when company-specific disclosure is definitive.'],
    ['Tier 1','Government / regulators','Sector/macro data','Authoritative context',
     'https://www.pib.gov.in/','Yes','RBI/SEBI/ministries as applicable.'],
    ['Tier 2','Licensed market-data provider','Fresh quotes; OHLC; historical data',
     'Preferred structured market feed','Configured in deployment','No single provider fixed',
     'Must have suitable commercial/redistribution rights.'],
    ['Tier 3','Moneycontrol','Prices; 52W range; dividends; company facts',
     'Secondary verification','https://www.moneycontrol.com/','Yes',
     'Widely used in research; do not make HTML scraping core architecture.'],
    ['Tier 3','Economic Times Markets','Quotes; historical prices; 52W range',
     'Secondary verification','https://economictimes.indiatimes.com/markets','Yes',
     'Underlying data rights do not automatically transfer.'],
    ['Tier 3','Upstox','Quote/52W verification','Secondary / potential API',
     'https://upstox.com/','Yes','Prefer official API.'],
    ['Tier 3','Dhan','Quote verification','Secondary / potential API',
     'https://dhan.co/','Yes','Prefer official API.'],
    ['Tier 3','ICICI Direct','Quote verification','Secondary',
     'https://www.icicidirect.com/','Yes','Use only with suitable terms/API.'],
    ['Tier 4','EquityPandit','Historical OHLC reconstruction','Backtest verification',
     'https://www.equitypandit.com/','Yes','Used for 2021 historical execution-price checks.'],
    ['Tier 4','StockPriceArchive','Historical price reconstruction','Backtest cross-check',
     'https://stockpricearchive.com/','Yes','Used in earlier 2020 reconstruction.'],
    ['Tier 4','Goodreturns','Dividend cross-checks','Secondary verification',
     'https://www.goodreturns.in/','Yes','Used for dividend verification.'],
    ['Tier 4','Investing.com India','Dividend/yield/history cross-check','Secondary verification',
     'https://in.investing.com/','Yes','Licensing/API required for production use.'],
    ['Tier 4','IPO Central','Listing-date cross-check','Secondary verification',
     'https://ipocentral.in/','Yes','Prefer exchange security master.'],
    ['Context','Reuters','News/geopolitical/market context','Research context only',
     'https://www.reuters.com/','Yes','Do not redistribute without rights.'],
]
ds.get_range(f'A4:G{3+len(sources)}').values=sources

row=5+len(sources)
ds.get_range(f'A{row}:G{row}').merge()
ds.get_range(f'A{row}').values=[["PRODUCTION DATA RULES"]]
header(ds.get_range(f'A{row}:G{row}'))

rules=[
    ['Rule','Requirement','','','','',''],
    ['Fresh data','Normal operation must fetch current external data; do not use seed CSV as production truth.','','','','',''],
    ['Point-in-time','Historical analysis can use only observations with knownFrom <= analysisDate.','','','','',''],
    ['Provenance','Store provider, source URL/id, publication/observation time, retrieval time, raw reference, normalized value and confidence.','','','','',''],
    ['Immutable snapshots','Each model run references a frozen data snapshot; later refreshes must not change historical reports.','','','','',''],
    ['Conflicts','Retain conflicting source observations and resolve by source tier/tolerance; never silently delete them.','','','','',''],
    ['Licensing','A technically accessible website is not automatically approved for redistribution or commercial production use.','','','','',''],
]
ds.get_range(f'A{row+1}:G{row+7}').values=rules
subhead(ds.get_range(f'A{row+1}:B{row+1}'))
ds.get_range('A:G').format.wrap_text=True

for col,w in [('A:A',13),('B:B',24),('C:C',30),('D:D',28),('E:E',48),('F:F',16),('G:G',42)]:
    ds.get_range(col).format.column_width=w

ds.freeze_panes.freeze_rows(3)

# Add source/freshness notes to Current Screen
cs=wb.worksheets.get_item('Current Screen')
cs.get_range('N1:O1').values=[['Source policy','Data freshness']]
header(cs.get_range('N1:O1'))
cs.get_range('N2:N51').values=[
    ['Secondary research / row source URLs retained'] for _ in range(50)
]
cs.get_range('O2:O51').formulas=[
    [f'=IF(H{r}=DATE(2026,8,28),"Baseline 28-Aug","Check stale")']
    for r in range(2,52)
]
cs.get_range('N:O').format.column_width=26
cs.get_range('O2:O51').conditional_formats.add_custom(
    '=O2="Check stale"', {"fill":"#FFF2CC","font":{"color":"#9C6500"}}
)

for sname in ['Current Screen','Data Sources']:
    wb.worksheets.get_item(sname).get_range(
        'A:O' if sname=='Current Screen' else 'A:G'
    ).format.wrap_text=True

# Export
SpreadsheetFile.export_xlsx(wb).save(out)

print(out)
print(wb.inspect({'kind':'sheet','include':'id,name'}).ndjson)
print(wb.inspect({
    'kind':'table',
    'range':'Dashboard!A40:F50',
    'include':'values,formulas',
    'table_max_rows':15,
    'table_max_cols':8
}).ndjson)
print(wb.inspect({
    'kind':'match',
    'search_term':'#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A',
    'options':{'use_regex':True,'max_results':100},
    'summary':'formula error scan'
}).ndjson)
