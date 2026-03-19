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
  findNextAvailable,
} from './conflicts';

// Waitlist management
export {
  addToWaitlist,
  processWaitlist,
  acceptWaitlistOffer,
  expireStaleOffers,
  cancelWaitlistEntry,
  getDoctorWaitlist,
} from './waitlist';

// Reminder engine
export {
  scheduleReminders,
  getPendingReminders,
  markReminderSent,
  markReminderFailed,
  cancelReminders,
  processReminderResponse,
} from './reminders';

// No-show prediction
export {
  predictNoShowProbability,
} from './noshow-predictor';

// OpenClaw integration
export {
  sendMessage,
  sendMessageViaWebhook,
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
