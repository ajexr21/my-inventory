param (
    [string]$Prompt
)
$OutputEncoding = [System.Text.Encoding]::UTF8
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

# 설정 파일 로드
$configPath = Join-Path $PSScriptRoot "antigravity.config.json"
$config = Get-Content $configPath -Raw | ConvertFrom-Json
$localModel = $config.models.local

$body = @{
    model = $localModel.model
    messages = @(@{ role = "user"; content = $Prompt })
    keep_alive = -1
    options = @{
        temperature = $localModel.temperature
        num_predict = $localModel.maxTokens
        num_ctx = $localModel.contextWindow
    }
} | ConvertTo-Json -Depth 5

try {
    $response = Invoke-RestMethod -Uri "http://localhost:11434/v1/chat/completions" -Method Post -Body ([System.Text.Encoding]::UTF8.GetBytes($body)) -ContentType "application/json"
    Write-Output $response.choices[0].message.content
} catch {
    Write-Error "Error: $_"
}

