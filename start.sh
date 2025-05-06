#!/bin/bash
# Start both frontend and backend

echo "Starting backend..."
cd talking_avatar_backend
yarn start &
cd ..

echo "Starting frontend..."
cd talking_avatar_frontend
yarn start &


echo "Application started."
wait
