export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  public: {
    CompositeTypes: {
      [_ in never]: never;
    };
    Enums: {
      agent_verification_status:
        | "not_submitted"
        | "pending_review"
        | "verified"
        | "rejected"
        | "suspended";
      app_role: "student" | "agent" | "admin";
      rental_duration: "yearly" | "monthly" | "sublet";
      job_queue: "default" | "media";
      job_status:
        | "queued"
        | "running"
        | "completed"
        | "retrying"
        | "failed_permanently";
      chat_type: "inspection";
      inspection_status:
        | "requested"
        | "accepted"
        | "declined"
        | "expired"
        | "cancelled"
        | "completed";
      listing_status:
        | "draft"
        | "pending_review"
        | "approved"
        | "rejected"
        | "archived"
        | "flagged"
        | "under_dispute";
      report_status: "open" | "under_review" | "resolved" | "dismissed";
      report_target_type: "listing" | "agent" | "message";
      subscription_plan: "basic" | "pro" | "enterprise";
      subscription_status: "active" | "expired" | "cancelled" | "grace_period";
      property_type:
        | "self_contain"
        | "1_bedroom"
        | "2_bedroom"
        | "3_bedroom"
        | "shop"
        | "lodge_room";
    };
    Functions: {
      // RLS identity helpers (migration 0008). Policies call these in SQL;
      // they are exposed to .rpc() so tests can assert the token path
      // directly rather than inferring it from an empty result set.
      clerk_user_id: {
        Args: Record<PropertyKey, never>;
        Returns: string | null;
      };
      current_agent_profile_id: {
        Args: Record<PropertyKey, never>;
        Returns: string | null;
      };
      current_app_user_id: {
        Args: Record<PropertyKey, never>;
        Returns: string | null;
      };
      create_inspection_request_with_chat: {
        Args: {
          expires_at: string;
          request_message: string;
          target_listing_id: string;
        };
        Returns: Array<{ chat_id: string; inspection_request_id: string }>;
      };
      archive_own_listing: {
        Args: { target_listing_id: string };
        Returns: Array<{ archived_at: string; listing_id: string }>;
      };
      remove_listing_image: {
        Args: { target_image_id: string };
        Returns: Array<{
          new_cover_image_id: string | null;
          removed_image_id: string;
        }>;
      };
      uuidv7: {
        Args: Record<PropertyKey, never>;
        Returns: string;
      };
      claim_jobs: {
        Args: {
          batch_size: number;
          target_queue: Database["public"]["Enums"]["job_queue"];
        };
        Returns: Array<Database["public"]["Tables"]["jobs"]["Row"]>;
      };
      complete_job: {
        Args: { job_id: string; job_result?: Json | null };
        Returns: undefined;
      };
      enqueue_job: {
        Args: {
          attempts_allowed?: number;
          job_payload?: Json;
          job_type: string;
          request_id?: string | null;
          run_at?: string;
          target_queue?: Database["public"]["Enums"]["job_queue"];
        };
        Returns: string;
      };
      fail_job: {
        Args: {
          base_delay_seconds?: number;
          error_message: string;
          job_id: string;
        };
        Returns: Database["public"]["Enums"]["job_status"];
      };
      job_queue_health: {
        Args: Record<PropertyKey, never>;
        Returns: Array<{
          failed_permanently_count: number;
          oldest_queued_age_seconds: number;
          queue: Database["public"]["Enums"]["job_queue"];
          queued_count: number;
          running_count: number;
        }>;
      };
      current_user_has_role: {
        Args: { target: Database["public"]["Enums"]["app_role"] };
        Returns: boolean;
      };
    };
    Tables: {
      agent_profiles: {
        Insert: {
          bio?: string | null;
          created_at?: string;
          deleted_at?: string | null;
          display_name: string;
          founding_agent?: boolean;
          free_listing_quota?: number;
          id?: string;
          rejection_reason?: string | null;
          suspension_reason?: string | null;
          updated_at?: string;
          user_id: string;
          verification_status?:
            | "not_submitted"
            | "pending_review"
            | "verified"
            | "rejected"
            | "suspended";
          verification_submitted_at?: string | null;
          verified_at?: string | null;
          verified_by?: string | null;
        };
        Row: {
          bio: string | null;
          created_at: string;
          deleted_at: string | null;
          display_name: string;
          founding_agent: boolean;
          free_listing_quota: number;
          id: string;
          rejection_reason: string | null;
          suspension_reason: string | null;
          updated_at: string;
          user_id: string;
          verification_status:
            | "not_submitted"
            | "pending_review"
            | "verified"
            | "rejected"
            | "suspended";
          verification_submitted_at: string | null;
          verified_at: string | null;
          verified_by: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["agent_profiles"]["Insert"]>;
        Relationships: [];
      };
      agent_verification_submissions: {
        Insert: {
          agent_profile_id: string;
          created_at?: string;
          deleted_at?: string | null;
          full_legal_name: string;
          id?: string;
          notes?: string | null;
          reviewed_at?: string | null;
          submitted_at?: string;
          updated_at?: string;
        };
        Row: {
          agent_profile_id: string;
          created_at: string;
          deleted_at: string | null;
          full_legal_name: string;
          id: string;
          notes: string | null;
          reviewed_at: string | null;
          submitted_at: string;
          updated_at: string;
        };
        Update: Partial<
          Database["public"]["Tables"]["agent_verification_submissions"]["Insert"]
        >;
        Relationships: [];
      };
      verification_documents: {
        Insert: {
          agent_profile_id: string;
          agent_verification_submission_id: string;
          created_at?: string;
          deleted_at?: string | null;
          document_type: string;
          id?: string;
          mime_type: string;
          original_filename?: string | null;
          size_bytes: number;
          storage_path: string;
        };
        Row: {
          agent_profile_id: string;
          agent_verification_submission_id: string;
          created_at: string;
          deleted_at: string | null;
          document_type: string;
          id: string;
          mime_type: string;
          original_filename: string | null;
          size_bytes: number;
          storage_path: string;
        };
        Update: Partial<Database["public"]["Tables"]["verification_documents"]["Insert"]>;
        Relationships: [];
      };
      audit_logs: {
        Insert: {
          action: string;
          actor_user_id?: string | null;
          after_data?: Json | null;
          before_data?: Json | null;
          created_at?: string;
          entity_id: string;
          entity_type: string;
          id?: string;
          metadata?: Json;
        };
        Row: {
          action: string;
          actor_user_id: string | null;
          after_data: Json | null;
          before_data: Json | null;
          created_at: string;
          entity_id: string;
          entity_type: string;
          id: string;
          metadata: Json;
        };
        Update: Partial<Database["public"]["Tables"]["audit_logs"]["Insert"]>;
        Relationships: [];
      };
      chats: {
        Insert: {
          agent_profile_id: string;
          closed_at?: string | null;
          created_at?: string;
          deleted_at?: string | null;
          id?: string;
          inspection_request_id?: string | null;
          last_message_at?: string | null;
          listing_id?: string | null;
          student_user_id: string;
          type: "inspection";
          updated_at?: string;
        };
        Row: {
          agent_profile_id: string;
          closed_at: string | null;
          created_at: string;
          deleted_at: string | null;
          id: string;
          inspection_request_id: string | null;
          last_message_at: string | null;
          listing_id: string | null;
          student_user_id: string;
          type: "inspection";
          updated_at: string;
        };
        Update: Partial<Database["public"]["Tables"]["chats"]["Insert"]>;
        Relationships: [];
      };
      inspection_requests: {
        Insert: {
          agent_profile_id: string;
          cancelled_at?: string | null;
          chat_id?: string | null;
          completed_at?: string | null;
          created_at?: string;
          deleted_at?: string | null;
          expires_at: string;
          id?: string;
          listing_id: string;
          message?: string | null;
          requested_at?: string;
          requester_user_id: string;
          responded_at?: string | null;
          status?:
            | "requested"
            | "accepted"
            | "declined"
            | "expired"
            | "cancelled"
            | "completed";
          updated_at?: string;
        };
        Row: {
          agent_profile_id: string;
          cancelled_at: string | null;
          chat_id: string | null;
          completed_at: string | null;
          created_at: string;
          deleted_at: string | null;
          expires_at: string;
          id: string;
          listing_id: string;
          message: string | null;
          requested_at: string;
          requester_user_id: string;
          responded_at: string | null;
          status:
            | "requested"
            | "accepted"
            | "declined"
            | "expired"
            | "cancelled"
            | "completed";
          updated_at: string;
        };
        Update: Partial<Database["public"]["Tables"]["inspection_requests"]["Insert"]>;
        Relationships: [];
      };
      jobs: {
        Insert: {
          attempts?: number;
          completed_at?: string | null;
          created_at?: string;
          enqueued_by_request_id?: string | null;
          id?: string;
          last_error?: string | null;
          max_attempts?: number;
          payload?: Json;
          queue?: Database["public"]["Enums"]["job_queue"];
          result?: Json | null;
          scheduled_at?: string;
          started_at?: string | null;
          status?: Database["public"]["Enums"]["job_status"];
          type: string;
          updated_at?: string;
        };
        Row: {
          attempts: number;
          completed_at: string | null;
          created_at: string;
          enqueued_by_request_id: string | null;
          id: string;
          last_error: string | null;
          max_attempts: number;
          payload: Json;
          queue: Database["public"]["Enums"]["job_queue"];
          result: Json | null;
          scheduled_at: string;
          started_at: string | null;
          status: Database["public"]["Enums"]["job_status"];
          type: string;
          updated_at: string;
        };
        Update: Partial<Database["public"]["Tables"]["jobs"]["Insert"]>;
        Relationships: [];
      };
      listing_images: {
        Insert: {
          created_at?: string;
          deleted_at?: string | null;
          height?: number | null;
          id?: string;
          is_cover?: boolean;
          listing_id: string;
          mime_type: string;
          position: number;
          size_bytes: number;
          storage_path: string;
          width?: number | null;
        };
        Row: {
          created_at: string;
          deleted_at: string | null;
          height: number | null;
          id: string;
          is_cover: boolean;
          listing_id: string;
          mime_type: string;
          position: number;
          size_bytes: number;
          storage_path: string;
          width: number | null;
        };
        Update: Partial<Database["public"]["Tables"]["listing_images"]["Insert"]>;
        Relationships: [];
      };
      listing_views: {
        Insert: {
          created_at?: string;
          id?: string;
          ip_hash?: string | null;
          listing_id: string;
          referrer?: string | null;
          session_id?: string | null;
          user_agent?: string | null;
          viewer_user_id?: string | null;
        };
        Row: {
          created_at: string;
          id: string;
          ip_hash: string | null;
          listing_id: string;
          referrer: string | null;
          session_id: string | null;
          user_agent: string | null;
          viewer_user_id: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["listing_views"]["Insert"]>;
        Relationships: [];
      };
      listings: {
        Insert: {
          agent_profile_id: string;
          amenities?: Json;
          approved_at?: string | null;
          approved_by?: string | null;
          archived_at?: string | null;
          area: string;
          bathrooms: number;
          bedrooms: number;
          city?: string;
          country?: string;
          cover_image_id?: string | null;
          created_at?: string;
          deleted_at?: string | null;
          description: string;
          dispute_reason?: string | null;
          duplicate_fingerprint?: string | null;
          flag_reason?: string | null;
          id?: string;
          latitude?: number | null;
          longitude?: number | null;
          price_naira: number;
          property_type:
            | "self_contain"
            | "1_bedroom"
            | "2_bedroom"
            | "3_bedroom"
            | "shop"
            | "lodge_room";
          public_uuid?: string;
          rejection_reason?: string | null;
          // Required: the column is NOT NULL with no default, so an insert that
          // omits it fails rather than silently becoming annual.
          rental_duration: "yearly" | "monthly" | "sublet";
          slug: string;
          state?: string;
          status?:
            | "draft"
            | "pending_review"
            | "approved"
            | "rejected"
            | "archived"
            | "flagged"
            | "under_dispute";
          sublet_months?: number | null;
          submitted_at?: string | null;
          title: string;
          updated_at?: string;
          video_url?: string | null;
        };
        Row: {
          agent_profile_id: string;
          amenities: Json;
          approved_at: string | null;
          approved_by: string | null;
          archived_at: string | null;
          area: string;
          bathrooms: number;
          bedrooms: number;
          city: string;
          country: string;
          cover_image_id: string | null;
          created_at: string;
          deleted_at: string | null;
          description: string;
          dispute_reason: string | null;
          duplicate_fingerprint: string | null;
          flag_reason: string | null;
          id: string;
          latitude: number | null;
          longitude: number | null;
          price_naira: number;
          property_type:
            | "self_contain"
            | "1_bedroom"
            | "2_bedroom"
            | "3_bedroom"
            | "shop"
            | "lodge_room";
          public_uuid: string;
          rejection_reason: string | null;
          rental_duration: "yearly" | "monthly" | "sublet";
          slug: string;
          state: string;
          status:
            | "draft"
            | "pending_review"
            | "approved"
            | "rejected"
            | "archived"
            | "flagged"
            | "under_dispute";
          sublet_months: number | null;
          submitted_at: string | null;
          title: string;
          updated_at: string;
          video_url: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["listings"]["Insert"]>;
        Relationships: [];
      };
      messages: {
        Insert: {
          body: string;
          chat_id: string;
          created_at?: string;
          deleted_at?: string | null;
          id?: string;
          read_at?: string | null;
          sender_user_id: string;
        };
        Row: {
          body: string;
          chat_id: string;
          created_at: string;
          deleted_at: string | null;
          id: string;
          read_at: string | null;
          sender_user_id: string;
        };
        Update: Partial<Database["public"]["Tables"]["messages"]["Insert"]>;
        Relationships: [];
      };
      reports: {
        Insert: {
          created_at?: string;
          deleted_at?: string | null;
          id?: string;
          reason: string;
          reporter_user_id: string;
          resolution_notes?: string | null;
          resolved_at?: string | null;
          resolved_by?: string | null;
          status?: "open" | "under_review" | "resolved" | "dismissed";
          target_id: string;
          target_type: "listing" | "agent" | "message";
          updated_at?: string;
        };
        Row: {
          created_at: string;
          deleted_at: string | null;
          id: string;
          reason: string;
          reporter_user_id: string;
          resolution_notes: string | null;
          resolved_at: string | null;
          resolved_by: string | null;
          status: "open" | "under_review" | "resolved" | "dismissed";
          target_id: string;
          target_type: "listing" | "agent" | "message";
          updated_at: string;
        };
        Update: Partial<Database["public"]["Tables"]["reports"]["Insert"]>;
        Relationships: [];
      };
      saved_listings: {
        Insert: {
          created_at?: string;
          id?: string;
          listing_id: string;
          user_id: string;
        };
        Row: {
          created_at: string;
          id: string;
          listing_id: string;
          user_id: string;
        };
        Update: Partial<Database["public"]["Tables"]["saved_listings"]["Insert"]>;
        Relationships: [];
      };
      subscriptions: {
        Insert: {
          agent_profile_id: string;
          cancelled_at?: string | null;
          created_at?: string;
          deleted_at?: string | null;
          expires_at: string;
          id?: string;
          metadata?: Json;
          plan: "basic" | "pro" | "enterprise";
          provider?: string;
          provider_reference?: string | null;
          starts_at: string;
          status: "active" | "expired" | "cancelled" | "grace_period";
          updated_at?: string;
        };
        Row: {
          agent_profile_id: string;
          cancelled_at: string | null;
          created_at: string;
          deleted_at: string | null;
          expires_at: string;
          id: string;
          metadata: Json;
          plan: "basic" | "pro" | "enterprise";
          provider: string;
          provider_reference: string | null;
          starts_at: string;
          status: "active" | "expired" | "cancelled" | "grace_period";
          updated_at: string;
        };
        Update: Partial<Database["public"]["Tables"]["subscriptions"]["Insert"]>;
        Relationships: [];
      };
      user_roles: {
        Insert: {
          created_at?: string;
          id?: string;
          role: "student" | "agent" | "admin";
          user_id: string;
        };
        Row: {
          created_at: string;
          id: string;
          role: "student" | "agent" | "admin";
          user_id: string;
        };
        Update: Partial<Database["public"]["Tables"]["user_roles"]["Insert"]>;
        Relationships: [];
      };
      users: {
        Insert: {
          avatar_url?: string | null;
          clerk_user_id: string;
          created_at?: string;
          deleted_at?: string | null;
          email: string;
          full_name?: string | null;
          id?: string;
          is_active?: boolean;
          last_seen_at?: string | null;
          phone_number?: string | null;
          updated_at?: string;
        };
        Row: {
          avatar_url: string | null;
          clerk_user_id: string;
          created_at: string;
          deleted_at: string | null;
          email: string;
          full_name: string | null;
          id: string;
          is_active: boolean;
          last_seen_at: string | null;
          phone_number: string | null;
          updated_at: string;
        };
        Update: Partial<Database["public"]["Tables"]["users"]["Insert"]>;
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
  };
};
