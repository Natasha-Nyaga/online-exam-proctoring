import os
import json
from supabase import create_client, Client
# from gotrue.errors import AuthApiError
from flask import current_app

# Supabase initialization uses environment variables from app.py config
SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_SERVICE_KEY = os.environ.get("SUPABASE_SERVICE_KEY")

if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
    # In a production environment, this should raise an error
    print("WARNING: Supabase URL or Service Key not found in environment variables.")

# Initialize the Supabase client using the secure SERVICE KEY
try:
    supabase: Client = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)
except Exception as e:
    print(f"Failed to initialize Supabase client: {e}")
    # Use a dummy client if initialization fails, to prevent immediate crash
    class DummySupabase:
        def table(self, name): return self
        def insert(self, data): return self
        def update(self, data): return self
        def select(self, columns): return self
        def eq(self, column, value): return self
        def order(self, column, desc): return self
        def limit(self, count): return self
        def single(self): return self
        def execute(self): return self
        def error(self): return None
    supabase = DummySupabase()


def create_calibration_session(student_id: str):
    """
    Creates a new calibration session record and returns its ID.
    This is the first step before the student starts the calibration test.
    """
    try:
        response = supabase.table("calibration_sessions").insert({
            "student_id": student_id,
            "status": "in_progress"
        }).select("id, session_id").single().execute()
        
        # Return the UUID for the new session
        return response.data["id"] 
    except Exception as e:
        print(f"Error creating calibration session: {e}")
        return None

def save_personalized_thresholds(student_id: str, session_id: str, fusion_mean: float, fusion_std: float, calculated_threshold: float, baseline_stats: dict):
    """
    Saves the final calculated threshold and consolidated feature statistics 
    to the personal_thresholds table. This is the official student baseline.
    """
    try:
        # Save the consolidated stats (mean/std for all features) needed for normalization
        response = supabase.table("personal_thresholds").insert({
            "student_id": student_id,
            "calibration_session_id": session_id,
            "fusion_mean": fusion_mean,
            "fusion_std": fusion_std,
            "threshold": calculated_threshold,
            "baseline_stats": json.dumps(baseline_stats) # Store all feature means/stds
        }).execute()
        
        # Mark the session as completed
        supabase.table("calibration_sessions").update({
            "status": "completed",
            "completed_at": "now()"
        }).eq("id", session_id).execute()
        
        return True
    except Exception as e:
        print(f"Error saving personalized threshold for session {session_id}: {e}")
        return False

def get_student_baseline(student_id: str):
    """
    Retrieves the most recent personalized baseline (features/stats) and threshold 
    from the personal_thresholds table for a given student.
    """
    try:
        # Fetch the most recent completed baseline record
        response = supabase.table("personal_thresholds")\
            .select("baseline_stats, threshold")\
            .eq("student_id", student_id)\
            .order("created_at", desc=True)\
            .limit(1)\
            .single()\
            .execute()
            
        if response.data and response.data.get("baseline_stats"):
            # The baseline_stats contain the mean/std for all features used for Z-scoring
            return {
                "stats": json.loads(response.data["baseline_stats"]),
                "system_threshold": response.data["threshold"] # The 95th/99th percentile threshold
            }
        return None
    except Exception as e:
        # Thrown if .single() fails (no record found) or other errors
        print(f"Error retrieving baseline for student {student_id}: {e}")
        return None
    except Exception as e:
        print(f"Error retrieving baseline for student {student_id}: {e}")
        return None

def save_anomaly_record(session_id: str, final_risk_score: float, incident_details: dict):
    """
    Logs the real-time anomaly score as a cheating incident in the 
    cheating_incidents table.
    """
    try:
        # Determine severity based on the final risk score
        if final_risk_score >= 0.8:
            severity = "high"
        elif final_risk_score >= 0.6:
            severity = "medium"
        else:
            severity = "low"
            
        supabase.table('cheating_incidents').insert({
            'session_id': session_id,
            'incident_type': 'behavioral_anomaly',
            'description': f"Fusion risk score of {final_risk_score:.2f} recorded.",
            'severity_score': final_risk_score,
            'severity': severity,
            'details': json.dumps(incident_details) # Store the breakdown (k_score, m_score, etc.)
        }).execute()
        
        return True
    except Exception as e:
        print(f"Error saving cheating incident for session {session_id}: {e}")
        return False