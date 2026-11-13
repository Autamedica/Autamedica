type MetricError = { message: string } | null;
export type MetricQuery<T> = PromiseLike<{ data: T[] | null; error: MetricError; count?: number | null }> & {
  eq(column: string, value: boolean | string): MetricQuery<T>;
  order(column: string): MetricQuery<T>;
  range(from: number, to: number): MetricQuery<T>;
};
export type MetricClient = {
  from<T>(table: string): {
    select(columns: string, options?: { count: 'exact'; head: true }): MetricQuery<T>;
  };
};

export async function readMetricRows<T>(fetchPage: (from: number, to: number) => MetricQuery<T>): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += 500) {
    const { data, error } = await fetchPage(from, from + 499);
    if (error || !data) throw new Error(error?.message ?? 'Metric data unavailable');
    rows.push(...data);
    if (rows.length > 10_000) throw new Error('Metric scan exceeds row budget');
    if (data.length < 500) return rows;
  }
}

// A plan, payment marker or empty object does not identify a coverage provider.
export function coverageLabel(info: unknown): string {
  if (!info || typeof info !== 'object' || Array.isArray(info)) return 'Cobertura desconocida';
  const values = info as Record<string, unknown>;
  for (const key of ['provider', 'name', 'obra_social']) {
    const value = values[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return 'Cobertura desconocida';
}

export type PatientQualityRow = {
  user_id: string | null;
  birth_date: string | null;
  address: string | null;
  insurance_info: unknown;
};

export function summarizePatientQuality(rows: PatientQualityRow[]) {
  const byInsurance: Record<string, number> = Object.create(null);
  for (const row of rows) {
    const label = coverageLabel(row.insurance_info);
    byInsurance[label] = (byInsurance[label] ?? 0) + 1;
  }
  return {
    by_insurance: byInsurance,
    quality: {
      active_records: rows.length,
      linked_records: rows.filter(row => row.user_id !== null).length,
      linked_users: new Set(rows.flatMap(row => row.user_id ? [row.user_id] : [])).size,
      unlinked_records: rows.filter(row => row.user_id === null).length,
      with_birth_date: rows.filter(row => row.birth_date !== null).length,
      with_address: rows.filter(row => {
        const address = row.address?.trim();
        return Boolean(address) && address?.toLowerCase() !== 'sin especificar';
      }).length,
      coverage_unknown: byInsurance['Cobertura desconocida'] ?? 0,
    },
  };
}
