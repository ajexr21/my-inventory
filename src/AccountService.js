// =========================================================
// [SERVICE] 가계부 비즈니스 로직 (데이터 계산 및 API 통신)
// 이 파일은 UI와 전혀 관련이 없으며, 오직 데이터 처리만 담당합니다.
// =========================================================

import { stateStore } from './GlobalStateStore.js';
import { calculateDaysDifference, formatDate } from './Utils/DateUtils.js';

/**
 * 가계부 데이터를 가져오고 필요한 계산을 수행하는 서비스입니다.
 */
export const AccountService = {
    /**
     * 💰 API를 통해 실제 가계부 데이터를 불러오는 모의 함수 (실제로는 fetch 사용)
     * @returns {Promise<Array>} 임시 데이터 배열
     */
    async fetchAccountData() {
        console.log("[Service] Supabase로부터 가계부 데이터를 로딩합니다...");
        // --- 실제 API 호출 코드가 들어갑니다. ---
        await new Promise(resolve => setTimeout(resolve, 500)); // 네트워크 지연 모의

        return [
            { id: 1, type: 'Income', amount: 500000, date: formatDate(new Date()), description: '월급' },
            { id: 2, type: 'Expense', amount: 35000, date: formatDate(new Date()), description: '편의점 간식' }
        ];
    },

    /**
     * 불러온 원시 데이터에 기반하여 필요한 분석 값 (월별 총액 등)을 계산합니다.
     * @param {Array} rawData - API에서 받은 가계부 데이터 배열
     */
    calculateAndStore(rawData) {
        console.log("[Service] 데이터를 분석하고 전역 상태를 업데이트합니다.");

        // 1. 핵심 로직 수행: 월별 합계, 순소비 등 복잡한 계산을 여기서 처리합니다.
        const totalIncome = rawData.filter(d => d.type === 'Income').reduce((sum, d) => sum + d.amount, 0);
        const totalExpense = rawData.filter(d => d.type === 'Expense').reduce((sum, d) => sum + d.amount, 0);

        const analysisResult = {
            totalIncome: totalIncome,
            totalExpense: totalExpense,
            netBalance: totalIncome - totalExpense,
            lastUpdated: new Date()
        };

        // 2. 상태 저장소에 계산된 최종 결과만 전송합니다. (View는 이 값만 구독하면 됩니다)
        stateStore.setState('analysisResult', analysisResult); // 새로운 분석 결과를 state로 추가 가정
    }
};