export function snakeToCamel(s: string): string {
  return s.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
}

export function rowToCamel<T extends Record<string, unknown>>(
  row: Record<string, unknown>,
): T {
  const out: Record<string, unknown> = {};
  for (const k in row) {
    out[snakeToCamel(k)] = row[k];
  }
  return out as T;
}

export function rowsToCamel<T extends Record<string, unknown>>(
  rows: Record<string, unknown>[],
): T[] {
  return rows.map((r) => rowToCamel<T>(r));
}
