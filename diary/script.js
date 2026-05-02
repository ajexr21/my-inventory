// Supabase 설정
const _supabase = supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY);

// 상태 관리
let diaries = [];
let currentFilter = 'all';
let selectedAuthor = '';
let currentViewingId = null;
let searchTerm = '';

// DOM 요소
const diaryList = document.getElementById('diary-list');
const writeModal = document.getElementById('write-modal');
const viewModal = document.getElementById('view-modal');
const authModal = document.getElementById('auth-modal');
const isPrivateToggle = document.getElementById('is-private');
const passwordArea = document.getElementById('password-area');

// 초기화
document.addEventListener('DOMContentLoaded', async () => {
    // 세션 체크 추가
    const { data: { session } } = await _supabase.auth.getSession();
    if (!session) {
        window.location.href = '../login.html';
        return;
    }

    window.initTheme();
    window.renderDiaries();
    window.fetchDiaries();
    window.initEventListeners();
});

// 전역 함수 노출 (젬마 표준)
window.initTheme = function() {
    const savedTheme = localStorage.getItem('theme') || 'dark';
    const icon = document.querySelector('#theme-toggle i');
    if (savedTheme === 'light') {
        document.documentElement.setAttribute('data-theme', 'light');
        if (icon) icon.className = 'fas fa-moon';
    } else {
        document.documentElement.removeAttribute('data-theme');
        if (icon) icon.className = 'fas fa-sun';
    }
};

window.fetchDiaries = async function() {
    try {
        const { data, error } = await _supabase
            .from('house_diaries')
            .select('*')
            .order('created_at', { ascending: false });

        if (error) throw error;
        diaries = data || [];
        window.renderDiaries();
    } catch (error) {
        console.error('데이터 로딩 오류:', error);
        window.renderDiaries();
    }
};

window.renderDiaries = function() {
    if (!diaryList) return;
    
    // 작성자 필터 + 검색어 필터 적용
    const filtered = diaries.filter(d => {
        const matchesAuthor = currentFilter === 'all' || d.author === currentFilter;
        
        let matchesSearch = !searchTerm;
        if (searchTerm) {
            const searchLower = searchTerm.toLowerCase();
            const authorMatch = d.author.toLowerCase().includes(searchLower);
            
            if (d.is_public) {
                // 공개 일기: 저자 이름 또는 내용 검색 가능
                const contentMatch = d.content.toLowerCase().includes(searchLower);
                matchesSearch = authorMatch || contentMatch;
            } else {
                // 비밀 일기: 저자 이름으로만 검색 가능 (내용 보안 유지)
                matchesSearch = authorMatch;
            }
        }
        return matchesAuthor && matchesSearch;
    });

    let html = `
        <div class="diary-card add-card" onclick="window.openModal(document.getElementById('write-modal'))">
            <div class="add-content">
                <i class="fas fa-plus-circle"></i>
                <span>오늘의 일기 쓰기</span>
            </div>
        </div>
    `;
    html += filtered.map(diary => {
        const date = new Date(diary.created_at).toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', weekday: 'short' });
        return `
            <div class="diary-card" onclick="window.handleDiaryClick('${diary.id}')">
                <div class="card-header" style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
                    <span style="background:var(--c-${window.getAuthorKey(diary.author)}); padding:4px 12px; border-radius:10px; font-size:0.75rem; font-weight:800; color:white;">
                        ${diary.author}
                    </span>
                    <span style="font-size:0.8rem; opacity:0.4;">${date}</span>
                </div>
                ${diary.is_public ? `
                    <div style="display:flex; align-items:center; gap:8px; opacity:0.6; font-size:0.9rem;">
                        <i class="fas fa-file-lines"></i>
                        <span>일기 보기</span>
                    </div>
                ` : `
                    <div style="display:flex; align-items:center; gap:8px; opacity:0.3; font-size:0.9rem;">
                        <i class="fas fa-lock"></i>
                        <span>비밀 일기</span>
                    </div>
                `}
            </div>
        `;
    }).join('');
    diaryList.innerHTML = html;
};

window.handleDiaryClick = function(id) {
    const diary = diaries.find(d => d.id === id);
    if (!diary) return;
    if (diary.is_public) { window.showDiaryDetail(diary); } 
    else { currentViewingId = id; window.openModal(authModal); }
};

window.showDiaryDetail = function(diary) {
    const date = new Date(diary.created_at).toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' });
    document.getElementById('view-author-badge').innerText = diary.author;
    document.getElementById('view-author-badge').style.background = `var(--c-${window.getAuthorKey(diary.author)})`;
    document.getElementById('view-date').innerText = date;
    document.getElementById('view-body').innerText = diary.content;
    currentViewingId = diary.id;
    window.openModal(viewModal);
};

window.saveDiary = async function() {
    const content = document.getElementById('diary-content').value;
    const isPublic = !isPrivateToggle.checked;
    const password = document.getElementById('diary-password').value;
    if (!selectedAuthor) return alert('작성자를 선택해 주세요!');
    if (!content) return alert('내용을 입력해 주세요!');
    if (!isPublic && !password) return alert('비밀번호를 입력해 주세요!');
    try {
        const { error } = await _supabase.from('house_diaries').insert([{
            author: selectedAuthor, title: '', content, is_public: isPublic, password: password || null
        }]);
        if (error) throw error;
        window.closeModal(writeModal);
        window.fetchDiaries();
    } catch (error) { alert('저장에 실패했습니다.'); }
};

window.checkPassword = function() {
    const input = document.getElementById('auth-password').value;
    const diary = diaries.find(d => d.id === currentViewingId);
    if (diary && diary.password === input) {
        window.closeModal(authModal);
        document.getElementById('auth-password').value = '';
        window.showDiaryDetail(diary);
    } else {
        alert('비밀번호가 일치하지 않습니다.');
        document.getElementById('auth-password').value = '';
    }
};

window.deleteDiary = async function() {
    const ok = await window.customConfirm('소중한 추억을 정말 삭제할까요?');
    if (!ok) return;
    
    const { error } = await _supabase.from('house_diaries').delete().eq('id', currentViewingId);
    if (!error) { 
        window.closeModal(viewModal); 
        window.fetchDiaries(); 
    }
};

// 젬마 프리미엄 커스텀 컨펌 (Promise 기반)
window.customConfirm = function(message) {
    return new Promise((resolve) => {
        const modal = document.getElementById('confirm-modal');
        const msgEl = document.getElementById('confirm-msg');
        const okBtn = document.getElementById('confirm-ok-btn');
        const cancelBtn = document.getElementById('confirm-cancel-btn');

        msgEl.innerText = message;
        window.openModal(modal);

        const handleOk = () => {
            cleanup();
            resolve(true);
        };

        const handleCancel = () => {
            cleanup();
            resolve(false);
        };

        const cleanup = () => {
            okBtn.removeEventListener('click', handleOk);
            cancelBtn.removeEventListener('click', handleCancel);
            window.closeModal(modal);
        };

        okBtn.addEventListener('click', handleOk);
        cancelBtn.addEventListener('click', handleCancel);
    });
};

window.getAuthorKey = function(author) {
    const map = { '아빠': 'dad', '엄마': 'mom', '교현': 'kh', '교빈': 'kb', '교은': 'ke' };
    return map[author] || 'dad';
};

window.openModal = function(modal) { 
    if (modal) {
        modal.classList.remove('hidden'); 
        document.body.classList.add('no-scroll');
    }
};
window.closeModal = function(modal) { 
    if (modal) {
        modal.classList.add('hidden');
        document.body.classList.remove('no-scroll');
        if (modal.id === 'write-modal') window.clearForm();
    }
};

window.clearForm = function() {
    document.getElementById('diary-content').value = '';
    const pwInput = document.getElementById('diary-password');
    if (pwInput) pwInput.value = '';
    selectedAuthor = '';
    document.querySelectorAll('.author-chip').forEach(c => c.classList.remove('selected'));
};

window.initEventListeners = function() {
    document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentFilter = btn.getAttribute('data-author');
            window.renderDiaries();
        });
    });
    document.querySelectorAll('.author-chip').forEach(chip => {
        chip.addEventListener('click', () => {
            document.querySelectorAll('.author-chip').forEach(c => c.classList.remove('selected'));
            chip.classList.add('selected');
            selectedAuthor = chip.getAttribute('data-value');
        });
    });
    document.getElementById('theme-toggle').addEventListener('click', () => {
        const isLight = document.documentElement.getAttribute('data-theme') === 'light';
        const icon = document.querySelector('#theme-toggle i');
        if (isLight) {
            document.documentElement.removeAttribute('data-theme');
            localStorage.setItem('theme', 'dark');
            if (icon) icon.className = 'fas fa-sun';
        } else {
            document.documentElement.setAttribute('data-theme', 'light');
            localStorage.setItem('theme', 'light');
            if (icon) icon.className = 'fas fa-moon';
        }
    });
    isPrivateToggle.addEventListener('change', () => passwordArea.classList.toggle('hidden', !isPrivateToggle.checked));
    document.getElementById('save-diary-btn').addEventListener('click', window.saveDiary);
    document.getElementById('confirm-auth-btn').addEventListener('click', window.checkPassword);
    document.getElementById('delete-diary-btn').addEventListener('click', window.deleteDiary);
    document.getElementById('cancel-write-btn').addEventListener('click', () => window.closeModal(writeModal));

    // 검색 관련 이벤트
    const searchToggle = document.getElementById('search-toggle');
    const searchBar = document.getElementById('search-bar');
    const searchInput = document.getElementById('diary-search');

    if (searchToggle) {
        searchToggle.addEventListener('click', () => {
            const isVisible = searchBar.style.display === 'block';
            searchBar.style.display = isVisible ? 'none' : 'block';
            if (!isVisible) searchInput.focus();
        });
    }

    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            searchTerm = e.target.value;
            window.renderDiaries();
        });
    }

    // 모달 바깥 영역 클릭 시 닫기 (일기 쓰기 모달은 제외)
    window.addEventListener('click', (e) => {
        if (e.target.classList.contains('modal') && e.target.id !== 'write-modal') {
            window.closeModal(e.target);
        }
    });

    const closeViewBtn = document.querySelector('.close-view');
    if (closeViewBtn) closeViewBtn.addEventListener('click', () => window.closeModal(viewModal));
};
