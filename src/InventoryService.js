// =========================================================
// [SERVICE] 재고 관리 비즈니스 로직 (데이터 계산 및 API 통신)
// =========================================================

import { stateStore } from './GlobalStateStore.js';

/**
 * 재고 데이터를 불러오고 경고 상태를 계산하는 서비스입니다.
 */
export const InventoryService = {
    async fetchInventoryData() {
        console.log("[Service] 창고(재고) 데이터를 로딩합니다...");
        // --- 실제 API 호출 코드가 들어갑니다. ---
        await new Promise(resolve => setTimeout(resolve, 300));

        const rawData = [
            { name: '생수', currentStock: 15, minThreshold: 20 }, // 부족 상태 모의
            { name: '샴푸', currentStock: 78, minThreshold: 10 }
        ];

        // 부족 여부 로직을 여기서 처리합니다. (데이터와 비즈니스 규칙 분리)
        const calculatedInventory = rawData.map(item => ({
            ...item,
            isLow: item.currentStock < item.minThreshold // 계산된 상태 값 추가
        }));

        // 전역 상태에 저장
        stateStore.setState('inventoryStock', calculatedInventory);
    }
};