import { useCallback, useEffect, useState } from 'react';

export interface UseSidebarReturn {
  isSidebarOpen: boolean;
  isSidebarCollapsed: boolean;
  activeSection: string | null;
  setIsSidebarOpen: (open: boolean) => void;
  setIsSidebarCollapsed: (collapsed: boolean) => void;
  setActiveSection: (section: string | null) => void;
  handleSidebarItemClick: (itemId: string) => void;
}

export function useSidebar(
  isFocusMode: boolean,
  setFocusMode: (focus: boolean) => void,
): UseSidebarReturn {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [activeSection, setActiveSection] = useState<string | null>(null);

  useEffect(() => {
    if (isFocusMode) {
      setIsSidebarCollapsed(true);
    }
  }, [isFocusMode]);

  const handleSidebarItemClick = useCallback((itemId: string) => {
    setIsSidebarOpen(false);
    if (isFocusMode) setFocusMode(false);
    setActiveSection(itemId);
  }, [isFocusMode, setFocusMode]);

  return {
    isSidebarOpen,
    isSidebarCollapsed,
    activeSection,
    setIsSidebarOpen,
    setIsSidebarCollapsed,
    setActiveSection,
    handleSidebarItemClick,
  };
}
