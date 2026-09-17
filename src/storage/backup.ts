import { DATABASE_VERSION } from "./schema.js";
import { WorkspaceRepository } from "./indexeddb.js";
import { STORE_NAMES, type EntityMap, type StoreName, type WorkspaceBackup, type WorkspaceData } from "./types.js";
import { parseWorkspaceBackup, serializeWorkspaceBackup, validateWorkspaceBackup } from "./validation.js";
import { createAuditEvent } from "../audit/service.js";

export const APPLICATION_VERSION = "0.1.0";

function now(): string {
  return new Date().toISOString();
}

export async function createWorkspaceBackup(repository: WorkspaceRepository, profileId?: string): Promise<WorkspaceBackup> {
  const exportedAt = now();
  const exportAudit = createAuditEvent({ now: exportedAt, eventType: "workspace-backup", action: "backup-exported", actorType: "user", entityType: "workspace", entityId: profileId ?? "workspace", previousState: {}, newState: { profileId: profileId ?? null, schemaVersion: DATABASE_VERSION }, reason: "User exported a full local workspace backup", correlationId: `backup-export-${exportedAt}` });
  await repository.put("auditEvents", exportAudit);
  const data = {} as WorkspaceData;
  for (const store of STORE_NAMES) {
    const records = await repository.getAll(store);
    if (store === "providerSettings") {
      // Provider credentials are device-local secrets and are never included
      // in a portable workspace backup.
      const sanitizedRecords = (records as Array<EntityMap["providerSettings"]>).map((record) => {
        const sanitized = { ...record };
        delete sanitized.apiKey;
        return sanitized;
      });
      (data as Record<StoreName, unknown>)[store] = sanitizedRecords;
    } else {
      (data as Record<StoreName, unknown>)[store] = records;
    }
  }
  return validateWorkspaceBackup({
    format: "yieldalpha-workspace",
    formatVersion: 1,
    exportedAt,
    applicationVersion: APPLICATION_VERSION,
    schemaVersion: DATABASE_VERSION,
    ...(profileId ? { profileId } : {}),
    data
  });
}

export async function serializeWorkspace(repository: WorkspaceRepository, profileId?: string): Promise<string> {
  return serializeWorkspaceBackup(await createWorkspaceBackup(repository, profileId));
}

export async function restoreWorkspace(repository: WorkspaceRepository, input: string | WorkspaceBackup): Promise<WorkspaceBackup> {
  const backup = typeof input === "string" ? parseWorkspaceBackup(input) : validateWorkspaceBackup(input);
  await repository.replaceAll(backup.data);
  await repository.put("auditEvents", createAuditEvent({ eventType: "workspace-restore", action: "backup-restored", actorType: "user", entityType: "workspace", entityId: backup.profileId ?? "workspace", previousState: {}, newState: { exportedAt: backup.exportedAt, schemaVersion: backup.schemaVersion }, reason: "User restored a local workspace backup", correlationId: `backup-restore-${backup.exportedAt}` }));
  return backup;
}

export async function resetWorkspace(repository: WorkspaceRepository, reason = "User reset the local workspace", resetAt = now()): Promise<void> {
  const deletions = [];
  const counts: Record<string, number> = {};
  for (const store of STORE_NAMES) {
    const records = await repository.getAll(store);
    counts[store] = records.length;
    for (const record of records) deletions.push({ store, operation: "delete" as const, key: record.id });
  }
  const audit = createAuditEvent({ now: resetAt, eventType: "workspace-reset", action: "workspace-reset", actorType: "user", entityType: "workspace", entityId: "workspace", previousState: counts, newState: { reset: true }, reason, correlationId: `workspace-reset-${resetAt}` });
  await repository.mutateBatch([...deletions, { store: "auditEvents", operation: "put" as const, value: audit }]);
}

export function downloadWorkspaceBackup(serialized: string, fileName = `yieldalpha-backup-${now().slice(0, 10)}.json`): void {
  if (typeof document === "undefined" || typeof URL === "undefined") {
    throw new Error("Workspace downloads require a browser document");
  }
  const blob = new Blob([serialized], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
}
