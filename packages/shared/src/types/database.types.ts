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
    PostgrestVersion: "14.5"
  }
  auth: {
    Tables: {
      audit_log_entries: {
        Row: {
          created_at: string | null
          id: string
          instance_id: string | null
          ip_address: string
          payload: Json | null
        }
        Insert: {
          created_at?: string | null
          id: string
          instance_id?: string | null
          ip_address?: string
          payload?: Json | null
        }
        Update: {
          created_at?: string | null
          id?: string
          instance_id?: string | null
          ip_address?: string
          payload?: Json | null
        }
        Relationships: []
      }
      custom_oauth_providers: {
        Row: {
          acceptable_client_ids: string[]
          attribute_mapping: Json
          authorization_params: Json
          authorization_url: string | null
          cached_discovery: Json | null
          client_id: string
          client_secret: string
          created_at: string
          custom_claims_allowlist: string[]
          discovery_cached_at: string | null
          discovery_url: string | null
          email_optional: boolean
          enabled: boolean
          id: string
          identifier: string
          issuer: string | null
          jwks_uri: string | null
          name: string
          pkce_enabled: boolean
          provider_type: string
          scopes: string[]
          skip_nonce_check: boolean
          token_url: string | null
          updated_at: string
          userinfo_url: string | null
        }
        Insert: {
          acceptable_client_ids?: string[]
          attribute_mapping?: Json
          authorization_params?: Json
          authorization_url?: string | null
          cached_discovery?: Json | null
          client_id: string
          client_secret: string
          created_at?: string
          custom_claims_allowlist?: string[]
          discovery_cached_at?: string | null
          discovery_url?: string | null
          email_optional?: boolean
          enabled?: boolean
          id?: string
          identifier: string
          issuer?: string | null
          jwks_uri?: string | null
          name: string
          pkce_enabled?: boolean
          provider_type: string
          scopes?: string[]
          skip_nonce_check?: boolean
          token_url?: string | null
          updated_at?: string
          userinfo_url?: string | null
        }
        Update: {
          acceptable_client_ids?: string[]
          attribute_mapping?: Json
          authorization_params?: Json
          authorization_url?: string | null
          cached_discovery?: Json | null
          client_id?: string
          client_secret?: string
          created_at?: string
          custom_claims_allowlist?: string[]
          discovery_cached_at?: string | null
          discovery_url?: string | null
          email_optional?: boolean
          enabled?: boolean
          id?: string
          identifier?: string
          issuer?: string | null
          jwks_uri?: string | null
          name?: string
          pkce_enabled?: boolean
          provider_type?: string
          scopes?: string[]
          skip_nonce_check?: boolean
          token_url?: string | null
          updated_at?: string
          userinfo_url?: string | null
        }
        Relationships: []
      }
      flow_state: {
        Row: {
          auth_code: string | null
          auth_code_issued_at: string | null
          authentication_method: string
          code_challenge: string | null
          code_challenge_method:
            | Database["auth"]["Enums"]["code_challenge_method"]
            | null
          created_at: string | null
          email_optional: boolean
          id: string
          invite_token: string | null
          linking_target_id: string | null
          oauth_client_state_id: string | null
          provider_access_token: string | null
          provider_refresh_token: string | null
          provider_type: string
          referrer: string | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          auth_code?: string | null
          auth_code_issued_at?: string | null
          authentication_method: string
          code_challenge?: string | null
          code_challenge_method?:
            | Database["auth"]["Enums"]["code_challenge_method"]
            | null
          created_at?: string | null
          email_optional?: boolean
          id: string
          invite_token?: string | null
          linking_target_id?: string | null
          oauth_client_state_id?: string | null
          provider_access_token?: string | null
          provider_refresh_token?: string | null
          provider_type: string
          referrer?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          auth_code?: string | null
          auth_code_issued_at?: string | null
          authentication_method?: string
          code_challenge?: string | null
          code_challenge_method?:
            | Database["auth"]["Enums"]["code_challenge_method"]
            | null
          created_at?: string | null
          email_optional?: boolean
          id?: string
          invite_token?: string | null
          linking_target_id?: string | null
          oauth_client_state_id?: string | null
          provider_access_token?: string | null
          provider_refresh_token?: string | null
          provider_type?: string
          referrer?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      identities: {
        Row: {
          created_at: string | null
          email: string | null
          id: string
          identity_data: Json
          last_sign_in_at: string | null
          provider: string
          provider_id: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          email?: string | null
          id?: string
          identity_data: Json
          last_sign_in_at?: string | null
          provider: string
          provider_id: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          email?: string | null
          id?: string
          identity_data?: Json
          last_sign_in_at?: string | null
          provider?: string
          provider_id?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "identities_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      instances: {
        Row: {
          created_at: string | null
          id: string
          raw_base_config: string | null
          updated_at: string | null
          uuid: string | null
        }
        Insert: {
          created_at?: string | null
          id: string
          raw_base_config?: string | null
          updated_at?: string | null
          uuid?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          raw_base_config?: string | null
          updated_at?: string | null
          uuid?: string | null
        }
        Relationships: []
      }
      mfa_amr_claims: {
        Row: {
          authentication_method: string
          created_at: string
          id: string
          session_id: string
          updated_at: string
        }
        Insert: {
          authentication_method: string
          created_at: string
          id: string
          session_id: string
          updated_at: string
        }
        Update: {
          authentication_method?: string
          created_at?: string
          id?: string
          session_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "mfa_amr_claims_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      mfa_challenges: {
        Row: {
          created_at: string
          factor_id: string
          id: string
          ip_address: unknown
          otp_code: string | null
          verified_at: string | null
          web_authn_session_data: Json | null
        }
        Insert: {
          created_at: string
          factor_id: string
          id: string
          ip_address: unknown
          otp_code?: string | null
          verified_at?: string | null
          web_authn_session_data?: Json | null
        }
        Update: {
          created_at?: string
          factor_id?: string
          id?: string
          ip_address?: unknown
          otp_code?: string | null
          verified_at?: string | null
          web_authn_session_data?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "mfa_challenges_auth_factor_id_fkey"
            columns: ["factor_id"]
            isOneToOne: false
            referencedRelation: "mfa_factors"
            referencedColumns: ["id"]
          },
        ]
      }
      mfa_factors: {
        Row: {
          created_at: string
          factor_type: Database["auth"]["Enums"]["factor_type"]
          friendly_name: string | null
          id: string
          last_challenged_at: string | null
          last_webauthn_challenge_data: Json | null
          phone: string | null
          secret: string | null
          status: Database["auth"]["Enums"]["factor_status"]
          updated_at: string
          user_id: string
          web_authn_aaguid: string | null
          web_authn_credential: Json | null
        }
        Insert: {
          created_at: string
          factor_type: Database["auth"]["Enums"]["factor_type"]
          friendly_name?: string | null
          id: string
          last_challenged_at?: string | null
          last_webauthn_challenge_data?: Json | null
          phone?: string | null
          secret?: string | null
          status: Database["auth"]["Enums"]["factor_status"]
          updated_at: string
          user_id: string
          web_authn_aaguid?: string | null
          web_authn_credential?: Json | null
        }
        Update: {
          created_at?: string
          factor_type?: Database["auth"]["Enums"]["factor_type"]
          friendly_name?: string | null
          id?: string
          last_challenged_at?: string | null
          last_webauthn_challenge_data?: Json | null
          phone?: string | null
          secret?: string | null
          status?: Database["auth"]["Enums"]["factor_status"]
          updated_at?: string
          user_id?: string
          web_authn_aaguid?: string | null
          web_authn_credential?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "mfa_factors_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      mfa_recovery_code_sets: {
        Row: {
          created_at: string
          failed_verification_count: number
          id: string
          mfa_factor_id: string
          updated_at: string
          user_id: string
          verification_locked_until: string | null
        }
        Insert: {
          created_at?: string
          failed_verification_count?: number
          id: string
          mfa_factor_id: string
          updated_at?: string
          user_id: string
          verification_locked_until?: string | null
        }
        Update: {
          created_at?: string
          failed_verification_count?: number
          id?: string
          mfa_factor_id?: string
          updated_at?: string
          user_id?: string
          verification_locked_until?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "mfa_recovery_code_sets_mfa_factor_id_fkey"
            columns: ["mfa_factor_id"]
            isOneToOne: true
            referencedRelation: "mfa_factors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mfa_recovery_code_sets_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      mfa_recovery_codes: {
        Row: {
          code_hash: string
          consumed_at: string | null
          created_at: string
          id: string
          mfa_recovery_code_set_id: string
        }
        Insert: {
          code_hash: string
          consumed_at?: string | null
          created_at?: string
          id: string
          mfa_recovery_code_set_id: string
        }
        Update: {
          code_hash?: string
          consumed_at?: string | null
          created_at?: string
          id?: string
          mfa_recovery_code_set_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "mfa_recovery_codes_mfa_recovery_code_set_id_fkey"
            columns: ["mfa_recovery_code_set_id"]
            isOneToOne: false
            referencedRelation: "mfa_recovery_code_sets"
            referencedColumns: ["id"]
          },
        ]
      }
      oauth_authorizations: {
        Row: {
          approved_at: string | null
          authorization_code: string | null
          authorization_id: string
          client_id: string
          code_challenge: string | null
          code_challenge_method:
            | Database["auth"]["Enums"]["code_challenge_method"]
            | null
          created_at: string
          expires_at: string
          id: string
          nonce: string | null
          redirect_uri: string
          resource: string | null
          response_type: Database["auth"]["Enums"]["oauth_response_type"]
          scope: string
          state: string | null
          status: Database["auth"]["Enums"]["oauth_authorization_status"]
          user_id: string | null
        }
        Insert: {
          approved_at?: string | null
          authorization_code?: string | null
          authorization_id: string
          client_id: string
          code_challenge?: string | null
          code_challenge_method?:
            | Database["auth"]["Enums"]["code_challenge_method"]
            | null
          created_at?: string
          expires_at?: string
          id: string
          nonce?: string | null
          redirect_uri: string
          resource?: string | null
          response_type?: Database["auth"]["Enums"]["oauth_response_type"]
          scope: string
          state?: string | null
          status?: Database["auth"]["Enums"]["oauth_authorization_status"]
          user_id?: string | null
        }
        Update: {
          approved_at?: string | null
          authorization_code?: string | null
          authorization_id?: string
          client_id?: string
          code_challenge?: string | null
          code_challenge_method?:
            | Database["auth"]["Enums"]["code_challenge_method"]
            | null
          created_at?: string
          expires_at?: string
          id?: string
          nonce?: string | null
          redirect_uri?: string
          resource?: string | null
          response_type?: Database["auth"]["Enums"]["oauth_response_type"]
          scope?: string
          state?: string | null
          status?: Database["auth"]["Enums"]["oauth_authorization_status"]
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "oauth_authorizations_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "oauth_clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "oauth_authorizations_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      oauth_client_states: {
        Row: {
          code_verifier: string | null
          created_at: string
          id: string
          provider_type: string
        }
        Insert: {
          code_verifier?: string | null
          created_at: string
          id: string
          provider_type: string
        }
        Update: {
          code_verifier?: string | null
          created_at?: string
          id?: string
          provider_type?: string
        }
        Relationships: []
      }
      oauth_clients: {
        Row: {
          client_name: string | null
          client_secret_hash: string | null
          client_type: Database["auth"]["Enums"]["oauth_client_type"]
          client_uri: string | null
          created_at: string
          deleted_at: string | null
          grant_types: string
          id: string
          logo_uri: string | null
          redirect_uris: string
          registration_type: Database["auth"]["Enums"]["oauth_registration_type"]
          token_endpoint_auth_method: string
          updated_at: string
        }
        Insert: {
          client_name?: string | null
          client_secret_hash?: string | null
          client_type?: Database["auth"]["Enums"]["oauth_client_type"]
          client_uri?: string | null
          created_at?: string
          deleted_at?: string | null
          grant_types: string
          id: string
          logo_uri?: string | null
          redirect_uris: string
          registration_type: Database["auth"]["Enums"]["oauth_registration_type"]
          token_endpoint_auth_method: string
          updated_at?: string
        }
        Update: {
          client_name?: string | null
          client_secret_hash?: string | null
          client_type?: Database["auth"]["Enums"]["oauth_client_type"]
          client_uri?: string | null
          created_at?: string
          deleted_at?: string | null
          grant_types?: string
          id?: string
          logo_uri?: string | null
          redirect_uris?: string
          registration_type?: Database["auth"]["Enums"]["oauth_registration_type"]
          token_endpoint_auth_method?: string
          updated_at?: string
        }
        Relationships: []
      }
      oauth_consents: {
        Row: {
          client_id: string
          granted_at: string
          id: string
          revoked_at: string | null
          scopes: string
          user_id: string
        }
        Insert: {
          client_id: string
          granted_at?: string
          id: string
          revoked_at?: string | null
          scopes: string
          user_id: string
        }
        Update: {
          client_id?: string
          granted_at?: string
          id?: string
          revoked_at?: string | null
          scopes?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "oauth_consents_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "oauth_clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "oauth_consents_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      one_time_tokens: {
        Row: {
          created_at: string
          expires_at: string | null
          id: string
          relates_to: string
          token_hash: string
          token_type: Database["auth"]["Enums"]["one_time_token_type"]
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          expires_at?: string | null
          id: string
          relates_to: string
          token_hash: string
          token_type: Database["auth"]["Enums"]["one_time_token_type"]
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          expires_at?: string | null
          id?: string
          relates_to?: string
          token_hash?: string
          token_type?: Database["auth"]["Enums"]["one_time_token_type"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "one_time_tokens_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      refresh_tokens: {
        Row: {
          created_at: string | null
          id: number
          instance_id: string | null
          parent: string | null
          revoked: boolean | null
          session_id: string | null
          token: string | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          id?: number
          instance_id?: string | null
          parent?: string | null
          revoked?: boolean | null
          session_id?: string | null
          token?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          id?: number
          instance_id?: string | null
          parent?: string | null
          revoked?: boolean | null
          session_id?: string | null
          token?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "refresh_tokens_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      saml_providers: {
        Row: {
          attribute_mapping: Json | null
          created_at: string | null
          entity_id: string
          id: string
          metadata_url: string | null
          metadata_xml: string
          name_id_format: string | null
          sso_provider_id: string
          updated_at: string | null
        }
        Insert: {
          attribute_mapping?: Json | null
          created_at?: string | null
          entity_id: string
          id: string
          metadata_url?: string | null
          metadata_xml: string
          name_id_format?: string | null
          sso_provider_id: string
          updated_at?: string | null
        }
        Update: {
          attribute_mapping?: Json | null
          created_at?: string | null
          entity_id?: string
          id?: string
          metadata_url?: string | null
          metadata_xml?: string
          name_id_format?: string | null
          sso_provider_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "saml_providers_sso_provider_id_fkey"
            columns: ["sso_provider_id"]
            isOneToOne: false
            referencedRelation: "sso_providers"
            referencedColumns: ["id"]
          },
        ]
      }
      saml_relay_states: {
        Row: {
          created_at: string | null
          flow_state_id: string | null
          for_email: string | null
          id: string
          redirect_to: string | null
          request_id: string
          sso_provider_id: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          flow_state_id?: string | null
          for_email?: string | null
          id: string
          redirect_to?: string | null
          request_id: string
          sso_provider_id: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          flow_state_id?: string | null
          for_email?: string | null
          id?: string
          redirect_to?: string | null
          request_id?: string
          sso_provider_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "saml_relay_states_flow_state_id_fkey"
            columns: ["flow_state_id"]
            isOneToOne: false
            referencedRelation: "flow_state"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "saml_relay_states_sso_provider_id_fkey"
            columns: ["sso_provider_id"]
            isOneToOne: false
            referencedRelation: "sso_providers"
            referencedColumns: ["id"]
          },
        ]
      }
      schema_migrations: {
        Row: {
          version: string
        }
        Insert: {
          version: string
        }
        Update: {
          version?: string
        }
        Relationships: []
      }
      scim_tokens: {
        Row: {
          created_at: string
          expires_at: string | null
          id: string
          last_used_at: string | null
          prefix: string
          revoked_at: string | null
          sso_provider_id: string
          token_hash: string
        }
        Insert: {
          created_at?: string
          expires_at?: string | null
          id: string
          last_used_at?: string | null
          prefix: string
          revoked_at?: string | null
          sso_provider_id: string
          token_hash: string
        }
        Update: {
          created_at?: string
          expires_at?: string | null
          id?: string
          last_used_at?: string | null
          prefix?: string
          revoked_at?: string | null
          sso_provider_id?: string
          token_hash?: string
        }
        Relationships: [
          {
            foreignKeyName: "scim_tokens_sso_provider_id_fkey"
            columns: ["sso_provider_id"]
            isOneToOne: false
            referencedRelation: "sso_providers"
            referencedColumns: ["id"]
          },
        ]
      }
      scim_users: {
        Row: {
          active: boolean
          created_at: string
          deleted_at: string | null
          external_id: string | null
          id: string
          resource: Json
          sso_provider_id: string
          updated_at: string
          user_id: string | null
          user_name: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          deleted_at?: string | null
          external_id?: string | null
          id: string
          resource: Json
          sso_provider_id: string
          updated_at?: string
          user_id?: string | null
          user_name?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          deleted_at?: string | null
          external_id?: string | null
          id?: string
          resource?: Json
          sso_provider_id?: string
          updated_at?: string
          user_id?: string | null
          user_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "scim_users_sso_provider_id_fkey"
            columns: ["sso_provider_id"]
            isOneToOne: false
            referencedRelation: "sso_providers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scim_users_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      sessions: {
        Row: {
          aal: Database["auth"]["Enums"]["aal_level"] | null
          created_at: string | null
          factor_id: string | null
          id: string
          ip: unknown
          not_after: string | null
          oauth_client_id: string | null
          refresh_token_counter: number | null
          refresh_token_hmac_key: string | null
          refreshed_at: string | null
          scopes: string | null
          tag: string | null
          updated_at: string | null
          user_agent: string | null
          user_id: string
        }
        Insert: {
          aal?: Database["auth"]["Enums"]["aal_level"] | null
          created_at?: string | null
          factor_id?: string | null
          id: string
          ip?: unknown
          not_after?: string | null
          oauth_client_id?: string | null
          refresh_token_counter?: number | null
          refresh_token_hmac_key?: string | null
          refreshed_at?: string | null
          scopes?: string | null
          tag?: string | null
          updated_at?: string | null
          user_agent?: string | null
          user_id: string
        }
        Update: {
          aal?: Database["auth"]["Enums"]["aal_level"] | null
          created_at?: string | null
          factor_id?: string | null
          id?: string
          ip?: unknown
          not_after?: string | null
          oauth_client_id?: string | null
          refresh_token_counter?: number | null
          refresh_token_hmac_key?: string | null
          refreshed_at?: string | null
          scopes?: string | null
          tag?: string | null
          updated_at?: string | null
          user_agent?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sessions_oauth_client_id_fkey"
            columns: ["oauth_client_id"]
            isOneToOne: false
            referencedRelation: "oauth_clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sessions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      sso_domains: {
        Row: {
          created_at: string | null
          domain: string
          id: string
          sso_provider_id: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          domain: string
          id: string
          sso_provider_id: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          domain?: string
          id?: string
          sso_provider_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sso_domains_sso_provider_id_fkey"
            columns: ["sso_provider_id"]
            isOneToOne: false
            referencedRelation: "sso_providers"
            referencedColumns: ["id"]
          },
        ]
      }
      sso_providers: {
        Row: {
          created_at: string | null
          disabled: boolean | null
          id: string
          resource_id: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          disabled?: boolean | null
          id: string
          resource_id?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          disabled?: boolean | null
          id?: string
          resource_id?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      users: {
        Row: {
          aud: string | null
          banned_until: string | null
          confirmation_sent_at: string | null
          confirmation_token: string | null
          confirmed_at: string | null
          created_at: string | null
          deleted_at: string | null
          email: string | null
          email_change: string | null
          email_change_confirm_status: number | null
          email_change_sent_at: string | null
          email_change_token_current: string | null
          email_change_token_new: string | null
          email_confirmed_at: string | null
          encrypted_password: string | null
          id: string
          instance_id: string | null
          invited_at: string | null
          is_anonymous: boolean
          is_sso_user: boolean
          is_super_admin: boolean | null
          last_sign_in_at: string | null
          phone: string | null
          phone_change: string | null
          phone_change_sent_at: string | null
          phone_change_token: string | null
          phone_confirmed_at: string | null
          raw_app_meta_data: Json | null
          raw_user_meta_data: Json | null
          reauthentication_sent_at: string | null
          reauthentication_token: string | null
          recovery_sent_at: string | null
          recovery_token: string | null
          role: string | null
          updated_at: string | null
        }
        Insert: {
          aud?: string | null
          banned_until?: string | null
          confirmation_sent_at?: string | null
          confirmation_token?: string | null
          confirmed_at?: string | null
          created_at?: string | null
          deleted_at?: string | null
          email?: string | null
          email_change?: string | null
          email_change_confirm_status?: number | null
          email_change_sent_at?: string | null
          email_change_token_current?: string | null
          email_change_token_new?: string | null
          email_confirmed_at?: string | null
          encrypted_password?: string | null
          id: string
          instance_id?: string | null
          invited_at?: string | null
          is_anonymous?: boolean
          is_sso_user?: boolean
          is_super_admin?: boolean | null
          last_sign_in_at?: string | null
          phone?: string | null
          phone_change?: string | null
          phone_change_sent_at?: string | null
          phone_change_token?: string | null
          phone_confirmed_at?: string | null
          raw_app_meta_data?: Json | null
          raw_user_meta_data?: Json | null
          reauthentication_sent_at?: string | null
          reauthentication_token?: string | null
          recovery_sent_at?: string | null
          recovery_token?: string | null
          role?: string | null
          updated_at?: string | null
        }
        Update: {
          aud?: string | null
          banned_until?: string | null
          confirmation_sent_at?: string | null
          confirmation_token?: string | null
          confirmed_at?: string | null
          created_at?: string | null
          deleted_at?: string | null
          email?: string | null
          email_change?: string | null
          email_change_confirm_status?: number | null
          email_change_sent_at?: string | null
          email_change_token_current?: string | null
          email_change_token_new?: string | null
          email_confirmed_at?: string | null
          encrypted_password?: string | null
          id?: string
          instance_id?: string | null
          invited_at?: string | null
          is_anonymous?: boolean
          is_sso_user?: boolean
          is_super_admin?: boolean | null
          last_sign_in_at?: string | null
          phone?: string | null
          phone_change?: string | null
          phone_change_sent_at?: string | null
          phone_change_token?: string | null
          phone_confirmed_at?: string | null
          raw_app_meta_data?: Json | null
          raw_user_meta_data?: Json | null
          reauthentication_sent_at?: string | null
          reauthentication_token?: string | null
          recovery_sent_at?: string | null
          recovery_token?: string | null
          role?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      webauthn_challenges: {
        Row: {
          challenge_type: string
          created_at: string
          expires_at: string
          id: string
          session_data: Json
          user_id: string | null
        }
        Insert: {
          challenge_type: string
          created_at?: string
          expires_at: string
          id?: string
          session_data: Json
          user_id?: string | null
        }
        Update: {
          challenge_type?: string
          created_at?: string
          expires_at?: string
          id?: string
          session_data?: Json
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "webauthn_challenges_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      webauthn_credentials: {
        Row: {
          aaguid: string | null
          attestation_type: string
          backed_up: boolean
          backup_eligible: boolean
          created_at: string
          credential_id: string
          friendly_name: string
          id: string
          last_used_at: string | null
          public_key: string
          sign_count: number
          transports: Json
          updated_at: string
          user_id: string
        }
        Insert: {
          aaguid?: string | null
          attestation_type?: string
          backed_up?: boolean
          backup_eligible?: boolean
          created_at?: string
          credential_id: string
          friendly_name?: string
          id?: string
          last_used_at?: string | null
          public_key: string
          sign_count?: number
          transports?: Json
          updated_at?: string
          user_id: string
        }
        Update: {
          aaguid?: string | null
          attestation_type?: string
          backed_up?: boolean
          backup_eligible?: boolean
          created_at?: string
          credential_id?: string
          friendly_name?: string
          id?: string
          last_used_at?: string | null
          public_key?: string
          sign_count?: number
          transports?: Json
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "webauthn_credentials_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      email: { Args: never; Returns: string }
      jwt: { Args: never; Returns: Json }
      role: { Args: never; Returns: string }
      uid: { Args: never; Returns: string }
    }
    Enums: {
      aal_level: "aal1" | "aal2" | "aal3"
      code_challenge_method: "s256" | "plain"
      factor_status: "unverified" | "verified"
      factor_type: "totp" | "webauthn" | "phone" | "recovery_code"
      oauth_authorization_status: "pending" | "approved" | "denied" | "expired"
      oauth_client_type: "public" | "confidential"
      oauth_registration_type: "dynamic" | "manual"
      oauth_response_type: "code"
      one_time_token_type:
        | "confirmation_token"
        | "reauthentication_token"
        | "recovery_token"
        | "email_change_token_new"
        | "email_change_token_current"
        | "phone_change_token"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  growth_os: {
    Tables: {
      ad_spend: {
        Row: {
          amount: number
          campaign: string | null
          content: string | null
          created_at: string
          currency: string
          external_id: string | null
          id: string
          medium: string | null
          metadata: Json
          notes: string | null
          provider: string | null
          source: string
          spend_date: string
          updated_at: string
          vertical: string | null
        }
        Insert: {
          amount: number
          campaign?: string | null
          content?: string | null
          created_at?: string
          currency?: string
          external_id?: string | null
          id?: string
          medium?: string | null
          metadata?: Json
          notes?: string | null
          provider?: string | null
          source: string
          spend_date: string
          updated_at?: string
          vertical?: string | null
        }
        Update: {
          amount?: number
          campaign?: string | null
          content?: string | null
          created_at?: string
          currency?: string
          external_id?: string | null
          id?: string
          medium?: string | null
          metadata?: Json
          notes?: string | null
          provider?: string | null
          source?: string
          spend_date?: string
          updated_at?: string
          vertical?: string | null
        }
        Relationships: []
      }
      agent_capabilities: {
        Row: {
          agent_type: string
          capability: string
          channel: string | null
          created_at: string
          enabled: boolean
          id: number
          reason: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          agent_type: string
          capability: string
          channel?: string | null
          created_at?: string
          enabled?: boolean
          id?: number
          reason?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          agent_type?: string
          capability?: string
          channel?: string | null
          created_at?: string
          enabled?: boolean
          id?: number
          reason?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      agent_jobs: {
        Row: {
          agent_type: string
          appointment_id: string | null
          attempts: number
          channel: string
          created_at: string
          id: string
          idempotency_key: string
          last_error: string | null
          lead_id: string | null
          payload: Json
          scheduled_for: string
          source_id: string | null
          source_table: string | null
          status: string
          trigger_type: string
          updated_at: string
        }
        Insert: {
          agent_type: string
          appointment_id?: string | null
          attempts?: number
          channel: string
          created_at?: string
          id?: string
          idempotency_key: string
          last_error?: string | null
          lead_id?: string | null
          payload?: Json
          scheduled_for?: string
          source_id?: string | null
          source_table?: string | null
          status?: string
          trigger_type: string
          updated_at?: string
        }
        Update: {
          agent_type?: string
          appointment_id?: string | null
          attempts?: number
          channel?: string
          created_at?: string
          id?: string
          idempotency_key?: string
          last_error?: string | null
          lead_id?: string | null
          payload?: Json
          scheduled_for?: string
          source_id?: string | null
          source_table?: string | null
          status?: string
          trigger_type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_jobs_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "lead_attribution"
            referencedColumns: ["lead_id"]
          },
          {
            foreignKeyName: "agent_jobs_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_runs: {
        Row: {
          compliance_result: Json
          created_at: string
          id: number
          input_snapshot: Json
          job_id: string
          model_name: string | null
          output_snapshot: Json
          prompt_version: string | null
          provider_result: Json
          stage: string
        }
        Insert: {
          compliance_result?: Json
          created_at?: string
          id?: number
          input_snapshot?: Json
          job_id: string
          model_name?: string | null
          output_snapshot?: Json
          prompt_version?: string | null
          provider_result?: Json
          stage: string
        }
        Update: {
          compliance_result?: Json
          created_at?: string
          id?: number
          input_snapshot?: Json
          job_id?: string
          model_name?: string | null
          output_snapshot?: Json
          prompt_version?: string | null
          provider_result?: Json
          stage?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_runs_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "agent_jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      brand_voice_examples: {
        Row: {
          channel: string
          content: string
          created_at: string
          embedding: string | null
          id: string
          language: string
          performance_score: number | null
          tags: string[] | null
        }
        Insert: {
          channel: string
          content: string
          created_at?: string
          embedding?: string | null
          id?: string
          language?: string
          performance_score?: number | null
          tags?: string[] | null
        }
        Update: {
          channel?: string
          content?: string
          created_at?: string
          embedding?: string | null
          id?: string
          language?: string
          performance_score?: number | null
          tags?: string[] | null
        }
        Relationships: []
      }
      compliance_reviews: {
        Row: {
          agent_rationale: string | null
          agent_verdict: string
          content_piece_id: string | null
          human_notes: string | null
          human_reviewer: string | null
          human_verdict: string | null
          id: number
          matched_patterns: string[] | null
          reviewed_at: string
        }
        Insert: {
          agent_rationale?: string | null
          agent_verdict: string
          content_piece_id?: string | null
          human_notes?: string | null
          human_reviewer?: string | null
          human_verdict?: string | null
          id?: number
          matched_patterns?: string[] | null
          reviewed_at?: string
        }
        Update: {
          agent_rationale?: string | null
          agent_verdict?: string
          content_piece_id?: string | null
          human_notes?: string | null
          human_reviewer?: string | null
          human_verdict?: string | null
          id?: number
          matched_patterns?: string[] | null
          reviewed_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "compliance_reviews_content_piece_id_fkey"
            columns: ["content_piece_id"]
            isOneToOne: false
            referencedRelation: "content_pieces"
            referencedColumns: ["id"]
          },
        ]
      }
      content_pieces: {
        Row: {
          compliance_flags: Json | null
          compliance_review_by: string | null
          created_at: string
          human_approved_by: string | null
          id: string
          published_at: string | null
          scheduled_at: string | null
          source_ref: string | null
          status: Database["growth_os"]["Enums"]["content_status"]
          target_channels: string[]
          topic: string
          updated_at: string
          variants: Json
        }
        Insert: {
          compliance_flags?: Json | null
          compliance_review_by?: string | null
          created_at?: string
          human_approved_by?: string | null
          id?: string
          published_at?: string | null
          scheduled_at?: string | null
          source_ref?: string | null
          status?: Database["growth_os"]["Enums"]["content_status"]
          target_channels: string[]
          topic: string
          updated_at?: string
          variants?: Json
        }
        Update: {
          compliance_flags?: Json | null
          compliance_review_by?: string | null
          created_at?: string
          human_approved_by?: string | null
          id?: string
          published_at?: string | null
          scheduled_at?: string | null
          source_ref?: string | null
          status?: Database["growth_os"]["Enums"]["content_status"]
          target_channels?: string[]
          topic?: string
          updated_at?: string
          variants?: Json
        }
        Relationships: []
      }
      crm_accounts: {
        Row: {
          account_type: string
          address: string | null
          city: string | null
          country: string
          created_at: string
          id: string
          last_contacted_at: string | null
          lat: number | null
          legal_name: string | null
          lng: number | null
          lost_reason: string | null
          main_email: string | null
          main_phone: string | null
          main_phone_e164: string | null
          metadata: Json
          name: string
          next_action_at: string | null
          owner_user_id: string | null
          priority: number
          province: string | null
          score: number
          source: string
          source_external_id: string | null
          source_url: string | null
          status: string
          tags: string[]
          updated_at: string
          website: string | null
          whatsapp_url: string | null
        }
        Insert: {
          account_type?: string
          address?: string | null
          city?: string | null
          country?: string
          created_at?: string
          id?: string
          last_contacted_at?: string | null
          lat?: number | null
          legal_name?: string | null
          lng?: number | null
          lost_reason?: string | null
          main_email?: string | null
          main_phone?: string | null
          main_phone_e164?: string | null
          metadata?: Json
          name: string
          next_action_at?: string | null
          owner_user_id?: string | null
          priority?: number
          province?: string | null
          score?: number
          source?: string
          source_external_id?: string | null
          source_url?: string | null
          status?: string
          tags?: string[]
          updated_at?: string
          website?: string | null
          whatsapp_url?: string | null
        }
        Update: {
          account_type?: string
          address?: string | null
          city?: string | null
          country?: string
          created_at?: string
          id?: string
          last_contacted_at?: string | null
          lat?: number | null
          legal_name?: string | null
          lng?: number | null
          lost_reason?: string | null
          main_email?: string | null
          main_phone?: string | null
          main_phone_e164?: string | null
          metadata?: Json
          name?: string
          next_action_at?: string | null
          owner_user_id?: string | null
          priority?: number
          province?: string | null
          score?: number
          source?: string
          source_external_id?: string | null
          source_url?: string | null
          status?: string
          tags?: string[]
          updated_at?: string
          website?: string | null
          whatsapp_url?: string | null
        }
        Relationships: []
      }
      crm_activities: {
        Row: {
          account_id: string | null
          activity_type: string
          body: string | null
          completed_at: string | null
          contact_id: string | null
          created_at: string
          created_by: string | null
          direction: string
          id: string
          metadata: Json
          opportunity_id: string | null
          outcome: string | null
          scheduled_at: string | null
          subject: string | null
        }
        Insert: {
          account_id?: string | null
          activity_type: string
          body?: string | null
          completed_at?: string | null
          contact_id?: string | null
          created_at?: string
          created_by?: string | null
          direction?: string
          id?: string
          metadata?: Json
          opportunity_id?: string | null
          outcome?: string | null
          scheduled_at?: string | null
          subject?: string | null
        }
        Update: {
          account_id?: string | null
          activity_type?: string
          body?: string | null
          completed_at?: string | null
          contact_id?: string | null
          created_at?: string
          created_by?: string | null
          direction?: string
          id?: string
          metadata?: Json
          opportunity_id?: string | null
          outcome?: string | null
          scheduled_at?: string | null
          subject?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "crm_activities_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "crm_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_activities_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "crm_contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_activities_opportunity_id_fkey"
            columns: ["opportunity_id"]
            isOneToOne: false
            referencedRelation: "crm_opportunities"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_contacts: {
        Row: {
          account_id: string
          consent_status: string
          created_at: string
          email: string | null
          full_name: string | null
          id: string
          is_primary: boolean
          metadata: Json
          phone: string | null
          phone_e164: string | null
          role_title: string | null
          updated_at: string
          whatsapp_url: string | null
        }
        Insert: {
          account_id: string
          consent_status?: string
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          is_primary?: boolean
          metadata?: Json
          phone?: string | null
          phone_e164?: string | null
          role_title?: string | null
          updated_at?: string
          whatsapp_url?: string | null
        }
        Update: {
          account_id?: string
          consent_status?: string
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          is_primary?: boolean
          metadata?: Json
          phone?: string | null
          phone_e164?: string | null
          role_title?: string | null
          updated_at?: string
          whatsapp_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "crm_contacts_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "crm_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_import_batches: {
        Row: {
          created_at: string
          filename: string | null
          id: string
          imported_by: string | null
          metadata: Json
          rows_inserted: number
          rows_skipped: number
          rows_total: number
          rows_updated: number
          source: string
        }
        Insert: {
          created_at?: string
          filename?: string | null
          id?: string
          imported_by?: string | null
          metadata?: Json
          rows_inserted?: number
          rows_skipped?: number
          rows_total?: number
          rows_updated?: number
          source: string
        }
        Update: {
          created_at?: string
          filename?: string | null
          id?: string
          imported_by?: string | null
          metadata?: Json
          rows_inserted?: number
          rows_skipped?: number
          rows_total?: number
          rows_updated?: number
          source?: string
        }
        Relationships: []
      }
      crm_opportunities: {
        Row: {
          account_id: string
          created_at: string
          currency: string
          expected_close_date: string | null
          id: string
          lost_reason: string | null
          metadata: Json
          owner_user_id: string | null
          probability: number
          stage: string
          title: string
          updated_at: string
          value_estimate: number | null
        }
        Insert: {
          account_id: string
          created_at?: string
          currency?: string
          expected_close_date?: string | null
          id?: string
          lost_reason?: string | null
          metadata?: Json
          owner_user_id?: string | null
          probability?: number
          stage?: string
          title: string
          updated_at?: string
          value_estimate?: number | null
        }
        Update: {
          account_id?: string
          created_at?: string
          currency?: string
          expected_close_date?: string | null
          id?: string
          lost_reason?: string | null
          metadata?: Json
          owner_user_id?: string | null
          probability?: number
          stage?: string
          title?: string
          updated_at?: string
          value_estimate?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "crm_opportunities_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "crm_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_suppression_list: {
        Row: {
          created_at: string
          created_by: string | null
          email: string | null
          id: string
          phone_e164: string | null
          reason: string
          source: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          email?: string | null
          id?: string
          phone_e164?: string | null
          reason: string
          source?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          email?: string | null
          id?: string
          phone_e164?: string | null
          reason?: string
          source?: string
        }
        Relationships: []
      }
      doctor_whatsapp_jobs: {
        Row: {
          appointment_id: string
          attempts: number
          created_at: string
          dedupe_key: string
          doctor_id: string
          id: string
          last_error: string | null
          message: string
          recipient_phone: string
          scheduled_for: string
          sent_at: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          appointment_id: string
          attempts?: number
          created_at?: string
          dedupe_key: string
          doctor_id: string
          id?: string
          last_error?: string | null
          message: string
          recipient_phone: string
          scheduled_for?: string
          sent_at?: string | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          appointment_id?: string
          attempts?: number
          created_at?: string
          dedupe_key?: string
          doctor_id?: string
          id?: string
          last_error?: string | null
          message?: string
          recipient_phone?: string
          scheduled_for?: string
          sent_at?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "doctor_whatsapp_jobs_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "appointment_notification_risks"
            referencedColumns: ["appointment_id"]
          },
          {
            foreignKeyName: "doctor_whatsapp_jobs_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "lead_attribution"
            referencedColumns: ["appointment_id"]
          },
        ]
      }
      email_events: {
        Row: {
          broadcast_id: string | null
          campaign_id: string | null
          event_type: string
          from_email: string | null
          id: number
          message_id: string | null
          occurred_at: string | null
          payload: Json
          processed_at: string | null
          processing_error: string | null
          provider: string
          provider_event_id: string | null
          received_at: string
          recipient_email: string | null
          recipient_emails: Json
          subject: string | null
          tags: Json
        }
        Insert: {
          broadcast_id?: string | null
          campaign_id?: string | null
          event_type: string
          from_email?: string | null
          id?: number
          message_id?: string | null
          occurred_at?: string | null
          payload: Json
          processed_at?: string | null
          processing_error?: string | null
          provider: string
          provider_event_id?: string | null
          received_at?: string
          recipient_email?: string | null
          recipient_emails?: Json
          subject?: string | null
          tags?: Json
        }
        Update: {
          broadcast_id?: string | null
          campaign_id?: string | null
          event_type?: string
          from_email?: string | null
          id?: number
          message_id?: string | null
          occurred_at?: string | null
          payload?: Json
          processed_at?: string | null
          processing_error?: string | null
          provider?: string
          provider_event_id?: string | null
          received_at?: string
          recipient_email?: string | null
          recipient_emails?: Json
          subject?: string | null
          tags?: Json
        }
        Relationships: []
      }
      email_jobs: {
        Row: {
          appointment_id: string | null
          attempts: number
          created_at: string
          dedupe_key: string
          id: string
          job_type: string
          last_error: string | null
          max_attempts: number
          nurturing_step_id: number | null
          patient_id: string | null
          provider: string | null
          provider_message_id: string | null
          recipient_email: string
          recipient_name: string | null
          scheduled_for: string
          sent_at: string | null
          status: string
          template_data: Json
          updated_at: string
          user_id: string | null
        }
        Insert: {
          appointment_id?: string | null
          attempts?: number
          created_at?: string
          dedupe_key: string
          id?: string
          job_type: string
          last_error?: string | null
          max_attempts?: number
          nurturing_step_id?: number | null
          patient_id?: string | null
          provider?: string | null
          provider_message_id?: string | null
          recipient_email: string
          recipient_name?: string | null
          scheduled_for?: string
          sent_at?: string | null
          status?: string
          template_data?: Json
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          appointment_id?: string | null
          attempts?: number
          created_at?: string
          dedupe_key?: string
          id?: string
          job_type?: string
          last_error?: string | null
          max_attempts?: number
          nurturing_step_id?: number | null
          patient_id?: string | null
          provider?: string | null
          provider_message_id?: string | null
          recipient_email?: string
          recipient_name?: string | null
          scheduled_for?: string
          sent_at?: string | null
          status?: string
          template_data?: Json
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "email_jobs_nurturing_step_id_fkey"
            columns: ["nurturing_step_id"]
            isOneToOne: false
            referencedRelation: "nurturing_steps"
            referencedColumns: ["id"]
          },
        ]
      }
      engagement_metrics: {
        Row: {
          channel: string
          clicks: number | null
          comments: number | null
          id: number
          impressions: number | null
          publish_log_id: number | null
          raw: Json | null
          reactions: number | null
          replies: number | null
          sampled_at: string
          sentiment: number | null
          shares: number | null
          window_period: string
        }
        Insert: {
          channel: string
          clicks?: number | null
          comments?: number | null
          id?: number
          impressions?: number | null
          publish_log_id?: number | null
          raw?: Json | null
          reactions?: number | null
          replies?: number | null
          sampled_at?: string
          sentiment?: number | null
          shares?: number | null
          window_period: string
        }
        Update: {
          channel?: string
          clicks?: number | null
          comments?: number | null
          id?: number
          impressions?: number | null
          publish_log_id?: number | null
          raw?: Json | null
          reactions?: number | null
          replies?: number | null
          sampled_at?: string
          sentiment?: number | null
          shares?: number | null
          window_period?: string
        }
        Relationships: [
          {
            foreignKeyName: "engagement_metrics_publish_log_id_fkey"
            columns: ["publish_log_id"]
            isOneToOne: false
            referencedRelation: "publish_log"
            referencedColumns: ["id"]
          },
        ]
      }
      geo_citations: {
        Row: {
          cited: boolean
          id: number
          llm: string
          position: number | null
          query: string
          response_excerpt: string | null
          sampled_at: string
        }
        Insert: {
          cited: boolean
          id?: number
          llm: string
          position?: number | null
          query: string
          response_excerpt?: string | null
          sampled_at?: string
        }
        Update: {
          cited?: boolean
          id?: number
          llm?: string
          position?: number | null
          query?: string
          response_excerpt?: string | null
          sampled_at?: string
        }
        Relationships: []
      }
      growth_events: {
        Row: {
          anonymous_id: string | null
          attribution: Json
          event_type: string
          id: number
          lead_id: string | null
          metadata: Json
          occurred_at: string
          page_url: string | null
          referrer: string | null
          session_id: string | null
          vertical: string | null
        }
        Insert: {
          anonymous_id?: string | null
          attribution?: Json
          event_type: string
          id?: number
          lead_id?: string | null
          metadata?: Json
          occurred_at?: string
          page_url?: string | null
          referrer?: string | null
          session_id?: string | null
          vertical?: string | null
        }
        Update: {
          anonymous_id?: string | null
          attribution?: Json
          event_type?: string
          id?: number
          lead_id?: string | null
          metadata?: Json
          occurred_at?: string
          page_url?: string | null
          referrer?: string | null
          session_id?: string | null
          vertical?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "growth_events_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "lead_attribution"
            referencedColumns: ["lead_id"]
          },
          {
            foreignKeyName: "growth_events_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      killswitch_state: {
        Row: {
          channel: string
          enabled: boolean
          reason: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          channel: string
          enabled?: boolean
          reason?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          channel?: string
          enabled?: boolean
          reason?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      leads: {
        Row: {
          attribution: Json
          consent_marketing: boolean
          consent_source: string | null
          created_at: string
          email: string
          email_normalized: string | null
          first_utm_campaign: string | null
          first_utm_content: string | null
          first_utm_medium: string | null
          first_utm_source: string | null
          first_utm_term: string | null
          form_id: string
          id: string
          intent: string
          metadata: Json
          name: string | null
          page_url: string | null
          phone: string | null
          referrer: string | null
          status: string
          updated_at: string
          vertical: string
        }
        Insert: {
          attribution?: Json
          consent_marketing?: boolean
          consent_source?: string | null
          created_at?: string
          email: string
          email_normalized?: string | null
          first_utm_campaign?: string | null
          first_utm_content?: string | null
          first_utm_medium?: string | null
          first_utm_source?: string | null
          first_utm_term?: string | null
          form_id?: string
          id?: string
          intent?: string
          metadata?: Json
          name?: string | null
          page_url?: string | null
          phone?: string | null
          referrer?: string | null
          status?: string
          updated_at?: string
          vertical?: string
        }
        Update: {
          attribution?: Json
          consent_marketing?: boolean
          consent_source?: string | null
          created_at?: string
          email?: string
          email_normalized?: string | null
          first_utm_campaign?: string | null
          first_utm_content?: string | null
          first_utm_medium?: string | null
          first_utm_source?: string | null
          first_utm_term?: string | null
          form_id?: string
          id?: string
          intent?: string
          metadata?: Json
          name?: string | null
          page_url?: string | null
          phone?: string | null
          referrer?: string | null
          status?: string
          updated_at?: string
          vertical?: string
        }
        Relationships: []
      }
      medical_claims_patterns: {
        Row: {
          category: string | null
          created_at: string
          enabled: boolean
          id: number
          note: string | null
          pattern: string
          severity: string
        }
        Insert: {
          category?: string | null
          created_at?: string
          enabled?: boolean
          id?: number
          note?: string | null
          pattern: string
          severity: string
        }
        Update: {
          category?: string | null
          created_at?: string
          enabled?: boolean
          id?: number
          note?: string | null
          pattern?: string
          severity?: string
        }
        Relationships: []
      }
      newsletter_editions: {
        Row: {
          candidates: Json
          created_at: string
          edition_date: string
          error_message: string | null
          html: string
          id: string
          provider: string | null
          provider_message_id: string | null
          sent_at: string | null
          status: string
          subject: string
          summaries: Json
          updated_at: string
        }
        Insert: {
          candidates?: Json
          created_at?: string
          edition_date: string
          error_message?: string | null
          html: string
          id?: string
          provider?: string | null
          provider_message_id?: string | null
          sent_at?: string | null
          status?: string
          subject: string
          summaries?: Json
          updated_at?: string
        }
        Update: {
          candidates?: Json
          created_at?: string
          edition_date?: string
          error_message?: string | null
          html?: string
          id?: string
          provider?: string | null
          provider_message_id?: string | null
          sent_at?: string | null
          status?: string
          subject?: string
          summaries?: Json
          updated_at?: string
        }
        Relationships: []
      }
      nurturing_sequences: {
        Row: {
          created_at: string
          enabled: boolean
          id: string
          name: string
          vertical: string
        }
        Insert: {
          created_at?: string
          enabled?: boolean
          id: string
          name: string
          vertical: string
        }
        Update: {
          created_at?: string
          enabled?: boolean
          id?: string
          name?: string
          vertical?: string
        }
        Relationships: []
      }
      nurturing_steps: {
        Row: {
          delay_hours: number
          enabled: boolean
          id: number
          sequence_id: string
          step_order: number
          subject: string
          template_key: string
        }
        Insert: {
          delay_hours: number
          enabled?: boolean
          id?: number
          sequence_id: string
          step_order: number
          subject: string
          template_key: string
        }
        Update: {
          delay_hours?: number
          enabled?: boolean
          id?: number
          sequence_id?: string
          step_order?: number
          subject?: string
          template_key?: string
        }
        Relationships: [
          {
            foreignKeyName: "nurturing_steps_sequence_id_fkey"
            columns: ["sequence_id"]
            isOneToOne: false
            referencedRelation: "nurturing_sequences"
            referencedColumns: ["id"]
          },
        ]
      }
      patient_activation: {
        Row: {
          acquired_at: string | null
          activated_at: string | null
          anamnesis_completed_at: string | null
          anamnesis_started_at: string | null
          appointment_booked_at: string | null
          churn_reason: string | null
          churned_at: string | null
          consultation_done_at: string | null
          created_at: string
          current_step: string
          days_to_activation: number | null
          dni_verified_at: string | null
          id: string
          lead_id: string | null
          metadata: Json
          prescription_sent_at: string | null
          profile_id: string | null
          source_channel: string
          source_detail: string | null
          triaged_at: string | null
          updated_at: string
          utm_campaign: string | null
          utm_medium: string | null
          utm_source: string | null
          whatsapp_linked_at: string | null
          whatsapp_phone: string | null
        }
        Insert: {
          acquired_at?: string | null
          activated_at?: string | null
          anamnesis_completed_at?: string | null
          anamnesis_started_at?: string | null
          appointment_booked_at?: string | null
          churn_reason?: string | null
          churned_at?: string | null
          consultation_done_at?: string | null
          created_at?: string
          current_step?: string
          days_to_activation?: number | null
          dni_verified_at?: string | null
          id?: string
          lead_id?: string | null
          metadata?: Json
          prescription_sent_at?: string | null
          profile_id?: string | null
          source_channel?: string
          source_detail?: string | null
          triaged_at?: string | null
          updated_at?: string
          utm_campaign?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          whatsapp_linked_at?: string | null
          whatsapp_phone?: string | null
        }
        Update: {
          acquired_at?: string | null
          activated_at?: string | null
          anamnesis_completed_at?: string | null
          anamnesis_started_at?: string | null
          appointment_booked_at?: string | null
          churn_reason?: string | null
          churned_at?: string | null
          consultation_done_at?: string | null
          created_at?: string
          current_step?: string
          days_to_activation?: number | null
          dni_verified_at?: string | null
          id?: string
          lead_id?: string | null
          metadata?: Json
          prescription_sent_at?: string | null
          profile_id?: string | null
          source_channel?: string
          source_detail?: string | null
          triaged_at?: string | null
          updated_at?: string
          utm_campaign?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          whatsapp_linked_at?: string | null
          whatsapp_phone?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "patient_activation_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "lead_attribution"
            referencedColumns: ["lead_id"]
          },
          {
            foreignKeyName: "patient_activation_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "patient_activation_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "lead_attribution"
            referencedColumns: ["user_id"]
          },
        ]
      }
      publish_log: {
        Row: {
          channel: string
          content_piece_id: string | null
          error_message: string | null
          external_id: string | null
          id: number
          payload: Json | null
          published_at: string
          status: string
        }
        Insert: {
          channel: string
          content_piece_id?: string | null
          error_message?: string | null
          external_id?: string | null
          id?: number
          payload?: Json | null
          published_at?: string
          status: string
        }
        Update: {
          channel?: string
          content_piece_id?: string | null
          error_message?: string | null
          external_id?: string | null
          id?: number
          payload?: Json | null
          published_at?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "publish_log_content_piece_id_fkey"
            columns: ["content_piece_id"]
            isOneToOne: false
            referencedRelation: "content_pieces"
            referencedColumns: ["id"]
          },
        ]
      }
      suppressed_notification_contacts: {
        Row: {
          channel: string
          contact_value: string
          created_at: string
          created_by: string | null
          id: string
          reason: string
          source: string
        }
        Insert: {
          channel: string
          contact_value: string
          created_at?: string
          created_by?: string | null
          id?: string
          reason: string
          source?: string
        }
        Update: {
          channel?: string
          contact_value?: string
          created_at?: string
          created_by?: string | null
          id?: string
          reason?: string
          source?: string
        }
        Relationships: []
      }
      system_flags: {
        Row: {
          key: string
          updated_at: string
          updated_by: string | null
          value: string
        }
        Insert: {
          key: string
          updated_at?: string
          updated_by?: string | null
          value: string
        }
        Update: {
          key?: string
          updated_at?: string
          updated_by?: string | null
          value?: string
        }
        Relationships: []
      }
      topic_queue: {
        Row: {
          attempts: number
          claimed_at: string | null
          claimed_by: string | null
          created_at: string
          error_message: string | null
          id: number
          notes: string | null
          priority: number
          result_content_piece_id: string | null
          scheduled_at: string
          source_ref: string | null
          status: string
          target_channels: string[]
          topic: string
          updated_at: string
        }
        Insert: {
          attempts?: number
          claimed_at?: string | null
          claimed_by?: string | null
          created_at?: string
          error_message?: string | null
          id?: number
          notes?: string | null
          priority?: number
          result_content_piece_id?: string | null
          scheduled_at?: string
          source_ref?: string | null
          status?: string
          target_channels?: string[]
          topic: string
          updated_at?: string
        }
        Update: {
          attempts?: number
          claimed_at?: string | null
          claimed_by?: string | null
          created_at?: string
          error_message?: string | null
          id?: number
          notes?: string | null
          priority?: number
          result_content_piece_id?: string | null
          scheduled_at?: string
          source_ref?: string | null
          status?: string
          target_channels?: string[]
          topic?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "topic_queue_result_content_piece_id_fkey"
            columns: ["result_content_piece_id"]
            isOneToOne: false
            referencedRelation: "content_pieces"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      activation_funnel: {
        Row: {
          acquired: number | null
          activated: number | null
          anamnesis_done: number | null
          avg_days_to_activation: number | null
          booked: number | null
          churned: number | null
          consulted: number | null
          dni_ok: number | null
          linked: number | null
          source_channel: string | null
          triaged: number | null
        }
        Relationships: []
      }
      appointment_notification_risks: {
        Row: {
          appointment_id: string | null
          doctor_email: string | null
          doctor_email_enqueued: boolean | null
          doctor_id: string | null
          doctor_phone: string | null
          doctor_portal_notification_enqueued: boolean | null
          doctor_user_id: string | null
          doctor_whatsapp_enqueued: boolean | null
          patient_id: string | null
          patient_phone: string | null
          patient_user_id: string | null
          patient_whatsapp_reminder_enqueued: boolean | null
          risk_reasons: string[] | null
          start_time: string | null
          status: string | null
          urgency: string | null
        }
        Relationships: [
          {
            foreignKeyName: "appointments_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "lead_attribution"
            referencedColumns: ["patient_id"]
          },
          {
            foreignKeyName: "doctors_user_id_fkey"
            columns: ["doctor_user_id"]
            isOneToOne: true
            referencedRelation: "lead_attribution"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "patients_user_id_fkey"
            columns: ["patient_user_id"]
            isOneToOne: true
            referencedRelation: "lead_attribution"
            referencedColumns: ["user_id"]
          },
        ]
      }
      daily_activation_cohort: {
        Row: {
          activated: number | null
          activation_rate_pct: number | null
          churned: number | null
          cohort_date: string | null
          source_channel: string | null
          total_acquired: number | null
        }
        Relationships: []
      }
      lead_attribution: {
        Row: {
          appointment_id: string | null
          appointment_status: string | null
          appointment_time: string | null
          converted_to_appointment: boolean | null
          converted_to_revenue: boolean | null
          first_utm_campaign: string | null
          first_utm_medium: string | null
          first_utm_source: string | null
          form_id: string | null
          hours_to_appointment: number | null
          hours_to_payment: number | null
          intent: string | null
          lead_created_at: string | null
          lead_email: string | null
          lead_id: string | null
          lead_status: string | null
          patient_id: string | null
          payment_amount: number | null
          payment_date: string | null
          payment_id: string | null
          payment_status: string | null
          user_id: string | null
          vertical: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      claim_due_agent_jobs: {
        Args: { batch_size?: number }
        Returns: {
          agent_type: string
          appointment_id: string | null
          attempts: number
          channel: string
          created_at: string
          id: string
          idempotency_key: string
          last_error: string | null
          lead_id: string | null
          payload: Json
          scheduled_for: string
          source_id: string | null
          source_table: string | null
          status: string
          trigger_type: string
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "agent_jobs"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      claim_next_topic: {
        Args: { p_claimed_by: string }
        Returns: {
          attempts: number
          claimed_at: string | null
          claimed_by: string | null
          created_at: string
          error_message: string | null
          id: number
          notes: string | null
          priority: number
          result_content_piece_id: string | null
          scheduled_at: string
          source_ref: string | null
          status: string
          target_channels: string[]
          topic: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "topic_queue"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      dashboard_summary: { Args: { days_back?: number }; Returns: Json }
      enqueue_anamnesis_reminders: {
        Args: { batch_limit?: number; min_profile_age?: string }
        Returns: number
      }
      enqueue_nurturing_emails: {
        Args: { batch_limit?: number }
        Returns: number
      }
      is_channel_enabled: { Args: { ch: string }; Returns: boolean }
      is_notification_contact_suppressed: {
        Args: { contact_channel: string; contact_value: string }
        Returns: boolean
      }
      normalize_notification_contact: {
        Args: { contact_channel: string; contact_value: string }
        Returns: string
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
    }
    Enums: {
      content_status:
        | "draft"
        | "compliance_review"
        | "approved"
        | "scheduled"
        | "published"
        | "failed"
        | "killed"
    }
    CompositeTypes: {
      [_ in never]: never
    }
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
      appointment_followups: {
        Row: {
          appointment_id: string | null
          call_id: string | null
          channel: string
          created_at: string
          dedupe_key: string
          doctor_id: string
          doctor_name: string | null
          event_type: string
          id: string
          last_error: string | null
          message: string
          metadata: Json | null
          patient_id: string
          patient_name: string | null
          recipient_phone: string
          retry_count: number
          scheduled_for: string
          sent_at: string | null
          status: string
          updated_at: string
        }
        Insert: {
          appointment_id?: string | null
          call_id?: string | null
          channel?: string
          created_at?: string
          dedupe_key: string
          doctor_id: string
          doctor_name?: string | null
          event_type?: string
          id?: string
          last_error?: string | null
          message: string
          metadata?: Json | null
          patient_id: string
          patient_name?: string | null
          recipient_phone: string
          retry_count?: number
          scheduled_for: string
          sent_at?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          appointment_id?: string | null
          call_id?: string | null
          channel?: string
          created_at?: string
          dedupe_key?: string
          doctor_id?: string
          doctor_name?: string | null
          event_type?: string
          id?: string
          last_error?: string | null
          message?: string
          metadata?: Json | null
          patient_id?: string
          patient_name?: string | null
          recipient_phone?: string
          retry_count?: number
          scheduled_for?: string
          sent_at?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "appointment_followups_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointment_followups_call_id_fkey"
            columns: ["call_id"]
            isOneToOne: false
            referencedRelation: "calls"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointment_followups_doctor_id_fkey"
            columns: ["doctor_id"]
            isOneToOne: false
            referencedRelation: "doctors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointment_followups_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
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
      benefit_catalog_items: {
        Row: {
          category: Database["public"]["Enums"]["benefit_catalog_category"]
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          market_reference_price_cents: number
          metadata: Json
          name: string
          negotiated_b2b_cost_cents: number
          partner_id: string | null
          partner_name: string
          redemption_credits: number
          updated_at: string
        }
        Insert: {
          category: Database["public"]["Enums"]["benefit_catalog_category"]
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          market_reference_price_cents: number
          metadata?: Json
          name: string
          negotiated_b2b_cost_cents: number
          partner_id?: string | null
          partner_name: string
          redemption_credits: number
          updated_at?: string
        }
        Update: {
          category?: Database["public"]["Enums"]["benefit_catalog_category"]
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          market_reference_price_cents?: number
          metadata?: Json
          name?: string
          negotiated_b2b_cost_cents?: number
          partner_id?: string | null
          partner_name?: string
          redemption_credits?: number
          updated_at?: string
        }
        Relationships: []
      }
      benefit_vouchers: {
        Row: {
          b2b_cost_cents: number
          catalog_item_id: string
          copay_amount_cents: number
          created_at: string
          credits_spent: number
          expires_at: string
          id: string
          metadata: Json
          patient_id: string
          redeemed_at: string | null
          redeemed_by_partner: string | null
          reserve_id: string
          status: Database["public"]["Enums"]["voucher_status"]
          updated_at: string
          voucher_code: string
        }
        Insert: {
          b2b_cost_cents: number
          catalog_item_id: string
          copay_amount_cents?: number
          created_at?: string
          credits_spent: number
          expires_at?: string
          id?: string
          metadata?: Json
          patient_id: string
          redeemed_at?: string | null
          redeemed_by_partner?: string | null
          reserve_id: string
          status?: Database["public"]["Enums"]["voucher_status"]
          updated_at?: string
          voucher_code: string
        }
        Update: {
          b2b_cost_cents?: number
          catalog_item_id?: string
          copay_amount_cents?: number
          created_at?: string
          credits_spent?: number
          expires_at?: string
          id?: string
          metadata?: Json
          patient_id?: string
          redeemed_at?: string | null
          redeemed_by_partner?: string | null
          reserve_id?: string
          status?: Database["public"]["Enums"]["voucher_status"]
          updated_at?: string
          voucher_code?: string
        }
        Relationships: [
          {
            foreignKeyName: "benefit_vouchers_catalog_item_id_fkey"
            columns: ["catalog_item_id"]
            isOneToOne: false
            referencedRelation: "benefit_catalog_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "benefit_vouchers_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "benefit_vouchers_reserve_id_fkey"
            columns: ["reserve_id"]
            isOneToOne: false
            referencedRelation: "patient_health_reserves"
            referencedColumns: ["id"]
          },
        ]
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
      care_episodes: {
        Row: {
          closed_at: string | null
          created_at: string
          doctor_id: string
          funding_source: string
          id: string
          included_ceeds_reviews: number
          metadata: Json
          opened_at: string
          patient_id: string
          patient_visible_label: string
          pricing_model: string
          source_appointment_id: string
          source_payment_id: string | null
          status: string
          updated_at: string
          used_ceeds_reviews: number
          valid_until: string
        }
        Insert: {
          closed_at?: string | null
          created_at?: string
          doctor_id: string
          funding_source?: string
          id?: string
          included_ceeds_reviews?: number
          metadata?: Json
          opened_at?: string
          patient_id: string
          patient_visible_label?: string
          pricing_model?: string
          source_appointment_id: string
          source_payment_id?: string | null
          status?: string
          updated_at?: string
          used_ceeds_reviews?: number
          valid_until?: string
        }
        Update: {
          closed_at?: string | null
          created_at?: string
          doctor_id?: string
          funding_source?: string
          id?: string
          included_ceeds_reviews?: number
          metadata?: Json
          opened_at?: string
          patient_id?: string
          patient_visible_label?: string
          pricing_model?: string
          source_appointment_id?: string
          source_payment_id?: string | null
          status?: string
          updated_at?: string
          used_ceeds_reviews?: number
          valid_until?: string
        }
        Relationships: [
          {
            foreignKeyName: "care_episodes_doctor_id_fkey"
            columns: ["doctor_id"]
            isOneToOne: false
            referencedRelation: "doctors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "care_episodes_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "care_episodes_source_appointment_id_fkey"
            columns: ["source_appointment_id"]
            isOneToOne: true
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "care_episodes_source_payment_id_fkey"
            columns: ["source_payment_id"]
            isOneToOne: false
            referencedRelation: "appointment_payments"
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
          care_episode_id: string | null
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
          source_appointment_id: string | null
          status: string
          updated_at: string
        }
        Insert: {
          care_episode_id?: string | null
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
          source_appointment_id?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          care_episode_id?: string | null
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
          source_appointment_id?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "clinical_incidents_care_episode_id_fkey"
            columns: ["care_episode_id"]
            isOneToOne: false
            referencedRelation: "care_episodes"
            referencedColumns: ["id"]
          },
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
          {
            foreignKeyName: "clinical_incidents_source_appointment_id_fkey"
            columns: ["source_appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
        ]
      }
      clinical_outbox_events: {
        Row: {
          created_at: string
          error_message: string | null
          event_type: string
          id: string
          payload: Json
          processed_at: string | null
          retry_count: number
          status: string
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          event_type: string
          id?: string
          payload: Json
          processed_at?: string | null
          retry_count?: number
          status?: string
        }
        Update: {
          created_at?: string
          error_message?: string | null
          event_type?: string
          id?: string
          payload?: Json
          processed_at?: string | null
          retry_count?: number
          status?: string
        }
        Relationships: []
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
      clinics: {
        Row: {
          cnpj: string | null
          created_at: string
          dpo_email: string | null
          dpo_name: string | null
          id: string
          name: string
          owner_id: string | null
          updated_at: string
        }
        Insert: {
          cnpj?: string | null
          created_at?: string
          dpo_email?: string | null
          dpo_name?: string | null
          id?: string
          name: string
          owner_id?: string | null
          updated_at?: string
        }
        Update: {
          cnpj?: string | null
          created_at?: string
          dpo_email?: string | null
          dpo_name?: string | null
          id?: string
          name?: string
          owner_id?: string | null
          updated_at?: string
        }
        Relationships: []
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
      consultation_transcripts: {
        Row: {
          appointment_id: string | null
          consent_doctor: boolean
          consent_patient: boolean
          created_at: string
          doctor_id: string
          duration_seconds: number | null
          full_text: string
          id: string
          lang: string
          patient_id: string
          room_id: string
          segments: Json
          updated_at: string
          word_count: number
        }
        Insert: {
          appointment_id?: string | null
          consent_doctor?: boolean
          consent_patient?: boolean
          created_at?: string
          doctor_id: string
          duration_seconds?: number | null
          full_text: string
          id?: string
          lang?: string
          patient_id: string
          room_id: string
          segments?: Json
          updated_at?: string
          word_count?: number
        }
        Update: {
          appointment_id?: string | null
          consent_doctor?: boolean
          consent_patient?: boolean
          created_at?: string
          doctor_id?: string
          duration_seconds?: number | null
          full_text?: string
          id?: string
          lang?: string
          patient_id?: string
          room_id?: string
          segments?: Json
          updated_at?: string
          word_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "consultation_transcripts_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "consultation_transcripts_doctor_id_fkey"
            columns: ["doctor_id"]
            isOneToOne: false
            referencedRelation: "doctors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "consultation_transcripts_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
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
      doctor_clinical_work_units: {
        Row: {
          care_episode_id: string | null
          clinical_incident_id: string | null
          created_at: string
          currency: string
          doctor_id: string
          funded_by: string
          gross_internal_amount: number
          id: string
          metadata: Json
          minutes_estimated: number
          patient_billable: boolean
          patient_id: string
          performed_at: string | null
          source_appointment_id: string | null
          status: string
          updated_at: string
          work_type: string
        }
        Insert: {
          care_episode_id?: string | null
          clinical_incident_id?: string | null
          created_at?: string
          currency?: string
          doctor_id: string
          funded_by?: string
          gross_internal_amount?: number
          id?: string
          metadata?: Json
          minutes_estimated?: number
          patient_billable?: boolean
          patient_id: string
          performed_at?: string | null
          source_appointment_id?: string | null
          status?: string
          updated_at?: string
          work_type: string
        }
        Update: {
          care_episode_id?: string | null
          clinical_incident_id?: string | null
          created_at?: string
          currency?: string
          doctor_id?: string
          funded_by?: string
          gross_internal_amount?: number
          id?: string
          metadata?: Json
          minutes_estimated?: number
          patient_billable?: boolean
          patient_id?: string
          performed_at?: string | null
          source_appointment_id?: string | null
          status?: string
          updated_at?: string
          work_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "doctor_clinical_work_units_care_episode_id_fkey"
            columns: ["care_episode_id"]
            isOneToOne: false
            referencedRelation: "care_episodes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "doctor_clinical_work_units_clinical_incident_id_fkey"
            columns: ["clinical_incident_id"]
            isOneToOne: false
            referencedRelation: "clinical_incidents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "doctor_clinical_work_units_doctor_id_fkey"
            columns: ["doctor_id"]
            isOneToOne: false
            referencedRelation: "doctors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "doctor_clinical_work_units_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "doctor_clinical_work_units_source_appointment_id_fkey"
            columns: ["source_appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
        ]
      }
      doctor_duty_status: {
        Row: {
          active_tiers: Database["public"]["Enums"]["dispatch_tier_category"][]
          current_active_request_id: string | null
          doctor_id: string
          duty_started_at: string | null
          is_on_duty: boolean
          last_heartbeat_at: string
          updated_at: string
        }
        Insert: {
          active_tiers?: Database["public"]["Enums"]["dispatch_tier_category"][]
          current_active_request_id?: string | null
          doctor_id: string
          duty_started_at?: string | null
          is_on_duty?: boolean
          last_heartbeat_at?: string
          updated_at?: string
        }
        Update: {
          active_tiers?: Database["public"]["Enums"]["dispatch_tier_category"][]
          current_active_request_id?: string | null
          doctor_id?: string
          duty_started_at?: string | null
          is_on_duty?: boolean
          last_heartbeat_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "doctor_duty_status_doctor_id_fkey"
            columns: ["doctor_id"]
            isOneToOne: true
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
      doctor_licenses: {
        Row: {
          cfm_evidence_path: string | null
          cfm_last_checked_at: string | null
          cfm_review_notes: string | null
          cfm_reviewed_at: string | null
          cfm_reviewed_by: string | null
          cfm_validation_status: string | null
          created_at: string
          doctor_id: string
          id: string
          issued_at: string | null
          issued_by: string | null
          license_number: string
          license_type: string
          province: string | null
          sisa_book: string | null
          sisa_folio: string | null
          sisa_record: string | null
          status: string
          uf_brazil: string | null
          updated_at: string
        }
        Insert: {
          cfm_evidence_path?: string | null
          cfm_last_checked_at?: string | null
          cfm_review_notes?: string | null
          cfm_reviewed_at?: string | null
          cfm_reviewed_by?: string | null
          cfm_validation_status?: string | null
          created_at?: string
          doctor_id: string
          id?: string
          issued_at?: string | null
          issued_by?: string | null
          license_number: string
          license_type: string
          province?: string | null
          sisa_book?: string | null
          sisa_folio?: string | null
          sisa_record?: string | null
          status?: string
          uf_brazil?: string | null
          updated_at?: string
        }
        Update: {
          cfm_evidence_path?: string | null
          cfm_last_checked_at?: string | null
          cfm_review_notes?: string | null
          cfm_reviewed_at?: string | null
          cfm_reviewed_by?: string | null
          cfm_validation_status?: string | null
          created_at?: string
          doctor_id?: string
          id?: string
          issued_at?: string | null
          issued_by?: string | null
          license_number?: string
          license_type?: string
          province?: string | null
          sisa_book?: string | null
          sisa_folio?: string | null
          sisa_record?: string | null
          status?: string
          uf_brazil?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "doctor_licenses_doctor_id_fkey"
            columns: ["doctor_id"]
            isOneToOne: false
            referencedRelation: "doctors"
            referencedColumns: ["id"]
          },
        ]
      }
      doctor_on_duty_sessions: {
        Row: {
          doctor_id: string
          ended_at: string | null
          id: string
          last_heartbeat_at: string
          metadata: Json
          started_at: string
          status: string
        }
        Insert: {
          doctor_id: string
          ended_at?: string | null
          id?: string
          last_heartbeat_at?: string
          metadata?: Json
          started_at?: string
          status?: string
        }
        Update: {
          doctor_id?: string
          ended_at?: string | null
          id?: string
          last_heartbeat_at?: string
          metadata?: Json
          started_at?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "doctor_on_duty_sessions_doctor_id_fkey"
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
      doctor_specialties: {
        Row: {
          certification_entity: string | null
          certified_at: string | null
          created_at: string
          crm_conselho_regional: string | null
          doctor_id: string
          expires_at: string | null
          id: string
          rqe_number: string | null
          rqe_uf: string | null
          sisa_specialty_code: string | null
          specialty_name: string
          updated_at: string
        }
        Insert: {
          certification_entity?: string | null
          certified_at?: string | null
          created_at?: string
          crm_conselho_regional?: string | null
          doctor_id: string
          expires_at?: string | null
          id?: string
          rqe_number?: string | null
          rqe_uf?: string | null
          sisa_specialty_code?: string | null
          specialty_name: string
          updated_at?: string
        }
        Update: {
          certification_entity?: string | null
          certified_at?: string | null
          created_at?: string
          crm_conselho_regional?: string | null
          doctor_id?: string
          expires_at?: string | null
          id?: string
          rqe_number?: string | null
          rqe_uf?: string | null
          sisa_specialty_code?: string | null
          specialty_name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "doctor_specialties_doctor_id_fkey"
            columns: ["doctor_id"]
            isOneToOne: false
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
          active_duty_tiers: string[]
          bank_alias: string | null
          bank_cbu_cvu: string | null
          bank_name: string | null
          bio: string | null
          care_guide_template: string | null
          certifications: Json | null
          clinic_id: string | null
          consultation_fee: number | null
          cpf: string | null
          created_at: string | null
          education: Json | null
          enabled_service_tiers: string[]
          enrollment_entity: string | null
          enrollment_jurisdiction: string | null
          free_videoconsultas_remaining: number
          id: string
          languages: Json | null
          license_number: string
          license_type: string | null
          on_duty_pharmacy: boolean
          on_duty_since: string | null
          payout_alias: string | null
          payout_cbu: string | null
          payout_pix_key: string | null
          professional_address: string | null
          refeps_id: string | null
          rqe_number: string | null
          schedule: Json | null
          signature_image_url: string | null
          signature_url: string | null
          specialty: string
          stamp_image_url: string | null
          stamp_url: string | null
          subspecialty: string | null
          timezone: string
          uf_brazil: string | null
          updated_at: string | null
          user_id: string | null
          years_experience: number | null
        }
        Insert: {
          accepted_insurance?: Json | null
          active?: boolean | null
          active_duty_tiers?: string[]
          bank_alias?: string | null
          bank_cbu_cvu?: string | null
          bank_name?: string | null
          bio?: string | null
          care_guide_template?: string | null
          certifications?: Json | null
          clinic_id?: string | null
          consultation_fee?: number | null
          cpf?: string | null
          created_at?: string | null
          education?: Json | null
          enabled_service_tiers?: string[]
          enrollment_entity?: string | null
          enrollment_jurisdiction?: string | null
          free_videoconsultas_remaining?: number
          id?: string
          languages?: Json | null
          license_number: string
          license_type?: string | null
          on_duty_pharmacy?: boolean
          on_duty_since?: string | null
          payout_alias?: string | null
          payout_cbu?: string | null
          payout_pix_key?: string | null
          professional_address?: string | null
          refeps_id?: string | null
          rqe_number?: string | null
          schedule?: Json | null
          signature_image_url?: string | null
          signature_url?: string | null
          specialty: string
          stamp_image_url?: string | null
          stamp_url?: string | null
          subspecialty?: string | null
          timezone?: string
          uf_brazil?: string | null
          updated_at?: string | null
          user_id?: string | null
          years_experience?: number | null
        }
        Update: {
          accepted_insurance?: Json | null
          active?: boolean | null
          active_duty_tiers?: string[]
          bank_alias?: string | null
          bank_cbu_cvu?: string | null
          bank_name?: string | null
          bio?: string | null
          care_guide_template?: string | null
          certifications?: Json | null
          clinic_id?: string | null
          consultation_fee?: number | null
          cpf?: string | null
          created_at?: string | null
          education?: Json | null
          enabled_service_tiers?: string[]
          enrollment_entity?: string | null
          enrollment_jurisdiction?: string | null
          free_videoconsultas_remaining?: number
          id?: string
          languages?: Json | null
          license_number?: string
          license_type?: string | null
          on_duty_pharmacy?: boolean
          on_duty_since?: string | null
          payout_alias?: string | null
          payout_cbu?: string | null
          payout_pix_key?: string | null
          professional_address?: string | null
          refeps_id?: string | null
          rqe_number?: string | null
          schedule?: Json | null
          signature_image_url?: string | null
          signature_url?: string | null
          specialty?: string
          stamp_image_url?: string | null
          stamp_url?: string | null
          subspecialty?: string | null
          timezone?: string
          uf_brazil?: string | null
          updated_at?: string | null
          user_id?: string | null
          years_experience?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "doctors_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
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
      juegos_leaderboard: {
        Row: {
          creado_at: string
          id: string
          juego_id: string
          nombre: string
          tiempo_segundos: number
        }
        Insert: {
          creado_at?: string
          id?: string
          juego_id?: string
          nombre: string
          tiempo_segundos: number
        }
        Update: {
          creado_at?: string
          id?: string
          juego_id?: string
          nombre?: string
          tiempo_segundos?: number
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
      medical_certificates: {
        Row: {
          appointment_id: string | null
          certificate_type: string
          country_code: string
          created_at: string
          cuir: string
          days_of_rest: number
          diagnosis: string | null
          doctor_id: string
          end_date: string | null
          hide_diagnosis: boolean
          id: string
          observations: string | null
          patient_id: string
          qr_code_content: string | null
          signed_pdf_url: string | null
          start_date: string
          status: string
          updated_at: string
        }
        Insert: {
          appointment_id?: string | null
          certificate_type: string
          country_code?: string
          created_at?: string
          cuir: string
          days_of_rest?: number
          diagnosis?: string | null
          doctor_id: string
          end_date?: string | null
          hide_diagnosis?: boolean
          id?: string
          observations?: string | null
          patient_id: string
          qr_code_content?: string | null
          signed_pdf_url?: string | null
          start_date?: string
          status?: string
          updated_at?: string
        }
        Update: {
          appointment_id?: string | null
          certificate_type?: string
          country_code?: string
          created_at?: string
          cuir?: string
          days_of_rest?: number
          diagnosis?: string | null
          doctor_id?: string
          end_date?: string | null
          hide_diagnosis?: boolean
          id?: string
          observations?: string | null
          patient_id?: string
          qr_code_content?: string | null
          signed_pdf_url?: string | null
          start_date?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "medical_certificates_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "medical_certificates_doctor_id_fkey"
            columns: ["doctor_id"]
            isOneToOne: false
            referencedRelation: "doctors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "medical_certificates_patient_id_fkey"
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
      medications_cmed_br: {
        Row: {
          apresentacao: string
          ativo: boolean
          classe_terapeutica: string | null
          created_at: string
          id: string
          laboratorio: string
          lista_portaria_344: string | null
          nome_comercial: string
          preco_maximo_consumidor: number | null
          principio_ativo: string
          registro_anvisa: string
          tarja: string | null
          tipo_receita: string
        }
        Insert: {
          apresentacao: string
          ativo?: boolean
          classe_terapeutica?: string | null
          created_at?: string
          id?: string
          laboratorio: string
          lista_portaria_344?: string | null
          nome_comercial: string
          preco_maximo_consumidor?: number | null
          principio_ativo: string
          registro_anvisa: string
          tarja?: string | null
          tipo_receita?: string
        }
        Update: {
          apresentacao?: string
          ativo?: boolean
          classe_terapeutica?: string | null
          created_at?: string
          id?: string
          laboratorio?: string
          lista_portaria_344?: string | null
          nome_comercial?: string
          preco_maximo_consumidor?: number | null
          principio_ativo?: string
          registro_anvisa?: string
          tarja?: string | null
          tipo_receita?: string
        }
        Relationships: []
      }
      notification_queue: {
        Row: {
          attempts: number
          body: string
          created_at: string
          data: Json | null
          dedupe_key: string | null
          deep_link: string | null
          id: string
          last_error: string | null
          scheduled_at: string
          sent_at: string | null
          status: string
          title: string
          type: string
          updated_at: string
          user_id: string
        }
        Insert: {
          attempts?: number
          body: string
          created_at?: string
          data?: Json | null
          dedupe_key?: string | null
          deep_link?: string | null
          id?: string
          last_error?: string | null
          scheduled_at?: string
          sent_at?: string | null
          status?: string
          title: string
          type?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          attempts?: number
          body?: string
          created_at?: string
          data?: Json | null
          dedupe_key?: string | null
          deep_link?: string | null
          id?: string
          last_error?: string | null
          scheduled_at?: string
          sent_at?: string | null
          status?: string
          title?: string
          type?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
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
      partner_settlements: {
        Row: {
          created_at: string
          id: string
          partner_id: string
          period_end: string
          period_start: string
          reference_code: string | null
          settled_at: string | null
          status: Database["public"]["Enums"]["partner_settlement_status"]
          total_payout_cents: number
          updated_at: string
          vouchers_count: number
        }
        Insert: {
          created_at?: string
          id?: string
          partner_id: string
          period_end: string
          period_start: string
          reference_code?: string | null
          settled_at?: string | null
          status?: Database["public"]["Enums"]["partner_settlement_status"]
          total_payout_cents: number
          updated_at?: string
          vouchers_count: number
        }
        Update: {
          created_at?: string
          id?: string
          partner_id?: string
          period_end?: string
          period_start?: string
          reference_code?: string | null
          settled_at?: string | null
          status?: Database["public"]["Enums"]["partner_settlement_status"]
          total_payout_cents?: number
          updated_at?: string
          vouchers_count?: number
        }
        Relationships: []
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
      patient_health_reserve_ledger: {
        Row: {
          amount_credits: number
          appointment_id: string | null
          balance_after: number
          created_at: string
          id: string
          kind: Database["public"]["Enums"]["reserve_transaction_kind"]
          metadata: Json
          patient_id: string
          ref: string
          reserve_id: string
          voucher_id: string | null
        }
        Insert: {
          amount_credits: number
          appointment_id?: string | null
          balance_after: number
          created_at?: string
          id?: string
          kind: Database["public"]["Enums"]["reserve_transaction_kind"]
          metadata?: Json
          patient_id: string
          ref: string
          reserve_id: string
          voucher_id?: string | null
        }
        Update: {
          amount_credits?: number
          appointment_id?: string | null
          balance_after?: number
          created_at?: string
          id?: string
          kind?: Database["public"]["Enums"]["reserve_transaction_kind"]
          metadata?: Json
          patient_id?: string
          ref?: string
          reserve_id?: string
          voucher_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "patient_health_reserve_ledger_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "patient_health_reserve_ledger_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "patient_health_reserve_ledger_reserve_id_fkey"
            columns: ["reserve_id"]
            isOneToOne: false
            referencedRelation: "patient_health_reserves"
            referencedColumns: ["id"]
          },
        ]
      }
      patient_health_reserves: {
        Row: {
          benefit_balance: number
          created_at: string
          id: string
          max_cap_credits: number
          patient_id: string
          status: string
          updated_at: string
        }
        Insert: {
          benefit_balance?: number
          created_at?: string
          id?: string
          max_cap_credits?: number
          patient_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          benefit_balance?: number
          created_at?: string
          id?: string
          max_cap_credits?: number
          patient_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "patient_health_reserves_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: true
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
      patient_subscriptions: {
        Row: {
          cancelled_at: string | null
          created_at: string
          currency: string
          current_period_end: string
          current_period_start: string
          id: string
          patient_id: string
          payment_provider: string | null
          price_cents: number
          provider_subscription_id: string | null
          status: Database["public"]["Enums"]["patient_subscription_status"]
          tier: Database["public"]["Enums"]["patient_subscription_tier"]
          updated_at: string
        }
        Insert: {
          cancelled_at?: string | null
          created_at?: string
          currency?: string
          current_period_end?: string
          current_period_start?: string
          id?: string
          patient_id: string
          payment_provider?: string | null
          price_cents?: number
          provider_subscription_id?: string | null
          status?: Database["public"]["Enums"]["patient_subscription_status"]
          tier?: Database["public"]["Enums"]["patient_subscription_tier"]
          updated_at?: string
        }
        Update: {
          cancelled_at?: string | null
          created_at?: string
          currency?: string
          current_period_end?: string
          current_period_start?: string
          id?: string
          patient_id?: string
          payment_provider?: string | null
          price_cents?: number
          provider_subscription_id?: string | null
          status?: Database["public"]["Enums"]["patient_subscription_status"]
          tier?: Database["public"]["Enums"]["patient_subscription_tier"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "patient_subscriptions_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: true
            referencedRelation: "patients"
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
      patient_wallet_ledger: {
        Row: {
          amount_cents: number
          appointment_id: string | null
          appointment_payment_id: string | null
          balance_after_cents: number
          created_at: string
          created_by: string | null
          currency: string
          expires_at: string | null
          id: string
          kind: string
          metadata: Json
          patient_id: string
          reason: string | null
          ref: string
        }
        Insert: {
          amount_cents: number
          appointment_id?: string | null
          appointment_payment_id?: string | null
          balance_after_cents: number
          created_at?: string
          created_by?: string | null
          currency?: string
          expires_at?: string | null
          id?: string
          kind: string
          metadata?: Json
          patient_id: string
          reason?: string | null
          ref: string
        }
        Update: {
          amount_cents?: number
          appointment_id?: string | null
          appointment_payment_id?: string | null
          balance_after_cents?: number
          created_at?: string
          created_by?: string | null
          currency?: string
          expires_at?: string | null
          id?: string
          kind?: string
          metadata?: Json
          patient_id?: string
          reason?: string | null
          ref?: string
        }
        Relationships: [
          {
            foreignKeyName: "patient_wallet_ledger_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "patient_wallet_ledger_appointment_payment_id_fkey"
            columns: ["appointment_payment_id"]
            isOneToOne: false
            referencedRelation: "appointment_payments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "patient_wallet_ledger_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      patient_wallets: {
        Row: {
          available_credit_cents: number
          created_at: string
          currency: string
          id: string
          locked_credit_cents: number
          patient_id: string
          updated_at: string
        }
        Insert: {
          available_credit_cents?: number
          created_at?: string
          currency?: string
          id?: string
          locked_credit_cents?: number
          patient_id: string
          updated_at?: string
        }
        Update: {
          available_credit_cents?: number
          created_at?: string
          currency?: string
          id?: string
          locked_credit_cents?: number
          patient_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "patient_wallets_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: true
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      patients: {
        Row: {
          active: boolean | null
          address: string | null
          allergies: Json | null
          birth_date: string | null
          blood_type: string | null
          cns: string | null
          cpf: string | null
          created_at: string | null
          cuil: string | null
          dni: string | null
          emergency_contact: Json | null
          free_consultations_remaining: number
          gender: string | null
          height_cm: number | null
          id: string
          insurance_info: Json | null
          lgpd_consent: boolean | null
          lgpd_consent_date: string | null
          lgpd_consent_version: string
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
          cns?: string | null
          cpf?: string | null
          created_at?: string | null
          cuil?: string | null
          dni?: string | null
          emergency_contact?: Json | null
          free_consultations_remaining?: number
          gender?: string | null
          height_cm?: number | null
          id?: string
          insurance_info?: Json | null
          lgpd_consent?: boolean | null
          lgpd_consent_date?: string | null
          lgpd_consent_version?: string
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
          cns?: string | null
          cpf?: string | null
          created_at?: string | null
          cuil?: string | null
          dni?: string | null
          emergency_contact?: Json | null
          free_consultations_remaining?: number
          gender?: string | null
          height_cm?: number | null
          id?: string
          insurance_info?: Json | null
          lgpd_consent?: boolean | null
          lgpd_consent_date?: string | null
          lgpd_consent_version?: string
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
      patients_cadsus_profile: {
        Row: {
          cns: string | null
          cpf: string | null
          created_at: string
          last_synced_at: string | null
          municipio_nascimento: string | null
          nascimento: string | null
          nome: string | null
          nome_mae: string | null
          patient_id: string
          rnds_source: string
          sexo: string | null
          updated_at: string
        }
        Insert: {
          cns?: string | null
          cpf?: string | null
          created_at?: string
          last_synced_at?: string | null
          municipio_nascimento?: string | null
          nascimento?: string | null
          nome?: string | null
          nome_mae?: string | null
          patient_id: string
          rnds_source?: string
          sexo?: string | null
          updated_at?: string
        }
        Update: {
          cns?: string | null
          cpf?: string | null
          created_at?: string
          last_synced_at?: string | null
          municipio_nascimento?: string | null
          nascimento?: string | null
          nome?: string | null
          nome_mae?: string | null
          patient_id?: string
          rnds_source?: string
          sexo?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "patients_cadsus_profile_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "patients_cadsus_profile_patient_id_fkey"
            columns: ["patient_id"]
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
      pharmacy_consultation_requests: {
        Row: {
          assigned_at: string | null
          call_id: string | null
          completed_at: string | null
          created_at: string
          doctor_id: string | null
          guest_invite_id: string | null
          id: string
          metadata: Json
          patient_dni: string
          patient_name: string
          patient_phone: string
          pharmacy_id: string | null
          pharmacy_name: string
          reason: string
          requested_specialty: string
          room_id: string | null
          service_tier: string
          status: string
          tier_category: string
          transfer_from_doctor_id: string | null
          transfer_status: string | null
        }
        Insert: {
          assigned_at?: string | null
          call_id?: string | null
          completed_at?: string | null
          created_at?: string
          doctor_id?: string | null
          guest_invite_id?: string | null
          id?: string
          metadata?: Json
          patient_dni: string
          patient_name: string
          patient_phone: string
          pharmacy_id?: string | null
          pharmacy_name: string
          reason: string
          requested_specialty?: string
          room_id?: string | null
          service_tier?: string
          status?: string
          tier_category?: string
          transfer_from_doctor_id?: string | null
          transfer_status?: string | null
        }
        Update: {
          assigned_at?: string | null
          call_id?: string | null
          completed_at?: string | null
          created_at?: string
          doctor_id?: string | null
          guest_invite_id?: string | null
          id?: string
          metadata?: Json
          patient_dni?: string
          patient_name?: string
          patient_phone?: string
          pharmacy_id?: string | null
          pharmacy_name?: string
          reason?: string
          requested_specialty?: string
          room_id?: string | null
          service_tier?: string
          status?: string
          tier_category?: string
          transfer_from_doctor_id?: string | null
          transfer_status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pharmacy_consultation_requests_call_id_fkey"
            columns: ["call_id"]
            isOneToOne: false
            referencedRelation: "calls"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pharmacy_consultation_requests_doctor_id_fkey"
            columns: ["doctor_id"]
            isOneToOne: false
            referencedRelation: "doctors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pharmacy_consultation_requests_guest_invite_id_fkey"
            columns: ["guest_invite_id"]
            isOneToOne: false
            referencedRelation: "call_guest_invites"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pharmacy_consultation_requests_pharmacy_id_fkey"
            columns: ["pharmacy_id"]
            isOneToOne: false
            referencedRelation: "pharmacies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pharmacy_consultation_requests_transfer_from_doctor_id_fkey"
            columns: ["transfer_from_doctor_id"]
            isOneToOne: false
            referencedRelation: "doctors"
            referencedColumns: ["id"]
          },
        ]
      }
      pharmacy_dispatch_requests: {
        Row: {
          assigned_doctor_id: string | null
          call_ended_at: string | null
          call_started_at: string | null
          cloudflare_room_id: string
          created_at: string
          doctor_cf_session_id: string | null
          id: string
          kiosk_id: string | null
          matched_at: string | null
          patient_cf_session_id: string | null
          patient_cpf: string | null
          patient_dni: string | null
          patient_id: string | null
          patient_name: string | null
          patient_phone: string
          pharmacy_id: string | null
          previous_doctor_id: string | null
          requested_by_user_id: string | null
          search_timeout_at: string
          status: Database["public"]["Enums"]["dispatch_request_status"]
          symptom_summary: string | null
          tier_requested: Database["public"]["Enums"]["dispatch_tier_category"]
        }
        Insert: {
          assigned_doctor_id?: string | null
          call_ended_at?: string | null
          call_started_at?: string | null
          cloudflare_room_id: string
          created_at?: string
          doctor_cf_session_id?: string | null
          id?: string
          kiosk_id?: string | null
          matched_at?: string | null
          patient_cf_session_id?: string | null
          patient_cpf?: string | null
          patient_dni?: string | null
          patient_id?: string | null
          patient_name?: string | null
          patient_phone: string
          pharmacy_id?: string | null
          previous_doctor_id?: string | null
          requested_by_user_id?: string | null
          search_timeout_at?: string
          status?: Database["public"]["Enums"]["dispatch_request_status"]
          symptom_summary?: string | null
          tier_requested?: Database["public"]["Enums"]["dispatch_tier_category"]
        }
        Update: {
          assigned_doctor_id?: string | null
          call_ended_at?: string | null
          call_started_at?: string | null
          cloudflare_room_id?: string
          created_at?: string
          doctor_cf_session_id?: string | null
          id?: string
          kiosk_id?: string | null
          matched_at?: string | null
          patient_cf_session_id?: string | null
          patient_cpf?: string | null
          patient_dni?: string | null
          patient_id?: string | null
          patient_name?: string | null
          patient_phone?: string
          pharmacy_id?: string | null
          previous_doctor_id?: string | null
          requested_by_user_id?: string | null
          search_timeout_at?: string
          status?: Database["public"]["Enums"]["dispatch_request_status"]
          symptom_summary?: string | null
          tier_requested?: Database["public"]["Enums"]["dispatch_tier_category"]
        }
        Relationships: [
          {
            foreignKeyName: "pharmacy_dispatch_requests_assigned_doctor_id_fkey"
            columns: ["assigned_doctor_id"]
            isOneToOne: false
            referencedRelation: "doctors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pharmacy_dispatch_requests_kiosk_id_fkey"
            columns: ["kiosk_id"]
            isOneToOne: false
            referencedRelation: "pharmacy_kiosks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pharmacy_dispatch_requests_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pharmacy_dispatch_requests_pharmacy_id_fkey"
            columns: ["pharmacy_id"]
            isOneToOne: false
            referencedRelation: "pharmacies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pharmacy_dispatch_requests_previous_doctor_id_fkey"
            columns: ["previous_doctor_id"]
            isOneToOne: false
            referencedRelation: "doctors"
            referencedColumns: ["id"]
          },
        ]
      }
      pharmacy_kiosks: {
        Row: {
          active: boolean
          created_at: string
          device_fingerprint: string
          friendly_name: string
          hardware_type: string
          id: string
          last_ping_at: string
          pharmacy_id: string | null
        }
        Insert: {
          active?: boolean
          created_at?: string
          device_fingerprint: string
          friendly_name: string
          hardware_type?: string
          id?: string
          last_ping_at?: string
          pharmacy_id?: string | null
        }
        Update: {
          active?: boolean
          created_at?: string
          device_fingerprint?: string
          friendly_name?: string
          hardware_type?: string
          id?: string
          last_ping_at?: string
          pharmacy_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pharmacy_kiosks_pharmacy_id_fkey"
            columns: ["pharmacy_id"]
            isOneToOne: false
            referencedRelation: "pharmacies"
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
          country_code: string
          created_at: string
          cuir: string | null
          doctor_id: string
          drug_category: string | null
          icp_signature_metadata: Json | null
          id: string
          is_controlled_substance: boolean | null
          iti_validation_url: string | null
          organization_id: string | null
          patient_id: string
          physical_pdf_url: string | null
          prescription_model_br: string | null
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
          country_code?: string
          created_at?: string
          cuir?: string | null
          doctor_id: string
          drug_category?: string | null
          icp_signature_metadata?: Json | null
          id?: string
          is_controlled_substance?: boolean | null
          iti_validation_url?: string | null
          organization_id?: string | null
          patient_id: string
          physical_pdf_url?: string | null
          prescription_model_br?: string | null
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
          country_code?: string
          created_at?: string
          cuir?: string | null
          doctor_id?: string
          drug_category?: string | null
          icp_signature_metadata?: Json | null
          id?: string
          is_controlled_substance?: boolean | null
          iti_validation_url?: string | null
          organization_id?: string | null
          patient_id?: string
          physical_pdf_url?: string | null
          prescription_model_br?: string | null
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
          cpf: string | null
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
          twitch_username: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          active?: boolean | null
          avatar_url?: string | null
          cpf?: string | null
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
          twitch_username?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          active?: boolean | null
          avatar_url?: string | null
          cpf?: string | null
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
          twitch_username?: string | null
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
      twitch_trivia_leaderboard: {
        Row: {
          actualizado_at: string
          puntos: number
          username: string
        }
        Insert: {
          actualizado_at?: string
          puntos?: number
          username: string
        }
        Update: {
          actualizado_at?: string
          puntos?: number
          username?: string
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
      wifi_leads: {
        Row: {
          converted: boolean
          converted_at: string | null
          created_at: string
          device_info: string | null
          email: string | null
          id: string
          name: string
          notes: string | null
          phone: string
          registered_at: string
          source: string
          updated_at: string
        }
        Insert: {
          converted?: boolean
          converted_at?: string | null
          created_at?: string
          device_info?: string | null
          email?: string | null
          id?: string
          name: string
          notes?: string | null
          phone: string
          registered_at?: string
          source?: string
          updated_at?: string
        }
        Update: {
          converted?: boolean
          converted_at?: string | null
          created_at?: string
          device_info?: string | null
          email?: string | null
          id?: string
          name?: string
          notes?: string | null
          phone?: string
          registered_at?: string
          source?: string
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
      clinic_financial_metrics: {
        Row: {
          autamedica_fee: number | null
          clinic_id: string | null
          clinic_name: string | null
          clinic_revenue: number | null
          completed_appointments: number | null
          paid_appointments: number | null
          total_appointments: number | null
          total_revenue: number | null
        }
        Relationships: [
          {
            foreignKeyName: "doctors_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
        ]
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
        Returns: Database["growth_os"]["Tables"]["topic_queue"]["Row"]
        SetofOptions: {
          from: "*"
          to: "topic_queue"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      claim_pharmacy_request_tier: {
        Args: { p_doctor_id: string; p_request_id: string }
        Returns: Json
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
      drain_notification_queue: {
        Args: { p_batch_size?: number }
        Returns: Json
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
      enqueue_notification: {
        Args: {
          p_body: string
          p_data?: Json
          p_dedupe_key?: string
          p_deep_link?: string
          p_scheduled_at?: string
          p_title: string
          p_type: string
          p_user_id: string
        }
        Returns: string
      }
      ensure_dispatch_patient: {
        Args: { p_cpf: string; p_dni: string; p_user_id: string }
        Returns: string
      }
      ensure_patient_health_reserve: {
        Args: { p_patient_id: string }
        Returns: {
          benefit_balance: number
          created_at: string
          id: string
          max_cap_credits: number
          patient_id: string
          status: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "patient_health_reserves"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      ensure_patient_wallet: {
        Args: { p_patient_id: string }
        Returns: {
          available_credit_cents: number
          created_at: string
          currency: string
          id: string
          locked_credit_cents: number
          patient_id: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "patient_wallets"
          isOneToOne: true
          isSetofReturn: false
        }
      }
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
      finish_pharmacy_consultation: {
        Args: { p_doctor_id: string; p_request_id?: string }
        Returns: Json
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
      get_active_on_duty_doctors: { Args: never; Returns: Json }
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
      get_doctor_busy_slots: {
        Args: { p_doctor_id: string; p_end_date: string; p_start_date: string }
        Returns: {
          end_time: string
          start_time: string
        }[]
      }
      get_doctor_online_minutes: {
        Args: { p_doctor_id: string; p_end_date: string; p_start_date: string }
        Returns: number
      }
      get_duty_doctors_summary: { Args: never; Returns: Json }
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
      get_pharmacy_tiers_status: { Args: never; Returns: Json }
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
      grant_patient_wallet_credit: {
        Args: {
          p_amount_cents: number
          p_appointment_id?: string
          p_created_by?: string
          p_expires_at?: string
          p_idempotency_key?: string
          p_patient_id: string
          p_reason: string
        }
        Returns: {
          ledger_id: string
          new_available_credit_cents: number
          success: boolean
        }[]
      }
      has_active_authorization: {
        Args: { p_record_id: string; p_user_id?: string }
        Returns: boolean
      }
      incrementar_puntos_twitch: {
        Args: { p_puntos: number; p_username: string }
        Returns: undefined
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
      log_clinical_rule_evaluation_transaction: {
        Args: {
          p_authorized_by?: string
          p_doctor_id: string
          p_evidence_used: Json
          p_incident_id: string
          p_override_reason?: string
          p_patient_id: string
          p_reason: string
          p_recommendation: string
          p_rule_version_id: string
        }
        Returns: Json
      }
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
      patient_health_reserve_get_balance: {
        Args: { p_patient_id?: string }
        Returns: {
          benefit_balance: number
          max_cap_credits: number
          patient_id: string
          status: string
          subscription_status: Database["public"]["Enums"]["patient_subscription_status"]
          subscription_tier: Database["public"]["Enums"]["patient_subscription_tier"]
        }[]
      }
      patient_wallet_get_balance: {
        Args: { p_patient_id?: string }
        Returns: {
          available_credit_cents: number
          currency: string
          locked_credit_cents: number
          patient_id: string
          total_credit_cents: number
        }[]
      }
      pay_appointment_with_patient_wallet: {
        Args: {
          p_appointment_id: string
          p_idempotency_key?: string
          p_patient_id: string
        }
        Returns: {
          amount_cents: number
          appointment_payment_id: string
          ledger_id: string
          message: string
          new_available_credit_cents: number
          success: boolean
        }[]
      }
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
      process_all_monthly_reserve_accruals: {
        Args: { p_period_key?: string }
        Returns: Json
      }
      process_monthly_reserve_accrual:
        | {
            Args: {
              p_appointment_id?: string
              p_patient_id: string
              p_subscription_id: string
              p_tier: Database["public"]["Enums"]["patient_subscription_tier"]
              p_used_monthly_benefit: boolean
            }
            Returns: Json
          }
        | {
            Args: {
              p_appointment_id?: string
              p_patient_id: string
              p_period_key?: string
              p_subscription_id: string
              p_tier: Database["public"]["Enums"]["patient_subscription_tier"]
              p_used_monthly_benefit: boolean
            }
            Returns: Json
          }
      recalculate_all_rankings: { Args: never; Returns: undefined }
      recalculate_doctor_metrics: {
        Args: { target_doctor_id: string }
        Returns: undefined
      }
      recalculate_doctor_ranking_positions: { Args: never; Returns: undefined }
      redeem_reserve_benefit: {
        Args: {
          p_catalog_item_id: string
          p_copay_amount_cents?: number
          p_idempotency_key?: string
          p_patient_id: string
        }
        Returns: Json
      }
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
      set_doctor_duty_status: {
        Args: {
          p_active_tiers?: Database["public"]["Enums"]["dispatch_tier_category"][]
          p_doctor_id: string
          p_is_on_duty: boolean
        }
        Returns: Json
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
      benefit_catalog_category:
        | "consultation"
        | "lab_exam"
        | "imaging"
        | "medication"
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
      dispatch_request_status:
        | "searching"
        | "matched"
        | "in_call"
        | "transferring"
        | "transferred"
        | "completed"
        | "cancelled"
        | "expired"
      dispatch_tier_category:
        | "general"
        | "cardiologia"
        | "salud_mental"
        | "pediatria"
        | "dermatologia"
        | "traumatologia"
        | "salud_femenina"
        | "oftalmo_otorrino"
        | "neumonologia"
        | "gastroenterologia"
        | "urologia"
        | "endocrinologia"
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
      partner_settlement_status: "pending" | "processing" | "paid" | "failed"
      patient_subscription_status:
        | "active"
        | "past_due"
        | "cancelled"
        | "trialing"
      patient_subscription_tier: "free" | "cuidado"
      payment_status: "pending" | "approved" | "rejected" | "refunded"
      reserve_transaction_kind:
        | "monthly_benefit_accrual"
        | "benefit_consumed"
        | "redeem_specialist"
        | "redeem_laboratory"
        | "redeem_imaging"
        | "redeem_pharmacy"
        | "expiration"
        | "adjustment"
        | "refund"
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
      voucher_status:
        | "issued"
        | "redeemed"
        | "settled"
        | "cancelled"
        | "expired"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  auth: {
    Enums: {
      aal_level: ["aal1", "aal2", "aal3"],
      code_challenge_method: ["s256", "plain"],
      factor_status: ["unverified", "verified"],
      factor_type: ["totp", "webauthn", "phone", "recovery_code"],
      oauth_authorization_status: ["pending", "approved", "denied", "expired"],
      oauth_client_type: ["public", "confidential"],
      oauth_registration_type: ["dynamic", "manual"],
      oauth_response_type: ["code"],
      one_time_token_type: [
        "confirmation_token",
        "reauthentication_token",
        "recovery_token",
        "email_change_token_new",
        "email_change_token_current",
        "phone_change_token",
      ],
    },
  },
  growth_os: {
    Enums: {
      content_status: [
        "draft",
        "compliance_review",
        "approved",
        "scheduled",
        "published",
        "failed",
        "killed",
      ],
    },
  },
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
      benefit_catalog_category: [
        "consultation",
        "lab_exam",
        "imaging",
        "medication",
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
      dispatch_request_status: [
        "searching",
        "matched",
        "in_call",
        "transferring",
        "transferred",
        "completed",
        "cancelled",
        "expired",
      ],
      dispatch_tier_category: [
        "general",
        "cardiologia",
        "salud_mental",
        "pediatria",
        "dermatologia",
        "traumatologia",
        "salud_femenina",
        "oftalmo_otorrino",
        "neumonologia",
        "gastroenterologia",
        "urologia",
        "endocrinologia",
      ],
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
      partner_settlement_status: ["pending", "processing", "paid", "failed"],
      patient_subscription_status: [
        "active",
        "past_due",
        "cancelled",
        "trialing",
      ],
      patient_subscription_tier: ["free", "cuidado"],
      payment_status: ["pending", "approved", "rejected", "refunded"],
      reserve_transaction_kind: [
        "monthly_benefit_accrual",
        "benefit_consumed",
        "redeem_specialist",
        "redeem_laboratory",
        "redeem_imaging",
        "redeem_pharmacy",
        "expiration",
        "adjustment",
        "refund",
      ],
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
      voucher_status: ["issued", "redeemed", "settled", "cancelled", "expired"],
    },
  },
} as const
