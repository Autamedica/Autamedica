import React from 'react'

export const EmptyRanking: React.FC<{ className?: string }> = ({ className = '' }) => (
  <svg viewBox="0 0 120 120" fill="none" xmlns="http://www.w3.org/2000/svg" className={`w-24 h-24 ${className}`}>
    {/* Podium blocks */}
    <rect x="14" y="62" width="28" height="38" rx="4" stroke="currentColor" strokeWidth="1.5" opacity="0.5" />
    <rect x="46" y="40" width="28" height="60" rx="4" stroke="#8B5CF6" strokeWidth="1.5" opacity="0.7" />
    <rect x="78" y="72" width="28" height="28" rx="4" stroke="currentColor" strokeWidth="1.5" opacity="0.4" />
    {/* Numbers */}
    <text x="28" y="85" textAnchor="middle" fontSize="14" fontWeight="600" fill="currentColor" opacity="0.3">2</text>
    <text x="60" y="68" textAnchor="middle" fontSize="14" fontWeight="600" fill="#8B5CF6" opacity="0.6">1</text>
    <text x="92" y="90" textAnchor="middle" fontSize="14" fontWeight="600" fill="currentColor" opacity="0.3">3</text>
    {/* Star above first place */}
    <path d="M60 18l3.5 7 7.5 1-5.5 5.3 1.3 7.7L60 35l-6.8 4 1.3-7.7L49 26l7.5-1L60 18z" stroke="#8B5CF6" strokeWidth="1.5" fill="#8B5CF6" fillOpacity="0.1" strokeLinejoin="round" />
  </svg>
)
