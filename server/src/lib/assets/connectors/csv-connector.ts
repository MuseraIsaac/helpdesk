/**
 * CSV Discovery Adapter
 *
 * Parses a CSV buffer and yields DiscoveredAsset records.
 *
 * Required column: externalId (or aliases: external_id, id)
 * Required column: name (or alias: asset_name)
 *
 * Case-insensitive headers. All extra columns are passed through as `attributes`.
 *
 * Field aliases supported:
 *   external_id / id           → externalId
 *   asset_name                 → name
 *   asset_type                 → type
 *   serial_number / serial     → serialNumber
 *   asset_tag / tag            → assetTag
 *   make                       → manufacturer
 *   assigned_to_email /
 *   assigned_email / email     → assignedToEmail
 */

import type { AssetDiscoveryAdapter, DiscoveredAsset } from "../discovery-adapter";
import { CSV_COLUMN_ALIASES } from "core/constants/discovery.ts";

const MAX_ROWS = 10_000;

// ── Header normalisation ──────────────────────────────────────────────────────

function normaliseHeader(raw: string): string {
  const lower = raw.trim().toLowerCase().replace(/\s+/g, "_");
  return CSV_COLUMN_ALIASES[lower] ?? lower;
}

// ── Minimal CSV parser (no external dep) ─────────────────────────────────────
// Handles quoted fields and comma separators. For production, replace with
// a battle-tested parser (e.g. csv-parse) once it is added to dependencies.

function parseCSV(content: string): Record<string, string>[] {
  const lines = content.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  if (lines.length < 2) return [];

  const rawHeaders = splitCSVLine(lines[0]!);
  const headers = rawHeaders.map(normaliseHeader);

  const rows: Record<string, string>[] = [];
  for (let i = 1; i < Math.min(lines.length, MAX_ROWS + 1); i++) {
    const line = lines[i]!.trim();
    if (!line) continue;
    const values = splitCSVLine(line);
    const row: Record<string, string> = {};
    headers.forEach((h, idx) => {
      row[h] = values[idx]?.trim() ?? "";
    });
    rows.push(row);
  }
  return rows;
}

function splitCSVLine(line: string): string[] {
  const fields: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === "," && !inQuotes) {
      fields.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  fields.push(current);
  return fields;
}

// ── Adapter ───────────────────────────────────────────────────────────────────

export class CsvDiscoveryAdapter implements AssetDiscoveryAdapter {
  readonly source: string;
  readonly label = "CSV Import";

  private rows: Record<string, string>[];

  constructor(csvContent: string, sourceSlug = "csv") {
    this.source = sourceSlug;
    this.rows = parseCSV(csvContent);
  }

  get rowCount(): number {
    return this.rows.length;
  }

  async *discover(): AsyncIterable<DiscoveredAsset> {
    for (const row of this.rows) {
      const externalId = row.externalId?.trim();
      const name       = row.name?.trim();

      if (!externalId || !name) continue; // skip malformed rows silently

      // Separate known fields from extra attributes
      const {
        externalId: _eid, name: _name, type, serialNumber, assetTag,
        manufacturer, model, status, condition, location, site,
        assignedToEmail,
        ...extra
      } = row;

      const attributes: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(extra)) {
        if (v !== "") attributes[k] = v;
      }

      yield {
        externalId,
        source:     this.source,
        sourceLabel: "CSV Import",
        name,
        type:             type        || "other",
        serialNumber:     serialNumber || undefined,
        assetTag:         assetTag     || undefined,
        manufacturer:     manufacturer || undefined,
        model:            model        || undefined,
        status:           status       || undefined,
        condition:        condition    || undefined,
        location:         location     || undefined,
        site:             site         || undefined,
        assignedToEmail:  assignedToEmail || undefined,
        attributes:       Object.keys(attributes).length ? attributes : undefined,
      };
    }
  }
}

/** Returns a validation report without running a full sync — useful for UI preview. */
export function validateCsvContent(content: string): {
  rowCount:       number;
  validRows:      number;
  missingIdRows:  number;
  missingNameRows: number;
  headers:        string[];
  sampleErrors:   string[];
} {
  const rows = parseCSV(content);
  const headers = rows.length > 0 ? Object.keys(rows[0]!) : [];

  let missingId   = 0;
  let missingName = 0;
  const sampleErrors: string[] = [];

  for (const row of rows.slice(0, 1000)) {
    if (!row.externalId?.trim()) {
      missingId++;
      if (sampleErrors.length < 5) sampleErrors.push(`Row missing externalId: ${JSON.stringify(row)}`);
    }
    if (!row.name?.trim()) {
      missingName++;
      if (sampleErrors.length < 5) sampleErrors.push(`Row missing name: ${JSON.stringify(row)}`);
    }
  }

  return {
    rowCount:       rows.length,
    validRows:      rows.length - missingId - missingName,
    missingIdRows:  missingId,
    missingNameRows: missingName,
    headers,
    sampleErrors,
  };
}
