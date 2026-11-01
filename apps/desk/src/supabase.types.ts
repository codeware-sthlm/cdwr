// Copy of tools/cdwr/src/commands/agent/supabase.types.ts: keep the two in step until they are generated.
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
          cache_read_tokens: number;
          cache_write_tokens: number;
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
          cache_read_tokens?: number;
          cache_write_tokens?: number;
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
          cache_read_tokens?: number;
          cache_write_tokens?: number;
          cost_usd?: number;
          host?: string;
        };
        Relationships: [];
      };
      usage_hours: {
        Row: {
          hour: string;
          host: string;
          model: string;
          role: string;
          input_tokens: number;
          output_tokens: number;
          cache_read_tokens: number;
          cache_write_tokens: number;
          cost_usd: number;
          updated_at: string;
        };
        Insert: {
          hour: string;
          host: string;
          model: string;
          role: string;
          input_tokens?: number;
          output_tokens?: number;
          cache_read_tokens?: number;
          cache_write_tokens?: number;
          cost_usd?: number;
          updated_at?: string;
        };
        Update: {
          hour?: string;
          host?: string;
          model?: string;
          role?: string;
          input_tokens?: number;
          output_tokens?: number;
          cache_read_tokens?: number;
          cache_write_tokens?: number;
          cost_usd?: number;
          updated_at?: string;
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
      queue_state: {
        Row: {
          host: string;
          at: string;
          last_run: string | null;
          attended: string | null;
          suggested: string | null;
          job: string | null;
          view: Json | null;
        };
        Insert: {
          host: string;
          at: string;
          last_run?: string | null;
          attended?: string | null;
          suggested?: string | null;
          job?: string | null;
          view?: Json | null;
        };
        Update: {
          host?: string;
          at?: string;
          last_run?: string | null;
          attended?: string | null;
          suggested?: string | null;
          job?: string | null;
          view?: Json | null;
        };
        Relationships: [];
      };
      issue_events: {
        Row: {
          issue_id: string;
          identifier: string | null;
          action: string;
          updated_at: string;
        };
        Insert: {
          issue_id: string;
          identifier?: string | null;
          action: string;
          updated_at: string;
        };
        Update: {
          issue_id?: string;
          identifier?: string | null;
          action?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      github_events: {
        Row: {
          subject: string;
          pr: number | null;
          action: string;
          updated_at: string;
        };
        Insert: {
          subject: string;
          pr?: number | null;
          action: string;
          updated_at: string;
        };
        Update: {
          subject?: string;
          pr?: number | null;
          action?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      host_metrics: {
        Row: {
          id: number;
          host: string;
          at: string;
          cores: number;
          load1: number;
          load5: number;
          load15: number;
          mem_total: number;
          mem_available: number;
          swap_total: number;
          swap_free: number;
          disk_total: number;
          disk_free: number;
          cgroup_mem_current: number | null;
          cgroup_mem_max: number | null;
        };
        Insert: {
          id?: never;
          host: string;
          at?: string;
          cores: number;
          load1: number;
          load5: number;
          load15: number;
          mem_total: number;
          mem_available: number;
          swap_total: number;
          swap_free: number;
          disk_total: number;
          disk_free: number;
          cgroup_mem_current?: number | null;
          cgroup_mem_max?: number | null;
        };
        Update: {
          id?: never;
          host?: string;
          at?: string;
          cores?: number;
          load1?: number;
          load5?: number;
          load15?: number;
          mem_total?: number;
          mem_available?: number;
          swap_total?: number;
          swap_free?: number;
          disk_total?: number;
          disk_free?: number;
          cgroup_mem_current?: number | null;
          cgroup_mem_max?: number | null;
        };
        Relationships: [];
      };
      builds: {
        Row: {
          workflow: string;
          sha: string;
          run_created_at: string;
          updated_at: string;
        };
        Insert: {
          workflow: string;
          sha: string;
          run_created_at: string;
          updated_at: string;
        };
        Update: {
          workflow?: string;
          sha?: string;
          run_created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      plan_usage: {
        Row: {
          kind: string;
          resets_at: string;
          used_percentage: number;
          sampled_at: string;
          host: string;
        };
        Insert: {
          kind: string;
          resets_at: string;
          used_percentage: number;
          sampled_at?: string;
          host: string;
        };
        Update: {
          kind?: string;
          resets_at?: string;
          used_percentage?: number;
          sampled_at?: string;
          host?: string;
        };
        Relationships: [];
      };
      sessions: {
        Row: {
          id: string;
          host: string;
          kind: string;
          last_seen: string;
          state: string | null;
          detail: string | null;
        };
        Insert: {
          id: string;
          host: string;
          kind: string;
          last_seen: string;
          state?: string | null;
          detail?: string | null;
        };
        Update: {
          id?: string;
          host?: string;
          kind?: string;
          last_seen?: string;
          state?: string | null;
          detail?: string | null;
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
