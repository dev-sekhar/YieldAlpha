import type { ImportBatch } from "./import.js";
import type { ImportManifest } from "../storage/types.js";
import { WorkspaceRepository } from "../storage/indexeddb.js";
import { createAuditEvent } from "../audit/service.js";

export async function persistImportManifest(repository: WorkspaceRepository, batch: ImportBatch, now = new Date().toISOString()): Promise<ImportManifest> {
  const manifest: ImportManifest = {
    id: `import-${now}-${batch.kind}`.replace(/[^a-zA-Z0-9_-]/g, "-"), kind: "import-manifest", createdAt: now, updatedAt: now,
    ...(batch.fileName ? { fileName: batch.fileName } : { fileName: "manual-import" }), format: batch.fileName?.toLowerCase().endsWith(".csv") ? "csv" : "json",
    importedAt: batch.importedAt, rowCount: batch.totalRows, acceptedCount: batch.acceptedCount, rejectedCount: batch.rejectedCount, status: batch.status
  };
  const audit = createAuditEvent({ now, eventType: "data-import", action: `import-${manifest.status}`, actorType: "import", entityType: "import-manifest", entityId: manifest.id, previousState: {}, newState: manifest, reason: manifest.rejectedCount > 0 ? "Import completed with rejected records" : "Import completed", correlationId: manifest.id });
  await repository.putBatch([{ store: "importManifests", value: manifest }, { store: "auditEvents", value: audit }]);
  return manifest;
}
