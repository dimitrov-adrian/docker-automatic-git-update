#!/bin/sh

if [ ! -f "/root/.ssh/id_rsa" ]; then
  echo "Generating ssh key..."
  ssh-keygen -b 2048 -t rsa -f /root/.ssh/id_rsa -q -N ""
  echo '--------------'
  cat /root/.ssh/id_rsa.pub
  echo '--------------'
fi

node /manager.js &

if [ ! -d "/app" ] || [ ! "$(ls -A /app)" ]; then

  echo "Fetching code..."
    git clone --depth 1 --recurse-submodules "$1" /app
  cd /app

  echo "Installing dependencies..."
  npm install --production

  echo "Starting app..."

  if [ -f "/app/.env" ]; then
    . /app/.env
  fi

  if [ -f "/app/.dagu" ]; then
    . /app/.dagu
  fi

  npm start --production
fi

if [ "$1" = "" ]; then
  echo "No codebase."
  exit 1
fi
