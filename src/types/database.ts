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
      listing_status:
        | "draft"
        | "pending_review"
        | "approved"
        | "rejected"
        | "archived"
        | "flagged"
        | "under_dispute";
      property_type:
        | "self_contain"
        | "1_bedroom"
        | "2_bedroom"
        | "3_bedroom"
        | "shop"
        | "lodge_room";
    };
    Functions: {
      [_ in never]: never;
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
          documents?: Json;
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
          documents: Json;
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
          public_url: string;
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
          public_url: string;
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
          submitted_at: string | null;
          title: string;
          updated_at: string;
          video_url: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["listings"]["Insert"]>;
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
