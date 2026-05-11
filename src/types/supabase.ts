export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  public: {
    Tables: {
      disclosures: {
        Row: {
          id: string;
          stock_id: string | null;
          external_id: string | null;
          source_type: string;
          title: string;
          document_url: string | null;
          storage_path: string | null;
          published_at: string | null;
          collected_at: string;
          status: string;
          disclosure_type: Database["public"]["Enums"]["disclosure_type"];
          parse_status: Database["public"]["Enums"]["disclosure_parse_status"];
          review_priority: Database["public"]["Enums"]["disclosure_review_priority"];
          ai_parse_attempts: number;
          last_parse_error: string | null;
          ai_parse_input_tokens: number | null;
          ai_parse_output_tokens: number | null;
          ai_parse_cost_usd: number | null;
          raw_payload: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          stock_id?: string | null;
          external_id?: string | null;
          source_type: string;
          title: string;
          document_url?: string | null;
          storage_path?: string | null;
          published_at?: string | null;
          collected_at?: string;
          status?: string;
          disclosure_type?: Database["public"]["Enums"]["disclosure_type"];
          parse_status?: Database["public"]["Enums"]["disclosure_parse_status"];
          review_priority?: Database["public"]["Enums"]["disclosure_review_priority"];
          ai_parse_attempts?: number;
          last_parse_error?: string | null;
          ai_parse_input_tokens?: number | null;
          ai_parse_output_tokens?: number | null;
          ai_parse_cost_usd?: number | null;
          raw_payload?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          stock_id?: string | null;
          external_id?: string | null;
          source_type?: string;
          title?: string;
          document_url?: string | null;
          storage_path?: string | null;
          published_at?: string | null;
          collected_at?: string;
          status?: string;
          disclosure_type?: Database["public"]["Enums"]["disclosure_type"];
          parse_status?: Database["public"]["Enums"]["disclosure_parse_status"];
          review_priority?: Database["public"]["Enums"]["disclosure_review_priority"];
          ai_parse_attempts?: number;
          last_parse_error?: string | null;
          ai_parse_input_tokens?: number | null;
          ai_parse_output_tokens?: number | null;
          ai_parse_cost_usd?: number | null;
          raw_payload?: Json;
          updated_at?: string;
        };
      };
      dividend_reviews: {
        Row: {
          id: string;
          stock_id: string | null;
          disclosure_id: string | null;
          extracted_dividend_per_share: number | null;
          previous_dividend_per_share: number | null;
          extracted_payment_date: string | null;
          extracted_payment_month: number | null;
          confidence_score: number | null;
          fiscal_year: number | null;
          event_type: Database["public"]["Enums"]["dividend_event_type"] | null;
          extracted_record_date: string | null;
          extracted_ex_dividend_date: string | null;
          change_type: Database["public"]["Enums"]["dividend_change_type"] | null;
          evidence_text: string | null;
          warning_message: string | null;
          status: string;
          reviewed_by: string | null;
          reviewed_at: string | null;
          rejection_reason: string | null;
          created_dividend_event_id: string | null;
          raw_payload: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          stock_id?: string | null;
          disclosure_id?: string | null;
          extracted_dividend_per_share?: number | null;
          previous_dividend_per_share?: number | null;
          extracted_payment_date?: string | null;
          extracted_payment_month?: number | null;
          confidence_score?: number | null;
          fiscal_year?: number | null;
          event_type?: Database["public"]["Enums"]["dividend_event_type"] | null;
          extracted_record_date?: string | null;
          extracted_ex_dividend_date?: string | null;
          change_type?: Database["public"]["Enums"]["dividend_change_type"] | null;
          evidence_text?: string | null;
          warning_message?: string | null;
          status?: string;
          reviewed_by?: string | null;
          reviewed_at?: string | null;
          rejection_reason?: string | null;
          created_dividend_event_id?: string | null;
          raw_payload?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          stock_id?: string | null;
          disclosure_id?: string | null;
          extracted_dividend_per_share?: number | null;
          previous_dividend_per_share?: number | null;
          extracted_payment_date?: string | null;
          extracted_payment_month?: number | null;
          confidence_score?: number | null;
          fiscal_year?: number | null;
          event_type?: Database["public"]["Enums"]["dividend_event_type"] | null;
          extracted_record_date?: string | null;
          extracted_ex_dividend_date?: string | null;
          change_type?: Database["public"]["Enums"]["dividend_change_type"] | null;
          evidence_text?: string | null;
          warning_message?: string | null;
          status?: string;
          reviewed_by?: string | null;
          reviewed_at?: string | null;
          rejection_reason?: string | null;
          created_dividend_event_id?: string | null;
          raw_payload?: Json;
          updated_at?: string;
        };
      };
      holdings: {
        Row: {
          id: string;
          user_id: string;
          stock_id: string;
          quantity: number;
          average_purchase_price: number;
          account_type: "nisa" | "tokutei" | "general";
          memo: string | null;
          created_at: string;
          updated_at: string;
          deleted_at: string | null;
        };
        Insert: {
          id?: string;
          user_id: string;
          stock_id: string;
          quantity: number;
          average_purchase_price: number;
          account_type: "nisa" | "tokutei" | "general";
          memo?: string | null;
          created_at?: string;
          updated_at?: string;
          deleted_at?: string | null;
        };
        Update: {
          quantity?: number;
          average_purchase_price?: number;
          account_type?: "nisa" | "tokutei" | "general";
          memo?: string | null;
          updated_at?: string;
          deleted_at?: string | null;
        };
      };
      dividend_events: {
        Row: {
          id: string;
          stock_id: string;
          fiscal_year: number;
          payment_year: number | null;
          event_type: Database["public"]["Enums"]["dividend_event_type"];
          dividend_per_share: number | null;
          previous_dividend_per_share: number | null;
          expected_payment_date: string | null;
          expected_payment_month: number | null;
          record_date: string | null;
          ex_dividend_date: string | null;
          status: "estimated" | "confirmed" | "paid" | "undecided";
          change_type:
            Database["public"]["Enums"]["dividend_change_type"] | null;
          source_type: string | null;
          source_url: string | null;
          source_published_at: string | null;
          review_status: Database["public"]["Enums"]["review_status"];
          rejection_reason: string | null;
          disclosure_id: string | null;
          raw_payload: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          stock_id: string;
          fiscal_year: number;
          payment_year?: number | null;
          event_type: Database["public"]["Enums"]["dividend_event_type"];
          dividend_per_share?: number | null;
          previous_dividend_per_share?: number | null;
          expected_payment_date?: string | null;
          expected_payment_month?: number | null;
          record_date?: string | null;
          ex_dividend_date?: string | null;
          status?: "estimated" | "confirmed" | "paid" | "undecided";
          change_type?: Database["public"]["Enums"]["dividend_change_type"] | null;
          source_type?: string | null;
          source_url?: string | null;
          source_published_at?: string | null;
          review_status?: Database["public"]["Enums"]["review_status"];
          rejection_reason?: string | null;
          disclosure_id?: string | null;
          raw_payload?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          fiscal_year?: number;
          payment_year?: number | null;
          event_type?: Database["public"]["Enums"]["dividend_event_type"];
          dividend_per_share?: number | null;
          previous_dividend_per_share?: number | null;
          expected_payment_date?: string | null;
          expected_payment_month?: number | null;
          record_date?: string | null;
          ex_dividend_date?: string | null;
          status?: "estimated" | "confirmed" | "paid" | "undecided";
          change_type?: Database["public"]["Enums"]["dividend_change_type"] | null;
          source_type?: string | null;
          source_url?: string | null;
          source_published_at?: string | null;
          review_status?: Database["public"]["Enums"]["review_status"];
          rejection_reason?: string | null;
          disclosure_id?: string | null;
          raw_payload?: Json;
          updated_at?: string;
        };
      };
      notification_rules: {
        Row: {
          id: string;
          user_id: string;
          stock_id: string;
          basis: "before_tax_yield" | "after_tax_yield";
          operator: "gte" | "lte";
          target_yield: number;
          notify_in_app: boolean;
          notify_email: boolean;
          status: "active" | "disabled";
          last_triggered_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          stock_id: string;
          basis: "before_tax_yield" | "after_tax_yield";
          operator: "gte" | "lte";
          target_yield: number;
          notify_in_app?: boolean;
          notify_email?: boolean;
          status?: "active" | "disabled";
          last_triggered_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          basis?: "before_tax_yield" | "after_tax_yield";
          operator?: "gte" | "lte";
          target_yield?: number;
          notify_in_app?: boolean;
          notify_email?: boolean;
          status?: "active" | "disabled";
          last_triggered_at?: string | null;
          updated_at?: string;
        };
      };
      notifications: {
        Row: {
          id: string;
          user_id: string;
          stock_id: string | null;
          notification_rule_id: string | null;
          type:
            | "yield_target"
            | "dividend_increase"
            | "dividend_decrease"
            | "no_dividend"
            | "special_dividend"
            | "data_update";
          title: string;
          body: string;
          payload: Json;
          status: "unread" | "read" | "failed";
          channel: "in_app" | "email";
          sent_at: string | null;
          read_at: string | null;
          created_at: string;
          sent_via_email_at: string | null;
          email_delivery_status: string | null;
          email_delivery_error: string | null;
        };
        Insert: {
          id?: string;
          user_id: string;
          stock_id?: string | null;
          notification_rule_id?: string | null;
          type:
            | "yield_target"
            | "dividend_increase"
            | "dividend_decrease"
            | "no_dividend"
            | "special_dividend"
            | "data_update";
          title: string;
          body: string;
          payload?: Json;
          status?: "unread" | "read" | "failed";
          channel?: "in_app" | "email";
          sent_at?: string | null;
          read_at?: string | null;
          created_at?: string;
          sent_via_email_at?: string | null;
          email_delivery_status?: string | null;
          email_delivery_error?: string | null;
        };
        Update: {
          status?: "unread" | "read" | "failed";
          read_at?: string | null;
          sent_via_email_at?: string | null;
          email_delivery_status?: string | null;
          email_delivery_error?: string | null;
        };
      };
      jobs: {
        Row: {
          id: string;
          type: string;
          status: string;
          payload: Json;
          run_after: string;
          attempts: number;
          max_attempts: number;
          last_error: string | null;
          priority: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          type: string;
          status?: string;
          payload?: Json;
          run_after?: string;
          attempts?: number;
          max_attempts?: number;
          last_error?: string | null;
          priority?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          type?: string;
          status?: string;
          payload?: Json;
          run_after?: string;
          attempts?: number;
          max_attempts?: number;
          last_error?: string | null;
          priority?: number;
          updated_at?: string;
        };
      };
      profiles: {
        Row: {
          id: string;
          email: string;
          role: "user" | "admin";
          status: "active" | "deleted";
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          email: string;
          role?: "user" | "admin";
          status?: "active" | "deleted";
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          email?: string;
          role?: "user" | "admin";
          status?: "active" | "deleted";
          updated_at?: string;
        };
      };
      user_settings: {
        Row: {
          id: string;
          user_id: string;
          email_notification_enabled: boolean;
          in_app_notification_enabled: boolean;
          default_amount_basis: "before_tax" | "after_tax";
          currency: string;
          monthly_dividend_goal_amount: number | null;
          annual_dividend_goal_amount: number | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          email_notification_enabled?: boolean;
          in_app_notification_enabled?: boolean;
          default_amount_basis?: "before_tax" | "after_tax";
          currency?: string;
          monthly_dividend_goal_amount?: number | null;
          annual_dividend_goal_amount?: number | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          email_notification_enabled?: boolean;
          in_app_notification_enabled?: boolean;
          default_amount_basis?: "before_tax" | "after_tax";
          currency?: string;
          monthly_dividend_goal_amount?: number | null;
          annual_dividend_goal_amount?: number | null;
          updated_at?: string;
        };
      };
      stocks: {
        Row: {
          id: string;
          ticker: string;
          exchange: string;
          name: string;
          name_en: string | null;
          currency: string;
          support_status: "supported" | "unsupported" | "delisted";
          market_segment: string | null;
          current_price: number | null;
          price_updated_at: string | null;
          expected_annual_dividend_per_share: number | null;
          expected_dividend_yield: number | null;
          created_at: string;
          updated_at: string;
        };
        Insert: never;
        Update: never;
      };
      stock_import_logs: {
        Row: {
          id: string;
          file_path: string;
          dry_run: boolean;
          processed_count: number;
          inserted_count: number;
          updated_count: number;
          delisted_count: number;
          failed_count: number;
          status: "running" | "success" | "failed";
          error_message: string | null;
          started_at: string;
          completed_at: string | null;
          created_at: string;
        };
        Insert: never;
        Update: never;
      };
    };
    Views: Record<string, never>;
    Functions: {
      calculate_holding_dividend: {
        Args: {
          p_stock_id: string;
          p_quantity: number;
          p_average_purchase_price: number;
          p_account_type: string;
        };
        Returns: {
          before_tax_amount: number | null;
          estimated_tax_amount: number | null;
          after_tax_amount: number | null;
          before_tax_yield: number | null;
          after_tax_yield: number | null;
          currency: string;
        }[];
      };
      get_portfolio_summary: {
        Args: {
          p_account_type?: string | null;
          p_year?: number;
        };
        Returns: {
          holding_count: number;
          annual_before_tax_amount: number | null;
          annual_estimated_tax_amount: number | null;
          annual_after_tax_amount: number | null;
          average_after_tax_yield: number | null;
          currency: string;
        }[];
      };
      get_home_summary: {
        Args: {
          p_year: number;
        };
        Returns: Json;
      };
      get_dividend_calendar: {
        Args: {
          p_year: number;
          p_amount_basis: string;
          p_account_type: string;
          p_calendar_basis?: string;
        };
        Returns: {
          month: number;
          amount: number | null;
          event_count: number;
        }[];
      };
      get_dividend_month_detail: {
        Args: {
          p_year: number;
          p_month: number;
          p_amount_basis: string;
          p_account_type: string;
          p_calendar_basis?: string;
        };
        Returns: Json;
      };
      get_stock_detail: {
        Args: {
          p_stock_id: string;
          p_year?: number;
        };
        Returns: Json;
      };
      evaluate_notification_rules: {
        Args: {
          p_stock_id?: string | null;
          p_user_id?: string | null;
          p_dry_run?: boolean;
        };
        Returns: Json;
      };
      approve_dividend_review: {
        Args: {
          p_review_id: string;
          p_override?: Json;
        };
        Returns: Json;
      };
      approve_dividend_review_for_reviewer: {
        Args: {
          p_review_id: string;
          p_reviewer_id: string;
          p_override?: Json;
        };
        Returns: Json;
      };
      reject_dividend_review: {
        Args: {
          p_review_id: string;
          p_reason: string;
        };
        Returns: Json;
      };
      reject_dividend_review_for_reviewer: {
        Args: {
          p_review_id: string;
          p_reason: string;
          p_reviewer_id: string;
        };
        Returns: Json;
      };
      collect_disclosure_candidate: {
        Args: {
          p_candidate: Json;
        };
        Returns: Json;
      };
      parse_disclosure: {
        Args: {
          p_disclosure_id: string;
        };
        Returns: Json;
      };
      get_pending_email_notifications: {
        Args: {
          p_user_id: string;
        };
        Returns: Database["public"]["Tables"]["notifications"]["Row"][];
      };
      mark_notification_email_delivered: {
        Args: {
          p_notification_id: string;
          p_status: string;
          p_error?: string | null;
        };
        Returns: Json;
      };
      get_stocks_with_consecutive_price_refresh_failures: {
        Args: {
          p_consecutive_count?: number;
        };
        Returns: {
          stock_id: string;
          ticker: string | null;
          name: string | null;
          failure_count: number;
        }[];
      };
    };
    Enums: {
      app_role: "user" | "admin";
      profile_status: "active" | "deleted";
      amount_basis: "before_tax" | "after_tax";
      notification_rule_basis: "before_tax_yield" | "after_tax_yield";
      notification_operator: "gte" | "lte";
      notification_rule_status: "active" | "disabled";
      notification_type:
        | "yield_target"
        | "dividend_increase"
        | "dividend_decrease"
        | "no_dividend"
        | "special_dividend"
        | "data_update";
      notification_status: "unread" | "read" | "failed";
      notification_channel: "in_app" | "email";
      disclosure_type:
        | "dividend_forecast_revision"
        | "dividend_decision"
        | "earnings_release"
        | "earnings_revision"
        | "correction"
        | "other";
      disclosure_parse_status:
        | "pending"
        | "downloaded"
        | "parsing"
        | "parsed"
        | "failed"
        | "skipped";
      disclosure_review_priority: "low" | "normal" | "high" | "urgent";
      dividend_event_type:
        | "interim"
        | "year_end"
        | "annual_total"
        | "special"
        | "commemorative"
        | "other";
      dividend_change_type:
        | "increase"
        | "decrease"
        | "no_dividend"
        | "resumed"
        | "special"
        | "commemorative"
        | "unchanged"
        | "unknown";
      review_status: "pending" | "approved" | "rejected" | "needs_manual_check";
      job_type:
        | "collect_disclosures"
        | "download_disclosure_pdf"
        | "parse_disclosure_pdf_ai"
        | "approve_dividend_review"
        | "evaluate_notification_rules"
        | "refresh_stock_prices";
    };
    CompositeTypes: Record<string, never>;
  };
};
