# 젬마 로또 동기화 팀 - 고성능 신호 수신기 (헤더 포함)
$round = 1221
$url = "https://www.dhlottery.co.kr/common.do?method=getLottoNumber&drwNo=$round"

# 브라우저인 척하기 위한 헤더 설정
$headers = @{
    "User-Agent" = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    "Referer" = "https://www.dhlottery.co.kr/"
    "X-Requested-With" = "XMLHttpRequest"
}

try {
    $response = Invoke-WebRequest -Uri $url -Headers $headers -Method Get -UseBasicParsing
    $json = $response.Content | ConvertFrom-Json
    
    if ($json.returnValue -eq "success") {
        $jsonPath = Join-Path $PSScriptRoot "latest_lotto.json"
        $json | ConvertTo-Json | Out-File -FilePath $jsonPath -Encoding utf8
        Write-Host "------------------------------------------" -ForegroundColor Cyan
        Write-Host "  성공! 젬마가 1221회차 신호를 포착했습니다.  " -ForegroundColor Green
        Write-Host "  번호: $($json.drwtNo1), $($json.drwtNo2), $($json.drwtNo3), $($json.drwtNo4), $($json.drwtNo5), $($json.drwtNo6) + $($json.bnusNo)" -ForegroundColor White
        Write-Host "------------------------------------------" -ForegroundColor Cyan
    } else {
        Write-Host "공식 API 응답 오류: $($json.returnValue)" -ForegroundColor Red
    }
} catch {
    Write-Host "수신 오류: $($_.Exception.Message)" -ForegroundColor Red
}
