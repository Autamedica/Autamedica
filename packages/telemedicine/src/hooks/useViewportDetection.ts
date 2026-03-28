import { useState, useEffect } from 'react'

export function useViewportDetection() {
  const [isDesktopViewport, setIsDesktopViewport] = useState<boolean>(true)

  useEffect(() => {
    if (typeof window === 'undefined') return

    const handleResize = () => setIsDesktopViewport(window.innerWidth >= 768)
    handleResize()
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  return isDesktopViewport
}
