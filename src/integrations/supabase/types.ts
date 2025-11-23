export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json }
  | Json[];

export interface Database {
  public: {
    Tables: {
      calibration_sessions: {
        Row: {
          id: string;
          student_id: string;
          status: string;
          started_at: string | null;
          completed_at: string | null;
          created_at: string | null;
        };
        Insert: {
          id?: string;
          student_id: string;
          status?: string;
          started_at?: string | null;
          completed_at?: string | null;
          created_at?: string | null;
        };
        Update: {
          id?: string;
          student_id?: string;
          status?: string;
          started_at?: string | null;
          completed_at?: string | null;
          created_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "calibration_sessions_student_id_fkey";
            columns: ["student_id"];
            referencedRelation: "users";
            referencedColumns: ["id"];
          }
        ];
      };

      behavioral_metrics: {
        Row: {
          id: string;
          calibration_session_id: string;
          student_id: string;
          metric_type: string; // "keystroke" | "mouse"
          question_type: string; // "essay" | "mcq"
          question_index: number;

          // NEW KEYSTROKE METRICS
          mean_du_key1_key1: number | null;
          mean_dd_key1_key2: number | null;
          mean_du_key1_key2: number | null;
          mean_ud_key1_key2: number | null;
          mean_uu_key1_key2: number | null;

          std_du_key1_key1: number | null;
          std_dd_key1_key2: number | null;
          std_du_key1_key2: number | null;
          std_ud_key1_key2: number | null;
          std_uu_key1_key2: number | null;

          keystroke_count: number | null;

          // NEW MOUSE METRICS
          inactive_duration: number | null;
          copy_cut: number | null;
          paste: number | null;
          double_click: number | null;

          recorded_at: string | null;
          created_at: string | null;
        };

        Insert: {
          id?: string;
          calibration_session_id: string;
          student_id: string;
          metric_type: string;
          question_type: string;
          question_index: number;

          mean_du_key1_key1?: number | null;
          mean_dd_key1_key2?: number | null;
          mean_du_key1_key2?: number | null;
          mean_ud_key1_key2?: number | null;
          mean_uu_key1_key2?: number | null;

          std_du_key1_key1?: number | null;
          std_dd_key1_key2?: number | null;
          std_du_key1_key2?: number | null;
          std_ud_key1_key2?: number | null;
          std_uu_key1_key2?: number | null;

          keystroke_count?: number | null;

          inactive_duration?: number | null;
          copy_cut?: number | null;
          paste?: number | null;
          double_click?: number | null;

          recorded_at?: string | null;
          created_at?: string | null;
        };

        Update: {
          id?: string;
          calibration_session_id?: string;
          student_id?: string;
          metric_type?: string;
          question_type?: string;
          question_index?: number;

          mean_du_key1_key1?: number | null;
          mean_dd_key1_key2?: number | null;
          mean_du_key1_key2?: number | null;
          mean_ud_key1_key2?: number | null;
          mean_uu_key1_key2?: number | null;

          std_du_key1_key1?: number | null;
          std_dd_key1_key2?: number | null;
          std_du_key1_key2?: number | null;
          std_ud_key1_key2?: number | null;
          std_uu_key1_key2?: number | null;

          keystroke_count?: number | null;

          inactive_duration?: number | null;
          copy_cut?: number | null;
          paste?: number | null;
          double_click?: number | null;

          recorded_at?: string | null;
          created_at?: string | null;
        };

        Relationships: [
          {
            foreignKeyName: "behavioral_metrics_calibration_session_id_fkey";
            columns: ["calibration_session_id"];
            referencedRelation: "calibration_sessions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "behavioral_metrics_student_id_fkey";
            columns: ["student_id"];
            referencedRelation: "users";
            referencedColumns: ["id"];
          }
        ];
      };
    };

    Views: {};
    Functions: {};
    Enums: {};
  };
}
