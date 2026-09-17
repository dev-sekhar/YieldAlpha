import { createAuditEvent } from "../audit/service.js";
import type { ExportManifest, Report, WorkspaceRepository } from "../storage/index.js";

export type ReportExportFormat = "json" | "csv" | "pdf";

function makeId(prefix: string): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return `${prefix}-${crypto.randomUUID()}`;
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function csvEscape(value: unknown): string {
  const text = typeof value === "string" ? value : JSON.stringify(value) ?? String(value);
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function flatten(value: unknown, prefix = "", rows: Array<[string, unknown]> = []): Array<[string, unknown]> {
  if (value === null || typeof value !== "object") {
    rows.push([prefix || "value", value]);
    return rows;
  }
  if (Array.isArray(value)) {
    if (value.length === 0) rows.push([prefix || "value", ""]);
    value.forEach((item, index) => flatten(item, `${prefix}[${index}]`, rows));
    return rows;
  }
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  if (keys.length === 0) rows.push([prefix || "value", ""]);
  keys.forEach((key) => flatten(record[key], prefix ? `${prefix}.${key}` : key, rows));
  return rows;
}

export function serializeReport(report: Report): string {
  return JSON.stringify(report, null, 2);
}

export function reportToCsv(report: Report): string {
  const rows = flatten({
    reportType: report.reportType,
    title: report.title,
    version: report.version,
    generatedAt: report.generatedAt ?? report.createdAt,
    modelVersionId: report.modelVersionId ?? "",
    settingsId: report.settingsId ?? "",
    dataSnapshotId: report.dataSnapshotId ?? "",
    content: report.content
  });
  return ["field,value", ...rows.map(([field, value]) => `${csvEscape(field)},${csvEscape(value)}`)].join("\n");
}

function escapeHtml(value: unknown): string {
  return String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
}

function displayValue(value: unknown): string {
  if (typeof value === "string") return value;
  return JSON.stringify(value, null, 2) ?? String(value);
}

export function reportToPrintHtml(report: Report): string {
  const title = escapeHtml(report.title);
  const generatedAt = escapeHtml(report.generatedAt ?? report.createdAt);
  const metadata = [
    ["Report type", report.reportType], ["Report version", report.version], ["Generated", generatedAt],
    ["Model version", report.modelVersionId ?? "Not specified"], ["Settings", report.settingsId ?? "Not specified"],
    ["Data snapshot", report.dataSnapshotId ?? "Not specified"]
  ];
  const sections = Object.entries(report.content).sort(([left], [right]) => left.localeCompare(right)).map(([key, value]) => `<section><h2>${escapeHtml(key)}</h2><pre>${escapeHtml(displayValue(value))}</pre></section>`).join("");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><style>body{font-family:system-ui,sans-serif;color:#17202a;line-height:1.45;max-width:960px;margin:2rem auto;padding:0 1rem}h1{margin-bottom:.25rem}h2{border-bottom:1px solid #d9dee5;padding-bottom:.35rem}dl{display:grid;grid-template-columns:minmax(9rem,14rem) 1fr;gap:.35rem 1rem;background:#f5f7fa;padding:1rem}dt{font-weight:700}dd{margin:0}pre{white-space:pre-wrap;overflow-wrap:anywhere;background:#f8fafc;border:1px solid #e2e8f0;border-radius:.4rem;padding:1rem}@media print{body{margin:0;max-width:none}section{break-inside:avoid}}</style></head><body><h1>${title}</h1><p>Generated ${generatedAt}. Use the browser print dialog to save a PDF.</p><dl>${metadata.map(([key, value]) => `<dt>${escapeHtml(key)}</dt><dd>${escapeHtml(value)}</dd>`).join("")}</dl>${sections}</body></html>`;
}

export function exportReport(report: Report, format: ReportExportFormat): string {
  if (format === "json") return serializeReport(report);
  if (format === "csv") return reportToCsv(report);
  return reportToPrintHtml(report);
}

export function downloadReport(report: Report, format: Exclude<ReportExportFormat, "pdf">, fileName = `yieldalpha-${report.reportType}-v${report.version}.${format}`): void {
  if (typeof document === "undefined" || typeof URL === "undefined") throw new Error("Report downloads require a browser document");
  const content = exportReport(report, format);
  const mimeType = format === "csv" ? "text/csv;charset=utf-8" : "application/json";
  const url = URL.createObjectURL(new Blob([content], { type: mimeType }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function openReportPrintView(report: Report): Window | null {
  if (typeof window === "undefined") throw new Error("Report printing requires a browser window");
  const printWindow = window.open("", "_blank", "noopener,noreferrer");
  if (!printWindow) return null;
  printWindow.document.open();
  printWindow.document.write(reportToPrintHtml(report));
  printWindow.document.close();
  return printWindow;
}

export async function recordReportExport(repository: WorkspaceRepository, report: Report, exportType: ReportExportFormat, fileName: string, now = new Date().toISOString()): Promise<ExportManifest> {
  const manifest: ExportManifest = { id: makeId("export"), kind: "export-manifest", createdAt: now, updatedAt: now, exportType, fileName, exportedAt: now, recordCount: 1 };
  const audit = createAuditEvent({ now, eventType: "report-export", action: "report-exported", actorType: "user", entityType: "report", entityId: report.id, previousState: {}, newState: { exportType, fileName, reportVersion: report.version }, reason: `User exported report as ${exportType.toUpperCase()}`, ...(report.modelVersionId ? { modelVersionId: report.modelVersionId } : {}), ...(report.settingsId ? { settingsId: report.settingsId } : {}), correlationId: manifest.id });
  await repository.putBatch([{ store: "exportManifests", value: manifest }, { store: "auditEvents", value: audit }]);
  return manifest;
}

