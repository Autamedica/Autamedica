'use client';

import { Sparkles } from 'lucide-react';

export function CrossModuleCard({
  title,
  description,
  href,
  stats,
}: {
  title: string;
  description: string;
  href?: string;
  stats: Array<{ label: string; value: string }>;
}) {
  const content = (
    <div className="rounded-3xl border border-sky-100 bg-white p-5 shadow-am-card transition-all hover:border-sky-200">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="font-heading text-2xl text-gray-950">{title}</h3>
          <p className="mt-2 text-sm leading-6 text-gray-600">{description}</p>
        </div>
        <span className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-sky-50 text-sky-600">
          <Sparkles className="h-5 w-5" />
        </span>
      </div>
      <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
        {stats.map((stat) => (
          <div key={stat.label} className="rounded-2xl bg-sky-50/60 px-4 py-3">
            <p className="text-xs uppercase tracking-[0.18em] text-gray-400">{stat.label}</p>
            <p className="mt-1 text-sm font-semibold text-gray-900">{stat.value}</p>
          </div>
        ))}
      </div>
      {href ? (
        <div className="mt-5">
          <span className="inline-flex items-center gap-2 text-sm font-semibold text-sky-700">
            Ir al módulo
            <span aria-hidden="true">→</span>
          </span>
        </div>
      ) : null}
    </div>
  );

  if (!href) {
    return content;
  }

  return (
    <a href={href} className="block">
      {content}
    </a>
  );
}
