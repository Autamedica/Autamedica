import React from 'react'

export const EmptyPatients: React.FC<{ className?: string }> = ({ className = '' }) => (
  <svg viewBox="0 0 120 120" fill="none" xmlns="http://www.w3.org/2000/svg" className={`w-24 h-24 ${className}`}>
    {/* Person silhouette */}
    <circle cx="60" cy="38" r="14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    <path d="M36 82c0-13.255 10.745-24 24-24s24 10.745 24 24" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    {/* Stethoscope */}
    <path d="M44 50c-6 4-10 10-10 18" stroke="#8B5CF6" strokeWidth="1.5" strokeLinecap="round" opacity="0.6" />
    <circle cx="34" cy="72" r="4" stroke="#8B5CF6" strokeWidth="1.5" opacity="0.6" />
    {/* Plus sign */}
    <circle cx="90" cy="30" r="12" stroke="#8B5CF6" strokeWidth="1.5" opacity="0.4" />
    <path d="M90 24v12M84 30h12" stroke="#8B5CF6" strokeWidth="1.5" strokeLinecap="round" opacity="0.6" />
  </svg>
)
