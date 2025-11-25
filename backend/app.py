import os
from dotenv import load_dotenv
from flask import Flask 
from flask_cors import CORS 

# Load environment variables from .env file FIRST
load_dotenv()


# --- IMPORT MODELS INITIATOR ---
from utils.load_models import init_models 

# --- GLOBAL STATE FOR REAL-TIME FEATURE HISTORY ---
from utils.session_state import SESSION_FEATURE_HISTORY, ROLLING_WINDOW_SIZE

# Import blueprints
from routes.calibration_routes import calibration_bp
from routes.exam_routes import exam_bp

# --- Flask App Setup ---

# Define the Flask application
app = Flask(__name__)
CORS(app, resources={r"/api/*": {"origins": "http://localhost:8080"}})

# Basic configuration
app.config['SECRET_KEY'] = os.environ.get('FLASK_SECRET_KEY', 'default-dev-key')
app.config['ENV'] = os.environ.get('FLASK_ENV', 'development')

# Register Blueprints
app.register_blueprint(calibration_bp, url_prefix='/api/calibration')
app.register_blueprint(exam_bp, url_prefix='/api/exam')


# --- CRITICAL: CALL MODEL INITIALIZATION HERE ---
# Call the function to load the models into the global variables 
# within load_models.py as soon as the application starts.
with app.app_context():
    init_models()
# --------------------------------------------------


@app.route('/')
def health_check():
    """Simple health check endpoint."""
    return "Proctoring Backend Running", 200

if __name__ == '__main__':
    # Ensure this block uses the correct debug setting
    debug_mode = app.config['ENV'] == 'development'
    print("Server running in development mode." if debug_mode else "Server running in production mode.")
    app.run(debug=debug_mode)