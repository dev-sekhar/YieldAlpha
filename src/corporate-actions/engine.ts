import type { CorporateAction } from "../storage/types.js";

export interface Holding {
  securityId: string;
  shares: number;
  averageCost: number;
  cash: number;
  status: "active" | "delisted" | "cash-settled";
  rightsEntitlements: number;
}

export interface CorporateActionApplication {
  actionId: string;
  actionType: CorporateAction["actionType"];
  effectiveDate: string;
  before: Holding[];
  after: Holding[];
  warnings: string[];
}

export interface CorporateActionOptions {
  asOf?: string;
  subscribeRights: boolean;
  preserveRightsCash: boolean;
}

export class CorporateActionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CorporateActionError";
  }
}

function positiveDetail(details: Record<string, unknown>, keys: string[], action: CorporateAction): number {
  const key = keys.find((candidate) => details[candidate] !== undefined);
  const value = key ? Number(details[key]) : NaN;
  if (!Number.isFinite(value) || value <= 0) throw new CorporateActionError(`${action.id}: details.${keys[0]} must be positive`);
  return value;
}

function optionalNonNegative(details: Record<string, unknown>, keys: string[]): number {
  const key = keys.find((candidate) => details[candidate] !== undefined);
  if (!key) return 0;
  const value = Number(details[key]);
  if (!Number.isFinite(value) || value < 0) throw new CorporateActionError(`details.${key} must be non-negative`);
  return value;
}

function ratio(details: Record<string, unknown>, action: CorporateAction): { numerator: number; denominator: number } {
  return { numerator: positiveDetail(details, ["newShares", "new_shares", "ratioNumerator"], action), denominator: positiveDetail(details, ["oldShares", "old_shares", "ratioDenominator"], action) };
}

function cloneHoldings(holdings: Holding[]): Holding[] {
  return holdings.map((holding) => ({ ...holding }));
}

function findHolding(holdings: Holding[], securityId: string): Holding {
  const holding = holdings.find((candidate) => candidate.securityId === securityId);
  if (!holding) throw new CorporateActionError(`No holding exists for security ${securityId}`);
  return holding;
}

function mergeHolding(holdings: Holding[], incoming: Holding): void {
  const existing = holdings.find((holding) => holding.securityId === incoming.securityId && holding.status === "active");
  if (!existing) { holdings.push(incoming); return; }
  const totalShares = existing.shares + incoming.shares;
  existing.averageCost = totalShares === 0 ? 0 : (existing.averageCost * existing.shares + incoming.averageCost * incoming.shares) / totalShares;
  existing.shares = totalShares;
  existing.cash += incoming.cash;
  existing.rightsEntitlements += incoming.rightsEntitlements;
}

function applyAction(holdings: Holding[], action: CorporateAction, options: CorporateActionOptions): string[] {
  const warnings: string[] = [];
  const holding = findHolding(holdings, action.securityId);
  const details = action.details;
  if (action.actionType === "split" || action.actionType === "bonus") {
    const { numerator, denominator } = ratio(details, action);
    holding.shares *= numerator / denominator;
    holding.averageCost *= denominator / numerator;
    return warnings;
  }
  if (action.actionType === "rights") {
    const { numerator, denominator } = ratio(details, action);
    const entitlement = holding.shares * numerator / denominator;
    holding.rightsEntitlements += entitlement;
    if (!options.subscribeRights) {
      warnings.push(`${action.id}: rights entitlement retained without subscription`);
      return warnings;
    }
    const issuePrice = positiveDetail(details, ["issuePrice", "issue_price"], action);
    const cost = entitlement * issuePrice;
    if (holding.cash < cost) {
      warnings.push(`${action.id}: insufficient holding cash to subscribe to rights`);
      return warnings;
    }
    holding.cash -= cost;
    holding.shares += entitlement;
    holding.averageCost = holding.shares === 0 ? 0 : (holding.averageCost * (holding.shares - entitlement) + issuePrice * entitlement) / holding.shares;
    holding.rightsEntitlements -= entitlement;
    return warnings;
  }
  if (action.actionType === "demerger" || action.actionType === "spin-off") {
    const childSecurityId = String(details.childSecurityId ?? details.child_security_id ?? "");
    if (!childSecurityId) throw new CorporateActionError(`${action.id}: childSecurityId is required`);
    const childSharesPerParent = positiveDetail(details, ["childSharesPerParentShare", "child_shares_per_parent_share"], action);
    const childShares = holding.shares * childSharesPerParent;
    const allocation = optionalNonNegative(details, ["childCostAllocation", "child_cost_allocation"]);
    const childCost = holding.averageCost * Math.min(1, allocation);
    holding.averageCost -= childCost;
    mergeHolding(holdings, { securityId: childSecurityId, shares: childShares, averageCost: childCost, cash: 0, status: "active", rightsEntitlements: 0 });
    return warnings;
  }
  if (action.actionType === "merger" || action.actionType === "acquisition") {
    const targetSecurityId = String(details.targetSecurityId ?? details.target_security_id ?? "");
    const exchangeRatio = details.exchangeRatio ?? details.exchange_ratio;
    const cashPerShare = optionalNonNegative(details, ["cashPerShare", "cash_per_share"]);
    const cashReceived = holding.shares * cashPerShare;
    if (targetSecurityId && exchangeRatio !== undefined) {
      const ratioValue = positiveDetail({ exchangeRatio }, ["exchangeRatio"], action);
      const targetShares = holding.shares * ratioValue;
      mergeHolding(holdings, { securityId: targetSecurityId, shares: targetShares, averageCost: holding.averageCost, cash: holding.cash + cashReceived, status: "active", rightsEntitlements: 0 });
      holding.shares = 0;
      holding.status = "cash-settled";
      holding.cash = 0;
      return warnings;
    }
    if (cashPerShare <= 0) throw new CorporateActionError(`${action.id}: merger/acquisition requires target exchange ratio or cashPerShare`);
    holding.cash += cashReceived;
    holding.shares = 0;
    holding.averageCost = 0;
    holding.status = "cash-settled";
    return warnings;
  }
  if (action.actionType === "delisting") {
    const cashPerShare = optionalNonNegative(details, ["cashPerShare", "cash_per_share"]);
    if (cashPerShare > 0) holding.cash += holding.shares * cashPerShare;
    if (cashPerShare > 0) { holding.shares = 0; holding.averageCost = 0; holding.status = "cash-settled"; }
    else { holding.status = "delisted"; warnings.push(`${action.id}: no cash settlement was supplied`); }
    return warnings;
  }
  if (action.actionType === "ticker-change" || action.actionType === "name-change") {
    const targetSecurityId = details.targetSecurityId ?? details.target_security_id;
    if (typeof targetSecurityId === "string" && targetSecurityId.length > 0) holding.securityId = targetSecurityId;
    return warnings;
  }
  return warnings;
}

export function applyCorporateActions(initialHoldings: Holding[], actions: CorporateAction[], options: CorporateActionOptions): { holdings: Holding[]; applications: CorporateActionApplication[]; warnings: string[] } {
  const holdings = cloneHoldings(initialHoldings);
  const applications: CorporateActionApplication[] = [];
  const warnings: string[] = [];
  const asOf = options.asOf ? Date.parse(options.asOf) : Number.POSITIVE_INFINITY;
  if (!Number.isFinite(asOf) && options.asOf) throw new CorporateActionError("asOf must be a valid date");
  for (const action of [...actions].sort((left, right) => left.effectiveDate.localeCompare(right.effectiveDate) || left.id.localeCompare(right.id))) {
    const effectiveTime = Date.parse(action.effectiveDate);
    if (!Number.isFinite(effectiveTime)) throw new CorporateActionError(`${action.id}: effectiveDate must be a valid date`);
    if (effectiveTime > asOf) continue;
    const before = cloneHoldings(holdings);
    const actionWarnings = applyAction(holdings, action, options);
    applications.push({ actionId: action.id, actionType: action.actionType, effectiveDate: action.effectiveDate, before, after: cloneHoldings(holdings), warnings: actionWarnings });
    warnings.push(...actionWarnings);
  }
  return { holdings, applications, warnings };
}
