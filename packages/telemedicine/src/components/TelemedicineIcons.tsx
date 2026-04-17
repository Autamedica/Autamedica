import React from 'react'

interface IconProps extends React.SVGProps<SVGSVGElement> {
  size?: number
}

/**
 * AutaMedica Custom Telemedicine Icons
 * Designed for High-End Medical Interfaces
 * Stroke: 1.5px | Estilo: Minimalist Organic
 */

export const IconCamera = ({ size = 24, ...props }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
    <path d="M15 10L19.5528 7.72361C20.2111 7.39443 21 7.87187 21 8.61803V15.382C21 16.1281 20.2111 16.6056 19.5528 16.2764L15 14M7 18H11C13.2091 18 15 16.2091 15 14V10C15 7.79086 13.2091 6 11 6H7C4.79086 6 3 7.79086 3 10V14C3 16.2091 4.79086 18 7 18Z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
)

export const IconMic = ({ size = 24, ...props }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
    <path d="M12 15C14.2091 15 16 13.2091 16 11V7C16 4.79086 14.2091 3 12 3C9.79086 3 8 4.79086 8 7V11C8 13.2091 9.79086 15 12 15Z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    <path d="M19 10V11C19 14.866 15.866 18 12 18C8.13401 18 5 14.866 5 11V10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    <path d="M12 18V21M12 21H9M12 21H15" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
)

export const IconPhoneEnd = ({ size = 24, ...props }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
    <path d="M10.68 13.31C12.13 15.34 13.67 17.11 15.36 18.51C15.65 18.75 16.03 18.88 16.42 18.87C16.81 18.86 17.18 18.72 17.47 18.47L20.08 15.86C20.65 15.29 20.65 14.37 20.08 13.8L17.7 11.22C17.13 10.65 16.21 10.65 15.64 11.22L14.39 12.47C14.01 12.28 13.56 12.01 13.08 11.63C12.16 10.89 11.19 9.87 10.51 8.65L11.77 7.4C12.34 6.83 12.34 5.91 11.77 5.34L9.16 2.76C8.59 2.19 7.67 2.19 7.1 2.76L4.53 5.32C4.1 5.75 3.86 6.33 3.87 6.94C3.9 8.28 4.36 10.3 5.4 12.44C6.8 15.22 8.79 17.91 11.24 20.36" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
)

export const IconPulse = ({ size = 24, ...props }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
    <path d="M3 12H6L9 3L15 21L18 12H21" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
)

export const IconShieldCheck = ({ size = 24, ...props }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
    <path d="M12 22C12 22 20 18 20 12V5L12 2L4 5V12C4 18 12 22 12 22Z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    <path d="M9 12L11 14L15 10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
)

export const IconConnectivity = ({ level = 3, size = 24, ...props }: { level?: number; size?: number } & React.SVGProps<SVGSVGElement>) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
    <path d="M5 18V16" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" opacity={level >= 1 ? 1 : 0.3}/>
    <path d="M9 18V13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" opacity={level >= 2 ? 1 : 0.3}/>
    <path d="M13 18V10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" opacity={level >= 3 ? 1 : 0.3}/>
    <path d="M17 18V7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" opacity={level >= 4 ? 1 : 0.3}/>
  </svg>
)
