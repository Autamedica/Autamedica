'use client';

import React, { createContext, useContext, useState } from 'react';
import { IncomingCallHandler } from '@/components/patients/calls/IncomingCallHandler';
import { usePatientSession } from '@/hooks/patients/usePatientSession';

interface PatientPortalContextType {
  isFocusMode: boolean;
  setFocusMode: (focus: boolean) => void;
  activePanel: string | null;
  setActivePanel: (panel: string | null) => void;
  isQuickActionsVisible: boolean;
  setQuickActionsVisible: (visible: boolean) => void;
}

const PatientPortalContext = createContext<PatientPortalContextType | null>(null);

export function usePatientPortal() {
  const context = useContext(PatientPortalContext);
  if (!context) {
    throw new Error('usePatientPortal must be used within PatientPortalProvider');
  }
  return context;
}

interface PatientPortalProviderProps {
  children: React.ReactNode;
}

export function PatientPortalProvider({ children }: PatientPortalProviderProps) {
  const [isFocusMode, setFocusMode] = useState(false);
  const [activePanel, setActivePanel] = useState<string | null>(null);
  const [isQuickActionsVisible, setQuickActionsVisible] = useState(false);

  const value = {
    isFocusMode,
    setFocusMode,
    activePanel,
    setActivePanel,
    isQuickActionsVisible,
    setQuickActionsVisible,
  };

  return (
    <PatientPortalContext.Provider value={value}>
      {children}
    </PatientPortalContext.Provider>
  );
}

interface PatientPortalShellProps {
  children: React.ReactNode;
  className?: string;
}

export function PatientPortalShell({ children, className = '' }: PatientPortalShellProps) {
  const { isFocusMode } = usePatientPortal();
  const { patient, profile } = usePatientSession();

  return (
    <div
      className={`min-h-screen bg-[linear-gradient(180deg,_#ffffff_0%,_#f4fbff_100%)] text-[#050505] ${
        isFocusMode ? 'overflow-hidden' : ''
      } ${className}`}
    >
      <div className={`flex flex-col h-screen ${isFocusMode ? 'p-2' : 'p-4'}`}>
        {children}
      </div>

      {/* Focus mode overlay */}
      {isFocusMode && (
        <div className="fixed inset-0 z-40 pointer-events-none bg-sky-500/8 backdrop-blur-sm" />
      )}
      
      {/* Global Call Handler */}
      {patient?.id && <IncomingCallHandler patientId={patient.id} patientName={profile?.first_name || 'Paciente'} />}
    </div>
  );
}
