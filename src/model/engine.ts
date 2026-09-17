import type { ModelInput, ModelInputSnapshot, ModelRecommendation } from "./types.js";
import { calculateModel } from "./calculations.js";
import { classifyModel } from "./classifier.js";
import type { ModelConfig } from "./types.js";

function cloneInput(input: ModelInput, generatedAt: string): ModelInput {
  return JSON.parse(JSON.stringify({ ...input, generatedAt })) as ModelInput;
}

export function evaluateModel(input: ModelInput, config: ModelConfig, generatedAt = input.generatedAt ?? new Date().toISOString()): ModelRecommendation {
  const inputSnapshot: ModelInputSnapshot = { ...cloneInput(input, generatedAt), generatedAt };
  if (!Number.isFinite(inputSnapshot.valuation.currentMultiple) || inputSnapshot.valuation.currentMultiple <= 0) throw new Error("currentMultiple must be positive");
  if (!Number.isFinite(inputSnapshot.valuation.marginOfSafety) || inputSnapshot.valuation.marginOfSafety < 0 || inputSnapshot.valuation.marginOfSafety > 1) throw new Error("marginOfSafety must be between 0 and 1");
  const calculation = calculateModel(inputSnapshot, config);
  const decision = classifyModel(inputSnapshot, config, calculation);
  return { decision, calculation, inputSnapshot, generatedAt };
}
