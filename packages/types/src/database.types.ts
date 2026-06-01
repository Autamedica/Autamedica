export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.4"
  }
  public: {
    Tables: {
      adverse_drug_reactions: {
        Row: {
          action_taken: string | null
          anmat_case_id: string | null
          causality: string | null
          concomitant_medication: Json | null
          created_at: string
          doctor_id: string | null
          evaluated_at: string | null
          evaluated_by_doctor_id: string | null
          id: string
          narrative: string | null
          onset_date: string
          outcome: string | null
          patient_id: string
          prescription_id: string | null
          reported_by: string
          reported_to_anmat_at: string | null
          resolution_date: string | null
          severity: string
          status: string
          suspected_drug: string
          symptoms: Json
          updated_at: string
        }
        Insert: {
          action_taken?: string | null
          anmat_case_id?: string | null
          causality?: string | null
          concomitant_medication?: Json | null
          created_at?: string
          doctor_id?: string | null
          evaluated_at?: string | null
          evaluated_by_doctor_id?: string | null
          id?: string
          narrative?: string | null
          onset_date: string
          outcome?: string | null
          patient_id: string
          prescription_id?: string | null
          reported_by: string
          reported_to_anmat_at?: string | null
          resolution_date?: string | null
          severity: string
          status?: string
          suspected_drug: string
          symptoms: Json
          updated_at?: string
        }
        Update: {
          action_taken?: string | null
          anmat_case_id?: string | null
          causality?: string | null
          concomitant_medication?: Json | null
          created_at?: string
          doctor_id?: string | null
          evaluated_at?: string | null
          evaluated_by_doctor_id?: string | null
          id?: string
          narrative?: string | null
          onset_date?: string
          outcome?: string | null
          patient_id?: string
          prescription_id?: string | null
          reported_by?: string
          reported_to_anmat_at?: string | null
          resolution_date?: string | null
          severity?: string
          status?: string
          suspected_drug?: string
          symptoms?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "adverse_drug_reactions_doctor_id_fkey"
            columns: ["doctor_id"]
            isOneToOne: false
            referencedRelation: "doctors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "adverse_drug_reactions_evaluated_by_doctor_id_fkey"
            columns: ["evaluated_by_doctor_id"]
            isOneToOne: false
            referencedRelation: "doctors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "adverse_drug_reactions_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "adverse_drug_reactions_prescription_id_fkey"
            columns: ["prescription_id"]
            isOneToOne: false
            referencedRelation: "prescriptions"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_user_faq: {
        Row: {
          active: boolean
          answer: string
          created_at: string
          id: string
          question: string
          user_id: string
        }
        Insert: {
          active?: boolean
          answer: string
          created_at?: string
          id?: string
          question: string
          user_id: string
        }
        Update: {
          active?: boolean
          answer?: string
          created_at?: string
          id?: string
          question?: string
          user_id?: string
        }
        Relationships: []
      }
      ai_user_patterns: {
        Row: {
          active: boolean
          created_at: string
          id: string
          intent: string
          pattern: string
          user_id: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          intent: string
          pattern: string
          user_id: string
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          intent?: string
          pattern?: string
          user_id?: string
        }
        Relationships: []
      }
      anamnesis: {
        Row: {
          completed_at: string | null
          completion_percentage: number
          created_at: string
          deleted_at: string | null
          id: string
          locked: boolean
          patient_id: string
          privacy_accepted: boolean | null
          sections_status: Json
          status: string
          terms_accepted: boolean | null
          updated_at: string
        }
        Insert: {
          completed_at?: string | null
          completion_percentage?: number
          created_at?: string
          deleted_at?: string | null
          id?: string
          locked?: boolean
          patient_id: string
          privacy_accepted?: boolean | null
          sections_status?: Json
          status?: string
          terms_accepted?: boolean | null
          updated_at?: string
        }
        Update: {
          completed_at?: string | null
          completion_percentage?: number
          created_at?: string
          deleted_at?: string | null
          id?: string
          locked?: boolean
          patient_id?: string
          privacy_accepted?: boolean | null
          sections_status?: Json
          status?: string
          terms_accepted?: boolean | null
          updated_at?: string
        }
        Relationships: []
      }
      anamnesis_extractions: {
        Row: {
          anamnesis_id: string
          checkpoint: string
          created_at: string
          extraction_result: Json
          has_critical_questions: boolean
          id: string
          model: string
          patient_id: string
          prompt_version: string
          provider: string
          sections_count: number
          updated_at: string
        }
        Insert: {
          anamnesis_id: string
          checkpoint: string
          created_at?: string
          extraction_result?: Json
          has_critical_questions?: boolean
          id?: string
          model: string
          patient_id: string
          prompt_version: string
          provider: string
          sections_count?: number
          updated_at?: string
        }
        Update: {
          anamnesis_id?: string
          checkpoint?: string
          created_at?: string
          extraction_result?: Json
          has_critical_questions?: boolean
          id?: string
          model?: string
          patient_id?: string
          prompt_version?: string
          provider?: string
          sections_count?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "anamnesis_extractions_anamnesis_id_fkey"
            columns: ["anamnesis_id"]
            isOneToOne: false
            referencedRelation: "anamnesis"
            referencedColumns: ["id"]
          },
        ]
      }
      anamnesis_sections: {
        Row: {
          anamnesis_id: string
          completed: boolean
          completed_at: string | null
          data: Json
          id: string
          section: string
          updated_at: string
        }
        Insert: {
          anamnesis_id: string
          completed?: boolean
          completed_at?: string | null
          data?: Json
          id?: string
          section: string
          updated_at?: string
        }
        Update: {
          anamnesis_id?: string
          completed?: boolean
          completed_at?: string | null
          data?: Json
          id?: string
          section?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "anamnesis_sections_anamnesis_id_fkey"
            columns: ["anamnesis_id"]
            isOneToOne: false
            referencedRelation: "anamnesis"
            referencedColumns: ["id"]
          },
        ]
      }
      anamnesis_versions: {
        Row: {
          anamnesis_id: string
          changes_summary: Json | null
          created_at: string
          extraction_snapshot: Json | null
          id: string
          notes: string | null
          patient_id: string
          pdf_filename: string | null
          pdf_generated_at: string | null
          pdf_storage_key: string | null
          relevance: string | null
          sections_snapshot: Json
          trigger: string
          version_number: number
        }
        Insert: {
          anamnesis_id: string
          changes_summary?: Json | null
          created_at?: string
          extraction_snapshot?: Json | null
          id?: string
          notes?: string | null
          patient_id: string
          pdf_filename?: string | null
          pdf_generated_at?: string | null
          pdf_storage_key?: string | null
          relevance?: string | null
          sections_snapshot?: Json
          trigger: string
          version_number?: number
        }
        Update: {
          anamnesis_id?: string
          changes_summary?: Json | null
          created_at?: string
          extraction_snapshot?: Json | null
          id?: string
          notes?: string | null
          patient_id?: string
          pdf_filename?: string | null
          pdf_generated_at?: string | null
          pdf_storage_key?: string | null
          relevance?: string | null
          sections_snapshot?: Json
          trigger?: string
          version_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "anamnesis_versions_anamnesis_id_fkey"
            columns: ["anamnesis_id"]
            isOneToOne: false
            referencedRelation: "anamnesis"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "anamnesis_versions_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      anmat_trace_events: {
        Row: {
          anmat_transaction_id: string | null
          attempt_count: number
          confirmed_at: string | null
          created_at: string
          dispensation_event_id: string
          event_type: string
          gtin: string
          id: string
          last_error: string | null
          lote: string
          next_attempt_at: string | null
          reported_at: string | null
          request_payload: Json | null
          response_payload: Json | null
          serie: string
          status: string
          updated_at: string
          vencimiento: string
        }
        Insert: {
          anmat_transaction_id?: string | null
          attempt_count?: number
          confirmed_at?: string | null
          created_at?: string
          dispensation_event_id: string
          event_type: string
          gtin: string
          id?: string
          last_error?: string | null
          lote: string
          next_attempt_at?: string | null
          reported_at?: string | null
          request_payload?: Json | null
          response_payload?: Json | null
          serie: string
          status?: string
          updated_at?: string
          vencimiento: string
        }
        Update: {
          anmat_transaction_id?: string | null
          attempt_count?: number
          confirmed_at?: string | null
          created_at?: string
          dispensation_event_id?: string
          event_type?: string
          gtin?: string
          id?: string
          last_error?: string | null
          lote?: string
          next_attempt_at?: string | null
          reported_at?: string | null
          request_payload?: Json | null
          response_payload?: Json | null
          serie?: string
          status?: string
          updated_at?: string
          vencimiento?: string
        }
        Relationships: [
          {
            foreignKeyName: "anmat_trace_events_dispensation_event_id_fkey"
            columns: ["dispensation_event_id"]
            isOneToOne: false
            referencedRelation: "dispensation_events"
            referencedColumns: ["id"]
          },
        ]
      }
      api_keys: {
        Row: {
          belongs_to: string | null
          created_at: string
          created_by: string | null
          expires_at: string | null
          id: string
          key_hash: string
          key_prefix: string
          last_used_at: string | null
          name: string
          revoked_at: string | null
          scopes: string[]
          updated_at: string
        }
        Insert: {
          belongs_to?: string | null
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          id?: string
          key_hash: string
          key_prefix: string
          last_used_at?: string | null
          name: string
          revoked_at?: string | null
          scopes?: string[]
          updated_at?: string
        }
        Update: {
          belongs_to?: string | null
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          id?: string
          key_hash?: string
          key_prefix?: string
          last_used_at?: string | null
          name?: string
          revoked_at?: string | null
          scopes?: string[]
          updated_at?: string
        }
        Relationships: []
      }
      appointment_history: {
        Row: {
          action: string
          appointment_id: string
          created_at: string
          doctor_id: string
          id: string
          metadata: Json | null
          new_status: string | null
          old_status: string | null
          patient_id: string | null
        }
        Insert: {
          action: string
          appointment_id: string
          created_at?: string
          doctor_id: string
          id?: string
          metadata?: Json | null
          new_status?: string | null
          old_status?: string | null
          patient_id?: string | null
        }
        Update: {
          action?: string
          appointment_id?: string
          created_at?: string
          doctor_id?: string
          id?: string
          metadata?: Json | null
          new_status?: string | null
          old_status?: string | null
          patient_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "appointment_history_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
        ]
      }
      appointment_inbound_messages: {
        Row: {
          attempt_count: number
          channel: string
          created_at: string
          deferred_until: string | null
          from_phone: string
          id: string
          last_attempt_at: string | null
          last_error: string | null
          message_text: string
          next_attempt_at: string | null
          parsed_response: string | null
          processed_at: string | null
          source_message_key: string
          status: string
          updated_at: string
          webhook_result: Json
        }
        Insert: {
          attempt_count?: number
          channel: string
          created_at?: string
          deferred_until?: string | null
          from_phone: string
          id?: string
          last_attempt_at?: string | null
          last_error?: string | null
          message_text: string
          next_attempt_at?: string | null
          parsed_response?: string | null
          processed_at?: string | null
          source_message_key: string
          status?: string
          updated_at?: string
          webhook_result?: Json
        }
        Update: {
          attempt_count?: number
          channel?: string
          created_at?: string
          deferred_until?: string | null
          from_phone?: string
          id?: string
          last_attempt_at?: string | null
          last_error?: string | null
          message_text?: string
          next_attempt_at?: string | null
          parsed_response?: string | null
          processed_at?: string | null
          source_message_key?: string
          status?: string
          updated_at?: string
          webhook_result?: Json
        }
        Relationships: []
      }
      appointment_payments: {
        Row: {
          appointment_id: string
          checkout_url: string | null
          created_at: string
          currency: string
          doctor_id: string
          gross_amount: number
          id: string
          metadata: Json
          paid_at: string | null
          patient_id: string
          provider: string
          provider_payment_id: string | null
          provider_preference_id: string | null
          status: string
          updated_at: string
        }
        Insert: {
          appointment_id: string
          checkout_url?: string | null
          created_at?: string
          currency?: string
          doctor_id: string
          gross_amount: number
          id?: string
          metadata?: Json
          paid_at?: string | null
          patient_id: string
          provider?: string
          provider_payment_id?: string | null
          provider_preference_id?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          appointment_id?: string
          checkout_url?: string | null
          created_at?: string
          currency?: string
          doctor_id?: string
          gross_amount?: number
          id?: string
          metadata?: Json
          paid_at?: string | null
          patient_id?: string
          provider?: string
          provider_payment_id?: string | null
          provider_preference_id?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "appointment_payments_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: true
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointment_payments_doctor_id_fkey"
            columns: ["doctor_id"]
            isOneToOne: false
            referencedRelation: "doctors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointment_payments_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      appointment_reminders: {
        Row: {
          appointment_id: string
          channel: string
          created_at: string
          id: string
          last_error: string | null
          next_retry_at: string | null
          response: string | null
          retry_count: number
          scheduled_for: string
          sent_at: string | null
          status: string
        }
        Insert: {
          appointment_id: string
          channel: string
          created_at?: string
          id?: string
          last_error?: string | null
          next_retry_at?: string | null
          response?: string | null
          retry_count?: number
          scheduled_for: string
          sent_at?: string | null
          status?: string
        }
        Update: {
          appointment_id?: string
          channel?: string
          created_at?: string
          id?: string
          last_error?: string | null
          next_retry_at?: string | null
          response?: string | null
          retry_count?: number
          scheduled_for?: string
          sent_at?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "appointment_reminders_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
        ]
      }
      appointment_waitlist: {
        Row: {
          appointment_type: string
          created_at: string
          doctor_id: string
          expires_at: string | null
          id: string
          offer_sent_at: string | null
          offered_at: string | null
          offered_end_time: string | null
          offered_start_time: string | null
          patient_id: string
          preferred_date_end: string | null
          preferred_date_start: string | null
          preferred_time_end: string | null
          preferred_time_start: string | null
          priority: number
          status: string
          updated_at: string
        }
        Insert: {
          appointment_type?: string
          created_at?: string
          doctor_id: string
          expires_at?: string | null
          id?: string
          offer_sent_at?: string | null
          offered_at?: string | null
          offered_end_time?: string | null
          offered_start_time?: string | null
          patient_id: string
          preferred_date_end?: string | null
          preferred_date_start?: string | null
          preferred_time_end?: string | null
          preferred_time_start?: string | null
          priority?: number
          status?: string
          updated_at?: string
        }
        Update: {
          appointment_type?: string
          created_at?: string
          doctor_id?: string
          expires_at?: string | null
          id?: string
          offer_sent_at?: string | null
          offered_at?: string | null
          offered_end_time?: string | null
          offered_start_time?: string | null
          patient_id?: string
          preferred_date_end?: string | null
          preferred_date_start?: string | null
          preferred_time_end?: string | null
          preferred_time_start?: string | null
          priority?: number
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "appointment_waitlist_doctor_id_fkey"
            columns: ["doctor_id"]
            isOneToOne: false
            referencedRelation: "doctors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointment_waitlist_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      appointment_preconsultations: {
        Row: {
          appointment_id: string | null
          audio_log_urls: string[] | null
          clinical_state: Json
          created_at: string
          extraction_summary: Json | null
          id: string
          patient_id: string
          status: string
          updated_at: string
        }
        Insert: {
          appointment_id?: string | null
          audio_log_urls?: string[] | null
          clinical_state?: Json
          created_at?: string
          extraction_summary?: Json | null
          id?: string
          patient_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          appointment_id?: string | null
          audio_log_urls?: string[] | null
          clinical_state?: Json
          created_at?: string
          extraction_summary?: Json | null
          id?: string
          patient_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "appointment_preconsultations_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointment_preconsultations_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "appointment_preconsultations_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "user_identifiers"
            referencedColumns: ["user_id"]
          },
        ]
      }
      appointments: {
        Row: {
          created_at: string | null
          created_by: string | null
          deleted_at: string | null
          doctor_id: string | null
          duration_minutes: number | null
          end_time: string | null
          id: string
          location: string | null
          meeting_url: string | null
          notes: string | null
          patient_id: string | null
          referral_sent: boolean | null
          start_time: string
          status: string | null
          type: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          deleted_at?: string | null
          doctor_id?: string | null
          duration_minutes?: number | null
          end_time?: string | null
          id?: string
          location?: string | null
          meeting_url?: string | null
          notes?: string | null
          patient_id?: string | null
          referral_sent?: boolean | null
          start_time: string
          status?: string | null
          type?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          deleted_at?: string | null
          doctor_id?: string | null
          duration_minutes?: number | null
          end_time?: string | null
          id?: string
          location?: string | null
          meeting_url?: string | null
          notes?: string | null
          patient_id?: string | null
          referral_sent?: boolean | null
          start_time?: string
          status?: string | null
          type?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "appointments_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "appointments_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_identifiers"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "appointments_doctor_id_fkey"
            columns: ["doctor_id"]
            isOneToOne: false
            referencedRelation: "doctors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          action: string
          created_at: string
          deleted_at: string | null
          id: string
          ip_address: unknown
          metadata: Json | null
          resource_id: string | null
          resource_type: string
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          ip_address?: unknown
          metadata?: Json | null
          resource_id?: string | null
          resource_type: string
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          ip_address?: unknown
          metadata?: Json | null
          resource_id?: string | null
          resource_type?: string
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      auth_audit: {
        Row: {
          created_at: string | null
          data: Json | null
          event: string
          id: number
          ip_address: unknown
          user_agent: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          data?: Json | null
          event: string
          id?: number
          ip_address?: unknown
          user_agent?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          data?: Json | null
          event?: string
          id?: number
          ip_address?: unknown
          user_agent?: string | null
          user_id?: string
        }
        Relationships: []
      }
      call_events: {
        Row: {
          at: string
          call_id: string
          id: number
          payload: Json | null
          type: string
        }
        Insert: {
          at?: string
          call_id: string
          id?: number
          payload?: Json | null
          type: string
        }
        Update: {
          at?: string
          call_id?: string
          id?: number
          payload?: Json | null
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "call_events_call_id_fkey"
            columns: ["call_id"]
            isOneToOne: false
            referencedRelation: "calls"
            referencedColumns: ["id"]
          },
        ]
      }
      call_guest_invites: {
        Row: {
          call_id: string
          created_at: string
          expires_at: string
          guest_name: string
          id: string
          room_id: string
          used_at: string | null
        }
        Insert: {
          call_id: string
          created_at?: string
          expires_at: string
          guest_name: string
          id?: string
          room_id: string
          used_at?: string | null
        }
        Update: {
          call_id?: string
          created_at?: string
          expires_at?: string
          guest_name?: string
          id?: string
          room_id?: string
          used_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "call_guest_invites_call_id_fkey"
            columns: ["call_id"]
            isOneToOne: false
            referencedRelation: "calls"
            referencedColumns: ["id"]
          },
        ]
      }
      calls: {
        Row: {
          accepted_at: string | null
          appointment_id: string | null
          created_at: string
          doctor_id: string
          ended_at: string | null
          id: string
          patient_id: string | null
          reason: string | null
          room_id: string
          status: Database["public"]["Enums"]["call_status"]
        }
        Insert: {
          accepted_at?: string | null
          appointment_id?: string | null
          created_at?: string
          doctor_id: string
          ended_at?: string | null
          id?: string
          patient_id?: string | null
          reason?: string | null
          room_id: string
          status?: Database["public"]["Enums"]["call_status"]
        }
        Update: {
          accepted_at?: string | null
          appointment_id?: string | null
          created_at?: string
          doctor_id?: string
          ended_at?: string | null
          id?: string
          patient_id?: string | null
          reason?: string | null
          room_id?: string
          status?: Database["public"]["Enums"]["call_status"]
        }
        Relationships: [
          {
            foreignKeyName: "calls_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
        ]
      }
      clinical_ai_lab_analyses: {
        Row: {
          clinical_summary: string | null
          created_at: string
          error_message: string | null
          extracted_data_json: Json
          id: string
          inbound_message_id: string | null
          media_type: string
          patient_profile_id: string
          red_flags_detected: Json
          status: Database["public"]["Enums"]["lab_analysis_status"]
          storage_path: string
          study_date: string | null
          study_name: string | null
          updated_at: string
        }
        Insert: {
          clinical_summary?: string | null
          created_at?: string
          error_message?: string | null
          extracted_data_json?: Json
          id?: string
          inbound_message_id?: string | null
          media_type: string
          patient_profile_id: string
          red_flags_detected?: Json
          status?: Database["public"]["Enums"]["lab_analysis_status"]
          storage_path: string
          study_date?: string | null
          study_name?: string | null
          updated_at?: string
        }
        Update: {
          clinical_summary?: string | null
          created_at?: string
          error_message?: string | null
          extracted_data_json?: Json
          id?: string
          inbound_message_id?: string | null
          media_type?: string
          patient_profile_id?: string
          red_flags_detected?: Json
          status?: Database["public"]["Enums"]["lab_analysis_status"]
          storage_path?: string
          study_date?: string | null
          study_name?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "clinical_ai_lab_analyses_inbound_message_id_fkey"
            columns: ["inbound_message_id"]
            isOneToOne: false
            referencedRelation: "appointment_inbound_messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clinical_ai_lab_analyses_patient_profile_id_fkey"
            columns: ["patient_profile_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      clinical_case_states: {
        Row: {
          acknowledged_at: string | null
          assigned_doctor_id: string | null
          case_id: string
          case_intent: string
          clinical_vertical: string
          completed_segments: string[]
          conflicted_field_count: number
          created_at: string
          current_segment: string
          id: string
          integrity_score: number
          integrity_status: string
          locked_field_count: number
          medication_snapshot_days_remaining: number | null
          medication_snapshot_dose: string | null
          medication_snapshot_name: string | null
          missing_field_count: number
          patient_id: string
          requires_same_day_action: boolean | null
          resolution_deadline_at: string | null
          resolved_at: string | null
          risk_of_interruption: string | null
          state: Json
          symptoms_snapshot_insomnia_impact: string | null
          symptoms_snapshot_insomnia_severity: number | null
          triage_mandate: string | null
          triage_priority: string
          triage_priority_rank: number
          triage_status: string
          updated_at: string
          workflow_type: string
        }
        Insert: {
          acknowledged_at?: string | null
          assigned_doctor_id?: string | null
          case_id: string
          case_intent?: string
          clinical_vertical?: string
          completed_segments?: string[]
          conflicted_field_count?: number
          created_at?: string
          current_segment?: string
          id?: string
          integrity_score?: number
          integrity_status?: string
          locked_field_count?: number
          medication_snapshot_days_remaining?: number | null
          medication_snapshot_dose?: string | null
          medication_snapshot_name?: string | null
          missing_field_count?: number
          patient_id: string
          requires_same_day_action?: boolean | null
          resolution_deadline_at?: string | null
          resolved_at?: string | null
          risk_of_interruption?: string | null
          state?: Json
          symptoms_snapshot_insomnia_impact?: string | null
          symptoms_snapshot_insomnia_severity?: number | null
          triage_mandate?: string | null
          triage_priority?: string
          triage_priority_rank?: number
          triage_status?: string
          updated_at?: string
          workflow_type?: string
        }
        Update: {
          acknowledged_at?: string | null
          assigned_doctor_id?: string | null
          case_id?: string
          case_intent?: string
          clinical_vertical?: string
          completed_segments?: string[]
          conflicted_field_count?: number
          created_at?: string
          current_segment?: string
          id?: string
          integrity_score?: number
          integrity_status?: string
          locked_field_count?: number
          medication_snapshot_days_remaining?: number | null
          medication_snapshot_dose?: string | null
          medication_snapshot_name?: string | null
          missing_field_count?: number
          patient_id?: string
          requires_same_day_action?: boolean | null
          resolution_deadline_at?: string | null
          resolved_at?: string | null
          risk_of_interruption?: string | null
          state?: Json
          symptoms_snapshot_insomnia_impact?: string | null
          symptoms_snapshot_insomnia_severity?: number | null
          triage_mandate?: string | null
          triage_priority?: string
          triage_priority_rank?: number
          triage_status?: string
          updated_at?: string
          workflow_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "clinical_case_states_assigned_doctor_id_fkey"
            columns: ["assigned_doctor_id"]
            isOneToOne: false
            referencedRelation: "doctors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clinical_case_states_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      clinical_concept_maps: {
        Row: {
          concept_type: string
          created_at: string
          display_name_es: string
          icd11_code: string | null
          icd11_display: string | null
          id: string
          local_code: string
          loinc_code: string | null
          snomed_code: string | null
          snomed_display: string | null
        }
        Insert: {
          concept_type: string
          created_at?: string
          display_name_es: string
          icd11_code?: string | null
          icd11_display?: string | null
          id?: string
          local_code: string
          loinc_code?: string | null
          snomed_code?: string | null
          snomed_display?: string | null
        }
        Update: {
          concept_type?: string
          created_at?: string
          display_name_es?: string
          icd11_code?: string | null
          icd11_display?: string | null
          id?: string
          local_code?: string
          loinc_code?: string | null
          snomed_code?: string | null
          snomed_display?: string | null
        }
        Relationships: []
      }
      clinical_incident_events: {
        Row: {
          actor_id: string
          clinical_evidence: Json
          event_description: string
          from_status: string
          id: string
          incident_id: string
          timestamp: string
          to_status: string
        }
        Insert: {
          actor_id: string
          clinical_evidence: Json
          event_description: string
          from_status: string
          id?: string
          incident_id: string
          timestamp?: string
          to_status: string
        }
        Update: {
          actor_id?: string
          clinical_evidence?: Json
          event_description?: string
          from_status?: string
          id?: string
          incident_id?: string
          timestamp?: string
          to_status?: string
        }
        Relationships: [
          {
            foreignKeyName: "clinical_incident_events_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "clinical_incident_events_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "user_identifiers"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "clinical_incident_events_incident_id_fkey"
            columns: ["incident_id"]
            isOneToOne: false
            referencedRelation: "clinical_incidents"
            referencedColumns: ["id"]
          },
        ]
      }
      clinical_incidents: {
        Row: {
          closed_by: string | null
          condition_code: string
          condition_display: string
          created_at: string
          diagnosed_at: string
          doctor_id: string
          id: string
          patient_id: string
          resolution_notes: string | null
          resolved_at: string | null
          setting: Database["public"]["Enums"]["clinical_setting"]
          severity: Database["public"]["Enums"]["incident_severity"]
          sla_deadline: string
          snomed_concept_id: string
          status: string
          updated_at: string
        }
        Insert: {
          closed_by?: string | null
          condition_code: string
          condition_display: string
          created_at?: string
          diagnosed_at: string
          doctor_id: string
          id?: string
          patient_id: string
          resolution_notes?: string | null
          resolved_at?: string | null
          setting?: Database["public"]["Enums"]["clinical_setting"]
          severity?: Database["public"]["Enums"]["incident_severity"]
          sla_deadline: string
          snomed_concept_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          closed_by?: string | null
          condition_code?: string
          condition_display?: string
          created_at?: string
          diagnosed_at?: string
          doctor_id?: string
          id?: string
          patient_id?: string
          resolution_notes?: string | null
          resolved_at?: string | null
          setting?: Database["public"]["Enums"]["clinical_setting"]
          severity?: Database["public"]["Enums"]["incident_severity"]
          sla_deadline?: string
          snomed_concept_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "clinical_incidents_closed_by_fkey"
            columns: ["closed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "clinical_incidents_closed_by_fkey"
            columns: ["closed_by"]
            isOneToOne: false
            referencedRelation: "user_identifiers"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "clinical_incidents_doctor_id_fkey"
            columns: ["doctor_id"]
            isOneToOne: false
            referencedRelation: "doctors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clinical_incidents_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      clinical_patient_conditions: {
        Row: {
          anamnesis_extraction_id: string
          category: string
          condition_name: string
          created_at: string
          icd11_code: string | null
          id: string
          patient_id: string
          snomed_code: string | null
        }
        Insert: {
          anamnesis_extraction_id: string
          category: string
          condition_name: string
          created_at?: string
          icd11_code?: string | null
          id?: string
          patient_id: string
          snomed_code?: string | null
        }
        Update: {
          anamnesis_extraction_id?: string
          category?: string
          condition_name?: string
          created_at?: string
          icd11_code?: string | null
          id?: string
          patient_id?: string
          snomed_code?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "clinical_patient_conditions_anamnesis_extraction_id_fkey"
            columns: ["anamnesis_extraction_id"]
            isOneToOne: false
            referencedRelation: "anamnesis_extractions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clinical_patient_conditions_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      clinical_red_flags: {
        Row: {
          created_at: string | null
          flag_display: string
          flag_key: string
          id: string
          rule_version_id: string
        }
        Insert: {
          created_at?: string | null
          flag_display: string
          flag_key: string
          id?: string
          rule_version_id: string
        }
        Update: {
          created_at?: string | null
          flag_display?: string
          flag_key?: string
          id?: string
          rule_version_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "clinical_red_flags_rule_version_id_fkey"
            columns: ["rule_version_id"]
            isOneToOne: false
            referencedRelation: "clinical_rule_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      clinical_required_observations: {
        Row: {
          created_at: string | null
          id: string
          is_required: boolean
          loinc_code: string | null
          parameter_name: string
          rule_version_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          is_required?: boolean
          loinc_code?: string | null
          parameter_name: string
          rule_version_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          is_required?: boolean
          loinc_code?: string | null
          parameter_name?: string
          rule_version_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "clinical_required_observations_rule_version_id_fkey"
            columns: ["rule_version_id"]
            isOneToOne: false
            referencedRelation: "clinical_rule_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      clinical_resolution_criteria: {
        Row: {
          created_at: string | null
          id: string
          operator: string
          relative_target_pct: number | null
          required_observation_id: string
          rule_version_id: string
          threshold_value: number | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          operator: string
          relative_target_pct?: number | null
          required_observation_id: string
          rule_version_id: string
          threshold_value?: number | null
        }
        Update: {
          created_at?: string | null
          id?: string
          operator?: string
          relative_target_pct?: number | null
          required_observation_id?: string
          rule_version_id?: string
          threshold_value?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "clinical_resolution_criteria_required_observation_id_fkey"
            columns: ["required_observation_id"]
            isOneToOne: false
            referencedRelation: "clinical_required_observations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clinical_resolution_criteria_rule_version_id_fkey"
            columns: ["rule_version_id"]
            isOneToOne: false
            referencedRelation: "clinical_rule_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      clinical_rule_audit_events: {
        Row: {
          action_type: string
          actor_id: string
          entity_affected: string
          event_data: Json
          id: string
          timestamp: string
        }
        Insert: {
          action_type: string
          actor_id: string
          entity_affected: string
          event_data: Json
          id?: string
          timestamp?: string
        }
        Update: {
          action_type?: string
          actor_id?: string
          entity_affected?: string
          event_data?: Json
          id?: string
          timestamp?: string
        }
        Relationships: [
          {
            foreignKeyName: "clinical_rule_audit_events_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "clinical_rule_audit_events_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "user_identifiers"
            referencedColumns: ["user_id"]
          },
        ]
      }
      clinical_rule_conditions: {
        Row: {
          blocks_closure: boolean
          escalation_action: string
          id: string
          requires_override: boolean
          rule_version_id: string
          setting: Database["public"]["Enums"]["clinical_setting"]
          sla_duration: string
          verification_frequency: string
        }
        Insert: {
          blocks_closure?: boolean
          escalation_action: string
          id?: string
          requires_override?: boolean
          rule_version_id: string
          setting: Database["public"]["Enums"]["clinical_setting"]
          sla_duration: string
          verification_frequency: string
        }
        Update: {
          blocks_closure?: boolean
          escalation_action?: string
          id?: string
          requires_override?: boolean
          rule_version_id?: string
          setting?: Database["public"]["Enums"]["clinical_setting"]
          sla_duration?: string
          verification_frequency?: string
        }
        Relationships: [
          {
            foreignKeyName: "clinical_rule_conditions_rule_version_id_fkey"
            columns: ["rule_version_id"]
            isOneToOne: false
            referencedRelation: "clinical_rule_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      clinical_rule_executions: {
        Row: {
          doctor_id: string
          evidence_used: Json
          executed_at: string
          id: string
          incident_id: string
          patient_id: string
          reason: string | null
          recommendation: string
          rule_version_id: string
        }
        Insert: {
          doctor_id: string
          evidence_used: Json
          executed_at?: string
          id?: string
          incident_id: string
          patient_id: string
          reason?: string | null
          recommendation: string
          rule_version_id: string
        }
        Update: {
          doctor_id?: string
          evidence_used?: Json
          executed_at?: string
          id?: string
          incident_id?: string
          patient_id?: string
          reason?: string | null
          recommendation?: string
          rule_version_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "clinical_rule_executions_doctor_id_fkey"
            columns: ["doctor_id"]
            isOneToOne: false
            referencedRelation: "doctors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clinical_rule_executions_incident_id_fkey"
            columns: ["incident_id"]
            isOneToOne: false
            referencedRelation: "clinical_incidents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clinical_rule_executions_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clinical_rule_executions_rule_version_id_fkey"
            columns: ["rule_version_id"]
            isOneToOne: false
            referencedRelation: "clinical_rule_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      clinical_rule_overrides: {
        Row: {
          authorized_by: string | null
          doctor_id: string
          execution_id: string
          id: string
          overridden_at: string
          reason: string
        }
        Insert: {
          authorized_by?: string | null
          doctor_id: string
          execution_id: string
          id?: string
          overridden_at?: string
          reason: string
        }
        Update: {
          authorized_by?: string | null
          doctor_id?: string
          execution_id?: string
          id?: string
          overridden_at?: string
          reason?: string
        }
        Relationships: [
          {
            foreignKeyName: "clinical_rule_overrides_authorized_by_fkey"
            columns: ["authorized_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "clinical_rule_overrides_authorized_by_fkey"
            columns: ["authorized_by"]
            isOneToOne: false
            referencedRelation: "user_identifiers"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "clinical_rule_overrides_doctor_id_fkey"
            columns: ["doctor_id"]
            isOneToOne: false
            referencedRelation: "doctors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clinical_rule_overrides_execution_id_fkey"
            columns: ["execution_id"]
            isOneToOne: false
            referencedRelation: "clinical_rule_executions"
            referencedColumns: ["id"]
          },
        ]
      }
      clinical_rule_versions: {
        Row: {
          created_at: string | null
          created_by: string | null
          id: string
          rule_id: string
          status: string
          version_number: number
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          id?: string
          rule_id: string
          status?: string
          version_number: number
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          id?: string
          rule_id?: string
          status?: string
          version_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "clinical_rule_versions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "clinical_rule_versions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_identifiers"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "clinical_rule_versions_rule_id_fkey"
            columns: ["rule_id"]
            isOneToOne: false
            referencedRelation: "clinical_rules"
            referencedColumns: ["id"]
          },
        ]
      }
      clinical_rules: {
        Row: {
          cie10_code: string | null
          clinical_source: string | null
          condition_display: string
          created_at: string | null
          effective_from: string | null
          id: string
          name: string
          responsible_doctor_id: string | null
          risk_level: string
          snomed_concept_id: string | null
          status: string
          updated_at: string | null
        }
        Insert: {
          cie10_code?: string | null
          clinical_source?: string | null
          condition_display: string
          created_at?: string | null
          effective_from?: string | null
          id?: string
          name: string
          responsible_doctor_id?: string | null
          risk_level: string
          snomed_concept_id?: string | null
          status?: string
          updated_at?: string | null
        }
        Update: {
          cie10_code?: string | null
          clinical_source?: string | null
          condition_display?: string
          created_at?: string | null
          effective_from?: string | null
          id?: string
          name?: string
          responsible_doctor_id?: string | null
          risk_level?: string
          snomed_concept_id?: string | null
          status?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "clinical_rules_responsible_doctor_id_fkey"
            columns: ["responsible_doctor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "clinical_rules_responsible_doctor_id_fkey"
            columns: ["responsible_doctor_id"]
            isOneToOne: false
            referencedRelation: "user_identifiers"
            referencedColumns: ["user_id"]
          },
        ]
      }
      clinical_symptom_observations: {
        Row: {
          anamnesis_extraction_id: string
          created_at: string
          icd11_code: string | null
          id: string
          is_primary: boolean
          is_red_flag: boolean
          patient_id: string
          snomed_code: string | null
          symptom_name: string
        }
        Insert: {
          anamnesis_extraction_id: string
          created_at?: string
          icd11_code?: string | null
          id?: string
          is_primary?: boolean
          is_red_flag?: boolean
          patient_id: string
          snomed_code?: string | null
          symptom_name: string
        }
        Update: {
          anamnesis_extraction_id?: string
          created_at?: string
          icd11_code?: string | null
          id?: string
          is_primary?: boolean
          is_red_flag?: boolean
          patient_id?: string
          snomed_code?: string | null
          symptom_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "clinical_symptom_observations_anamnesis_extraction_id_fkey"
            columns: ["anamnesis_extraction_id"]
            isOneToOne: false
            referencedRelation: "anamnesis_extractions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clinical_symptom_observations_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      community_comment_reactions: {
        Row: {
          comment_id: string
          created_at: string
          id: string
          patient_id: string
          reaction_type: string
          updated_at: string
        }
        Insert: {
          comment_id: string
          created_at?: string
          id?: string
          patient_id: string
          reaction_type?: string
          updated_at?: string
        }
        Update: {
          comment_id?: string
          created_at?: string
          id?: string
          patient_id?: string
          reaction_type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "community_comment_reactions_comment_id_fkey"
            columns: ["comment_id"]
            isOneToOne: false
            referencedRelation: "community_post_comments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "community_comment_reactions_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      community_groups: {
        Row: {
          category: string | null
          created_at: string
          deleted_at: string | null
          description: string | null
          icon: string | null
          id: string
          member_count: number
          name: string
          post_count: number
          required_gender: string | null
          slug: string
          tags: string[]
          updated_at: string
        }
        Insert: {
          category?: string | null
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          icon?: string | null
          id?: string
          member_count?: number
          name: string
          post_count?: number
          required_gender?: string | null
          slug: string
          tags?: string[]
          updated_at?: string
        }
        Update: {
          category?: string | null
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          icon?: string | null
          id?: string
          member_count?: number
          name?: string
          post_count?: number
          required_gender?: string | null
          slug?: string
          tags?: string[]
          updated_at?: string
        }
        Relationships: []
      }
      community_post_comments: {
        Row: {
          author_display_name: string | null
          author_id: string | null
          author_role: string
          content: string
          created_at: string
          deleted_at: string | null
          doctor_author_id: string | null
          doctor_specialty_snapshot: string | null
          id: string
          is_anonymous: boolean
          post_id: string
          reaction_count: number
          updated_at: string
        }
        Insert: {
          author_display_name?: string | null
          author_id?: string | null
          author_role?: string
          content: string
          created_at?: string
          deleted_at?: string | null
          doctor_author_id?: string | null
          doctor_specialty_snapshot?: string | null
          id?: string
          is_anonymous?: boolean
          post_id: string
          reaction_count?: number
          updated_at?: string
        }
        Update: {
          author_display_name?: string | null
          author_id?: string | null
          author_role?: string
          content?: string
          created_at?: string
          deleted_at?: string | null
          doctor_author_id?: string | null
          doctor_specialty_snapshot?: string | null
          id?: string
          is_anonymous?: boolean
          post_id?: string
          reaction_count?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "community_post_comments_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "community_post_comments_doctor_author_id_fkey"
            columns: ["doctor_author_id"]
            isOneToOne: false
            referencedRelation: "doctors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "community_post_comments_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "community_posts"
            referencedColumns: ["id"]
          },
        ]
      }
      community_posts: {
        Row: {
          author_display_name: string | null
          author_id: string | null
          comment_count: number
          content: string
          created_at: string
          deleted_at: string | null
          group_id: string
          id: string
          is_anonymous: boolean
          moderation_status: string
          reaction_count: number
          tags: string[]
          title: string | null
          updated_at: string
          view_count: number
        }
        Insert: {
          author_display_name?: string | null
          author_id?: string | null
          comment_count?: number
          content: string
          created_at?: string
          deleted_at?: string | null
          group_id: string
          id?: string
          is_anonymous?: boolean
          moderation_status?: string
          reaction_count?: number
          tags?: string[]
          title?: string | null
          updated_at?: string
          view_count?: number
        }
        Update: {
          author_display_name?: string | null
          author_id?: string | null
          comment_count?: number
          content?: string
          created_at?: string
          deleted_at?: string | null
          group_id?: string
          id?: string
          is_anonymous?: boolean
          moderation_status?: string
          reaction_count?: number
          tags?: string[]
          title?: string | null
          updated_at?: string
          view_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "community_posts_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "community_posts_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "community_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      companies: {
        Row: {
          active: boolean | null
          address: Json | null
          created_at: string | null
          cuit: string | null
          email: string | null
          id: string
          industry: string | null
          legal_name: string | null
          name: string
          owner_profile_id: string | null
          phone: string | null
          size: string | null
          updated_at: string | null
          website: string | null
        }
        Insert: {
          active?: boolean | null
          address?: Json | null
          created_at?: string | null
          cuit?: string | null
          email?: string | null
          id?: string
          industry?: string | null
          legal_name?: string | null
          name: string
          owner_profile_id?: string | null
          phone?: string | null
          size?: string | null
          updated_at?: string | null
          website?: string | null
        }
        Update: {
          active?: boolean | null
          address?: Json | null
          created_at?: string | null
          cuit?: string | null
          email?: string | null
          id?: string
          industry?: string | null
          legal_name?: string | null
          name?: string
          owner_profile_id?: string | null
          phone?: string | null
          size?: string | null
          updated_at?: string | null
          website?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "companies_owner_profile_id_fkey"
            columns: ["owner_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "companies_owner_profile_id_fkey"
            columns: ["owner_profile_id"]
            isOneToOne: false
            referencedRelation: "user_identifiers"
            referencedColumns: ["user_id"]
          },
        ]
      }
      company_members: {
        Row: {
          active: boolean | null
          company_id: string | null
          created_at: string | null
          deleted_at: string | null
          department: string | null
          employee_id: string | null
          end_date: string | null
          id: string
          position: string | null
          profile_id: string | null
          role: string | null
          start_date: string | null
          updated_at: string | null
        }
        Insert: {
          active?: boolean | null
          company_id?: string | null
          created_at?: string | null
          deleted_at?: string | null
          department?: string | null
          employee_id?: string | null
          end_date?: string | null
          id?: string
          position?: string | null
          profile_id?: string | null
          role?: string | null
          start_date?: string | null
          updated_at?: string | null
        }
        Update: {
          active?: boolean | null
          company_id?: string | null
          created_at?: string | null
          deleted_at?: string | null
          department?: string | null
          employee_id?: string | null
          end_date?: string | null
          id?: string
          position?: string | null
          profile_id?: string | null
          role?: string | null
          start_date?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "company_members_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_members_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "company_members_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "user_identifiers"
            referencedColumns: ["user_id"]
          },
        ]
      }
      conversation_events: {
        Row: {
          case_id: string
          channel: string
          created_at: string
          error_code: string | null
          error_message: string | null
          event_type: string
          extracted_fields: Json | null
          extraction_confidence: string | null
          id: string
          latency_ms: number | null
          metadata: Json | null
          model_name: string | null
          model_version: string | null
          normalized_text: string | null
          patient_id: string
          planner_output: Json | null
          prompt_snapshot_text: string | null
          raw_text: string
          role: string
          segment: string | null
          sequence_number: number
          session_id: string
        }
        Insert: {
          case_id: string
          channel: string
          created_at?: string
          error_code?: string | null
          error_message?: string | null
          event_type: string
          extracted_fields?: Json | null
          extraction_confidence?: string | null
          id?: string
          latency_ms?: number | null
          metadata?: Json | null
          model_name?: string | null
          model_version?: string | null
          normalized_text?: string | null
          patient_id: string
          planner_output?: Json | null
          prompt_snapshot_text?: string | null
          raw_text: string
          role: string
          segment?: string | null
          sequence_number?: number
          session_id: string
        }
        Update: {
          case_id?: string
          channel?: string
          created_at?: string
          error_code?: string | null
          error_message?: string | null
          event_type?: string
          extracted_fields?: Json | null
          extraction_confidence?: string | null
          id?: string
          latency_ms?: number | null
          metadata?: Json | null
          model_name?: string | null
          model_version?: string | null
          normalized_text?: string | null
          patient_id?: string
          planner_output?: Json | null
          prompt_snapshot_text?: string | null
          raw_text?: string
          role?: string
          segment?: string | null
          sequence_number?: number
          session_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversation_events_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversation_events_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "conversation_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      conversation_sessions: {
        Row: {
          case_id: string
          channel: string
          doctor_id: string | null
          ended_at: string | null
          id: string
          patient_id: string
          started_at: string
          status: string
          workflow_type: string
        }
        Insert: {
          case_id: string
          channel: string
          doctor_id?: string | null
          ended_at?: string | null
          id?: string
          patient_id: string
          started_at?: string
          status?: string
          workflow_type: string
        }
        Update: {
          case_id?: string
          channel?: string
          doctor_id?: string | null
          ended_at?: string | null
          id?: string
          patient_id?: string
          started_at?: string
          status?: string
          workflow_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversation_sessions_doctor_id_fkey"
            columns: ["doctor_id"]
            isOneToOne: false
            referencedRelation: "doctors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversation_sessions_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      dispensation_clarifications: {
        Row: {
          expires_at: string
          id: string
          modified_fields: Json | null
          order_id: string
          question: string
          question_category: string
          requested_at: string
          requested_by: string
          responded_at: string | null
          responded_by: string | null
          response: string | null
          response_decision: string | null
          status: string
        }
        Insert: {
          expires_at?: string
          id?: string
          modified_fields?: Json | null
          order_id: string
          question: string
          question_category: string
          requested_at?: string
          requested_by: string
          responded_at?: string | null
          responded_by?: string | null
          response?: string | null
          response_decision?: string | null
          status?: string
        }
        Update: {
          expires_at?: string
          id?: string
          modified_fields?: Json | null
          order_id?: string
          question?: string
          question_category?: string
          requested_at?: string
          requested_by?: string
          responded_at?: string | null
          responded_by?: string | null
          response?: string | null
          response_decision?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "dispensation_clarifications_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "dispensation_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      dispensation_events: {
        Row: {
          created_at: string
          dispense_status: string
          dispensed_at: string
          dispensed_batch_number: string | null
          dispensed_expiry_date: string | null
          dispensed_formulation: string
          dispensed_medication: string
          dispensed_quantity: number
          id: string
          order_id: string
          pharmacist_id: string
          pharmacist_signature_hash: string | null
          pharmacy_id: string
          pharmacy_notes: string | null
          substitution_approved_by_prescriber: boolean
          substitution_reason: string | null
          substitution_type: string
        }
        Insert: {
          created_at?: string
          dispense_status: string
          dispensed_at?: string
          dispensed_batch_number?: string | null
          dispensed_expiry_date?: string | null
          dispensed_formulation: string
          dispensed_medication: string
          dispensed_quantity: number
          id?: string
          order_id: string
          pharmacist_id: string
          pharmacist_signature_hash?: string | null
          pharmacy_id: string
          pharmacy_notes?: string | null
          substitution_approved_by_prescriber?: boolean
          substitution_reason?: string | null
          substitution_type?: string
        }
        Update: {
          created_at?: string
          dispense_status?: string
          dispensed_at?: string
          dispensed_batch_number?: string | null
          dispensed_expiry_date?: string | null
          dispensed_formulation?: string
          dispensed_medication?: string
          dispensed_quantity?: number
          id?: string
          order_id?: string
          pharmacist_id?: string
          pharmacist_signature_hash?: string | null
          pharmacy_id?: string
          pharmacy_notes?: string | null
          substitution_approved_by_prescriber?: boolean
          substitution_reason?: string | null
          substitution_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "dispensation_events_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "dispensation_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dispensation_events_pharmacist_id_fkey"
            columns: ["pharmacist_id"]
            isOneToOne: false
            referencedRelation: "pharmacists"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dispensation_events_pharmacy_id_fkey"
            columns: ["pharmacy_id"]
            isOneToOne: false
            referencedRelation: "pharmacies"
            referencedColumns: ["id"]
          },
        ]
      }
      dispensation_orders: {
        Row: {
          clinical_semaphore: string | null
          clinician_decision: string
          created_at: string
          deleted_at: string | null
          dispense_mode: string | null
          dispense_window_end: string
          dispense_window_start: string
          doctor_id: string
          dose_mg_per_day: number | null
          duration_days: number
          extraordinary_dose_flag: boolean
          formulation: string
          id: string
          internal_notes: string | null
          medication: string
          patient_id: string
          pharmacy_id: string | null
          prescriber_notes: string | null
          prescriber_verified: boolean
          prescription_id: string
          prescription_type: string
          quantity_units: number
          reconciliation_status: string | null
          requires_clarification: boolean
          semaphore_reasons: Json | null
          status: string
          updated_at: string
        }
        Insert: {
          clinical_semaphore?: string | null
          clinician_decision?: string
          created_at?: string
          deleted_at?: string | null
          dispense_mode?: string | null
          dispense_window_end: string
          dispense_window_start: string
          doctor_id: string
          dose_mg_per_day?: number | null
          duration_days: number
          extraordinary_dose_flag?: boolean
          formulation: string
          id?: string
          internal_notes?: string | null
          medication: string
          patient_id: string
          pharmacy_id?: string | null
          prescriber_notes?: string | null
          prescriber_verified?: boolean
          prescription_id: string
          prescription_type?: string
          quantity_units: number
          reconciliation_status?: string | null
          requires_clarification?: boolean
          semaphore_reasons?: Json | null
          status?: string
          updated_at?: string
        }
        Update: {
          clinical_semaphore?: string | null
          clinician_decision?: string
          created_at?: string
          deleted_at?: string | null
          dispense_mode?: string | null
          dispense_window_end?: string
          dispense_window_start?: string
          doctor_id?: string
          dose_mg_per_day?: number | null
          duration_days?: number
          extraordinary_dose_flag?: boolean
          formulation?: string
          id?: string
          internal_notes?: string | null
          medication?: string
          patient_id?: string
          pharmacy_id?: string | null
          prescriber_notes?: string | null
          prescriber_verified?: boolean
          prescription_id?: string
          prescription_type?: string
          quantity_units?: number
          reconciliation_status?: string | null
          requires_clarification?: boolean
          semaphore_reasons?: Json | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "dispensation_orders_doctor_id_fkey"
            columns: ["doctor_id"]
            isOneToOne: false
            referencedRelation: "doctors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dispensation_orders_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dispensation_orders_pharmacy_id_fkey"
            columns: ["pharmacy_id"]
            isOneToOne: false
            referencedRelation: "pharmacies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dispensation_orders_prescription_id_fkey"
            columns: ["prescription_id"]
            isOneToOne: false
            referencedRelation: "prescriptions"
            referencedColumns: ["id"]
          },
        ]
      }
      dispensation_validations: {
        Row: {
          created_at: string
          details: string | null
          id: string
          order_id: string
          override_authorized_by: string | null
          override_reason: string | null
          pharmacist_id: string
          result: string
          validation_type: string
        }
        Insert: {
          created_at?: string
          details?: string | null
          id?: string
          order_id: string
          override_authorized_by?: string | null
          override_reason?: string | null
          pharmacist_id: string
          result: string
          validation_type: string
        }
        Update: {
          created_at?: string
          details?: string | null
          id?: string
          order_id?: string
          override_authorized_by?: string | null
          override_reason?: string | null
          pharmacist_id?: string
          result?: string
          validation_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "dispensation_validations_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "dispensation_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dispensation_validations_override_authorized_by_fkey"
            columns: ["override_authorized_by"]
            isOneToOne: false
            referencedRelation: "pharmacists"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dispensation_validations_pharmacist_id_fkey"
            columns: ["pharmacist_id"]
            isOneToOne: false
            referencedRelation: "pharmacists"
            referencedColumns: ["id"]
          },
        ]
      }
      doctor_availability: {
        Row: {
          created_at: string
          day_of_week: number
          doctor_id: string
          end_time: string
          id: string
          is_active: boolean
          location: string | null
          slot_duration: number
          start_time: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          day_of_week: number
          doctor_id: string
          end_time: string
          id?: string
          is_active?: boolean
          location?: string | null
          slot_duration?: number
          start_time: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          day_of_week?: number
          doctor_id?: string
          end_time?: string
          id?: string
          is_active?: boolean
          location?: string | null
          slot_duration?: number
          start_time?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "doctor_availability_doctor_id_fkey"
            columns: ["doctor_id"]
            isOneToOne: false
            referencedRelation: "doctors"
            referencedColumns: ["id"]
          },
        ]
      }
      doctor_availability_overrides: {
        Row: {
          created_at: string
          doctor_id: string
          end_time: string | null
          id: string
          is_available: boolean
          override_date: string
          reason: string | null
          start_time: string | null
        }
        Insert: {
          created_at?: string
          doctor_id: string
          end_time?: string | null
          id?: string
          is_available?: boolean
          override_date: string
          reason?: string | null
          start_time?: string | null
        }
        Update: {
          created_at?: string
          doctor_id?: string
          end_time?: string | null
          id?: string
          is_available?: boolean
          override_date?: string
          reason?: string | null
          start_time?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "doctor_availability_overrides_doctor_id_fkey"
            columns: ["doctor_id"]
            isOneToOne: false
            referencedRelation: "doctors"
            referencedColumns: ["id"]
          },
        ]
      }
      doctor_badges: {
        Row: {
          badge: Database["public"]["Enums"]["badge_type"]
          description: string
          doctor_id: string
          earned_at: string
          id: string
          level: Database["public"]["Enums"]["badge_level"]
        }
        Insert: {
          badge: Database["public"]["Enums"]["badge_type"]
          description: string
          doctor_id: string
          earned_at?: string
          id?: string
          level?: Database["public"]["Enums"]["badge_level"]
        }
        Update: {
          badge?: Database["public"]["Enums"]["badge_type"]
          description?: string
          doctor_id?: string
          earned_at?: string
          id?: string
          level?: Database["public"]["Enums"]["badge_level"]
        }
        Relationships: [
          {
            foreignKeyName: "doctor_badges_doctor_id_fkey"
            columns: ["doctor_id"]
            isOneToOne: false
            referencedRelation: "doctors"
            referencedColumns: ["id"]
          },
        ]
      }
      doctor_earnings: {
        Row: {
          appointment_id: string
          appointment_payment_id: string
          created_at: string
          currency: string
          doctor_id: string
          gross_amount: number
          id: string
          metadata: Json
          net_amount: number
          paid_at: string | null
          payout_alias_snapshot: string | null
          payout_cbu_snapshot: string | null
          platform_fee_amount: number
          processor_fee_amount: number
          status: string
          updated_at: string
        }
        Insert: {
          appointment_id: string
          appointment_payment_id: string
          created_at?: string
          currency?: string
          doctor_id: string
          gross_amount: number
          id?: string
          metadata?: Json
          net_amount: number
          paid_at?: string | null
          payout_alias_snapshot?: string | null
          payout_cbu_snapshot?: string | null
          platform_fee_amount?: number
          processor_fee_amount?: number
          status?: string
          updated_at?: string
        }
        Update: {
          appointment_id?: string
          appointment_payment_id?: string
          created_at?: string
          currency?: string
          doctor_id?: string
          gross_amount?: number
          id?: string
          metadata?: Json
          net_amount?: number
          paid_at?: string | null
          payout_alias_snapshot?: string | null
          payout_cbu_snapshot?: string | null
          platform_fee_amount?: number
          processor_fee_amount?: number
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "doctor_earnings_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: true
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "doctor_earnings_appointment_payment_id_fkey"
            columns: ["appointment_payment_id"]
            isOneToOne: true
            referencedRelation: "appointment_payments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "doctor_earnings_doctor_id_fkey"
            columns: ["doctor_id"]
            isOneToOne: false
            referencedRelation: "doctors"
            referencedColumns: ["id"]
          },
        ]
      }
      doctor_expense_records: {
        Row: {
          amount: number
          category: string
          created_at: string
          deductible: boolean
          description: string
          doctor_id: string
          fiscal_profile_id: string
          id: string
          iva_amount: number
          period_month: number
          period_year: number
          receipt_url: string | null
          supplier_cuit: string | null
          supplier_name: string | null
          updated_at: string
        }
        Insert: {
          amount: number
          category: string
          created_at?: string
          deductible?: boolean
          description: string
          doctor_id: string
          fiscal_profile_id: string
          id?: string
          iva_amount?: number
          period_month: number
          period_year: number
          receipt_url?: string | null
          supplier_cuit?: string | null
          supplier_name?: string | null
          updated_at?: string
        }
        Update: {
          amount?: number
          category?: string
          created_at?: string
          deductible?: boolean
          description?: string
          doctor_id?: string
          fiscal_profile_id?: string
          id?: string
          iva_amount?: number
          period_month?: number
          period_year?: number
          receipt_url?: string | null
          supplier_cuit?: string | null
          supplier_name?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "doctor_expense_records_doctor_id_fkey"
            columns: ["doctor_id"]
            isOneToOne: false
            referencedRelation: "doctors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "doctor_expense_records_fiscal_profile_id_fkey"
            columns: ["fiscal_profile_id"]
            isOneToOne: false
            referencedRelation: "doctor_fiscal_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      doctor_fiscal_profiles: {
        Row: {
          active: boolean
          created_at: string
          cuit: string
          doctor_id: string
          fiscal_start_date: string | null
          id: string
          iibb_convenio_multilateral: boolean
          iibb_jurisdiction: string | null
          iibb_number: string | null
          invoice_type: Database["public"]["Enums"]["invoice_type"]
          monotributo_category:
            | Database["public"]["Enums"]["monotributo_category"]
            | null
          notes: string | null
          tax_regime: Database["public"]["Enums"]["tax_regime"]
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          cuit: string
          doctor_id: string
          fiscal_start_date?: string | null
          id?: string
          iibb_convenio_multilateral?: boolean
          iibb_jurisdiction?: string | null
          iibb_number?: string | null
          invoice_type?: Database["public"]["Enums"]["invoice_type"]
          monotributo_category?:
            | Database["public"]["Enums"]["monotributo_category"]
            | null
          notes?: string | null
          tax_regime?: Database["public"]["Enums"]["tax_regime"]
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          cuit?: string
          doctor_id?: string
          fiscal_start_date?: string | null
          id?: string
          iibb_convenio_multilateral?: boolean
          iibb_jurisdiction?: string | null
          iibb_number?: string | null
          invoice_type?: Database["public"]["Enums"]["invoice_type"]
          monotributo_category?:
            | Database["public"]["Enums"]["monotributo_category"]
            | null
          notes?: string | null
          tax_regime?: Database["public"]["Enums"]["tax_regime"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "doctor_fiscal_profiles_doctor_id_fkey"
            columns: ["doctor_id"]
            isOneToOne: true
            referencedRelation: "doctors"
            referencedColumns: ["id"]
          },
        ]
      }
      doctor_fiscal_summaries: {
        Row: {
          accumulated_annual_income: number
          created_at: string
          doctor_id: string
          fiscal_profile_id: string
          id: string
          iva_balance: number
          monotributo_category_suggested:
            | Database["public"]["Enums"]["monotributo_category"]
            | null
          net_result: number
          period_month: number
          period_year: number
          recategorization_needed: boolean
          total_expenses: number
          total_income: number
          total_iva_credito: number
          total_iva_debito: number
          total_retenciones: number
          updated_at: string
        }
        Insert: {
          accumulated_annual_income?: number
          created_at?: string
          doctor_id: string
          fiscal_profile_id: string
          id?: string
          iva_balance?: number
          monotributo_category_suggested?:
            | Database["public"]["Enums"]["monotributo_category"]
            | null
          net_result?: number
          period_month: number
          period_year: number
          recategorization_needed?: boolean
          total_expenses?: number
          total_income?: number
          total_iva_credito?: number
          total_iva_debito?: number
          total_retenciones?: number
          updated_at?: string
        }
        Update: {
          accumulated_annual_income?: number
          created_at?: string
          doctor_id?: string
          fiscal_profile_id?: string
          id?: string
          iva_balance?: number
          monotributo_category_suggested?:
            | Database["public"]["Enums"]["monotributo_category"]
            | null
          net_result?: number
          period_month?: number
          period_year?: number
          recategorization_needed?: boolean
          total_expenses?: number
          total_income?: number
          total_iva_credito?: number
          total_iva_debito?: number
          total_retenciones?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "doctor_fiscal_summaries_doctor_id_fkey"
            columns: ["doctor_id"]
            isOneToOne: false
            referencedRelation: "doctors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "doctor_fiscal_summaries_fiscal_profile_id_fkey"
            columns: ["fiscal_profile_id"]
            isOneToOne: false
            referencedRelation: "doctor_fiscal_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      doctor_heartbeats: {
        Row: {
          created_at: string
          doctor_id: string
          id: string
          metadata: Json | null
        }
        Insert: {
          created_at?: string
          doctor_id: string
          id?: string
          metadata?: Json | null
        }
        Update: {
          created_at?: string
          doctor_id?: string
          id?: string
          metadata?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "doctor_heartbeats_doctor_id_fkey"
            columns: ["doctor_id"]
            isOneToOne: false
            referencedRelation: "doctors"
            referencedColumns: ["id"]
          },
        ]
      }
      doctor_income_records: {
        Row: {
          appointment_id: string | null
          created_at: string
          description: string | null
          doctor_id: string
          fiscal_profile_id: string
          gross_amount: number
          id: string
          invoice_date: string | null
          invoice_number: string | null
          invoice_type: Database["public"]["Enums"]["invoice_type"] | null
          net_amount: number
          period_month: number
          period_year: number
          prescription_id: string | null
          source: string
          source_name: string | null
          tax_withheld: number
          updated_at: string
        }
        Insert: {
          appointment_id?: string | null
          created_at?: string
          description?: string | null
          doctor_id: string
          fiscal_profile_id: string
          gross_amount: number
          id?: string
          invoice_date?: string | null
          invoice_number?: string | null
          invoice_type?: Database["public"]["Enums"]["invoice_type"] | null
          net_amount: number
          period_month: number
          period_year: number
          prescription_id?: string | null
          source: string
          source_name?: string | null
          tax_withheld?: number
          updated_at?: string
        }
        Update: {
          appointment_id?: string | null
          created_at?: string
          description?: string | null
          doctor_id?: string
          fiscal_profile_id?: string
          gross_amount?: number
          id?: string
          invoice_date?: string | null
          invoice_number?: string | null
          invoice_type?: Database["public"]["Enums"]["invoice_type"] | null
          net_amount?: number
          period_month?: number
          period_year?: number
          prescription_id?: string | null
          source?: string
          source_name?: string | null
          tax_withheld?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "doctor_income_records_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "doctor_income_records_doctor_id_fkey"
            columns: ["doctor_id"]
            isOneToOne: false
            referencedRelation: "doctors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "doctor_income_records_fiscal_profile_id_fkey"
            columns: ["fiscal_profile_id"]
            isOneToOne: false
            referencedRelation: "doctor_fiscal_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "doctor_income_records_prescription_id_fkey"
            columns: ["prescription_id"]
            isOneToOne: false
            referencedRelation: "prescriptions"
            referencedColumns: ["id"]
          },
        ]
      }
      doctor_patient: {
        Row: {
          assigned_at: string | null
          doctor_id: string
          patient_id: string
        }
        Insert: {
          assigned_at?: string | null
          doctor_id: string
          patient_id: string
        }
        Update: {
          assigned_at?: string | null
          doctor_id?: string
          patient_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "doctor_patient_doctor_id_fkey"
            columns: ["doctor_id"]
            isOneToOne: false
            referencedRelation: "doctors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "doctor_patient_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      doctor_prescription_templates: {
        Row: {
          care_guide_forgotten: string | null
          care_guide_lifestyle: string | null
          care_guide_tips: string | null
          care_guide_warnings: string | null
          created_at: string
          diagnosis: string | null
          doctor_id: string
          dosage: string | null
          duration: string | null
          frequency: string | null
          id: string
          instructions: string | null
          medication_name: string
          name: string
          notes: string | null
          side_effects_warning: string | null
          updated_at: string
        }
        Insert: {
          care_guide_forgotten?: string | null
          care_guide_lifestyle?: string | null
          care_guide_tips?: string | null
          care_guide_warnings?: string | null
          created_at?: string
          diagnosis?: string | null
          doctor_id: string
          dosage?: string | null
          duration?: string | null
          frequency?: string | null
          id?: string
          instructions?: string | null
          medication_name: string
          name: string
          notes?: string | null
          side_effects_warning?: string | null
          updated_at?: string
        }
        Update: {
          care_guide_forgotten?: string | null
          care_guide_lifestyle?: string | null
          care_guide_tips?: string | null
          care_guide_warnings?: string | null
          created_at?: string
          diagnosis?: string | null
          doctor_id?: string
          dosage?: string | null
          duration?: string | null
          frequency?: string | null
          id?: string
          instructions?: string | null
          medication_name?: string
          name?: string
          notes?: string | null
          side_effects_warning?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "doctor_prescription_templates_doctor_id_fkey"
            columns: ["doctor_id"]
            isOneToOne: false
            referencedRelation: "doctors"
            referencedColumns: ["id"]
          },
        ]
      }
      doctor_ranking_metrics: {
        Row: {
          avg_clinical_quality: number
          avg_communication: number
          avg_professionalism: number
          avg_punctuality: number
          avg_rating: number
          clinical_score: number
          community_helpful_reactions: number
          community_last_activity_at: string | null
          community_replies: number
          community_score: number
          community_threads_helped: number
          completed_consultations: number
          completion_rate: number
          doctor_id: string
          last_review_at: string | null
          overall_score: number
          rank_position: number | null
          recalculated_at: string
          total_consultations: number
          total_reviews: number
        }
        Insert: {
          avg_clinical_quality?: number
          avg_communication?: number
          avg_professionalism?: number
          avg_punctuality?: number
          avg_rating?: number
          clinical_score?: number
          community_helpful_reactions?: number
          community_last_activity_at?: string | null
          community_replies?: number
          community_score?: number
          community_threads_helped?: number
          completed_consultations?: number
          completion_rate?: number
          doctor_id: string
          last_review_at?: string | null
          overall_score?: number
          rank_position?: number | null
          recalculated_at?: string
          total_consultations?: number
          total_reviews?: number
        }
        Update: {
          avg_clinical_quality?: number
          avg_communication?: number
          avg_professionalism?: number
          avg_punctuality?: number
          avg_rating?: number
          clinical_score?: number
          community_helpful_reactions?: number
          community_last_activity_at?: string | null
          community_replies?: number
          community_score?: number
          community_threads_helped?: number
          completed_consultations?: number
          completion_rate?: number
          doctor_id?: string
          last_review_at?: string | null
          overall_score?: number
          rank_position?: number | null
          recalculated_at?: string
          total_consultations?: number
          total_reviews?: number
        }
        Relationships: [
          {
            foreignKeyName: "doctor_ranking_metrics_doctor_id_fkey"
            columns: ["doctor_id"]
            isOneToOne: true
            referencedRelation: "doctors"
            referencedColumns: ["id"]
          },
        ]
      }
      doctor_reviews: {
        Row: {
          appointment_id: string
          clinical_quality_rating: number | null
          comment: string | null
          communication_rating: number | null
          created_at: string
          doctor_id: string
          id: string
          is_anonymous: boolean
          overall_rating: number
          patient_id: string
          professionalism_rating: number | null
          punctuality_rating: number | null
          status: Database["public"]["Enums"]["review_status"]
          updated_at: string
        }
        Insert: {
          appointment_id: string
          clinical_quality_rating?: number | null
          comment?: string | null
          communication_rating?: number | null
          created_at?: string
          doctor_id: string
          id?: string
          is_anonymous?: boolean
          overall_rating: number
          patient_id: string
          professionalism_rating?: number | null
          punctuality_rating?: number | null
          status?: Database["public"]["Enums"]["review_status"]
          updated_at?: string
        }
        Update: {
          appointment_id?: string
          clinical_quality_rating?: number | null
          comment?: string | null
          communication_rating?: number | null
          created_at?: string
          doctor_id?: string
          id?: string
          is_anonymous?: boolean
          overall_rating?: number
          patient_id?: string
          professionalism_rating?: number | null
          punctuality_rating?: number | null
          status?: Database["public"]["Enums"]["review_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "doctor_reviews_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: true
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "doctor_reviews_doctor_id_fkey"
            columns: ["doctor_id"]
            isOneToOne: false
            referencedRelation: "doctors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "doctor_reviews_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      doctor_scheduling_config: {
        Row: {
          created_at: string
          doctor_id: string
          noshow_grace_minutes: number
          noshow_overbooking_threshold: number
          reminder_hours_before: number[]
          updated_at: string
          waitlist_offer_expiry_hours: number
        }
        Insert: {
          created_at?: string
          doctor_id: string
          noshow_grace_minutes?: number
          noshow_overbooking_threshold?: number
          reminder_hours_before?: number[]
          updated_at?: string
          waitlist_offer_expiry_hours?: number
        }
        Update: {
          created_at?: string
          doctor_id?: string
          noshow_grace_minutes?: number
          noshow_overbooking_threshold?: number
          reminder_hours_before?: number[]
          updated_at?: string
          waitlist_offer_expiry_hours?: number
        }
        Relationships: [
          {
            foreignKeyName: "doctor_scheduling_config_doctor_id_fkey"
            columns: ["doctor_id"]
            isOneToOne: true
            referencedRelation: "doctors"
            referencedColumns: ["id"]
          },
        ]
      }
      doctor_subscriptions: {
        Row: {
          cancelled_at: string | null
          created_at: string
          current_period_end: string | null
          current_period_start: string | null
          doctor_id: string
          id: string
          mercadopago_payer_id: string | null
          mercadopago_subscription_id: string | null
          payment_type: string
          plan_id: string
          status: Database["public"]["Enums"]["subscription_status"]
          updated_at: string
        }
        Insert: {
          cancelled_at?: string | null
          created_at?: string
          current_period_end?: string | null
          current_period_start?: string | null
          doctor_id: string
          id?: string
          mercadopago_payer_id?: string | null
          mercadopago_subscription_id?: string | null
          payment_type?: string
          plan_id: string
          status?: Database["public"]["Enums"]["subscription_status"]
          updated_at?: string
        }
        Update: {
          cancelled_at?: string | null
          created_at?: string
          current_period_end?: string | null
          current_period_start?: string | null
          doctor_id?: string
          id?: string
          mercadopago_payer_id?: string | null
          mercadopago_subscription_id?: string | null
          payment_type?: string
          plan_id?: string
          status?: Database["public"]["Enums"]["subscription_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "doctor_subscriptions_doctor_id_fkey"
            columns: ["doctor_id"]
            isOneToOne: false
            referencedRelation: "doctors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "doctor_subscriptions_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "subscription_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      doctor_tax_obligations: {
        Row: {
          amount: number
          created_at: string
          doctor_id: string
          due_date: string
          fiscal_profile_id: string
          id: string
          notes: string | null
          obligation_type: string
          paid: boolean
          paid_amount: number | null
          paid_date: string | null
          payment_reference: string | null
          period_month: number
          period_year: number
          status: string
          updated_at: string
        }
        Insert: {
          amount: number
          created_at?: string
          doctor_id: string
          due_date: string
          fiscal_profile_id: string
          id?: string
          notes?: string | null
          obligation_type: string
          paid?: boolean
          paid_amount?: number | null
          paid_date?: string | null
          payment_reference?: string | null
          period_month: number
          period_year: number
          status?: string
          updated_at?: string
        }
        Update: {
          amount?: number
          created_at?: string
          doctor_id?: string
          due_date?: string
          fiscal_profile_id?: string
          id?: string
          notes?: string | null
          obligation_type?: string
          paid?: boolean
          paid_amount?: number | null
          paid_date?: string | null
          payment_reference?: string | null
          period_month?: number
          period_year?: number
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "doctor_tax_obligations_doctor_id_fkey"
            columns: ["doctor_id"]
            isOneToOne: false
            referencedRelation: "doctors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "doctor_tax_obligations_fiscal_profile_id_fkey"
            columns: ["fiscal_profile_id"]
            isOneToOne: false
            referencedRelation: "doctor_fiscal_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      doctors: {
        Row: {
          accepted_insurance: Json | null
          active: boolean | null
          bank_alias: string | null
          bank_cbu_cvu: string | null
          bank_name: string | null
          bio: string | null
          care_guide_template: string | null
          certifications: Json | null
          consultation_fee: number | null
          created_at: string | null
          education: Json | null
          enrollment_entity: string | null
          enrollment_jurisdiction: string | null
          free_videoconsultas_remaining: number
          id: string
          languages: Json | null
          license_number: string
          payout_alias: string | null
          payout_cbu: string | null
          professional_address: string | null
          refeps_id: string | null
          schedule: Json | null
          signature_image_url: string | null
          signature_url: string | null
          specialty: string
          stamp_image_url: string | null
          stamp_url: string | null
          subspecialty: string | null
          timezone: string
          updated_at: string | null
          user_id: string | null
          years_experience: number | null
        }
        Insert: {
          accepted_insurance?: Json | null
          active?: boolean | null
          bank_alias?: string | null
          bank_cbu_cvu?: string | null
          bank_name?: string | null
          bio?: string | null
          care_guide_template?: string | null
          certifications?: Json | null
          consultation_fee?: number | null
          created_at?: string | null
          education?: Json | null
          enrollment_entity?: string | null
          enrollment_jurisdiction?: string | null
          free_videoconsultas_remaining?: number
          id?: string
          languages?: Json | null
          license_number: string
          payout_alias?: string | null
          payout_cbu?: string | null
          professional_address?: string | null
          refeps_id?: string | null
          schedule?: Json | null
          signature_image_url?: string | null
          signature_url?: string | null
          specialty: string
          stamp_image_url?: string | null
          stamp_url?: string | null
          subspecialty?: string | null
          timezone?: string
          updated_at?: string | null
          user_id?: string | null
          years_experience?: number | null
        }
        Update: {
          accepted_insurance?: Json | null
          active?: boolean | null
          bank_alias?: string | null
          bank_cbu_cvu?: string | null
          bank_name?: string | null
          bio?: string | null
          care_guide_template?: string | null
          certifications?: Json | null
          consultation_fee?: number | null
          created_at?: string | null
          education?: Json | null
          enrollment_entity?: string | null
          enrollment_jurisdiction?: string | null
          free_videoconsultas_remaining?: number
          id?: string
          languages?: Json | null
          license_number?: string
          payout_alias?: string | null
          payout_cbu?: string | null
          professional_address?: string | null
          refeps_id?: string | null
          schedule?: Json | null
          signature_image_url?: string | null
          signature_url?: string | null
          specialty?: string
          stamp_image_url?: string | null
          stamp_url?: string | null
          subspecialty?: string | null
          timezone?: string
          updated_at?: string | null
          user_id?: string | null
          years_experience?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "doctors_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "doctors_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "user_identifiers"
            referencedColumns: ["user_id"]
          },
        ]
      }
      email_events_log: {
        Row: {
          created_at: string
          email: string
          event_type: string
          id: string
          metadata: Json | null
          provider: string
          provider_message_id: string | null
          subject: string | null
        }
        Insert: {
          created_at?: string
          email: string
          event_type: string
          id?: string
          metadata?: Json | null
          provider: string
          provider_message_id?: string | null
          subject?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          event_type?: string
          id?: string
          metadata?: Json | null
          provider?: string
          provider_message_id?: string | null
          subject?: string | null
        }
        Relationships: []
      }
      equipment_events: {
        Row: {
          action_type: string
          actor_id: string
          id: string
          incident_id: string
          is_resolved: boolean
          notes: string
          timestamp: string
        }
        Insert: {
          action_type: string
          actor_id: string
          id?: string
          incident_id: string
          is_resolved?: boolean
          notes: string
          timestamp?: string
        }
        Update: {
          action_type?: string
          actor_id?: string
          id?: string
          incident_id?: string
          is_resolved?: boolean
          notes?: string
          timestamp?: string
        }
        Relationships: [
          {
            foreignKeyName: "equipment_events_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "equipment_events_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "user_identifiers"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "equipment_events_incident_id_fkey"
            columns: ["incident_id"]
            isOneToOne: false
            referencedRelation: "equipment_incidents"
            referencedColumns: ["id"]
          },
        ]
      }
      equipment_incidents: {
        Row: {
          assigned_technician_id: string | null
          calibration_certificate_url: string | null
          closed_at: string | null
          equipment_id: string
          id: string
          next_verification_due: string | null
          reported_at: string
          reporter_id: string
          resolved_at: string | null
          severity: Database["public"]["Enums"]["incident_severity"]
          status: string
          technical_summary: string | null
        }
        Insert: {
          assigned_technician_id?: string | null
          calibration_certificate_url?: string | null
          closed_at?: string | null
          equipment_id: string
          id?: string
          next_verification_due?: string | null
          reported_at?: string
          reporter_id: string
          resolved_at?: string | null
          severity?: Database["public"]["Enums"]["incident_severity"]
          status?: string
          technical_summary?: string | null
        }
        Update: {
          assigned_technician_id?: string | null
          calibration_certificate_url?: string | null
          closed_at?: string | null
          equipment_id?: string
          id?: string
          next_verification_due?: string | null
          reported_at?: string
          reporter_id?: string
          resolved_at?: string | null
          severity?: Database["public"]["Enums"]["incident_severity"]
          status?: string
          technical_summary?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "equipment_incidents_assigned_technician_id_fkey"
            columns: ["assigned_technician_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "equipment_incidents_assigned_technician_id_fkey"
            columns: ["assigned_technician_id"]
            isOneToOne: false
            referencedRelation: "user_identifiers"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "equipment_incidents_equipment_id_fkey"
            columns: ["equipment_id"]
            isOneToOne: false
            referencedRelation: "medical_equipment"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "equipment_incidents_reporter_id_fkey"
            columns: ["reporter_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "equipment_incidents_reporter_id_fkey"
            columns: ["reporter_id"]
            isOneToOne: false
            referencedRelation: "user_identifiers"
            referencedColumns: ["user_id"]
          },
        ]
      }
      geriatric_contacts: {
        Row: {
          address: string | null
          created_at: string | null
          has_whatsapp: boolean | null
          id: string
          name: string
          notes: string | null
          phone: string | null
          rating: string | null
          replied_at: string | null
          sent_at: string | null
          status: string | null
          zone: string | null
        }
        Insert: {
          address?: string | null
          created_at?: string | null
          has_whatsapp?: boolean | null
          id?: string
          name: string
          notes?: string | null
          phone?: string | null
          rating?: string | null
          replied_at?: string | null
          sent_at?: string | null
          status?: string | null
          zone?: string | null
        }
        Update: {
          address?: string | null
          created_at?: string | null
          has_whatsapp?: boolean | null
          id?: string
          name?: string
          notes?: string | null
          phone?: string | null
          rating?: string | null
          replied_at?: string | null
          sent_at?: string | null
          status?: string | null
          zone?: string | null
        }
        Relationships: []
      }
      group_memberships: {
        Row: {
          comment_count: number
          created_at: string
          group_id: string
          helpful_reactions_received: number
          id: string
          last_active: string | null
          patient_id: string
          post_count: number
          role: string
          status: string
          updated_at: string
        }
        Insert: {
          comment_count?: number
          created_at?: string
          group_id: string
          helpful_reactions_received?: number
          id?: string
          last_active?: string | null
          patient_id: string
          post_count?: number
          role?: string
          status?: string
          updated_at?: string
        }
        Update: {
          comment_count?: number
          created_at?: string
          group_id?: string
          helpful_reactions_received?: number
          id?: string
          last_active?: string | null
          patient_id?: string
          post_count?: number
          role?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "group_memberships_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "community_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_memberships_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      health_centers: {
        Row: {
          accepts_walk_ins: boolean
          accessibility_features: string[] | null
          address: Json
          average_wait_time_days: number
          coordinates: unknown
          created_at: string
          email: string | null
          has_24h_service: boolean
          id: string
          name: string
          offers_ive_ile: boolean
          offers_medication_method: boolean
          offers_psychological_support: boolean
          offers_surgical_method: boolean
          operating_hours: Json | null
          phone: string
          registration_number: string | null
          requires_appointment: boolean
          type: string
          updated_at: string
          website_url: string | null
        }
        Insert: {
          accepts_walk_ins?: boolean
          accessibility_features?: string[] | null
          address: Json
          average_wait_time_days?: number
          coordinates: unknown
          created_at?: string
          email?: string | null
          has_24h_service?: boolean
          id?: string
          name: string
          offers_ive_ile?: boolean
          offers_medication_method?: boolean
          offers_psychological_support?: boolean
          offers_surgical_method?: boolean
          operating_hours?: Json | null
          phone: string
          registration_number?: string | null
          requires_appointment?: boolean
          type: string
          updated_at?: string
          website_url?: string | null
        }
        Update: {
          accepts_walk_ins?: boolean
          accessibility_features?: string[] | null
          address?: Json
          average_wait_time_days?: number
          coordinates?: unknown
          created_at?: string
          email?: string | null
          has_24h_service?: boolean
          id?: string
          name?: string
          offers_ive_ile?: boolean
          offers_medication_method?: boolean
          offers_psychological_support?: boolean
          offers_surgical_method?: boolean
          operating_hours?: Json | null
          phone?: string
          registration_number?: string | null
          requires_appointment?: boolean
          type?: string
          updated_at?: string
          website_url?: string | null
        }
        Relationships: []
      }
      informed_consents: {
        Row: {
          accepted_sections: Json
          consent_type: string
          created_at: string
          expires_at: string | null
          id: string
          ip_address: unknown
          patient_id: string
          pdf_url: string | null
          revoked_at: string | null
          revoked_reason: string | null
          signature_hash: string
          signed_at: string
          template_version: string
          updated_at: string
          user_agent: string | null
        }
        Insert: {
          accepted_sections?: Json
          consent_type: string
          created_at?: string
          expires_at?: string | null
          id?: string
          ip_address?: unknown
          patient_id: string
          pdf_url?: string | null
          revoked_at?: string | null
          revoked_reason?: string | null
          signature_hash: string
          signed_at?: string
          template_version: string
          updated_at?: string
          user_agent?: string | null
        }
        Update: {
          accepted_sections?: Json
          consent_type?: string
          created_at?: string
          expires_at?: string | null
          id?: string
          ip_address?: unknown
          patient_id?: string
          pdf_url?: string | null
          revoked_at?: string | null
          revoked_reason?: string | null
          signature_hash?: string
          signed_at?: string
          template_version?: string
          updated_at?: string
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "informed_consents_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      insurance_authorizations: {
        Row: {
          approved_amount_ars: number | null
          authorization_number: string | null
          coverage_pct: number | null
          created_at: string
          denial_reason: string | null
          expires_at: string | null
          id: string
          insurance_provider: string
          member_number: string
          out_of_pocket_ars: number | null
          plan_code: string | null
          prescription_id: string
          raw_request: Json | null
          raw_response: Json | null
          requested_at: string
          resolved_at: string | null
          status: string
          updated_at: string
        }
        Insert: {
          approved_amount_ars?: number | null
          authorization_number?: string | null
          coverage_pct?: number | null
          created_at?: string
          denial_reason?: string | null
          expires_at?: string | null
          id?: string
          insurance_provider: string
          member_number: string
          out_of_pocket_ars?: number | null
          plan_code?: string | null
          prescription_id: string
          raw_request?: Json | null
          raw_response?: Json | null
          requested_at?: string
          resolved_at?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          approved_amount_ars?: number | null
          authorization_number?: string | null
          coverage_pct?: number | null
          created_at?: string
          denial_reason?: string | null
          expires_at?: string | null
          id?: string
          insurance_provider?: string
          member_number?: string
          out_of_pocket_ars?: number | null
          plan_code?: string | null
          prescription_id?: string
          raw_request?: Json | null
          raw_response?: Json | null
          requested_at?: string
          resolved_at?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "insurance_authorizations_prescription_id_fkey"
            columns: ["prescription_id"]
            isOneToOne: false
            referencedRelation: "prescriptions"
            referencedColumns: ["id"]
          },
        ]
      }
      lab_results: {
        Row: {
          created_at: string
          deleted_at: string | null
          file_type: string | null
          file_url: string | null
          id: string
          laboratory_name: string | null
          notes: string | null
          patient_id: string
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          test_date: string
          test_type: string
          updated_at: string
          uploaded_by_id: string | null
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          file_type?: string | null
          file_url?: string | null
          id?: string
          laboratory_name?: string | null
          notes?: string | null
          patient_id: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          test_date: string
          test_type: string
          updated_at?: string
          uploaded_by_id?: string | null
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          file_type?: string | null
          file_url?: string | null
          id?: string
          laboratory_name?: string | null
          notes?: string | null
          patient_id?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          test_date?: string
          test_type?: string
          updated_at?: string
          uploaded_by_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lab_results_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      medical_chats: {
        Row: {
          appointment_id: string | null
          created_at: string
          id: string
          is_urgent: boolean
          last_message_at: string
          patient_id: string
          specialist_id: string
          status: string
          subject: string
          updated_at: string
        }
        Insert: {
          appointment_id?: string | null
          created_at?: string
          id?: string
          is_urgent?: boolean
          last_message_at?: string
          patient_id: string
          specialist_id: string
          status?: string
          subject: string
          updated_at?: string
        }
        Update: {
          appointment_id?: string | null
          created_at?: string
          id?: string
          is_urgent?: boolean
          last_message_at?: string
          patient_id?: string
          specialist_id?: string
          status?: string
          subject?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "medical_chats_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "reproductive_health_appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "medical_chats_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "medical_chats_specialist_id_fkey"
            columns: ["specialist_id"]
            isOneToOne: false
            referencedRelation: "reproductive_health_specialists"
            referencedColumns: ["id"]
          },
        ]
      }
      medical_equipment: {
        Row: {
          brand: string
          current_setting: Database["public"]["Enums"]["clinical_setting"]
          current_status: Database["public"]["Enums"]["equipment_status"]
          device_type: string
          id: string
          installed_at: string
          last_calibrated_at: string
          model_name: string
          next_calibration_due: string
          operating_hours: number
          organization_id: string
          serial_number: string
          snomed_device_code: string | null
        }
        Insert: {
          brand: string
          current_setting?: Database["public"]["Enums"]["clinical_setting"]
          current_status?: Database["public"]["Enums"]["equipment_status"]
          device_type: string
          id?: string
          installed_at?: string
          last_calibrated_at: string
          model_name: string
          next_calibration_due: string
          operating_hours?: number
          organization_id: string
          serial_number: string
          snomed_device_code?: string | null
        }
        Update: {
          brand?: string
          current_setting?: Database["public"]["Enums"]["clinical_setting"]
          current_status?: Database["public"]["Enums"]["equipment_status"]
          device_type?: string
          id?: string
          installed_at?: string
          last_calibrated_at?: string
          model_name?: string
          next_calibration_due?: string
          operating_hours?: number
          organization_id?: string
          serial_number?: string
          snomed_device_code?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "medical_equipment_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      medical_messages: {
        Row: {
          attachment_url: string | null
          author_id: string
          author_type: string
          chat_id: string
          content: string
          content_type: string
          created_at: string
          id: string
          is_read: boolean
          read_at: string | null
        }
        Insert: {
          attachment_url?: string | null
          author_id: string
          author_type: string
          chat_id: string
          content: string
          content_type?: string
          created_at?: string
          id?: string
          is_read?: boolean
          read_at?: string | null
        }
        Update: {
          attachment_url?: string | null
          author_id?: string
          author_type?: string
          chat_id?: string
          content?: string
          content_type?: string
          created_at?: string
          id?: string
          is_read?: boolean
          read_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "medical_messages_chat_id_fkey"
            columns: ["chat_id"]
            isOneToOne: false
            referencedRelation: "medical_chats"
            referencedColumns: ["id"]
          },
        ]
      }
      medical_orders: {
        Row: {
          appointment_id: string | null
          created_at: string
          cuir: string | null
          diagnosis: string | null
          doctor_id: string
          id: string
          notes: string | null
          organization_id: string | null
          patient_id: string
          practices: Json
          qr_code_content: string | null
          signed_pdf_url: string | null
          status: string
          study_type: string
          updated_at: string
        }
        Insert: {
          appointment_id?: string | null
          created_at?: string
          cuir?: string | null
          diagnosis?: string | null
          doctor_id: string
          id?: string
          notes?: string | null
          organization_id?: string | null
          patient_id: string
          practices: Json
          qr_code_content?: string | null
          signed_pdf_url?: string | null
          status?: string
          study_type: string
          updated_at?: string
        }
        Update: {
          appointment_id?: string | null
          created_at?: string
          cuir?: string | null
          diagnosis?: string | null
          doctor_id?: string
          id?: string
          notes?: string | null
          organization_id?: string | null
          patient_id?: string
          practices?: Json
          qr_code_content?: string | null
          signed_pdf_url?: string | null
          status?: string
          study_type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "medical_orders_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "medical_orders_doctor_id_fkey"
            columns: ["doctor_id"]
            isOneToOne: false
            referencedRelation: "doctors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "medical_orders_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "medical_orders_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      medical_record_authorizations: {
        Row: {
          authorized_by_user_id: string
          authorized_user_id: string
          created_at: string | null
          id: string
          reason: string
          record_id: string
          revoked_at: string | null
          valid_until: string
        }
        Insert: {
          authorized_by_user_id: string
          authorized_user_id: string
          created_at?: string | null
          id?: string
          reason: string
          record_id: string
          revoked_at?: string | null
          valid_until: string
        }
        Update: {
          authorized_by_user_id?: string
          authorized_user_id?: string
          created_at?: string | null
          id?: string
          reason?: string
          record_id?: string
          revoked_at?: string | null
          valid_until?: string
        }
        Relationships: [
          {
            foreignKeyName: "medical_record_authorizations_record_id_fkey"
            columns: ["record_id"]
            isOneToOne: false
            referencedRelation: "medical_records"
            referencedColumns: ["id"]
          },
        ]
      }
      medical_records: {
        Row: {
          appointment_id: string | null
          attachments: Json | null
          content: Json
          created_at: string | null
          date_recorded: string | null
          deleted_at: string | null
          doctor_id: string | null
          id: string
          patient_id: string | null
          title: string
          type: string
          updated_at: string | null
          visibility: string | null
        }
        Insert: {
          appointment_id?: string | null
          attachments?: Json | null
          content: Json
          created_at?: string | null
          date_recorded?: string | null
          deleted_at?: string | null
          doctor_id?: string | null
          id?: string
          patient_id?: string | null
          title: string
          type: string
          updated_at?: string | null
          visibility?: string | null
        }
        Update: {
          appointment_id?: string | null
          attachments?: Json | null
          content?: Json
          created_at?: string | null
          date_recorded?: string | null
          deleted_at?: string | null
          doctor_id?: string | null
          id?: string
          patient_id?: string | null
          title?: string
          type?: string
          updated_at?: string | null
          visibility?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "medical_records_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "medical_records_doctor_id_fkey"
            columns: ["doctor_id"]
            isOneToOne: false
            referencedRelation: "doctors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "medical_records_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      medical_review_orders: {
        Row: {
          amount_cents: number
          assigned_at: string | null
          created_at: string
          currency: string
          doctor_id: string | null
          id: string
          metadata: Json
          paid_at: string | null
          patient_phone: string
          payment_provider: string
          payment_url: string | null
          preanamnesis_id: string
          provider_payment_id: string | null
          provider_preference_id: string | null
          reviewed_at: string | null
          status: string
          updated_at: string
        }
        Insert: {
          amount_cents: number
          assigned_at?: string | null
          created_at?: string
          currency?: string
          doctor_id?: string | null
          id?: string
          metadata?: Json
          paid_at?: string | null
          patient_phone: string
          payment_provider?: string
          payment_url?: string | null
          preanamnesis_id: string
          provider_payment_id?: string | null
          provider_preference_id?: string | null
          reviewed_at?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          amount_cents?: number
          assigned_at?: string | null
          created_at?: string
          currency?: string
          doctor_id?: string | null
          id?: string
          metadata?: Json
          paid_at?: string | null
          patient_phone?: string
          payment_provider?: string
          payment_url?: string | null
          preanamnesis_id?: string
          provider_payment_id?: string | null
          provider_preference_id?: string | null
          reviewed_at?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "medical_review_orders_doctor_id_fkey"
            columns: ["doctor_id"]
            isOneToOne: false
            referencedRelation: "doctors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "medical_review_orders_preanamnesis_id_fkey"
            columns: ["preanamnesis_id"]
            isOneToOne: true
            referencedRelation: "preanamnesis_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      medication_intake_events: {
        Row: {
          confirmation_channel: string | null
          confirmed_at: string | null
          created_at: string
          expected_at: string
          id: string
          patient_id: string
          reminder_message_id: string | null
          reminder_sent_at: string | null
          schedule_id: string
          skipped: boolean
          skipped_reason: string | null
          updated_at: string
        }
        Insert: {
          confirmation_channel?: string | null
          confirmed_at?: string | null
          created_at?: string
          expected_at: string
          id?: string
          patient_id: string
          reminder_message_id?: string | null
          reminder_sent_at?: string | null
          schedule_id: string
          skipped?: boolean
          skipped_reason?: string | null
          updated_at?: string
        }
        Update: {
          confirmation_channel?: string | null
          confirmed_at?: string | null
          created_at?: string
          expected_at?: string
          id?: string
          patient_id?: string
          reminder_message_id?: string | null
          reminder_sent_at?: string | null
          schedule_id?: string
          skipped?: boolean
          skipped_reason?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "medication_intake_events_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "medication_intake_events_schedule_id_fkey"
            columns: ["schedule_id"]
            isOneToOne: false
            referencedRelation: "medication_schedules"
            referencedColumns: ["id"]
          },
        ]
      }
      medication_logs: {
        Row: {
          created_at: string
          deleted_at: string | null
          dosage: string
          id: string
          logged_by_id: string | null
          medication_name: string
          notes: string | null
          patient_id: string
          source: string
          status: string
          taken_at: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          dosage: string
          id?: string
          logged_by_id?: string | null
          medication_name: string
          notes?: string | null
          patient_id: string
          source?: string
          status?: string
          taken_at?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          dosage?: string
          id?: string
          logged_by_id?: string | null
          medication_name?: string
          notes?: string | null
          patient_id?: string
          source?: string
          status?: string
          taken_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "medication_logs_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      medication_schedules: {
        Row: {
          active: boolean
          created_at: string
          custom_days: Json | null
          days_pattern: string
          dosage: string
          drug_name: string
          end_date: string | null
          id: string
          notes: string | null
          patient_id: string
          prescription_id: string
          start_date: string
          times_per_day: Json
          timezone: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          custom_days?: Json | null
          days_pattern?: string
          dosage: string
          drug_name: string
          end_date?: string | null
          id?: string
          notes?: string | null
          patient_id: string
          prescription_id: string
          start_date: string
          times_per_day?: Json
          timezone?: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          custom_days?: Json | null
          days_pattern?: string
          dosage?: string
          drug_name?: string
          end_date?: string | null
          id?: string
          notes?: string | null
          patient_id?: string
          prescription_id?: string
          start_date?: string
          times_per_day?: Json
          timezone?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "medication_schedules_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "medication_schedules_prescription_id_fkey"
            columns: ["prescription_id"]
            isOneToOne: false
            referencedRelation: "prescriptions"
            referencedColumns: ["id"]
          },
        ]
      }
      org_members: {
        Row: {
          created_at: string
          invited_by: string | null
          metadata: Json
          organization_id: string
          profile_id: string
          role: string
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          invited_by?: string | null
          metadata?: Json
          organization_id: string
          profile_id: string
          role?: string
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          invited_by?: string | null
          metadata?: Json
          organization_id?: string
          profile_id?: string
          role?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "org_members_invited_by_fkey"
            columns: ["invited_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "org_members_invited_by_fkey"
            columns: ["invited_by"]
            isOneToOne: false
            referencedRelation: "user_identifiers"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "org_members_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "org_members_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "org_members_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "user_identifiers"
            referencedColumns: ["user_id"]
          },
        ]
      }
      organizations: {
        Row: {
          address: Json | null
          contact: Json | null
          created_at: string
          id: string
          industry: string | null
          is_active: boolean
          legal_name: string | null
          metadata: Json
          name: string
          owner_profile_id: string
          size: string | null
          slug: string
          tax_id: string | null
          type: string | null
          updated_at: string
        }
        Insert: {
          address?: Json | null
          contact?: Json | null
          created_at?: string
          id?: string
          industry?: string | null
          is_active?: boolean
          legal_name?: string | null
          metadata?: Json
          name: string
          owner_profile_id: string
          size?: string | null
          slug?: string
          tax_id?: string | null
          type?: string | null
          updated_at?: string
        }
        Update: {
          address?: Json | null
          contact?: Json | null
          created_at?: string
          id?: string
          industry?: string | null
          is_active?: boolean
          legal_name?: string | null
          metadata?: Json
          name?: string
          owner_profile_id?: string
          size?: string | null
          slug?: string
          tax_id?: string | null
          type?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "organizations_owner_profile_id_fkey"
            columns: ["owner_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "organizations_owner_profile_id_fkey"
            columns: ["owner_profile_id"]
            isOneToOne: false
            referencedRelation: "user_identifiers"
            referencedColumns: ["user_id"]
          },
        ]
      }
      patient_ai_chats: {
        Row: {
          confidence: number | null
          created_at: string
          id: string
          intent: string
          message: string
          reply_preview: string | null
          used_pattern: boolean
          user_id: string
        }
        Insert: {
          confidence?: number | null
          created_at?: string
          id?: string
          intent: string
          message: string
          reply_preview?: string | null
          used_pattern?: boolean
          user_id: string
        }
        Update: {
          confidence?: number | null
          created_at?: string
          id?: string
          intent?: string
          message?: string
          reply_preview?: string | null
          used_pattern?: boolean
          user_id?: string
        }
        Relationships: []
      }
      patient_ai_insights: {
        Row: {
          created_at: string
          deleted_at: string | null
          error_message: string | null
          id: string
          model_name: string
          patient_id: string
          prompt_version: string
          provider_name: string
          request_json: Json
          response_json: Json | null
          snapshot_version: string
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          error_message?: string | null
          id?: string
          model_name: string
          patient_id: string
          prompt_version?: string
          provider_name: string
          request_json?: Json
          response_json?: Json | null
          snapshot_version?: string
          status: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          error_message?: string | null
          id?: string
          model_name?: string
          patient_id?: string
          prompt_version?: string
          provider_name?: string
          request_json?: Json
          response_json?: Json | null
          snapshot_version?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "patient_ai_insights_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      patient_alerts: {
        Row: {
          acknowledged_at: string | null
          acknowledged_by_id: string | null
          created_at: string
          created_by_id: string | null
          deleted_at: string | null
          id: string
          message: string
          metadata: Json
          patient_id: string
          resolved_at: string | null
          severity: string
          source_record_id: string
          source_table: string
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          acknowledged_at?: string | null
          acknowledged_by_id?: string | null
          created_at?: string
          created_by_id?: string | null
          deleted_at?: string | null
          id?: string
          message: string
          metadata?: Json
          patient_id: string
          resolved_at?: string | null
          severity: string
          source_record_id: string
          source_table: string
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          acknowledged_at?: string | null
          acknowledged_by_id?: string | null
          created_at?: string
          created_by_id?: string | null
          deleted_at?: string | null
          id?: string
          message?: string
          metadata?: Json
          patient_id?: string
          resolved_at?: string | null
          severity?: string
          source_record_id?: string
          source_table?: string
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "patient_alerts_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      patient_care_team: {
        Row: {
          active: boolean | null
          assigned_date: string | null
          created_at: string | null
          doctor_id: string | null
          id: string
          patient_id: string | null
          role: string | null
          updated_at: string | null
        }
        Insert: {
          active?: boolean | null
          assigned_date?: string | null
          created_at?: string | null
          doctor_id?: string | null
          id?: string
          patient_id?: string | null
          role?: string | null
          updated_at?: string | null
        }
        Update: {
          active?: boolean | null
          assigned_date?: string | null
          created_at?: string | null
          doctor_id?: string | null
          id?: string
          patient_id?: string | null
          role?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "patient_care_team_doctor_id_fkey"
            columns: ["doctor_id"]
            isOneToOne: false
            referencedRelation: "doctors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "patient_care_team_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      patient_derived_alerts: {
        Row: {
          acknowledged_at: string | null
          acknowledged_by_id: string | null
          category: string
          created_at: string
          deleted_at: string | null
          description: string
          evidence_json: Json
          fingerprint: string
          first_detected_at: string
          id: string
          last_detected_at: string
          patient_id: string
          resolved_at: string | null
          rule_id: string | null
          severity: string
          snapshot_version: string
          source_kind: string
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          acknowledged_at?: string | null
          acknowledged_by_id?: string | null
          category: string
          created_at?: string
          deleted_at?: string | null
          description: string
          evidence_json?: Json
          fingerprint: string
          first_detected_at?: string
          id?: string
          last_detected_at?: string
          patient_id: string
          resolved_at?: string | null
          rule_id?: string | null
          severity: string
          snapshot_version?: string
          source_kind: string
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          acknowledged_at?: string | null
          acknowledged_by_id?: string | null
          category?: string
          created_at?: string
          deleted_at?: string | null
          description?: string
          evidence_json?: Json
          fingerprint?: string
          first_detected_at?: string
          id?: string
          last_detected_at?: string
          patient_id?: string
          resolved_at?: string | null
          rule_id?: string | null
          severity?: string
          snapshot_version?: string
          source_kind?: string
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "patient_derived_alerts_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      patient_screenings: {
        Row: {
          assigned_doctor_id: string | null
          completed_date: string | null
          created_at: string
          id: string
          next_due_date: string | null
          notes: string | null
          patient_id: string
          result_summary: string | null
          scheduled_date: string | null
          screening_id: string
          status: string
          updated_at: string
        }
        Insert: {
          assigned_doctor_id?: string | null
          completed_date?: string | null
          created_at?: string
          id?: string
          next_due_date?: string | null
          notes?: string | null
          patient_id: string
          result_summary?: string | null
          scheduled_date?: string | null
          screening_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          assigned_doctor_id?: string | null
          completed_date?: string | null
          created_at?: string
          id?: string
          next_due_date?: string | null
          notes?: string | null
          patient_id?: string
          result_summary?: string | null
          scheduled_date?: string | null
          screening_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "patient_screenings_assigned_doctor_id_fkey"
            columns: ["assigned_doctor_id"]
            isOneToOne: false
            referencedRelation: "doctors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "patient_screenings_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "patient_screenings_screening_id_fkey"
            columns: ["screening_id"]
            isOneToOne: false
            referencedRelation: "preventive_screenings"
            referencedColumns: ["id"]
          },
        ]
      }
      patient_triage_results: {
        Row: {
          ai_chief_complaint: string | null
          ai_clinical_narrative: string | null
          ai_covered_areas: string[] | null
          ai_missing_areas: string[] | null
          ai_processed: boolean | null
          ai_recommendations: string | null
          ai_safety_flags: string[] | null
          ai_severity: string | null
          alerts_detected: string[] | null
          answers: Json
          created_at: string
          id: number
          patient_id: string | null
          patient_name: string | null
          patient_phone: string
          session_id: string | null
          source: string
        }
        Insert: {
          ai_chief_complaint?: string | null
          ai_clinical_narrative?: string | null
          ai_covered_areas?: string[] | null
          ai_missing_areas?: string[] | null
          ai_processed?: boolean | null
          ai_recommendations?: string | null
          ai_safety_flags?: string[] | null
          ai_severity?: string | null
          alerts_detected?: string[] | null
          answers?: Json
          created_at?: string
          id?: number
          patient_id?: string | null
          patient_name?: string | null
          patient_phone: string
          session_id?: string | null
          source?: string
        }
        Update: {
          ai_chief_complaint?: string | null
          ai_clinical_narrative?: string | null
          ai_covered_areas?: string[] | null
          ai_missing_areas?: string[] | null
          ai_processed?: boolean | null
          ai_recommendations?: string | null
          ai_safety_flags?: string[] | null
          ai_severity?: string | null
          alerts_detected?: string[] | null
          answers?: Json
          created_at?: string
          id?: number
          patient_id?: string | null
          patient_name?: string | null
          patient_phone?: string
          session_id?: string | null
          source?: string
        }
        Relationships: []
      }
      patients: {
        Row: {
          active: boolean | null
          address: string | null
          allergies: Json | null
          birth_date: string | null
          blood_type: string | null
          created_at: string | null
          cuil: string | null
          dni: string | null
          emergency_contact: Json | null
          free_consultations_remaining: number
          gender: string | null
          height_cm: number | null
          id: string
          insurance_info: Json | null
          medical_history: Json | null
          medications: Json | null
          organization_id: string | null
          risk_level: string | null
          risk_reason: string | null
          timezone: string
          updated_at: string | null
          user_id: string | null
          weight_kg: number | null
        }
        Insert: {
          active?: boolean | null
          address?: string | null
          allergies?: Json | null
          birth_date?: string | null
          blood_type?: string | null
          created_at?: string | null
          cuil?: string | null
          dni?: string | null
          emergency_contact?: Json | null
          free_consultations_remaining?: number
          gender?: string | null
          height_cm?: number | null
          id?: string
          insurance_info?: Json | null
          medical_history?: Json | null
          medications?: Json | null
          organization_id?: string | null
          risk_level?: string | null
          risk_reason?: string | null
          timezone?: string
          updated_at?: string | null
          user_id?: string | null
          weight_kg?: number | null
        }
        Update: {
          active?: boolean | null
          address?: string | null
          allergies?: Json | null
          birth_date?: string | null
          blood_type?: string | null
          created_at?: string | null
          cuil?: string | null
          dni?: string | null
          emergency_contact?: Json | null
          free_consultations_remaining?: number
          gender?: string | null
          height_cm?: number | null
          id?: string
          insurance_info?: Json | null
          medical_history?: Json | null
          medications?: Json | null
          organization_id?: string | null
          risk_level?: string | null
          risk_reason?: string | null
          timezone?: string
          updated_at?: string | null
          user_id?: string | null
          weight_kg?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "patients_company_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "patients_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "patients_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "user_identifiers"
            referencedColumns: ["user_id"]
          },
        ]
      }
      payment_transactions: {
        Row: {
          amount_cents: number
          created_at: string
          currency: string
          doctor_id: string
          id: string
          mercadopago_payment_id: string | null
          metadata: Json | null
          payment_method: string | null
          status: Database["public"]["Enums"]["payment_status"]
          subscription_id: string | null
        }
        Insert: {
          amount_cents: number
          created_at?: string
          currency?: string
          doctor_id: string
          id?: string
          mercadopago_payment_id?: string | null
          metadata?: Json | null
          payment_method?: string | null
          status?: Database["public"]["Enums"]["payment_status"]
          subscription_id?: string | null
        }
        Update: {
          amount_cents?: number
          created_at?: string
          currency?: string
          doctor_id?: string
          id?: string
          mercadopago_payment_id?: string | null
          metadata?: Json | null
          payment_method?: string | null
          status?: Database["public"]["Enums"]["payment_status"]
          subscription_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payment_transactions_doctor_id_fkey"
            columns: ["doctor_id"]
            isOneToOne: false
            referencedRelation: "doctors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_transactions_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "doctor_subscriptions"
            referencedColumns: ["id"]
          },
        ]
      }
      pharmacies: {
        Row: {
          active: boolean
          address: Json
          created_at: string
          deleted_at: string | null
          email: string | null
          id: string
          license_number: string
          name: string
          organization_id: string | null
          phone: string | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          address?: Json
          created_at?: string
          deleted_at?: string | null
          email?: string | null
          id?: string
          license_number: string
          name: string
          organization_id?: string | null
          phone?: string | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          address?: Json
          created_at?: string
          deleted_at?: string | null
          email?: string | null
          id?: string
          license_number?: string
          name?: string
          organization_id?: string | null
          phone?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pharmacies_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      pharmacists: {
        Row: {
          active: boolean
          created_at: string
          full_name: string | null
          id: string
          license_number: string | null
          license_province: string | null
          pharmacy_id: string | null
          role: string
          updated_at: string
          user_id: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          full_name?: string | null
          id?: string
          license_number?: string | null
          license_province?: string | null
          pharmacy_id?: string | null
          role?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          active?: boolean
          created_at?: string
          full_name?: string | null
          id?: string
          license_number?: string | null
          license_province?: string | null
          pharmacy_id?: string | null
          role?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pharmacists_pharmacy_id_fkey"
            columns: ["pharmacy_id"]
            isOneToOne: false
            referencedRelation: "pharmacies"
            referencedColumns: ["id"]
          },
        ]
      }
      pharmacy_audit_events: {
        Row: {
          actor_id: string
          actor_role: string
          details: Json | null
          event_type: string
          id: string
          ip_address: string | null
          order_id: string
          timestamp: string
        }
        Insert: {
          actor_id: string
          actor_role: string
          details?: Json | null
          event_type: string
          id?: string
          ip_address?: string | null
          order_id: string
          timestamp?: string
        }
        Update: {
          actor_id?: string
          actor_role?: string
          details?: Json | null
          event_type?: string
          id?: string
          ip_address?: string | null
          order_id?: string
          timestamp?: string
        }
        Relationships: [
          {
            foreignKeyName: "pharmacy_audit_events_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "dispensation_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      portal_notifications: {
        Row: {
          action_label: string | null
          action_url: string | null
          archived_at: string | null
          audience: string
          body: string
          category: string
          context_data: Json
          created_at: string
          dedupe_key: string
          id: string
          priority: string
          read_at: string | null
          title: string
          type: string
          updated_at: string
          user_id: string
        }
        Insert: {
          action_label?: string | null
          action_url?: string | null
          archived_at?: string | null
          audience?: string
          body: string
          category: string
          context_data?: Json
          created_at?: string
          dedupe_key: string
          id?: string
          priority?: string
          read_at?: string | null
          title: string
          type: string
          updated_at?: string
          user_id: string
        }
        Update: {
          action_label?: string | null
          action_url?: string | null
          archived_at?: string | null
          audience?: string
          body?: string
          category?: string
          context_data?: Json
          created_at?: string
          dedupe_key?: string
          id?: string
          priority?: string
          read_at?: string | null
          title?: string
          type?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      post_reactions: {
        Row: {
          created_at: string
          id: string
          patient_id: string
          post_id: string
          reaction_type: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          patient_id: string
          post_id: string
          reaction_type?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          patient_id?: string
          post_id?: string
          reaction_type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "post_reactions_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "post_reactions_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "community_posts"
            referencedColumns: ["id"]
          },
        ]
      }
      preanamnesis_sessions: {
        Row: {
          access_mode: string
          created_at: string
          extraction_json: Json
          id: string
          patient_phone: string
          pdf_url: string
          source: string
          status: string
          storage_bucket: string
          storage_path: string
          transcript: string | null
          updated_at: string
        }
        Insert: {
          access_mode?: string
          created_at?: string
          extraction_json?: Json
          id: string
          patient_phone: string
          pdf_url: string
          source?: string
          status?: string
          storage_bucket?: string
          storage_path: string
          transcript?: string | null
          updated_at?: string
        }
        Update: {
          access_mode?: string
          created_at?: string
          extraction_json?: Json
          id?: string
          patient_phone?: string
          pdf_url?: string
          source?: string
          status?: string
          storage_bucket?: string
          storage_path?: string
          transcript?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      prescription_audit_events: {
        Row: {
          event_type: string
          id: string
          ip_address: string | null
          metadata: Json | null
          prescription_id: string
          signature_hash: string | null
          timestamp: string
          user_agent: string | null
          user_id: string
        }
        Insert: {
          event_type: string
          id?: string
          ip_address?: string | null
          metadata?: Json | null
          prescription_id: string
          signature_hash?: string | null
          timestamp?: string
          user_agent?: string | null
          user_id: string
        }
        Update: {
          event_type?: string
          id?: string
          ip_address?: string | null
          metadata?: Json | null
          prescription_id?: string
          signature_hash?: string | null
          timestamp?: string
          user_agent?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "prescription_audit_events_prescription_id_fkey"
            columns: ["prescription_id"]
            isOneToOne: false
            referencedRelation: "prescriptions"
            referencedColumns: ["id"]
          },
        ]
      }
      prescriptions: {
        Row: {
          appointment_id: string | null
          blocked_reason: string | null
          clinical_data: Json
          controlled_substance_list: string | null
          created_at: string
          cuir: string | null
          doctor_id: string
          drug_category: string | null
          id: string
          is_controlled_substance: boolean | null
          organization_id: string | null
          patient_id: string
          physical_pdf_url: string | null
          qr_code_content: string | null
          rcta_registration_id: string | null
          signature_method: string | null
          signed_pdf_url: string | null
          status: string
          updated_at: string
          vendor_id: string | null
          vendor_name: string
        }
        Insert: {
          appointment_id?: string | null
          blocked_reason?: string | null
          clinical_data: Json
          controlled_substance_list?: string | null
          created_at?: string
          cuir?: string | null
          doctor_id: string
          drug_category?: string | null
          id?: string
          is_controlled_substance?: boolean | null
          organization_id?: string | null
          patient_id: string
          physical_pdf_url?: string | null
          qr_code_content?: string | null
          rcta_registration_id?: string | null
          signature_method?: string | null
          signed_pdf_url?: string | null
          status?: string
          updated_at?: string
          vendor_id?: string | null
          vendor_name: string
        }
        Update: {
          appointment_id?: string | null
          blocked_reason?: string | null
          clinical_data?: Json
          controlled_substance_list?: string | null
          created_at?: string
          cuir?: string | null
          doctor_id?: string
          drug_category?: string | null
          id?: string
          is_controlled_substance?: boolean | null
          organization_id?: string | null
          patient_id?: string
          physical_pdf_url?: string | null
          qr_code_content?: string | null
          rcta_registration_id?: string | null
          signature_method?: string | null
          signed_pdf_url?: string | null
          status?: string
          updated_at?: string
          vendor_id?: string | null
          vendor_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "prescriptions_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prescriptions_doctor_id_fkey"
            columns: ["doctor_id"]
            isOneToOne: false
            referencedRelation: "doctors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prescriptions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prescriptions_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      preventive_screenings: {
        Row: {
          category: string
          covered_by_public_health: boolean
          created_at: string
          description: string
          estimated_cost_ars: number | null
          id: string
          is_mandatory: boolean
          max_age: number | null
          min_age: number | null
          name: string
          preparation_instructions: string | null
          recommended_frequency: string
          requires_specialist: boolean
          target_gender: string
          updated_at: string
        }
        Insert: {
          category: string
          covered_by_public_health?: boolean
          created_at?: string
          description: string
          estimated_cost_ars?: number | null
          id?: string
          is_mandatory?: boolean
          max_age?: number | null
          min_age?: number | null
          name: string
          preparation_instructions?: string | null
          recommended_frequency: string
          requires_specialist?: boolean
          target_gender: string
          updated_at?: string
        }
        Update: {
          category?: string
          covered_by_public_health?: boolean
          created_at?: string
          description?: string
          estimated_cost_ars?: number | null
          id?: string
          is_mandatory?: boolean
          max_age?: number | null
          min_age?: number | null
          name?: string
          preparation_instructions?: string | null
          recommended_frequency?: string
          requires_specialist?: boolean
          target_gender?: string
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          active: boolean | null
          avatar_url: string | null
          created_at: string | null
          deleted_at: string | null
          device_platform: string | null
          email: string | null
          especialidad_registrada: string | null
          external_id: string | null
          fcm_token: string | null
          first_name: string | null
          last_name: string | null
          matricula_nacional: string | null
          newsletter_subscribed: boolean
          numeric_id: number
          onboarding_completed_at: string | null
          onboarding_started_at: string | null
          phone: string | null
          role: string | null
          sss_last_checked_at: string | null
          sss_validation_status: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          active?: boolean | null
          avatar_url?: string | null
          created_at?: string | null
          deleted_at?: string | null
          device_platform?: string | null
          email?: string | null
          especialidad_registrada?: string | null
          external_id?: string | null
          fcm_token?: string | null
          first_name?: string | null
          last_name?: string | null
          matricula_nacional?: string | null
          newsletter_subscribed?: boolean
          numeric_id?: number
          onboarding_completed_at?: string | null
          onboarding_started_at?: string | null
          phone?: string | null
          role?: string | null
          sss_last_checked_at?: string | null
          sss_validation_status?: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          active?: boolean | null
          avatar_url?: string | null
          created_at?: string | null
          deleted_at?: string | null
          device_platform?: string | null
          email?: string | null
          especialidad_registrada?: string | null
          external_id?: string | null
          fcm_token?: string | null
          first_name?: string | null
          last_name?: string | null
          matricula_nacional?: string | null
          newsletter_subscribed?: boolean
          numeric_id?: number
          onboarding_completed_at?: string | null
          onboarding_started_at?: string | null
          phone?: string | null
          role?: string | null
          sss_last_checked_at?: string | null
          sss_validation_status?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      psychiatry_intake_sections: {
        Row: {
          completed: boolean
          completed_at: string | null
          data: Json
          id: string
          intake_id: string
          phase: string
          section: string
          updated_at: string
        }
        Insert: {
          completed?: boolean
          completed_at?: string | null
          data?: Json
          id?: string
          intake_id: string
          phase: string
          section: string
          updated_at?: string
        }
        Update: {
          completed?: boolean
          completed_at?: string | null
          data?: Json
          id?: string
          intake_id?: string
          phase?: string
          section?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "psychiatry_intake_sections_intake_id_fkey"
            columns: ["intake_id"]
            isOneToOne: false
            referencedRelation: "psychiatry_intakes"
            referencedColumns: ["id"]
          },
        ]
      }
      psychiatry_intakes: {
        Row: {
          completed_at: string | null
          completion_percentage: number
          created_at: string
          deleted_at: string | null
          id: string
          last_phase: string
          locked: boolean
          patient_id: string
          privacy_accepted: boolean
          sections_status: Json
          status: string
          terms_accepted: boolean
          treatment_context: string
          updated_at: string
        }
        Insert: {
          completed_at?: string | null
          completion_percentage?: number
          created_at?: string
          deleted_at?: string | null
          id?: string
          last_phase?: string
          locked?: boolean
          patient_id: string
          privacy_accepted?: boolean
          sections_status?: Json
          status?: string
          terms_accepted?: boolean
          treatment_context?: string
          updated_at?: string
        }
        Update: {
          completed_at?: string | null
          completion_percentage?: number
          created_at?: string
          deleted_at?: string | null
          id?: string
          last_phase?: string
          locked?: boolean
          patient_id?: string
          privacy_accepted?: boolean
          sections_status?: Json
          status?: string
          terms_accepted?: boolean
          treatment_context?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "psychiatry_intakes_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: true
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      renpre_registrations: {
        Row: {
          certificate_pdf_url: string | null
          created_at: string
          doctor_id: string
          rejection_reason: string | null
          renpre_number: string
          status: string
          updated_at: string
          valid_from: string
          valid_until: string
          verified_at: string | null
          verified_by_admin_id: string | null
        }
        Insert: {
          certificate_pdf_url?: string | null
          created_at?: string
          doctor_id: string
          rejection_reason?: string | null
          renpre_number: string
          status?: string
          updated_at?: string
          valid_from: string
          valid_until: string
          verified_at?: string | null
          verified_by_admin_id?: string | null
        }
        Update: {
          certificate_pdf_url?: string | null
          created_at?: string
          doctor_id?: string
          rejection_reason?: string | null
          renpre_number?: string
          status?: string
          updated_at?: string
          valid_from?: string
          valid_until?: string
          verified_at?: string | null
          verified_by_admin_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "renpre_registrations_doctor_id_fkey"
            columns: ["doctor_id"]
            isOneToOne: true
            referencedRelation: "doctors"
            referencedColumns: ["id"]
          },
        ]
      }
      reproductive_health_appointments: {
        Row: {
          consultation_type: string
          created_at: string
          duration_minutes: number
          id: string
          is_first_consultation: boolean
          meeting_url: string | null
          modality: string
          notes_for_doctor: string | null
          patient_id: string
          preferred_language: string
          requires_interpreter: boolean
          scheduled_at: string
          specialist_id: string
          status: string
          updated_at: string
        }
        Insert: {
          consultation_type: string
          created_at?: string
          duration_minutes?: number
          id?: string
          is_first_consultation?: boolean
          meeting_url?: string | null
          modality: string
          notes_for_doctor?: string | null
          patient_id: string
          preferred_language?: string
          requires_interpreter?: boolean
          scheduled_at: string
          specialist_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          consultation_type?: string
          created_at?: string
          duration_minutes?: number
          id?: string
          is_first_consultation?: boolean
          meeting_url?: string | null
          modality?: string
          notes_for_doctor?: string | null
          patient_id?: string
          preferred_language?: string
          requires_interpreter?: boolean
          scheduled_at?: string
          specialist_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "reproductive_health_appointments_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reproductive_health_appointments_specialist_id_fkey"
            columns: ["specialist_id"]
            isOneToOne: false
            referencedRelation: "reproductive_health_specialists"
            referencedColumns: ["id"]
          },
        ]
      }
      reproductive_health_specialists: {
        Row: {
          accepts_emergency_consultations: boolean
          availability_status: string
          bio: string
          created_at: string
          doctor_id: string
          id: string
          is_certified_ive_ile: boolean
          languages: string[]
          rating: number
          specialty: string
          total_consultations: number
          updated_at: string
          years_of_experience: number
        }
        Insert: {
          accepts_emergency_consultations?: boolean
          availability_status?: string
          bio: string
          created_at?: string
          doctor_id: string
          id?: string
          is_certified_ive_ile?: boolean
          languages?: string[]
          rating?: number
          specialty: string
          total_consultations?: number
          updated_at?: string
          years_of_experience: number
        }
        Update: {
          accepts_emergency_consultations?: boolean
          availability_status?: string
          bio?: string
          created_at?: string
          doctor_id?: string
          id?: string
          is_certified_ive_ile?: boolean
          languages?: string[]
          rating?: number
          specialty?: string
          total_consultations?: number
          updated_at?: string
          years_of_experience?: number
        }
        Relationships: [
          {
            foreignKeyName: "reproductive_health_specialists_doctor_id_fkey"
            columns: ["doctor_id"]
            isOneToOne: true
            referencedRelation: "doctors"
            referencedColumns: ["id"]
          },
        ]
      }
      shipment_events: {
        Row: {
          created_at: string
          description: string | null
          event_time: string
          event_type: string
          id: string
          location: string | null
          raw_webhook: Json | null
          shipment_id: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          event_time: string
          event_type: string
          id?: string
          location?: string | null
          raw_webhook?: Json | null
          shipment_id: string
        }
        Update: {
          created_at?: string
          description?: string | null
          event_time?: string
          event_type?: string
          id?: string
          location?: string | null
          raw_webhook?: Json | null
          shipment_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "shipment_events_shipment_id_fkey"
            columns: ["shipment_id"]
            isOneToOne: false
            referencedRelation: "shipments"
            referencedColumns: ["id"]
          },
        ]
      }
      shipments: {
        Row: {
          cost_ars: number | null
          courier: string
          courier_order_id: string | null
          created_at: string
          delivered_at: string | null
          delivery_proof_url: string | null
          dispensation_order_id: string
          estimated_delivery_at: string | null
          id: string
          label_pdf_url: string | null
          metadata: Json
          recipient_address: Json
          recipient_name: string
          recipient_phone: string
          service_level: string
          signed_by: string | null
          status: string
          tracking_number: string | null
          updated_at: string
        }
        Insert: {
          cost_ars?: number | null
          courier: string
          courier_order_id?: string | null
          created_at?: string
          delivered_at?: string | null
          delivery_proof_url?: string | null
          dispensation_order_id: string
          estimated_delivery_at?: string | null
          id?: string
          label_pdf_url?: string | null
          metadata?: Json
          recipient_address: Json
          recipient_name: string
          recipient_phone: string
          service_level?: string
          signed_by?: string | null
          status?: string
          tracking_number?: string | null
          updated_at?: string
        }
        Update: {
          cost_ars?: number | null
          courier?: string
          courier_order_id?: string | null
          created_at?: string
          delivered_at?: string | null
          delivery_proof_url?: string | null
          dispensation_order_id?: string
          estimated_delivery_at?: string | null
          id?: string
          label_pdf_url?: string | null
          metadata?: Json
          recipient_address?: Json
          recipient_name?: string
          recipient_phone?: string
          service_level?: string
          signed_by?: string | null
          status?: string
          tracking_number?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "shipments_dispensation_order_id_fkey"
            columns: ["dispensation_order_id"]
            isOneToOne: false
            referencedRelation: "dispensation_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      signature_certificates: {
        Row: {
          ac_provider: string
          cert_fingerprint: string
          cert_status: string
          cert_subject: string
          cert_valid_from: string
          cert_valid_until: string
          created_at: string
          doctor_id: string
          id: string
          signature_method: string
          updated_at: string
        }
        Insert: {
          ac_provider: string
          cert_fingerprint: string
          cert_status?: string
          cert_subject: string
          cert_valid_from: string
          cert_valid_until: string
          created_at?: string
          doctor_id: string
          id?: string
          signature_method?: string
          updated_at?: string
        }
        Update: {
          ac_provider?: string
          cert_fingerprint?: string
          cert_status?: string
          cert_subject?: string
          cert_valid_from?: string
          cert_valid_until?: string
          created_at?: string
          doctor_id?: string
          id?: string
          signature_method?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "signature_certificates_doctor_id_fkey"
            columns: ["doctor_id"]
            isOneToOne: false
            referencedRelation: "doctors"
            referencedColumns: ["id"]
          },
        ]
      }
      spatial_ref_sys: {
        Row: {
          auth_name: string | null
          auth_srid: number | null
          proj4text: string | null
          srid: number
          srtext: string | null
        }
        Insert: {
          auth_name?: string | null
          auth_srid?: number | null
          proj4text?: string | null
          srid: number
          srtext?: string | null
        }
        Update: {
          auth_name?: string | null
          auth_srid?: number | null
          proj4text?: string | null
          srid?: number
          srtext?: string | null
        }
        Relationships: []
      }
      subscription_plans: {
        Row: {
          active: boolean
          created_at: string
          currency: string
          features: Json
          id: string
          interval: string
          name: string
          price_cents: number
          slug: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          currency?: string
          features?: Json
          id?: string
          interval?: string
          name: string
          price_cents: number
          slug: string
        }
        Update: {
          active?: boolean
          created_at?: string
          currency?: string
          features?: Json
          id?: string
          interval?: string
          name?: string
          price_cents?: number
          slug?: string
        }
        Relationships: []
      }
      symptom_reports: {
        Row: {
          body_location: string | null
          created_at: string
          deleted_at: string | null
          description: string | null
          duration: string | null
          frequency: string | null
          id: string
          is_urgent: boolean
          patient_id: string
          reported_at: string
          reported_by_id: string | null
          severity: number
          symptom_name: string
          triggers: string | null
          updated_at: string
        }
        Insert: {
          body_location?: string | null
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          duration?: string | null
          frequency?: string | null
          id?: string
          is_urgent?: boolean
          patient_id: string
          reported_at?: string
          reported_by_id?: string | null
          severity: number
          symptom_name: string
          triggers?: string | null
          updated_at?: string
        }
        Update: {
          body_location?: string | null
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          duration?: string | null
          frequency?: string | null
          id?: string
          is_urgent?: boolean
          patient_id?: string
          reported_at?: string
          reported_by_id?: string | null
          severity?: number
          symptom_name?: string
          triggers?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "symptom_reports_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      telemedicine_room_participants: {
        Row: {
          avg_bitrate: number | null
          avg_latency: number | null
          avg_packet_loss: number | null
          created_at: string | null
          id: string
          joined_at: string | null
          left_at: string | null
          role: string
          room_id: string
          user_id: string
        }
        Insert: {
          avg_bitrate?: number | null
          avg_latency?: number | null
          avg_packet_loss?: number | null
          created_at?: string | null
          id?: string
          joined_at?: string | null
          left_at?: string | null
          role: string
          room_id: string
          user_id: string
        }
        Update: {
          avg_bitrate?: number | null
          avg_latency?: number | null
          avg_packet_loss?: number | null
          created_at?: string | null
          id?: string
          joined_at?: string | null
          left_at?: string | null
          role?: string
          room_id?: string
          user_id?: string
        }
        Relationships: []
      }
      telemedicine_sessions: {
        Row: {
          appointment_id: string | null
          created_at: string | null
          doctor_id: string
          doctor_profile_id: string | null
          duration_seconds: number | null
          ended_at: string | null
          id: string
          notes: string | null
          patient_id: string
          patient_profile_id: string | null
          recording_url: string | null
          room_id: string | null
          scheduled_at: string | null
          started_at: string | null
          status: string
          updated_at: string | null
        }
        Insert: {
          appointment_id?: string | null
          created_at?: string | null
          doctor_id: string
          doctor_profile_id?: string | null
          duration_seconds?: number | null
          ended_at?: string | null
          id?: string
          notes?: string | null
          patient_id: string
          patient_profile_id?: string | null
          recording_url?: string | null
          room_id?: string | null
          scheduled_at?: string | null
          started_at?: string | null
          status?: string
          updated_at?: string | null
        }
        Update: {
          appointment_id?: string | null
          created_at?: string | null
          doctor_id?: string
          doctor_profile_id?: string | null
          duration_seconds?: number | null
          ended_at?: string | null
          id?: string
          notes?: string | null
          patient_id?: string
          patient_profile_id?: string | null
          recording_url?: string | null
          room_id?: string | null
          scheduled_at?: string | null
          started_at?: string | null
          status?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "telemedicine_sessions_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "telemedicine_sessions_doctor_profile_fk"
            columns: ["doctor_profile_id"]
            isOneToOne: false
            referencedRelation: "doctors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "telemedicine_sessions_patient_profile_fk"
            columns: ["patient_profile_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      terminology_code_map: {
        Row: {
          concept_name: string
          created_at: string | null
          id: string
          source_code: string
          system_source: string
          system_target: string
          target_code: string
        }
        Insert: {
          concept_name: string
          created_at?: string | null
          id?: string
          source_code: string
          system_source: string
          system_target: string
          target_code: string
        }
        Update: {
          concept_name?: string
          created_at?: string | null
          id?: string
          source_code?: string
          system_source?: string
          system_target?: string
          target_code?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          expires_at: string | null
          granted_at: string
          granted_by: string | null
          id: string
          metadata: Json
          organization_id: string | null
          profile_id: string
          role: string
        }
        Insert: {
          expires_at?: string | null
          granted_at?: string
          granted_by?: string | null
          id?: string
          metadata?: Json
          organization_id?: string | null
          profile_id: string
          role: string
        }
        Update: {
          expires_at?: string | null
          granted_at?: string
          granted_by?: string | null
          id?: string
          metadata?: Json
          organization_id?: string | null
          profile_id?: string
          role?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_roles_granted_by_fkey"
            columns: ["granted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "user_roles_granted_by_fkey"
            columns: ["granted_by"]
            isOneToOne: false
            referencedRelation: "user_identifiers"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "user_roles_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_roles_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "user_roles_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "user_identifiers"
            referencedColumns: ["user_id"]
          },
        ]
      }
      vital_signs: {
        Row: {
          blood_pressure_diastolic: number | null
          blood_pressure_systolic: number | null
          bmi: number | null
          created_at: string
          deleted_at: string | null
          heart_rate: number | null
          height: number | null
          id: string
          measured_at: string
          measurement_context: string
          notes: string | null
          oxygen_saturation: number | null
          pain_scale: number | null
          patient_id: string
          recorded_at: string
          recorded_by_id: string | null
          respiratory_rate: number | null
          temperature: number | null
          type: string
          unit: string | null
          updated_at: string
          weight: number | null
        }
        Insert: {
          blood_pressure_diastolic?: number | null
          blood_pressure_systolic?: number | null
          bmi?: number | null
          created_at?: string
          deleted_at?: string | null
          heart_rate?: number | null
          height?: number | null
          id?: string
          measured_at?: string
          measurement_context?: string
          notes?: string | null
          oxygen_saturation?: number | null
          pain_scale?: number | null
          patient_id: string
          recorded_at?: string
          recorded_by_id?: string | null
          respiratory_rate?: number | null
          temperature?: number | null
          type?: string
          unit?: string | null
          updated_at?: string
          weight?: number | null
        }
        Update: {
          blood_pressure_diastolic?: number | null
          blood_pressure_systolic?: number | null
          bmi?: number | null
          created_at?: string
          deleted_at?: string | null
          heart_rate?: number | null
          height?: number | null
          id?: string
          measured_at?: string
          measurement_context?: string
          notes?: string | null
          oxygen_saturation?: number | null
          pain_scale?: number | null
          patient_id?: string
          recorded_at?: string
          recorded_by_id?: string | null
          respiratory_rate?: number | null
          temperature?: number | null
          type?: string
          unit?: string | null
          updated_at?: string
          weight?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "vital_signs_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_peer_activity: {
        Row: {
          account_id: string
          channel: string
          last_human_outbound_at: string
          peer: string
          updated_at: string
        }
        Insert: {
          account_id: string
          channel?: string
          last_human_outbound_at: string
          peer: string
          updated_at?: string
        }
        Update: {
          account_id?: string
          channel?: string
          last_human_outbound_at?: string
          peer?: string
          updated_at?: string
        }
        Relationships: []
      }
      whatsapp_triage_sessions: {
        Row: {
          answers: Json
          created_at: string
          current_question: number
          id: number
          last_activity_at: string
          patient_name: string
          patient_phone: string
          session_id: string
          started_at: string
          status: string
          updated_at: string
        }
        Insert: {
          answers?: Json
          created_at?: string
          current_question?: number
          id?: number
          last_activity_at?: string
          patient_name?: string
          patient_phone: string
          session_id: string
          started_at?: string
          status?: string
          updated_at?: string
        }
        Update: {
          answers?: Json
          created_at?: string
          current_question?: number
          id?: number
          last_activity_at?: string
          patient_name?: string
          patient_phone?: string
          session_id?: string
          started_at?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      analytics_appointments: {
        Row: {
          appointment_date: string | null
          appointment_hour: number | null
          appointment_status: string | null
          appointment_type: string | null
          doctor_key: string | null
          duration_minutes: number | null
          is_cancelled: boolean | null
          is_completed: boolean | null
          is_no_show: boolean | null
          patient_key: string | null
        }
        Insert: {
          appointment_date?: never
          appointment_hour?: never
          appointment_status?: never
          appointment_type?: never
          doctor_key?: never
          duration_minutes?: number | null
          is_cancelled?: never
          is_completed?: never
          is_no_show?: never
          patient_key?: never
        }
        Update: {
          appointment_date?: never
          appointment_hour?: never
          appointment_status?: never
          appointment_type?: never
          doctor_key?: never
          duration_minutes?: number | null
          is_cancelled?: never
          is_completed?: never
          is_no_show?: never
          patient_key?: never
        }
        Relationships: []
      }
      analytics_clinical_triage_cases: {
        Row: {
          case_created_date: string | null
          case_intent: string | null
          case_updated_date: string | null
          clinical_vertical: string | null
          conflicted_field_count: number | null
          has_assigned_doctor: boolean | null
          integrity_score: number | null
          integrity_status: string | null
          locked_field_count: number | null
          missing_field_count: number | null
          patient_key: string | null
          requires_same_day_action: boolean | null
          resolution_deadline_date: string | null
          resolved_date: string | null
          risk_of_interruption: string | null
          triage_priority: string | null
          triage_priority_rank: number | null
          triage_status: string | null
          workflow_type: string | null
        }
        Insert: {
          case_created_date?: never
          case_intent?: string | null
          case_updated_date?: never
          clinical_vertical?: string | null
          conflicted_field_count?: number | null
          has_assigned_doctor?: never
          integrity_score?: number | null
          integrity_status?: string | null
          locked_field_count?: number | null
          missing_field_count?: number | null
          patient_key?: never
          requires_same_day_action?: never
          resolution_deadline_date?: never
          resolved_date?: never
          risk_of_interruption?: never
          triage_priority?: string | null
          triage_priority_rank?: number | null
          triage_status?: string | null
          workflow_type?: string | null
        }
        Update: {
          case_created_date?: never
          case_intent?: string | null
          case_updated_date?: never
          clinical_vertical?: string | null
          conflicted_field_count?: number | null
          has_assigned_doctor?: never
          integrity_score?: number | null
          integrity_status?: string | null
          locked_field_count?: number | null
          missing_field_count?: number | null
          patient_key?: never
          requires_same_day_action?: never
          resolution_deadline_date?: never
          resolved_date?: never
          risk_of_interruption?: never
          triage_priority?: string | null
          triage_priority_rank?: number | null
          triage_status?: string | null
          workflow_type?: string | null
        }
        Relationships: []
      }
      analytics_patient_data_quality: {
        Row: {
          age_band: string | null
          expected_demographic_field_count: number | null
          has_birth_date: boolean | null
          has_gender: boolean | null
          has_insurance_info: boolean | null
          has_phone: boolean | null
          missing_demographic_field_count: number | null
          organization_id: string | null
          patient_created_date: string | null
          patient_key: string | null
        }
        Relationships: [
          {
            foreignKeyName: "patients_company_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      analytics_whatsapp_triage_results: {
        Row: {
          ai_processed: boolean | null
          ai_severity: string | null
          alert_count: number | null
          covered_area_count: number | null
          missing_area_count: number | null
          patient_key: string | null
          result_created_date: string | null
          safety_flag_count: number | null
          source: string | null
        }
        Insert: {
          ai_processed?: never
          ai_severity?: never
          alert_count?: never
          covered_area_count?: never
          missing_area_count?: never
          patient_key?: never
          result_created_date?: never
          safety_flag_count?: never
          source?: string | null
        }
        Update: {
          ai_processed?: never
          ai_severity?: never
          alert_count?: never
          covered_area_count?: never
          missing_area_count?: never
          patient_key?: never
          result_created_date?: never
          safety_flag_count?: never
          source?: string | null
        }
        Relationships: []
      }
      clinical_gold_seasonal_metrics: {
        Row: {
          case_count: number | null
          icd11_code: string | null
          season: string | null
          snomed_code: string | null
          symptom_name: string | null
        }
        Relationships: []
      }
      geography_columns: {
        Row: {
          coord_dimension: number | null
          f_geography_column: unknown
          f_table_catalog: unknown
          f_table_name: unknown
          f_table_schema: unknown
          srid: number | null
          type: string | null
        }
        Relationships: []
      }
      geometry_columns: {
        Row: {
          coord_dimension: number | null
          f_geometry_column: unknown
          f_table_catalog: string | null
          f_table_name: unknown
          f_table_schema: unknown
          srid: number | null
          type: string | null
        }
        Insert: {
          coord_dimension?: number | null
          f_geometry_column?: unknown
          f_table_catalog?: string | null
          f_table_name?: unknown
          f_table_schema?: unknown
          srid?: number | null
          type?: string | null
        }
        Update: {
          coord_dimension?: number | null
          f_geometry_column?: unknown
          f_table_catalog?: string | null
          f_table_name?: unknown
          f_table_schema?: unknown
          srid?: number | null
          type?: string | null
        }
        Relationships: []
      }
      telemedicine_sessions_canonical: {
        Row: {
          appointment_id: string | null
          canonical_doctor_id: string | null
          canonical_patient_id: string | null
          created_at: string | null
          doctor_id: string | null
          doctor_profile_id: string | null
          duration_seconds: number | null
          ended_at: string | null
          id: string | null
          notes: string | null
          patient_id: string | null
          patient_profile_id: string | null
          recording_url: string | null
          room_id: string | null
          scheduled_at: string | null
          started_at: string | null
          status: string | null
          updated_at: string | null
        }
        Relationships: [
          {
            foreignKeyName: "telemedicine_sessions_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "telemedicine_sessions_doctor_profile_fk"
            columns: ["doctor_profile_id"]
            isOneToOne: false
            referencedRelation: "doctors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "telemedicine_sessions_patient_profile_fk"
            columns: ["patient_profile_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      user_identifiers: {
        Row: {
          display_id: string | null
          email: string | null
          numeric_id: number | null
          profile_created_at: string | null
          role: string | null
          user_id: string | null
        }
        Insert: {
          display_id?: never
          email?: string | null
          numeric_id?: number | null
          profile_created_at?: string | null
          role?: string | null
          user_id?: string | null
        }
        Update: {
          display_id?: never
          email?: string | null
          numeric_id?: number | null
          profile_created_at?: string | null
          role?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      v_db_health: {
        Row: {
          audit_entries_24h: number | null
          checked_at: string | null
          public_tables: number | null
          storage_buckets: number | null
          tables_with_rls: number | null
          total_policies: number | null
        }
        Relationships: []
      }
      v_patient_demographics: {
        Row: {
          age_group: string | null
          count: number | null
          gender: string | null
          insurance_name: string | null
          region: string | null
          total_active_patients: number | null
        }
        Relationships: []
      }
    }
    Functions: {
      _postgis_deprecate: {
        Args: { newname: string; oldname: string; version: string }
        Returns: undefined
      }
      _postgis_index_extent: {
        Args: { col: string; tbl: unknown }
        Returns: unknown
      }
      _postgis_pgsql_version: { Args: never; Returns: string }
      _postgis_scripts_pgsql_version: { Args: never; Returns: string }
      _postgis_selectivity: {
        Args: { att_name: string; geom: unknown; mode?: string; tbl: unknown }
        Returns: number
      }
      _postgis_stats: {
        Args: { ""?: string; att_name: string; tbl: unknown }
        Returns: string
      }
      _st_3dintersects: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      _st_contains: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      _st_containsproperly: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      _st_coveredby:
        | { Args: { geog1: unknown; geog2: unknown }; Returns: boolean }
        | { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      _st_covers:
        | { Args: { geog1: unknown; geog2: unknown }; Returns: boolean }
        | { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      _st_crosses: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      _st_dwithin: {
        Args: {
          geog1: unknown
          geog2: unknown
          tolerance: number
          use_spheroid?: boolean
        }
        Returns: boolean
      }
      _st_equals: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      _st_intersects: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      _st_linecrossingdirection: {
        Args: { line1: unknown; line2: unknown }
        Returns: number
      }
      _st_longestline: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      _st_maxdistance: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      _st_orderingequals: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      _st_overlaps: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      _st_sortablehash: { Args: { geom: unknown }; Returns: number }
      _st_touches: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      _st_voronoi: {
        Args: {
          clip?: unknown
          g1: unknown
          return_polygons?: boolean
          tolerance?: number
        }
        Returns: unknown
      }
      _st_within: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      add_to_care_team: {
        Args: {
          p_doctor_id: string
          p_notes?: string
          p_patient_id: string
          p_role?: string
        }
        Returns: string
      }
      addauth: { Args: { "": string }; Returns: boolean }
      addgeometrycolumn:
        | {
            Args: {
              catalog_name: string
              column_name: string
              new_dim: number
              new_srid_in: number
              new_type: string
              schema_name: string
              table_name: string
              use_typmod?: boolean
            }
            Returns: string
          }
        | {
            Args: {
              column_name: string
              new_dim: number
              new_srid: number
              new_type: string
              schema_name: string
              table_name: string
              use_typmod?: boolean
            }
            Returns: string
          }
        | {
            Args: {
              column_name: string
              new_dim: number
              new_srid: number
              new_type: string
              table_name: string
              use_typmod?: boolean
            }
            Returns: string
          }
      auto_delete_expired_recordings: { Args: never; Returns: undefined }
      auto_revoke_expired_authorizations: { Args: never; Returns: undefined }
      can_access_p2p_chat_session: {
        Args: { target_session_id: string }
        Returns: boolean
      }
      check_orphaned_profiles: {
        Args: never
        Returns: {
          out_email: string
          out_role: string
          out_user_id: string
        }[]
      }
      claim_next_topic: {
        Args: { p_claimed_by: string }
        Returns: unknown
        SetofOptions: {
          from: "*"
          to: "topic_queue"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      cleanup_stuck_conversation_sessions: {
        Args: { threshold_interval: string }
        Returns: Json
      }
      community_group_allowed_for_patient: {
        Args: { target_group_id: string; target_patient_id: string }
        Returns: boolean
      }
      create_call: {
        Args: {
          p_appointment_id?: string
          p_doctor_id: string
          p_patient_id: string
        }
        Returns: {
          appointment_id: string
          created_at: string
          doctor_id: string
          id: string
          patient_id: string
          room_id: string
          status: Database["public"]["Enums"]["call_status"]
        }[]
      }
      create_content_piece: {
        Args: {
          p_source_ref: string
          p_status?: string
          p_target_channels: string[]
          p_topic: string
          p_variants: Json
        }
        Returns: string
      }
      create_patient_alert: {
        Args: {
          p_created_by_id?: string
          p_message: string
          p_metadata?: Json
          p_patient_id: string
          p_severity: string
          p_source_record_id: string
          p_source_table: string
          p_title: string
        }
        Returns: string
      }
      current_doctor_profile_id: { Args: never; Returns: string }
      current_patient_can_access_community_group: {
        Args: { target_group_id: string }
        Returns: boolean
      }
      current_patient_owns_community_post: {
        Args: { target_post_id: string }
        Returns: boolean
      }
      current_pharmacist_id: { Args: never; Returns: string }
      current_pharmacist_pharmacy_ids: { Args: never; Returns: string[] }
      detect_clinical_anomalies: {
        Args: never
        Returns: {
          historical_weekly_avg: number
          is_outbreak_warning: boolean
          last_week_count: number
          percent_increase: number
          snomed: string
          symptom: string
        }[]
      }
      disablelongtransactions: { Args: never; Returns: string }
      doctor_can_chat_with_patient: {
        Args: { target_doctor_id: string; target_patient_id: string }
        Returns: boolean
      }
      doctor_has_patient_access: {
        Args: { patient_user_id: string }
        Returns: boolean
      }
      dropgeometrycolumn:
        | {
            Args: {
              catalog_name: string
              column_name: string
              schema_name: string
              table_name: string
            }
            Returns: string
          }
        | {
            Args: {
              column_name: string
              schema_name: string
              table_name: string
            }
            Returns: string
          }
        | { Args: { column_name: string; table_name: string }; Returns: string }
      dropgeometrytable:
        | {
            Args: {
              catalog_name: string
              schema_name: string
              table_name: string
            }
            Returns: string
          }
        | { Args: { schema_name: string; table_name: string }; Returns: string }
        | { Args: { table_name: string }; Returns: string }
      enablelongtransactions: { Args: never; Returns: string }
      equals: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      evaluate_doctor_badges: {
        Args: { target_doctor_id: string }
        Returns: undefined
      }
      execute_sql_temp: { Args: { sql_query: string }; Returns: Json }
      find_nearby_health_centers: {
        Args: {
          max_results?: number
          radius_km?: number
          user_lat: number
          user_lng: number
        }
        Returns: {
          address: Json
          distance_km: number
          id: string
          name: string
          offers_medication_method: boolean
          offers_surgical_method: boolean
          phone: string
          type: string
        }[]
      }
      fn_cleanup_old_audit_logs: {
        Args: { retention_days?: number }
        Returns: number
      }
      format_user_id: {
        Args: { p_numeric_id: number; p_role: string }
        Returns: string
      }
      generate_external_id: { Args: { role_prefix: string }; Returns: string }
      geometry: { Args: { "": string }; Returns: unknown }
      geometry_above: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_below: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_cmp: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      geometry_contained_3d: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_contains: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_contains_3d: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_distance_box: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      geometry_distance_centroid: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      geometry_eq: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_ge: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_gt: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_le: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_left: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_lt: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_overabove: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_overbelow: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_overlaps: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_overlaps_3d: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_overleft: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_overright: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_right: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_same: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_same_3d: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_within: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geomfromewkt: { Args: { "": string }; Returns: unknown }
      get_assigned_chat_doctor: {
        Args: { target_patient_id: string }
        Returns: {
          doctor_id: string
          first_name: string
          last_name: string
          specialty: string
        }[]
      }
      get_content_mode: { Args: never; Returns: string }
      get_content_pieces_due: {
        Args: never
        Returns: {
          id: string
          status: string
          target_channels: string[]
          topic: string
          variants: Json
        }[]
      }
      get_doctor_online_minutes: {
        Args: { p_doctor_id: string; p_end_date: string; p_start_date: string }
        Returns: number
      }
      get_my_doctor_id: { Args: never; Returns: string }
      get_my_patient_id: { Args: never; Returns: string }
      get_next_numeric_id: { Args: never; Returns: number }
      get_or_create_p2p_chat_session: {
        Args: {
          target_case_id?: string
          target_doctor_id: string
          target_patient_id: string
        }
        Returns: {
          case_id: string
          channel: string
          doctor_id: string | null
          ended_at: string | null
          id: string
          patient_id: string
          started_at: string
          status: string
          workflow_type: string
        }
        SetofOptions: {
          from: "*"
          to: "conversation_sessions"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      get_recommended_screenings: {
        Args: { include_overdue?: boolean; patient_id_param: string }
        Returns: {
          category: string
          next_due_date: string
          reason: string
          screening_id: string
          screening_name: string
          status: string
          urgency: string
        }[]
      }
      get_user_audit_log: {
        Args: { p_limit?: number; p_user_id?: string }
        Returns: {
          created_at: string
          data: Json
          event: string
          id: number
        }[]
      }
      get_user_role: {
        Args: { target_user_id?: string }
        Returns: Database["public"]["Enums"]["user_role"]
      }
      gettransactionid: { Args: never; Returns: unknown }
      grant_medical_record_authorization: {
        Args: {
          p_authorized_user_id: string
          p_reason: string
          p_record_id: string
          p_valid_for_hours?: number
        }
        Returns: string
      }
      has_active_authorization: {
        Args: { p_record_id: string; p_user_id?: string }
        Returns: boolean
      }
      insert_geo_citation: {
        Args: {
          p_cited: boolean
          p_llm: string
          p_query: string
          p_response_excerpt?: string
        }
        Returns: number
      }
      is_channel_enabled: { Args: { ch: string }; Returns: boolean }
      is_company_admin: { Args: never; Returns: boolean }
      is_doctor: { Args: never; Returns: boolean }
      is_in_care_team: {
        Args: { p_doctor_id: string; p_patient_id: string }
        Returns: boolean
      }
      is_patient: { Args: never; Returns: boolean }
      is_platform_or_org_admin: { Args: { p_uid?: string }; Returns: boolean }
      is_system_admin: { Args: never; Returns: boolean }
      log_publish: {
        Args: {
          p_channel: string
          p_content_piece_id: string
          p_error_message?: string
          p_external_id?: string
          p_payload?: Json
          p_status?: string
        }
        Returns: number
      }
      longtransactionsenabled: { Args: never; Returns: boolean }
      mark_overdue_appointments_no_show: { Args: never; Returns: number }
      mark_overdue_screenings: { Args: never; Returns: number }
      populate_geometry_columns:
        | { Args: { tbl_oid: unknown; use_typmod?: boolean }; Returns: number }
        | { Args: { use_typmod?: boolean }; Returns: string }
      postgis_constraint_dims: {
        Args: { geomcolumn: string; geomschema: string; geomtable: string }
        Returns: number
      }
      postgis_constraint_srid: {
        Args: { geomcolumn: string; geomschema: string; geomtable: string }
        Returns: number
      }
      postgis_constraint_type: {
        Args: { geomcolumn: string; geomschema: string; geomtable: string }
        Returns: string
      }
      postgis_extensions_upgrade: { Args: never; Returns: string }
      postgis_full_version: { Args: never; Returns: string }
      postgis_geos_version: { Args: never; Returns: string }
      postgis_lib_build_date: { Args: never; Returns: string }
      postgis_lib_revision: { Args: never; Returns: string }
      postgis_lib_version: { Args: never; Returns: string }
      postgis_libjson_version: { Args: never; Returns: string }
      postgis_liblwgeom_version: { Args: never; Returns: string }
      postgis_libprotobuf_version: { Args: never; Returns: string }
      postgis_libxml_version: { Args: never; Returns: string }
      postgis_proj_version: { Args: never; Returns: string }
      postgis_scripts_build_date: { Args: never; Returns: string }
      postgis_scripts_installed: { Args: never; Returns: string }
      postgis_scripts_released: { Args: never; Returns: string }
      postgis_svn_version: { Args: never; Returns: string }
      postgis_type_name: {
        Args: {
          coord_dimension: number
          geomname: string
          use_new_name?: boolean
        }
        Returns: string
      }
      postgis_version: { Args: never; Returns: string }
      postgis_wagyu_version: { Args: never; Returns: string }
      recalculate_all_rankings: { Args: never; Returns: undefined }
      recalculate_doctor_metrics: {
        Args: { target_doctor_id: string }
        Returns: undefined
      }
      recalculate_doctor_ranking_positions: { Args: never; Returns: undefined }
      remove_from_care_team: {
        Args: { p_doctor_id: string; p_patient_id: string; p_role?: string }
        Returns: boolean
      }
      replace_weekly_availability: {
        Args: { p_doctor_id: string; p_rows: Json }
        Returns: {
          created_at: string
          day_of_week: number
          doctor_id: string
          end_time: string
          id: string
          is_active: boolean
          location: string | null
          slot_duration: number
          start_time: string
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "doctor_availability"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      resolve_topic: {
        Args: {
          p_content_piece_id?: string
          p_error_message?: string
          p_id: number
          p_status: string
        }
        Returns: undefined
      }
      revoke_medical_record_authorization: {
        Args: { p_authorization_id: string }
        Returns: boolean
      }
      schedule_appointment_reminders: {
        Args: { reminder_channel?: string; target_appointment_id: string }
        Returns: number
      }
      select_primary_role_for_profile: {
        Args: { target_profile_id: string }
        Returns: string
      }
      set_content_piece_status: {
        Args: { p_id: string; p_status: string }
        Returns: undefined
      }
      set_portal_and_role: {
        Args: { p_organization_id?: string; p_portal: string; p_role?: string }
        Returns: Json
      }
      set_user_role: {
        Args: { p_role: Database["public"]["Enums"]["user_role"] }
        Returns: undefined
      }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
      st_3dclosestpoint: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_3ddistance: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      st_3dintersects: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      st_3dlongestline: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_3dmakebox: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_3dmaxdistance: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      st_3dshortestline: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_addpoint: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_angle:
        | { Args: { line1: unknown; line2: unknown }; Returns: number }
        | {
            Args: { pt1: unknown; pt2: unknown; pt3: unknown; pt4?: unknown }
            Returns: number
          }
      st_area:
        | { Args: { geog: unknown; use_spheroid?: boolean }; Returns: number }
        | { Args: { "": string }; Returns: number }
      st_asencodedpolyline: {
        Args: { geom: unknown; nprecision?: number }
        Returns: string
      }
      st_asewkt: { Args: { "": string }; Returns: string }
      st_asgeojson:
        | {
            Args: { geog: unknown; maxdecimaldigits?: number; options?: number }
            Returns: string
          }
        | {
            Args: { geom: unknown; maxdecimaldigits?: number; options?: number }
            Returns: string
          }
        | {
            Args: {
              geom_column?: string
              maxdecimaldigits?: number
              pretty_bool?: boolean
              r: Record<string, unknown>
            }
            Returns: string
          }
        | { Args: { "": string }; Returns: string }
      st_asgml:
        | {
            Args: {
              geog: unknown
              id?: string
              maxdecimaldigits?: number
              nprefix?: string
              options?: number
            }
            Returns: string
          }
        | {
            Args: { geom: unknown; maxdecimaldigits?: number; options?: number }
            Returns: string
          }
        | { Args: { "": string }; Returns: string }
        | {
            Args: {
              geog: unknown
              id?: string
              maxdecimaldigits?: number
              nprefix?: string
              options?: number
              version: number
            }
            Returns: string
          }
        | {
            Args: {
              geom: unknown
              id?: string
              maxdecimaldigits?: number
              nprefix?: string
              options?: number
              version: number
            }
            Returns: string
          }
      st_askml:
        | {
            Args: { geog: unknown; maxdecimaldigits?: number; nprefix?: string }
            Returns: string
          }
        | {
            Args: { geom: unknown; maxdecimaldigits?: number; nprefix?: string }
            Returns: string
          }
        | { Args: { "": string }; Returns: string }
      st_aslatlontext: {
        Args: { geom: unknown; tmpl?: string }
        Returns: string
      }
      st_asmarc21: { Args: { format?: string; geom: unknown }; Returns: string }
      st_asmvtgeom: {
        Args: {
          bounds: unknown
          buffer?: number
          clip_geom?: boolean
          extent?: number
          geom: unknown
        }
        Returns: unknown
      }
      st_assvg:
        | {
            Args: { geog: unknown; maxdecimaldigits?: number; rel?: number }
            Returns: string
          }
        | {
            Args: { geom: unknown; maxdecimaldigits?: number; rel?: number }
            Returns: string
          }
        | { Args: { "": string }; Returns: string }
      st_astext: { Args: { "": string }; Returns: string }
      st_astwkb:
        | {
            Args: {
              geom: unknown
              prec?: number
              prec_m?: number
              prec_z?: number
              with_boxes?: boolean
              with_sizes?: boolean
            }
            Returns: string
          }
        | {
            Args: {
              geom: unknown[]
              ids: number[]
              prec?: number
              prec_m?: number
              prec_z?: number
              with_boxes?: boolean
              with_sizes?: boolean
            }
            Returns: string
          }
      st_asx3d: {
        Args: { geom: unknown; maxdecimaldigits?: number; options?: number }
        Returns: string
      }
      st_azimuth:
        | { Args: { geog1: unknown; geog2: unknown }; Returns: number }
        | { Args: { geom1: unknown; geom2: unknown }; Returns: number }
      st_boundingdiagonal: {
        Args: { fits?: boolean; geom: unknown }
        Returns: unknown
      }
      st_buffer:
        | {
            Args: { geom: unknown; options?: string; radius: number }
            Returns: unknown
          }
        | {
            Args: { geom: unknown; quadsegs: number; radius: number }
            Returns: unknown
          }
      st_centroid: { Args: { "": string }; Returns: unknown }
      st_clipbybox2d: {
        Args: { box: unknown; geom: unknown }
        Returns: unknown
      }
      st_closestpoint: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_collect: { Args: { geom1: unknown; geom2: unknown }; Returns: unknown }
      st_concavehull: {
        Args: {
          param_allow_holes?: boolean
          param_geom: unknown
          param_pctconvex: number
        }
        Returns: unknown
      }
      st_contains: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      st_containsproperly: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      st_coorddim: { Args: { geometry: unknown }; Returns: number }
      st_coveredby:
        | { Args: { geog1: unknown; geog2: unknown }; Returns: boolean }
        | { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      st_covers:
        | { Args: { geog1: unknown; geog2: unknown }; Returns: boolean }
        | { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      st_crosses: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      st_curvetoline: {
        Args: { flags?: number; geom: unknown; tol?: number; toltype?: number }
        Returns: unknown
      }
      st_delaunaytriangles: {
        Args: { flags?: number; g1: unknown; tolerance?: number }
        Returns: unknown
      }
      st_difference: {
        Args: { geom1: unknown; geom2: unknown; gridsize?: number }
        Returns: unknown
      }
      st_disjoint: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      st_distance:
        | {
            Args: { geog1: unknown; geog2: unknown; use_spheroid?: boolean }
            Returns: number
          }
        | { Args: { geom1: unknown; geom2: unknown }; Returns: number }
      st_distancesphere:
        | { Args: { geom1: unknown; geom2: unknown }; Returns: number }
        | {
            Args: { geom1: unknown; geom2: unknown; radius: number }
            Returns: number
          }
      st_distancespheroid: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      st_dwithin: {
        Args: {
          geog1: unknown
          geog2: unknown
          tolerance: number
          use_spheroid?: boolean
        }
        Returns: boolean
      }
      st_equals: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      st_expand:
        | { Args: { box: unknown; dx: number; dy: number }; Returns: unknown }
        | {
            Args: { box: unknown; dx: number; dy: number; dz?: number }
            Returns: unknown
          }
        | {
            Args: {
              dm?: number
              dx: number
              dy: number
              dz?: number
              geom: unknown
            }
            Returns: unknown
          }
      st_force3d: { Args: { geom: unknown; zvalue?: number }; Returns: unknown }
      st_force3dm: {
        Args: { geom: unknown; mvalue?: number }
        Returns: unknown
      }
      st_force3dz: {
        Args: { geom: unknown; zvalue?: number }
        Returns: unknown
      }
      st_force4d: {
        Args: { geom: unknown; mvalue?: number; zvalue?: number }
        Returns: unknown
      }
      st_generatepoints:
        | { Args: { area: unknown; npoints: number }; Returns: unknown }
        | {
            Args: { area: unknown; npoints: number; seed: number }
            Returns: unknown
          }
      st_geogfromtext: { Args: { "": string }; Returns: unknown }
      st_geographyfromtext: { Args: { "": string }; Returns: unknown }
      st_geohash:
        | { Args: { geog: unknown; maxchars?: number }; Returns: string }
        | { Args: { geom: unknown; maxchars?: number }; Returns: string }
      st_geomcollfromtext: { Args: { "": string }; Returns: unknown }
      st_geometricmedian: {
        Args: {
          fail_if_not_converged?: boolean
          g: unknown
          max_iter?: number
          tolerance?: number
        }
        Returns: unknown
      }
      st_geometryfromtext: { Args: { "": string }; Returns: unknown }
      st_geomfromewkt: { Args: { "": string }; Returns: unknown }
      st_geomfromgeojson:
        | { Args: { "": Json }; Returns: unknown }
        | { Args: { "": Json }; Returns: unknown }
        | { Args: { "": string }; Returns: unknown }
      st_geomfromgml: { Args: { "": string }; Returns: unknown }
      st_geomfromkml: { Args: { "": string }; Returns: unknown }
      st_geomfrommarc21: { Args: { marc21xml: string }; Returns: unknown }
      st_geomfromtext: { Args: { "": string }; Returns: unknown }
      st_gmltosql: { Args: { "": string }; Returns: unknown }
      st_hasarc: { Args: { geometry: unknown }; Returns: boolean }
      st_hausdorffdistance: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      st_hexagon: {
        Args: { cell_i: number; cell_j: number; origin?: unknown; size: number }
        Returns: unknown
      }
      st_hexagongrid: {
        Args: { bounds: unknown; size: number }
        Returns: Record<string, unknown>[]
      }
      st_interpolatepoint: {
        Args: { line: unknown; point: unknown }
        Returns: number
      }
      st_intersection: {
        Args: { geom1: unknown; geom2: unknown; gridsize?: number }
        Returns: unknown
      }
      st_intersects:
        | { Args: { geog1: unknown; geog2: unknown }; Returns: boolean }
        | { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      st_isvaliddetail: {
        Args: { flags?: number; geom: unknown }
        Returns: Database["public"]["CompositeTypes"]["valid_detail"]
        SetofOptions: {
          from: "*"
          to: "valid_detail"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      st_length:
        | { Args: { geog: unknown; use_spheroid?: boolean }; Returns: number }
        | { Args: { "": string }; Returns: number }
      st_letters: { Args: { font?: Json; letters: string }; Returns: unknown }
      st_linecrossingdirection: {
        Args: { line1: unknown; line2: unknown }
        Returns: number
      }
      st_linefromencodedpolyline: {
        Args: { nprecision?: number; txtin: string }
        Returns: unknown
      }
      st_linefromtext: { Args: { "": string }; Returns: unknown }
      st_linelocatepoint: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      st_linetocurve: { Args: { geometry: unknown }; Returns: unknown }
      st_locatealong: {
        Args: { geometry: unknown; leftrightoffset?: number; measure: number }
        Returns: unknown
      }
      st_locatebetween: {
        Args: {
          frommeasure: number
          geometry: unknown
          leftrightoffset?: number
          tomeasure: number
        }
        Returns: unknown
      }
      st_locatebetweenelevations: {
        Args: { fromelevation: number; geometry: unknown; toelevation: number }
        Returns: unknown
      }
      st_longestline: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_makebox2d: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_makeline: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_makevalid: {
        Args: { geom: unknown; params: string }
        Returns: unknown
      }
      st_maxdistance: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      st_minimumboundingcircle: {
        Args: { inputgeom: unknown; segs_per_quarter?: number }
        Returns: unknown
      }
      st_mlinefromtext: { Args: { "": string }; Returns: unknown }
      st_mpointfromtext: { Args: { "": string }; Returns: unknown }
      st_mpolyfromtext: { Args: { "": string }; Returns: unknown }
      st_multilinestringfromtext: { Args: { "": string }; Returns: unknown }
      st_multipointfromtext: { Args: { "": string }; Returns: unknown }
      st_multipolygonfromtext: { Args: { "": string }; Returns: unknown }
      st_node: { Args: { g: unknown }; Returns: unknown }
      st_normalize: { Args: { geom: unknown }; Returns: unknown }
      st_offsetcurve: {
        Args: { distance: number; line: unknown; params?: string }
        Returns: unknown
      }
      st_orderingequals: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      st_overlaps: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      st_perimeter: {
        Args: { geog: unknown; use_spheroid?: boolean }
        Returns: number
      }
      st_pointfromtext: { Args: { "": string }; Returns: unknown }
      st_pointm: {
        Args: {
          mcoordinate: number
          srid?: number
          xcoordinate: number
          ycoordinate: number
        }
        Returns: unknown
      }
      st_pointz: {
        Args: {
          srid?: number
          xcoordinate: number
          ycoordinate: number
          zcoordinate: number
        }
        Returns: unknown
      }
      st_pointzm: {
        Args: {
          mcoordinate: number
          srid?: number
          xcoordinate: number
          ycoordinate: number
          zcoordinate: number
        }
        Returns: unknown
      }
      st_polyfromtext: { Args: { "": string }; Returns: unknown }
      st_polygonfromtext: { Args: { "": string }; Returns: unknown }
      st_project: {
        Args: { azimuth: number; distance: number; geog: unknown }
        Returns: unknown
      }
      st_quantizecoordinates: {
        Args: {
          g: unknown
          prec_m?: number
          prec_x: number
          prec_y?: number
          prec_z?: number
        }
        Returns: unknown
      }
      st_reduceprecision: {
        Args: { geom: unknown; gridsize: number }
        Returns: unknown
      }
      st_relate: { Args: { geom1: unknown; geom2: unknown }; Returns: string }
      st_removerepeatedpoints: {
        Args: { geom: unknown; tolerance?: number }
        Returns: unknown
      }
      st_segmentize: {
        Args: { geog: unknown; max_segment_length: number }
        Returns: unknown
      }
      st_setsrid:
        | { Args: { geog: unknown; srid: number }; Returns: unknown }
        | { Args: { geom: unknown; srid: number }; Returns: unknown }
      st_sharedpaths: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_shortestline: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_simplifypolygonhull: {
        Args: { geom: unknown; is_outer?: boolean; vertex_fraction: number }
        Returns: unknown
      }
      st_split: { Args: { geom1: unknown; geom2: unknown }; Returns: unknown }
      st_square: {
        Args: { cell_i: number; cell_j: number; origin?: unknown; size: number }
        Returns: unknown
      }
      st_squaregrid: {
        Args: { bounds: unknown; size: number }
        Returns: Record<string, unknown>[]
      }
      st_srid:
        | { Args: { geog: unknown }; Returns: number }
        | { Args: { geom: unknown }; Returns: number }
      st_subdivide: {
        Args: { geom: unknown; gridsize?: number; maxvertices?: number }
        Returns: unknown[]
      }
      st_swapordinates: {
        Args: { geom: unknown; ords: unknown }
        Returns: unknown
      }
      st_symdifference: {
        Args: { geom1: unknown; geom2: unknown; gridsize?: number }
        Returns: unknown
      }
      st_symmetricdifference: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_tileenvelope: {
        Args: {
          bounds?: unknown
          margin?: number
          x: number
          y: number
          zoom: number
        }
        Returns: unknown
      }
      st_touches: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      st_transform:
        | {
            Args: { from_proj: string; geom: unknown; to_proj: string }
            Returns: unknown
          }
        | {
            Args: { from_proj: string; geom: unknown; to_srid: number }
            Returns: unknown
          }
        | { Args: { geom: unknown; to_proj: string }; Returns: unknown }
      st_triangulatepolygon: { Args: { g1: unknown }; Returns: unknown }
      st_union:
        | { Args: { geom1: unknown; geom2: unknown }; Returns: unknown }
        | {
            Args: { geom1: unknown; geom2: unknown; gridsize: number }
            Returns: unknown
          }
      st_voronoilines: {
        Args: { extend_to?: unknown; g1: unknown; tolerance?: number }
        Returns: unknown
      }
      st_voronoipolygons: {
        Args: { extend_to?: unknown; g1: unknown; tolerance?: number }
        Returns: unknown
      }
      st_within: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      st_wkbtosql: { Args: { wkb: string }; Returns: unknown }
      st_wkttosql: { Args: { "": string }; Returns: unknown }
      st_wrapx: {
        Args: { geom: unknown; move: number; wrap: number }
        Returns: unknown
      }
      sync_community_comment_reactions: {
        Args: { target_comment_id: string }
        Returns: undefined
      }
      sync_community_group_counts: {
        Args: { target_group_id: string }
        Returns: undefined
      }
      sync_community_post_comments: {
        Args: { target_post_id: string }
        Returns: undefined
      }
      sync_community_post_reactions: {
        Args: { target_post_id: string }
        Returns: undefined
      }
      take_triage_case: {
        Args: { p_case_state_id: string }
        Returns: undefined
      }
      unlockrows: { Args: { "": string }; Returns: number }
      update_call_status: {
        Args: {
          p_call_id: string
          p_reason?: string
          p_status: Database["public"]["Enums"]["call_status"]
        }
        Returns: boolean
      }
      updategeometrysrid: {
        Args: {
          catalogn_name: string
          column_name: string
          new_srid_in: number
          schema_name: string
          table_name: string
        }
        Returns: string
      }
      user_belongs_to_company: {
        Args: { target_organization_id: string }
        Returns: boolean
      }
    }
    Enums: {
      badge_level: "bronze" | "silver" | "gold" | "platinum"
      badge_type:
        | "clinical_excellence"
        | "patient_favorite"
        | "punctuality_star"
        | "high_volume"
        | "mentor"
        | "early_adopter"
        | "zero_no_show"
        | "telemedicine_pioneer"
      call_status:
        | "requested"
        | "ringing"
        | "accepted"
        | "declined"
        | "canceled"
        | "connecting"
        | "connected"
        | "ended"
      clinical_setting: "uti" | "guardia" | "ward" | "outpatient"
      equipment_status:
        | "active"
        | "review_required"
        | "under_maintenance"
        | "validation_pending"
        | "decommissioned"
      incident_severity: "critical" | "high" | "medium" | "low"
      invoice_type: "A" | "B" | "C" | "M" | "E"
      lab_analysis_status: "PENDING" | "PROCESSING" | "COMPLETED" | "FAILED"
      monotributo_category:
        | "A"
        | "B"
        | "C"
        | "D"
        | "E"
        | "F"
        | "G"
        | "H"
        | "I"
        | "J"
        | "K"
      payment_status: "pending" | "approved" | "rejected" | "refunded"
      review_status: "pending" | "approved" | "flagged" | "removed"
      subscription_status: "active" | "cancelled" | "past_due" | "trialing"
      tax_regime: "monotributo" | "responsable_inscripto"
      user_role:
        | "doctor"
        | "patient"
        | "company_admin"
        | "organization_admin"
        | "platform_admin"
        | "pharmacist"
    }
    CompositeTypes: {
      geometry_dump: {
        path: number[] | null
        geom: unknown
      }
      valid_detail: {
        valid: boolean | null
        reason: string | null
        location: unknown
      }
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      badge_level: ["bronze", "silver", "gold", "platinum"],
      badge_type: [
        "clinical_excellence",
        "patient_favorite",
        "punctuality_star",
        "high_volume",
        "mentor",
        "early_adopter",
        "zero_no_show",
        "telemedicine_pioneer",
      ],
      call_status: [
        "requested",
        "ringing",
        "accepted",
        "declined",
        "canceled",
        "connecting",
        "connected",
        "ended",
      ],
      clinical_setting: ["uti", "guardia", "ward", "outpatient"],
      equipment_status: [
        "active",
        "review_required",
        "under_maintenance",
        "validation_pending",
        "decommissioned",
      ],
      incident_severity: ["critical", "high", "medium", "low"],
      invoice_type: ["A", "B", "C", "M", "E"],
      lab_analysis_status: ["PENDING", "PROCESSING", "COMPLETED", "FAILED"],
      monotributo_category: [
        "A",
        "B",
        "C",
        "D",
        "E",
        "F",
        "G",
        "H",
        "I",
        "J",
        "K",
      ],
      payment_status: ["pending", "approved", "rejected", "refunded"],
      review_status: ["pending", "approved", "flagged", "removed"],
      subscription_status: ["active", "cancelled", "past_due", "trialing"],
      tax_regime: ["monotributo", "responsable_inscripto"],
      user_role: [
        "doctor",
        "patient",
        "company_admin",
        "organization_admin",
        "platform_admin",
        "pharmacist",
      ],
    },
  },
} as const
