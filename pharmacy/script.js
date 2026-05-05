/**
 * 우리집 약국 - 실행 로직 (최종 최적화 버전)
 */

const _supabase = supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);
let currentUser = null;

// 초기화
async function init() {
    try {
        const { data: { session } } = await _supabase.auth.getSession();
        if (!session) {
            window.location.href = '../login.html';
            return;
        }
        currentUser = session.user;
        
        // 날짜 표시
        const dateEl = document.getElementById('current-date');
        if (dateEl) {
            dateEl.innerText = new Date().toLocaleDateString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit' });
        }
        
        // 테마 및 탭 초기화
        initTheme();
        initTabs();
        
        // 데이터 로드
        await loadInventory();
        await loadDailyLogs();
        
    } catch (err) {
        console.error('App init error:', err);
    }
}

// 테마 초기화
function initTheme() {
    try {
        const theme = localStorage.getItem('hub-theme') || 'light';
        document.documentElement.setAttribute('data-theme', theme);
        const toggleBtn = document.getElementById('theme-toggle');
        if (toggleBtn) {
            const icon = toggleBtn.querySelector('i');
            if (icon) icon.className = theme === 'dark' ? 'fas fa-sun' : 'fas fa-moon';
            
            toggleBtn.onclick = () => {
                const currentTheme = document.documentElement.getAttribute('data-theme');
                const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
                
                document.documentElement.setAttribute('data-theme', newTheme);
                localStorage.setItem('hub-theme', newTheme);
                if (icon) icon.className = newTheme === 'dark' ? 'fas fa-sun' : 'fas fa-moon';
            };
        }
    } catch (e) {}
}

// 탭 전환 설정
function initTabs() {
    const tabBtns = document.querySelectorAll('.tab-btn');
    const tabContents = document.querySelectorAll('.tab-content');
    
    tabBtns.forEach(btn => {
        btn.onclick = () => {
            const target = btn.dataset.tab;
            tabBtns.forEach(b => b.classList.remove('active'));
            tabContents.forEach(c => c.classList.remove('active'));
            btn.classList.add('active');
            const targetContent = document.getElementById(`tab-${target}`);
            if (targetContent) targetContent.classList.add('active');
        };
    });
}

// 약 재고 불러오기
async function loadInventory() {
    try {
        const medListEl = document.getElementById('medicine-list');
        if (!medListEl) return;
        
        medListEl.innerHTML = '<div class="loading-state"><div class="spinner"></div><p>약장을 확인하고 있어요...</p></div>';
        
        // 모달에서 성공했던 방식과 동일하게 특정 컬럼들을 명시적으로 조회
        const { data, error } = await _supabase
            .from('medicine_inventory')
            .select('id, item_name, entp_name, item_seq, stock_quantity, unit, category')
            .order('item_name');

        if (error) throw error;
        renderInventory(data || []);
        updateDashboard();
    } catch (err) {
        console.error('Error loading inventory:', err);
        const medListEl = document.getElementById('medicine-list');
        if (medListEl) medListEl.innerHTML = '<p class="empty-state">데이터를 가져오는데 실패했습니다.</p>';
    }
}

function renderInventory(items) {
    const medicineList = document.getElementById('medicine-list');
    const emergencyList = document.getElementById('emergency-medicine-list');
    if (!medicineList) return;

    medicineList.innerHTML = '';
    if (emergencyList) emergencyList.innerHTML = '';
    
    if (!items || items.length === 0) {
        medicineList.innerHTML = '<p class="empty-state">등록된 약이 없습니다.</p>';
        if (emergencyList) emergencyList.innerHTML = '<p class="empty-state">등록된 상비약이 없습니다.</p>';
        const countEl = document.getElementById('total-medicine-count');
        if (countEl) countEl.innerText = '0';
        return;
    }

    let prescriptionCount = 0;
    let emergencyCount = 0;

    items.forEach(item => {
        const card = document.createElement('div');
        card.className = 'medicine-card';
        
        let timeInfo = "복용 정보 없음";
        if (item.entp_name && typeof item.entp_name === 'string' && item.entp_name.includes('|')) {
            timeInfo = item.entp_name.replace('|', '<br>');
        } else if (item.entp_name) {
            timeInfo = item.entp_name;
        }
        
        let detailCount = 0;
        try {
            if (item.item_seq) {
                const parsedSeq = typeof item.item_seq === 'string' ? JSON.parse(item.item_seq) : item.item_seq;
                detailCount = Array.isArray(parsedSeq) ? parsedSeq.length : 0;
            }
        } catch (e) { detailCount = 0; }

        const iconClass = (item.category === '상비약') ? 'fas fa-pills' : 'fas fa-file-prescription';
        const iconColor = (item.category === '상비약') ? 'var(--accent)' : 'var(--primary)';

        card.innerHTML = `
            <div class="med-info">
                <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 6px;">
                    <i class="${iconClass}" style="color: ${iconColor}; font-size: 1.2rem;"></i>
                    <h4 style="font-weight: 800; font-size: 1.05rem;">${item.item_name}</h4>
                </div>
                <p style="color: var(--primary); font-size: 0.85rem; font-weight: 700; margin-bottom: 4px;">${timeInfo}</p>
                <p style="opacity: 0.6; font-size: 0.8rem;">${detailCount > 0 ? `총 ${detailCount}종의 약 포함` : '상세 내역 없음'} · ${item.stock_quantity || 0}${item.unit || '회분'}</p>
            </div>
            <div class="med-actions">
                <button class="action-btn take" onclick="openDosageModal('${item.id}', '${item.item_name}', '${item.unit || '회분'}')">체크하기</button>
                <button class="action-btn" onclick="editMedicine('${item.id}')" title="수정"><i class="fas fa-edit"></i></button>
                <button class="action-btn" onclick="deleteMedicine('${item.id}')" title="삭제"><i class="fas fa-trash"></i></button>
            </div>
        `;
        
        // 분류 기준 통일: category가 없거나 '처방약'이면 처방약 탭에 표시
        if (!item.category || item.category === '처방약') {
            medicineList.appendChild(card);
            prescriptionCount++;
        } else {
            if (emergencyList) {
                emergencyList.appendChild(card);
                emergencyCount++;
            }
        }
    });

    if (prescriptionCount === 0) {
        medicineList.innerHTML = '<p class="empty-state">등록된 처방약이 없습니다.</p>';
    }
    if (emergencyCount === 0 && emergencyList) {
        emergencyList.innerHTML = '<p class="empty-state">등록된 상비약이 없습니다.</p>';
    }

    const totalCountEl = document.getElementById('total-medicine-count');
    if (totalCountEl) totalCountEl.innerText = prescriptionCount;
}

// 대시보드 업데이트
async function updateDashboard() {
    try {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        const { data: logs } = await _supabase
            .from('dosage_logs')
            .select('family_member')
            .gte('taken_at', today.toISOString());
        
        const takenMembers = logs ? [...new Set(logs.map(l => l.family_member))] : [];
        
        document.querySelectorAll('.family-member').forEach(el => {
            const memberName = el.dataset.member;
            if (takenMembers.includes(memberName)) {
                el.classList.add('taken');
            } else {
                el.classList.remove('taken');
            }
        });
    } catch (e) {}
}

// 복용 기록 불러오기
async function loadDailyLogs() {
    try {
        const logsContainer = document.getElementById('dosage-logs-list');
        if (!logsContainer) return;

        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        const { data, error } = await _supabase
            .from('dosage_logs')
            .select('*, medicine_inventory(item_name, unit)')
            .gte('taken_at', today.toISOString())
            .order('taken_at', { ascending: false });

        if (error || !data || data.length === 0) {
            logsContainer.innerHTML = '<p class="empty-state">오늘의 복용 기록이 아직 없네요.</p>';
            return;
        }

        logsContainer.innerHTML = '';
        data.forEach(log => {
            const time = new Date(log.taken_at).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
            const med = log.medicine_inventory;
            const logIconClass = (med?.category === '상비약') ? 'fas fa-pills' : 'fas fa-file-prescription';
            const logIconColor = (med?.category === '상비약') ? 'var(--accent)' : 'var(--primary)';

            const item = document.createElement('div');
            item.className = 'log-card'; 
            item.innerHTML = `
                <div class="log-info">
                    <h4 style="font-family: 'Gaegu', cursive; font-size: 1.15rem; color: var(--primary); margin-bottom: 2px;">${log.family_member}님이 복용함</h4>
                    <p style="font-weight: 700; font-size: 0.95rem; display: flex; align-items: center; gap: 6px;">
                        <i class="${logIconClass}" style="color: ${logIconColor}; font-size: 0.9rem;"></i>
                        ${med?.item_name || '알 수 없는 약'}
                    </p>
                    <p style="font-size: 0.8rem; opacity: 0.6; margin-top: 2px;">${log.dosage_amount}${med?.unit || '회분'} · ${log.notes || '메모 없음'}</p>
                </div>
                <div class="log-actions" style="display: flex; flex-direction: column; align-items: flex-end; gap: 8px;">
                    <button class="delete-log-btn" onclick="deleteLog('${log.id}', '${log.medicine_id}', ${log.dosage_amount})" style="background: none; border: none; color: #ef4444; cursor: pointer; font-size: 1.1rem; padding: 0 0 5px 10px; opacity: 0.6; transition: opacity 0.2s;">
                        <i class="fas fa-minus-circle"></i>
                    </button>
                    <span class="log-time" style="background: rgba(255,255,255,0.05); padding: 6px 12px; border-radius: 10px; font-size: 0.85rem; font-weight: 700; border: 1px solid rgba(255,255,255,0.05);">${time}</span>
                </div>
            `;
            logsContainer.appendChild(item);
        });
    } catch (e) {}
}

// 약 등록/수정 모달 관련 로직
function openAddModal(mode = 'prescription') {
    const modalTitle = document.getElementById('modal-title');
    const prescriptionFields = document.getElementById('prescription-fields');
    const emergencyFields = document.getElementById('emergency-fields');
    
    if (mode === 'prescription') {
        modalTitle.innerText = '약 등록하기';
        if (prescriptionFields) prescriptionFields.style.display = 'block';
        if (emergencyFields) emergencyFields.style.display = 'none';
    } else {
        modalTitle.innerText = '상비약 등록하기';
        if (prescriptionFields) prescriptionFields.style.display = 'none';
        if (emergencyFields) emergencyFields.style.display = 'block';
    }

    document.getElementById('medicine-form').reset();
    document.getElementById('edit-id').value = '';
    const detailList = document.getElementById('medicine-detail-list');
    if (detailList) {
        detailList.innerHTML = ''; // 상세 리스트 초기화
        if (mode === 'prescription') {
            for (let i = 0; i < 5; i++) addDetailRow(); // 기본 5개 입력창 생성
        }
    }
    
    // 칩 초기화
    document.querySelectorAll('#take-time-group .chip').forEach(c => c.classList.remove('selected'));
    document.getElementById('medicine-modal').classList.add('active');
}

function openEmergencyAddModal() {
    openAddModal('emergency');
}

function addDetailRow(data = { name: '', cap: '', dose: '', freq: '' }) {
    const list = document.getElementById('medicine-detail-list');
    if (!list) return;

    const row = document.createElement('div');
    row.className = 'detail-row';
    row.innerHTML = `
        <input type="text" placeholder="약품명" value="${data.name || ''}" style="grid-column: span 2; text-align: left;">
        <input type="text" placeholder="용량" value="${data.cap || ''}">
        <input type="text" placeholder="투약량" value="${data.dose || ''}">
        <input type="number" placeholder="횟수" value="${data.freq || ''}">
        <button type="button" class="remove-detail-btn" onclick="removeDetailRow(this)"><i class="fas fa-times"></i></button>
    `;
    list.appendChild(row);
    
    // 모바일에서 입력 시 스크롤 아래로
    list.scrollTop = list.scrollHeight;
}

function removeDetailRow(btn) {
    btn.parentElement.remove();
}

function closeModal(modalId) {
    document.getElementById(modalId).classList.remove('active');
}

// 칩 선택 로직 (이벤트 위임 활용)
document.addEventListener('click', e => {
    if (e.target.classList.contains('chip')) {
        const group = e.target.closest('.chip-group');
        if (group.id === 'take-time-group') {
            e.target.classList.toggle('selected');
        } else {
            group.querySelectorAll('.chip').forEach(c => c.classList.remove('selected'));
            e.target.classList.add('selected');
        }
    }
});

// 약 저장 (등록 및 수정)
document.getElementById('medicine-form').onsubmit = async (e) => {
    e.preventDefault();
    const id = document.getElementById('edit-id').value;
    const isEmergency = document.getElementById('emergency-fields').style.display === 'block';
    
    let formData = {
        user_id: currentUser.id,
        item_name: document.getElementById('item_name').value,
    };

    if (isEmergency) {
        formData = {
            ...formData,
            category: document.getElementById('category').value,
            stock_quantity: parseInt(document.getElementById('stock_quantity').value || 0),
            unit: document.getElementById('unit').value || '정',
            entp_name: '필요시 복용' // 상비약은 기본 정보
        };
    } else {
        const selectedTimes = Array.from(document.querySelectorAll('#take-time-group .chip.selected')).map(c => c.dataset.value);
        const takeTiming = document.getElementById('take_timing').value;
        
        // 상세 약 리스트 수집
        const detailRows = document.querySelectorAll('.detail-row');
        const itemSeq = Array.from(detailRows).map(row => {
            const inputs = row.querySelectorAll('input');
            return {
                name: inputs[0].value,
                cap: inputs[1].value,
                dose: inputs[2].value,
                freq: inputs[3].value
            };
        }).filter(item => item.name);

        formData = {
            ...formData,
            entp_name: `${selectedTimes.join(', ')} | ${takeTiming}`,
            unit: '회분',
            stock_quantity: parseInt(document.getElementById('total_days')?.value || 0), 
            category: '처방약',
            item_seq: JSON.stringify(itemSeq)
        };
    }

    try {
        let result;
        if (id) {
            result = await _supabase.from('medicine_inventory').update(formData).eq('id', id);
        } else {
            result = await _supabase.from('medicine_inventory').insert(formData);
        }

        if (result.error) throw result.error;
        
        showToast(id ? '수정되었습니다!' : '등록되었습니다!');
        closeModal('medicine-modal');
        loadInventory();
    } catch (err) {
        alert('저장 실패: ' + err.message);
    }
};

async function editMedicine(id) {
    try {
        const { data } = await _supabase.from('medicine_inventory').select('*').eq('id', id).single();
        if (!data) return;

        const isEmergency = data.category && data.category !== '처방약';
        openAddModal(isEmergency ? 'emergency' : 'prescription');
        
        document.getElementById('modal-title').innerText = isEmergency ? '상비약 수정하기' : '약 수정하기';
        document.getElementById('edit-id').value = data.id;
        document.getElementById('item_name').value = data.item_name;
        
        if (isEmergency) {
            document.getElementById('category').value = data.category;
            document.getElementById('stock_quantity').value = data.stock_quantity || '';
            document.getElementById('unit').value = data.unit || '정';
        } else {
            if (data.entp_name && data.entp_name.includes('|')) {
                const [times, timing] = data.entp_name.split(' | ');
                const timeArray = times.split(', ');
                document.querySelectorAll('#take-time-group .chip').forEach(c => {
                    if (timeArray.includes(c.dataset.value)) c.classList.add('selected');
                });
                document.getElementById('take_timing').value = timing;
            }
            document.getElementById('total_days').value = data.stock_quantity || '';
            
            // 상세 리스트 복원
            const detailList = document.getElementById('medicine-detail-list');
            if (detailList) {
                detailList.innerHTML = '';
                if (data.item_seq) {
                    try {
                        const items = typeof data.item_seq === 'string' ? JSON.parse(data.item_seq) : data.item_seq;
                        if (Array.isArray(items)) {
                            items.forEach(item => addDetailRow(item));
                        }
                    } catch (e) {}
                }
            }
        }
    } catch (err) {
        alert('정보를 불러오지 못했습니다.');
    }
}

async function deleteMedicine(id) {
    if (!confirm('정말 삭제하시겠습니까?')) return;
    try {
        const { error } = await _supabase.from('medicine_inventory').delete().eq('id', id);
        if (error) throw error;
        showToast('삭제되었습니다.');
        loadInventory();
    } catch (err) {
        alert('삭제 실패: ' + err.message);
    }
}

// 복용 모달 열기
let currentDosageMode = 'auto'; 
async function openDosageModal(medId, medName, unit) {
    currentDosageMode = 'auto';
    const nameEl = document.getElementById('dosage-medicine-name');
    if (nameEl) nameEl.innerText = medName;
    
    const idEl = document.getElementById('dosage-medicine-id');
    if (idEl) idEl.value = medId;
    
    const manualSelect = document.getElementById('manual-medicine-select');
    if (manualSelect) manualSelect.style.display = 'none';
    
    const unitEl = document.getElementById('dosage-unit-label');
    if (unitEl) unitEl.innerText = unit || '회분';
    
    // 칩 초기화
    document.querySelectorAll('#dosage-time-group .chip').forEach(c => c.classList.remove('selected'));
    document.querySelectorAll('#family-member-group .chip').forEach(c => c.classList.remove('selected'));
    const defaultMember = document.querySelector('#family-member-group .chip[data-value="아빠"]');
    if (defaultMember) defaultMember.classList.add('selected');
    
    document.getElementById('dosage-modal').classList.add('active');
}

let allMedicines = [];
async function openManualDosageModal() {
    currentDosageMode = 'manual';
    document.getElementById('manual-medicine-select').style.display = 'block';
    
    const { data: medicines } = await _supabase.from('medicine_inventory').select('id, item_name, unit, category').order('item_name');
    allMedicines = medicines || [];
    
    if (allMedicines.length === 0) {
        alert('먼저 처방약이나 상비약부터 등록해주세요.');
        return;
    }

    const typeSelect = document.getElementById('dosage-type-select');
    const medSelect = document.getElementById('dosage-medicine-select');
    
    const updateMedOptions = () => {
        const selectedType = typeSelect.value;
        const filtered = allMedicines.filter(m => {
            const isPrescription = !m.category || m.category === '처방약';
            return selectedType === '처방약' ? isPrescription : !isPrescription;
        });
        
        medSelect.innerHTML = filtered.map(m => `<option value="${m.id}" data-unit="${m.unit || '회분'}">${m.item_name}</option>`).join('');
        if (filtered.length > 0) {
            document.getElementById('dosage-unit-label').innerText = filtered[0].unit || '회분';
        }
    };

    typeSelect.onchange = updateMedOptions;
    medSelect.onchange = () => {
        const unit = medSelect.options[medSelect.selectedIndex]?.dataset.unit;
        document.getElementById('dosage-unit-label').innerText = unit || '회분';
    };
    
    updateMedOptions();
    document.querySelectorAll('#dosage-time-group .chip').forEach(c => c.classList.remove('selected'));
    document.querySelectorAll('#family-member-group .chip').forEach(c => c.classList.remove('selected'));
    const defaultMember = document.querySelector('#family-member-group .chip[data-value="아빠"]');
    if (defaultMember) defaultMember.classList.add('selected');
    
    document.getElementById('dosage-modal').classList.add('active');
}

// 복용 기록 저장
document.getElementById('dosage-form').onsubmit = async (e) => {
    e.preventDefault();
    const medId = currentDosageMode === 'auto' ? document.getElementById('dosage-medicine-id').value : document.getElementById('dosage-medicine-select').value;
    const amount = parseFloat(document.getElementById('dosage_amount').value);
    const member = document.querySelector('#family-member-group .chip.selected')?.dataset.value || '아빠';
    const selectedTime = document.querySelector('#dosage-time-group .chip.selected')?.dataset.value || '필요시';
    const notes = `${selectedTime} | ${document.getElementById('dosage_notes').value}`;

    try {
        const { error: logError } = await _supabase.from('dosage_logs').insert({
            user_id: currentUser.id,
            medicine_id: medId,
            family_member: member,
            dosage_amount: amount,
            notes: notes
        });

        if (logError) throw logError;

        // 재고 차감
        const { data: med } = await _supabase.from('medicine_inventory').select('stock_quantity').eq('id', medId).single();
        if (med) {
            await _supabase.from('medicine_inventory')
                .update({ stock_quantity: Math.max(0, med.stock_quantity - amount) })
                .eq('id', medId);
        }

        showToast('복용 기록이 등록되었습니다!');
        closeModal('dosage-modal');
        loadInventory();
        loadDailyLogs();
    } catch (err) {
        alert('기록 실패: ' + err.message);
    }
};

async function deleteLog(id, medId, amount) {
    if (!confirm('복용 기록을 취소하시겠습니까? (재고가 복구됩니다)')) return;
    try {
        const { error } = await _supabase.from('dosage_logs').delete().eq('id', id);
        if (error) throw error;

        // 재고 복구
        const { data: med } = await _supabase.from('medicine_inventory').select('stock_quantity').eq('id', medId).single();
        if (med) {
            await _supabase.from('medicine_inventory')
                .update({ stock_quantity: med.stock_quantity + amount })
                .eq('id', medId);
        }

        showToast('기록이 삭제되었습니다.');
        loadInventory();
        loadDailyLogs();
    } catch (err) {
        alert('삭제 실패: ' + err.message);
    }
}

function showToast(message) {
    const toast = document.getElementById('success-toast');
    document.getElementById('toast-message').innerText = message;
    toast.classList.add('active');
    setTimeout(() => toast.classList.remove('active'), 3000);
}

// --- OCR 및 카메라 로직 ---
const cameraBtn = document.getElementById('camera-btn');
const cameraModal = document.getElementById('camera-modal');
const video = document.getElementById('camera-video');
const captureBtn = document.getElementById('capture-btn');
const galleryBtn = document.getElementById('gallery-btn');
const fileInput = document.getElementById('file-input');
const canvas = document.getElementById('capture-canvas');
const ocrStatus = document.getElementById('ocr-status');

if (cameraBtn) {
    cameraBtn.onclick = async () => {
        cameraModal.classList.add('active');
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
            video.srcObject = stream;
        } catch (err) {
            alert('카메라 접근 실패: ' + err.message);
        }
    };
}

function closeCameraModal() {
    const stream = video.srcObject;
    if (stream) {
        stream.getTracks().forEach(track => track.stop());
    }
    cameraModal.classList.remove('active');
}

if (captureBtn) {
    captureBtn.onclick = () => {
        const context = canvas.getContext('2d');
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        context.drawImage(video, 0, 0);
        const imageData = canvas.toDataURL('image/png');
        runOCR(imageData);
    };
}

if (galleryBtn) {
    galleryBtn.onclick = () => fileInput.click();
}

if (fileInput) {
    fileInput.onchange = (e) => {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (event) => runOCR(event.target.result);
            reader.readAsDataURL(file);
        }
    };
}

async function runOCR(image) {
    ocrStatus.innerText = '텍스트 인식 중...';
    try {
        const result = await Tesseract.recognize(image, 'kor+eng');
        const text = result.data.text.replace(/\n/g, ' ').trim();
        ocrStatus.innerText = '인식 완료!';
        
        setTimeout(() => {
            closeCameraModal();
            // 탭 버튼을 다시 찾아 클릭 (ReferenceError 방지)
            const btns = document.querySelectorAll('.tab-btn');
            if (btns[3]) btns[3].click(); 
        }, 1000);
    } catch (err) {
        ocrStatus.innerText = '인식 실패: ' + err.message;
    }
}

// 앱 실행
init();
