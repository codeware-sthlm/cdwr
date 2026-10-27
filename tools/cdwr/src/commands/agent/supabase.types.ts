/**
 * Hand-written to match agent-queue/supabase/migrations until the migration is applied;
 * then replace it with the output of `supabase gen types typescript`.
 */
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
      runs: {
        Row: {
          id: number;
          started_at: string;
          finished_at: string | null;
          outcome: string;
          ticket: string | null;
          detail: string | null;
          host: string;
          attended: boolean | null;
          job: Json;
        };
        Insert: {
          id?: never;
          started_at: string;
          finished_at?: string | null;
          outcome: string;
          ticket?: string | null;
          detail?: string | null;
          host: string;
          attended?: boolean | null;
          job?: Json;
        };
        Update: {
          id?: never;
          started_at?: string;
          finished_at?: string | null;
          outcome?: string;
          ticket?: string | null;
          detail?: string | null;
          host?: string;
          attended?: boolean | null;
          job?: Json;
        };
        Relationships: [];
      };
      usage: {
        Row: {
          id: number;
          day: string;
          ticket: string | null;
          model: string;
          role: 'planning' | 'orchestrating' | 'implementing';
          input_tokens: number;
          output_tokens: number;
          cost_usd: number;
          host: string;
        };
        Insert: {
          id?: never;
          day: string;
          ticket?: string | null;
          model: string;
          role: 'planning' | 'orchestrating' | 'implementing';
          input_tokens?: number;
          output_tokens?: number;
          cost_usd?: number;
          host: string;
        };
        Update: {
          id?: never;
          day?: string;
          ticket?: string | null;
          model?: string;
          role?: 'planning' | 'orchestrating' | 'implementing';
          input_tokens?: number;
          output_tokens?: number;
          cost_usd?: number;
          host?: string;
        };
        Relationships: [];
      };
      activity: {
        Row: {
          id: number;
          event_id: string;
          at: string;
          ticket: string | null;
          actor: 'agent' | 'scheduler' | 'human';
          change: string;
          host: string | null;
        };
        Insert: {
          id?: never;
          event_id: string;
          at: string;
          ticket?: string | null;
          actor: 'agent' | 'scheduler' | 'human';
          change: string;
          host?: string | null;
        };
        Update: {
          id?: never;
          event_id?: string;
          at?: string;
          ticket?: string | null;
          actor?: 'agent' | 'scheduler' | 'human';
          change?: string;
          host?: string | null;
        };
        Relationships: [];
      };
      sessions: {
        Row: {
          id: string;
          host: string;
          kind: string;
          last_seen: string;
        };
        Insert: {
          id: string;
          host: string;
          kind: string;
          last_seen: string;
        };
        Update: {
          id?: string;
          host?: string;
          kind?: string;
          last_seen?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      status: {
        Row: {
          last_run: Json | null;
          hosts: Json | null;
        };
        Relationships: [];
      };
    };
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
