import type { JSX, ReactNode, HTMLAttributes } from 'react'
type P = HTMLAttributes<HTMLElement> & { children: ReactNode }
export function Table({ children, className = '', ...r }: P): JSX.Element { return <table className={`w-full text-sm ${className}`} {...r}>{children}</table> }
export function TableHead({ children, ...r }: P): JSX.Element { return <thead {...r}>{children}</thead> }
export function TableBody({ children, ...r }: P): JSX.Element { return <tbody {...r}>{children}</tbody> }
export function TableRow({ children, className = '', ...r }: P): JSX.Element { return <tr className={`border-b ${className}`} {...r}>{children}</tr> }
export function TableHeader({ children, className = '', ...r }: P): JSX.Element { return <th className={`px-3 py-2 text-left font-medium ${className}`} {...r}>{children}</th> }
export function TableCell({ children, className = '', ...r }: P): JSX.Element { return <td className={`px-3 py-2 ${className}`} {...r}>{children}</td> }
