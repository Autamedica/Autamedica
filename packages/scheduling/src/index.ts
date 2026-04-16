/**
 * @autamedica/scheduling — MediAgenda Engine
 *
 * Motor de agenda inteligente para Autamedica.
 * Gestiona disponibilidad, slots, conflictos, waitlist,
 * recordatorios y predicción de no-show.
 */

// Slot generation
export {
  getAvailableSlots,
  getOpenSlots,
} from './slots';

// Conflict detection
export {
  checkConflict,
  checkConflictWithOverbook,
  findNextAvailable,
} from './conflicts';

export type { ConflictResult } from './conflicts';

// Waitlist management
export {
  addToWaitlist,
  processWaitlist,
  acceptWaitlistOffer,
  expireStaleOffers,
  cancelWaitlistEntry,
  getDoctorWaitlist,
} from './waitlist';

export {
  processUnsentWaitlistOffers,
} from './waitlist-dispatch';

// Reminder engine
export {
  scheduleReminders,
  getPendingReminders,
  markReminderSent,
  markReminderFailed,
  markReminderForRetry,
  cancelReminders,
  processReminderResponse,
} from './reminders';

// No-show prediction
export {
  predictNoShowProbability,
} from './noshow-predictor';

export {
  markOverdueAppointmentsNoShow,
} from './no-show-reaper';

export {
  getDoctorSchedulingConfig,
} from './config';

// OpenClaw integration (node:child_process is lazy-loaded, safe for edge runtimes)
export {
  sendMessage,
  sendMessageDirect,
  sendMessageWithFallback,
  buildReminder24h,
  buildReminder2h,
  buildWaitlistOffer,
  parsePatientResponse,
  DEFAULT_OPENCLAW_CONFIG,
} from './openclaw';

export type {
  OpenClawConfig,
  ReminderMessageData,
} from './openclaw';

// Reminder worker
export {
  processReminderCycle,
} from './reminder-worker';

// Supabase client type
export type { SupabaseLike } from './supabase';

export { processViralLoopReferrals } from './referrals';
