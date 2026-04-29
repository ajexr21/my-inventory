/**
 * 우리집 스마트 허브 - 공통 설정 파일
 * (이 파일은 공개되어도 안전한 설정값만 포함합니다)
 */
const CONFIG = {
    SUPABASE_URL: 'https://wkpehbncxtgjpyceoprf.supabase.co',
    SUPABASE_ANON_KEY: 'sb_publishable_PQLTIyT7-cYnrVdT6zcD-w_hCc08EIt'
};

// 전역 변수로 노출 (기존 스크립트와의 호환성)
window.SUPABASE_URL = CONFIG.SUPABASE_URL;
window.SUPABASE_ANON_KEY = CONFIG.SUPABASE_ANON_KEY;
