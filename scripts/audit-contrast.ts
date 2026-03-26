/**
 * AutaMedica — Color Contrast Audit Script
 *
 * Scans all .tsx, .astro, .css files for color pairs (text + background)
 * and checks WCAG 2.2 contrast ratios.
 *
 * WCAG AA: 4.5:1 normal text, 3:1 large text (18px+ bold or 24px+)
 * WCAG AAA: 7:1 normal text, 4.5:1 large text
 *
 * Usage: bun scripts/audit-contrast.ts
 */

import { Glob } from 'bun'

// --- Tailwind color map (subset of most used colors) ---
const TW_COLORS: Record<string, string> = {
  // White/Black
  'white': '#ffffff', 'black': '#000000',
  // Stone
  'stone-50': '#fafaf9', 'stone-100': '#f5f5f4', 'stone-200': '#e7e5e4',
  'stone-300': '#d6d3d1', 'stone-400': '#a8a29e', 'stone-500': '#78716c',
  'stone-600': '#57534e', 'stone-700': '#44403c', 'stone-800': '#292524',
  'stone-900': '#1c1917', 'stone-950': '#0c0a09',
  // Emerald
  'emerald-50': '#ecfdf5', 'emerald-100': '#d1fae5', 'emerald-200': '#a7f3d0',
  'emerald-300': '#6ee7b7', 'emerald-400': '#34d399', 'emerald-500': '#10b981',
  'emerald-600': '#059669', 'emerald-700': '#047857', 'emerald-800': '#065f46',
  'emerald-900': '#064e3b',
  // Cyan
  'cyan-50': '#ecfeff', 'cyan-100': '#cffafe', 'cyan-200': '#a5f3fc',
  'cyan-300': '#67e8f9', 'cyan-400': '#22d3ee', 'cyan-500': '#06b6d4',
  'cyan-600': '#0891b2', 'cyan-700': '#0e7490',
  // Sky
  'sky-50': '#f0f9ff', 'sky-100': '#e0f2fe', 'sky-200': '#bae6fd',
  'sky-300': '#7dd3fc', 'sky-400': '#38bdf8', 'sky-500': '#0ea5e9',
  'sky-600': '#0284c7', 'sky-700': '#0369a1',
  // Rose
  'rose-500': '#f43f5e', 'rose-600': '#e11d48',
  // Orange
  'orange-400': '#fb923c', 'orange-500': '#f97316', 'orange-600': '#ea580c',
  // Amber
  'amber-50': '#fffbeb', 'amber-100': '#fef3c7', 'amber-500': '#f59e0b',
  'amber-600': '#d97706', 'amber-700': '#b45309', 'amber-800': '#92400e',
  // Violet
  'violet-50': '#f5f3ff', 'violet-500': '#8b5cf6', 'violet-700': '#6d28d9',
  'violet-800': '#5b21b6',
  // Red
  'red-50': '#fef2f2', 'red-500': '#ef4444', 'red-600': '#dc2626',
  'red-700': '#b91c1c', 'red-800': '#991b1b',
  // Green
  'green-50': '#f0fdf4', 'green-300': '#86efac', 'green-500': '#22c55e',
  'green-600': '#16a34a', 'green-700': '#15803d', 'green-800': '#166534',
  'green-900': '#14532d',
}

// Parse hex to RGB
function hexToRgb(hex: string): [number, number, number] {
  hex = hex.replace('#', '')
  if (hex.length === 3) hex = hex[0]+hex[0]+hex[1]+hex[1]+hex[2]+hex[2]
  return [
    parseInt(hex.slice(0,2), 16),
    parseInt(hex.slice(2,4), 16),
    parseInt(hex.slice(4,6), 16),
  ]
}

// Relative luminance per WCAG 2.2
function luminance(r: number, g: number, b: number): number {
  const [rs, gs, bs] = [r, g, b].map(c => {
    c = c / 255
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
  })
  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs
}

// Contrast ratio
function contrastRatio(hex1: string, hex2: string): number {
  const l1 = luminance(...hexToRgb(hex1))
  const l2 = luminance(...hexToRgb(hex2))
  const lighter = Math.max(l1, l2)
  const darker = Math.min(l1, l2)
  return (lighter + 0.05) / (darker + 0.05)
}

// WCAG level
function wcagLevel(ratio: number, isLarge: boolean): string {
  if (isLarge) {
    if (ratio >= 4.5) return 'AAA'
    if (ratio >= 3) return 'AA'
    return 'FAIL'
  }
  if (ratio >= 7) return 'AAA'
  if (ratio >= 4.5) return 'AA'
  return 'FAIL'
}

// --- Pattern detection ---
interface ColorPair {
  file: string
  line: number
  textColor: string
  bgColor: string
  textHex: string
  bgHex: string
  ratio: number
  level: string
  context: string
}

// Extract Tailwind color from class like "text-stone-500", "bg-emerald-600"
function resolveTwColor(cls: string): string | null {
  const match = cls.match(/(?:text|bg|border|ring|shadow)-(\w+-\d+|white|black)/)
  if (!match) return null
  return TW_COLORS[match[1]] ?? null
}

// Scan a file for text/bg color pairs
function scanFile(path: string, content: string): ColorPair[] {
  const pairs: ColorPair[] = []
  const lines = content.split('\n')

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]

    // Find className strings with both text- and bg- colors
    const classMatch = line.match(/className="([^"]+)"|className={`([^`]+)`}/)
    if (!classMatch) continue
    const classes = (classMatch[1] ?? classMatch[2] ?? '').split(/\s+/)

    const textClasses = classes.filter(c => c.startsWith('text-') && !c.includes('text-sm') && !c.includes('text-xs') && !c.includes('text-lg') && !c.includes('text-xl') && !c.includes('text-2xl') && !c.includes('text-3xl') && !c.includes('text-base') && !c.includes('text-left') && !c.includes('text-center') && !c.includes('text-right'))
    const bgClasses = classes.filter(c => c.startsWith('bg-'))

    for (const tc of textClasses) {
      const textHex = resolveTwColor(tc)
      if (!textHex) continue

      for (const bc of bgClasses) {
        const bgHex = resolveTwColor(bc)
        if (!bgHex) continue

        const ratio = contrastRatio(textHex, bgHex)
        const isLarge = classes.some(c => c.includes('text-lg') || c.includes('text-xl') || c.includes('text-2xl') || c.includes('text-3xl') || c.includes('font-bold') || c.includes('font-extrabold') || c.includes('font-black'))
        const level = wcagLevel(ratio, isLarge)

        pairs.push({
          file: path,
          line: i + 1,
          textColor: tc,
          bgColor: bc,
          textHex,
          bgHex,
          ratio: Math.round(ratio * 100) / 100,
          level,
          context: line.trim().slice(0, 80),
        })
      }
    }

    // Also check text on white (implicit bg)
    if (textClasses.length > 0 && bgClasses.length === 0) {
      for (const tc of textClasses) {
        const textHex = resolveTwColor(tc)
        if (!textHex) continue
        const ratio = contrastRatio(textHex, '#ffffff')
        const level = wcagLevel(ratio, false)
        if (level === 'FAIL') {
          pairs.push({
            file: path,
            line: i + 1,
            textColor: tc,
            bgColor: '(white implicit)',
            textHex,
            bgHex: '#ffffff',
            ratio: Math.round(ratio * 100) / 100,
            level,
            context: line.trim().slice(0, 80),
          })
        }
      }
    }
  }

  return pairs
}

// --- Main ---
async function main() {
  console.log('\x1b[1m\x1b[36mAutaMedica — Contrast Audit (WCAG 2.2)\x1b[0m')
  console.log('========================================\n')

  const glob = new Glob('**/*.{tsx,astro,css}')
  const files = [...glob.scanSync({ cwd: 'apps/web/src', absolute: false })]

  let totalPairs = 0
  let fails: ColorPair[] = []
  let aaOnly: ColorPair[] = []

  for (const relPath of files) {
    const fullPath = `apps/web/src/${relPath}`
    const content = await Bun.file(fullPath).text()
    const pairs = scanFile(relPath, content)
    totalPairs += pairs.length

    for (const p of pairs) {
      if (p.level === 'FAIL') fails.push({ ...p, file: fullPath })
      else if (p.level === 'AA') aaOnly.push({ ...p, file: fullPath })
    }
  }

  // Report FAILS
  if (fails.length > 0) {
    console.log(`\x1b[31m\x1b[1mFAIL — ${fails.length} pairs below WCAG AA (ratio < 4.5:1)\x1b[0m\n`)
    for (const f of fails) {
      console.log(`  \x1b[31mFAIL\x1b[0m ${f.ratio}:1  ${f.textColor} on ${f.bgColor}`)
      console.log(`       ${f.file}:${f.line}`)
      console.log(`       ${f.textHex} on ${f.bgHex}`)

      // Suggest fix
      const suggestion = suggestFix(f.textHex, f.bgHex, f.textColor)
      if (suggestion) console.log(`       \x1b[33mFix: ${suggestion}\x1b[0m`)
      console.log()
    }
  } else {
    console.log('\x1b[32mNo WCAG AA failures found!\x1b[0m\n')
  }

  // Report AA-only (could be AAA)
  if (aaOnly.length > 0) {
    console.log(`\x1b[33mAA only — ${aaOnly.length} pairs pass AA but not AAA (ratio < 7:1)\x1b[0m\n`)
    for (const a of aaOnly.slice(0, 10)) {
      console.log(`  \x1b[33mAA\x1b[0m   ${a.ratio}:1  ${a.textColor} on ${a.bgColor}  ${a.file}:${a.line}`)
    }
    if (aaOnly.length > 10) console.log(`  ... and ${aaOnly.length - 10} more`)
    console.log()
  }

  // Summary
  console.log('========================================')
  console.log(`Scanned: ${files.length} files, ${totalPairs} color pairs`)
  console.log(`\x1b[31mFAIL: ${fails.length}\x1b[0m | \x1b[33mAA: ${aaOnly.length}\x1b[0m | \x1b[32mAAA: ${totalPairs - fails.length - aaOnly.length}\x1b[0m`)

  if (fails.length > 0) process.exit(1)
}

// Suggest a darker/lighter alternative
function suggestFix(textHex: string, bgHex: string, textClass: string): string | null {
  const bgLum = luminance(...hexToRgb(bgHex))
  const isLightBg = bgLum > 0.5

  // Find the color family
  const family = textClass.match(/text-(\w+)-(\d+)/)?.[1]
  if (!family) return null

  // Try darker shades on light bg, lighter on dark bg
  const shades = isLightBg ? [700, 800, 900, 950] : [100, 200, 300]
  for (const shade of shades) {
    const candidate = `${family}-${shade}`
    const hex = TW_COLORS[candidate]
    if (!hex) continue
    const ratio = contrastRatio(hex, bgHex)
    if (ratio >= 4.5) {
      return `Use text-${candidate} (${ratio.toFixed(1)}:1)`
    }
  }
  return null
}

main()
