@echo off
chcp 65001 > nul
title Ollama Server Stopper
echo [알림] 실행 중인 Ollama 프로세스를 종료합니다...

:: ollama.exe 프로세스 종료
taskkill /f /im ollama.exe /t

echo.
echo [완료] 모든 Ollama 프로세스가 종료되었습니다.
pause