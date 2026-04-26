const SUPABASE_URL = 'https://wkpehbncxtgjpyceoprf.supabase.co';
const SUPABASE_KEY = 'sb_publishable_PQLTIyT7-cYnrVdT6zcD-w_hCc08EIt';
let _supabase = null;

let transactions = [];
let editingId = null;
let viewDate = new Date(); // 현재 보고 있는 달

// --- 1. 테마 관리 ---
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

async function initApp() {
    initTheme();
    try {
        _supabase = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
        
        // 오늘 날짜 기본 설정
        document.getElementById('tr-date').valueAsDate = new Date();
        
        await loadTransactions();
        
        // 실시간 구독
        _supabase
            .channel('account-changes')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'account_book' }, () => {
                loadTransactions();
            })
            .subscribe();
    } catch (e) {
        console.error('Init failed:', e);
    }

    // 칩 선택 이벤트 등록
    document.querySelectorAll('.chip').forEach(chip => {
        chip.onclick = () => {
            document.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
            chip.classList.add('active');
        };
    });

    // 검색 토글 로직
    const searchToggle = document.getElementById('search-toggle');
    const searchBar = document.getElementById('search-bar');
    const searchInput = document.getElementById('tr-search');

    if (searchToggle) {
        searchToggle.onclick = () => {
            searchBar.classList.toggle('active');
            if (searchBar.classList.contains('active')) searchInput.focus();
        };
    }

    if (searchInput) {
        searchInput.oninput = () => renderTransactions();
    }

    // 수입/지출 타입 변경 시 카테고리 업데이트
    const typeRadios = document.querySelectorAll('input[name="type"]');
    typeRadios.forEach(radio => {
        radio.onchange = () => updateCategories();
    });

    // 금액 입력 시 쉼표 표시
    const amountInput = document.getElementById('tr-amount');
    if (amountInput) {
        amountInput.oninput = (e) => {
            let value = e.target.value.replace(/[^0-9]/g, '');
            if (value) {
                e.target.value = parseInt(value).toLocaleString();
            } else {
                e.target.value = '';
            }
        };
    }

    // 월 네비게이션 설정
    document.getElementById('prev-month').onclick = () => changeMonth(-1);
    document.getElementById('next-month').onclick = () => changeMonth(1);
    
    const monthDisplay = document.getElementById('month-display');
    if (monthDisplay) monthDisplay.onclick = openMonthPicker;

    // 월 선택 모달 내 이벤트
    document.getElementById('prev-year').onclick = () => changePickerYear(-1);
    document.getElementById('next-year').onclick = () => changePickerYear(1);
    document.querySelector('.close-month-btn').onclick = () => document.getElementById('month-modal').classList.remove('active');
}

let pickerYear = new Date().getFullYear();

function openMonthPicker() {
    pickerYear = viewDate.getFullYear();
    updateMonthPickerUI();
    document.getElementById('month-modal').classList.add('active');
}

function changePickerYear(delta) {
    pickerYear += delta;
    updateMonthPickerUI();
}

function updateMonthPickerUI() {
    document.getElementById('picker-year').innerText = pickerYear;
    const grid = document.getElementById('month-grid');
    grid.innerHTML = '';

    for (let m = 0; m < 12; m++) {
        const btn = document.createElement('button');
        btn.className = 'month-btn';
        if (pickerYear === viewDate.getFullYear() && m === viewDate.getMonth()) {
            btn.classList.add('active');
        }
        btn.innerText = `${m + 1}월`;
        btn.onclick = () => {
            viewDate = new Date(pickerYear, m, 1);
            document.getElementById('month-modal').classList.remove('active');
            loadTransactions();
        };
        grid.appendChild(btn);
    }
}

function changeMonth(delta) {
    viewDate.setMonth(viewDate.getMonth() + delta);
    loadTransactions();
}

const CATEGORIES = {
    expense: ['식비', '교통', '생활', '쇼핑', '저축/예금', '기타'],
    income: ['급여', '상여', '용돈', '예금이자', '금융수익', '기타']
};

function updateCategories(selectedCategory = null) {
    const type = document.querySelector('input[name="type"]:checked').value;
    const catSelect = document.getElementById('tr-category');
    if (!catSelect) return;

    catSelect.innerHTML = '';
    const emojiMap = {
        '식비': '🍔', '교통': '🚗', '생활': '🏠', '쇼핑': '🛍️', '저축/예금': '🏦', '기타': '🎁',
        '급여': '💵', '상여': '💰', '용돈': '👛', '예금이자': '📈', '금융수익': '📊'
    };

    CATEGORIES[type].forEach(cat => {
        const option = document.createElement('option');
        option.value = cat;
        option.innerText = `${emojiMap[cat] || '✨'} ${cat}`;
        if (cat === selectedCategory) option.selected = true;
        catSelect.appendChild(option);
    });
}

async function loadTransactions() {
    if (!_supabase) return;
    
    // 현재 월 표시
    document.getElementById('current-month').innerText = `${viewDate.getFullYear()}년 ${viewDate.getMonth() + 1}월`;
    
    // 이번 달 범위 계산
    const startOfMonth = new Date(viewDate.getFullYear(), viewDate.getMonth(), 1).toISOString();
    const endOfMonth = new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 0, 23, 59, 59).toISOString();

    // 1. 이번 달 내역 조회
    const { data: monthData, error: monthError } = await _supabase
        .from('account_book')
        .select('*')
        .gte('date', startOfMonth)
        .lte('date', endOfMonth)
        .order('date', { ascending: false });

    // 2. 이월 금액 계산 (이번 달 시작 전까지의 모든 합계)
    const { data: prevData, error: prevError } = await _supabase
        .from('account_book')
        .select('type, amount, category')
        .lt('date', startOfMonth);

    // 3. 총 누적 저축액 계산 (전체 기간의 '저축/예금' 카테고리 합계)
    const { data: allSavingsData, error: savingsError } = await _supabase
        .from('account_book')
        .select('amount')
        .eq('category', '저축/예금');

    if (!monthError && !prevError && !savingsError) {
        transactions = monthData;
        
        let prevBalance = 0;
        prevData.forEach(d => {
            if (d.type === 'income') prevBalance += d.amount;
            else prevBalance -= d.amount;
        });

        let totalAccumulatedSavings = 0;
        allSavingsData.forEach(d => {
            totalAccumulatedSavings += d.amount;
        });

        renderTransactions();
        updateSummary(prevBalance, totalAccumulatedSavings);
    } else {
        console.error('Load error:', monthError || prevError || savingsError);
        document.getElementById('transaction-list').innerHTML = '<div class="loading">데이터를 불러올 수 없습니다.</div>';
    }
}

let prevValues = { prev: 0, income: 0, expense: 0, total: 0, monthSavings: 0, totalSavings: 0 };

function animateCount(elementId, start, end) {
    const obj = document.getElementById(elementId);
    if (!obj) return;
    
    const duration = 600; // 애니메이션 지속 시간 (ms)
    const startTime = performance.now();
    
    function update(currentTime) {
        const elapsed = currentTime - startTime;
        const progress = Math.min(elapsed / duration, 1);
        
        // EaseOutExpo 효과 적용 (끝에서 부드럽게 감속)
        const easeProgress = 1 - Math.pow(2, -10 * progress);
        const current = Math.floor(start + (end - start) * easeProgress);
        
        obj.innerText = `${current.toLocaleString()}원`;
        
        if (progress < 1) {
            requestAnimationFrame(update);
        } else {
            obj.innerText = `${end.toLocaleString()}원`;
        }
    }
    
    requestAnimationFrame(update);
}

function updateSummary(prevBalance = 0, totalAccumulatedSavings = 0) {
    let income = 0;
    let monthSavings = 0;
    let consumption = 0;
    
    transactions.forEach(t => {
        if (t.type === 'income') {
            income += t.amount;
        } else {
            if (t.category === '저축/예금') {
                monthSavings += t.amount;
            } else {
                consumption += t.amount;
            }
        }
    });

    // 최종 잔액 계산: (이월 + 수입) - (저축 + 소비)
    const totalBalance = prevBalance + income - (monthSavings + consumption);

    // 애니메이션 실행
    animateCount('prev-balance', prevValues.prev, prevBalance);
    animateCount('total-income', prevValues.income, income);
    animateCount('month-savings', prevValues.monthSavings, monthSavings);
    animateCount('total-expense', prevValues.expense, consumption);
    animateCount('total-balance', prevValues.total, totalBalance);
    animateCount('total-accumulated-savings', prevValues.totalSavings, totalAccumulatedSavings);

    // 현재 값을 저장
    prevValues = {
        prev: prevBalance,
        income: income,
        monthSavings: monthSavings,
        expense: consumption,
        total: totalBalance,
        totalSavings: totalAccumulatedSavings
    };
}

function renderTransactions() {
    const list = document.getElementById('transaction-list');
    if (!list) return;
    
    const searchTerm = document.getElementById('tr-search')?.value.toLowerCase() || '';
    
    // 검색 필터링 적용
    const filtered = transactions.filter(t => {
        const desc = t.description.toLowerCase();
        const user = (t.user_name || '').toLowerCase();
        const cat = (t.category || '').toLowerCase();
        return desc.includes(searchTerm) || user.includes(searchTerm) || cat.includes(searchTerm);
    });

    if (filtered.length === 0) {
        list.innerHTML = transactions.length === 0 
            ? '<div class="loading">이번 달 내역이 없습니다.</div>'
            : '<div class="loading">찾으시는 내역이 없어요. 🔍</div>';
        return;
    }

    list.innerHTML = '';
    filtered.forEach(t => {
        const item = document.createElement('div');
        item.className = 'transaction-item';
        item.onclick = () => openEditModal(t);
        
        const date = new Date(t.date).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' });
        const userName = t.user_name ? `<small style="color:var(--primary); font-weight:bold;">${t.user_name}</small> ` : '';
        
        item.innerHTML = `
            <div class="tr-info">
                <h3>${userName}${t.description}</h3>
                <p>${date} • ${t.category}</p>
            </div>
            <div class="tr-amount ${t.type === 'income' ? 'plus' : 'minus'}">
                ${t.type === 'income' ? '+' : '-'}${t.amount.toLocaleString()}원
            </div>
        `;
        list.appendChild(item);
    });
}

// --- 3. 모달 및 CRUD ---
const modal = document.getElementById('transaction-modal');
const form = document.getElementById('transaction-form');

document.getElementById('open-modal-btn').onclick = () => {
    editingId = null;
    document.getElementById('modal-title').innerText = '새 내역 추가';
    form.reset();
    document.getElementById('type-expense').checked = true;
    updateCategories(); // 카테고리 초기화
    document.getElementById('tr-date').valueAsDate = new Date();
    document.getElementById('delete-btn').style.display = 'none';
    modal.classList.add('active');
};

document.querySelector('.close-btn').onclick = () => modal.classList.remove('active');

window.openEditModal = (t) => {
    editingId = t.id;
    document.getElementById('modal-title').innerText = '내역 수정';
    document.getElementById(t.type === 'income' ? 'type-income' : 'type-expense').checked = true;
    
    updateCategories(t.category); // 카테고리 업데이트 및 선택

    // 가족 칩 선택 복구
    document.querySelectorAll('.chip').forEach(c => {
        c.classList.toggle('active', c.dataset.name === t.user_name);
    });

    document.getElementById('tr-date').value = t.date;
    document.getElementById('tr-description').value = t.description;
    document.getElementById('tr-amount').value = t.amount.toLocaleString();
    modal.classList.add('active');
    document.getElementById('delete-btn').style.display = 'block';
};

form.onsubmit = async (e) => {
    e.preventDefault();
    if (!_supabase) return;

    const formData = {
        type: form.querySelector('input[name="type"]:checked').value,
        user_name: document.querySelector('.chip.active').dataset.name,
        date: document.getElementById('tr-date').value,
        description: document.getElementById('tr-description').value,
        amount: parseInt(document.getElementById('tr-amount').value.replace(/[^0-9]/g, '')),
        category: document.getElementById('tr-category').value
    };

    let error;
    if (editingId) {
        const result = await _supabase.from('account_book').update(formData).eq('id', editingId);
        error = result.error;
    } else {
        const result = await _supabase.from('account_book').insert([formData]);
        error = result.error;
    }

    if (!error) {
        modal.classList.remove('active');
        loadTransactions();
    } else {
        alert('저장에 실패했습니다.');
    }
};

// --- 4. 삭제 로직 ---
const confirmModal = document.getElementById('confirm-modal');
document.getElementById('delete-btn').onclick = () => {
    confirmModal.classList.add('active');
};

document.getElementById('confirm-cancel').onclick = () => confirmModal.classList.remove('active');

document.getElementById('confirm-ok').onclick = async () => {
    if (!editingId || !_supabase) return;
    
    const { error } = await _supabase.from('account_book').delete().eq('id', editingId);
    if (!error) {
        confirmModal.classList.remove('active');
        modal.classList.remove('active');
        loadTransactions();
    } else {
        alert('삭제 실패');
    }
};

// 외부 클릭 시 모달 닫기
window.onclick = (e) => {
    if (e.target === modal) modal.classList.remove('active');
    if (e.target === confirmModal) confirmModal.classList.remove('active');
};

initApp();
