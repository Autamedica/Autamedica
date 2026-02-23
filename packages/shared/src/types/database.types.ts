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
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
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
      appointments: {
        Row: {
          created_at: string | null
          created_by: string | null
          doctor_id: string | null
          duration_minutes: number | null
          end_time: string | null
          id: string
          location: string | null
          meeting_url: string | null
          notes: string | null
          patient_id: string | null
          start_time: string
          status: string | null
          type: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          doctor_id?: string | null
          duration_minutes?: number | null
          end_time?: string | null
          id?: string
          location?: string | null
          meeting_url?: string | null
          notes?: string | null
          patient_id?: string | null
          start_time: string
          status?: string | null
          type?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          doctor_id?: string | null
          duration_minutes?: number | null
          end_time?: string | null
          id?: string
          location?: string | null
          meeting_url?: string | null
          notes?: string | null
          patient_id?: string | null
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
      call_notifications: {
        Row: {
          call_id: string | null
          created_at: string | null
          expires_at: string | null
          id: string
          payload: Json | null
          read_at: string | null
          receiver_id: string
          sender_id: string
          status: string | null
          type: string | null
        }
        Insert: {
          call_id?: string | null
          created_at?: string | null
          expires_at?: string | null
          id?: string
          payload?: Json | null
          read_at?: string | null
          receiver_id: string
          sender_id: string
          status?: string | null
          type?: string | null
        }
        Update: {
          call_id?: string | null
          created_at?: string | null
          expires_at?: string | null
          id?: string
          payload?: Json | null
          read_at?: string | null
          receiver_id?: string
          sender_id?: string
          status?: string | null
          type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "call_notifications_call_id_fkey"
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
          created_at: string
          doctor_id: string
          ended_at: string | null
          id: string
          patient_id: string
          reason: string | null
          room_id: string
          status: Database["public"]["Enums"]["call_status"]
        }
        Insert: {
          accepted_at?: string | null
          created_at?: string
          doctor_id: string
          ended_at?: string | null
          id?: string
          patient_id: string
          reason?: string | null
          room_id: string
          status?: Database["public"]["Enums"]["call_status"]
        }
        Update: {
          accepted_at?: string | null
          created_at?: string
          doctor_id?: string
          ended_at?: string | null
          id?: string
          patient_id?: string
          reason?: string | null
          room_id?: string
          status?: Database["public"]["Enums"]["call_status"]
        }
        Relationships: []
      }
      community_groups: {
        Row: {
          active: boolean | null
          category: string | null
          created_at: string | null
          created_by: string | null
          description: string | null
          id: string
          image_url: string | null
          is_private: boolean | null
          member_count: number | null
          name: string
          updated_at: string | null
        }
        Insert: {
          active?: boolean | null
          category?: string | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          id?: string
          image_url?: string | null
          is_private?: boolean | null
          member_count?: number | null
          name: string
          updated_at?: string | null
        }
        Update: {
          active?: boolean | null
          category?: string | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          id?: string
          image_url?: string | null
          is_private?: boolean | null
          member_count?: number | null
          name?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      community_posts: {
        Row: {
          author_id: string
          comment_count: number | null
          content: string
          created_at: string | null
          group_id: string | null
          id: string
          is_pinned: boolean | null
          media_urls: Json | null
          reaction_count: number | null
          title: string | null
          updated_at: string | null
        }
        Insert: {
          author_id: string
          comment_count?: number | null
          content: string
          created_at?: string | null
          group_id?: string | null
          id?: string
          is_pinned?: boolean | null
          media_urls?: Json | null
          reaction_count?: number | null
          title?: string | null
          updated_at?: string | null
        }
        Update: {
          author_id?: string
          comment_count?: number | null
          content?: string
          created_at?: string | null
          group_id?: string | null
          id?: string
          is_pinned?: boolean | null
          media_urls?: Json | null
          reaction_count?: number | null
          title?: string | null
          updated_at?: string | null
        }
        Relationships: [
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
      consultation_rooms: {
        Row: {
          consultation_id: string
          created_at: string
          doctor_id: string
          empty_timeout_seconds: number | null
          ended_at: string | null
          id: string
          max_participants: number | null
          patient_id: string
          room_name: string
          room_sid: string | null
          started_at: string | null
          status: string
          updated_at: string
        }
        Insert: {
          consultation_id: string
          created_at?: string
          doctor_id: string
          empty_timeout_seconds?: number | null
          ended_at?: string | null
          id?: string
          max_participants?: number | null
          patient_id: string
          room_name: string
          room_sid?: string | null
          started_at?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          consultation_id?: string
          created_at?: string
          doctor_id?: string
          empty_timeout_seconds?: number | null
          ended_at?: string | null
          id?: string
          max_participants?: number | null
          patient_id?: string
          room_name?: string
          room_sid?: string | null
          started_at?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      doctor_availability: {
        Row: {
          day_of_week: number
          doctor_id: string
          end_time: string
          id: string
          is_active: boolean | null
          slot_duration_minutes: number | null
          start_time: string
        }
        Insert: {
          day_of_week: number
          doctor_id: string
          end_time: string
          id?: string
          is_active?: boolean | null
          slot_duration_minutes?: number | null
          start_time: string
        }
        Update: {
          day_of_week?: number
          doctor_id?: string
          end_time?: string
          id?: string
          is_active?: boolean | null
          slot_duration_minutes?: number | null
          start_time?: string
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
      doctor_specialties: {
        Row: {
          doctor_id: string
          id: string
          is_primary: boolean | null
          specialty_id: string
        }
        Insert: {
          doctor_id: string
          id?: string
          is_primary?: boolean | null
          specialty_id: string
        }
        Update: {
          doctor_id?: string
          id?: string
          is_primary?: boolean | null
          specialty_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "doctor_specialties_doctor_id_fkey"
            columns: ["doctor_id"]
            isOneToOne: false
            referencedRelation: "doctors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "doctor_specialties_specialty_id_fkey"
            columns: ["specialty_id"]
            isOneToOne: false
            referencedRelation: "medical_specialties"
            referencedColumns: ["id"]
          },
        ]
      }
      doctors: {
        Row: {
          accepted_insurance: Json | null
          active: boolean | null
          bio: string | null
          certifications: Json | null
          consultation_fee: number | null
          created_at: string | null
          education: Json | null
          id: string
          languages: Json | null
          license_number: string
          schedule: Json | null
          specialty: string
          subspecialty: string | null
          updated_at: string | null
          user_id: string | null
          years_experience: number | null
        }
        Insert: {
          accepted_insurance?: Json | null
          active?: boolean | null
          bio?: string | null
          certifications?: Json | null
          consultation_fee?: number | null
          created_at?: string | null
          education?: Json | null
          id?: string
          languages?: Json | null
          license_number: string
          schedule?: Json | null
          specialty: string
          subspecialty?: string | null
          updated_at?: string | null
          user_id?: string | null
          years_experience?: number | null
        }
        Update: {
          accepted_insurance?: Json | null
          active?: boolean | null
          bio?: string | null
          certifications?: Json | null
          consultation_fee?: number | null
          created_at?: string | null
          education?: Json | null
          id?: string
          languages?: Json | null
          license_number?: string
          schedule?: Json | null
          specialty?: string
          subspecialty?: string | null
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
      group_memberships: {
        Row: {
          group_id: string
          id: string
          joined_at: string | null
          role: string | null
          user_id: string
        }
        Insert: {
          group_id: string
          id?: string
          joined_at?: string | null
          role?: string | null
          user_id: string
        }
        Update: {
          group_id?: string
          id?: string
          joined_at?: string | null
          role?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "group_memberships_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "community_groups"
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
          requires_appointment?: boolean
          type?: string
          updated_at?: string
          website_url?: string | null
        }
        Relationships: []
      }
      insurance_providers: {
        Row: {
          active: boolean | null
          created_at: string | null
          id: string
          logo_url: string | null
          name: string
          rnemp: string | null
        }
        Insert: {
          active?: boolean | null
          created_at?: string | null
          id?: string
          logo_url?: string | null
          name: string
          rnemp?: string | null
        }
        Update: {
          active?: boolean | null
          created_at?: string | null
          id?: string
          logo_url?: string | null
          name?: string
          rnemp?: string | null
        }
        Relationships: []
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
      legal_consents: {
        Row: {
          accepted_at: string | null
          document_type: string | null
          document_version: string
          id: string
          ip_address: string | null
          user_agent: string | null
          user_id: string
        }
        Insert: {
          accepted_at?: string | null
          document_type?: string | null
          document_version: string
          id?: string
          ip_address?: string | null
          user_agent?: string | null
          user_id: string
        }
        Update: {
          accepted_at?: string | null
          document_type?: string | null
          document_version?: string
          id?: string
          ip_address?: string | null
          user_agent?: string | null
          user_id?: string
        }
        Relationships: []
      }
      medical_audit_log: {
        Row: {
          action_type: string
          created_at: string | null
          id: string
          ip_address: unknown
          patient_user_id: string | null
          record_id: string | null
          table_name: string
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          action_type: string
          created_at?: string | null
          id?: string
          ip_address?: unknown
          patient_user_id?: string | null
          record_id?: string | null
          table_name: string
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          action_type?: string
          created_at?: string | null
          id?: string
          ip_address?: unknown
          patient_user_id?: string | null
          record_id?: string | null
          table_name?: string
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      medical_cases: {
        Row: {
          category: string
          content_sections: Json
          created_at: string
          description: string
          id: string
          is_published: boolean
          related_screenings: string[] | null
          related_specialists: string[] | null
          target_age_max: number | null
          target_age_min: number | null
          target_gender: string
          title: string
          updated_at: string
        }
        Insert: {
          category: string
          content_sections?: Json
          created_at?: string
          description: string
          id?: string
          is_published?: boolean
          related_screenings?: string[] | null
          related_specialists?: string[] | null
          target_age_max?: number | null
          target_age_min?: number | null
          target_gender: string
          title: string
          updated_at?: string
        }
        Update: {
          category?: string
          content_sections?: Json
          created_at?: string
          description?: string
          id?: string
          is_published?: boolean
          related_screenings?: string[] | null
          related_specialists?: string[] | null
          target_age_max?: number | null
          target_age_min?: number | null
          target_gender?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
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
      medical_specialties: {
        Row: {
          active: boolean | null
          description: string | null
          icon_name: string | null
          id: string
          name: string
        }
        Insert: {
          active?: boolean | null
          description?: string | null
          icon_name?: string | null
          id?: string
          name: string
        }
        Update: {
          active?: boolean | null
          description?: string | null
          icon_name?: string | null
          id?: string
          name?: string
        }
        Relationships: []
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
      patient_insurances: {
        Row: {
          affiliate_number: string
          back_card_url: string | null
          created_at: string | null
          front_card_url: string | null
          id: string
          insurance_id: string
          is_verified: boolean | null
          patient_id: string
          plan_name: string | null
        }
        Insert: {
          affiliate_number: string
          back_card_url?: string | null
          created_at?: string | null
          front_card_url?: string | null
          id?: string
          insurance_id: string
          is_verified?: boolean | null
          patient_id: string
          plan_name?: string | null
        }
        Update: {
          affiliate_number?: string
          back_card_url?: string | null
          created_at?: string | null
          front_card_url?: string | null
          id?: string
          insurance_id?: string
          is_verified?: boolean | null
          patient_id?: string
          plan_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "patient_insurances_insurance_id_fkey"
            columns: ["insurance_id"]
            isOneToOne: false
            referencedRelation: "insurance_providers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "patient_insurances_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      patient_risk_factors: {
        Row: {
          created_at: string
          diagnosed_date: string
          id: string
          notes: string | null
          patient_id: string
          risk_factor_id: string
          severity: string
        }
        Insert: {
          created_at?: string
          diagnosed_date: string
          id?: string
          notes?: string | null
          patient_id: string
          risk_factor_id: string
          severity: string
        }
        Update: {
          created_at?: string
          diagnosed_date?: string
          id?: string
          notes?: string | null
          patient_id?: string
          risk_factor_id?: string
          severity?: string
        }
        Relationships: [
          {
            foreignKeyName: "patient_risk_factors_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "patient_risk_factors_risk_factor_id_fkey"
            columns: ["risk_factor_id"]
            isOneToOne: false
            referencedRelation: "risk_factors"
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
      patients: {
        Row: {
          active: boolean | null
          allergies: Json | null
          birth_date: string | null
          blood_type: string | null
          created_at: string | null
          dni: string | null
          emergency_contact: Json | null
          gender: string | null
          height_cm: number | null
          id: string
          insurance_info: Json | null
          medical_history: Json | null
          medications: Json | null
          organization_id: string | null
          updated_at: string | null
          user_id: string | null
          weight_kg: number | null
        }
        Insert: {
          active?: boolean | null
          allergies?: Json | null
          birth_date?: string | null
          blood_type?: string | null
          created_at?: string | null
          dni?: string | null
          emergency_contact?: Json | null
          gender?: string | null
          height_cm?: number | null
          id?: string
          insurance_info?: Json | null
          medical_history?: Json | null
          medications?: Json | null
          organization_id?: string | null
          updated_at?: string | null
          user_id?: string | null
          weight_kg?: number | null
        }
        Update: {
          active?: boolean | null
          allergies?: Json | null
          birth_date?: string | null
          blood_type?: string | null
          created_at?: string | null
          dni?: string | null
          emergency_contact?: Json | null
          gender?: string | null
          height_cm?: number | null
          id?: string
          insurance_info?: Json | null
          medical_history?: Json | null
          medications?: Json | null
          organization_id?: string | null
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
      payments: {
        Row: {
          amount: number
          appointment_id: string | null
          created_at: string | null
          currency: string | null
          doctor_id: string | null
          gateway: string | null
          gateway_transaction_id: string | null
          id: string
          metadata: Json | null
          patient_id: string
          refund_reason: string | null
          status: string | null
          updated_at: string | null
        }
        Insert: {
          amount: number
          appointment_id?: string | null
          created_at?: string | null
          currency?: string | null
          doctor_id?: string | null
          gateway?: string | null
          gateway_transaction_id?: string | null
          id?: string
          metadata?: Json | null
          patient_id: string
          refund_reason?: string | null
          status?: string | null
          updated_at?: string | null
        }
        Update: {
          amount?: number
          appointment_id?: string | null
          created_at?: string | null
          currency?: string | null
          doctor_id?: string | null
          gateway?: string | null
          gateway_transaction_id?: string | null
          id?: string
          metadata?: Json | null
          patient_id?: string
          refund_reason?: string | null
          status?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payments_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_doctor_id_fkey"
            columns: ["doctor_id"]
            isOneToOne: false
            referencedRelation: "doctors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      post_reactions: {
        Row: {
          created_at: string | null
          id: string
          post_id: string
          reaction_type: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          post_id: string
          reaction_type?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          post_id?: string
          reaction_type?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "post_reactions_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "community_posts"
            referencedColumns: ["id"]
          },
        ]
      }
      prescription_items: {
        Row: {
          dosage: string
          duration: string | null
          frequency: string
          id: string
          medication_name: string
          notes: string | null
          prescription_id: string | null
        }
        Insert: {
          dosage: string
          duration?: string | null
          frequency: string
          id?: string
          medication_name: string
          notes?: string | null
          prescription_id?: string | null
        }
        Update: {
          dosage?: string
          duration?: string | null
          frequency?: string
          id?: string
          medication_name?: string
          notes?: string | null
          prescription_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "prescription_items_prescription_id_fkey"
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
          created_at: string | null
          diagnosis_text: string | null
          digital_signature: string | null
          doctor_id: string
          expires_at: string | null
          id: string
          patient_id: string
          pdf_url: string | null
          status: string | null
        }
        Insert: {
          appointment_id?: string | null
          created_at?: string | null
          diagnosis_text?: string | null
          digital_signature?: string | null
          doctor_id: string
          expires_at?: string | null
          id?: string
          patient_id: string
          pdf_url?: string | null
          status?: string | null
        }
        Update: {
          appointment_id?: string | null
          created_at?: string | null
          diagnosis_text?: string | null
          digital_signature?: string | null
          doctor_id?: string
          expires_at?: string | null
          id?: string
          patient_id?: string
          pdf_url?: string | null
          status?: string | null
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
          email: string | null
          external_id: string | null
          first_name: string | null
          last_name: string | null
          numeric_id: number
          phone: string | null
          role: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          active?: boolean | null
          avatar_url?: string | null
          created_at?: string | null
          email?: string | null
          external_id?: string | null
          first_name?: string | null
          last_name?: string | null
          numeric_id?: number
          phone?: string | null
          role?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          active?: boolean | null
          avatar_url?: string | null
          created_at?: string | null
          email?: string | null
          external_id?: string | null
          first_name?: string | null
          last_name?: string | null
          numeric_id?: number
          phone?: string | null
          role?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
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
      reviews: {
        Row: {
          appointment_id: string | null
          comment: string | null
          created_at: string | null
          doctor_id: string
          id: string
          is_public: boolean | null
          patient_id: string
          rating: number
        }
        Insert: {
          appointment_id?: string | null
          comment?: string | null
          created_at?: string | null
          doctor_id: string
          id?: string
          is_public?: boolean | null
          patient_id: string
          rating: number
        }
        Update: {
          appointment_id?: string | null
          comment?: string | null
          created_at?: string | null
          doctor_id?: string
          id?: string
          is_public?: boolean | null
          patient_id?: string
          rating?: number
        }
        Relationships: [
          {
            foreignKeyName: "reviews_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: true
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reviews_doctor_id_fkey"
            columns: ["doctor_id"]
            isOneToOne: false
            referencedRelation: "doctors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reviews_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      risk_factors: {
        Row: {
          category: string
          created_at: string
          description: string
          frequency_adjustment: string | null
          id: string
          increases_risk_for: string[]
          name: string
          recommended_age_adjustment: number
        }
        Insert: {
          category: string
          created_at?: string
          description: string
          frequency_adjustment?: string | null
          id?: string
          increases_risk_for?: string[]
          name: string
          recommended_age_adjustment?: number
        }
        Update: {
          category?: string
          created_at?: string
          description?: string
          frequency_adjustment?: string | null
          id?: string
          increases_risk_for?: string[]
          name?: string
          recommended_age_adjustment?: number
        }
        Relationships: []
      }
      screening_reminder_notifications: {
        Row: {
          created_at: string
          id: string
          is_read: boolean
          message: string
          notification_channel: string
          patient_id: string
          patient_screening_id: string
          reminder_date: string
          sent_at: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          is_read?: boolean
          message: string
          notification_channel: string
          patient_id: string
          patient_screening_id: string
          reminder_date: string
          sent_at?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          is_read?: boolean
          message?: string
          notification_channel?: string
          patient_id?: string
          patient_screening_id?: string
          reminder_date?: string
          sent_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "screening_reminder_notifications_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "screening_reminder_notifications_patient_screening_id_fkey"
            columns: ["patient_screening_id"]
            isOneToOne: false
            referencedRelation: "patient_screenings"
            referencedColumns: ["id"]
          },
        ]
      }
      session_events: {
        Row: {
          created_at: string | null
          event_type: string
          id: string
          payload: Json | null
          session_id: string
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          event_type: string
          id?: string
          payload?: Json | null
          session_id: string
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          event_type?: string
          id?: string
          payload?: Json | null
          session_id?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "session_events_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "telemedicine_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "session_events_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "telemedicine_sessions_canonical"
            referencedColumns: ["id"]
          },
        ]
      }
      session_participants: {
        Row: {
          connection_quality: string | null
          created_at: string | null
          id: string
          is_audio_enabled: boolean | null
          is_video_enabled: boolean | null
          joined_at: string | null
          left_at: string | null
          role: string | null
          session_id: string
          user_id: string
        }
        Insert: {
          connection_quality?: string | null
          created_at?: string | null
          id?: string
          is_audio_enabled?: boolean | null
          is_video_enabled?: boolean | null
          joined_at?: string | null
          left_at?: string | null
          role?: string | null
          session_id: string
          user_id: string
        }
        Update: {
          connection_quality?: string | null
          created_at?: string | null
          id?: string
          is_audio_enabled?: boolean | null
          is_video_enabled?: boolean | null
          joined_at?: string | null
          left_at?: string | null
          role?: string | null
          session_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "session_participants_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "telemedicine_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "session_participants_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "telemedicine_sessions_canonical"
            referencedColumns: ["id"]
          },
        ]
      }
      session_recordings: {
        Row: {
          created_at: string | null
          duration_seconds: number | null
          ended_at: string | null
          file_size_bytes: number | null
          format: string | null
          id: string
          recording_url: string | null
          session_id: string
          started_at: string | null
          status: string | null
          storage_path: string | null
        }
        Insert: {
          created_at?: string | null
          duration_seconds?: number | null
          ended_at?: string | null
          file_size_bytes?: number | null
          format?: string | null
          id?: string
          recording_url?: string | null
          session_id: string
          started_at?: string | null
          status?: string | null
          storage_path?: string | null
        }
        Update: {
          created_at?: string | null
          duration_seconds?: number | null
          ended_at?: string | null
          file_size_bytes?: number | null
          format?: string | null
          id?: string
          recording_url?: string | null
          session_id?: string
          started_at?: string | null
          status?: string | null
          storage_path?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "session_recordings_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "telemedicine_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "session_recordings_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "telemedicine_sessions_canonical"
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
      telemedicine_session_events: {
        Row: {
          created_at: string | null
          event_data: Json | null
          event_type: string
          id: string
          session_id: string
        }
        Insert: {
          created_at?: string | null
          event_data?: Json | null
          event_type: string
          id?: string
          session_id: string
        }
        Update: {
          created_at?: string | null
          event_data?: Json | null
          event_type?: string
          id?: string
          session_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "telemedicine_session_events_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "telemedicine_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "telemedicine_session_events_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "telemedicine_sessions_canonical"
            referencedColumns: ["id"]
          },
        ]
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
      user_preferences: {
        Row: {
          created_at: string | null
          id: string
          language: string | null
          notifications_enabled: boolean | null
          preferences: Json | null
          sound_enabled: boolean | null
          theme: string | null
          timezone: string | null
          updated_at: string | null
          user_id: string
          video_quality: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          language?: string | null
          notifications_enabled?: boolean | null
          preferences?: Json | null
          sound_enabled?: boolean | null
          theme?: string | null
          timezone?: string | null
          updated_at?: string | null
          user_id: string
          video_quality?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          language?: string | null
          notifications_enabled?: boolean | null
          preferences?: Json | null
          sound_enabled?: boolean | null
          theme?: string | null
          timezone?: string | null
          updated_at?: string | null
          user_id?: string
          video_quality?: string | null
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
    }
    Views: {
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
          active_users_24h: number | null
          audit_entries_24h: number | null
          checked_at: string | null
          public_tables: number | null
          storage_buckets: number | null
          tables_with_rls: number | null
          total_policies: number | null
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
      create_call: {
        Args: { p_doctor_id: string; p_patient_id: string }
        Returns: {
          created_at: string
          doctor_id: string
          id: string
          patient_id: string
          room_id: string
          status: Database["public"]["Enums"]["call_status"]
        }[]
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
      disablelongtransactions: { Args: never; Returns: string }
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
      get_next_numeric_id: { Args: never; Returns: number }
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
      is_company_admin: { Args: never; Returns: boolean }
      is_doctor: { Args: never; Returns: boolean }
      is_in_care_team: {
        Args: { p_doctor_id: string; p_patient_id: string }
        Returns: boolean
      }
      is_patient: { Args: never; Returns: boolean }
      is_platform_or_org_admin: { Args: { p_uid?: string }; Returns: boolean }
      is_system_admin: { Args: never; Returns: boolean }
      log_medical_access: {
        Args: {
          p_action_type: string
          p_patient_user_id?: string
          p_record_id?: string
          p_table_name: string
        }
        Returns: undefined
      }
      longtransactionsenabled: { Args: never; Returns: boolean }
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
      remove_from_care_team: {
        Args: { p_doctor_id: string; p_patient_id: string; p_role?: string }
        Returns: boolean
      }
      revoke_medical_record_authorization: {
        Args: { p_authorization_id: string }
        Returns: boolean
      }
      select_primary_role_for_profile: {
        Args: { target_profile_id: string }
        Returns: string
      }
      set_portal_and_role: {
        Args: { p_organization_id?: string; p_portal: string; p_role?: string }
        Returns: Json
      }
      set_user_role: {
        Args: { p_role: Database["public"]["Enums"]["user_role"] }
        Returns: undefined
      }
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
      call_status:
        | "requested"
        | "ringing"
        | "accepted"
        | "declined"
        | "canceled"
        | "connecting"
        | "connected"
        | "ended"
      user_role:
        | "doctor"
        | "patient"
        | "company_admin"
        | "organization_admin"
        | "platform_admin"
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
      user_role: [
        "doctor",
        "patient",
        "company_admin",
        "organization_admin",
        "platform_admin",
      ],
    },
  },
} as const
