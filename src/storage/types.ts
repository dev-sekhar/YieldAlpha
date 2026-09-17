export const STORE_NAMES = [
  "workspaceProfiles",
  "modelSettings",
  "modelVersions",
  "exchanges",
  "sectors",
  "industries",
  "companies",
  "securities",
  "listings",
  "priceHistory",
  "dividends",
  "financialStatements",
  "financialMetrics",
  "valuationSnapshots",
  "benchmarks",
  "benchmarkPrices",
  "corporateActions",
  "sourceRecords",
  "analysisSnapshots",
  "modelRuns",
  "modelSignals",
  "backtests",
  "backtestPositions",
  "portfolios",
  "portfolioPositions",
  "watchlists",
  "alerts",
  "reports",
  "auditEvents",
  "importManifests",
  "exportManifests",
  "migrationRecords",
  "providerSettings",
  "dataSources",
  "refreshRuns"
] as const;

export type StoreName = (typeof STORE_NAMES)[number];

export interface EntityBase {
  id: string;
  createdAt: string;
  updatedAt: string;
}

export interface WorkspaceProfile extends EntityBase {
  kind: "workspace-profile";
  name: string;
  locale: string;
  currency: "INR";
  timezone: string;
  isDemo: boolean;
}

export interface ModelSettings extends EntityBase {
  kind: "model-settings";
  version: number;
  requiredCagr: number;
  inflationRate: number;
  horizonYears: number;
  dividendStartYear: number;
  minimumConsecutiveDividendYears: number;
  allowNewerListings: boolean;
  includeSpecialDividends: boolean;
  zeroDividendDisqualifies: boolean;
  minimumRoce?: number;
  maximumDebtToEquity?: number;
  minimumEarningsGrowth?: number;
  maximumSectorConcentration?: number;
  valuationMarginOfSafety?: number;
  materiallyBelowHurdleBy?: number;
  downsideEpsGrowthAdjustment?: number;
  upsideEpsGrowthAdjustment?: number;
  downsideExitMultipleFactor?: number;
  upsideExitMultipleFactor?: number;
}

export interface ModelVersion extends EntityBase {
  kind: "model-version";
  name: string;
  description: string;
  status: "active" | "archived";
  settingsId: string;
}

export interface Exchange extends EntityBase {
  kind: "exchange";
  code: string;
  name: string;
  country: "IN";
}

export interface Sector extends EntityBase {
  kind: "sector";
  name: string;
  description?: string;
  isDemo: boolean;
}

export interface Industry extends EntityBase {
  kind: "industry";
  name: string;
  sectorId: string;
}

export interface Company extends EntityBase {
  kind: "company";
  legalName: string;
  displayName: string;
  country: "IN";
  industryId: string;
  isin?: string;
  sectorOutlook?: "supportive" | "neutral" | "unsupported" | "unknown";
  governanceStatus?: "clear" | "issue" | "unknown";
  structurallyDeteriorated?: boolean;
  isDemo: boolean;
}

export interface Security extends EntityBase {
  kind: "security";
  companyId: string;
  exchangeId: string;
  symbol: string;
  securityType: "equity";
  currency: "INR";
}

export interface Listing extends EntityBase {
  kind: "listing";
  securityId: string;
  exchangeId: string;
  listedFrom: string;
  listedTo?: string;
}

export interface SourceRecord extends EntityBase {
  kind: "source-record";
  provider: string;
  sourceUrl?: string;
  retrievalTimestamp: string;
  sourceDate?: string;
  rawValue: unknown;
  normalizedValue: unknown;
  sourceTier?: number;
  adjustment?: string;
  verificationStatus?: string;
  confidence: "high" | "medium" | "low" | "unknown";
  validationStatus: "valid" | "stale" | "unavailable" | "not-verified" | "conflicting";
  freshnessState: FreshnessState;
  subjectType: string;
  subjectId: string;
}

export type FreshnessState = "LIVE" | "CACHED" | "STALE" | "IMPORTED" | "UNAVAILABLE" | "NOT_VERIFIED" | "CONFLICTING";

export interface PriceHistory extends EntityBase {
  kind: "price-history";
  securityId: string;
  tradingDate: string;
  open?: number;
  high?: number;
  low?: number;
  close: number;
  adjustedClose?: number;
  volume?: number;
  sourceRecordId: string;
}

export interface Dividend extends EntityBase {
  kind: "dividend";
  securityId: string;
  financialYear: number;
  amountPerShare: number;
  dividendType: "regular" | "special";
  paymentDate?: string;
  declaredDate?: string;
  sourceRecordId: string;
}

export interface FinancialStatement extends EntityBase {
  kind: "financial-statement";
  companyId: string;
  periodEnd: string;
  periodType: "annual" | "quarterly";
  revenue?: number;
  netProfit?: number;
  eps?: number;
  freeCashFlow?: number;
  sourceRecordId: string;
}

export interface FinancialMetric extends EntityBase {
  kind: "financial-metric";
  companyId: string;
  metric: "roe" | "roce" | "debt-to-equity" | "earnings-growth" | "payout-ratio";
  periodEnd: string;
  value: number;
  sourceRecordId: string;
}

export interface ValuationSnapshot extends EntityBase {
  kind: "valuation-snapshot";
  securityId: string;
  observedAt: string;
  pe?: number;
  evToEbitda?: number;
  marketCapitalization?: number;
  historicalPercentile?: number;
  sourceRecordId: string;
}

export interface Benchmark extends EntityBase {
  kind: "benchmark";
  code: "NIFTY50_TRI" | "SENSEX_TRI";
  name: string;
  currency: "INR";
}

export interface BenchmarkPrice extends EntityBase {
  kind: "benchmark-price";
  benchmarkId: string;
  tradingDate: string;
  close: number;
  sourceRecordId: string;
}

export interface CorporateAction extends EntityBase {
  kind: "corporate-action";
  securityId: string;
  actionType: "split" | "bonus" | "rights" | "merger" | "demerger" | "spin-off" | "ticker-change" | "name-change" | "delisting" | "acquisition";
  effectiveDate: string;
  details: Record<string, unknown>;
  sourceRecordId: string;
}

export interface ModelRun extends EntityBase {
  kind: "model-run";
  modelVersionId: string;
  settingsId: string;
  dataSnapshotId: string;
  runType: "screen" | "backtest" | "refresh";
  status: "completed" | "failed" | "cancelled";
  startedAt: string;
  completedAt?: string;
  error?: string;
}

export interface AnalysisSnapshot extends EntityBase {
  kind: "analysis-snapshot";
  capturedAt: string;
  modelVersionId: string;
  settingsId: string;
  sourceRecordIds: string[];
  universeSecurityIds: string[];
  data: Record<string, unknown>;
}

export type SignalClassification = "BUY" | "WATCH" | "AVOID" | "INSUFFICIENT_DATA";

export interface ModelSignal extends EntityBase {
  kind: "model-signal";
  modelRunId: string;
  companyId: string;
  classification: SignalClassification;
  reasonCodes: string[];
  explanation: string;
  confidence: "high" | "medium" | "low" | "unknown";
  expectedNominalCagr?: number;
  expectedRealCagr?: number;
  modelVersionId?: string;
  settingsId?: string;
  dataSnapshotId?: string;
  sourceRecordIds?: string[];
  inputSnapshot?: Record<string, unknown>;
  scenarioSnapshot?: Record<string, unknown>;
}

export interface Backtest extends EntityBase {
  kind: "backtest";
  modelRunId: string;
  analysisDate: string;
  executionDate: string;
  endDate: string;
  startingCapital: number;
  targetCagr: number;
  inflationRate: number;
  benchmarkCode: "NIFTY50_TRI" | "SENSEX_TRI";
  weightingMethod: "equal" | "custom" | "risk-weighted" | "sector-capped";
  transactionCostRate: number;
  finalValue?: number;
  totalReturn?: number;
  cagr?: number;
  realCagr?: number;
  benchmarkCagr?: number;
  alpha?: number;
  modelVerdict?: "WORKS" | "DOES_NOT_WORK";
  warnings?: string[];
  limitations?: string[];
  status: "completed" | "failed" | "cancelled";
}

export interface BacktestPosition extends EntityBase {
  kind: "backtest-position";
  backtestId: string;
  securityId: string;
  selection: "selected" | "rejected";
  reason: string;
  allocation?: number;
  investedCapital?: number;
  shares?: number;
  executionPrice?: number;
  cashResidual?: number;
  dividendsReceived?: number;
  corporateActionIds?: string[];
  terminalPrice?: number;
  terminalMarketValue?: number;
  finalValue?: number;
  totalReturn?: number;
  cagr?: number;
  realCagr?: number;
  warnings?: string[];
}

export interface Portfolio extends EntityBase {
  kind: "portfolio";
  name: string;
  startingCapital: number;
  weightingMethod: "equal" | "custom" | "risk-weighted" | "sector-capped";
  isArchived: boolean;
}

export interface PortfolioPosition extends EntityBase {
  kind: "portfolio-position";
  portfolioId: string;
  securityId: string;
  shares: number;
  averageCost: number;
  targetWeight?: number;
  realizedProceeds?: number;
  realizedCostBasis?: number;
  realizedDividends?: number;
}

export interface Watchlist extends EntityBase {
  kind: "watchlist";
  name: string;
  securityIds: string[];
}

export interface AlertChange {
  field: string;
  previous: unknown;
  next: unknown;
  material: boolean;
}

export interface Alert extends EntityBase {
  kind: "alert";
  priority: "critical" | "high" | "medium" | "informational";
  eventType: string;
  title: string;
  message: string;
  entityType: string;
  entityId: string;
  status: "unread" | "read" | "acknowledged" | "snoozed" | "archived";
  previousState?: Record<string, unknown>;
  newState?: Record<string, unknown>;
  changes?: AlertChange[];
  why?: string;
  sourceRecordIds?: string[];
  modelRunId?: string;
  settingsId?: string;
  detailRoute?: string;
  dedupeKey?: string;
}

export interface Report extends EntityBase {
  kind: "report";
  reportType: "stock" | "portfolio" | "backtest" | "dividend" | "model-validation";
  title: string;
  version: number;
  modelVersionId?: string;
  settingsId?: string;
  dataSnapshotId?: string;
  generatedAt?: string;
  previousReportId?: string;
  sourceRecordIds?: string[];
  auditEventIds?: string[];
  content: Record<string, unknown>;
  status: "current" | "superseded";
}

export interface AuditEvent extends EntityBase {
  kind: "audit-event";
  eventType: string;
  action: string;
  actorType: "user" | "provider" | "import" | "model-run" | "system";
  entityType: string;
  entityId: string;
  previousStateHash?: string;
  newStateHash?: string;
  reason?: string;
  modelVersionId?: string;
  settingsId?: string;
  sourceRecordIds?: string[];
  timezone?: string;
  correlationId: string;
  applicationVersion: string;
}

export interface ImportManifest extends EntityBase {
  kind: "import-manifest";
  fileName: string;
  format: "csv" | "json" | "workspace-backup";
  importedAt: string;
  rowCount: number;
  acceptedCount: number;
  rejectedCount: number;
  status: "completed" | "partial" | "failed";
}

export interface ExportManifest extends EntityBase {
  kind: "export-manifest";
  exportType: "workspace-backup" | "csv" | "json" | "pdf";
  fileName: string;
  exportedAt: string;
  recordCount: number;
}

export interface MigrationRecord extends EntityBase {
  kind: "migration-record";
  fromVersion: number;
  toVersion: number;
  appliedAt: string;
  status: "completed" | "failed";
}

export interface ProviderSettings extends EntityBase {
  kind: "provider-settings";
  version?: number;
  providerId: string;
  displayName: string;
  enabled: boolean;
  priority: number;
  endpoint?: string;
  apiKey?: string;
  cacheTtlMs: number;
  freshnessThresholdMs: number;
  supportsBrowserRequests: boolean;
  capabilities: string[];
}

export interface DataSourceConfig extends EntityBase {
  kind: "data-source-config";
  name: string;
  tier: "Tier 1" | "Tier 2" | "Tier 3" | "Tier 4" | "Context";
  primaryUse: string;
  productionRole: string;
  url: string;
  researchUsed: boolean;
  notes: string;
  enabled: boolean;
  version: number;
}

export interface RefreshRun extends EntityBase {
  kind: "refresh-run";
  providerId: string;
  startedAt: string;
  completedAt?: string;
  status: "completed" | "partial" | "failed" | "cancelled";
  requestedCategories: string[];
  acceptedCount: number;
  rejectedCount: number;
  warningCount: number;
  error?: string;
}

export interface EntityMap {
  workspaceProfiles: WorkspaceProfile;
  modelSettings: ModelSettings;
  modelVersions: ModelVersion;
  exchanges: Exchange;
  sectors: Sector;
  industries: Industry;
  companies: Company;
  securities: Security;
  listings: Listing;
  priceHistory: PriceHistory;
  dividends: Dividend;
  financialStatements: FinancialStatement;
  financialMetrics: FinancialMetric;
  valuationSnapshots: ValuationSnapshot;
  benchmarks: Benchmark;
  benchmarkPrices: BenchmarkPrice;
  corporateActions: CorporateAction;
  sourceRecords: SourceRecord;
  analysisSnapshots: AnalysisSnapshot;
  modelRuns: ModelRun;
  modelSignals: ModelSignal;
  backtests: Backtest;
  backtestPositions: BacktestPosition;
  portfolios: Portfolio;
  portfolioPositions: PortfolioPosition;
  watchlists: Watchlist;
  alerts: Alert;
  reports: Report;
  auditEvents: AuditEvent;
  importManifests: ImportManifest;
  exportManifests: ExportManifest;
  migrationRecords: MigrationRecord;
  providerSettings: ProviderSettings;
  dataSources: DataSourceConfig;
  refreshRuns: RefreshRun;
}

export type WorkspaceData = {
  [K in StoreName]: Array<EntityMap[K]>;
};

export interface WorkspaceBackup {
  format: "yieldalpha-workspace";
  formatVersion: 1;
  exportedAt: string;
  applicationVersion: string;
  schemaVersion: number;
  profileId?: string;
  data: WorkspaceData;
}
