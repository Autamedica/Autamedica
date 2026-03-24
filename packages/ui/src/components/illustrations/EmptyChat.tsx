import React from 'react'

export const EmptyChat: React.FC<{ className?: string }> = ({ className = '' }) => (
  <svg viewBox="0 0 120 120" fill="none" xmlns="http://www.w3.org/2000/svg" className={`w-24 h-24 ${className}`}>
    {/* First chat bubble */}
    <rect x="16" y="24" width="56" height="36" rx="10" stroke="currentColor" strokeWidth="1.5" />
    <path d="M28 48l-8 12v-12" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
    {/* Lines inside first bubble */}
    <path d="M30 36h28M30 44h18" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity="0.3" />
    {/* Second chat bubble */}
    <rect x="48" y="60" width="56" height="36" rx="10" stroke="#8B5CF6" strokeWidth="1.5" opacity="0.7" />
    <path d="M92 84l8 12V84" stroke="#8B5CF6" strokeWidth="1.5" strokeLinejoin="round" opacity="0.7" />
    {/* Medical cross inside second bubble */}
    <path d="M76 72v12M70 78h12" stroke="#8B5CF6" strokeWidth="1.5" strokeLinecap="round" opacity="0.6" />
  </svg>
)
