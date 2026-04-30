// =========================================================
// [UTILITY] Supabase 연결 및 DB 상호작용을 담당하는 클라이언트 모듈
// 실제 환경 변수(URL, ANON KEY)를 불러와 사용하도록 설계되었습니다.
// =========================================================

import { createClient } from '@supabase/supabase-js';

// 🚨 중요: 실제 프로젝트에서는 이 키들을 .env 파일에서 로드해야 합니다.
const supabaseUrl = window.SUPABASE_URL; 
const supabaseAnonKey = window.SUPABASE_ANON_KEY; 

// Supabase 클라이언트 인스턴스를 전역으로 생성합니다 (싱글톤 패턴).
export const supabase = createClient(supabaseUrl, supabaseAnonKey);

/**
 * @description 현재 로그인된 사용자의 세션을 확인합니다.
 */
export async function getSession() {
    const { data: { session }, error } = await supabase.auth.getSession();
    if (error) throw error;
    return session;
}

/**
 * @description 로그아웃을 수행합니다.
 */
export async function signOut() {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
    window.location.href = 'login.html';
}

/**
 * @description 데이터베이스의 날짜 필드를 안정적으로 처리하는 헬퍼 함수.
 * 연도 깨짐 방지 핵심 로직입니다.
 * @param {Date} date - JavaScript Date 객체
 * @returns {string} ISO 형식의 문자열 ('YYYY-MM-DD')
 */
export function formatToIsoDate(date) {
    // 날짜를 UTC 기준으로 처리하여 시간대 문제로 인한 연도/월 오차를 방지합니다.
    return date.toISOString().split('T')[0]; 
}

/**
 * @description 가계부 데이터를 DB에 저장하는 트랜잭션 로직을 추상화합니다.
 */
export async function saveAccountData(data) {
    // 실제 데이터 삽입/수정 코드가 여기에 들어갑니다. (예: upsert)
    const { data, error } = await supabase
        .from('account_book') // 가계부 테이블 이름 가정
        .insert([
            { 
                type: data.type, 
                amount: data.amount, 
                date: formatToIsoDate(new Date()), // <-- 여기서 날짜 형식을 강제합니다.
                description: data.description 
            }
        ]);

    if (error) {
        throw new Error(`Supabase DB 오류 발생: ${error.message}`);
    }
    return data;
}