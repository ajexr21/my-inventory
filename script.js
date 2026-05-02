// Supabase 설정 (config.js에서 전역 변수로 로드됨)
let _supabase = null;

let transactions = [];
let editingId = null;
let viewDate = new Date(); // 현재 보고 있는 달
let currentPrevBalance = 0;
let currentTotalSavings = 0;

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
        _supabase = supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);
        
        // 세션 체크 추가
        const { data: { session } } = await _supabase.auth.getSession();
        if (!session) {
            window.location.href = '../login.html';
            return;
        }

        // 오늘 날짜 및 시간 기본 설정 (로컬 기준)
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        document.getElementById('tr-date').value = `${year}-${month}-${day}`;
        
        const hours = String(now.getHours()).padStart(2, '0');
        const minutes = String(now.getMinutes()).padStart(2, '0');
        document.getElementById('tr-time').value = `${hours}:${minutes}`;
        
        await loadTransactions();
        
        // 실시간 구독 (다른 기기에서 변경 시 즉시 반영)
        _supabase
            .channel('account-changes')
            .on('postgres_changes', { 
                event: '*', 
                schema: 'public', 
                table: 'account_book' 
            }, (payload) => {
                console.log('실시간 변경 감지됨:', payload);
                loadTransactions();
            })
            .subscribe((status) => {
                console.log('실시간 구독 상태:', status);
            });
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
        radio.onchange = () => updateCategoriesAndMethods();
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

const METHODS = {
    expense: ['신용카드', '체크카드', '지역화폐', '현금', '기타'],
    income: ['현금', '수표', '지역화폐', '상품권', '기타']
};

function updateCategoriesAndMethods(selectedCategory = null, selectedMethod = null) {
    const type = document.querySelector('input[name="type"]:checked').value;
    const catSelect = document.getElementById('tr-category');
    const methodSelector = document.getElementById('method-selector');
    const methodLabel = document.getElementById('method-label');
    
    if (!catSelect || !methodSelector) return;

    // 카테고리 업데이트
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

    // 방식 업데이트 (칩 스타일)
    methodSelector.innerHTML = '';
    methodLabel.innerText = type === 'income' ? '수입 방식' : '지출 방식';
    
    METHODS[type].forEach(method => {
        const chip = document.createElement('div');
        chip.className = 'chip';
        // 수정 시에는 저장된 값, 새 등록 시에는 첫 번째 항목 기본 선택
        if (method === selectedMethod || (!selectedMethod && method === METHODS[type][0])) {
            chip.classList.add('active');
        }
        chip.dataset.method = method;
        chip.innerText = method;
        chip.onclick = () => {
            methodSelector.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
            chip.classList.add('active');
        };
        methodSelector.appendChild(chip);
    });
}

async function loadTransactions() {
    if (!_supabase) return;
    
    // 현재 월 표시
    document.getElementById('current-month').innerText = `${viewDate.getFullYear()}년 ${viewDate.getMonth() + 1}월`;
    
    // 이번 달 범위 계산 (로컬 시간 기준을 ISO UTC로 변환)
    const startOfMonth = new Date(viewDate.getFullYear(), viewDate.getMonth(), 1, 0, 0, 0).toISOString();
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
        
        currentPrevBalance = prevBalance;
        currentTotalSavings = totalAccumulatedSavings;

        renderTransactions();
        updateSummary(monthData, currentPrevBalance, currentTotalSavings);
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

function updateSummary(data, prevBalance = 0, totalAccumulatedSavings = 0, isSearch = false) {
    let income = 0;
    let monthSavings = 0;
    let consumption = 0;
    
    data.forEach(t => {
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

    // 검색 중일 때는 이월 금액을 0으로 처리하거나 제외 (검색 결과의 순수 합계만 표시)
    const effectivePrevBalance = isSearch ? 0 : prevBalance;
    const totalBalance = effectivePrevBalance + income - (monthSavings + consumption);

    // 라벨 업데이트
    const labels = {
        income: isSearch ? '검색 수입' : '이번 달 수입',
        savings: isSearch ? '검색 저축' : '이번 달 저축',
        expense: isSearch ? '검색 지출' : '이번 달 지출',
        balance: isSearch ? '검색 결과 합계' : '최종 잔액 (통장 잔고)',
        prev: isSearch ? '필터 적용됨' : '이월'
    };

    document.querySelectorAll('.main-stat .label')[0].innerText = labels.income;
    document.querySelectorAll('.main-stat .label')[1].innerText = labels.savings;
    document.querySelectorAll('.main-stat .label')[2].innerText = labels.expense;
    document.querySelector('.summary-footer .label').innerText = labels.balance;
    document.querySelector('.mini-stat').childNodes[0].textContent = labels.prev + ' ';

    // 애니메이션 실행
    animateCount('prev-balance', prevValues.prev, effectivePrevBalance);
    animateCount('total-income', prevValues.income, income);
    animateCount('month-savings', prevValues.monthSavings, monthSavings);
    animateCount('total-expense', prevValues.expense, consumption);
    animateCount('total-balance', prevValues.total, totalBalance);
    
    // 누적 저축은 검색과 무관하게 유지하거나 필요 시 0 처리 (여기서는 유지)
    animateCount('total-accumulated-savings', prevValues.totalSavings, totalAccumulatedSavings);

    // 현재 값을 저장
    prevValues = {
        prev: effectivePrevBalance,
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
    
    // 고급 검색 로직 적용
    const filtered = transactions.filter(t => {
        if (!searchTerm) return true;
        
        // 검색 대상 텍스트 통합 (설명, 사용자, 카테고리, 타입)
        const typeKo = t.type === 'income' ? '수입' : '지출';
        const targetText = `${t.description} ${t.user_name || ''} ${t.category || ''} ${typeKo}`.toLowerCase();
        
        // OR(|) 단위로 먼저 분리
        const orGroups = searchTerm.split('|').filter(g => g.trim());
        
        return orGroups.some(group => {
            // AND(&) 단위로 분리
            const andTerms = group.split('&').filter(t => t.trim());
            
            return andTerms.every(term => {
                const trimmedTerm = term.trim();
                if (trimmedTerm.startsWith('!')) {
                    const excludeTerm = trimmedTerm.substring(1).trim();
                    return excludeTerm ? !targetText.includes(excludeTerm) : true;
                }
                return targetText.includes(trimmedTerm);
            });
        });
    });

    // 검색 결과에 따른 요약 업데이트
    if (searchTerm) {
        updateSummary(filtered, 0, currentTotalSavings, true);
    } else {
        // 검색어가 없으면 다시 이번 달 전체 요약으로 복구
        updateSummary(transactions, currentPrevBalance, currentTotalSavings, false);
    }

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
        
        const dateObj = new Date(t.date);
        const date = dateObj.toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' });
        const time = dateObj.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false });
        const methodDisplay = t.method ? ` • <span style="color:var(--text-sub);">${t.method}</span>` : '';
        const fullDateDisplay = `${date} <small style="opacity:0.8;">${time}</small>${methodDisplay} • ${t.category}`;
        const userName = t.user_name ? `<small style="color:var(--primary); font-weight:bold;">${t.user_name}</small> ` : '';
        
        item.innerHTML = `
            <div class="tr-info">
                <h3>${userName}${t.description}</h3>
                <p>${fullDateDisplay}</p>
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
    updateCategoriesAndMethods(); // 카테고리 및 방식 초기화
    
    // 날짜 및 시간 초기화 (현재 로컬 시간 기준)
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    document.getElementById('tr-date').value = `${year}-${month}-${day}`;
    
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    document.getElementById('tr-time').value = `${hours}:${minutes}`;
    
    document.getElementById('delete-btn').style.display = 'none';
    modal.classList.add('active');
};

document.querySelector('.close-btn').onclick = () => modal.classList.remove('active');

window.openEditModal = (t) => {
    editingId = t.id;
    document.getElementById('modal-title').innerText = '내역 수정';
    document.getElementById(t.type === 'income' ? 'type-income' : 'type-expense').checked = true;
    
    updateCategoriesAndMethods(t.category, t.method); // 카테고리 및 방식 업데이트 및 선택

    // 가족 칩 선택 복구
    document.querySelectorAll('.chip').forEach(c => {
        c.classList.toggle('active', c.dataset.name === t.user_name);
    });

    const dateObj = new Date(t.date);
    
    // 로컬 시간 기준 날짜 추출
    const year = dateObj.getFullYear();
    const month = String(dateObj.getMonth() + 1).padStart(2, '0');
    const day = String(dateObj.getDate()).padStart(2, '0');
    const datePart = `${year}-${month}-${day}`;
    
    // 로컬 시간 기준 시:분 추출
    const hours = String(dateObj.getHours()).padStart(2, '0');
    const minutes = String(dateObj.getMinutes()).padStart(2, '0');
    const timePart = `${hours}:${minutes}`;

    document.getElementById('tr-date').value = datePart;
    document.getElementById('tr-time').value = timePart;
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
        user_name: document.querySelector('#family-selector .chip.active').dataset.name,
        date: new Date(`${document.getElementById('tr-date').value}T${document.getElementById('tr-time').value}`).toISOString(),
        description: document.getElementById('tr-description').value,
        amount: parseInt(document.getElementById('tr-amount').value.replace(/[^0-9]/g, '')),
        category: document.getElementById('tr-category').value,
        method: document.querySelector('#method-selector .chip.active')?.dataset.method || '기타'
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
        
        // 텔레그램 알림 발송
        const typeLabel = formData.type === 'income' ? '💰 수입' : '💸 지출';
        const msg = `<b>[가계부 알림]</b>\n` +
                    `대상: ${formData.user_name}\n` +
                    `구분: ${typeLabel}\n` +
                    `방법: ${formData.method}\n` +
                    `내용: ${formData.description}\n` +
                    `금액: ${formData.amount.toLocaleString()}원\n` +
                    `카테고리: ${formData.category}`;
        sendTelegramMessage(msg);
    } else {
        console.error('저장 에러 상세:', error);
        alert('저장에 실패했습니다: ' + error.message);
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
    
    // 삭제할 데이터 정보 미리 가져오기
    const target = transactions.find(t => t.id === editingId);
    
    const { error } = await _supabase.from('account_book').delete().eq('id', editingId);
    if (!error) {
        // 텔레그램 알림 발송
        if (target) {
            const msg = `<b>🗑️ [가계부 내역 삭제]</b>\n` +
                        `대상: ${target.user_name}\n` +
                        `내용: ${target.description}\n` +
                        `금액: ${target.amount.toLocaleString()}원\n` +
                        `카테고리: ${target.category}\n` +
                        `<i>데이터가 영구 삭제되었습니다.</i>`;
            sendTelegramMessage(msg);
        }
        
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
