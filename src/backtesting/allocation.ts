import type { BacktestRequest, HistoricalSecurityData } from "./types.js";

export class AllocationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AllocationError";
  }
}

function normalize(weights: number[]): number[] {
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  if (!Number.isFinite(total) || total <= 0) throw new AllocationError("allocation weights must have a positive total");
  return weights.map((weight) => weight / total);
}

export function calculateAllocations(selected: HistoricalSecurityData[], request: BacktestRequest): Map<string, number> {
  if (selected.length === 0) return new Map();
  if (request.weightingMethod === "custom") {
    if (!request.customWeights) throw new AllocationError("customWeights are required for custom allocation");
    const raw = selected.map((security) => {
      const value = request.customWeights?.[security.securityId];
      if (value === undefined || !Number.isFinite(value) || value < 0) throw new AllocationError(`missing or invalid custom weight for ${security.securityId}`);
      return value;
    });
    return new Map(selected.map((security, index) => [security.securityId, normalize(raw)[index] ?? 0]));
  }
  if (request.weightingMethod === "risk-weighted") {
    const raw = selected.map((security) => {
      const risk = security.riskWeight ?? 1;
      if (!Number.isFinite(risk) || risk <= 0) throw new AllocationError(`riskWeight must be positive for ${security.securityId}`);
      return 1 / risk;
    });
    const weights = normalize(raw);
    return new Map(selected.map((security, index) => [security.securityId, weights[index] ?? 0]));
  }
  const equal = 1 / selected.length;
  const allocations = new Map(selected.map((security) => [security.securityId, equal]));
  if (request.weightingMethod !== "sector-capped") return allocations;
  const cap = request.sectorCap;
  if (cap === undefined || !Number.isFinite(cap) || cap <= 0 || cap > 1) throw new AllocationError("sectorCap must be between 0 and 1");
  const sectors = new Map<string, HistoricalSecurityData[]>();
  for (const security of selected) sectors.set(security.sectorId, [...(sectors.get(security.sectorId) ?? []), security]);
  if (sectors.size * cap < 1) throw new AllocationError("sectorCap is too restrictive for the selected sector count");
  for (let iteration = 0; iteration < sectors.size + 2; iteration += 1) {
    const capped = [...sectors.entries()].filter(([sectorId]) => [...(sectors.get(sectorId) ?? [])].reduce((sum, security) => sum + (allocations.get(security.securityId) ?? 0), 0) > cap + 1e-10);
    if (capped.length === 0) break;
    let excess = 0;
    const free: HistoricalSecurityData[] = [];
    for (const [sectorId, members] of sectors) {
      const current = members.reduce((sum, security) => sum + (allocations.get(security.securityId) ?? 0), 0);
      if (current > cap) {
        excess += current - cap;
        const memberWeight = cap / members.length;
        for (const security of members) allocations.set(security.securityId, memberWeight);
      } else free.push(...members);
    }
    if (free.length === 0) throw new AllocationError("sectorCap cannot be satisfied");
    const freeTotal = free.reduce((sum, security) => sum + (allocations.get(security.securityId) ?? 0), 0);
    for (const security of free) allocations.set(security.securityId, (allocations.get(security.securityId) ?? 0) + excess * ((allocations.get(security.securityId) ?? 0) / freeTotal));
  }
  const values = normalize(selected.map((security) => allocations.get(security.securityId) ?? 0));
  return new Map(selected.map((security, index) => [security.securityId, values[index] ?? 0]));
}
