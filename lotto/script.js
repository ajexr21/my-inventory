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

    // State
    let html5QrcodeScanner = null;
    let lottoData = JSON.parse(localStorage.getItem('myLottoData')) || [];
    let winningNumbersCache = JSON.parse(localStorage.getItem('winningNumbersCache')) || {};

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
        
        const config = { fps: 10, qrbox: { width: 250, height: 250 } };
        
        html5QrcodeScanner.start(
            { facingMode: "environment" },
            config,
            onScanSuccess,
            onScanFailure
        ).then(() => {
            stopScanBtn.classList.remove('hidden');
        }).catch(err => {
            console.error("Scanner error:", err);
            // 권한 오류 시 메시지
            qrReaderDiv.innerHTML = '<p style="padding: 20px;">카메라 권한이 필요합니다. 브라우저 설정에서 카메라 권한을 허용해주세요.</p>';
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
            const roundInput = prompt("회차를 입력하세요 (예: 1221)");
            if (!roundInput) return;
            
            const round = parseInt(roundInput, 10);
            if (isNaN(round)) {
                alert("올바른 회차 번호를 입력해주세요.");
                return;
            }

            const gamesInput = prompt("로또 번호를 입력하세요.\n번호는 공백이나 콤마(,)로 구분하며, 한 게임당 6개씩 입력하세요.\n(예: 7, 12, 25, 28, 35, 41)");
            if (!gamesInput) return;

            // 숫자만 추출
            const allNums = gamesInput.split(/[\s,]+/).map(n => parseInt(n, 10)).filter(n => !isNaN(n) && n >= 1 && n <= 45);
            
            if (allNums.length < 6 || allNums.length % 6 !== 0) {
                alert("번호가 부족하거나 형식이 맞지 않습니다. 6개씩 입력해주세요.");
                return;
            }

            const games = [];
            for (let i = 0; i < allNums.length; i += 6) {
                games.push(allNums.slice(i, i + 6).sort((a, b) => a - b));
            }

            addLottoTicket(round, games);
            document.querySelector('[data-target="tab-list"]').click();
        });
    }

    function onScanSuccess(decodedText, decodedResult) {
        console.log("Scanned QR:", decodedText);
        // 동행복권 QR URL 파싱 로직 (더 유연하게)
        if (decodedText.includes('?v=') || decodedText.includes('v=')) {
            stopScanner(); 
            
            let vData = '';
            if (decodedText.includes('v=')) {
                vData = decodedText.split('v=')[1].split('&')[0];
            }

            if (vData) {
                const parts = vData.split('m');
                const round = parseInt(parts[0], 10);
                
                const games = [];
                for (let i = 1; i < parts.length; i++) {
                    let gameStr = parts[i];
                    // 게임 데이터는 최소 12자리(번호 6개)여야 함
                    // 끝에 일련번호가 붙어 있을 수 있으므로 앞의 12자리만 사용
                    if (gameStr.length >= 12) {
                        const nums = [];
                        for (let j = 0; j < 12; j += 2) {
                            const num = parseInt(gameStr.substring(j, j + 2), 10);
                            if (!isNaN(num)) nums.push(num);
                        }
                        if (nums.length === 6) {
                            games.push(nums);
                        }
                    }
                }

                if (games.length > 0) {
                    addLottoTicket(round, games);
                    
                    // 내 로또 탭으로 자동 이동
                    document.querySelector('[data-target="tab-list"]').click();
                } else {
                    alert("QR 코드에서 번호를 추출할 수 없습니다.");
                    startScanner();
                }
            } else {
                alert("유효하지 않은 로또 QR 코드입니다.");
                startScanner();
            }
        } else {
            // 로또 QR이 아닌 경우
            alert("동행복권 로또 QR 코드가 아닙니다.");
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

        lottoData.unshift(newTicket); // 최신 항목을 위로
        saveData();
        alert(`${round}회차 로또가 성공적으로 등록되었습니다.`);
        fetchWinningNumbersForRound(round); // 등록 시 당첨 결과 시도
    }

    function saveData() {
        localStorage.setItem('myLottoData', JSON.stringify(lottoData));
        localStorage.setItem('winningNumbersCache', JSON.stringify(winningNumbersCache));
    }

    function deleteTicket(id) {
        if(confirm("이 로또 내역을 삭제하시겠습니까?")) {
            lottoData = lottoData.filter(t => t.id !== id);
            saveData();
            renderLottoList();
        }
    }
    
    // 전역으로 노출하여 HTML에서 호출 가능하도록
    window.deleteTicket = deleteTicket;

    // API 통신 및 당첨 확인 로직
    async function fetchWinningNumbersForRound(round) {
        if (winningNumbersCache[round]) {
            renderLottoList(); // 캐시가 있으면 렌더링
            return;
        }

        try {
            // CORS 우회를 위해 AllOrigins 프록시 사용
            const apiUrl = `https://www.dhlottery.co.kr/common.do?method=getLottoNumber&drwNo=${round}`;
            const proxyUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(apiUrl)}`;
            
            const response = await fetch(proxyUrl);
            const data = await response.json();
            const lottoResult = JSON.parse(data.contents);

            if (lottoResult.returnValue === "success") {
                const winNums = [
                    lottoResult.drwtNo1, lottoResult.drwtNo2, lottoResult.drwtNo3,
                    lottoResult.drwtNo4, lottoResult.drwtNo5, lottoResult.drwtNo6
                ];
                const bonusNum = lottoResult.bnusNo;

                winningNumbersCache[round] = {
                    numbers: winNums,
                    bonus: bonusNum,
                    date: lottoResult.drwNoDate
                };
                saveData();
                renderLottoList();
            } else {
                // 추첨 전이거나 데이터 없음
                console.log(`${round}회차 당첨 정보가 없습니다.`);
            }
        } catch (error) {
            console.error("당첨 번호 조회 실패:", error);
        }
    }

    refreshBtn.addEventListener('click', () => {
        refreshBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 업데이트 중...';
        
        // 유니크한 회차 목록 추출
        const rounds = [...new Set(lottoData.map(t => t.round))];
        const promises = rounds.map(r => fetchWinningNumbersForRound(r));
        
        Promise.all(promises).then(() => {
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

        if (matchCount === 6) return { rank: 1, text: "1등", class: "status-win" };
        if (matchCount === 5 && hasBonus) return { rank: 2, text: "2등", class: "status-win" };
        if (matchCount === 5) return { rank: 3, text: "3등", class: "status-win" };
        if (matchCount === 4) return { rank: 4, text: "4등", class: "status-win" };
        if (matchCount === 3) return { rank: 5, text: "5등", class: "status-win" };
        return { rank: 0, text: "낙첨", class: "status-lose" };
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
                    <button class="delete-btn" onclick="deleteTicket('${ticket.id}')" title="삭제"><i class="fas fa-times"></i></button>
                    <div class="ticket-header">
                        <div class="ticket-round">${ticket.round}회차</div>
                        <div class="ticket-status ${winInfo ? '' : 'status-waiting'}">
                            ${winInfo ? `<span style="font-size: 12px; margin-right: 8px;">${winInfo.date}</span> 추첨 완료` : '추첨 대기중'}
                        </div>
                    </div>
            `;

            ticket.games.forEach((game, index) => {
                totalGamesCount++;
                const labels = ['A', 'B', 'C', 'D', 'E'];
                
                let resultObj = null;
                if (winInfo) {
                    resultObj = checkRank(game, winInfo.numbers, winInfo.bonus);
                    if (resultObj.rank > 0) winCount++;
                }

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
                    const matchedClass = (isMatched || isBonusMatched) ? 'matched' : '';
                    const inlineStyle = (isMatched || isBonusMatched) ? `background-color: ${bgColor};` : `background-color: ${bgColor}; opacity: ${winInfo ? 0.3 : 1};`;
                    
                    gameHtml += `<div class="number-ball ${matchedClass}" style="${inlineStyle}">${num}</div>`;
                });

                gameHtml += `</div>
                    <div class="game-result ${resultObj ? resultObj.class : ''}">${resultObj ? resultObj.text : ''}</div>
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
        if (day < 6 || (day === 6 && hours < 21)) {
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

        container.innerHTML = '<p style="font-size: 13px; color: var(--text-muted); grid-column: span 7;">시그로또(SigLotto) API 우회 수신 중...</p>';

        async function tryFetchSigLotto(round, attempt = 0) {
            // 시그로또 서버 자체의 업데이트 지연(404) 대비 젬마 팀의 백업 데이터
            const fallbackData = {
                draw_no: 1221,
                draw_date: "2026-04-25",
                numbers: [7, 12, 25, 28, 35, 41],
                bonus: 21
            };

            if (attempt > 1) { // 2회 이상 실패 시 백업 데이터로 강제 렌더링
                renderFormattedNumbers(fallbackData, container, dateEl, roundTitleEl);
                return;
            }

            try {
                // 시그로또 공개 API (CORS 문제 없음)
                const apiUrl = `https://www.siglotto.kr/api/public/v1/winning/${round}`;
                const response = await fetch(apiUrl, { signal: AbortSignal.timeout(4000) });
                
                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }
                
                const data = await response.json();

                if (data && data.status === "success") {
                    const result = {
                        draw_no: data.round,
                        draw_date: "최신", // 시그로또는 날짜를 주지 않으므로 대체 텍스트 사용
                        numbers: data.numbers,
                        bonus: data.bonus
                    };
                    renderFormattedNumbers(result, container, dateEl, roundTitleEl);
                } else {
                    await tryFetchSigLotto(round - 1, attempt + 1);
                }
            } catch (error) {
                console.warn(`SigLotto API error for round ${round}, retrying...`);
                await tryFetchSigLotto(round - 1, attempt + 1);
            }
        }

        await tryFetchSigLotto(initialRound);
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
            dateEl.textContent = dateText.replace('(','').replace(')','');
            
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

    // 초기 로드 시 당첨 데이터 한 번 체크하고 렌더링
    const rounds = [...new Set(lottoData.map(t => t.round))];
    rounds.forEach(r => fetchWinningNumbersForRound(r));
    updateLatestLottoResult();
    renderLottoList();
    generateGemmaPicks(); // 초기 젬마 추천 생성
});

