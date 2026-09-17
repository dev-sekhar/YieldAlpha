import { STORE_NAMES, type EntityMap, type StoreName, type WorkspaceBackup, type WorkspaceData } from "./types.js";

export class WorkspaceValidationError extends Error {
  constructor(message: string, public readonly path: string = "workspace") {
    super(`${path}: ${message}`);
    this.name = "WorkspaceValidationError";
  }
}

const MAX_BACKUP_BYTES = 50 * 1024 * 1024;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}(T.*)?$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requireString(value: unknown, path: string): string {
  if (typeof value !== "string" || value.length === 0) throw new WorkspaceValidationError("must be a non-empty string", path);
  return value;
}

function requireDate(value: unknown, path: string): string {
  const result = requireString(value, path);
  if (!ISO_DATE.test(result) || Number.isNaN(Date.parse(result))) throw new WorkspaceValidationError("must be an ISO date or timestamp", path);
  return result;
}

function validateEntity<K extends StoreName>(store: K, value: unknown, index: number): asserts value is EntityMap[K] {
  const path = `data.${store}[${index}]`;
  if (!isRecord(value)) throw new WorkspaceValidationError("must be an object", path);
  requireString(value.id, `${path}.id`);
  requireDate(value.createdAt, `${path}.createdAt`);
  requireDate(value.updatedAt, `${path}.updatedAt`);
  requireString(value.kind, `${path}.kind`);
}

export function validateWorkspaceData(value: unknown): WorkspaceData {
  if (!isRecord(value)) throw new WorkspaceValidationError("must be an object", "data");
  const result = {} as WorkspaceData;
  for (const store of STORE_NAMES) {
    const records = value[store];
    // New stores are additive. Backups created before a store existed remain
    // restorable with an empty collection for that store.
    if (records === undefined && (store === "providerSettings" || store === "dataSources" || store === "refreshRuns" || store === "analysisSnapshots")) {
      (result as Record<StoreName, unknown>)[store] = [];
      continue;
    }
    if (!Array.isArray(records)) throw new WorkspaceValidationError("must be an array", `data.${store}`);
    const ids = new Set<string>();
    const typedRecords: Array<EntityMap[typeof store]> = [];
    records.forEach((record, index) => {
      validateEntity(store, record, index);
      if (ids.has(record.id)) throw new WorkspaceValidationError("contains a duplicate id", `data.${store}[${index}].id`);
      ids.add(record.id);
      typedRecords.push(record);
    });
    // The runtime loop preserves the store key; this cast avoids making the
    // compiler treat a union-key write as an intersection of every entity type.
    (result as Record<StoreName, unknown>)[store] = typedRecords;
  }
  return result;
}

export function validateWorkspaceBackup(value: unknown, serializedBytes?: number): WorkspaceBackup {
  if (serializedBytes !== undefined && serializedBytes > MAX_BACKUP_BYTES) {
    throw new WorkspaceValidationError(`exceeds the ${MAX_BACKUP_BYTES} byte backup limit`);
  }
  if (!isRecord(value)) throw new WorkspaceValidationError("must be an object");
  if (value.format !== "yieldalpha-workspace") throw new WorkspaceValidationError("has an unsupported format", "format");
  if (value.formatVersion !== 1) throw new WorkspaceValidationError("has an unsupported format version", "formatVersion");
  requireDate(value.exportedAt, "exportedAt");
  requireString(value.applicationVersion, "applicationVersion");
  if (!Number.isInteger(value.schemaVersion) || (value.schemaVersion as number) < 1) {
    throw new WorkspaceValidationError("must be a positive integer", "schemaVersion");
  }
  const data = validateWorkspaceData(value.data);
  return {
    format: "yieldalpha-workspace",
    formatVersion: 1,
    exportedAt: value.exportedAt as string,
    applicationVersion: value.applicationVersion as string,
    schemaVersion: value.schemaVersion as number,
    ...(typeof value.profileId === "string" ? { profileId: value.profileId } : {}),
    data
  };
}

export function parseWorkspaceBackup(serialized: string): WorkspaceBackup {
  if (typeof serialized !== "string" || serialized.trim().length === 0) {
    throw new WorkspaceValidationError("must be a non-empty JSON string");
  }
  if (serialized.length > MAX_BACKUP_BYTES) throw new WorkspaceValidationError(`exceeds the ${MAX_BACKUP_BYTES} byte backup limit`);
  let parsed: unknown;
  try {
    parsed = JSON.parse(serialized) as unknown;
  } catch {
    throw new WorkspaceValidationError("contains invalid JSON");
  }
  return validateWorkspaceBackup(parsed, new TextEncoder().encode(serialized).byteLength);
}

export function serializeWorkspaceBackup(backup: WorkspaceBackup): string {
  const validated = validateWorkspaceBackup(backup);
  const serialized = JSON.stringify(validated);
  if (new TextEncoder().encode(serialized).byteLength > MAX_BACKUP_BYTES) {
    throw new WorkspaceValidationError(`exceeds the ${MAX_BACKUP_BYTES} byte backup limit`);
  }
  return serialized;
}
