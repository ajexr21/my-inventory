// =========================================================
// [UTILS] 공통 유틸리티 함수 모음 (재사용성 확보)
// 날짜 처리, 포맷팅 등 순수한 계산 로직만 담당합니다.
// =========================================================

/**
 * 주어진 Date 객체를 'YYYY년 MM월 DD일' 형식으로 포맷합니다.
 * @param {Date} date - 변환할 날짜 객체
 * @returns {string} 포맷된 문자열
 */
export function formatDate(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}년 ${month}월 ${day}일`;
}

/**
 * 두 날짜 사이의 일수 차이를 계산합니다.
 * @param {Date} startDate - 시작 날짜
 * @param {Date} endDate - 종료 날짜
 * @returns {number} 일수 차이
 */
export function calculateDaysDifference(startDate, endDate) {
    const diffTime = Math.abs(endDate - startDate);
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
}

// 추가적으로 계산기, 문자열 처리 등 모든 공통 함수가 여기에 들어갑니다.