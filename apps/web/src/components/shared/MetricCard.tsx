'use client';

import type { ReactNode } from 'react';

export function MetricCard({
  icon,
  label,
  value,
  accent = 'text-sky-600',
}: {
  icon: ReactNode;
  label: string;
  value: string;
  accent?: string;
}) {
  return (
    <div className="rounded-2xl border border-sky-100 bg-white p-4">
      <div className={`mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-sky-50 ${accent}`}>
        {icon}
      </div>
      <p className="text-xs font-medium uppercase tracking-[0.18em] text-gray-400">{label}</p>
      <p className="mt-2 text-lg font-semibold text-gray-900">{value}</p>
    </div>
  );
}
