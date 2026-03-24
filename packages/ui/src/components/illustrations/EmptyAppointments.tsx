import React from 'react'

export const EmptyAppointments: React.FC<{ className?: string }> = ({ className = '' }) => (
  <svg viewBox="0 0 120 120" fill="none" xmlns="http://www.w3.org/2000/svg" className={`w-24 h-24 ${className}`}>
    {/* Calendar body */}
    <rect x="22" y="30" width="76" height="68" rx="12" stroke="currentColor" strokeWidth="1.5" />
    {/* Calendar header */}
    <path d="M22 50h76" stroke="currentColor" strokeWidth="1.5" />
    {/* Calendar hooks */}
    <path d="M42 22v16M78 22v16" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    {/* Clock overlay */}
    <circle cx="84" cy="76" r="16" fill="white" stroke="#8B5CF6" strokeWidth="1.5" opacity="0.8" />
    <path d="M84 68v8l5 5" stroke="#8B5CF6" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" opacity="0.8" />
    {/* Calendar dots */}
    <circle cx="40" cy="62" r="2.5" fill="currentColor" opacity="0.2" />
    <circle cx="54" cy="62" r="2.5" fill="currentColor" opacity="0.2" />
    <circle cx="40" cy="78" r="2.5" fill="currentColor" opacity="0.2" />
    <circle cx="54" cy="78" r="2.5" fill="#8B5CF6" opacity="0.4" />
  </svg>
)
