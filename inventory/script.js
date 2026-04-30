/**
 * 우리집 편의점 관리 - Supabase Cloud Version (Robust)
 * 디자인 및 로직 설계: 로컬 Gemma 4
 */

// --- 1. 기본 설정 및 상태 ---
// Supabase 설정 (config.js에서 전역 변수로 로드됨)
let _supabase = null;

let items = [];
let currentCategory = '전체';
let editingId = null; // 수정 중인 품목 ID 추적

// --- 2. 테마 관리 (최우선 실행) ---
const themeToggle = document.getElementById('theme-toggle');

function initTheme() {
    const savedTheme = localStorage.getItem('hub-theme') || 'light';
    document.documentElement.setAttribute('data-theme', savedTheme);
    updateThemeIcon(savedTheme);
}

function toggleTheme() {
    const currentTheme = document.documentElement.getAttribute('data-theme');
    const newTheme = currentTheme === 'light' ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', newTheme);
    localStorage.setItem('hub-theme', newTheme);
    updateThemeIcon(newTheme);
}

function updateThemeIcon(theme) {
    if (!themeToggle) return;
    const icon = themeToggle.querySelector('i');
    if (icon) icon.className = theme === 'dark' ? 'fas fa-sun' : 'fas fa-moon';
}

if (themeToggle) themeToggle.onclick = toggleTheme;
initTheme();

// --- 3. DOM 요소 및 기본 UI 로직 ---
const itemList = document.getElementById('inventory-list');
const itemForm = document.getElementById('item-form');
const addModal = document.getElementById('item-modal');
const openModalBtn = document.getElementById('open-modal-btn');
const closeModalBtn = document.querySelector('.close-btn');
const searchToggle = document.getElementById('search-toggle');
const searchBar = document.getElementById('search-bar');
const searchInput = document.getElementById('item-search');
const tabs = document.querySelectorAll('.tab');

const confirmModal = document.getElementById('confirm-modal');
const confirmOk = document.getElementById('confirm-ok');
const confirmCancel = document.getElementById('confirm-cancel');

function showConfirm(message) {
    return new Promise((resolve) => {
        if (!confirmModal) { resolve(true); return; }
        confirmModal.querySelector('h2').innerText = message;
        confirmModal.classList.add('active');
        
        const handleOk = () => { cleanup(); resolve(true); };
        const handleCancel = () => { cleanup(); resolve(false); };
        const cleanup = () => {
            confirmModal.classList.remove('active');
            confirmOk.removeEventListener('click', handleOk);
            confirmCancel.removeEventListener('click', handleCancel);
        };
        confirmOk.addEventListener('click', handleOk);
        confirmCancel.addEventListener('click', handleCancel);
    });
}

// --- 4. Supabase 연동 로직 ---
async function initApp() {
    try {
        if (typeof supabase === 'undefined') {
            console.warn('Supabase SDK not loaded.');
            return;
        }
        if (SUPABASE_URL === 'YOUR_SUPABASE_URL' || !SUPABASE_URL) {
            console.log('Supabase credentials missing. Local test mode.');
            return;
        }
        
        _supabase = supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);
        
        // 세션 체크 추가
        const { data: { session } } = await _supabase.auth.getSession();
        if (!session) {
            window.location.href = '../login.html';
            return;
        }

        await loadItems();
        
        // 실시간 구독 설정
        _supabase
            .channel('inventory-changes')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'inventory' }, payload => {
                console.log('Realtime update received!', payload);
                loadItems(); // 변화가 생기면 즉시 목록 새로고침
            })
            .subscribe();
    } catch (e) {
        console.error('App init failed:', e);
    }
}

async function sendTelegramMessage(text) {
    if (!_supabase) return;
    try {
        const { data, error } = await _supabase.functions.invoke('send-telegram', {
            body: { text: text }
        });
        if (error) throw error;
        console.log('텔레그램 알림 성공:', data);
    } catch (e) {
        console.error('텔레그램 알림 실패 (Edge Function):', e);
    }
}

async function loadItems() {
    if (!_supabase) return;
    const { data, error } = await _supabase
        .from('inventory')
        .select('*')
        .order('id', { ascending: false });

    if (!error) {
        items = data;
        renderItems();
    }
}


window.renderItems = () => {
    if (!itemList) return;
    itemList.innerHTML = '';
    const filtered = items.filter(item => {
        let matchesCategory = false;
        if (currentCategory === '전체') {
            matchesCategory = true;
        } else if (currentCategory === '부족함') {
            matchesCategory = item.count <= item.min_count;
        } else {
            matchesCategory = item.category === currentCategory;
        }
        
        const matchesSearch = item.name.toLowerCase().includes(searchInput.value.toLowerCase());
        return matchesCategory && matchesSearch;
    });

    if (filtered.length === 0 && items.length > 0) {
        itemList.innerHTML = '<p style="text-align:center; padding:40px; color:var(--text-sub);">찾으시는 품목이 없어요.</p>';
        return;
    }

    filtered.forEach(item => {
        const isLow = item.count <= item.min_count;
        const card = document.createElement('div');
        card.className = 'item-card';
        card.innerHTML = `
            <div class="item-info">
                <h3>${item.name} ${isLow ? '<span class="shortage-badge">🚨</span>' : ''}</h3>
                <p>${item.category}</p>
            </div>
            <div class="item-controls">
                ${item.buy_url ? `
                <button class="control-btn buy-btn" onclick="window.open('${item.buy_url}', '_blank')" title="구매하러 가기">
                    <i class="fas fa-shopping-cart"></i>
                </button>` : ''}
                <button class="control-btn" onclick="changeCount('${item.id}', -1)">-</button>
                <div class="count" id="count-${item.id}">
                    ${String(item.count).split('').map(d => `<div class="digit-box"><span class="count-digit">${d}</span></div>`).join('')}
                </div>
                <button class="control-btn" onclick="changeCount('${item.id}', 1)">+</button>
                <button class="control-btn" style="background:none; color:var(--text-sub); margin-left:10px;" onclick="openEditModal('${item.id}')">
                    <i class="fas fa-cog"></i>
                </button>
            </div>
        `;
        itemList.appendChild(card);
    });
}

// 아이템 조작 (DB 연동)
window.changeCount = async (id, delta) => {
    if (!_supabase) return;
    const item = items.find(i => i.id === id);
    if (!item) return;

    const newCount = Math.max(0, item.count + delta);
    
    // 자릿수별 애니메이션 처리
    const countEl = document.getElementById(`count-${id}`);
    if (countEl) {
        const oldStr = String(item.count);
        const newStr = String(newCount);
        
        // 자릿수가 다르면 전체를 다시 그리되, 같으면 개별 자릿수만 애니메이션
        if (oldStr.length !== newStr.length) {
            countEl.innerHTML = newStr.split('').map(d => `<div class="digit-box"><span class="count-digit">${d}</span></div>`).join('');
        } else {
            const boxes = countEl.querySelectorAll('.digit-box');
            for (let i = 0; i < newStr.length; i++) {
                if (oldStr[i] !== newStr[i]) {
                    const box = boxes[i];
                    const oldDigit = box.querySelector('.count-digit');
                    const newDigit = document.createElement('span');
                    newDigit.className = 'count-digit';
                    newDigit.innerText = newStr[i];
                    
                    if (delta > 0) {
                        oldDigit.classList.add('anim-up-out');
                        newDigit.classList.add('anim-up-in');
                    } else {
                        oldDigit.classList.add('anim-down-out');
                        newDigit.classList.add('anim-down-in');
                    }
                    
                    box.appendChild(newDigit);
                    setTimeout(() => oldDigit.remove(), 300);
                }
            }
        }
    }

    const { error } = await _supabase.from('inventory').update({ count: newCount }).eq('id', id);
    
    if (!error) {
        // 물품 부족 알림 체크
        if (newCount <= item.min_count && delta < 0) {
            showNotification(item.name, newCount);
        }
        await loadItems();
    }
};

// 알림 띄우기 함수
function showNotification(name, count) {
    console.log('Notification trigger:', name, count); // 진단용 로그
    
    if (!("Notification" in window)) {
        alert("이 브라우저는 알림을 지원하지 않습니다.");
        return;
    }

    if (Notification.permission === 'granted') {
        const options = {
            body: `[${name}]의 수량이 ${count}개 남았습니다. 보충이 필요해요!`,
            icon: '../icon.png',
            badge: '../icon.png',
            vibrate: [200, 100, 200]
        };
        new Notification('🚨 물품 부족 알림', options);
    } else if (Notification.permission !== 'denied') {
        Notification.requestPermission().then(permission => {
            if (permission === 'granted') {
                showNotification(name, count);
            }
        });
    }

    // 텔레그램으로도 전송
    const telegramMsg = `<b>🚨 [물품 부족 알림]</b>\n품명: ${name}\n현재 재고: ${count}개\n보충이 시급합니다!`;
    sendTelegramMessage(telegramMsg);
}

window.deleteItem = async (id) => {
    if (!_supabase) return;
    const item = items.find(i => i.id === id);
    const confirmed = await showConfirm('정말 삭제할까요?');
    if (confirmed) {
        const { error } = await _supabase.from('inventory').delete().eq('id', id);
        if (!error) await loadItems();
    }
};

// 수정 모달 열기
window.openEditModal = (id) => {
    const item = items.find(i => i.id === id);
    if (!item) return;

    editingId = id;
    document.querySelector('#item-modal h2').innerText = '품목 수정';
    document.getElementById('item-name').value = item.name;
    document.getElementById('item-category').value = item.category;
    document.getElementById('item-buy-url').value = item.buy_url || '';
    document.getElementById('item-count').value = item.count;
    document.getElementById('item-min-count').value = item.min_count;
    document.getElementById('item-auto-period').value = item.auto_period || 0;
    
    // Gemma 4 제안: 다음 차감 예정일 안내 추가
    const periodGuide = document.querySelector('#item-auto-period + p');
    if (item.auto_period > 0) {
        const lastCheck = new Date(item.last_check_date || item.created_at);
        const nextCheck = new Date(lastCheck.getTime() + (item.auto_period * 1000 * 60 * 60 * 24));
        const diffDays = Math.ceil((nextCheck - new Date()) / (1000 * 60 * 60 * 24));
        periodGuide.innerHTML = `설정한 날짜마다 수량이 1개씩 자동 차감됩니다. <br><strong style="color:var(--primary)">👉 다음 차감까지 약 ${Math.max(0, diffDays)}일 남았습니다.</strong>`;
    } else {
        periodGuide.innerText = '설정한 날짜마다 수량이 1개씩 자동 차감됩니다. (0: 안 함)';
    }
    
    document.getElementById('delete-item-btn').style.display = 'block';
    addModal.classList.add('active');
};

if (itemForm) {
    itemForm.onsubmit = async (e) => {
        e.preventDefault();
        if (!_supabase) { alert('DB가 연결되지 않았습니다.'); return; }
        
        const itemData = {
            name: document.getElementById('item-name').value,
            category: document.getElementById('item-category').value,
            buy_url: document.getElementById('item-buy-url').value,
            count: parseInt(document.getElementById('item-count').value),
            min_count: parseInt(document.getElementById('item-min-count').value),
            auto_period: parseInt(document.getElementById('item-auto-period').value) || 0,
            last_check_date: new Date().toISOString()
        };

        let error;
        if (editingId) {
            // 수정 모드
            const result = await _supabase.from('inventory').update(itemData).eq('id', editingId);
            error = result.error;
        } else {
            // 추가 모드
            const result = await _supabase.from('inventory').insert([itemData]);
            error = result.error;
        }

        if (!error) {
            itemForm.reset();
            addModal.classList.remove('active');
            await loadItems();
        } else {
            alert('저장에 실패했습니다.');
        }
    };
}

// UI 인터랙션
if (openModalBtn) {
    openModalBtn.onclick = () => {
        editingId = null;
        document.querySelector('#item-modal h2').innerText = '새 물건 추가';
        itemForm.reset();
        document.getElementById('delete-item-btn').style.display = 'none';
        addModal.classList.add('active');
    };
}
if (closeModalBtn) closeModalBtn.onclick = () => addModal.classList.remove('active');
window.onclick = (e) => { if (e.target === addModal) addModal.classList.remove('active'); };

// 모달 내 삭제 버튼
const deleteItemBtn = document.getElementById('delete-item-btn');
if (deleteItemBtn) {
    deleteItemBtn.onclick = async () => {
        if (editingId) {
            await window.deleteItem(editingId);
            addModal.classList.remove('active');
        }
    };
}

if (searchToggle) {
    searchToggle.onclick = () => {
        searchBar.classList.toggle('active');
        if (searchBar.classList.contains('active')) searchInput.focus();
    };
}

const notificationBtn = document.getElementById('notification-btn');
if (notificationBtn) {
    notificationBtn.onclick = () => {
        if (!("Notification" in window)) {
            alert("이 브라우저는 알림을 지원하지 않습니다.");
            return;
        }
        Notification.requestPermission().then(permission => {
            if (permission === 'granted') {
                alert('알림 설정이 완료되었습니다! 매대가 비어가면 알려드릴게요. 🔔');
                // 테스트 알림
                new Notification('알림 설정 완료', { body: '이제 상품 부족 시 여기서 알림이 뜹니다.' });
            } else {
                alert('알림 권한이 거부되었습니다. 주소창 설정을 확인해 주세요.');
            }
        });
    };
}

if (searchInput) searchInput.oninput = renderItems;

tabs.forEach(tab => {
    tab.onclick = () => {
        tabs.forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        currentCategory = tab.dataset.category || '전체';
        renderItems();
    };
});

// 초기 실행
initApp();
