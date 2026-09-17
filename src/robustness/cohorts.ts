import type { BacktestRequest } from "../backtesting/types.js";
import type { RobustnessCohort, RollingFrequency } from "./types.js";

function dateAtUtc(date: string): Date {
  const parsed = new Date(`${date.slice(0, 10)}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) throw new Error(`Invalid date: ${date}`);
  return parsed;
}

function iso(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function addMonths(date: Date, months: number): Date {
  const result = new Date(date);
  result.setUTCMonth(result.getUTCMonth() + months);
  return result;
}

export function standardCohorts(base: Omit<BacktestRequest, "analysisDate" | "executionDate" | "endDate">): RobustnessCohort[] {
  const definitions: Array<[string, string, string, string, string]> = [
    ["aug-2020-aug-2025", "Aug 2020 → Aug 2025", "2020-08-27", "2020-08-31", "2025-08-29"],
    ["aug-2021-aug-2026", "Aug 2021 → Aug 2026", "2021-08-27", "2021-08-30", "2026-08-28"],
    ["jan-2020-dec-2024", "Jan 2020 → Dec 2024", "2020-01-02", "2020-01-03", "2024-12-31"],
    ["jan-2021-dec-2025", "Jan 2021 → Dec 2025", "2021-01-04", "2021-01-05", "2025-12-31"]
  ];
  return definitions.map(([id, label, analysisDate, executionDate, endDate]) => ({ id, label, request: { ...base, analysisDate, executionDate, endDate } }));
}

export function rollingCohorts(input: {
  base: Omit<BacktestRequest, "analysisDate" | "executionDate" | "endDate">;
  firstAnalysisDate: string;
  lastAnalysisDate: string;
  horizonYears: number;
  frequency: RollingFrequency;
}): RobustnessCohort[] {
  if (!Number.isInteger(input.horizonYears) || input.horizonYears < 1) throw new Error("horizonYears must be a positive integer");
  const first = dateAtUtc(input.firstAnalysisDate);
  const last = dateAtUtc(input.lastAnalysisDate);
  if (last < first) throw new Error("lastAnalysisDate must be on or after firstAnalysisDate");
  const step = input.frequency === "monthly" ? 1 : 3;
  const cohorts: RobustnessCohort[] = [];
  for (let analysis = first, index = 0; analysis <= last; analysis = addMonths(analysis, step), index += 1) {
    const execution = addMonths(analysis, 0);
    const end = addMonths(analysis, input.horizonYears * 12);
    const analysisDate = iso(analysis);
    const executionDate = iso(execution);
    const endDate = iso(end);
    cohorts.push({ id: `rolling-${input.frequency}-${index + 1}`, label: `${analysisDate} → ${endDate}`, request: { ...input.base, analysisDate, executionDate, endDate } });
  }
  return cohorts;
}
