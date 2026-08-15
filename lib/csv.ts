/**
 * Small, dependency-free CSV helper shared across the app (audit export, ticket
 * export, …). Produces RFC-4180 compliant output: fields are quoted only when
 * they contain a comma, double-quote or newline, and embedded quotes are
 * doubled. Rows are joined with CRLF as the spec recommends.
 */

/** Render a single value for a CSV cell. Nullish → empty; Dates → ISO. */
function cell(value: unknown): string {
  if (value == null) return "";
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

/** RFC-4180 quoting: wrap in double-quotes and escape quotes when needed. */
function quote(raw: string): string {
  if (/[",\r\n]/.test(raw)) {
    return `"${raw.replace(/"/g, '""')}"`;
  }
  return raw;
}

/**
 * Turn an array of row objects into a CSV string.
 *
 * @param rows    the data rows.
 * @param columns explicit column order + header set. When omitted, the union
 *                of keys across all rows is used (order of first appearance).
 */
export function toCsv(rows: Record<string, unknown>[], columns?: string[]): string {
  const cols =
    columns ??
    Array.from(
      rows.reduce<Set<string>>((acc, row) => {
        for (const key of Object.keys(row)) acc.add(key);
        return acc;
      }, new Set<string>()),
    );

  const lines: string[] = [];
  lines.push(cols.map((c) => quote(c)).join(","));
  for (const row of rows) {
    lines.push(cols.map((c) => quote(cell(row[c]))).join(","));
  }
  return lines.join("\r\n");
}

/**
 * Build a downloadable `text/csv` Response with a Content-Disposition
 * attachment header. A leading UTF-8 BOM is included so Excel opens non-ASCII
 * content correctly.
 */
export function csvResponse(
  filename: string,
  rows: Record<string, unknown>[],
  columns?: string[],
): Response {
  const safeName = filename.endsWith(".csv") ? filename : `${filename}.csv`;
  const body = "﻿" + toCsv(rows, columns);
  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${safeName.replace(/"/g, "")}"`,
      "Cache-Control": "no-store",
    },
  });
}
