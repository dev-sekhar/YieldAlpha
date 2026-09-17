import type { ProviderSettings, EntityMap } from "../storage/types.js";
import type { MarketDataProvider, ProviderSettingsInput } from "./contracts.js";
import { WorkspaceRepository } from "../storage/indexeddb.js";
import { createAuditEvent } from "../audit/service.js";

export class ProviderConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProviderConfigurationError";
  }
}

export function validateProviderSettings(settings: ProviderSettingsInput): ProviderSettingsInput {
  if (!settings.providerId.trim()) throw new ProviderConfigurationError("providerId is required");
  if (!settings.displayName.trim()) throw new ProviderConfigurationError("displayName is required");
  if (!Number.isInteger(settings.priority) || settings.priority < 0) throw new ProviderConfigurationError("priority must be a non-negative integer");
  if (!Number.isFinite(settings.cacheTtlMs) || settings.cacheTtlMs < 0) throw new ProviderConfigurationError("cacheTtlMs must be non-negative");
  if (!Number.isFinite(settings.freshnessThresholdMs) || settings.freshnessThresholdMs < 0) throw new ProviderConfigurationError("freshnessThresholdMs must be non-negative");
  if (settings.endpoint && !/^https:\/\//i.test(settings.endpoint)) throw new ProviderConfigurationError("endpoint must use HTTPS");
  return { ...settings, capabilities: [...new Set(settings.capabilities)] };
}

export function toProviderSettingsRecord(settings: ProviderSettingsInput, id = `provider-${settings.providerId}`, now = new Date().toISOString()): ProviderSettings {
  const valid = validateProviderSettings(settings);
  return { id, kind: "provider-settings", createdAt: now, updatedAt: now, version: 1, ...valid };
}

export async function saveProviderSettings(repository: WorkspaceRepository, settings: ProviderSettingsInput, id?: string): Promise<ProviderSettings> {
  const baseId = id ?? `provider-${settings.providerId}`;
  const history = (await repository.getAll("providerSettings")).filter((item) => item.providerId === settings.providerId).sort((left, right) => (right.version ?? 0) - (left.version ?? 0));
  const version = (history[0]?.version ?? 0) + 1;
  const recordId = history.length ? `${baseId}-v${version}` : baseId;
  const record = { ...toProviderSettingsRecord(settings, recordId), version };
  const audit = createAuditEvent({ now: record.updatedAt, eventType: "provider-settings", action: history.length ? "provider-settings-version-created" : "provider-settings-created", actorType: "user", entityType: "provider-settings", entityId: record.id, previousState: history[0] ?? {}, newState: record, reason: history.length ? "User changed provider settings; previous version retained" : "User configured a provider", correlationId: record.id });
  await repository.putBatch([{ store: "providerSettings", value: record }, { store: "auditEvents", value: audit }]);
  return record;
}

export class ProviderRegistry {
  private readonly providers = new Map<string, MarketDataProvider>();
  private readonly settings = new Map<string, ProviderSettings>();

  constructor(providers: MarketDataProvider[], settings: ProviderSettings[] = []) {
    for (const provider of providers) this.providers.set(provider.id, provider);
    for (const setting of settings) {
      const existing = this.settings.get(setting.providerId);
      if (!existing || (setting.version ?? 0) >= (existing.version ?? 0)) this.settings.set(setting.providerId, setting);
    }
  }

  available(): MarketDataProvider[] {
    return [...this.providers.values()].filter((provider) => {
      const setting = this.settings.get(provider.id);
      return setting?.enabled !== false && setting?.supportsBrowserRequests !== false;
    }).sort((left, right) => (this.settings.get(left.id)?.priority ?? Number.MAX_SAFE_INTEGER) - (this.settings.get(right.id)?.priority ?? Number.MAX_SAFE_INTEGER));
  }

  get(providerId: string): MarketDataProvider | undefined {
    return this.providers.get(providerId);
  }

  async withFallback<T>(operation: (provider: MarketDataProvider) => Promise<T>): Promise<{ value: T; providerId: string; failures: Array<{ providerId: string; error: string }> }> {
    const failures: Array<{ providerId: string; error: string }> = [];
    for (const provider of this.available()) {
      try {
        return { value: await operation(provider), providerId: provider.id, failures };
      } catch (error) {
        failures.push({ providerId: provider.id, error: error instanceof Error ? error.message : "Unknown provider error" });
      }
    }
    throw new Error(failures.length ? `All configured market-data providers failed: ${failures.map((failure) => failure.providerId).join(", ")}` : "No enabled browser-compatible market-data providers are configured");
  }
}

export type ProviderSettingsRecord = EntityMap["providerSettings"];
