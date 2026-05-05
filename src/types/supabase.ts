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
    Functions: Record<string, never>;
    Enums: {
      app_role: "user" | "admin";
      profile_status: "active" | "deleted";
    };
    CompositeTypes: Record<string, never>;
  };
};
