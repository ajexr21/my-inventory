import urllib.request
import re

url = "https://m.dhlottery.co.kr/gameResult.do?method=win720"
req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
try:
    html = urllib.request.urlopen(req).read().decode('utf-8')
    print("Fetched HTML length:", len(html))
    
    # Try to find the round number
    round_match = re.search(r'<strong>(\d+)</strong>회', html)
    if round_match:
        print("Round:", round_match.group(1))
        
    # Try to find the win numbers
    win_nums = re.findall(r'<span class="num num\d+">(\d+)</span>', html)
    print("Found numbers:", win_nums)
    
except Exception as e:
    print("Error:", e)
