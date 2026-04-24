#!/bin/bash
echo "🚀 Starting AI Autonomous Web Scraping Agent..."

# Kill processes on ports
for port in 3000 3001; do
  pid=$(lsof -ti:$port 2>/dev/null)
  if [ ! -z "$pid" ]; then
    echo "Killing process on port $port (PID: $pid)"
    kill -9 $pid 2>/dev/null
  fi
done

# Load env
set -a; source .env; set +a

# Create database
echo "Setting up database..."
psql -U postgres -tc "SELECT 1 FROM pg_database WHERE datname = 'ai_web_scraping_db'" | grep -q 1 || psql -U postgres -c "CREATE DATABASE ai_web_scraping_db"

# Run schema
psql -U postgres -d ai_web_scraping_db -f backend/models/schema.sql

# Seed data
cd backend && node seeds/seed.js && cd ..

# Install dependencies if needed
if [ ! -d "backend/node_modules" ]; then
  echo "Installing backend dependencies..."
  cd backend && npm install && cd ..
fi
if [ ! -d "frontend/node_modules" ]; then
  echo "Installing frontend dependencies..."
  cd frontend && npm install && cd ..
fi

# Start backend with hot reload
echo "Starting backend on port 3001..."
cd backend && npx nodemon server.js &

# Start frontend
echo "Starting frontend on port 3000..."
cd ../frontend && PORT=3000 npm start &

echo "✅ Application started!"
echo "   Frontend: http://localhost:3000"
echo "   Backend:  http://localhost:3001"
wait
