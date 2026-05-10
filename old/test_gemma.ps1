# 터미널 코드페이지 UTF-8로 변경
chcp 65001 > $null
$OutputEncoding = [System.Text.Encoding]::UTF8
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

# 설정 파일 로드
$configPath = Join-Path $PSScriptRoot "antigravity.config.json"
if (-not (Test-Path $configPath)) {
    Write-Error "설정 파일을 찾을 수 없습니다: $configPath"
    exit 1
}

$config = Get-Content $configPath -Raw | ConvertFrom-Json
$localModel = $config.models.local

Write-Output "=================================================="
Write-Output "[설정 로드 확인]"
Write-Output "- 모델명: $($localModel.model)"
Write-Output "- Context Window: $($localModel.contextWindow) (대용량 설정)"
Write-Output "- Temperature: $($localModel.temperature)"
Write-Output "=================================================="

$body = @{
    model = $localModel.model
    messages = @(
        @{ role = "user"; content = "반가워! 설정이 잘 적용되었는지 확인 중이야. 한국어로 응답해줘." }
    )
    options = @{
        temperature = [double]$localModel.temperature
        num_predict = [int]$localModel.maxTokens
        num_ctx = [int]$localModel.contextWindow
    }
} | ConvertTo-Json -Depth 5

Write-Output "--- Ollama 서버에 요청을 보냅니다 (Context Window가 커서 시간이 걸릴 수 있습니다) ---"

try {
    $response = Invoke-RestMethod -Uri "http://localhost:11434/v1/chat/completions" -Method Post -Body ([System.Text.Encoding]::UTF8.GetBytes($body)) -ContentType "application/json" -TimeoutSec 120
    Write-Output "`n--- Gemma의 응답 ---"
    Write-Output $response.choices[0].message.content
    Write-Output "--------------------"
    Write-Output "결과: 성공"
} catch {
    Write-Output "`n[오류 발생]"
    Write-Output "이유: $($_.Exception.Message)"
    if ($_.Exception.Response) {
        $errorDetails = (New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())).ReadToEnd()
        Write-Output "상세 내용: $errorDetails"
    }
    Write-Output "`n팁: Context Window(65536)가 너무 커서 메모리가 부족할 수 있습니다. 실패할 경우 설정을 16384 정도로 낮추어 테스트해 보세요."
}



