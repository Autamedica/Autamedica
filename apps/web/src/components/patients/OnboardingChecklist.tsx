'use client'

import { Check, ChevronDown, ChevronUp } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

interface ChecklistItem {
  key: string
  label: string
  completed: boolean
  href: string
}

interface OnboardingChecklistProps {
  items: ChecklistItem[]
  completedCount: number
  totalCount: number
}

const DISMISS_KEY = 'au-onboarding-dismissed'

export default function OnboardingChecklist({ items, completedCount, totalCount }: OnboardingChecklistProps) {
  const [dismissed, setDismissed] = useState(false)
  const [expanded, setExpanded] = useState(completedCount / totalCount < 0.5)
  const contentRef = useRef<HTMLDivElement>(null)
  const [contentHeight, setContentHeight] = useState(0)

  useEffect(() => {
    try {
      if (sessionStorage.getItem(DISMISS_KEY) === '1') setDismissed(true)
    } catch {
      // SSR or blocked storage
    }
  }, [])

  useEffect(() => {
    if (contentRef.current) {
      setContentHeight(contentRef.current.scrollHeight)
    }
  }, [items, expanded])

  function handleDismiss() {
    setDismissed(true)
    try {
      sessionStorage.setItem(DISMISS_KEY, '1')
    } catch {
      // blocked storage
    }
  }

  if (dismissed) return null

  const pending = items.filter(i => !i.completed)
  const completed = items.filter(i => i.completed)
  const sorted = [...completed, ...pending]

  return (
    <section className="mb-6">
      <div className="overflow-hidden rounded-xl border border-sky-100 bg-sky-50/30">
        {/* Header */}
        <button
          type="button"
          onClick={() => setExpanded(prev => !prev)}
          className="flex w-full items-center justify-between px-4 py-3 text-left transition-colors hover:bg-sky-50/60"
        >
          <span className="text-sm font-semibold text-gray-900">
            Completa tu perfil — {completedCount} de {totalCount}
          </span>
          {expanded ? (
            <ChevronUp className="h-4 w-4 text-gray-400" />
          ) : (
            <ChevronDown className="h-4 w-4 text-gray-400" />
          )}
        </button>

        {/* Collapsible content */}
        <div
          style={{ maxHeight: expanded ? `${contentHeight}px` : '0px' }}
          className="overflow-hidden transition-[max-height] duration-300 ease-in-out"
        >
          <div ref={contentRef}>
            <div className="border-t border-sky-100 px-4 pb-3 pt-2">
              <ul className="space-y-1">
                {sorted.map(item => (
                  <li key={item.key}>
                    <a
                      href={item.href}
                      className="group flex items-center justify-between rounded-lg px-2 py-2 transition-colors hover:bg-white/70"
                    >
                      <span className="flex items-center gap-2.5">
                        {item.completed ? (
                          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500">
                            <Check className="h-3 w-3 text-white" strokeWidth={3} />
                          </span>
                        ) : (
                          <span className="flex h-5 w-5 items-center justify-center rounded-full border-2 border-gray-300" />
                        )}
                        <span className={`text-sm ${item.completed ? 'text-gray-400 line-through' : 'text-gray-700'}`}>
                          {item.label}
                        </span>
                      </span>
                      {!item.completed && (
                        <span className="text-xs font-medium text-sky-500 opacity-0 transition-opacity group-hover:opacity-100">
                          Completar &rarr;
                        </span>
                      )}
                    </a>
                  </li>
                ))}
              </ul>

              <button
                type="button"
                onClick={handleDismiss}
                className="mt-3 w-full text-center text-xs text-gray-400 transition-colors hover:text-gray-600"
              >
                Ya lo hare despues
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
