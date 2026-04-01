import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

/**
 * Utility function to merge Tailwind classes safely without conflicts.
 * Essential for UI components allowing dynamic `className` overrides.
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
