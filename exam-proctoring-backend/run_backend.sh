#!/bin/bash

# Exam Proctoring Backend Startup Script
# This script starts the Flask ML backend server

echo "======================================================================"
echo "🚀 Starting Exam Proctoring ML Backend"
echo "======================================================================"

# Check if Python is installed
if ! command -v python3 &> /dev/null
then
    echo "❌ Python 3 is not installed. Please install Python 3.8+"
    exit 1
fi

# Check if in correct directory
if [ ! -f "app.py" ]; then
    echo "❌ app.py not found. Please run this script from exam-proctoring-backend directory"
    exit 1
fi

# Check if models exist
if [ ! -d "models" ]; then
    echo "⚠️  WARNING: models directory not found"
    echo "Please ensure ML models are in the models/ directory:"
    echo "  - models/mouse_model.joblib"
    echo "  - models/keystroke_model.joblib"
    echo "  - models/scaler_mouse.joblib"
    echo "  - models/scaler_keystroke.joblib"
fi

# Install dependencies if needed
if [ ! -f ".deps_installed" ]; then
    echo "📦 Installing dependencies..."
    pip install -r requirements.txt
    touch .deps_installed
    echo "✅ Dependencies installed"
fi

# Check if parent .env exists (for Supabase credentials)
if [ ! -f "../.env" ]; then
    echo "⚠️  WARNING: Parent .env file not found"
    echo "Make sure Supabase credentials are configured"
fi

# Start the backend
echo ""
echo "🔥 Starting Flask server..."
echo "======================================================================"
python3 app.py
