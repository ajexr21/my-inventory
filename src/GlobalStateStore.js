// =========================================================
// [CORE] 전역 상태 관리 저장소 (Single Source of Truth)
// 모든 기능이 데이터를 읽고 쓸 때 반드시 이 파일을 통해 접근해야 합니다.
// =========================================================

class GlobalStateStore {
    constructor() {
        // 초기 상태 정의
        this._state = {
            isDarkMode: false,
            accountBookData: [], // 가계부 데이터 (실시간으로 업데이트됨)
            inventoryStock: {},   // 재고 데이터
            diaryEntries: []      // 일기 기록
        };
    }

    getState() {
        // 상태를 읽는 메서드 (읽기 전용 접근 보장)
        return { ...this._state };
    }

    /**
     * 특정 데이터를 업데이트하는 유일한 진입점입니다.
     * 이 함수를 통해서만 state가 변경되어야 합니다.
     * @param {string} key - 변경할 상태의 키 (예: 'accountBookData')
     * @param {*} newValue - 새로운 값
     */
    setState(key, newValue) {
        if (!this._state.hasOwnProperty(key)) {
            console.warn(`[Store] ${key}라는 상태는 정의되지 않았습니다.`);
            return false;
        }

        // 실제 변경 로직 수행 (Immutable update 원칙 적용 권장)
        Object.assign(this._state, { [key]: newValue });

        // 💡 중요: 상태가 변경되었음을 구독자들에게 알림을 보내야 합니다.
        this.notifySubscribers();
    }

    /**
     * 상태 변화를 감지하고 반응하는 리스너를 등록합니다. (Observer Pattern)
     */
    subscribe(listener) {
        if (!this._listeners.hasOwnProperty(listener)) {
            this._listeners[listener] = [];
        }
        this._listeners[listener].push(listener);

        // 구독 해지 함수 반환
        return () => {
            this._listeners[listener] = this._listeners[listener].filter(l => l !== listener);
        };
    }

    notifySubscribers() {
        if (this._listeners) {
             for (const listener of Object.values(this._listeners)) {
                listener(); // 모든 구독자에게 상태 변경 알림
            }
        }
    }
}

// 싱글톤 패턴 구현: 애플리케이션 전체에서 하나의 인스턴스만 사용하도록 보장
export const stateStore = new GlobalStateStore();