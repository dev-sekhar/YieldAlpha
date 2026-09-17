import type { CorporateAction } from "../storage/types.js";

export interface CorporateActionConflict {
  securityId: string;
  effectiveDate: string;
  actionType: CorporateAction["actionType"];
  actionIds: string[];
  details: Array<Record<string, unknown>>;
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).sort().join(",")}]`;
  if (typeof value === "object" && value !== null) return `{${Object.entries(value as Record<string, unknown>).sort(([left], [right]) => left.localeCompare(right)).map(([key, entry]) => `${JSON.stringify(key)}:${stableJson(entry)}`).join(",")}}`;
  return JSON.stringify(value) ?? "null";
}

export function corporateActionFingerprint(action: CorporateAction): string {
  return stableJson({ securityId: action.securityId, effectiveDate: action.effectiveDate, actionType: action.actionType, details: action.details });
}

export function findCorporateActionConflicts(actions: CorporateAction[]): CorporateActionConflict[] {
  const groups = new Map<string, CorporateAction[]>();
  for (const action of actions) {
    const key = `${action.securityId}|${action.effectiveDate}|${action.actionType}`;
    const group = groups.get(key) ?? [];
    group.push(action);
    groups.set(key, group);
  }
  return [...groups.values()].filter((group) => new Set(group.map(corporateActionFingerprint)).size > 1).map((group) => ({
    securityId: group[0]?.securityId ?? "", effectiveDate: group[0]?.effectiveDate ?? "", actionType: group[0]?.actionType ?? "split", actionIds: group.map((action) => action.id), details: group.map((action) => action.details)
  }));
}
