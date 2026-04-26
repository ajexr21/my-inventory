/**
 * 우리집 재고 관리 - Supabase Cloud Version (Robust)
 * 디자인 및 로직 설계: 로컬 Gemma 4
 */

// --- 1. 기본 설정 및 상태 ---
const SUPABASE_URL = 'https://wkpehbncxtgjpyceoprf.supabase.co';
const SUPABASE_KEY = 'sb_publishable_PQLTIyT7-cYnrVdT6zcD-w_hCc08EIt';
let _supabase = null;

let items = [];
let currentCategory = '전체';

// --- 2. 테마 관리 (최우선 실행) ---
const themeToggle = document.getElementById('theme-toggle');

function initTheme() {
    const savedTheme = localStorage.getItem('theme') || 'light';
    document.documentElement.setAttribute('data-theme', savedTheme);
    updateThemeIcon(savedTheme);
}

function toggleTheme() {
    const currentTheme = document.documentElement.getAttribute('data-theme');
    const newTheme = currentTheme === 'light' ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', newTheme);
    localStorage.setItem('theme', newTheme);
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
        
        _supabase = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
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

function renderItems() {
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
                <h3>${item.name}</h3>
                <p>${item.category} ${isLow ? '• <span style="color:var(--primary)">부족함!</span>' : ''}</p>
                <small>기준: ${item.min_count}개 이하</small>
            </div>
            <div class="item-controls">
                ${item.buy_url ? `
                <button class="control-btn buy-btn" onclick="window.open('${item.buy_url}', '_blank')" title="구매하러 가기">
                    <i class="fas fa-shopping-cart"></i>
                </button>` : ''}
                <button class="control-btn" onclick="changeCount('${item.id}', -1)">-</button>
                <span class="count">${item.count}</span>
                <button class="control-btn" onclick="changeCount('${item.id}', 1)">+</button>
                <button class="control-btn" style="background:none; color:var(--text-sub); margin-left:10px;" onclick="deleteItem('${item.id}')">
                    <i class="fas fa-trash"></i>
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
    const { error } = await _supabase.from('inventory').update({ count: newCount }).eq('id', id);
    
    if (!error) {
        // 재고 부족 알림 체크
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
            body: `[${name}]의 재고가 ${count}개 남았습니다. 보충이 필요해요!`,
            icon: 'icon.png',
            badge: 'icon.png',
            vibrate: [200, 100, 200]
        };
        new Notification('🚨 재고 부족 알림', options);
    } else if (Notification.permission !== 'denied') {
        Notification.requestPermission().then(permission => {
            if (permission === 'granted') {
                showNotification(name, count);
            }
        });
    }
}

window.deleteItem = async (id) => {
    if (!_supabase) return;
    const confirmed = await showConfirm('정말 삭제할까요?');
    if (confirmed) {
        const { error } = await _supabase.from('inventory').delete().eq('id', id);
        if (!error) await loadItems();
    }
};

if (itemForm) {
    itemForm.onsubmit = async (e) => {
        e.preventDefault();
        if (!_supabase) { alert('DB가 연결되지 않았습니다.'); return; }
        
        const newItem = {
            name: document.getElementById('item-name').value,
            category: document.getElementById('item-category').value,
            buy_url: document.getElementById('item-buy-url').value,
            count: parseInt(document.getElementById('item-count').value),
            min_count: parseInt(document.getElementById('item-min-count').value)
        };

        const { error } = await _supabase.from('inventory').insert([newItem]);
        if (!error) {
            itemForm.reset();
            addModal.classList.remove('active');
            await loadItems();
        }
    };
}

// UI 인터랙션
if (openModalBtn) openModalBtn.onclick = () => addModal.classList.add('active');
if (closeModalBtn) closeModalBtn.onclick = () => addModal.classList.remove('active');
window.onclick = (e) => { if (e.target === addModal) addModal.classList.remove('active'); };

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
                alert('알림 설정이 완료되었습니다! 재고가 부족하면 알려드릴게요. 🔔');
                // 테스트 알림
                new Notification('알림 설정 완료', { body: '이제 재고 부족 시 여기서 알림이 뜹니다.' });
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
