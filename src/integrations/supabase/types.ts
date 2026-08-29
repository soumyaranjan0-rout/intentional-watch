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
  public: {
    Tables: {
      notes: {
        Row: {
          content: string
          created_at: string
          id: string
          timestamp_seconds: number
          topic: string | null
          updated_at: string
          user_id: string
          video_id: string
          video_title: string | null
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          timestamp_seconds?: number
          topic?: string | null
          updated_at?: string
          user_id: string
          video_id: string
          video_title?: string | null
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          timestamp_seconds?: number
          topic?: string | null
          updated_at?: string
          user_id?: string
          video_id?: string
          video_title?: string | null
        }
        Relationships: []
      }
      playlist_items: {
        Row: {
          channel: string | null
          created_at: string
          duration_seconds: number | null
          id: string
          playlist_id: string
          position: number
          thumbnail: string | null
          title: string | null
          user_id: string
          video_id: string
        }
        Insert: {
          channel?: string | null
          created_at?: string
          duration_seconds?: number | null
          id?: string
          playlist_id: string
          position?: number
          thumbnail?: string | null
          title?: string | null
          user_id: string
          video_id: string
        }
        Update: {
          channel?: string | null
          created_at?: string
          duration_seconds?: number | null
          id?: string
          playlist_id?: string
          position?: number
          thumbnail?: string | null
          title?: string | null
          user_id?: string
          video_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "playlist_items_playlist_id_fkey"
            columns: ["playlist_id"]
            isOneToOne: false
            referencedRelation: "playlists"
            referencedColumns: ["id"]
          },
        ]
      }
      playlists: {
        Row: {
          created_at: string
          id: string
          kind: string
          name: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          kind?: string
          name: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          kind?: string
          name?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      preferences: {
        Row: {
          created_at: string
          daily_watch_limit_min: number
          data_tracking: boolean
          default_mode: string | null
          id: string
          theme: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          daily_watch_limit_min?: number
          data_tracking?: boolean
          default_mode?: string | null
          id?: string
          theme?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          daily_watch_limit_min?: number
          data_tracking?: boolean
          default_mode?: string | null
          id?: string
          theme?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          display_name: string | null
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      saved_videos: {
        Row: {
          channel: string | null
          created_at: string
          duration_seconds: number | null
          id: string
          thumbnail: string | null
          title: string | null
          user_id: string
          video_id: string
        }
        Insert: {
          channel?: string | null
          created_at?: string
          duration_seconds?: number | null
          id?: string
          thumbnail?: string | null
          title?: string | null
          user_id: string
          video_id: string
        }
        Update: {
          channel?: string | null
          created_at?: string
          duration_seconds?: number | null
          id?: string
          thumbnail?: string | null
          title?: string | null
          user_id?: string
          video_id?: string
        }
        Relationships: []
      }
      video_feedback: {
        Row: {
          created_at: string
          feedback: string
          id: string
          updated_at: string
          user_id: string
          video_id: string
        }
        Insert: {
          created_at?: string
          feedback: string
          id?: string
          updated_at?: string
          user_id: string
          video_id: string
        }
        Update: {
          created_at?: string
          feedback?: string
          id?: string
          updated_at?: string
          user_id?: string
          video_id?: string
        }
        Relationships: []
      }
      watch_history: {
        Row: {
          category: string | null
          channel: string | null
          duration_seconds: number | null
          effective_seconds: number
          final_intent: string | null
          id: string
          inferred_intent: string | null
          mode: string
          playlist_id: string | null
          seek_count: number
          thumbnail: string | null
          title: string | null
          user_id: string
          video_id: string
          watch_seconds: number
          watched_at: string
        }
        Insert: {
          category?: string | null
          channel?: string | null
          duration_seconds?: number | null
          effective_seconds?: number
          final_intent?: string | null
          id?: string
          inferred_intent?: string | null
          mode: string
          playlist_id?: string | null
          seek_count?: number
          thumbnail?: string | null
          title?: string | null
          user_id: string
          video_id: string
          watch_seconds?: number
          watched_at?: string
        }
        Update: {
          category?: string | null
          channel?: string | null
          duration_seconds?: number | null
          effective_seconds?: number
          final_intent?: string | null
          id?: string
          inferred_intent?: string | null
          mode?: string
          playlist_id?: string | null
          seek_count?: number
          thumbnail?: string | null
          title?: string | null
          user_id?: string
          video_id?: string
          watch_seconds?: number
          watched_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
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
    Enums: {},
  },
} as const
