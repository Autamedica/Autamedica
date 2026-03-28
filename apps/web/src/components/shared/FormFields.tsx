'use client';

import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from 'react';

export function Field({
  label,
  hint,
  icon,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  hint?: string;
  icon?: ReactNode;
}) {
  return (
    <label className="block space-y-2">
      <span className="text-sm font-medium text-gray-900">{label}</span>
      <div className="flex items-center gap-3 rounded-2xl border border-sky-100 bg-white px-4 py-3 shadow-[0_1px_2px_rgba(2,6,23,0.04)] transition-colors focus-within:border-sky-300">
        {icon ? <span className="text-sky-500">{icon}</span> : null}
        <input
          {...props}
          className={`w-full bg-transparent text-sm text-gray-900 outline-none placeholder:text-gray-400 ${props.className ?? ''}`}
        />
      </div>
      {hint ? <p className="text-xs text-gray-500">{hint}</p> : null}
    </label>
  );
}

export function SelectField({
  label,
  hint,
  icon,
  children,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement> & {
  label: string;
  hint?: string;
  icon?: ReactNode;
  children: ReactNode;
}) {
  return (
    <label className="block space-y-2">
      <span className="text-sm font-medium text-gray-900">{label}</span>
      <div className="flex items-center gap-3 rounded-2xl border border-sky-100 bg-white px-4 py-3 shadow-[0_1px_2px_rgba(2,6,23,0.04)] transition-colors focus-within:border-sky-300">
        {icon ? <span className="text-sky-500">{icon}</span> : null}
        <select
          {...props}
          className={`w-full bg-transparent text-sm text-gray-900 outline-none ${props.className ?? ''}`}
        >
          {children}
        </select>
      </div>
      {hint ? <p className="text-xs text-gray-500">{hint}</p> : null}
    </label>
  );
}
