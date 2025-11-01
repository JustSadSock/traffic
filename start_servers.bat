@echo off
SETLOCAL
CD /D %~dp0
IF NOT EXIST node_modules (npm install)
start "Trafficity tunnel" cloudflared tunnel run irgri-tunnel
node server\index.js
