import { createAuditEvent } from "../audit/service.js";
import type { Alert, WorkspaceRepository } from "../storage/index.js";

export async function updateAlertStatus(repository: WorkspaceRepository, alertId: string, status: Alert["status"], reason = `User changed alert status to ${status}`, now = new Date().toISOString()): Promise<Alert> {
  const previous = await repository.get("alerts", alertId);
  if (!previous) throw new Error(`Alert ${alertId} was not found`);
  if (previous.status === status) return previous;
  const next: Alert = { ...previous, status, updatedAt: now };
  const audit = createAuditEvent({ now, eventType: "alert-status", action: "alert-status-changed", actorType: "user", entityType: "alert", entityId: alertId, previousState: previous, newState: next, reason, ...(previous.sourceRecordIds ? { sourceRecordIds: previous.sourceRecordIds } : {}), ...(previous.settingsId ? { settingsId: previous.settingsId } : {}), correlationId: alertId });
  await repository.putBatch([{ store: "alerts", value: next }, { store: "auditEvents", value: audit }]);
  return next;
}
