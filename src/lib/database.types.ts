export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never;
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      graphql: { Args: { extensions?: Json; operationName?: string; query?: string; variables?: Json }; Returns: Json };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
  public: {
    Tables: {
      auth_email_log: {
        Row: {
          email: string;
          id: number;
          kind: string;
          sent_at: string;
        };
        Insert: {
          email: string;
          id?: never;
          kind: string;
          sent_at?: string;
        };
        Update: {
          email?: string;
          id?: never;
          kind?: string;
          sent_at?: string;
        };
        Relationships: [];
      };
      cohort_lessons: {
        Row: {
          cohort_id: string;
          lesson_id: string;
          position: number;
          release_at: string | null;
          release_offset_days: number | null;
        };
        Insert: {
          cohort_id: string;
          lesson_id: string;
          position?: number;
          release_at?: string | null;
          release_offset_days?: number | null;
        };
        Update: {
          cohort_id?: string;
          lesson_id?: string;
          position?: number;
          release_at?: string | null;
          release_offset_days?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: "cohort_lessons_cohort_id_fkey";
            columns: ["cohort_id"];
            isOneToOne: false;
            referencedRelation: "cohorts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "cohort_lessons_lesson_id_fkey";
            columns: ["lesson_id"];
            isOneToOne: false;
            referencedRelation: "lessons";
            referencedColumns: ["id"];
          },
        ];
      };
      cohort_products: {
        Row: {
          cohort_id: string;
          created_at: string;
          external_product_id: string;
          id: string;
          label: string | null;
          provider: Database["public"]["Enums"]["payment_provider"];
        };
        Insert: {
          cohort_id: string;
          created_at?: string;
          external_product_id: string;
          id?: string;
          label?: string | null;
          provider: Database["public"]["Enums"]["payment_provider"];
        };
        Update: {
          cohort_id?: string;
          created_at?: string;
          external_product_id?: string;
          id?: string;
          label?: string | null;
          provider?: Database["public"]["Enums"]["payment_provider"];
        };
        Relationships: [
          {
            foreignKeyName: "cohort_products_cohort_id_fkey";
            columns: ["cohort_id"];
            isOneToOne: false;
            referencedRelation: "cohorts";
            referencedColumns: ["id"];
          },
        ];
      };
      cohorts: {
        Row: {
          access_months: number | null;
          access_starts_from: Database["public"]["Enums"]["access_start"];
          checkout_url: string | null;
          course_id: string;
          created_at: string;
          description: string | null;
          ends_at: string | null;
          id: string;
          is_active: boolean;
          live_url: string | null;
          name: string;
          release_config: NonNullable<Json>;
          release_mode: Database["public"]["Enums"]["release_mode"];
          starts_at: string | null;
          updated_at: string;
        };
        Insert: {
          access_months?: number | null;
          access_starts_from?: Database["public"]["Enums"]["access_start"];
          checkout_url?: string | null;
          course_id: string;
          created_at?: string;
          description?: string | null;
          ends_at?: string | null;
          id?: string;
          is_active?: boolean;
          live_url?: string | null;
          name: string;
          release_config?: NonNullable<Json>;
          release_mode?: Database["public"]["Enums"]["release_mode"];
          starts_at?: string | null;
          updated_at?: string;
        };
        Update: {
          access_months?: number | null;
          access_starts_from?: Database["public"]["Enums"]["access_start"];
          checkout_url?: string | null;
          course_id?: string;
          created_at?: string;
          description?: string | null;
          ends_at?: string | null;
          id?: string;
          is_active?: boolean;
          live_url?: string | null;
          name?: string;
          release_config?: NonNullable<Json>;
          release_mode?: Database["public"]["Enums"]["release_mode"];
          starts_at?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "cohorts_course_id_fkey";
            columns: ["course_id"];
            isOneToOne: false;
            referencedRelation: "courses";
            referencedColumns: ["id"];
          },
        ];
      };
      comments: {
        Row: {
          ai_category: Database["public"]["Enums"]["comment_category"] | null;
          ai_is_urgent: boolean | null;
          ai_sentiment: string | null;
          ai_suggested_reply: string | null;
          cohort_id: string | null;
          content: string;
          created_at: string;
          id: string;
          lesson_id: string;
          parent_id: string | null;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          ai_category?: Database["public"]["Enums"]["comment_category"] | null;
          ai_is_urgent?: boolean | null;
          ai_sentiment?: string | null;
          ai_suggested_reply?: string | null;
          cohort_id?: string | null;
          content: string;
          created_at?: string;
          id?: string;
          lesson_id: string;
          parent_id?: string | null;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          ai_category?: Database["public"]["Enums"]["comment_category"] | null;
          ai_is_urgent?: boolean | null;
          ai_sentiment?: string | null;
          ai_suggested_reply?: string | null;
          cohort_id?: string | null;
          content?: string;
          created_at?: string;
          id?: string;
          lesson_id?: string;
          parent_id?: string | null;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "comments_cohort_id_fkey";
            columns: ["cohort_id"];
            isOneToOne: false;
            referencedRelation: "cohorts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "comments_lesson_id_fkey";
            columns: ["lesson_id"];
            isOneToOne: false;
            referencedRelation: "lessons";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "comments_parent_id_fkey";
            columns: ["parent_id"];
            isOneToOne: false;
            referencedRelation: "comments";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "comments_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      courses: {
        Row: {
          banner_url: string | null;
          cover_horizontal_url: string | null;
          cover_vertical_url: string | null;
          created_at: string;
          description: string | null;
          id: string;
          is_free: boolean;
          is_published: boolean;
          lead_access: Database["public"]["Enums"]["lead_access"];
          lead_fields: Database["public"]["Enums"]["lead_fields"];
          preview_end_seconds: number | null;
          preview_lesson_id: string | null;
          preview_start_seconds: number | null;
          sales_cohort_id: string | null;
          showcase_order: number;
          slug: string;
          title: string;
          updated_at: string;
        };
        Insert: {
          banner_url?: string | null;
          cover_horizontal_url?: string | null;
          cover_vertical_url?: string | null;
          created_at?: string;
          description?: string | null;
          id?: string;
          is_free?: boolean;
          is_published?: boolean;
          lead_access?: Database["public"]["Enums"]["lead_access"];
          lead_fields?: Database["public"]["Enums"]["lead_fields"];
          preview_end_seconds?: number | null;
          preview_lesson_id?: string | null;
          preview_start_seconds?: number | null;
          sales_cohort_id?: string | null;
          showcase_order?: number;
          slug: string;
          title: string;
          updated_at?: string;
        };
        Update: {
          banner_url?: string | null;
          cover_horizontal_url?: string | null;
          cover_vertical_url?: string | null;
          created_at?: string;
          description?: string | null;
          id?: string;
          is_free?: boolean;
          is_published?: boolean;
          lead_access?: Database["public"]["Enums"]["lead_access"];
          lead_fields?: Database["public"]["Enums"]["lead_fields"];
          preview_end_seconds?: number | null;
          preview_lesson_id?: string | null;
          preview_start_seconds?: number | null;
          sales_cohort_id?: string | null;
          showcase_order?: number;
          slug?: string;
          title?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "courses_preview_lesson_fk";
            columns: ["preview_lesson_id"];
            isOneToOne: false;
            referencedRelation: "lessons";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "courses_sales_cohort_fk";
            columns: ["sales_cohort_id"];
            isOneToOne: false;
            referencedRelation: "cohorts";
            referencedColumns: ["id"];
          },
        ];
      };
      enrollments: {
        Row: {
          cohort_id: string;
          created_at: string;
          expires_at: string | null;
          external_transaction_id: string | null;
          id: string;
          origin: Database["public"]["Enums"]["enrollment_origin"];
          provider: Database["public"]["Enums"]["payment_provider"] | null;
          started_at: string;
          status: Database["public"]["Enums"]["enrollment_status"];
          updated_at: string;
          user_id: string;
          enrollment_is_active: boolean | null;
        };
        Insert: {
          cohort_id: string;
          created_at?: string;
          expires_at?: string | null;
          external_transaction_id?: string | null;
          id?: string;
          origin: Database["public"]["Enums"]["enrollment_origin"];
          provider?: Database["public"]["Enums"]["payment_provider"] | null;
          started_at?: string;
          status?: Database["public"]["Enums"]["enrollment_status"];
          updated_at?: string;
          user_id: string;
        };
        Update: {
          cohort_id?: string;
          created_at?: string;
          expires_at?: string | null;
          external_transaction_id?: string | null;
          id?: string;
          origin?: Database["public"]["Enums"]["enrollment_origin"];
          provider?: Database["public"]["Enums"]["payment_provider"] | null;
          started_at?: string;
          status?: Database["public"]["Enums"]["enrollment_status"];
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "enrollments_cohort_id_fkey";
            columns: ["cohort_id"];
            isOneToOne: false;
            referencedRelation: "cohorts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "enrollments_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      leads: {
        Row: {
          course_id: string | null;
          created_at: string;
          id: string;
          source: string | null;
          user_id: string;
          utm: NonNullable<Json>;
        };
        Insert: {
          course_id?: string | null;
          created_at?: string;
          id?: string;
          source?: string | null;
          user_id: string;
          utm?: NonNullable<Json>;
        };
        Update: {
          course_id?: string | null;
          created_at?: string;
          id?: string;
          source?: string | null;
          user_id?: string;
          utm?: NonNullable<Json>;
        };
        Relationships: [
          {
            foreignKeyName: "leads_course_id_fkey";
            columns: ["course_id"];
            isOneToOne: false;
            referencedRelation: "courses";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "leads_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      lesson_contents: {
        Row: {
          ai_checklist: Json | null;
          ai_summary: Json | null;
          lesson_id: string;
          transcript: string | null;
          updated_at: string;
          video_id: string | null;
          video_provider: Database["public"]["Enums"]["video_provider"];
        };
        Insert: {
          ai_checklist?: Json | null;
          ai_summary?: Json | null;
          lesson_id: string;
          transcript?: string | null;
          updated_at?: string;
          video_id?: string | null;
          video_provider?: Database["public"]["Enums"]["video_provider"];
        };
        Update: {
          ai_checklist?: Json | null;
          ai_summary?: Json | null;
          lesson_id?: string;
          transcript?: string | null;
          updated_at?: string;
          video_id?: string | null;
          video_provider?: Database["public"]["Enums"]["video_provider"];
        };
        Relationships: [
          {
            foreignKeyName: "lesson_contents_lesson_id_fkey";
            columns: ["lesson_id"];
            isOneToOne: true;
            referencedRelation: "lessons";
            referencedColumns: ["id"];
          },
        ];
      };
      lesson_materials: {
        Row: {
          created_at: string;
          file_type: string | null;
          id: string;
          lesson_id: string;
          name: string;
          position: number;
          size_bytes: number | null;
          storage_path: string;
        };
        Insert: {
          created_at?: string;
          file_type?: string | null;
          id?: string;
          lesson_id: string;
          name: string;
          position?: number;
          size_bytes?: number | null;
          storage_path: string;
        };
        Update: {
          created_at?: string;
          file_type?: string | null;
          id?: string;
          lesson_id?: string;
          name?: string;
          position?: number;
          size_bytes?: number | null;
          storage_path?: string;
        };
        Relationships: [
          {
            foreignKeyName: "lesson_materials_lesson_id_fkey";
            columns: ["lesson_id"];
            isOneToOne: false;
            referencedRelation: "lessons";
            referencedColumns: ["id"];
          },
        ];
      };
      lesson_progress: {
        Row: {
          completed_at: string | null;
          last_accessed_at: string;
          last_position_seconds: number;
          lesson_id: string;
          percent: number;
          seconds_watched: number;
          user_id: string;
        };
        Insert: {
          completed_at?: string | null;
          last_accessed_at?: string;
          last_position_seconds?: number;
          lesson_id: string;
          percent?: number;
          seconds_watched?: number;
          user_id: string;
        };
        Update: {
          completed_at?: string | null;
          last_accessed_at?: string;
          last_position_seconds?: number;
          lesson_id?: string;
          percent?: number;
          seconds_watched?: number;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "lesson_progress_lesson_id_fkey";
            columns: ["lesson_id"];
            isOneToOne: false;
            referencedRelation: "lessons";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "lesson_progress_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      lesson_unlocks: {
        Row: {
          created_at: string;
          created_by: string | null;
          lesson_id: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          created_by?: string | null;
          lesson_id: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          created_by?: string | null;
          lesson_id?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "lesson_unlocks_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "lesson_unlocks_lesson_id_fkey";
            columns: ["lesson_id"];
            isOneToOne: false;
            referencedRelation: "lessons";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "lesson_unlocks_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      lessons: {
        Row: {
          created_at: string;
          description: string | null;
          duration_seconds: number | null;
          id: string;
          is_free: boolean;
          is_published: boolean;
          module_id: string;
          offer_at_seconds: number | null;
          offer_label: string | null;
          offer_url: string | null;
          position: number;
          thumbnail_url: string | null;
          title: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          description?: string | null;
          duration_seconds?: number | null;
          id?: string;
          is_free?: boolean;
          is_published?: boolean;
          module_id: string;
          offer_at_seconds?: number | null;
          offer_label?: string | null;
          offer_url?: string | null;
          position?: number;
          thumbnail_url?: string | null;
          title: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          description?: string | null;
          duration_seconds?: number | null;
          id?: string;
          is_free?: boolean;
          is_published?: boolean;
          module_id?: string;
          offer_at_seconds?: number | null;
          offer_label?: string | null;
          offer_url?: string | null;
          position?: number;
          thumbnail_url?: string | null;
          title?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "lessons_module_id_fkey";
            columns: ["module_id"];
            isOneToOne: false;
            referencedRelation: "modules";
            referencedColumns: ["id"];
          },
        ];
      };
      modules: {
        Row: {
          course_id: string;
          created_at: string;
          id: string;
          position: number;
          title: string;
          updated_at: string;
        };
        Insert: {
          course_id: string;
          created_at?: string;
          id?: string;
          position?: number;
          title: string;
          updated_at?: string;
        };
        Update: {
          course_id?: string;
          created_at?: string;
          id?: string;
          position?: number;
          title?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "modules_course_id_fkey";
            columns: ["course_id"];
            isOneToOne: false;
            referencedRelation: "courses";
            referencedColumns: ["id"];
          },
        ];
      };
      outgoing_webhooks: {
        Row: {
          created_at: string;
          events: string[];
          id: string;
          is_active: boolean;
          name: string;
          secret: string;
          url: string;
        };
        Insert: {
          created_at?: string;
          events?: string[];
          id?: string;
          is_active?: boolean;
          name: string;
          secret?: string;
          url: string;
        };
        Update: {
          created_at?: string;
          events?: string[];
          id?: string;
          is_active?: boolean;
          name?: string;
          secret?: string;
          url?: string;
        };
        Relationships: [];
      };
      profiles: {
        Row: {
          avatar_url: string | null;
          created_at: string;
          email: string;
          full_name: string | null;
          id: string;
          last_seen_at: string | null;
          marketing_consent: boolean;
          marketing_consent_at: string | null;
          role: Database["public"]["Enums"]["user_role"];
          updated_at: string;
          whatsapp: string | null;
        };
        Insert: {
          avatar_url?: string | null;
          created_at?: string;
          email: string;
          full_name?: string | null;
          id: string;
          last_seen_at?: string | null;
          marketing_consent?: boolean;
          marketing_consent_at?: string | null;
          role?: Database["public"]["Enums"]["user_role"];
          updated_at?: string;
          whatsapp?: string | null;
        };
        Update: {
          avatar_url?: string | null;
          created_at?: string;
          email?: string;
          full_name?: string | null;
          id?: string;
          last_seen_at?: string | null;
          marketing_consent?: boolean;
          marketing_consent_at?: string | null;
          role?: Database["public"]["Enums"]["user_role"];
          updated_at?: string;
          whatsapp?: string | null;
        };
        Relationships: [];
      };
      webhook_deliveries: {
        Row: {
          created_at: string;
          error: string | null;
          event: string;
          id: string;
          payload: NonNullable<Json>;
          status_code: number | null;
          webhook_id: string;
        };
        Insert: {
          created_at?: string;
          error?: string | null;
          event: string;
          id?: string;
          payload: NonNullable<Json>;
          status_code?: number | null;
          webhook_id: string;
        };
        Update: {
          created_at?: string;
          error?: string | null;
          event?: string;
          id?: string;
          payload?: NonNullable<Json>;
          status_code?: number | null;
          webhook_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "webhook_deliveries_webhook_id_fkey";
            columns: ["webhook_id"];
            isOneToOne: false;
            referencedRelation: "outgoing_webhooks";
            referencedColumns: ["id"];
          },
        ];
      };
      webhook_events: {
        Row: {
          error: string | null;
          event_type: string | null;
          id: string;
          idempotency_key: string;
          payload: NonNullable<Json>;
          processed_at: string | null;
          provider: Database["public"]["Enums"]["payment_provider"];
          received_at: string;
          status: Database["public"]["Enums"]["webhook_status"];
        };
        Insert: {
          error?: string | null;
          event_type?: string | null;
          id?: string;
          idempotency_key: string;
          payload: NonNullable<Json>;
          processed_at?: string | null;
          provider: Database["public"]["Enums"]["payment_provider"];
          received_at?: string;
          status?: Database["public"]["Enums"]["webhook_status"];
        };
        Update: {
          error?: string | null;
          event_type?: string | null;
          id?: string;
          idempotency_key?: string;
          payload?: NonNullable<Json>;
          processed_at?: string | null;
          provider?: Database["public"]["Enums"]["payment_provider"];
          received_at?: string;
          status?: Database["public"]["Enums"]["webhook_status"];
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      assert_admin_or_service: { Args: Record<PropertyKey, never>; Returns: undefined };
      can_access_lesson: { Args: { p_lesson_id: string }; Returns: boolean };
      claim_auth_email: { Args: { p_email: string; p_kind: string }; Returns: boolean };
      cohort_lessons_for_user: {
        Args: { p_cohort_id: string; p_user_id?: string };
        Returns: {
          is_released: boolean;
          lesson_id: string;
          lesson_position: number;
          release_at: string;
        }[];
      };
      duplicate_cohort: { Args: { p_cohort_id: string }; Returns: string };
      enroll_user: {
        Args: {
          p_cohort_id: string;
          p_origin: Database["public"]["Enums"]["enrollment_origin"];
          p_provider?: Database["public"]["Enums"]["payment_provider"];
          p_transaction_id?: string;
          p_user_id: string;
        };
        Returns: {
          cohort_id: string;
          created_at: string;
          expires_at: string | null;
          external_transaction_id: string | null;
          id: string;
          origin: Database["public"]["Enums"]["enrollment_origin"];
          provider: Database["public"]["Enums"]["payment_provider"] | null;
          started_at: string;
          status: Database["public"]["Enums"]["enrollment_status"];
          updated_at: string;
          user_id: string;
        };
        SetofOptions: {
          from: "*";
          to: "enrollments";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      enrollment_is_active: { Args: { e: Database["public"]["Tables"]["enrollments"]["Row"] }; Returns: boolean };
      is_admin: { Args: Record<PropertyKey, never>; Returns: boolean };
      is_enrolled_in_cohort: { Args: { p_cohort_id: string }; Returns: boolean };
      lesson_comments: {
        Args: { p_cohort_id?: string; p_lesson_id: string };
        Returns: {
          author_id: string;
          author_is_admin: boolean;
          author_name: string;
          content: string;
          created_at: string;
          id: string;
          parent_id: string;
        }[];
      };
      lesson_course_id: { Args: { p_lesson_id: string }; Returns: string };
      lesson_release_at: { Args: { p_cohort_id: string; p_enrolled_at: string; p_lesson_id: string }; Returns: string };
      record_lesson_progress: {
        Args: { p_duration_seconds: number; p_lesson_id: string; p_position_seconds: number };
        Returns: {
          completed_at: string | null;
          last_accessed_at: string;
          last_position_seconds: number;
          lesson_id: string;
          percent: number;
          seconds_watched: number;
          user_id: string;
        };
        SetofOptions: {
          from: "*";
          to: "lesson_progress";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      set_cohort_lessons: { Args: { p_cohort_id: string; p_items: Json }; Returns: undefined };
      set_lesson_completed: {
        Args: { p_completed: boolean; p_lesson_id: string };
        Returns: {
          completed_at: string | null;
          last_accessed_at: string;
          last_position_seconds: number;
          lesson_id: string;
          percent: number;
          seconds_watched: number;
          user_id: string;
        };
        SetofOptions: {
          from: "*";
          to: "lesson_progress";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      touch_last_seen: { Args: Record<PropertyKey, never>; Returns: undefined };
    };
    Enums: {
      access_start: "purchase" | "cohort_start";
      comment_category: "question" | "complaint" | "praise" | "request" | "technical";
      enrollment_origin: "purchase" | "free" | "manual";
      enrollment_status: "active" | "refunded" | "expired";
      lead_access: "direct" | "confirm_email";
      lead_fields: "email" | "whatsapp" | "name_email" | "name_email_whatsapp";
      payment_provider: "kiwify" | "hotmart" | "yampi" | "mercadopago" | "asaas";
      release_mode: "all" | "weekly" | "fixed_date" | "days_after_join";
      user_role: "student" | "admin";
      video_provider: "bunny" | "youtube";
      webhook_status: "received" | "processed" | "ignored" | "failed";
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    keyof (DefaultSchema["Tables"] & DefaultSchema["Views"]) | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"] | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      access_start: ["purchase", "cohort_start"],
      comment_category: ["question", "complaint", "praise", "request", "technical"],
      enrollment_origin: ["purchase", "free", "manual"],
      enrollment_status: ["active", "refunded", "expired"],
      lead_access: ["direct", "confirm_email"],
      lead_fields: ["email", "whatsapp", "name_email", "name_email_whatsapp"],
      payment_provider: ["kiwify", "hotmart", "yampi", "mercadopago", "asaas"],
      release_mode: ["all", "weekly", "fixed_date", "days_after_join"],
      user_role: ["student", "admin"],
      video_provider: ["bunny", "youtube"],
      webhook_status: ["received", "processed", "ignored", "failed"],
    },
  },
} as const;
