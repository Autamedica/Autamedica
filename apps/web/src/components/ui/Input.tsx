import type { JSX, InputHTMLAttributes } from 'react'
export function Input(props: InputHTMLAttributes<HTMLInputElement>): JSX.Element {
  const { className = '', ...rest } = props
  return <input className={`rounded-md border px-3 py-2 text-sm ${className}`} {...rest} />
}
