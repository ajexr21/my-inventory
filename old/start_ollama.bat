@echo off
chcp 65001 > nul
title Ollama Server Starter

echo [설정 로드] antigravity.config.json 파일을 분석 중...

:: PowerShell을 사용하여 JSON 값 추출
for /f "delims=" %%a in ('powershell -Command "$c = Get-Content 'antigravity.config.json' -Raw | ConvertFrom-Json; $c.models.local.contextWindow"') do set CTX_WINDOW=%%a
for /f "delims=" %%a in ('powershell -Command "$c = Get-Content 'antigravity.config.json' -Raw | ConvertFrom-Json; $c.models.local.temperature"') do set TEMP=%%a

echo --------------------------------------------------
echo [적용 예정 모델 설정]
echo - Context Window: %CTX_WINDOW%
echo - Temperature: %TEMP%
echo (위 설정은 쿼리 시 gemma_query.ps1을 통해 전달됩니다)
echo --------------------------------------------------

:: Ollama 환경 변수 설정
set OLLAMA_HOST=0.0.0.0:11434
set OLLAMA_ORIGINS=*
:: 컨텍스트 윈도우가 크면 병렬 처리 수를 조정하는 것이 좋습니다 (선택 사항)
set OLLAMA_NUM_PARALLEL=1

echo [알림] Ollama 서버를 호스트(0.0.0.0:11434)로 실행합니다...
ollama serve
pause