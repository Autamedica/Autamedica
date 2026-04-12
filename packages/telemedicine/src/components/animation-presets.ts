/**
 * Shared animation presets for AutaMedica telemedicine components.
 * Ensures visual consistency across all call-related UI.
 *
 * Usage:
 *   import { springGentle, fadeIn } from './animation-presets'
 *   <motion.div transition={springGentle} variants={fadeIn} />
 */
import type { Transition, Variants } from 'framer-motion'

// ── Spring Configs ──

export const springGentle: Transition = {
  type: 'spring',
  stiffness: 120,
  damping: 14,
}

export const springSnappy: Transition = {
  type: 'spring',
  stiffness: 300,
  damping: 20,
}

export const springBouncy: Transition = {
  type: 'spring',
  stiffness: 200,
  damping: 12,
  mass: 0.8,
}

// ── Basic Variants ──

export const fadeIn: Variants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { duration: 0.3 } },
  exit: { opacity: 0, transition: { duration: 0.2 } },
}

export const slideUp: Variants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: springGentle },
  exit: { opacity: 0, y: 20, transition: { duration: 0.2 } },
}

export const slideDown: Variants = {
  hidden: { opacity: 0, y: -40 },
  visible: { opacity: 1, y: 0, transition: springGentle },
  exit: { opacity: 0, y: -40, transition: { duration: 0.2 } },
}

export const slideRight: Variants = {
  hidden: { x: '110%' },
  visible: { x: 0, transition: springGentle },
  exit: { x: '110%', transition: { duration: 0.25 } },
}

export const slideFromBottom: Variants = {
  hidden: { y: '100%' },
  visible: { y: 0, transition: springGentle },
  exit: { y: '100%', transition: { duration: 0.25 } },
}

export const scaleIn: Variants = {
  hidden: { opacity: 0, scale: 0.85 },
  visible: { opacity: 1, scale: 1, transition: springBouncy },
  exit: { opacity: 0, scale: 0.85, transition: { duration: 0.2 } },
}

// ── Stagger Variants ──

export function staggerContainer(staggerDelay = 0.08): Variants {
  return {
    hidden: {},
    visible: {
      transition: {
        staggerChildren: staggerDelay,
      },
    },
  }
}

export const staggerChild: Variants = {
  hidden: { opacity: 0, x: -12 },
  visible: { opacity: 1, x: 0, transition: springGentle },
}

// ── Telemedicine-specific Variants ──

export const pulseRing: Variants = {
  pulse: {
    scale: [1, 2.5],
    opacity: [0.15, 0],
    transition: {
      duration: 2,
      repeat: Infinity,
      ease: 'easeOut',
    },
  },
}

export const pulseRingDelayed: Variants = {
  pulse: {
    scale: [1, 2.5],
    opacity: [0.15, 0],
    transition: {
      duration: 2,
      repeat: Infinity,
      ease: 'easeOut',
      delay: 0.6,
    },
  },
}

export const controlBarVariants: Variants = {
  hidden: { y: 80, opacity: 0 },
  visible: { y: 0, opacity: 1, transition: springGentle },
  exit: { y: 80, opacity: 0, transition: { duration: 0.3 } },
}

export const topBarVariants: Variants = {
  hidden: { y: -60, opacity: 0 },
  visible: { y: 0, opacity: 1, transition: springGentle },
  exit: { y: -60, opacity: 0, transition: { duration: 0.3 } },
}

export const messageBubble: Variants = {
  hidden: { opacity: 0, y: 12, scale: 0.96 },
  visible: { opacity: 1, y: 0, scale: 1, transition: springGentle },
}

export const modalOverlay: Variants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { duration: 0.2 } },
  exit: { opacity: 0, transition: { duration: 0.15 } },
}

export const modalContent: Variants = {
  hidden: { scale: 0.85, opacity: 0, y: 30 },
  visible: { scale: 1, opacity: 1, y: 0, transition: springBouncy },
  exit: { scale: 0.85, opacity: 0, y: 30, transition: { duration: 0.2 } },
}

// ── Button Presets ──

export const buttonHover = { scale: 1.08 }
export const buttonTap = { scale: 0.88 }
export const buttonGentleHover = { scale: 1.03 }
export const buttonGentleTap = { scale: 0.97 }
