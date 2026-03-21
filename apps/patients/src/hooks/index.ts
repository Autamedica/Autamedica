/**
 * Patient Portal Hooks
 *
 * Custom React hooks for patient-specific functionality.
 * All hooks use Supabase for data persistence and real-time updates.
 */

// Core hooks
export { useAnamnesis } from './useAnamnesis';
export { useCommunity, useCommunityGroups, useCommunityPosts, useAutoJoinGroup } from './useCommunity';
export { usePatientScreenings } from './usePatientScreenings';
export { useMedicalHistory } from './useMedicalHistory';
export { usePreventiveScreenings } from './usePreventiveScreenings';

// Reproductive health hooks
export { useReproductiveHealthSpecialists } from './useReproductiveHealthSpecialists';
export { useReproductiveHealthAppointments } from './useReproductiveHealthAppointments';
export { useHealthCentersGeolocation } from './useHealthCentersGeolocation';
export { useMedicalChats, useChatMessages } from './useMedicalChat';

// Session hooks
export { usePatientSession } from './usePatientSession';
export { usePatientProfile } from './useProfile';

// Re-export types for convenience
export type {
  // Anamnesis
  Anamnesis,
  AnamnesisSection,
  AnamnesisStatus,
  AnamnesisSectionData,
  AnamnesisProgressResponse,

  // Community
  CommunityGroup,
  CommunityPost,
  PostComment,
  PostReaction,
  ReactionType,
  GroupMembership,
  CommunityFeedFilters,
} from '@autamedica/types';

// Re-export community types from local hooks
export type { CommunityGroup as CommunityGroupLocal, CommunityPost as CommunityPostLocal } from './useCommunity';