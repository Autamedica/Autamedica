import React from 'react'

export const EmptyMarketplace: React.FC<{ className?: string }> = ({ className = '' }) => (
  <svg viewBox="0 0 120 120" fill="none" xmlns="http://www.w3.org/2000/svg" className={`w-24 h-24 ${className}`}>
    {/* Map pin */}
    <path d="M60 20c-13.255 0-24 10.745-24 24 0 18 24 40 24 40s24-22 24-40c0-13.255-10.745-24-24-24z" stroke="currentColor" strokeWidth="1.5" />
    <circle cx="60" cy="44" r="10" stroke="currentColor" strokeWidth="1.5" />
    {/* Briefcase inside pin */}
    <rect x="52" y="40" width="16" height="10" rx="2" stroke="#8B5CF6" strokeWidth="1.5" opacity="0.7" />
    <path d="M56 40v-3a2 2 0 012-2h4a2 2 0 012 2v3" stroke="#8B5CF6" strokeWidth="1.5" opacity="0.7" />
    {/* Decorative dots (map markers) */}
    <circle cx="28" cy="86" r="3" fill="currentColor" opacity="0.15" />
    <circle cx="92" cy="78" r="3" fill="#8B5CF6" opacity="0.2" />
    <circle cx="84" cy="96" r="2" fill="currentColor" opacity="0.1" />
  </svg>
)
