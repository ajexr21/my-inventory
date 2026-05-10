import requests

def get_lotto_number(drwNo):
    url = f"https://www.dhlottery.co.kr/common.do?method=getLottoNumber&drwNo={drwNo}"
    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
    }
    response = requests.get(url, headers=headers)
    print("Content-Type:", response.headers.get('Content-Type'))
    return response.text

print(get_lotto_number(1221))
