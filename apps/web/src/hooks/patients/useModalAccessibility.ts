'use client';

import { useFocusTrap } from '../shared/useFocusTrap';

interface UseModalAccessibilityOptions {
  isOpen: boolean;
  onClose: () => void;
}

/**
 * Thin wrapper around useFocusTrap that preserves the old API surface.
 * Returns { modalRef } so existing consumers keep working.
 */
export function useModalAccessibility({ isOpen, onClose }: UseModalAccessibilityOptions) {
  const { containerRef } = useFocusTrap({ isOpen, onClose });
  return { modalRef: containerRef };
}
