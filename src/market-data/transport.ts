import type { ProviderSettingsInput } from "./contracts.js";

export interface JsonRequest {
  url: string;
  init?: RequestInit;
  cacheKey?: string;
  cacheTtlMs?: number;
  signal?: AbortSignal;
}

export interface JsonResponse<T> {
  data: T;
  url: string;
  retrievedAt: string;
  fromCache: boolean;
  responseStatus: number;
}

export interface ResponseCache {
  get<T>(key: string, now?: number): Promise<T | undefined>;
  set<T>(key: string, value: T, ttlMs: number, now?: number): Promise<void>;
  delete(key: string): Promise<void>;
}

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

export class MemoryResponseCache implements ResponseCache {
  private readonly entries = new Map<string, CacheEntry<unknown>>();

  async get<T>(key: string, now = Date.now()): Promise<T | undefined> {
    const entry = this.entries.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt <= now) {
      this.entries.delete(key);
      return undefined;
    }
    return entry.value as T;
  }

  async set<T>(key: string, value: T, ttlMs: number, now = Date.now()): Promise<void> {
    if (ttlMs <= 0) return;
    this.entries.set(key, { value, expiresAt: now + ttlMs });
  }

  async delete(key: string): Promise<void> {
    this.entries.delete(key);
  }
}

export class BrowserCacheStorage implements ResponseCache {
  constructor(private readonly cacheName = "yieldalpha-market-data-v1") {}

  async get<T>(key: string, now = Date.now()): Promise<T | undefined> {
    if (typeof caches === "undefined") return undefined;
    const response = await (await caches.open(this.cacheName)).match(key);
    if (!response) return undefined;
    const envelope = await response.json() as { expiresAt: number; value: T };
    if (!Number.isFinite(envelope.expiresAt) || envelope.expiresAt <= now) {
      await (await caches.open(this.cacheName)).delete(key);
      return undefined;
    }
    return envelope.value;
  }

  async set<T>(key: string, value: T, ttlMs: number, now = Date.now()): Promise<void> {
    if (typeof caches === "undefined" || ttlMs <= 0) return;
    const cache = await caches.open(this.cacheName);
    await cache.put(key, new Response(JSON.stringify({ expiresAt: now + ttlMs, value }), { headers: { "content-type": "application/json" } }));
  }

  async delete(key: string): Promise<void> {
    if (typeof caches === "undefined") return;
    await (await caches.open(this.cacheName)).delete(key);
  }
}

export interface RetryPolicy {
  maxAttempts: number;
  initialDelayMs: number;
  maxDelayMs: number;
  jitterRatio: number;
}

const DEFAULT_RETRY_POLICY: RetryPolicy = { maxAttempts: 3, initialDelayMs: 250, maxDelayMs: 2_000, jitterRatio: 0.2 };

export class RateLimitError extends Error {
  constructor(public readonly retryAfterMs: number, message = "Provider rate limit reached") {
    super(message);
    this.name = "RateLimitError";
  }
}

export class ProviderHttpError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
    this.name = "ProviderHttpError";
  }
}

export class MinimumIntervalRateLimiter {
  private nextAllowedAt = 0;

  constructor(private readonly intervalMs: number) {}

  async wait(signal?: AbortSignal): Promise<void> {
    const waitMs = Math.max(0, this.nextAllowedAt - Date.now());
    if (waitMs > 0) await abortableDelay(waitMs, signal);
    this.nextAllowedAt = Date.now() + this.intervalMs;
  }
}

function abortableDelay(milliseconds: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) return Promise.reject(signal.reason ?? new DOMException("The operation was aborted", "AbortError"));
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, milliseconds);
    signal?.addEventListener("abort", () => {
      clearTimeout(timer);
      reject(signal.reason ?? new DOMException("The operation was aborted", "AbortError"));
    }, { once: true });
  });
}

function shouldRetry(error: unknown): boolean {
  if (error instanceof RateLimitError || error instanceof ProviderHttpError) {
    return error instanceof RateLimitError || error.status === 408 || error.status === 425 || error.status === 429 || error.status >= 500;
  }
  return error instanceof TypeError;
}

function retryDelay(policy: RetryPolicy, attempt: number, error: unknown): number {
  if (error instanceof RateLimitError) return Math.min(policy.maxDelayMs, error.retryAfterMs);
  const exponential = Math.min(policy.maxDelayMs, policy.initialDelayMs * (2 ** (attempt - 1)));
  const jitter = exponential * policy.jitterRatio * Math.random();
  return Math.round(exponential + jitter);
}

export class BrowserJsonTransport {
  private readonly retryPolicy: RetryPolicy;

  constructor(
    private readonly fetchImpl: typeof fetch = fetch,
    private readonly cache: ResponseCache = new BrowserCacheStorage(),
    private readonly rateLimiter = new MinimumIntervalRateLimiter(250),
    retryPolicy: Partial<RetryPolicy> = {}
  ) {
    this.retryPolicy = { ...DEFAULT_RETRY_POLICY, ...retryPolicy };
  }

  async requestJson<T>(request: JsonRequest): Promise<JsonResponse<T>> {
    if (!/^https:\/\//i.test(request.url)) throw new Error("Market-data requests must use HTTPS");
    if (request.cacheKey) {
      const cached = await this.cache.get<T>(request.cacheKey);
      if (cached !== undefined) return { data: cached, url: request.url, retrievedAt: new Date().toISOString(), fromCache: true, responseStatus: 200 };
    }
    let lastError: unknown;
    for (let attempt = 1; attempt <= this.retryPolicy.maxAttempts; attempt += 1) {
      try {
        await this.rateLimiter.wait(request.signal);
        const response = await this.fetchImpl(request.url, { ...request.init, ...(request.signal ? { signal: request.signal } : {}) });
        if (!response.ok) {
          const retryAfter = Number(response.headers.get("retry-after"));
          if (response.status === 429) throw new RateLimitError(Number.isFinite(retryAfter) ? retryAfter * 1_000 : this.retryPolicy.maxDelayMs);
          throw new ProviderHttpError(response.status, `Provider returned HTTP ${response.status}`);
        }
        const data = await response.json() as T;
        if (request.cacheKey && request.cacheTtlMs) await this.cache.set(request.cacheKey, data, request.cacheTtlMs);
        return { data, url: request.url, retrievedAt: new Date().toISOString(), fromCache: false, responseStatus: response.status };
      } catch (error) {
        lastError = error;
        if (request.signal?.aborted || !shouldRetry(error) || attempt === this.retryPolicy.maxAttempts) throw error;
        await abortableDelay(retryDelay(this.retryPolicy, attempt, error), request.signal);
      }
    }
    throw lastError ?? new Error("Provider request failed");
  }
}

export function buildApiKeyHeaders(settings: ProviderSettingsInput): HeadersInit {
  return settings.apiKey ? { Authorization: `Bearer ${settings.apiKey}` } : {};
}
