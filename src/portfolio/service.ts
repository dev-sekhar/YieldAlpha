import { createAuditEvent } from "../audit/service.js";
import type { AuditEvent, Portfolio, PortfolioPosition, Watchlist, WorkspaceRepository } from "../storage/index.js";
import type { PortfolioMutationResult, PortfolioPlan, WatchlistMutationResult } from "./types.js";

function makeId(prefix: string): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return `${prefix}-${crypto.randomUUID()}`;
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function uniqueIds(ids: string[]): string[] {
  return [...new Set(ids.filter((id) => id.trim().length > 0))];
}

function auditEvent(input: {
  now: string;
  action: string;
  entityType: string;
  entityId: string;
  previous: unknown;
  next: unknown;
  reason: string;
  correlationId: string;
}): AuditEvent {
  return createAuditEvent({ now: input.now, eventType: "portfolio-workspace", action: input.action, actorType: "user", entityType: input.entityType, entityId: input.entityId, previousState: input.previous, newState: input.next, reason: input.reason, correlationId: input.correlationId });
}

export async function createPortfolio(repository: WorkspaceRepository, input: {
  name: string;
  startingCapital: number;
  weightingMethod: Portfolio["weightingMethod"];
}, now = new Date().toISOString()): Promise<Portfolio> {
  if (!input.name.trim()) throw new Error("Portfolio name is required");
  if (!Number.isFinite(input.startingCapital) || input.startingCapital <= 0) throw new Error("Portfolio starting capital must be positive");
  const portfolio: Portfolio = { id: makeId("portfolio"), kind: "portfolio", createdAt: now, updatedAt: now, name: input.name.trim(), startingCapital: input.startingCapital, weightingMethod: input.weightingMethod, isArchived: false };
  const audit = auditEvent({ now, action: "portfolio-created", entityType: "portfolio", entityId: portfolio.id, previous: {}, next: portfolio, reason: "User created a local portfolio", correlationId: portfolio.id });
  await repository.putBatch([{ store: "portfolios", value: portfolio }, { store: "auditEvents", value: audit }]);
  return portfolio;
}

export async function savePortfolioPlan(repository: WorkspaceRepository, portfolioId: string, plan: PortfolioPlan, reason = "User saved a portfolio allocation", now = new Date().toISOString()): Promise<PortfolioMutationResult> {
  const portfolio = await repository.get("portfolios", portfolioId);
  if (!portfolio) throw new Error(`Portfolio ${portfolioId} was not found`);
  if (portfolio.isArchived) throw new Error("Archived portfolios cannot be edited");
  const existing = (await repository.getAll("portfolioPositions")).filter((position) => position.portfolioId === portfolioId);
  const existingBySecurity = new Map(existing.map((position) => [position.securityId, position]));
  const positions: PortfolioPosition[] = plan.lines.filter((line) => line.shares > 0).map((line) => {
    const previous = existingBySecurity.get(line.securityId);
    return {
      id: previous?.id ?? makeId("position"), kind: "portfolio-position", createdAt: previous?.createdAt ?? now, updatedAt: now,
      portfolioId, securityId: line.securityId, shares: line.shares, averageCost: previous?.averageCost ?? line.currentPrice, targetWeight: line.targetWeight,
      ...(previous?.realizedProceeds !== undefined ? { realizedProceeds: previous.realizedProceeds } : {}),
      ...(previous?.realizedCostBasis !== undefined ? { realizedCostBasis: previous.realizedCostBasis } : {}),
      ...(previous?.realizedDividends !== undefined ? { realizedDividends: previous.realizedDividends } : {})
    };
  });
  const nextSecurityIds = new Set(positions.map((position) => position.securityId));
  const updatedPortfolio: Portfolio = { ...portfolio, updatedAt: now, weightingMethod: plan.weightingMethod };
  const audit = auditEvent({ now, action: "portfolio-positions-replaced", entityType: "portfolio", entityId: portfolioId, previous: { portfolio, positions: existing }, next: { portfolio: updatedPortfolio, positions, cashResidual: plan.cashResidual }, reason, correlationId: makeId("portfolio-change") });
  await repository.mutateBatch([
    ...existing.filter((position) => !nextSecurityIds.has(position.securityId)).map((position) => ({ store: "portfolioPositions" as const, operation: "delete" as const, key: position.id })),
    { store: "portfolios", operation: "put", value: updatedPortfolio },
    ...positions.map((position) => ({ store: "portfolioPositions" as const, operation: "put" as const, value: position })),
    { store: "auditEvents", operation: "put", value: audit }
  ]);
  return { portfolio: updatedPortfolio, positions, plan };
}

export async function createWatchlist(repository: WorkspaceRepository, input: { name: string; securityIds?: string[] }, now = new Date().toISOString()): Promise<Watchlist> {
  if (!input.name.trim()) throw new Error("Watchlist name is required");
  const watchlist: Watchlist = { id: makeId("watchlist"), kind: "watchlist", createdAt: now, updatedAt: now, name: input.name.trim(), securityIds: uniqueIds(input.securityIds ?? []) };
  const audit = auditEvent({ now, action: "watchlist-created", entityType: "watchlist", entityId: watchlist.id, previous: {}, next: watchlist, reason: "User created a local watchlist", correlationId: watchlist.id });
  await repository.putBatch([{ store: "watchlists", value: watchlist }, { store: "auditEvents", value: audit }]);
  return watchlist;
}

export async function replaceWatchlist(repository: WorkspaceRepository, watchlistId: string, securityIds: string[], reason = "User updated a local watchlist", now = new Date().toISOString()): Promise<WatchlistMutationResult> {
  const watchlist = await repository.get("watchlists", watchlistId);
  if (!watchlist) throw new Error(`Watchlist ${watchlistId} was not found`);
  const next: Watchlist = { ...watchlist, updatedAt: now, securityIds: uniqueIds(securityIds) };
  const audit = auditEvent({ now, action: "watchlist-replaced", entityType: "watchlist", entityId: watchlistId, previous: watchlist, next, reason, correlationId: makeId("watchlist-change") });
  await repository.putBatch([{ store: "watchlists", value: next }, { store: "auditEvents", value: audit }]);
  return { watchlist: next, previousSecurityIds: [...watchlist.securityIds] };
}

export async function addToWatchlist(repository: WorkspaceRepository, watchlistId: string, securityId: string, now?: string): Promise<WatchlistMutationResult> {
  const current = await repository.get("watchlists", watchlistId);
  if (!current) throw new Error(`Watchlist ${watchlistId} was not found`);
  return replaceWatchlist(repository, watchlistId, [...current.securityIds, securityId], "User added a security to a local watchlist", now);
}

export async function removeFromWatchlist(repository: WorkspaceRepository, watchlistId: string, securityId: string, now?: string): Promise<WatchlistMutationResult> {
  const current = await repository.get("watchlists", watchlistId);
  if (!current) throw new Error(`Watchlist ${watchlistId} was not found`);
  return replaceWatchlist(repository, watchlistId, current.securityIds.filter((id) => id !== securityId), "User removed a security from a local watchlist", now);
}
