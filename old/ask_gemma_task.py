import requests
import json

def ask_gemma(prompt):
    url = "http://localhost:11434/v1/chat/completions"
    headers = {"Content-Type": "application/json"}
    data = {
        "model": "gemma4:e4b",
        "messages": [
            {"role": "system", "content": "너는 최상위 웹 프로그래머 젬마야. 사용자의 요청에 따라 정확한 자바스크립트 코드를 작성해줘."},
            {"role": "user", "content": prompt}
        ],
        "temperature": 0.2
    }
    response = requests.post(url, headers=headers, data=json.dumps(data))
    return response.json()['choices'][0]['message']['content']

prompt = """
현재 '우리집 일기장' 앱에서 일기 카드를 클릭해도 상세보기 모달이 뜨지 않습니다. 
이유는 script.js의 함수들이 전역(window)에 노출되지 않았기 때문으로 보입니다.

아래 요구사항에 맞춰 script.js 코드를 수정해줘:
1. handleDiaryClick, showViewModal, showAuthModal 함수를 window 객체에 할당하여 HTML의 onclick에서 호출 가능하게 할 것.
2. closeModal과 openModal 함수도 window 객체에 할당할 것.
3. 코드는 완성된 자바스크립트 블록으로 제공해줘.
"""

result = ask_gemma(prompt)
with open("gemma_result.txt", "w", encoding="utf-8") as f:
    f.write(result)
print("Gemma has responded. Check gemma_result.txt")
