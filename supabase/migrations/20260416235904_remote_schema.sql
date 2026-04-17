create extension if not exists "hypopg" with schema "extensions";

create extension if not exists "index_advisor" with schema "extensions";

drop extension if exists "pg_net";

create extension if not exists "pg_net" with schema "public";

drop trigger if exists "trg_sync_call_to_appointment" on "public"."calls";

drop trigger if exists "trg_validate_call_status" on "public"."calls";

drop trigger if exists "trg_clinical_ai_channel_bindings_updated_at" on "public"."clinical_ai_channel_bindings";

drop trigger if exists "trg_clinical_ai_context_snapshots_updated_at" on "public"."clinical_ai_context_snapshots";

drop trigger if exists "trg_clinical_ai_jobs_updated_at" on "public"."clinical_ai_jobs";

drop trigger if exists "trg_clinical_ai_media_items_updated_at" on "public"."clinical_ai_media_items";

drop trigger if exists "trg_clinical_ai_normalized_transcripts_updated_at" on "public"."clinical_ai_normalized_transcripts";

drop trigger if exists "trg_clinical_ai_outputs_updated_at" on "public"."clinical_ai_outputs";

drop trigger if exists "trg_clinical_ai_sessions_updated_at" on "public"."clinical_ai_sessions";

drop trigger if exists "trg_clinical_ai_transcripts_updated_at" on "public"."clinical_ai_transcripts";

drop policy "clinical_ai_channel_bindings_admins_select" on "public"."clinical_ai_channel_bindings";

drop policy "clinical_ai_context_snapshots_admins_select" on "public"."clinical_ai_context_snapshots";

drop policy "clinical_ai_context_snapshots_doctors_select" on "public"."clinical_ai_context_snapshots";

drop policy "clinical_ai_normalized_transcripts_admins_select" on "public"."clinical_ai_normalized_transcripts";

drop policy "clinical_ai_normalized_transcripts_doctors_select" on "public"."clinical_ai_normalized_transcripts";

drop policy "clinical_ai_outputs_admins_select" on "public"."clinical_ai_outputs";

drop policy "clinical_ai_outputs_doctors_select" on "public"."clinical_ai_outputs";

drop policy "clinical_ai_sessions_admins_select" on "public"."clinical_ai_sessions";

drop policy "clinical_ai_sessions_doctors_select" on "public"."clinical_ai_sessions";

revoke delete on table "public"."clinical_ai_channel_bindings" from "anon";

revoke insert on table "public"."clinical_ai_channel_bindings" from "anon";

revoke references on table "public"."clinical_ai_channel_bindings" from "anon";

revoke select on table "public"."clinical_ai_channel_bindings" from "anon";

revoke trigger on table "public"."clinical_ai_channel_bindings" from "anon";

revoke truncate on table "public"."clinical_ai_channel_bindings" from "anon";

revoke update on table "public"."clinical_ai_channel_bindings" from "anon";

revoke delete on table "public"."clinical_ai_channel_bindings" from "authenticated";

revoke insert on table "public"."clinical_ai_channel_bindings" from "authenticated";

revoke references on table "public"."clinical_ai_channel_bindings" from "authenticated";

revoke select on table "public"."clinical_ai_channel_bindings" from "authenticated";

revoke trigger on table "public"."clinical_ai_channel_bindings" from "authenticated";

revoke truncate on table "public"."clinical_ai_channel_bindings" from "authenticated";

revoke update on table "public"."clinical_ai_channel_bindings" from "authenticated";

revoke delete on table "public"."clinical_ai_channel_bindings" from "service_role";

revoke insert on table "public"."clinical_ai_channel_bindings" from "service_role";

revoke references on table "public"."clinical_ai_channel_bindings" from "service_role";

revoke select on table "public"."clinical_ai_channel_bindings" from "service_role";

revoke trigger on table "public"."clinical_ai_channel_bindings" from "service_role";

revoke truncate on table "public"."clinical_ai_channel_bindings" from "service_role";

revoke update on table "public"."clinical_ai_channel_bindings" from "service_role";

revoke delete on table "public"."clinical_ai_context_snapshots" from "anon";

revoke insert on table "public"."clinical_ai_context_snapshots" from "anon";

revoke references on table "public"."clinical_ai_context_snapshots" from "anon";

revoke select on table "public"."clinical_ai_context_snapshots" from "anon";

revoke trigger on table "public"."clinical_ai_context_snapshots" from "anon";

revoke truncate on table "public"."clinical_ai_context_snapshots" from "anon";

revoke update on table "public"."clinical_ai_context_snapshots" from "anon";

revoke delete on table "public"."clinical_ai_context_snapshots" from "authenticated";

revoke insert on table "public"."clinical_ai_context_snapshots" from "authenticated";

revoke references on table "public"."clinical_ai_context_snapshots" from "authenticated";

revoke select on table "public"."clinical_ai_context_snapshots" from "authenticated";

revoke trigger on table "public"."clinical_ai_context_snapshots" from "authenticated";

revoke truncate on table "public"."clinical_ai_context_snapshots" from "authenticated";

revoke update on table "public"."clinical_ai_context_snapshots" from "authenticated";

revoke delete on table "public"."clinical_ai_context_snapshots" from "service_role";

revoke insert on table "public"."clinical_ai_context_snapshots" from "service_role";

revoke references on table "public"."clinical_ai_context_snapshots" from "service_role";

revoke select on table "public"."clinical_ai_context_snapshots" from "service_role";

revoke trigger on table "public"."clinical_ai_context_snapshots" from "service_role";

revoke truncate on table "public"."clinical_ai_context_snapshots" from "service_role";

revoke update on table "public"."clinical_ai_context_snapshots" from "service_role";

revoke delete on table "public"."clinical_ai_delivery_events" from "anon";

revoke insert on table "public"."clinical_ai_delivery_events" from "anon";

revoke references on table "public"."clinical_ai_delivery_events" from "anon";

revoke select on table "public"."clinical_ai_delivery_events" from "anon";

revoke trigger on table "public"."clinical_ai_delivery_events" from "anon";

revoke truncate on table "public"."clinical_ai_delivery_events" from "anon";

revoke update on table "public"."clinical_ai_delivery_events" from "anon";

revoke delete on table "public"."clinical_ai_delivery_events" from "authenticated";

revoke insert on table "public"."clinical_ai_delivery_events" from "authenticated";

revoke references on table "public"."clinical_ai_delivery_events" from "authenticated";

revoke select on table "public"."clinical_ai_delivery_events" from "authenticated";

revoke trigger on table "public"."clinical_ai_delivery_events" from "authenticated";

revoke truncate on table "public"."clinical_ai_delivery_events" from "authenticated";

revoke update on table "public"."clinical_ai_delivery_events" from "authenticated";

revoke delete on table "public"."clinical_ai_delivery_events" from "service_role";

revoke insert on table "public"."clinical_ai_delivery_events" from "service_role";

revoke references on table "public"."clinical_ai_delivery_events" from "service_role";

revoke select on table "public"."clinical_ai_delivery_events" from "service_role";

revoke trigger on table "public"."clinical_ai_delivery_events" from "service_role";

revoke truncate on table "public"."clinical_ai_delivery_events" from "service_role";

revoke update on table "public"."clinical_ai_delivery_events" from "service_role";

revoke delete on table "public"."clinical_ai_jobs" from "anon";

revoke insert on table "public"."clinical_ai_jobs" from "anon";

revoke references on table "public"."clinical_ai_jobs" from "anon";

revoke select on table "public"."clinical_ai_jobs" from "anon";

revoke trigger on table "public"."clinical_ai_jobs" from "anon";

revoke truncate on table "public"."clinical_ai_jobs" from "anon";

revoke update on table "public"."clinical_ai_jobs" from "anon";

revoke delete on table "public"."clinical_ai_jobs" from "authenticated";

revoke insert on table "public"."clinical_ai_jobs" from "authenticated";

revoke references on table "public"."clinical_ai_jobs" from "authenticated";

revoke select on table "public"."clinical_ai_jobs" from "authenticated";

revoke trigger on table "public"."clinical_ai_jobs" from "authenticated";

revoke truncate on table "public"."clinical_ai_jobs" from "authenticated";

revoke update on table "public"."clinical_ai_jobs" from "authenticated";

revoke delete on table "public"."clinical_ai_jobs" from "service_role";

revoke insert on table "public"."clinical_ai_jobs" from "service_role";

revoke references on table "public"."clinical_ai_jobs" from "service_role";

revoke select on table "public"."clinical_ai_jobs" from "service_role";

revoke trigger on table "public"."clinical_ai_jobs" from "service_role";

revoke truncate on table "public"."clinical_ai_jobs" from "service_role";

revoke update on table "public"."clinical_ai_jobs" from "service_role";

revoke delete on table "public"."clinical_ai_media_items" from "anon";

revoke insert on table "public"."clinical_ai_media_items" from "anon";

revoke references on table "public"."clinical_ai_media_items" from "anon";

revoke select on table "public"."clinical_ai_media_items" from "anon";

revoke trigger on table "public"."clinical_ai_media_items" from "anon";

revoke truncate on table "public"."clinical_ai_media_items" from "anon";

revoke update on table "public"."clinical_ai_media_items" from "anon";

revoke delete on table "public"."clinical_ai_media_items" from "authenticated";

revoke insert on table "public"."clinical_ai_media_items" from "authenticated";

revoke references on table "public"."clinical_ai_media_items" from "authenticated";

revoke select on table "public"."clinical_ai_media_items" from "authenticated";

revoke trigger on table "public"."clinical_ai_media_items" from "authenticated";

revoke truncate on table "public"."clinical_ai_media_items" from "authenticated";

revoke update on table "public"."clinical_ai_media_items" from "authenticated";

revoke delete on table "public"."clinical_ai_media_items" from "service_role";

revoke insert on table "public"."clinical_ai_media_items" from "service_role";

revoke references on table "public"."clinical_ai_media_items" from "service_role";

revoke select on table "public"."clinical_ai_media_items" from "service_role";

revoke trigger on table "public"."clinical_ai_media_items" from "service_role";

revoke truncate on table "public"."clinical_ai_media_items" from "service_role";

revoke update on table "public"."clinical_ai_media_items" from "service_role";

revoke delete on table "public"."clinical_ai_normalized_transcripts" from "anon";

revoke insert on table "public"."clinical_ai_normalized_transcripts" from "anon";

revoke references on table "public"."clinical_ai_normalized_transcripts" from "anon";

revoke select on table "public"."clinical_ai_normalized_transcripts" from "anon";

revoke trigger on table "public"."clinical_ai_normalized_transcripts" from "anon";

revoke truncate on table "public"."clinical_ai_normalized_transcripts" from "anon";

revoke update on table "public"."clinical_ai_normalized_transcripts" from "anon";

revoke delete on table "public"."clinical_ai_normalized_transcripts" from "authenticated";

revoke insert on table "public"."clinical_ai_normalized_transcripts" from "authenticated";

revoke references on table "public"."clinical_ai_normalized_transcripts" from "authenticated";

revoke select on table "public"."clinical_ai_normalized_transcripts" from "authenticated";

revoke trigger on table "public"."clinical_ai_normalized_transcripts" from "authenticated";

revoke truncate on table "public"."clinical_ai_normalized_transcripts" from "authenticated";

revoke update on table "public"."clinical_ai_normalized_transcripts" from "authenticated";

revoke delete on table "public"."clinical_ai_normalized_transcripts" from "service_role";

revoke insert on table "public"."clinical_ai_normalized_transcripts" from "service_role";

revoke references on table "public"."clinical_ai_normalized_transcripts" from "service_role";

revoke select on table "public"."clinical_ai_normalized_transcripts" from "service_role";

revoke trigger on table "public"."clinical_ai_normalized_transcripts" from "service_role";

revoke truncate on table "public"."clinical_ai_normalized_transcripts" from "service_role";

revoke update on table "public"."clinical_ai_normalized_transcripts" from "service_role";

revoke delete on table "public"."clinical_ai_outputs" from "anon";

revoke insert on table "public"."clinical_ai_outputs" from "anon";

revoke references on table "public"."clinical_ai_outputs" from "anon";

revoke select on table "public"."clinical_ai_outputs" from "anon";

revoke trigger on table "public"."clinical_ai_outputs" from "anon";

revoke truncate on table "public"."clinical_ai_outputs" from "anon";

revoke update on table "public"."clinical_ai_outputs" from "anon";

revoke delete on table "public"."clinical_ai_outputs" from "authenticated";

revoke insert on table "public"."clinical_ai_outputs" from "authenticated";

revoke references on table "public"."clinical_ai_outputs" from "authenticated";

revoke select on table "public"."clinical_ai_outputs" from "authenticated";

revoke trigger on table "public"."clinical_ai_outputs" from "authenticated";

revoke truncate on table "public"."clinical_ai_outputs" from "authenticated";

revoke update on table "public"."clinical_ai_outputs" from "authenticated";

revoke delete on table "public"."clinical_ai_outputs" from "service_role";

revoke insert on table "public"."clinical_ai_outputs" from "service_role";

revoke references on table "public"."clinical_ai_outputs" from "service_role";

revoke select on table "public"."clinical_ai_outputs" from "service_role";

revoke trigger on table "public"."clinical_ai_outputs" from "service_role";

revoke truncate on table "public"."clinical_ai_outputs" from "service_role";

revoke update on table "public"."clinical_ai_outputs" from "service_role";

revoke delete on table "public"."clinical_ai_retention_events" from "anon";

revoke insert on table "public"."clinical_ai_retention_events" from "anon";

revoke references on table "public"."clinical_ai_retention_events" from "anon";

revoke select on table "public"."clinical_ai_retention_events" from "anon";

revoke trigger on table "public"."clinical_ai_retention_events" from "anon";

revoke truncate on table "public"."clinical_ai_retention_events" from "anon";

revoke update on table "public"."clinical_ai_retention_events" from "anon";

revoke delete on table "public"."clinical_ai_retention_events" from "authenticated";

revoke insert on table "public"."clinical_ai_retention_events" from "authenticated";

revoke references on table "public"."clinical_ai_retention_events" from "authenticated";

revoke select on table "public"."clinical_ai_retention_events" from "authenticated";

revoke trigger on table "public"."clinical_ai_retention_events" from "authenticated";

revoke truncate on table "public"."clinical_ai_retention_events" from "authenticated";

revoke update on table "public"."clinical_ai_retention_events" from "authenticated";

revoke delete on table "public"."clinical_ai_retention_events" from "service_role";

revoke insert on table "public"."clinical_ai_retention_events" from "service_role";

revoke references on table "public"."clinical_ai_retention_events" from "service_role";

revoke select on table "public"."clinical_ai_retention_events" from "service_role";

revoke trigger on table "public"."clinical_ai_retention_events" from "service_role";

revoke truncate on table "public"."clinical_ai_retention_events" from "service_role";

revoke update on table "public"."clinical_ai_retention_events" from "service_role";

revoke delete on table "public"."clinical_ai_sessions" from "anon";

revoke insert on table "public"."clinical_ai_sessions" from "anon";

revoke references on table "public"."clinical_ai_sessions" from "anon";

revoke select on table "public"."clinical_ai_sessions" from "anon";

revoke trigger on table "public"."clinical_ai_sessions" from "anon";

revoke truncate on table "public"."clinical_ai_sessions" from "anon";

revoke update on table "public"."clinical_ai_sessions" from "anon";

revoke delete on table "public"."clinical_ai_sessions" from "authenticated";

revoke insert on table "public"."clinical_ai_sessions" from "authenticated";

revoke references on table "public"."clinical_ai_sessions" from "authenticated";

revoke select on table "public"."clinical_ai_sessions" from "authenticated";

revoke trigger on table "public"."clinical_ai_sessions" from "authenticated";

revoke truncate on table "public"."clinical_ai_sessions" from "authenticated";

revoke update on table "public"."clinical_ai_sessions" from "authenticated";

revoke delete on table "public"."clinical_ai_sessions" from "service_role";

revoke insert on table "public"."clinical_ai_sessions" from "service_role";

revoke references on table "public"."clinical_ai_sessions" from "service_role";

revoke select on table "public"."clinical_ai_sessions" from "service_role";

revoke trigger on table "public"."clinical_ai_sessions" from "service_role";

revoke truncate on table "public"."clinical_ai_sessions" from "service_role";

revoke update on table "public"."clinical_ai_sessions" from "service_role";

revoke delete on table "public"."clinical_ai_transcripts" from "anon";

revoke insert on table "public"."clinical_ai_transcripts" from "anon";

revoke references on table "public"."clinical_ai_transcripts" from "anon";

revoke select on table "public"."clinical_ai_transcripts" from "anon";

revoke trigger on table "public"."clinical_ai_transcripts" from "anon";

revoke truncate on table "public"."clinical_ai_transcripts" from "anon";

revoke update on table "public"."clinical_ai_transcripts" from "anon";

revoke delete on table "public"."clinical_ai_transcripts" from "authenticated";

revoke insert on table "public"."clinical_ai_transcripts" from "authenticated";

revoke references on table "public"."clinical_ai_transcripts" from "authenticated";

revoke select on table "public"."clinical_ai_transcripts" from "authenticated";

revoke trigger on table "public"."clinical_ai_transcripts" from "authenticated";

revoke truncate on table "public"."clinical_ai_transcripts" from "authenticated";

revoke update on table "public"."clinical_ai_transcripts" from "authenticated";

revoke delete on table "public"."clinical_ai_transcripts" from "service_role";

revoke insert on table "public"."clinical_ai_transcripts" from "service_role";

revoke references on table "public"."clinical_ai_transcripts" from "service_role";

revoke select on table "public"."clinical_ai_transcripts" from "service_role";

revoke trigger on table "public"."clinical_ai_transcripts" from "service_role";

revoke truncate on table "public"."clinical_ai_transcripts" from "service_role";

revoke update on table "public"."clinical_ai_transcripts" from "service_role";

alter table "public"."clinical_ai_channel_bindings" drop constraint "clinical_ai_channel_bindings_channel_check";

alter table "public"."clinical_ai_channel_bindings" drop constraint "clinical_ai_channel_bindings_doctor_profile_id_fkey";

alter table "public"."clinical_ai_channel_bindings" drop constraint "clinical_ai_channel_bindings_unique_sender";

alter table "public"."clinical_ai_context_snapshots" drop constraint "clinical_ai_context_snapshots_completeness_score_check";

alter table "public"."clinical_ai_context_snapshots" drop constraint "clinical_ai_context_snapshots_session_id_fkey";

alter table "public"."clinical_ai_context_snapshots" drop constraint "clinical_ai_context_snapshots_source_check";

alter table "public"."clinical_ai_delivery_events" drop constraint "clinical_ai_delivery_events_attempt_check";

alter table "public"."clinical_ai_delivery_events" drop constraint "clinical_ai_delivery_events_channel_check";

alter table "public"."clinical_ai_delivery_events" drop constraint "clinical_ai_delivery_events_delivery_status_check";

alter table "public"."clinical_ai_delivery_events" drop constraint "clinical_ai_delivery_events_output_id_fkey";

alter table "public"."clinical_ai_delivery_events" drop constraint "clinical_ai_delivery_events_session_id_fkey";

alter table "public"."clinical_ai_jobs" drop constraint "clinical_ai_jobs_attempt_check";

alter table "public"."clinical_ai_jobs" drop constraint "clinical_ai_jobs_idempotency_key_key";

alter table "public"."clinical_ai_jobs" drop constraint "clinical_ai_jobs_media_item_id_fkey";

alter table "public"."clinical_ai_jobs" drop constraint "clinical_ai_jobs_session_id_fkey";

alter table "public"."clinical_ai_jobs" drop constraint "clinical_ai_jobs_stage_check";

alter table "public"."clinical_ai_jobs" drop constraint "clinical_ai_jobs_status_check";

alter table "public"."clinical_ai_media_items" drop constraint "clinical_ai_media_items_duration_seconds_check";

alter table "public"."clinical_ai_media_items" drop constraint "clinical_ai_media_items_provider_media_index_check";

alter table "public"."clinical_ai_media_items" drop constraint "clinical_ai_media_items_retention_check";

alter table "public"."clinical_ai_media_items" drop constraint "clinical_ai_media_items_session_id_fkey";

alter table "public"."clinical_ai_media_items" drop constraint "clinical_ai_media_items_size_bytes_check";

alter table "public"."clinical_ai_media_items" drop constraint "clinical_ai_media_items_status_check";

alter table "public"."clinical_ai_media_items" drop constraint "clinical_ai_media_items_unique_provider_media";

alter table "public"."clinical_ai_normalized_transcripts" drop constraint "clinical_ai_normalized_transcripts_session_id_fkey";

alter table "public"."clinical_ai_normalized_transcripts" drop constraint "clinical_ai_normalized_transcripts_source_transcript_id_fkey";

alter table "public"."clinical_ai_outputs" drop constraint "clinical_ai_outputs_context_snapshot_id_fkey";

alter table "public"."clinical_ai_outputs" drop constraint "clinical_ai_outputs_normalized_transcript_id_fkey";

alter table "public"."clinical_ai_outputs" drop constraint "clinical_ai_outputs_session_id_fkey";

alter table "public"."clinical_ai_outputs" drop constraint "clinical_ai_outputs_status_check";

alter table "public"."clinical_ai_outputs" drop constraint "clinical_ai_outputs_temperature_check";

alter table "public"."clinical_ai_retention_events" drop constraint "clinical_ai_retention_events_action_check";

alter table "public"."clinical_ai_retention_events" drop constraint "clinical_ai_retention_events_artifact_type_check";

alter table "public"."clinical_ai_retention_events" drop constraint "clinical_ai_retention_events_session_id_fkey";

alter table "public"."clinical_ai_sessions" drop constraint "clinical_ai_sessions_appointment_id_fkey";

alter table "public"."clinical_ai_sessions" drop constraint "clinical_ai_sessions_channel_check";

alter table "public"."clinical_ai_sessions" drop constraint "clinical_ai_sessions_doctor_profile_id_fkey";

alter table "public"."clinical_ai_sessions" drop constraint "clinical_ai_sessions_patient_profile_id_fkey";

alter table "public"."clinical_ai_sessions" drop constraint "clinical_ai_sessions_retention_check";

alter table "public"."clinical_ai_sessions" drop constraint "clinical_ai_sessions_status_check";

alter table "public"."clinical_ai_sessions" drop constraint "clinical_ai_sessions_telemedicine_session_id_fkey";

alter table "public"."clinical_ai_sessions" drop constraint "clinical_ai_sessions_time_order_check";

alter table "public"."clinical_ai_transcripts" drop constraint "clinical_ai_transcripts_duration_seconds_check";

alter table "public"."clinical_ai_transcripts" drop constraint "clinical_ai_transcripts_media_item_id_fkey";

alter table "public"."clinical_ai_transcripts" drop constraint "clinical_ai_transcripts_session_id_fkey";

alter table "public"."clinical_ai_transcripts" drop constraint "clinical_ai_transcripts_word_count_check";

alter table "public"."telemedicine_room_participants" drop constraint "unique_room_participant";

drop function if exists "public"."cleanup_duplicate_sessions"();

drop function if exists "public"."create_call"(p_doctor_id uuid, p_patient_id uuid, p_appointment_id uuid);

drop function if exists "public"."current_doctor_profile_id"();

drop function if exists "public"."touch_clinical_ai_updated_at"();

drop function if exists "public"."validate_call_status_transition"();

drop view if exists "public"."user_identifiers";

alter table "public"."clinical_ai_channel_bindings" drop constraint "clinical_ai_channel_bindings_pkey";

alter table "public"."clinical_ai_context_snapshots" drop constraint "clinical_ai_context_snapshots_pkey";

alter table "public"."clinical_ai_delivery_events" drop constraint "clinical_ai_delivery_events_pkey";

alter table "public"."clinical_ai_jobs" drop constraint "clinical_ai_jobs_pkey";

alter table "public"."clinical_ai_media_items" drop constraint "clinical_ai_media_items_pkey";

alter table "public"."clinical_ai_normalized_transcripts" drop constraint "clinical_ai_normalized_transcripts_pkey";

alter table "public"."clinical_ai_outputs" drop constraint "clinical_ai_outputs_pkey";

alter table "public"."clinical_ai_retention_events" drop constraint "clinical_ai_retention_events_pkey";

alter table "public"."clinical_ai_sessions" drop constraint "clinical_ai_sessions_pkey";

alter table "public"."clinical_ai_transcripts" drop constraint "clinical_ai_transcripts_pkey";

drop index if exists "public"."clinical_ai_channel_bindings_pkey";

drop index if exists "public"."clinical_ai_channel_bindings_unique_sender";

drop index if exists "public"."clinical_ai_context_snapshots_pkey";

drop index if exists "public"."clinical_ai_delivery_events_pkey";

drop index if exists "public"."clinical_ai_jobs_idempotency_key_key";

drop index if exists "public"."clinical_ai_jobs_pkey";

drop index if exists "public"."clinical_ai_media_items_pkey";

drop index if exists "public"."clinical_ai_media_items_unique_provider_media";

drop index if exists "public"."clinical_ai_normalized_transcripts_pkey";

drop index if exists "public"."clinical_ai_outputs_pkey";

drop index if exists "public"."clinical_ai_retention_events_pkey";

drop index if exists "public"."clinical_ai_sessions_pkey";

drop index if exists "public"."clinical_ai_transcripts_pkey";

drop index if exists "public"."idx_availability_doctor_day";

drop index if exists "public"."idx_clinical_ai_channel_bindings_doctor_active";

drop index if exists "public"."idx_clinical_ai_context_snapshots_session_created";

drop index if exists "public"."idx_clinical_ai_delivery_events_session_created";

drop index if exists "public"."idx_clinical_ai_delivery_events_status_created";

drop index if exists "public"."idx_clinical_ai_jobs_provider_operation_ref";

drop index if exists "public"."idx_clinical_ai_jobs_queue_status_scheduled";

drop index if exists "public"."idx_clinical_ai_jobs_session_stage_created";

drop index if exists "public"."idx_clinical_ai_media_items_session_received";

drop index if exists "public"."idx_clinical_ai_media_items_status_updated";

drop index if exists "public"."idx_clinical_ai_normalized_transcripts_session_created";

drop index if exists "public"."idx_clinical_ai_outputs_session_created";

drop index if exists "public"."idx_clinical_ai_outputs_status_created";

drop index if exists "public"."idx_clinical_ai_retention_events_session_executed";

drop index if exists "public"."idx_clinical_ai_sessions_active";

drop index if exists "public"."idx_clinical_ai_sessions_doctor_opened";

drop index if exists "public"."idx_clinical_ai_sessions_status_updated";

drop index if exists "public"."idx_clinical_ai_transcripts_session_created";

drop index if exists "public"."idx_history_appointment";

drop index if exists "public"."idx_history_doctor_date";

drop index if exists "public"."idx_history_patient_date";

drop index if exists "public"."idx_overrides_doctor_date";

drop index if exists "public"."idx_reminders_pending_schedule";

drop index if exists "public"."idx_waitlist_doctor_waiting";

drop index if exists "public"."unique_room_participant";

drop table "public"."clinical_ai_channel_bindings";

drop table "public"."clinical_ai_context_snapshots";

drop table "public"."clinical_ai_delivery_events";

drop table "public"."clinical_ai_jobs";

drop table "public"."clinical_ai_media_items";

drop table "public"."clinical_ai_normalized_transcripts";

drop table "public"."clinical_ai_outputs";

drop table "public"."clinical_ai_retention_events";

drop table "public"."clinical_ai_sessions";

drop table "public"."clinical_ai_transcripts";

alter table "public"."audit_logs" add column "deleted_at" timestamp with time zone;

alter table "public"."company_members" add column "deleted_at" timestamp with time zone;

alter table "public"."profiles" add column "deleted_at" timestamp with time zone;

set check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.doctor_has_patient_access(patient_user_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_doctor_id uuid;
  v_patient_id uuid;
BEGIN
  -- Verificar que el usuario actual es doctor
  IF NOT public.is_doctor() THEN
    RETURN false;
  END IF;

  -- Obtener ID del doctor actual
  SELECT id INTO v_doctor_id
  FROM public.doctors
  WHERE user_id = auth.uid() AND active = true;

  -- Obtener ID del paciente
  SELECT id INTO v_patient_id
  FROM public.patients
  WHERE user_id = patient_user_id AND active = true;

  IF v_doctor_id IS NULL OR v_patient_id IS NULL THEN
    RETURN false;
  END IF;

  -- Verificar si existe relación en alguna de las 3 fuentes de verdad
  RETURN EXISTS (
    -- 1. Care Team (Relación formal)
    SELECT 1 FROM public.patient_care_team
    WHERE doctor_id = v_doctor_id AND patient_id = v_patient_id AND active = true
    UNION ALL
    -- 2. Doctor Patient (Relación automática por citas)
    SELECT 1 FROM public.doctor_patient
    WHERE doctor_id = v_doctor_id AND patient_id = v_patient_id
    UNION ALL
    -- 3. Appointments (Citas directas)
    SELECT 1 FROM public.appointments
    WHERE doctor_id = v_doctor_id AND patient_id = v_patient_id AND deleted_at IS NULL
  );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.ensure_role_specific_record()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.role IS NOT DISTINCT FROM NEW.role THEN
    RETURN NEW;
  END IF;

  IF NEW.role = 'patient' THEN
    INSERT INTO public.patients (user_id, active)
    VALUES (NEW.user_id, true)
    ON CONFLICT (user_id) DO NOTHING;

  ELSIF NEW.role = 'doctor' THEN
    INSERT INTO public.doctors (user_id, license_number, specialty, active, languages)
    VALUES (
      NEW.user_id,
      'PENDING-' || substring(NEW.user_id::text, 1, 8),
      'General',
      true,
      '["Spanish"]'::jsonb
    )
    ON CONFLICT (user_id) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.is_doctor()
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.doctors
    WHERE user_id = auth.uid()
    AND active = true
  );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.log_medical_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_patient_user_id uuid;
  v_operation text;
BEGIN
  -- Determine operation type
  v_operation := TG_OP;

  -- Get patient's user_id
  SELECT p.user_id INTO v_patient_user_id
  FROM public.patients p
  WHERE p.id = COALESCE(NEW.patient_id, OLD.patient_id);

  -- Log the access (requires audit_logs table to exist)
  IF EXISTS (SELECT 1 FROM pg_class WHERE relname='audit_logs' AND relnamespace = 'public'::regnamespace) THEN
    INSERT INTO public.audit_logs (
      operation,
      table_name,
      record_id,
      patient_user_id,
      accessed_by,
      accessed_at,
      metadata
    ) VALUES (
      v_operation,
      'medical_records',
      COALESCE(NEW.id, OLD.id),
      v_patient_user_id,
      auth.uid(),
      now(),
      jsonb_build_object(
        'doctor_id', COALESCE(NEW.doctor_id, OLD.doctor_id),
        'diagnosis', COALESCE(NEW.diagnosis, OLD.diagnosis, 'N/A'),
        'ip_address', current_setting('request.headers', true)::json->>'x-forwarded-for'
      )
    );
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$function$
;

create or replace view "public"."user_identifiers" as  SELECT user_id,
    numeric_id,
    role,
    email,
    created_at AS profile_created_at,
        CASE role
            WHEN 'patient'::text THEN ('PT-'::text || numeric_id)
            WHEN 'doctor'::text THEN ('DR-'::text || numeric_id)
            WHEN 'company'::text THEN ('CO-'::text || numeric_id)
            WHEN 'company_admin'::text THEN ('CA-'::text || numeric_id)
            WHEN 'organization_admin'::text THEN ('AD-'::text || numeric_id)
            ELSE ('US-'::text || numeric_id)
        END AS display_id
   FROM public.profiles;



