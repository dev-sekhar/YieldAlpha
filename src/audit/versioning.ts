import { createAuditEvent } from "./service.js";
import { hashState } from "./hash.js";
import type { ModelSettings, ModelVersion, Report, WorkspaceRepository } from "../storage/index.js";

function makeId(prefix: string, version: number): string { return `${prefix}-v${version}-${Date.now()}`; }

export async function createModelSettingsVersion(repository: WorkspaceRepository, settings: Omit<ModelSettings, "id" | "kind" | "createdAt" | "updatedAt" | "version">, reason = "User created a new model settings version", now = new Date().toISOString()): Promise<ModelSettings> {
  const history = await repository.getAll("modelSettings");
  const latest = [...history].sort((left, right) => right.version - left.version)[0];
  const version = (latest?.version ?? 0) + 1;
  const next: ModelSettings = { id: makeId("settings", version), kind: "model-settings", createdAt: now, updatedAt: now, version, ...settings };
  const audit = createAuditEvent({ now, eventType: "settings-version", action: "model-settings-created", actorType: "user", entityType: "model-settings", entityId: next.id, previousState: latest ?? {}, newState: next, reason, settingsId: next.id, correlationId: next.id });
  await repository.putBatch([{ store: "modelSettings", value: next }, { store: "auditEvents", value: audit }]);
  return next;
}

export async function createModelVersion(repository: WorkspaceRepository, input: { name: string; description: string; settingsId: string }, reason = "User created a new model version", now = new Date().toISOString()): Promise<ModelVersion> {
  if (!input.name.trim() || !input.settingsId.trim()) throw new Error("Model version name and settingsId are required");
  const version: ModelVersion = { id: makeId("model", Date.now()), kind: "model-version", createdAt: now, updatedAt: now, name: input.name.trim(), description: input.description, status: "active", settingsId: input.settingsId };
  const audit = createAuditEvent({ now, eventType: "model-version", action: "model-version-created", actorType: "user", entityType: "model-version", entityId: version.id, previousState: {}, newState: version, reason, settingsId: input.settingsId, correlationId: version.id });
  await repository.putBatch([{ store: "modelVersions", value: version }, { store: "auditEvents", value: audit }]);
  return version;
}

export async function saveReportVersion(repository: WorkspaceRepository, input: Omit<Report, "id" | "kind" | "createdAt" | "updatedAt" | "version" | "status"> & { reason?: string }, now = new Date().toISOString()): Promise<Report> {
  const { reason, ...reportInput } = input;
  const history = (await repository.getAll("reports")).filter((report) => report.reportType === input.reportType && report.title === input.title).sort((left, right) => right.version - left.version);
  const previous = history[0];
  const draftReport: Report = {
    ...reportInput,
    id: makeId("report", (previous?.version ?? 0) + 1), kind: "report", createdAt: now, updatedAt: now,
    generatedAt: now, version: (previous?.version ?? 0) + 1, status: "current",
    ...(previous ? { previousReportId: previous.id } : {})
  };
  const superseded = previous ? { ...previous, updatedAt: now, status: "superseded" as const } : undefined;
  const audit = createAuditEvent({ now, eventType: "report-version", action: previous ? "report-regenerated" : "report-created", actorType: "user", entityType: "report", entityId: draftReport.id, previousState: previous ?? {}, newState: draftReport, reason: reason ?? (previous ? "Report regenerated" : "Report created"), ...(input.modelVersionId ? { modelVersionId: input.modelVersionId } : {}), ...(input.settingsId ? { settingsId: input.settingsId } : {}), correlationId: draftReport.id });
  const auditEventIds = [...new Set([...(draftReport.auditEventIds ?? []), audit.id])];
  const report: Report = {
    ...draftReport, auditEventIds,
    content: { ...draftReport.content, ...(Array.isArray(draftReport.content.auditEventIds) ? { auditEventIds } : {}) }
  };
  audit.newStateHash = hashState(report);
  await repository.mutateBatch([
    ...(superseded ? [{ store: "reports" as const, operation: "put" as const, value: superseded }] : []),
    { store: "reports", operation: "put", value: report }, { store: "auditEvents", operation: "put", value: audit }
  ]);
  return report;
}

export async function deleteReport(repository: WorkspaceRepository, reportId: string, reason = "User deleted a local report", now = new Date().toISOString()): Promise<void> {
  const report = await repository.get("reports", reportId);
  if (!report) throw new Error(`Report ${reportId} was not found`);
  const audit = createAuditEvent({ now, eventType: "report-version", action: "report-deleted", actorType: "user", entityType: "report", entityId: reportId, previousState: report, newState: {}, reason, ...(report.modelVersionId ? { modelVersionId: report.modelVersionId } : {}), ...(report.settingsId ? { settingsId: report.settingsId } : {}), correlationId: reportId });
  await repository.mutateBatch([{ store: "reports", operation: "delete", key: reportId }, { store: "auditEvents", operation: "put", value: audit }]);
}
