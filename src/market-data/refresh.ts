import type { DataCategory } from "./contracts.js";
import type { RefreshRun } from "../storage/types.js";
import { WorkspaceRepository } from "../storage/indexeddb.js";
import { createAuditEvent } from "../audit/service.js";

export interface RefreshResult {
  acceptedCount: number;
  rejectedCount: number;
  warningCount: number;
}

export interface RefreshOperation {
  providerId: string;
  requestedCategories: DataCategory[];
  execute: (signal?: AbortSignal) => Promise<RefreshResult>;
}

function makeId(prefix: string): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return `${prefix}-${crypto.randomUUID()}`;
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export class RefreshCoordinator {
  constructor(private readonly repository: WorkspaceRepository, private readonly applicationNow: () => string = () => new Date().toISOString()) {}

  async run(operation: RefreshOperation, signal?: AbortSignal): Promise<RefreshRun> {
    const startedAt = this.applicationNow();
    const id = makeId("refresh");
    const initial: RefreshRun = {
      id, kind: "refresh-run", createdAt: startedAt, updatedAt: startedAt, providerId: operation.providerId,
      startedAt, status: "failed", requestedCategories: [...operation.requestedCategories], acceptedCount: 0, rejectedCount: 0, warningCount: 0
    };
    const startedAudit = createAuditEvent({ now: startedAt, eventType: "refresh", action: "refresh-started", actorType: "user", entityType: "refresh-run", entityId: id, previousState: {}, newState: initial, reason: "User started a data refresh", correlationId: id });
    await this.repository.putBatch([{ store: "refreshRuns", value: initial }, { store: "auditEvents", value: startedAudit }]);
    try {
      const result = await operation.execute(signal);
      const completedAt = this.applicationNow();
      const completed: RefreshRun = {
        ...initial, updatedAt: completedAt, completedAt, status: result.rejectedCount > 0 ? "partial" : "completed",
        acceptedCount: result.acceptedCount, rejectedCount: result.rejectedCount, warningCount: result.warningCount
      };
      const completedAudit = createAuditEvent({ now: completedAt, eventType: "refresh", action: "refresh-completed", actorType: "provider", entityType: "refresh-run", entityId: id, previousState: initial, newState: completed, reason: result.rejectedCount > 0 ? "Refresh completed with rejected records" : "Refresh completed successfully", correlationId: id });
      await this.repository.putBatch([{ store: "refreshRuns", value: completed }, { store: "auditEvents", value: completedAudit }]);
      return completed;
    } catch (error) {
      const completedAt = this.applicationNow();
      const failed: RefreshRun = {
        ...initial, updatedAt: completedAt, completedAt, status: signal?.aborted ? "cancelled" : "failed",
        error: error instanceof Error ? error.message : "Unknown provider refresh error"
      };
      const failedAudit = createAuditEvent({ now: completedAt, eventType: "refresh", action: signal?.aborted ? "refresh-cancelled" : "refresh-failed", actorType: "provider", entityType: "refresh-run", entityId: id, previousState: initial, newState: failed, reason: failed.error ?? "Refresh failed", correlationId: id });
      await this.repository.putBatch([{ store: "refreshRuns", value: failed }, { store: "auditEvents", value: failedAudit }]);
      throw error;
    }
  }
}
