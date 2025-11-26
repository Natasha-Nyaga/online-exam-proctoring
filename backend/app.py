import os
from dotenv import load_dotenv
from flask import Flask, jsonify
from flask_cors import CORS

# Load environment variables FIRST
load_dotenv()

# --- CRITICAL: IMPORT AND INITIALIZE MODELS BEFORE BLUEPRINTS ---
from utils.load_models import init_models

# Initialize models IMMEDIATELY
print("\n" + "="*80)
print("INITIALIZING APPLICATION")
print("="*80)
init_models()
print("="*80 + "\n")

# NOW import blueprints (they will see loaded models)
from routes.calibration_routes import calibration_bp
from routes.exam_routes import exam_bp

# --- Flask App Setup ---
app = Flask(__name__)
CORS(app, supports_credentials=True, origins=["http://localhost:8080"])

# Basic configuration
app.config['SECRET_KEY'] = os.environ.get('FLASK_SECRET_KEY', 'default-dev-key')
app.config['ENV'] = os.environ.get('FLASK_ENV', 'development')

# Register Blueprints
app.register_blueprint(calibration_bp, url_prefix='/api/calibration')
app.register_blueprint(exam_bp, url_prefix='/api/exam')


@app.route('/')
def health_check():
    """Simple health check endpoint."""
    from utils.load_models import mouse_model, keystroke_model
    models_status = {
        "keystroke_model_loaded": keystroke_model is not None,
        "mouse_model_loaded": mouse_model is not None
    }
    return jsonify({
        "status": "Proctoring Backend Running",
        "models": models_status
    }), 200


if __name__ == '__main__':
    # Global error handler
    @app.errorhandler(Exception)
    def handle_exception(e):
        response = jsonify(message=str(e))
        response.headers.add("Access-Control-Allow-Origin", "*")
        return response, 500
    
    debug_mode = app.config['ENV'] == 'development'
    print("Server running in development mode." if debug_mode else "Server running in production mode.")
    app.run(debug=debug_mode)