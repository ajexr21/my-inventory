// =========================================================
// [COMPONENT] 재사용 가능한 UI 컴포넌트 (데이터를 시각화하는 역할)
// 이 파일은 오직 DOM 조작과 애니메이션만 담당해야 합니다.
// =========================================================

/**
 * 차트를 렌더링하고 업데이트하는 모듈입니다.
 * 데이터를 받아서 화면에 그리는 'View' 계층 역할을 수행합니다.
 */
export const ChartRenderer = {
    init(containerId) {
        this.container = document.getElementById(containerId);
        if (!this.container) {
            console.error(`[Chart] ${containerId} ID를 가진 컨테이너를 찾을 수 없습니다.`);
        }
    },

    /**
     * 차트를 그리는 핵심 로직입니다. (예: Chart.js 라이브러리 사용 등)
     * @param {object} data - 렌더링할 데이터 객체
     */
    render(data) {
        if (!this.container) return;

        console.log("[Component] 데이터를 받아 차트를 그립니다...");
        // 기존 내용을 지우고 새로운 차트 요소를 삽입하는 로직이 들어갑니다.
        this.container.innerHTML = `<h3>📈 월별 흐름 분석</h3><p>총 수입: ${data.totalIncome.toLocaleString()}원 | 총 지출: ${data.totalExpense.toLocaleString()}원</p>`;

        // 애니메이션 추가 등 복잡한 View 관련 코드는 여기에 모입니다.
    }
};