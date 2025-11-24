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
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
      admins: {
        Row: {
          admin_id: string
          created_at: string | null
          id: string
        }
        Insert: {
          admin_id: string
          created_at?: string | null
          id: string
        }
        Update: {
          admin_id?: string
          created_at?: string | null
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "admins_id_fkey"
            columns: ["id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      answers: {
        Row: {
          answer_text: string | null
          answered_at: string | null
          id: string
          question_id: string
          session_id: string
        }
        Insert: {
          answer_text?: string | null
          answered_at?: string | null
          id?: string
          question_id: string
          session_id: string
        }
        Update: {
          answer_text?: string | null
          answered_at?: string | null
          id?: string
          question_id?: string
          session_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "answers_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "questions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "answers_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "exam_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      behavioral_metrics: {
        Row: {
          calibration_session_id: string
          copy_cut: number | null
          created_at: string | null
          double_click: number | null
          id: string
          inactive_duration: number | null
          keystroke_count: number | null
          mean_dd_key1_key2: number | null
          mean_du_key1_key1: number | null
          mean_du_key1_key2: number | null
          mean_ud_key1_key2: number | null
          mean_uu_key1_key2: number | null
          metric_type: string
          paste: number | null
          question_index: number
          question_type: string
          recorded_at: string | null
          std_dd_key1_key2: number | null
          std_du_key1_key1: number | null
          std_du_key1_key2: number | null
          std_ud_key1_key2: number | null
          std_uu_key1_key2: number | null
          student_id: string
        }
        Insert: {
          calibration_session_id: string
          copy_cut?: number | null
          created_at?: string | null
          double_click?: number | null
          id?: string
          inactive_duration?: number | null
          keystroke_count?: number | null
          mean_dd_key1_key2?: number | null
          mean_du_key1_key1?: number | null
          mean_du_key1_key2?: number | null
          mean_ud_key1_key2?: number | null
          mean_uu_key1_key2?: number | null
          metric_type: string
          paste?: number | null
          question_index: number
          question_type: string
          recorded_at?: string | null
          std_dd_key1_key2?: number | null
          std_du_key1_key1?: number | null
          std_du_key1_key2?: number | null
          std_ud_key1_key2?: number | null
          std_uu_key1_key2?: number | null
          student_id: string
        }
        Update: {
          calibration_session_id?: string
          copy_cut?: number | null
          created_at?: string | null
          double_click?: number | null
          id?: string
          inactive_duration?: number | null
          keystroke_count?: number | null
          mean_dd_key1_key2?: number | null
          mean_du_key1_key1?: number | null
          mean_du_key1_key2?: number | null
          mean_ud_key1_key2?: number | null
          mean_uu_key1_key2?: number | null
          metric_type?: string
          paste?: number | null
          question_index?: number
          question_type?: string
          recorded_at?: string | null
          std_dd_key1_key2?: number | null
          std_du_key1_key1?: number | null
          std_du_key1_key2?: number | null
          std_ud_key1_key2?: number | null
          std_uu_key1_key2?: number | null
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "behavioral_metrics_calibration_session_id_fkey"
            columns: ["calibration_session_id"]
            isOneToOne: false
            referencedRelation: "calibration_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      calibration_sessions: {
        Row: {
          completed_at: string | null
          created_at: string | null
          id: string
          session_id: string | null
          started_at: string | null
          status: string
          student_id: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string | null
          id?: string
          session_id?: string | null
          started_at?: string | null
          status?: string
          student_id: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string | null
          id?: string
          session_id?: string | null
          started_at?: string | null
          status?: string
          student_id?: string
        }
        Relationships: []
      }
      cheating_incidents: {
        Row: {
          description: string | null
          details: Json | null
          id: string
          incident_type: string
          metadata: Json | null
          session_id: string
          severity: string | null
          severity_score: number | null
          timestamp: string | null
        }
        Insert: {
          description?: string | null
          details?: Json | null
          id?: string
          incident_type: string
          metadata?: Json | null
          session_id: string
          severity?: string | null
          severity_score?: number | null
          timestamp?: string | null
        }
        Update: {
          description?: string | null
          details?: Json | null
          id?: string
          incident_type?: string
          metadata?: Json | null
          session_id?: string
          severity?: string | null
          severity_score?: number | null
          timestamp?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cheating_incidents_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "exam_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      exam_sessions: {
        Row: {
          completed_at: string | null
          exam_id: string
          id: string
          started_at: string | null
          status: string | null
          student_id: string
          total_score: number | null
        }
        Insert: {
          completed_at?: string | null
          exam_id: string
          id?: string
          started_at?: string | null
          status?: string | null
          student_id: string
          total_score?: number | null
        }
        Update: {
          completed_at?: string | null
          exam_id?: string
          id?: string
          started_at?: string | null
          status?: string | null
          student_id?: string
          total_score?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "exam_sessions_exam_id_fkey"
            columns: ["exam_id"]
            isOneToOne: false
            referencedRelation: "exams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exam_sessions_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      exams: {
        Row: {
          created_at: string | null
          created_by: string
          description: string | null
          duration_minutes: number
          id: string
          title: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          created_by: string
          description?: string | null
          duration_minutes: number
          id?: string
          title: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          created_by?: string
          description?: string | null
          duration_minutes?: number
          id?: string
          title?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "exams_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      personal_thresholds: {
        Row: {
          baseline_stats: Json | null
          calibration_session_id: string
          created_at: string | null
          fusion_mean: number
          fusion_std: number
          id: string
          student_id: string
          threshold: number
          updated_at: string | null
        }
        Insert: {
          baseline_stats?: Json | null
          calibration_session_id: string
          created_at?: string | null
          fusion_mean: number
          fusion_std: number
          id?: string
          student_id: string
          threshold: number
          updated_at?: string | null
        }
        Update: {
          baseline_stats?: Json | null
          calibration_session_id?: string
          created_at?: string | null
          fusion_mean?: number
          fusion_std?: number
          id?: string
          student_id?: string
          threshold?: number
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "personal_thresholds_calibration_session_id_fkey"
            columns: ["calibration_session_id"]
            isOneToOne: false
            referencedRelation: "calibration_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "personal_thresholds_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string | null
          email: string
          id: string
          name: string
          role: Database["public"]["Enums"]["app_role"]
        }
        Insert: {
          created_at?: string | null
          email: string
          id: string
          name: string
          role: Database["public"]["Enums"]["app_role"]
        }
        Update: {
          created_at?: string | null
          email?: string
          id?: string
          name?: string
          role?: Database["public"]["Enums"]["app_role"]
        }
        Relationships: []
      }
      questions: {
        Row: {
          correct_answer: string | null
          created_at: string | null
          exam_id: string
          id: string
          options: Json | null
          order_number: number
          points: number | null
          question_text: string
          question_type: string
        }
        Insert: {
          correct_answer?: string | null
          created_at?: string | null
          exam_id: string
          id?: string
          options?: Json | null
          order_number: number
          points?: number | null
          question_text: string
          question_type: string
        }
        Update: {
          correct_answer?: string | null
          created_at?: string | null
          exam_id?: string
          id?: string
          options?: Json | null
          order_number?: number
          points?: number | null
          question_text?: string
          question_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "questions_exam_id_fkey"
            columns: ["exam_id"]
            isOneToOne: false
            referencedRelation: "exams"
            referencedColumns: ["id"]
          },
        ]
      }
      students: {
        Row: {
          course_name: string
          created_at: string | null
          id: string
          student_id: string
        }
        Insert: {
          course_name: string
          created_at?: string | null
          id: string
          student_id: string
        }
        Update: {
          course_name?: string
          created_at?: string | null
          id?: string
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "students_id_fkey"
            columns: ["id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "student" | "admin"
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
    Enums: {
      app_role: ["student", "admin"],
    },
  },
} as const
