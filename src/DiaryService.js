// =========================================================
// [SERVICE] 일기 비즈니스 로직 (데이터 계산 및 API 통신)
// 이 파일은 UI와 전혀 관련이 없으며, 오직 데이터 처리만 담당합니다.
// =========================================================

import { stateStore } from './GlobalStateStore.js';
import { formatDate } from './Utils/DateUtils.js';

/**
 * 일기 기록 데이터를 관리하고 분석하는 서비스입니다.
 */
export const DiaryService = {
    /**
     * API를 통해 모든 일기 기록을 불러오는 모의 함수 (실제로는 날짜 필터링이 중요)
     */
    async fetchAllDiaryEntries() {
        console.log("[Service] Supabase로부터 일기 데이터를 로딩합니다...");
        await new Promise(resolve => setTimeout(resolve, 400));

        // 임시 데이터 (3개 기록 모의)
        return [
            { id: 1, date: formatDate(new Date()), title: '오늘 하루', content: '프로젝트 아키텍처를 완성한 날. 성취감이 크다.', mood: '😃' },
            { id: 2, date: formatDate(new Date('2024-06-15')), title: '주말 회상', content: '가족들과 즐거운 시간을 보냈다. 재충전이 필요했다.', mood: '😌' }
        ];
    },

    /**
     * 사용자가 새로운 일기를 작성하여 저장하는 로직입니다. (핵심 기능)
     * @param {string} title - 제목
     * @param {string} content - 본문 내용
     * @param {string} mood - 감정 상태 이모지/태그
     */
    addEntry(title, content, mood) {
        console.log(`[Service] 새로운 일기 기록을 저장합니다: "${title}"`);

        const newEntry = {
            id: Date.now(),
            date: formatDate(new Date()), // 현재 날짜로 자동 설정
            title: title,
            content: content,
            mood: mood
        };

        // 1. 전역 상태의 원시 데이터를 직접 변경하고 알립니다.
        const currentData = stateStore.getState().diaryEntries || [];
        currentData.push(newEntry);
        stateStore.setState('diaryEntries', [...currentData]);

        console.log(`[Service] 일기 기록이 성공적으로 저장되어 전역 상태가 업데이트되었습니다.`);
    },

    /**
     * (추가 예정) 특정 키워드를 포함하는 일기 검색 및 분석 로직이 여기에 들어갑니다.
     */
};