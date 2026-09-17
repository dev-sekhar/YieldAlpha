import { DATABASE_NAME, DATABASE_VERSION, STORE_DEFINITIONS, upgradeSchema } from "./schema.js";
import { STORE_NAMES, type EntityMap, type StoreName } from "./types.js";

export class StorageUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StorageUnavailableError";
  }
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB request failed"));
  });
}

function transactionResult(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error("IndexedDB transaction failed"));
    transaction.onabort = () => reject(transaction.error ?? new Error("IndexedDB transaction aborted"));
  });
}

export function openWorkspaceDb(): Promise<IDBDatabase> {
  if (typeof indexedDB === "undefined") {
    return Promise.reject(new StorageUnavailableError("IndexedDB is not available in this browser"));
  }
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = (event) => {
      if (!request.transaction) {
        reject(new StorageUnavailableError("IndexedDB upgrade transaction is unavailable"));
        return;
      }
      upgradeSchema(request.result, event.oldVersion, request.transaction);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Unable to open workspace database"));
    request.onblocked = () => reject(new StorageUnavailableError("Workspace database upgrade is blocked by another open tab"));
  });
}

export class WorkspaceRepository {
  constructor(private readonly db: IDBDatabase) {}

  async get<K extends StoreName>(store: K, id: string): Promise<EntityMap[K] | undefined> {
    const transaction = this.db.transaction(store, "readonly");
    return requestResult(transaction.objectStore(store).get(id)) as Promise<EntityMap[K] | undefined>;
  }

  async getAll<K extends StoreName>(store: K): Promise<Array<EntityMap[K]>> {
    const transaction = this.db.transaction(store, "readonly");
    return requestResult(transaction.objectStore(store).getAll()) as Promise<Array<EntityMap[K]>>;
  }

  async put<K extends StoreName>(store: K, value: EntityMap[K]): Promise<void> {
    const transaction = this.db.transaction(store, "readwrite");
    transaction.objectStore(store).put(value);
    await transactionResult(transaction);
  }

  async bulkPut<K extends StoreName>(store: K, values: Array<EntityMap[K]>): Promise<void> {
    if (values.length === 0) return;
    const transaction = this.db.transaction(store, "readwrite");
    const objectStore = transaction.objectStore(store);
    for (const value of values) objectStore.put(value);
    await transactionResult(transaction);
  }

  async putBatch(records: Array<{ store: StoreName; value: EntityMap[StoreName] }>): Promise<void> {
    await this.mutateBatch(records.map((record) => ({ ...record, operation: "put" as const })));
  }

  async mutateBatch(mutations: Array<{ store: StoreName; operation: "put"; value: EntityMap[StoreName] } | { store: StoreName; operation: "delete"; key: IDBValidKey }>): Promise<void> {
    if (mutations.length === 0) return;
    const stores = [...new Set(mutations.map((mutation) => mutation.store))];
    const transaction = this.db.transaction(stores, "readwrite");
    for (const mutation of mutations) {
      if (mutation.operation === "put") transaction.objectStore(mutation.store).put(mutation.value);
      else transaction.objectStore(mutation.store).delete(mutation.key);
    }
    await transactionResult(transaction);
  }

  async clear<K extends StoreName>(store: K): Promise<void> {
    const transaction = this.db.transaction(store, "readwrite");
    transaction.objectStore(store).clear();
    await transactionResult(transaction);
  }

  async replaceAll(data: Partial<{ [K in StoreName]: Array<EntityMap[K]> }>): Promise<void> {
    const stores = STORE_NAMES.filter((name) => data[name] !== undefined);
    if (stores.length === 0) return;
    const transaction = this.db.transaction(stores, "readwrite");
    for (const store of stores) {
      const objectStore = transaction.objectStore(store);
      objectStore.clear();
      for (const value of data[store] ?? []) objectStore.put(value);
    }
    await transactionResult(transaction);
  }

  async close(): Promise<void> {
    this.db.close();
  }
}

export async function createWorkspaceRepository(): Promise<WorkspaceRepository> {
  return new WorkspaceRepository(await openWorkspaceDb());
}

export function isKnownStore(value: string): value is StoreName {
  return Object.prototype.hasOwnProperty.call(STORE_DEFINITIONS, value);
}
