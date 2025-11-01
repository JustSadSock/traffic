@echo off
SETLOCAL
CD /D %~dp0
IF NOT EXIST node_modules (npm install)
node server\index.js
