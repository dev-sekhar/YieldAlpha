import type { AuditEvent, EntityMap, StoreName, WorkspaceRepository } from "../storage/index.js";
import { hashState } from "./hash.js";

export const AUDIT_APPLICATION_VERSION = "0.1.0";

function makeId(prefix: string): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return `${prefix}-${crypto.randomUUID()}`;
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function timezone(): string {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"; } catch { return "UTC"; }
}

export interface AuditEventInput {
  eventType: string;
  action: string;
  actorType: AuditEvent["actorType"];
  entityType: string;
  entityId: string;
  previousState?: unknown;
  newState?: unknown;
  reason: string;
  modelVersionId?: string;
  settingsId?: string;
  sourceRecordIds?: string[];
  correlationId?: string;
  applicationVersion?: string;
  now?: string;
  timezone?: string;
}

export function createAuditEvent(input: AuditEventInput): AuditEvent {
  const now = input.now ?? new Date().toISOString();
  const previousState = input.previousState ?? {};
  const newState = input.newState ?? {};
  return {
    id: makeId("audit"), kind: "audit-event", createdAt: now, updatedAt: now, eventType: input.eventType, action: input.action,
    actorType: input.actorType, entityType: input.entityType, entityId: input.entityId, previousStateHash: hashState(previousState), newStateHash: hashState(newState),
    reason: input.reason, ...(input.modelVersionId ? { modelVersionId: input.modelVersionId } : {}), ...(input.settingsId ? { settingsId: input.settingsId } : {}),
    ...(input.sourceRecordIds?.length ? { sourceRecordIds: [...new Set(input.sourceRecordIds)] } : {}), correlationId: input.correlationId ?? makeId("correlation"),
    applicationVersion: input.applicationVersion ?? AUDIT_APPLICATION_VERSION, timezone: input.timezone ?? timezone()
  };
}

export async function appendAuditEvent(repository: WorkspaceRepository, event: AuditEvent): Promise<void> {
  if (await repository.get("auditEvents", event.id)) throw new Error(`Audit event ${event.id} already exists; audit events are append-only`);
  await repository.put("auditEvents", event);
}

export async function recordAudit(repository: WorkspaceRepository, input: AuditEventInput): Promise<AuditEvent> {
  const event = createAuditEvent(input);
  await appendAuditEvent(repository, event);
  return event;
}

export interface AuditedMutation<K extends StoreName> {
  store: K;
  value: EntityMap[K];
  event: Omit<AuditEventInput, "entityId" | "entityType"> & { entityId?: string; entityType?: string };
}

export async function persistAuditedMutation<K extends StoreName>(repository: WorkspaceRepository, mutation: AuditedMutation<K>): Promise<AuditEvent> {
  const entity = mutation.value as EntityMap[K] & { id: string; kind: string };
  const event = createAuditEvent({ ...mutation.event, entityId: mutation.event.entityId ?? entity.id, entityType: mutation.event.entityType ?? mutation.store });
  if (await repository.get("auditEvents", event.id)) throw new Error(`Audit event ${event.id} already exists; audit events are append-only`);
  await repository.putBatch([{ store: mutation.store, value: mutation.value }, { store: "auditEvents", value: event }]);
  return event;
}

export function verifyAuditEvent(event: AuditEvent): boolean {
  const validHash = (value: string | undefined): boolean => /^sha256-[0-9a-f]{64}$/.test(value ?? "") || /^fnv1a-[0-9a-f]{8}$/.test(value ?? "");
  return event.kind === "audit-event" && event.id.length > 0 && event.createdAt.length > 0 && event.updatedAt.length > 0 && event.applicationVersion.length > 0 && event.correlationId.length > 0 && validHash(event.previousStateHash) && validHash(event.newStateHash);
}
