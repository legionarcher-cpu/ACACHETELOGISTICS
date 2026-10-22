@echo off
rem Divide sql\00 y sql\01 en partes chicas (sql\partes) para el SQL Editor de Supabase
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0dividir_sql.ps1"
pause
