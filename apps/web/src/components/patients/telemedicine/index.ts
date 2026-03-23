/**
 * Telemedicine Components - Componentes para videoconsulta
 *
 * Suite de componentes React auxiliares para videollamadas médicas.
 * El componente principal de videollamada es UnifiedVideoCall de @autamedica/telemedicine.
 */

// Session controls
export { SessionControls } from './SessionControls'
export type { SessionControlsProps } from './SessionControls'

// Participant management
export { ParticipantGrid } from './ParticipantGrid'
export type { Participant, ParticipantGridProps } from './ParticipantGrid'

// Chat functionality
export { ChatPanel } from './ChatPanel'
export type { ChatMessage, ChatPanelProps } from './ChatPanel'

// Session stats and connection quality
export { SessionStats, ConnectionBadge } from './SessionStats'
export type { SessionStatsProps } from './SessionStats'
