import requests

try:
    lotto_main_page = requests.get("https://dhlottery.co.kr/common.do?method=main").text
    latest_draw = int(lotto_main_page.split('<strong id="lottoDrwNo">')[1].split('</strong>')[0])
    print(f"Latest Draw: {latest_draw}")
except Exception as e:
    print(f"Error: {e}")
