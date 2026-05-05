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
      stocks: {
        Row: {
          id: string;
          ticker: string;
          exchange: string;
          name: string;
          name_en: string | null;
          currency: string;
          support_status: "supported" | "unsupported";
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
          p_basis: string;
          p_account_type: string;
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
          p_basis: string;
          p_account_type: string;
        };
        Returns: Json;
      };
      get_stock_detail: {
        Args: {
          p_stock_id: string;
        };
        Returns: Json;
      };
    };
    Enums: {
      app_role: "user" | "admin";
      profile_status: "active" | "deleted";
    };
    CompositeTypes: Record<string, never>;
  };
};
