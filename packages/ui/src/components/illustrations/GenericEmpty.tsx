import React from 'react'

export const GenericEmpty: React.FC<{ className?: string }> = ({ className = '' }) => (
  <svg viewBox="0 0 120 120" fill="none" xmlns="http://www.w3.org/2000/svg" className={`w-24 h-24 ${className}`}>
    {/* Clipboard */}
    <rect x="28" y="24" width="52" height="72" rx="8" stroke="currentColor" strokeWidth="1.5" />
    <rect x="44" y="18" width="20" height="12" rx="4" stroke="currentColor" strokeWidth="1.5" />
    <circle cx="54" cy="24" r="2" fill="currentColor" opacity="0.3" />
    {/* Lines on clipboard */}
    <path d="M40 48h28M40 58h20M40 68h24" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity="0.25" />
    {/* Magnifying glass overlay */}
    <circle cx="82" cy="80" r="14" fill="white" stroke="#8B5CF6" strokeWidth="1.5" opacity="0.8" />
    <path d="M92 90l8 8" stroke="#8B5CF6" strokeWidth="2" strokeLinecap="round" opacity="0.7" />
    {/* Small sparkle */}
    <path d="M78 76l2-4 2 4-4 2 4 2-2 4-2-4-4-2 4-2z" fill="#8B5CF6" opacity="0.3" />
  </svg>
)
