document.addEventListener('DOMContentLoaded', () => {
    // UI Elements
    const navBtns = document.querySelectorAll('.nav-btn');
    const tabContents = document.querySelectorAll('.tab-content');
    const qrReaderDiv = document.getElementById('qr-reader');
    const stopScanBtn = document.getElementById('stop-scan-btn');
    const navScanBtn = document.getElementById('nav-scan-btn');
    const lottoListContainer = document.getElementById('lotto-list');
    const totalGamesEl = document.getElementById('total-games');
    const winningGamesEl = document.getElementById('winning-games');
    const refreshBtn = document.getElementById('refresh-btn');
    const themeToggleBtn = document.getElementById('theme-toggle-btn');
    const themeIcon = themeToggleBtn.querySelector('i');
    const manualEntryBtn = document.getElementById('manual-entry-btn');
    const manualModal = document.getElementById('manual-modal');
    const modalCloseBtn = document.getElementById('modal-close-btn');
    const modalConfirmBtn = document.getElementById('modal-confirm-btn');
    const numberGrid = document.getElementById('number-grid');
    const manualRoundInput = document.getElementById('manual-round');
    const selectedCountEl = document.getElementById('selected-count');
    const selectedPreviewEl = document.getElementById('selected-balls-preview');
    
    // Scan Result Modal Elements
    const scanResultModal = document.getElementById('scan-result-modal');
    const scanRoundEl = document.getElementById('scan-round');
    const scanGameCountEl = document.getElementById('scan-game-count');
    const scanPreviewContainer = document.getElementById('scan-preview-container');
    const scanModalCloseBtn = document.getElementById('scan-modal-close-btn');
    const scanCancelBtn = document.getElementById('scan-cancel-btn');
    const scanConfirmBtn = document.getElementById('scan-confirm-btn');

    // Winning Result UI Elements
    const editWinBtn = document.getElementById('edit-win-btn');
    const winModal = document.getElementById('win-modal');
    const winModalCloseBtn = document.getElementById('win-modal-close-btn');
    const winModalConfirmBtn = document.getElementById('win-modal-confirm-btn');
    const winRoundInput = document.getElementById('win-round');

    // [이벤트 리스너] 스캔 결과 모달 버튼
    if (scanConfirmBtn) scanConfirmBtn.addEventListener('click', closeScanResultModal);
    if (scanCancelBtn) scanCancelBtn.addEventListener('click', closeScanResultModal);
    if (scanModalCloseBtn) scanModalCloseBtn.addEventListener('click', closeScanResultModal);

    const winNumberGrid = document.getElementById('win-number-grid');
    const winSelectedCountEl = document.getElementById('win-selected-count');
    const winBallsPreviewEl = document.getElementById('win-balls-preview');
    const bonusSelectionArea = document.getElementById('bonus-selection-area');
    const bonusGrid = document.getElementById('bonus-grid');
    const winStep1 = document.getElementById('win-step-1');
    const winStep2 = document.getElementById('win-step-2');
    const winNextBtn = document.getElementById('win-next-btn');
    const winPrevBtn = document.getElementById('win-prev-btn');

    let selectedNumbers = [];
    let selectedWinNumbers = [];
    let selectedBonusNumber = null;

    // State
    let html5QrcodeScanner = null;
    let lottoData = []; // DB에서 가져올 예정
    let winningNumbersCache = JSON.parse(localStorage.getItem('winningNumbersCache')) || {};
    let tempScannedData = null;
    let isModalOpen = false;

    // Supabase 설정 (config.js 로드됨)
    let _supabase = null;

    async function initLottoApp() {
        try {
            _supabase = supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);
            
            // 세션 체크
            const { data: { session } } = await _supabase.auth.getSession();
            if (!session) {
                // 세션이 없어도 일단 로컬 데이터로 렌더링 시도 (오프라인/임시 사용 지원)
                lottoData = JSON.parse(localStorage.getItem('myLottoData')) || [];
                renderLottoList();
                return;
            }

            await loadLottoData();
            
            // 실시간 구독
            _supabase
                .channel('lotto-changes')
                .on('postgres_changes', { event: '*', schema: 'public', table: 'lotto_tickets' }, () => {
                    loadLottoData();
                })
                .subscribe();
        } catch (e) {
            console.error("Supabase 초기화 실패, 로컬 모드로 시작합니다.", e);
            lottoData = JSON.parse(localStorage.getItem('myLottoData')) || [];
            renderLottoList();
        }
    }

    async function loadLottoData() {
        if (!_supabase) {
            lottoData = JSON.parse(localStorage.getItem('myLottoData')) || [];
            renderLottoList();
            return;
        }

        const { data, error } = await _supabase
            .from('lotto_tickets')
            .select('*')
            .order('created_at', { ascending: false });

        if (!error) {
            lottoData = data;
            localStorage.setItem('myLottoData', JSON.stringify(lottoData));
            
            // [최적화] 모든 회차 당첨 번호를 한 번에 배치 조회
            const rounds = [...new Set(lottoData.map(t => t.round))];
            await fetchMultipleWinningNumbers(rounds);
            
            // [최적화] 결과가 없는 항목들을 계산해서 DB에 기록
            await syncWinResults();
            
            renderLottoList();
        } else {
            console.error("Lotto data load error:", error);
            // 에러 시에도 로컬 데이터는 보여줌
            lottoData = JSON.parse(localStorage.getItem('myLottoData')) || [];
            renderLottoList();
        }
    }

    // 탭 전환 로직
    navBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const targetId = btn.getAttribute('data-target');

            // 탭 UI 업데이트
            navBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');

            // 콘텐츠 업데이트
            tabContents.forEach(content => {
                content.classList.remove('active');
            });
            document.getElementById(targetId).classList.add('active');

            // 스캐너 탭 진입 시 카메라 자동 시작
            if (targetId === 'tab-scan') {
                startScanner();
            } else if (targetId === 'tab-pension') {
                stopScanner();
                updatePensionResult();
            } else {
                stopScanner();
                renderLottoList();
            }
        });
    });

    // 테마 토글 로직
    const currentTheme = localStorage.getItem('lottoTheme') || 'light';
    if (currentTheme === 'dark') {
        document.documentElement.setAttribute('data-theme', 'dark');
        if (themeIcon) themeIcon.classList.replace('fa-sun', 'fa-moon');
    }

    if (themeToggleBtn) {
        themeToggleBtn.addEventListener('click', () => {
            const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
            if (isDark) {
                document.documentElement.removeAttribute('data-theme');
                themeIcon.classList.replace('fa-moon', 'fa-sun');
                localStorage.setItem('lottoTheme', 'light');
            } else {
                document.documentElement.setAttribute('data-theme', 'dark');
                themeIcon.classList.replace('fa-sun', 'fa-moon');
                localStorage.setItem('lottoTheme', 'dark');
            }
        });
    }


    // 스캐너 관련 로직
    function startScanner() {
        if (!html5QrcodeScanner) {
            html5QrcodeScanner = new Html5Qrcode("qr-reader");
        }

        // 카메라 설정 최적화 (초점 문제 해결을 위해 강제 매크로 제거 및 영역 확대)
        const config = {
            fps: 20,
            qrbox: { width: 220, height: 220 }, // 창 크기에 맞춰 콤팩트하게 조정
            aspectRatio: 1.0,
            videoConstraints: {
                facingMode: "environment",
                width: { ideal: 1280 },
                height: { ideal: 720 },
                focusMode: "continuous"
            }
        };

        html5QrcodeScanner.start(
            { facingMode: "environment" },
            config,
            onScanSuccess,
            onScanFailure
        ).then(() => {
            stopScanBtn.classList.remove('hidden');

            // [집중 수정] 포커스 킥(Focus Kick) 로직 추가
            // 카메라 시작 직후 초점이 멍하니 있는 현상을 방지하기 위해
            // 0.5초 후 강제로 포커스 설정을 리프레시하여 렌즈를 깨웁니다.
            setTimeout(async () => {
                try {
                    const track = html5QrcodeScanner.getRunningTrack();
                    if (track && track.applyConstraints) {
                        const capabilities = track.getCapabilities ? track.getCapabilities() : {};
                        if (capabilities.focusMode) {
                            await track.applyConstraints({
                                advanced: [{ focusMode: "continuous" }]
                            });
                        }
                    }
                } catch (e) {
                    console.warn("Focus kick failed:", e);
                }
            }, 500);

        }).catch(err => {
            console.error("Scanner error:", err);
            qrReaderDiv.innerHTML = '<p style="padding: 20px;">카메라를 시작할 수 없습니다. 권한 설정을 확인해주세요.</p>';
        });
    }

    function stopScanner() {
        if (html5QrcodeScanner && html5QrcodeScanner.isScanning) {
            html5QrcodeScanner.stop().then(() => {
                stopScanBtn.classList.add('hidden');
            }).catch(err => console.error("Failed to stop scanner", err));
        }
    }

    stopScanBtn.addEventListener('click', stopScanner);

    if (manualEntryBtn) {
        manualEntryBtn.addEventListener('click', () => {
            openManualModal();
        });
    }

    if (modalCloseBtn) {
        modalCloseBtn.addEventListener('click', closeManualModal);
    }

    if (modalConfirmBtn) {
        modalConfirmBtn.addEventListener('click', () => {
            const round = parseInt(manualRoundInput.value, 10);
            if (isNaN(round)) {
                alert("회차를 입력해주세요.");
                return;
            }
            if (selectedNumbers.length !== 6) {
                alert("번호 6개를 모두 선택해주세요.");
                return;
            }

            addLottoTicket(round, [selectedNumbers.sort((a, b) => a - b)]);
            closeManualModal();
            document.querySelector('[data-target="tab-list"]').click();
        });
    }

    function openManualModal() {
        openModal(manualModal);

        // 최신 회차 자동 입력 (데이터가 있으면 그 회차, 없으면 기본값)
        const latestRoundMatch = document.getElementById('latest-round-title')?.textContent;
        if (latestRoundMatch && !isNaN(parseInt(latestRoundMatch))) {
            manualRoundInput.value = parseInt(latestRoundMatch);
        } else {
            manualRoundInput.value = '';
        }

        selectedNumbers = [];
        renderNumberGrid();
        updateModalUI();
    }

    function closeManualModal() {
        closeModal(manualModal);
    }

    function renderNumberGrid() {
        numberGrid.innerHTML = '';
        for (let i = 1; i <= 45; i++) {
            const numBtn = document.createElement('div');
            const rangeClass = `range-${Math.ceil(i / 10)}`;
            numBtn.className = `grid-num ${rangeClass}`;
            numBtn.textContent = i;
            numBtn.addEventListener('click', () => toggleNumber(i));
            numberGrid.appendChild(numBtn);
        }
    }

    function toggleNumber(num) {
        const index = selectedNumbers.indexOf(num);
        if (index > -1) {
            selectedNumbers.splice(index, 1);
        } else if (selectedNumbers.length < 6) {
            selectedNumbers.push(num);
        } else {
            alert("최대 6개까지만 선택 가능합니다.");
            return;
        }
        updateModalUI();
    }

    function updateModalUI() {
        const allNums = document.querySelectorAll('.grid-num');
        allNums.forEach(btn => {
            const num = parseInt(btn.textContent, 10);
            btn.classList.remove('selected', 'selected-1', 'selected-2', 'selected-3', 'selected-4', 'selected-5');
            if (selectedNumbers.includes(num)) {
                btn.classList.add('selected');
                btn.classList.add(`selected-${Math.ceil(num / 10)}`);
            }
        });

        selectedCountEl.textContent = selectedNumbers.length;
        modalConfirmBtn.disabled = !(selectedNumbers.length === 6 && manualRoundInput.value);

        // 버튼 스타일 실시간 반영 (disabled 상태일 때 시각적 피드백)
        if (modalConfirmBtn.disabled) {
            modalConfirmBtn.style.opacity = '0.5';
        } else {
            modalConfirmBtn.style.opacity = '1';
        }

        // 미리보기 렌더링
        selectedPreviewEl.innerHTML = '';
        selectedNumbers.sort((a, b) => a - b).forEach(num => {
            const ball = document.createElement('div');
            ball.className = `number-ball ball-${Math.ceil(num / 10)}`;
            ball.textContent = num;
            selectedPreviewEl.appendChild(ball);
        });
    }

    manualRoundInput.addEventListener('input', updateModalUI);

    // 당첨 번호 직접 입력 관련 로직
    if (editWinBtn) {
        editWinBtn.addEventListener('click', openWinModal);
    }
    if (winModalCloseBtn) {
        winModalCloseBtn.addEventListener('click', closeWinModal);
    }
    if (winModalConfirmBtn) {
        winModalConfirmBtn.addEventListener('click', saveManualWinResult);
    }
    if (winNextBtn) {
        winNextBtn.addEventListener('click', () => goToWinStep(2));
    }
    if (winPrevBtn) {
        winPrevBtn.addEventListener('click', () => goToWinStep(1));
    }

    function goToWinStep(step) {
        if (step === 1) {
            winStep1.classList.remove('hidden');
            winStep2.classList.add('hidden');
        } else {
            winStep1.classList.add('hidden');
            winStep2.classList.remove('hidden');
            renderBonusGrid();
        }
        updateWinModalUI();
    }

    function openWinModal() {
        openModal(winModal);
        goToWinStep(1);

        // 현재 표시된 회차 또는 최신 계산 회차 자동 입력
        const latestRoundMatch = document.getElementById('latest-round-title')?.textContent;
        let currentRound;
        if (latestRoundMatch && !isNaN(parseInt(latestRoundMatch.replace(/[^0-9]/g, '')))) {
            currentRound = parseInt(latestRoundMatch.replace(/[^0-9]/g, ''));
        } else {
            currentRound = getLatestRound();
        }
        winRoundInput.value = currentRound;

        loadWinResultForRound(currentRound);
    }

    function loadWinResultForRound(round) {
        if (winningNumbersCache[round]) {
            selectedWinNumbers = [...winningNumbersCache[round].numbers];
            selectedBonusNumber = winningNumbersCache[round].bonus;
        } else {
            selectedWinNumbers = [];
            selectedBonusNumber = null;
        }

        renderWinNumberGrid();
        // 보너스 선택 단계라면 보너스 그리드도 재렌더링 (비활성 번호 갱신)
        if (!winStep2.classList.contains('hidden')) {
            renderBonusGrid();
        }
        updateWinModalUI();
    }

    winRoundInput.addEventListener('input', () => {
        const round = parseInt(winRoundInput.value);
        if (round) {
            loadWinResultForRound(round);
        }
    });

    function closeWinModal() {
        closeModal(winModal);
    }

    function renderWinNumberGrid() {
        winNumberGrid.innerHTML = '';
        for (let i = 1; i <= 45; i++) {
            const numBtn = document.createElement('div');
            const rangeClass = `range-${Math.ceil(i / 10)}`;
            numBtn.className = `grid-num ${rangeClass}`;
            numBtn.textContent = i;
            numBtn.addEventListener('click', () => toggleWinNumber(i));
            winNumberGrid.appendChild(numBtn);
        }
    }

    function toggleWinNumber(num) {
        if (selectedWinNumbers.length < 6) {
            const index = selectedWinNumbers.indexOf(num);
            if (index > -1) {
                selectedWinNumbers.splice(index, 1);
            } else {
                selectedWinNumbers.push(num);
            }
        } else {
            // 6개 선택 완료 후 보너스 번호 선택
            if (selectedWinNumbers.includes(num)) {
                selectedWinNumbers.splice(selectedWinNumbers.indexOf(num), 1);
                selectedBonusNumber = null;
            } else {
                selectedBonusNumber = num;
            }
        }
        updateWinModalUI();
    }

    function renderBonusGrid() {
        bonusGrid.innerHTML = '';
        for (let i = 1; i <= 45; i++) {
            const numBtn = document.createElement('div');
            const rangeClass = `range-${Math.ceil(i / 10)}`;
            numBtn.className = `grid-num ${rangeClass}`;
            numBtn.textContent = i;

            if (selectedWinNumbers.includes(i)) {
                // 당첨 번호로 이미 선택된 번호는 선택된 상태로 유지하되 X 표시
                numBtn.classList.add('selected', `selected-${Math.ceil(i / 10)}`, 'disabled');
                numBtn.style.pointerEvents = 'none';
            } else {
                if (selectedBonusNumber === i) numBtn.classList.add('selected', `selected-${Math.ceil(i / 10)}`);
                numBtn.addEventListener('click', () => {
                    selectedBonusNumber = i;
                    updateWinModalUI();
                });
            }
            bonusGrid.appendChild(numBtn);
        }
    }

    function updateWinModalUI() {
        const allNums = winNumberGrid.querySelectorAll('.grid-num');
        allNums.forEach(btn => {
            const num = parseInt(btn.textContent, 10);
            btn.classList.remove('selected', 'selected-1', 'selected-2', 'selected-3', 'selected-4', 'selected-5');
            if (selectedWinNumbers.includes(num)) {
                btn.classList.add('selected');
                btn.classList.add(`selected-${Math.ceil(num / 10)}`);
            }
        });

        winSelectedCountEl.textContent = selectedWinNumbers.length;

        // 보너스 번호 선택 상태 업데이트
        const allBonusNums = bonusGrid.querySelectorAll('.grid-num');
        allBonusNums.forEach(btn => {
            const num = parseInt(btn.textContent, 10);
            btn.classList.remove('selected', 'selected-1', 'selected-2', 'selected-3', 'selected-4', 'selected-5');

            // 보너스 번호로 선택되었거나, 이미 당첨 번호로 선택된 경우
            if (selectedBonusNumber === num || selectedWinNumbers.includes(num)) {
                btn.classList.add('selected');
                btn.classList.add(`selected-${Math.ceil(num / 10)}`);
            }
        });

        // 버튼 활성화 로직
        winNextBtn.disabled = (selectedWinNumbers.length !== 6);
        winModalConfirmBtn.disabled = !(selectedWinNumbers.length === 6 && selectedBonusNumber && winRoundInput.value);

        // 미리보기 렌더링
        winBallsPreviewEl.innerHTML = '';
        selectedWinNumbers.sort((a, b) => a - b).forEach(num => {
            const ball = document.createElement('div');
            ball.className = `number-ball ball-${Math.ceil(num / 10)}`;
            ball.textContent = num;
            winBallsPreviewEl.appendChild(ball);
        });

        if (selectedBonusNumber) {
            const plus = document.createElement('div');
            plus.style.display = 'flex';
            plus.style.alignItems = 'center';
            plus.textContent = '+';
            winBallsPreviewEl.appendChild(plus);

            const ball = document.createElement('div');
            ball.className = `number-ball ball-${Math.ceil(selectedBonusNumber / 10)}`;
            ball.textContent = selectedBonusNumber;
            winBallsPreviewEl.appendChild(ball);
        }
    }

    async function saveManualWinResult() {
        const round = parseInt(winRoundInput.value, 10);
        if (!round || selectedWinNumbers.length !== 6 || !selectedBonusNumber) return;

        winModalConfirmBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 저장 중...';
        winModalConfirmBtn.disabled = true;

        const resultData = {
            round: round,
            numbers: selectedWinNumbers.sort((a, b) => a - b),
            bonus: selectedBonusNumber,
            draw_date: new Date().toISOString().split('T')[0] // 입력 날짜
        };

        try {
            if (_supabase) {
                await _supabase.from('lotto_results').upsert(resultData);
            }

            // 로컬 캐시 업데이트
            winningNumbersCache[round] = {
                numbers: resultData.numbers,
                bonus: resultData.bonus,
                date: resultData.draw_date
            };
            saveData();

            setTimeout(() => {
                closeWinModal();
                winModalConfirmBtn.innerHTML = '저장하기';
                updateLatestLottoResult();
                renderLottoList();
            }, 500);
        } catch (e) {
            console.error("당첨 번호 저장 실패:", e);
            alert("저장에 실패했습니다.");
            winModalConfirmBtn.disabled = false;
            winModalConfirmBtn.innerHTML = '저장하기';
        }
    }

    function onScanSuccess(decodedText, decodedResult) {
        console.log("Scanned QR:", decodedText);
        // 동행복권 QR URL 파싱 로직 (더 유연하게)
        if (decodedText.includes('?v=') || decodedText.includes('v=')) {
            // 스캐너 일시 정지 (카메라는 켜둔 채로)
            if (html5QrcodeScanner) {
                try { html5QrcodeScanner.pause(); } catch(e) {}
            }

            let vData = '';
            if (decodedText.includes('v=')) {
                vData = decodedText.split('v=')[1].split('&')[0];
            }

            if (vData) {
                // 연금복권 패턴 감지 (p로 시작하는 경우)
                if (vData.startsWith('p')) {
                    qrReaderDiv.innerHTML = '<p style="padding: 20px; color: #ff4757;">연금복권 QR코드입니다.<br><span style="font-size:12px;">현재는 로또 6/45 스캔만 지원합니다.</span></p>';
                    setTimeout(startScanner, 3000);
                    return;
                }

                // 로또 6/45 유니버셜 파싱 (구분자 m이 없거나 다른 경우도 대비)
                // 패턴: 회차(숫자) + 구분자 + 번호들(12자리씩)
                const roundMatch = vData.match(/^(\d+)/);
                if (!roundMatch) {
                    qrReaderDiv.innerHTML = '<p style="padding: 20px; color: red;">회차 정보를 찾을 수 없는 QR입니다.</p>';
                    setTimeout(startScanner, 2000);
                    return;
                }

                const round = parseInt(roundMatch[1], 10);
                const games = [];

                // vData에서 12자리 숫자(로또 번호 6개) 패턴을 모두 찾음
                const gameMatches = vData.match(/\d{12}/g);

                if (gameMatches) {
                    gameMatches.forEach(gameStr => {
                        // 첫 번째 매치가 회차 번호를 포함한 일부일 수 있으므로 검증
                        // (보통 회차는 4자리이므로 12자리 숫자 세트와 확연히 구분됨)
                        if (gameStr !== roundMatch[1].padEnd(12, '0')) {
                            const nums = [];
                            for (let j = 0; j < 12; j += 2) {
                                const num = parseInt(gameStr.substring(j, j + 2), 10);
                                if (!isNaN(num) && num >= 1 && num <= 45) nums.push(num);
                            }
                            if (nums.length === 6) {
                                games.push(nums);
                            }
                        }
                    });
                }

                if (games.length > 0) {
                    addLottoTicket(round, games.slice(0, 5));
                    showSuccessModal(round, games.slice(0, 5));
                } else {
                    console.error("Number extraction failed for data:", vData);
                    qrReaderDiv.innerHTML = '<p style="padding: 20px; color: red;">번호 추출에 실패했습니다.<br><span style="font-size:12px;">올바른 로또 QR인지 확인해주세요.</span></p>';
                    setTimeout(startScanner, 3000);
                }
            }
        } else {
            // 로또 QR이 아닌 경우
            qrReaderDiv.innerHTML = '<p style="padding: 20px; color: red;">동행복권 로또 QR 코드가 아닙니다.</p>';
            setTimeout(startScanner, 2000);
        }
    }

    function showSuccessModal(round, games) {
        isModalOpen = true;

        // 모달 제목 및 스타일 변경 (등록 완료 안내)
        const modalHeader = scanResultModal.querySelector('.modal-header h3');
        modalHeader.innerHTML = '<i class="fas fa-check-circle" style="color: #10b981;"></i> 등록 완료!';
        
        scanRoundEl.textContent = round;
        scanGameCountEl.textContent = games.length;
        
        // 버튼 설정: "확인" 버튼만 보여주고 등록이 이미 되었음을 알림
        scanCancelBtn.classList.add('hidden');
        scanConfirmBtn.classList.remove('hidden');
        scanConfirmBtn.textContent = "확인";
        scanModalCloseBtn.classList.remove('hidden');

        scanPreviewContainer.innerHTML = '';
        games.forEach((game, idx) => {
            const gameRow = document.createElement('div');
            gameRow.className = 'scan-preview-row';
            gameRow.style.cssText = 'background: rgba(16, 185, 129, 0.05); padding: 10px; border-radius: 12px; border: 1px solid rgba(16, 185, 129, 0.2); margin-bottom: 8px;';
            
            const label = document.createElement('div');
            label.style.cssText = 'font-size: 11px; color: #10b981; font-weight: 800; margin-bottom: 5px;';
            label.textContent = `게임 ${String.fromCharCode(65 + idx)}`;
            gameRow.appendChild(label);

            const balls = document.createElement('div');
            balls.className = 'game-numbers';
            balls.style.justifyContent = 'center';
            game.forEach(num => {
                const ball = document.createElement('div');
                ball.className = `number-ball ball-${Math.ceil(num / 10)}`;
                ball.textContent = num;
                balls.appendChild(ball);
            });
            gameRow.appendChild(balls);
            scanPreviewContainer.appendChild(gameRow);
        });

        openModal(scanResultModal);
    }

    function closeScanResultModal() {
        closeModal(scanResultModal);
        isModalOpen = false;
        tempScannedData = null;
        
        // 스캐너 재개
        if (html5QrcodeScanner && html5QrcodeScanner.resume) {
            html5QrcodeScanner.resume();
        } else {
            startScanner();
        }
    }

    function onScanFailure(error) {
        // 무시 (계속 스캔 중)
    }

    // 데이터 관리 로직
    function addLottoTicket(round, games) {
        // 중복 체크
        const isExist = lottoData.some(ticket => ticket.round === round && JSON.stringify(ticket.games) === JSON.stringify(games));
        if (isExist) {
            alert("이미 등록된 로또입니다.");
            return;
        }

        const newTicket = {
            id: Date.now().toString(),
            round: round,
            games: games,
            timestamp: Date.now()
        };

        lottoData.unshift(newTicket);

        // DB 저장 (Supabase)
        if (_supabase) {
            const dbData = {
                id: newTicket.id,
                round: newTicket.round,
                games: newTicket.games,
                created_at: new Date().toISOString()
            };
            _supabase.from('lotto_tickets').insert([dbData]).then(({ error }) => {
                if (error) console.error("DB 저장 실패:", error);
            });
        }

        saveData();
        renderLottoList();
        
        // [추가] 추가 즉시 결과 확인 및 DB 동기화
        fetchWinningNumbersForRound(round).then(() => {
            syncWinResults();
        });
    }

    function saveData() {
        localStorage.setItem('myLottoData', JSON.stringify(lottoData));
        localStorage.setItem('winningNumbersCache', JSON.stringify(winningNumbersCache));
    }

    async function deleteTicket(id) {
        const ok = await customConfirm("이 로또 내역을 삭제하시겠습니까?");
        if (ok) {
            lottoData = lottoData.filter(t => t.id !== id);

            // DB 삭제
            if (_supabase) {
                const { error } = await _supabase.from('lotto_tickets').delete().eq('id', id);
                if (error) console.error("DB 삭제 실패:", error);
            }

            saveData();
            renderLottoList();
        }
    }

    // 전역으로 노출하여 HTML에서 호출 가능하도록
    window.deleteTicket = deleteTicket;

    // [최적화] 여러 회차의 당첨 번호를 한 번에 배치 조회하는 함수
    async function fetchMultipleWinningNumbers(rounds) {
        if (!_supabase || rounds.length === 0) return;

        // 로컬 캐시에 없는 회차들만 필터링
        const roundsToFetch = rounds.filter(r => !winningNumbersCache[r]);
        if (roundsToFetch.length === 0) return;

        console.log(`[Lotto] ${roundsToFetch.length}개의 새로운 회차 정보를 배치 조회합니다:`, roundsToFetch);

        try {
            const { data, error } = await _supabase
                .from('lotto_results')
                .select('*')
                .in('round', roundsToFetch);

            if (!error && data) {
                data.forEach(item => {
                    winningNumbersCache[item.round] = {
                        numbers: item.numbers,
                        bonus: item.bonus,
                        date: item.draw_date
                    };
                });
                saveData();
                console.log(`[Lotto] 배치 조회 완료: ${data.length}개 항목 업데이트됨`);
            }
        } catch (error) {
            console.error("배치 당첨 번호 조회 실패:", error);
        }
    }

    // [최적화] 확인된 결과를 DB에 영구 기록하는 함수
    async function syncWinResults() {
        if (!_supabase || lottoData.length === 0) return;

        const updates = [];
        lottoData.forEach(ticket => {
            // 결과가 아직 없고, 당첨 번호 정보는 있는 경우 계산 진행
            if (!ticket.win_results) {
                const winInfo = winningNumbersCache[ticket.round];
                if (winInfo) {
                    const results = ticket.games.map(game => checkRank(game, winInfo.numbers, winInfo.bonus));
                    ticket.win_results = results; // 로컬 데이터 업데이트
                    updates.push({ id: ticket.id, win_results: results });
                }
            }
        });

        if (updates.length > 0) {
            console.log(`[Lotto] ${updates.length}개의 티켓 결과를 DB에 기록합니다.`);
            try {
                // 하나씩 업데이트 (안전성 우선)
                for (const update of updates) {
                    await _supabase
                        .from('lotto_tickets')
                        .update({ win_results: update.win_results })
                        .eq('id', update.id);
                }
                localStorage.setItem('myLottoData', JSON.stringify(lottoData));
            } catch (e) {
                console.error("결과 DB 동기화 실패:", e);
            }
        }
    }

    // API 통신 및 당첨 확인 로직 (Supabase 캐싱 적용)
    async function fetchWinningNumbersForRound(round) {
        try {
            // 0. 로컬 캐시 먼저 확인
            if (winningNumbersCache[round]) {
                return;
            }

            // 1. Supabase DB에서 먼저 조회 (네트워크 캐싱 우선)
            if (_supabase) {
                const { data: dbData, error: dbError } = await _supabase
                    .from('lotto_results')
                    .select('*')
                    .eq('round', round)
                    .single();

                if (!dbError && dbData) {
                    console.log(`[Lotto] ${round}회차 데이터를 DB에서 불러왔습니다.`);
                    winningNumbersCache[round] = {
                        numbers: dbData.numbers,
                        bonus: dbData.bonus,
                        date: dbData.draw_date
                    };
                    saveData();
                    renderLottoList();
                    return;
                }
            }

            // 2. DB에 없는데 로컬 캐시에는 있다면? (DB로 업로드 시도)
            if (winningNumbersCache[round] && _supabase) {
                const cache = winningNumbersCache[round];
                await _supabase.from('lotto_results').upsert({
                    round: round,
                    numbers: cache.numbers,
                    bonus: cache.bonus,
                    draw_date: cache.date
                });
                console.log(`[Lotto] ${round}회차 로컬 데이터를 DB에 동기화했습니다.`);
                renderLottoList();
                return;
            }

            // 2. DB에 없으면 종료 (외부 API 호출 제거됨)
            console.log(`[Lotto] ${round}회차 정보가 DB에 없습니다.`);
        } catch (error) {
            console.error("당첨 번호 조회 실패:", error);
        }
    }

    refreshBtn.addEventListener('click', () => {
        refreshBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 업데이트 중...';

        // 유니크한 회차 목록 추출
        const rounds = [...new Set(lottoData.map(t => t.round))];
        const promises = rounds.map(r => fetchWinningNumbersForRound(r));

        Promise.all(promises).then(async () => {
            // 업데이트 직후 다시 한 번 결과 동기화
            await syncWinResults();
            setTimeout(() => {
                refreshBtn.innerHTML = '<i class="fas fa-sync-alt"></i> 최신 당첨결과 업데이트';
                renderLottoList();
            }, 500);
        });
    });

    // 렌더링 로직
    function getBallColorHex(num) {
        if (num <= 10) return "var(--ball-1)";
        if (num <= 20) return "var(--ball-2)";
        if (num <= 30) return "var(--ball-3)";
        if (num <= 40) return "var(--ball-4)";
        return "var(--ball-5)";
    }

    function checkRank(myNums, winNums, bonusNum) {
        const matchCount = myNums.filter(n => winNums.includes(n)).length;
        const hasBonus = myNums.includes(bonusNum);

        if (matchCount === 6) return { rank: 1, text: "1등", color: "#FFD700", class: "status-win" };
        if (matchCount === 5 && hasBonus) return { rank: 2, text: "2등", color: "#FFD700", class: "status-win" };
        if (matchCount === 5) return { rank: 3, text: "3등", color: "#FFD700", class: "status-win" };
        if (matchCount === 4) return { rank: 4, text: "4등", color: "#FFD700", class: "status-win" };
        if (matchCount === 3) return { rank: 5, text: "5등", color: "#FFD700", class: "status-win" };
        return { rank: 0, text: "낙첨", color: "#999", class: "status-lose" };
    }

    function renderLottoList() {
        if (lottoData.length === 0) {
            lottoListContainer.innerHTML = `
                <div style="text-align:center; padding: 40px 0; color: var(--text-muted);">
                    <i class="fas fa-ticket-alt" style="font-size: 40px; margin-bottom: 16px; opacity: 0.5;"></i>
                    <p>등록된 로또가 없습니다.</p>
                    <p style="font-size: 14px; margin-top: 8px;">스캔 탭에서 QR코드를 인식해보세요!</p>
                </div>
            `;
            totalGamesEl.textContent = '0';
            winningGamesEl.textContent = '0';
            return;
        }

        let totalGamesCount = 0;
        let winCount = 0;
        lottoListContainer.innerHTML = '';

        lottoData.forEach(ticket => {
            const winInfo = winningNumbersCache[ticket.round];
            let ticketHtml = `
                <div class="ticket-card">
                    <button class="delete-btn" onclick="deleteTicket('${ticket.id}')" title="삭제"><i class="fas fa-minus"></i></button>
                    <div class="ticket-header">
                        <div class="ticket-round">제${ticket.round}회</div>
                        <div class="ticket-status ${winInfo ? '' : 'status-waiting'}">
                            ${winInfo ? `<span style="font-size: 11px; margin-right: 5px;">${winInfo.date}</span> 추첨 완료` : '추첨 대기중'}
                        </div>
                    </div>
            `;

            ticket.games.slice(0, 5).forEach((game, index) => {
                totalGamesCount++;
                const labels = ['A', 'B', 'C', 'D', 'E'];

                let resultObj = null;
                
                // 1. DB에 이미 저장된 결과가 있는지 확인
                if (ticket.win_results && ticket.win_results[index]) {
                    resultObj = ticket.win_results[index];
                } 
                // 2. 저장된 결과가 없다면 실시간 계산 (winInfo가 있을 때만)
                else if (winInfo) {
                    resultObj = checkRank(game, winInfo.numbers, winInfo.bonus);
                }

                if (resultObj && resultObj.rank > 0) winCount++;

                let gameHtml = `<div class="game-row">
                    <div class="game-label">${labels[index] || '-'}</div>
                    <div class="game-numbers">`;

                game.forEach(num => {
                    let isMatched = false;
                    let isBonusMatched = false;

                    if (winInfo) {
                        isMatched = winInfo.numbers.includes(num);
                        isBonusMatched = (!isMatched && winInfo.bonus === num);
                    }

                    const bgColor = getBallColorHex(num);
                    
                    // 보너스 번호는 2등일 때만 당첨 스타일(matched) 적용
                    const isWinningMatch = isMatched || (isBonusMatched && resultObj && resultObj.rank === 2);
                    const matchedClass = isWinningMatch ? 'matched' : '';
                    
                    // 당첨되지 않은 번호나 2등이 아닌 보너스 번호는 투명도 낮춤 (낙첨 처리)
                    const opacity = isWinningMatch ? 1 : (winInfo ? 0.3 : 1);
                    const inlineStyle = `background-color: ${bgColor}; opacity: ${opacity};`;

                    gameHtml += `<div class="number-ball ${matchedClass}" style="${inlineStyle}">${num}</div>`;
                });

                gameHtml += `</div>
                    <div class="game-result ${resultObj ? resultObj.class : ''}">
                        ${resultObj && resultObj.rank > 0
                        ? `<div class="rank-badge" style="color: ${resultObj.color};">
                                <i class="fas fa-certificate badge-icon"></i>
                                <span class="badge-num">${resultObj.text}</span>
                               </div>`
                        : `<span style="color: ${resultObj ? resultObj.color : '#999'};">${resultObj ? resultObj.text : ''}</span>`}
                    </div>
                </div>`;

                ticketHtml += gameHtml;
            });

            ticketHtml += `</div>`;
            lottoListContainer.insertAdjacentHTML('beforeend', ticketHtml);
        });

        totalGamesEl.textContent = totalGamesCount;
        winningGamesEl.textContent = winCount;
    }

    // 최신 당첨 번호 섹션 업데이트
    function getLatestRound() {
        const firstDrawDate = new Date('2002-12-07');
        const today = new Date();
        const diffTime = Math.abs(today - firstDrawDate);
        const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
        let round = Math.floor(diffDays / 7) + 1;

        const day = today.getDay(); // 0(일)~6(토)
        const hours = today.getHours();
        const minutes = today.getMinutes();

        // 토요일 20:45분 추첨 결과 발표 전까지는 이전 회차를 최신으로 간주
        // (기존 day < 6 조건이 일요일~금요일까지 모두 감소시켜버리는 버그가 있어 수정함)
        if (day === 6 && (hours < 20 || (hours === 20 && minutes < 45))) {
            round -= 1;
        }
        return round;
    }

    async function updateLatestLottoResult() {
        const initialRound = getLatestRound();
        const roundTitleEl = document.getElementById('latest-round-title');
        const container = document.getElementById('latest-numbers-container');
        const dateEl = document.getElementById('latest-date');

        if (!roundTitleEl || !container) return;
        
        // 초기 로딩 상태 표시
        container.innerHTML = '<div style="grid-column: span 7; padding: 10px; opacity: 0.5;"><i class="fas fa-spinner fa-spin"></i> 분석 중...</div>';

        async function tryFetchResult(round, attempt = 0) {
            // 1. 캐시 확인
            if (winningNumbersCache[round]) {
                const cache = winningNumbersCache[round];
                renderFormattedNumbers({
                    draw_no: round,
                    draw_date: cache.date,
                    numbers: cache.numbers,
                    bonus: cache.bonus
                }, container, dateEl, roundTitleEl);
                return;
            }

            // 2. DB 확인 (로컬 캐시에 없을 경우)
            if (_supabase) {
                const { data: dbData, error: dbError } = await _supabase
                    .from('lotto_results')
                    .select('*')
                    .eq('round', round)
                    .single();

                if (!dbError && dbData) {
                    winningNumbersCache[round] = {
                        numbers: dbData.numbers,
                        bonus: dbData.bonus,
                        date: dbData.draw_date
                    };
                    saveData();
                    renderFormattedNumbers({
                        draw_no: round,
                        draw_date: dbData.draw_date,
                        numbers: dbData.numbers,
                        bonus: dbData.bonus
                    }, container, dateEl, roundTitleEl);
                    return;
                }
            }

            // 3. 종료 조건 (너무 많이 내려가거나 1회 미만일 때)
            if (attempt > 10 || round < 1) {
                container.innerHTML = '<p style="font-size: 13px; color: var(--text-muted); grid-column: span 7;">DB에 등록된 최근 당첨 정보가 없습니다.</p>';
                roundTitleEl.textContent = '-';
                return;
            }

            try {
                // 외부 API 호출 제거됨 -> 바로 이전 회차 시도
                await tryFetchResult(round - 1, attempt + 1);
            } catch (error) {
                console.warn(`Fetch error for round ${round}, retrying...`, error);
                await tryFetchResult(round - 1, attempt + 1);
            }
        }

        await tryFetchResult(initialRound);
    }

    function renderFormattedNumbers(lottoResult, container, dateEl, roundTitleEl) {
        roundTitleEl.textContent = lottoResult.draw_no;
        container.innerHTML = '';

        lottoResult.numbers.forEach(num => {
            const bgColor = getBallColorHex(num);
            container.innerHTML += `<div class="number-ball matched" style="background-color: ${bgColor};">${num}</div>`;
        });

        container.innerHTML += `<div style="font-size: 18px; color: var(--text-muted); display: flex; align-items: center; margin: 0 5px;">+</div>`;
        const bonusColor = getBallColorHex(lottoResult.bonus);
        container.innerHTML += `<div class="number-ball matched" style="background-color: ${bonusColor};">${lottoResult.bonus}</div>`;

        dateEl.textContent = lottoResult.draw_date === "최신" ? "추첨 완료" : `${lottoResult.draw_date} 추첨`;
    }

    function renderLatestNumbers(lottoResult, round, container, dateEl, roundTitleEl) {
        roundTitleEl.textContent = round;
        const winNums = [
            lottoResult.drwtNo1, lottoResult.drwtNo2, lottoResult.drwtNo3,
            lottoResult.drwtNo4, lottoResult.drwtNo5, lottoResult.drwtNo6
        ];
        const bonusNum = lottoResult.bnusNo;

        container.innerHTML = '';
        winNums.forEach(num => {
            const bgColor = getBallColorHex(num);
            container.innerHTML += `<div class="number-ball matched" style="background-color: ${bgColor};">${num}</div>`;
        });

        container.innerHTML += `<div style="font-size: 18px; color: var(--text-muted); display: flex; align-items: center; margin: 0 5px;">+</div>`;
        const bonusColor = getBallColorHex(bonusNum);
        container.innerHTML += `<div class="number-ball matched" style="background-color: ${bonusColor};">${bonusNum}</div>`;

        dateEl.textContent = `${lottoResult.drwNoDate} 추첨`;
    }

    // 젬마 추천 번호 생성 로직
    const gemmaPicksContainer = document.getElementById('gemma-picks-container');
    const refreshGemmaBtn = document.getElementById('refresh-gemma-picks-btn');

    function generateGemmaPicks() {
        if (!gemmaPicksContainer) return;

        gemmaPicksContainer.innerHTML = '';
        const labels = ['A', 'B', 'C', 'D', 'E'];

        for (let i = 0; i < 5; i++) {
            // 1~45 중 6개 랜덤 추출
            const numbers = [];
            while (numbers.length < 6) {
                const num = Math.floor(Math.random() * 45) + 1;
                if (!numbers.includes(num)) {
                    numbers.push(num);
                }
            }
            numbers.sort((a, b) => a - b);

            let gameHtml = `
                <div class="game-row" style="background: rgba(255, 71, 87, 0.05); padding: 12px 20px; border-radius: 12px; border: 1px solid rgba(255, 71, 87, 0.1); margin-bottom: 0; display: flex; justify-content: center; gap: 15px;">
                    <div class="game-label" style="font-weight: 800; color: var(--primary-color); width: auto; font-size: 16px;">${labels[i]}</div>
                    <div class="game-numbers" style="flex: none; justify-content: center; gap: 8px;">
            `;

            numbers.forEach(num => {
                const bgColor = getBallColorHex(num);
                gameHtml += `<div class="number-ball matched" style="background-color: ${bgColor};">${num}</div>`;
            });

            gameHtml += `</div></div>`;
            gemmaPicksContainer.insertAdjacentHTML('beforeend', gameHtml);
        }
    }

    if (refreshGemmaBtn) {
        refreshGemmaBtn.addEventListener('click', () => {
            refreshGemmaBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 행운 번호 분석 중...';
            refreshGemmaBtn.disabled = true;

            setTimeout(() => {
                generateGemmaPicks();
                refreshGemmaBtn.innerHTML = '<i class="fas fa-magic"></i> 번호 다시 뽑기';
                refreshGemmaBtn.disabled = false;
            }, 800);
        });
    }

    // 연금복권 크롤링 로직
    async function updatePensionResult() {
        const container = document.getElementById('pension-result-container');
        const roundTitleEl = document.getElementById('pension-round-title');
        const dateEl = document.getElementById('pension-date');

        if (!container) return;

        container.innerHTML = '<div style="text-align:center; padding: 30px;"><i class="fas fa-spinner fa-spin"></i> 실시간 당첨 정보 분석 중...</div>';

        try {
            const url = 'https://www.dhlottery.co.kr/pt720/intro';
            const proxyUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(url)}&timestamp=${Date.now()}`;

            const response = await fetch(proxyUrl);
            const data = await response.json();
            const html = data.contents;

            const parser = new DOMParser();
            const doc = parser.parseFromString(html, 'text/html');

            // 1. 회차 정보 추출
            const roundText = doc.querySelector('.win_result strong')?.innerText || "";
            const roundMatch = roundText.match(/\d+/);
            const round = roundMatch ? roundMatch[0] : "";

            // 2. 날짜 정보 추출
            const dateText = doc.querySelector('.win_result .date')?.innerText || "";

            // 3. 당첨 번호 추출 (1등)
            // 연금복권 번호는 .win720_num 또는 테이블 구조에 있음
            // 블로그 분석에 따르면 tbody tr의 첫번째 행에 1등 번호가 있음
            const rows = doc.querySelectorAll('.tbl_data tbody tr');
            if (rows.length === 0) throw new Error("데이터 구조를 찾을 수 없습니다.");

            const firstRankNums = Array.from(rows[0].querySelectorAll('span.num span')).map(s => s.innerText);
            const bonusNums = Array.from(rows[7].querySelectorAll('span.num span')).map(s => s.innerText);

            if (firstRankNums.length < 7) throw new Error("당첨 번호 개수가 부족합니다.");

            // UI 렌더링
            roundTitleEl.textContent = `(${round}회)`;
            dateEl.textContent = dateText.replace('(', '').replace(')', '');

            const group = firstRankNums[0];
            const numbers = firstRankNums.slice(1);

            let resultHtml = `
                <div class="pension-row">
                    <div class="pension-label">1등 당첨번호</div>
                    <div class="pension-balls">
                        <div class="pension-group">${group}조</div>
                        ${numbers.map(n => `<div class="pension-ball ball-p-${n}">${n}</div>`).join('')}
                    </div>
                </div>
                <div class="pension-row" style="background: rgba(243, 156, 18, 0.05); border-color: rgba(243, 156, 18, 0.1);">
                    <div class="pension-label" style="color: #d35400;">보너스 번호</div>
                    <div class="pension-balls">
                        <div class="pension-group" style="visibility: hidden; width: 0; padding: 0; margin: 0;"></div>
                        ${bonusNums.map(n => `<div class="pension-ball ball-p-${n}">${n}</div>`).join('')}
                    </div>
                    <div class="pension-bonus-label">각 조별 동일 번호 당첨 시</div>
                </div>
            `;

            container.innerHTML = resultHtml;

        } catch (error) {
            console.error("연금복권 조회 실패:", error);
            container.innerHTML = `
                <div style="text-align:center; padding: 20px; color: #e74c3c;">
                    <i class="fas fa-exclamation-triangle"></i><br>
                    정보를 불러오지 못했습니다.<br>
                    <span style="font-size:12px; opacity:0.7;">동행복권 사이트 점검 중이거나 일시적 오류일 수 있습니다.</span>
                    <button onclick="location.reload()" style="display:block; margin: 15px auto; padding: 8px 15px; border-radius: 20px; border: 1px solid #e74c3c; background: none; color: #e74c3c;">다시 시도</button>
                </div>
            `;
        }
    }

    // 모달 공통 로직
    function openModal(modal) {
        if (!modal) return;
        modal.classList.remove('hidden');
        document.body.classList.add('no-scroll');
    }

    function closeModal(modal) {
        if (!modal) return;
        modal.classList.add('hidden');
        document.body.classList.remove('no-scroll');
    }

    function customConfirm(message) {
        return new Promise((resolve) => {
            const modal = document.getElementById('confirm-modal');
            const msgEl = document.getElementById('confirm-message');
            const okBtn = document.getElementById('confirm-ok');
            const cancelBtn = document.getElementById('confirm-cancel');

            if (!modal || !msgEl || !okBtn || !cancelBtn) {
                resolve(confirm(message));
                return;
            }

            msgEl.innerText = message;
            openModal(modal);

            const onOk = () => {
                cleanup();
                resolve(true);
            };

            const onCancel = () => {
                cleanup();
                resolve(false);
            };

            const cleanup = () => {
                okBtn.removeEventListener('click', onOk);
                cancelBtn.removeEventListener('click', onCancel);
                closeModal(modal);
            };

            okBtn.addEventListener('click', onOk);
            cancelBtn.addEventListener('click', onCancel);

            // 배경 클릭 시 취소 처리
            modal.addEventListener('click', (e) => {
                if (e.target === modal) onCancel();
            }, { once: true });
        });
    }

    // 초기 로드 시퀀스 최적화
    initLottoApp().then(() => {
        updateLatestLottoResult();
        generateGemmaPicks(); // 초기 젬마 추천 생성
    });

    // --- Pull to Refresh 로직 (아이폰 캐시 방지용) ---
    let touchStart = 0;
    let touchMove = 0;
    const threshold = 120;

    window.addEventListener('touchstart', (e) => {
        if (window.scrollY <= 1) touchStart = e.touches[0].screenY;
        else touchStart = 0;
    }, { passive: true });

    window.addEventListener('touchmove', (e) => {
        if (touchStart === 0) return;
        const ptrIndicator = document.getElementById('ptr-indicator');
        if (!ptrIndicator) return;

        touchMove = e.touches[0].screenY;
        const distance = touchMove - touchStart;
        if (distance > 0 && window.scrollY <= 1) {
            const pull = Math.pow(Math.min(distance, threshold * 2), 0.8) * 2;
            ptrIndicator.style.transform = `translateY(${pull}px)`;
            const icon = ptrIndicator.querySelector('i');
            if (distance > threshold) icon.style.color = 'var(--secondary-color, #ee5253)';
            else icon.style.color = 'var(--primary-color)';
        }
    }, { passive: true });

    window.addEventListener('touchend', () => {
        const ptrIndicator = document.getElementById('ptr-indicator');
        if (!ptrIndicator) return;

        const distance = touchMove - touchStart;
        if (distance > threshold && window.scrollY <= 1) {
            ptrIndicator.style.transform = `translateY(80px)`;
            if (window.navigator.vibrate) window.navigator.vibrate(50);
            setTimeout(() => { window.location.reload(true); }, 300);
        } else {
            ptrIndicator.style.transform = 'translateY(0)';
        }
        touchStart = 0;
        touchMove = 0;
    });
});

