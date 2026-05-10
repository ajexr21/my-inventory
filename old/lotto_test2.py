import requests
import json

def get_lotto_number(round_num):
    url = f"https://www.dhlottery.co.kr/common.do?method=getLottoNumber&drwNo={round_num}"
    response = requests.get(url)
    try:
        data = response.json()
        print("Success:", json.dumps(data, ensure_ascii=False))
    except Exception as e:
        print("Failed to parse JSON")
        print("Content-Type:", response.headers.get('Content-Type'))
        print("First 200 chars:", response.text[:200])

get_lotto_number(1221)
