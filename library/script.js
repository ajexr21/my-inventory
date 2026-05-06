document.addEventListener('DOMContentLoaded', () => {
    // 1. UI Elements
    const tabBtns = document.querySelectorAll('.tab-btn');
    const tabContents = document.querySelectorAll('.tab-content');
    const bookListContainer = document.getElementById('book-list');
    const totalBooksEl = document.getElementById('total-books');
    const goalProgressEl = document.getElementById('goal-progress');
    const remainingBooksEl = document.getElementById('remaining-books');
    const themeToggleBtn = document.getElementById('theme-toggle');
    const navScanBtn = document.getElementById('nav-scan-btn');
    const stopScanBtn = document.getElementById('stop-scan-btn');
    const stampGrid = document.getElementById('stamp-grid');
    const filterBtns = document.querySelectorAll('.filter-btn');
    
    // 직접 입력 관련
    const manualInputBtn = document.getElementById('manual-input-btn');
    const manualModal = document.getElementById('manual-modal');
    const closeManualBtn = document.querySelector('.close-manual');
    const saveManualBtn = document.getElementById('save-manual-btn');
    
    // 2. Global Modal Helpers (우리집 시리즈 표준)
    window.openModal = (modal) => {
        if (!modal) return;
        modal.classList.remove('hidden');
        document.body.style.overflow = 'hidden';
    };
    
    window.closeModal = (modal) => {
        if (!modal) return;
        modal.classList.add('hidden');
        document.body.style.overflow = '';
    };

    // 로딩 처리 (재미있는 문구 순환)
    let loadingInterval = null;
    const loadingMessages = [
        "알라딘 지니가 요술 램프를 닦으며<br>책을 찾고 있어요! 🧞‍♂️",
        "카카오 라이언이 도서관 사다리에<br>조심조심 올라갔어요! 🦁",
        "알라딘 서점에서 가장 깨끗한<br>책 정보를 가져오는 중... 📖",
        "잠시만요! 카카오 친구들이<br>책 제목을 받아 적고 있어요. ✍️",
        "교은이의 멋진 서재에 넣을<br>준비를 하고 있어요! ✨",
        "거의 다 됐어요! 책장의<br>먼지를 탈탈 털어내고 있어요. 🧹"
    ];

    window.showLoading = () => {
        const msgEl = document.getElementById('loading-status-msg');
        let idx = 0;
        
        if (msgEl) msgEl.innerHTML = loadingMessages[0];
        
        window.openModal(document.getElementById('loading-modal'));
        
        loadingInterval = setInterval(() => {
            idx = (idx + 1) % loadingMessages.length;
            if (msgEl) {
                msgEl.style.opacity = 0;
                setTimeout(() => {
                    msgEl.innerHTML = loadingMessages[idx];
                    msgEl.style.opacity = 1;
                }, 300);
            }
        }, 2500);
    };

    window.hideLoading = () => {
        if (loadingInterval) clearInterval(loadingInterval);
        window.closeModal(document.getElementById('loading-modal'));
    };

    window.updateLoadingMsg = (msg) => {
        const msgEl = document.getElementById('loading-status-msg');
        if (msgEl) {
            msgEl.style.opacity = 0;
            setTimeout(() => {
                msgEl.innerHTML = msg;
                msgEl.style.opacity = 1;
            }, 300);
        }
    };

    // 3. State
    let _supabase = null;
    let books = [];
    let html5QrcodeScanner = null;
    let currentGoal = 10;
    
    // 3. Supabase 초기화
    async function initApp() {
        try {
            _supabase = supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);
            
            // 세션 체크 추가
            const { data: { session } } = await _supabase.auth.getSession();
            if (!session) {
                window.location.href = '../login.html';
                return;
            }

            await fetchBooks();
            
            // 실시간 구독
            _supabase.channel('library-changes')
                .on('postgres_changes', { event: '*', schema: 'public', table: 'library_books' }, () => {
                    fetchBooks();
                })
                .subscribe();
                
        } catch (error) {
            console.error("초기화 에러:", error);
            // 더 이상 사용자에게 알림창을 띄우지 않도록 주석 처리
            // await window.customAlert("서버 연결에 실패했어요. 나중에 다시 시도해 주세요!", "오류");
        }
    }

    // 4. 데이터 가져오기
    async function fetchBooks() {
        if (!_supabase) return;
        
        const { data, error } = await _supabase
            .from('library_books')
            .select('*')
            .order('created_at', { ascending: false });
            
        if (!error) {
            books = data;
            renderBooks();
            updateStats();
            renderStamps();
        }
    }

    // 5. 독서 목록 렌더링
    function renderBooks(filterStatus = 'all') {
        let filteredBooks = books;
        if (filterStatus !== 'all') {
            filteredBooks = books.filter(b => b.status === filterStatus);
        }

        if (filteredBooks.length === 0) {
            const emptyMsg = filterStatus === 'all' 
                ? "아직 등록된 책이 없어요.<br>바코드로 책을 등록해볼까요?" 
                : (filterStatus === 'reading' ? "지금 읽고 있는 책이 없어요." : "다 읽은 책이 아직 없어요.");
                
            bookListContainer.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-book-medical"></i>
                    <p>${emptyMsg}</p>
                </div>`;
            return;
        }

        bookListContainer.innerHTML = filteredBooks.map(book => {
            const hasCover = book.cover_url && book.cover_url.trim() !== '';
            
            return `
            <div class="book-card" onclick="openBookDetail('${book.id}')" style="position: relative;">
                <div class="book-cover-area">
                    ${hasCover ? 
                        `<img src="${book.cover_url}" class="book-cover" alt="${book.title}">` : 
                        `<div class="no-cover-placeholder">
                            <i class="fas fa-book"></i>
                            <span>이미지 없음</span>
                        </div>`
                    }
                    <div class="status-badge" style="background: ${getStatusColor(book.status, book.read_count)}">
                        ${getStatusText(book.status, book.read_count)}
                    </div>
                    ${book.read_count > 0 ? `
                        <div class="read-count-badge">
                            <i class="fas fa-book" style="margin-right: 4px;"></i>x${book.read_count}
                        </div>
                    ` : ''}
                    ${book.status === 'reading' && book.current_page ? `
                        <div class="page-badge">
                            <i class="fas fa-bookmark" style="margin-right: 4px;"></i>p.${book.current_page}
                        </div>
                    ` : ''}
                </div>
                <div class="book-info">
                    <h3 class="book-title">${book.title}</h3>
                    <p class="book-author">${book.author || '작가 미상'}</p>
                </div>
            </div>
            `;
        }).join('');
    }

    function getStatusText(status, readCount = 0) {
        if (status === 'finished') {
            const finishedMessages = [
                '다 읽었어요 ✨',   // 1회
                '또 읽었어요 😊',   // 2회
                '또 읽음! 대단 👍', // 3회
                '또또! 읽음 💖',    // 4회
                '훌륭해요 👏',     // 5회
                '외웠어요? 😲',    // 6회
                '엄청나군요 🔥',    // 7회
                '칭찬해요 🥰',     // 8회
                '독서대장 🎖️',     // 9회
                '독서왕 👑'        // 10회 이상
            ];
            const index = Math.min(Math.max(readCount - 1, 0), finishedMessages.length - 1);
            return finishedMessages[index];
        }
        const map = { 'want': '읽고 싶어요', 'reading': '읽고 있어요 📖' };
        return map[status] || status;
    }

    function getStatusColor(status, readCount = 0) {
        if (status === 'finished') {
            if (readCount >= 10) return 'linear-gradient(135deg, #FFD700, #FFA500)'; // 골드
            if (readCount >= 7) return 'linear-gradient(135deg, #FF6B6B, #EE5253)';  // 레드 계열
            if (readCount >= 4) return 'linear-gradient(135deg, #A78BFA, #8B5CF6)';  // 퍼플 계열
            if (readCount >= 2) return 'linear-gradient(135deg, #60A5FA, #3B82F6)';  // 블루 계열
            return 'rgba(0, 0, 0, 0.6)';
        }
        const map = { 'want': 'rgba(255, 255, 255, 0.1)', 'reading': 'rgba(122, 215, 240, 0.4)' };
        return map[status] || 'rgba(0, 0, 0, 0.5)';
    }

    // 6. 통계 업데이트
    function updateStats() {
        // 누적 읽은 횟수 합계 (N회독 포함, 숫자 타입 강제)
        const totalReads = books.reduce((acc, b) => acc + Number(b.read_count || 0), 0);
        
        // 10권 단위로 목표 자동 갱신 (10, 20, 30...)
        currentGoal = Math.ceil((totalReads + 1) / 10) * 10;

        // 식물 성장 로직 (누적 횟수 기반)
        updatePlantGrowth(totalReads);
    }

    function updatePlantGrowth(count) {
        const levelName = document.getElementById('plant-level-name');
        const levelBadge = document.getElementById('plant-level-badge');
        const expFill = document.getElementById('plant-exp');
        const expText = document.getElementById('exp-text');
        const plantSprite = document.getElementById('plant-sprite');
        const totalStatsText = document.getElementById('total-stats-text');
        
        // 현재 사이클 계산 로직 개선 (10권째에 꽃을 유지하기 위함)
        const isCycleEnd = count > 0 && count % 10 === 0;
        const forestLevel = isCycleEnd ? Math.floor((count - 1) / 10) + 1 : Math.floor(count / 10) + 1;
        const cycleCount = isCycleEnd ? 10 : count % 10;
        const progress = (cycleCount / 10);
        
        // 개별 이미지 교체 (사용자 지정 단계: 0~3:1, 4~5:2, 6~7:3, 8~9:4, 10:5)
        if (plantSprite) {
            let stageIndex = 1;
            if (cycleCount <= 3) stageIndex = 1;
            else if (cycleCount <= 5) stageIndex = 2;
            else if (cycleCount <= 7) stageIndex = 3;
            else if (cycleCount <= 9) stageIndex = 4;
            else stageIndex = 5; // 10권 달성
            
            const newSrc = `assets/stage${stageIndex}.png`;
            if (!plantSprite.src.includes(newSrc)) plantSprite.src = newSrc;
            
            // --- 애니메이션 액션 제어 ---
            plantSprite.classList.remove('plant-wiggle', 'plant-float');
            stopSparkles();

            if (stageIndex <= 2) {
                plantSprite.classList.add('plant-wiggle');
            } else if (stageIndex <= 4) {
                plantSprite.classList.add('plant-float');
                // 둥실거릴 때는 translateY가 중첩되므로 조절
                plantSprite.style.transform = `scale(${0.9 + (stageIndex * 0.05)})`;
            } else if (stageIndex === 5) {
                plantSprite.style.transform = `scale(1.15)`;
                startSparkles();
            } else {
                plantSprite.style.transform = `translateY(-(stageIndex * 5)px) scale(${0.9 + (stageIndex * 0.05)})`;
            }
        }

        // 레벨 및 칭호 설정
        const titles = ['', '꿈나무', '우등', '숲의 관리자', '요정의 친구', '마법사', '전설의 왕', '신화의 주인'];
        const title = titles[Math.min(forestLevel, titles.length - 1)] || '정원사';
        
        levelBadge.innerText = `LV.${forestLevel}`;
        levelName.innerText = `${title} 교은이의 정원`;
        
        const percent = Math.min(progress * 100, 100);
        expFill.style.width = `${percent}%`;
        expText.innerText = `${cycleCount === 0 && count > 0 ? 10 : cycleCount} / 10`;

        if (percent >= 100 && count > 0) {
            levelName.innerText = `축하해요! ${forestLevel}단계 나무 완성! 🎉`;
        }

        if (totalStatsText) {
            totalStatsText.innerText = `총 ${count}권 읽음 / 전체 목표 ${forestLevel * 10}권`;
        }
    }

    let sparkleInterval = null;
    function startSparkles() {
        if (sparkleInterval) return;
        const container = document.getElementById('sparkle-container');
        if (!container) return;
        
        sparkleInterval = setInterval(() => {
            for (let i = 0; i < 4; i++) {
                const s = document.createElement('div');
                s.className = 'sparkle';
                s.style.left = '50%';
                s.style.top = '40%';
                const x = (Math.random() - 0.5) * 150 + 'px';
                const y = (Math.random() - 0.5) * 150 + 'px';
                s.style.setProperty('--x', x);
                s.style.setProperty('--y', y);
                s.style.backgroundColor = `hsl(${Math.random() * 360}, 100%, 75%)`;
                s.style.boxShadow = `0 0 12px white`;
                container.appendChild(s);
                setTimeout(() => s.remove(), 1000);
            }
        }, 400);
    }

    function stopSparkles() {
        if (sparkleInterval) {
            clearInterval(sparkleInterval);
            sparkleInterval = null;
        }
    }

    // 7. 칭찬 도장 렌더링
    function renderStamps() {
        const finishedCount = books.filter(b => b.status === 'finished').length;
        
        // 20개 단위로 판수 계산
        const boardCycle = finishedCount > 0 ? Math.floor((finishedCount - 1) / 20) + 1 : 1;
        const currentBoardCount = finishedCount % 20 === 0 && finishedCount > 0 ? 20 : finishedCount % 20;

        // 도장판 제목 업데이트 (몇 번째 판인지 표시)
        const stampTitle = document.querySelector('.tab-content[data-tab="stamps"] h2');
        if (stampTitle) {
            stampTitle.innerText = `칭찬 도장판 (${boardCycle}회차)`;
        }

        // 도장 슬롯이 없으면 생성
        if (stampGrid.children.length === 0) {
            stampGrid.innerHTML = '';
            for (let i = 1; i <= 20; i++) {
                const slot = document.createElement('div');
                slot.className = 'stamp-slot';
                slot.id = `stamp-${i}`;
                slot.innerHTML = `<div class="slot-num">${i}</div>`;
                stampGrid.appendChild(slot);
            }
        }

        // 도장 찍기
        for (let i = 1; i <= 20; i++) {
            const slot = document.getElementById(`stamp-${i}`);
            if (i <= currentBoardCount) {
                slot.classList.add('stamp-active');
                slot.innerHTML = `<i class="fas fa-star" style="color: white; font-size: 24px;"></i>`;
            } else {
                slot.classList.remove('stamp-active');
                slot.innerHTML = `<div class="slot-num">${i}</div>`;
            }
        }
    }

    // 8. 바코드 스캐너 로직
    function startScanner() {
        if (!html5QrcodeScanner) {
            html5QrcodeScanner = new Html5Qrcode("qr-reader");
        }
        
        const config = { 
            fps: 20, 
            qrbox: { width: 220, height: 140 }, // 창 크기에 맞춰 콤팩트하게 조정
            aspectRatio: 1.0,
            videoConstraints: {
                facingMode: "environment",
                width: { ideal: 1280 },
                height: { ideal: 720 },
                focusMode: "continuous"
            }
        };
        
        html5QrcodeScanner.start(
            { facingMode: "environment" }, // 강제 macro 제거하여 호환성 높임
            config,
            async (decodedText) => {
                // 바코드 인식 성공 (ISBN)
                stopScanner();
                await searchBookByISBN(decodedText);
            }
        ).then(() => {
            stopScanBtn.classList.remove('hidden');
            
            // [집중 수정] 포커스 킥(Focus Kick) 로직 추가
            // 카메라 시작 직후 초점이 안 맞는 현상을 해결하기 위해 
            // 0.5초 후 강제로 포커스 설정을 다시 적용하여 렌즈를 깨웁니다.
            setTimeout(async () => {
                try {
                    const track = html5QrcodeScanner.getRunningTrack();
                    if (track && track.applyConstraints) {
                        const capabilities = track.getCapabilities ? track.getCapabilities() : {};
                        
                        // 기기가 지원하는 경우에만 실행
                        if (capabilities.focusMode) {
                            await track.applyConstraints({
                                advanced: [{ focusMode: "continuous" }]
                            });
                            console.log("Focus kick applied successfully");
                        }
                    }
                } catch (e) {
                    console.warn("Focus kick failed, but scanner is still running:", e);
                }
            }, 500);

        }).catch(err => {
            console.error("Scanner error:", err);
            // 오류 시 기본 설정으로 재시도
            html5QrcodeScanner.start({ facingMode: "environment" }, { fps: 10, qrbox: 250 }, async (txt) => {
                stopScanner();
                await searchBookByISBN(txt);
            });
        });
    }

    function stopScanner() {
        if (html5QrcodeScanner && html5QrcodeScanner.getState() === Html5QrcodeScannerState.SCANNING) {
            html5QrcodeScanner.stop().then(() => {
                stopScanBtn.classList.add('hidden');
            }).catch(err => console.error("Stop failed", err));
        } else if (html5QrcodeScanner) {
            // 이미 중지되었거나 다른 상태일 때도 버튼은 숨김
            stopScanBtn.classList.add('hidden');
        }
    }

    // 9. 도서 검색 (카카오 우선 -> 알라딘 백업 전략)
    async function searchBookByISBN(isbn, isManual = false) {
        try {
            if (!_supabase) return;
            window.showLoading();

            // 1. 카카오 검색 시도 (속도가 빠르고 표준적임)
            const { data, error } = await _supabase.functions.invoke('search-books', {
                body: { isbn: isbn }
            });

            if (!error && data && data.documents && data.documents.length > 0) {
                const b = data.documents[0];
                const bookData = {
                    title: b.title,
                    author: b.authors.join(', '),
                    publisher: b.publisher,
                    cover_url: b.thumbnail,
                    isbn: isbn
                };
                
                if (isManual) {
                    document.getElementById('manual-title').value = bookData.title;
                    document.getElementById('manual-author').value = bookData.author;
                    window.hideLoading();
                    return bookData;
                }
                window.hideLoading();
                await addNewBook(bookData);
                return;
            }

            // 2. 카카오 실패 시 알라딘 검색 시도 (최신/한정판 도서 보완)
            window.updateLoadingMsg("카카오 친구들이 못 찾았대요!<br>알라딘 지니를 깨우러 갑니다! 🧞‍♂️💨");
            
            console.log("카카오에서 정보를 찾지 못해 알라딘 검색을 시작합니다...");
            const aladinBook = await fetchFromAladin(isbn);
            
            if (aladinBook) {
                if (isManual) {
                    document.getElementById('manual-title').value = aladinBook.title;
                    document.getElementById('manual-author').value = aladinBook.author;
                    window.hideLoading();
                    return aladinBook;
                }
                window.hideLoading();
                await addNewBook(aladinBook);
                return;
            }

            // 둘 다 실패한 경우
            window.hideLoading();
            await window.customAlert(`카카오와 알라딘 모두에서 책 정보를 찾지 못했어요. (ISBN: ${isbn})\n직접 입력 기능을 이용해 주세요!`, "검색 결과 없음");
            
        } catch (error) {
            window.hideLoading();
            console.error("도서 검색 실패:", error);
            await window.customAlert("도서 정보를 가져오는 중 오류가 발생했어요.", "오류");
        }
    }

    // 알라딘 웹 스크래핑 (API 키 없이 AllOrigins 프록시 활용)
    async function fetchFromAladin(isbn) {
        try {
            const targetUrl = `https://www.aladin.co.kr/shop/wproduct.aspx?ISBN=${isbn}`;
            const proxyUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(targetUrl)}&timestamp=${Date.now()}`;
            
            const response = await fetch(proxyUrl);
            if (!response.ok) return null;
            
            const data = await response.json();
            const html = data.contents;
            if (!html || html.includes("존재하지 않는 상품입니다")) return null;

            // DOM 파싱을 통해 Meta 정보 추출
            const parser = new DOMParser();
            const doc = parser.parseFromString(html, 'text/html');
            
            const title = doc.querySelector('meta[property="og:title"]')?.content?.split(' - ')[0]?.trim();
            const author = doc.querySelector('meta[name="author"]')?.content || 
                           doc.querySelector('meta[property="og:author"]')?.content || 
                           "작가 미상";
            const cover_url = doc.querySelector('meta[property="og:image"]')?.content;
            
            if (!title) return null;

            return {
                title: title,
                author: author,
                publisher: "알라딘 검색",
                cover_url: cover_url,
                isbn: isbn
            };
        } catch (e) {
            console.warn("Aladin search failed:", e);
            return null;
        }
    }

    async function addNewBook(book) {
        if (!_supabase) return;
        
        const { error } = await _supabase
            .from('library_books')
            .insert([book]);
            
        if (!error) {
            // 성공 피드백 (진동/소리 등 가능)
            await window.customAlert(`'${book.title}' 책을 등록했어요!`, "등록 완료");
            document.querySelector('[data-target="tab-library"]').click();
        }
    }

    // 10. 책 상세 정보 및 상태 변경
    window.openBookDetail = async (bookId) => {
        const book = books.find(b => b.id === bookId);
        if (!book) return;

        const modal = document.getElementById('book-modal');
        const modalBody = document.getElementById('modal-body');
        
        modalBody.innerHTML = `
            <div class="book-detail">
                <div class="detail-cover-wrapper" onclick="document.getElementById('update-cover-input').click()">
                    ${book.cover_url ? 
                        `<img src="${book.cover_url}" class="detail-cover">` : 
                        `<div class="detail-cover no-image">
                            <div class="cover-add-overlay">
                                <i class="fas fa-camera"></i>
                                <span>사진 추가</span>
                            </div>
                        </div>`
                    }
                </div>
                <input type="file" id="update-cover-input" accept="image/*" hidden onchange="updateBookCoverImage('${book.id}', this.files[0])">
                <h2 class="detail-title">${book.title}</h2>
                <p class="detail-author">${book.author}</p>
                
                <div class="status-selector">
                    <p class="selector-label">교은아, 지금 이 책은 어떤 상태야?</p>
                    <div class="status-options">
                        <button class="opt-btn ${book.status === 'reading' ? 'active' : ''}" onclick="updateBookStatus('${book.id}', 'reading')">
                            <i class="fas fa-book-reader"></i><br>읽고 있어요
                        </button>
                        <button class="opt-btn ${book.status === 'finished' ? 'active' : ''}" onclick="updateBookStatus('${book.id}', 'finished')">
                            <i class="fas fa-check-circle"></i><br>${(book.read_count || 0) > 0 ? '또 읽었어요!' : '다 읽었어요!'}
                        </button>
                    </div>
                </div>

                <div class="read-count-section">
                    <div class="read-count-container">
                        <span class="read-count-label">지금까지 읽은 횟수</span>
                        <div class="read-count-display">
                            <span class="read-count-num">${book.read_count || 0}</span>
                            <span class="read-count-unit">회독</span>
                        </div>
                        <div class="read-count-icons">
                            ${Array(Math.min(book.read_count || 0, 5)).fill('<span class="med-emoji">📖</span>').join('')}
                            ${(book.read_count || 0) > 5 ? '<span class="med-emoji">...🔥</span>' : ''}
                        </div>
                    </div>
                </div>

                ${book.status === 'reading' ? `
                <div class="bookmark-section">
                    <p class="selector-label">지금 몇 페이지까지 읽었어?</p>
                    <div class="bookmark-input-group">
                        <input type="number" id="current-page-input" placeholder="페이지 번호" value="${book.current_page || ''}" inputmode="numeric">
                        <button class="save-bookmark-btn" onclick="updateBookmark('${book.id}')">
                            <i class="fas fa-save"></i>
                        </button>
                    </div>
                </div>
                ` : ''}
                
                <button class="delete-btn" onclick="deleteBook('${book.id}')">
                    <i class="fas fa-trash-alt"></i> 책 목록에서 지우기
                </button>
            </div>
        `;
        
        window.openModal(modal);
    };

    window.updateBookStatus = async (bookId, newStatus) => {
        if (!_supabase) return;
        
        const oldBook = books.find(b => b.id === bookId);
        if (!oldBook) return;

        // '다 읽었어요' 또는 '또 읽었어요' 처리 (N회독 대응)
        if (newStatus === 'finished') {
            const newReadCount = (oldBook.read_count || 0) + 1;
            
            // 상태 업데이트 및 횟수 증가
            const { error } = await _supabase
                .from('library_books')
                .update({ 
                    status: 'finished', 
                    read_count: newReadCount,
                    current_page: 0 // 다 읽었으므로 페이지 초기화
                })
                .eq('id', bookId);

            if (!error) {
                window.closeModal(document.getElementById('book-modal'));
                
                // 축하 효과
                triggerConfetti();
                
                sendCelebrationToDad(oldBook.title, newReadCount);
                
                const celebrationMsg = newReadCount > 1 
                    ? `벌써 ${newReadCount}번째 읽었네요!\n교은이는 정말 대단한 독서왕이에요! 👑📖`
                    : "우와! 교은이가 책을 한 권 더 읽었네요!\n아빠한테 자랑했어요! 🥳💖";
                
                await window.customAlert(celebrationMsg, "축하해요!");
                await fetchBooks();
                setupRealtimeSubscription();
            } else {
                console.error("상태 업데이트 실패:", error);
                await window.customAlert("정보를 저장하지 못했어요. DB 컬럼이 추가되었는지 확인해 주세요!", "오류");
            }
            return;
        }

        // 다른 상태 변경 (읽고 있어요 등)
        const { error } = await _supabase
            .from('library_books')
            .update({ status: newStatus })
            .eq('id', bookId);
            
        if (!error) {
            if (newStatus === 'reading') {
                // 약간의 지연 후 다시 렌더링된 데이터로 모달 갱신
                await fetchBooks();
                openBookDetail(bookId);
            } else {
                window.closeModal(document.getElementById('book-modal'));
            }
        }
    };

    // 꽃가루 효과 (canvas-confetti)
    function triggerConfetti() {
        const duration = 3 * 1000;
        const animationEnd = Date.now() + duration;
        const defaults = { startVelocity: 30, spread: 360, ticks: 60, zIndex: 5000 };

        const randomInRange = (min, max) => Math.random() * (max - min) + min;

        const interval = setInterval(function() {
            const timeLeft = animationEnd - Date.now();

            if (timeLeft <= 0) {
                return clearInterval(interval);
            }

            const particleCount = 50 * (timeLeft / duration);
            confetti({ ...defaults, particleCount, origin: { x: randomInRange(0.1, 0.3), y: Math.random() - 0.2 } });
            confetti({ ...defaults, particleCount, origin: { x: randomInRange(0.7, 0.9), y: Math.random() - 0.2 } });
        }, 250);
    }

    window.updateBookmark = async (bookId) => {
        if (!_supabase) return;
        
        const pageInput = document.getElementById('current-page-input');
        const page = parseInt(pageInput.value);
        
        if (isNaN(page) || page < 0) {
            await window.customAlert("페이지 번호를 숫자로 입력해 주세요!", "입력 확인");
            return;
        }

        const { error } = await _supabase
            .from('library_books')
            .update({ current_page: page })
            .eq('id', bookId);

        if (!error) {
            // 저장 버튼 시각적 피드백
            const saveBtn = document.querySelector('.save-bookmark-btn');
            const originalIcon = saveBtn.innerHTML;
            saveBtn.innerHTML = '<i class="fas fa-check"></i>';
            saveBtn.style.background = '#10B981'; // 성공 시 초록색
            
            setTimeout(async () => {
                saveBtn.innerHTML = originalIcon;
                saveBtn.style.background = '';
                // 데이터 새로고침
                await fetchBooks();
            }, 1000);
        } else {
            console.error("북마크 저장 실패:", error);
            await window.customAlert("페이지를 저장하지 못했어요. 컬럼이 있는지 확인이 필요해요.", "오류");
        }
    };

    async function sendCelebrationToDad(bookTitle, readCount) {
        try {
            const countMsg = readCount > 1 ? ` (벌써 ${readCount}번째 읽었어요! 👏)` : "";
            // 기존 텔레그램 전송 함수 활용
            await _supabase.functions.invoke('send-telegram', {
                body: { 
                    text: `<b>[교은이의 독서 소식]</b>\n\n교은이가 책 한 권을 다 읽었어요! 🥳\n\n📖 제목: <b>${bookTitle}</b>${countMsg}\n\n아빠, 교은이에게 칭찬 한마디 부탁드려요! ❤️`
                }
            });
        } catch (e) {
            console.error("알림 발송 실패:", e);
        }
    }

    window.deleteBook = async (bookId) => {
        const ok = await window.customConfirm("소중한 독서 기록을 정말 삭제할까요?");
        if (!ok) return;
        
        if (!_supabase) return;
        
        const { error } = await _supabase
            .from('library_books')
            .delete()
            .eq('id', bookId);
            
        if (!error) {
            window.closeModal(document.getElementById('book-modal'));
        }
    };

    window.updateBookCoverImage = async (bookId, file) => {
        if (!file) return;
        
        window.showLoading();
        window.updateLoadingMsg("새로운 표지를 저장하는 중... 📸");
        
        const uploadedUrl = await uploadBookCover(file);
        if (uploadedUrl) {
            const { error } = await _supabase
                .from('library_books')
                .update({ cover_url: uploadedUrl })
                .eq('id', bookId);
            
            if (!error) {
                await fetchBooks();
                // 상세 모달을 갱신된 데이터로 다시 열기 위해 지연 호출
                setTimeout(() => {
                    openBookDetail(bookId);
                    window.hideLoading();
                }, 500);
            } else {
                window.hideLoading();
                await window.customAlert("이미지 주소를 저장하지 못했어요.", "오류");
            }
        } else {
            window.hideLoading();
            await window.customAlert("이미지 업로드에 실패했어요.", "오류");
        }
    };

    // 젬마 프리미엄 커스텀 컨펌 (Promise 기반)
    window.customConfirm = function(message) {
        return new Promise((resolve) => {
            const modal = document.getElementById('confirm-modal');
            const msgEl = document.getElementById('confirm-msg');
            const okBtn = document.getElementById('confirm-ok-btn');
            const cancelBtn = document.getElementById('confirm-cancel-btn');

            if (msgEl) msgEl.innerText = message;
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
            
            // 모달 외부 클릭 시 닫기 (취소 처리)
            modal.onclick = (e) => {
                if (e.target === modal) handleCancel();
            };
        });
    };

    // 젬마 프리미엄 커스텀 알림 (Promise 기반)
    window.customAlert = function(message, title = "알림") {
        return new Promise((resolve) => {
            const modal = document.getElementById('alert-modal');
            const titleEl = document.getElementById('alert-title');
            const msgEl = document.getElementById('alert-msg');
            const okBtn = document.getElementById('alert-ok-btn');
            const iconContainer = document.getElementById('alert-icon-container');

            if (titleEl) titleEl.innerText = title;
            if (msgEl) msgEl.innerText = message;
            
            // 타이틀에 따른 아이콘 변경
            if (title === "오류") {
                iconContainer.innerHTML = '<i class="fas fa-exclamation-circle"></i>';
                iconContainer.style.color = "#EF4444";
                iconContainer.style.background = "rgba(239, 68, 68, 0.1)";
            } else if (title === "축하해요!" || title === "등록 완료") {
                iconContainer.innerHTML = '<i class="fas fa-gift"></i>';
                iconContainer.style.color = "#F472B6";
                iconContainer.style.background = "rgba(244, 114, 182, 0.1)";
            } else {
                iconContainer.innerHTML = '<i class="fas fa-info-circle"></i>';
                iconContainer.style.color = "var(--primary-color)";
                iconContainer.style.background = "rgba(167, 139, 250, 0.1)";
            }

            window.openModal(modal);

            const handleOk = () => {
                cleanup();
                resolve();
            };

            const cleanup = () => {
                okBtn.removeEventListener('click', handleOk);
                window.closeModal(modal);
            };

            okBtn.addEventListener('click', handleOk);
            
            modal.onclick = (e) => {
                if (e.target === modal) handleOk();
            };
        });
    };

    document.querySelector('.close-modal').onclick = () => {
        window.closeModal(document.getElementById('book-modal'));
    };

    // 11. 탭 전환 이벤트
    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const target = btn.getAttribute('data-target');
            
            tabBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            
            tabContents.forEach(c => c.classList.remove('active'));
            document.getElementById(target).classList.add('active');

            // 성장 프로필 카드 제어 (책 등록 탭일 때 숨김)
            const profileCard = document.querySelector('.profile-card');
            if (profileCard) {
                if (target === 'tab-scan') {
                    profileCard.style.display = 'none';
                } else {
                    profileCard.style.display = 'block';
                }
            }

            // 페이지 상단으로 스크롤
            window.scrollTo({ top: 0, behavior: 'smooth' });
            
            if (target === 'tab-scan') {
                startScanner();
            } else {
                stopScanner();
            }
        });
    });

    // 13. 필터 버튼 이벤트
    filterBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const status = btn.getAttribute('data-status');
            
            // 버튼 활성화 처리
            filterBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            
            // 목록 필터링 렌더링
            renderBooks(status);
        });
    });

    stopScanBtn.addEventListener('click', stopScanner);

    // 테마 토글
    themeToggleBtn.addEventListener('click', () => {
        const isLight = document.documentElement.getAttribute('data-theme') === 'light';
        
        if (isLight) {
            document.documentElement.removeAttribute('data-theme');
            themeToggleBtn.innerHTML = '<i class="fas fa-moon"></i>';
            localStorage.setItem('library-theme', 'dark');
        } else {
            document.documentElement.setAttribute('data-theme', 'light');
            themeToggleBtn.innerHTML = '<i class="fas fa-sun"></i>';
            localStorage.setItem('library-theme', 'light');
        }
    });

    // 초기 테마 설정
    const savedTheme = localStorage.getItem('library-theme') || 'dark'; // 기본 다크
    if (savedTheme === 'light') {
        document.documentElement.setAttribute('data-theme', 'light');
        themeToggleBtn.innerHTML = '<i class="fas fa-sun"></i>';
    } else {
        document.documentElement.removeAttribute('data-theme');
        themeToggleBtn.innerHTML = '<i class="fas fa-moon"></i>';
    }

    // 12. 직접 입력 로직
    let manualBookData = null; // ISBN 검색 결과 임시 저장
    let selectedImageFile = null; // 선택된 이미지 파일

    const manualImageInput = document.getElementById('manual-image-input');
    const imagePreview = document.getElementById('manual-image-preview');
    const imagePlaceholder = document.getElementById('image-upload-placeholder');
    const imagePreviewContainer = document.getElementById('image-preview-container');

    manualInputBtn.addEventListener('click', () => {
        manualBookData = null;
        selectedImageFile = null;
        document.getElementById('manual-isbn').value = '';
        document.getElementById('manual-title').value = '';
        document.getElementById('manual-author').value = '';
        
        // 이미지 초기화
        manualImageInput.value = '';
        imagePreview.src = '';
        imagePreview.classList.add('hidden');
        imagePlaceholder.classList.remove('hidden');
        
        window.openModal(manualModal);
    });

    // 이미지 첨부 영역 클릭
    imagePreviewContainer.addEventListener('click', () => manualImageInput.click());

    // 이미지 선택 시 프리뷰
    manualImageInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
            selectedImageFile = file;
            const reader = new FileReader();
            reader.onload = (e) => {
                imagePreview.src = e.target.result;
                imagePreview.classList.remove('hidden');
                imagePlaceholder.classList.add('hidden');
            };
            reader.readAsDataURL(file);
        }
    });

    // Supabase Storage 이미지 업로드 함수
    async function uploadBookCover(file) {
        try {
            if (!_supabase || !file) return null;
            
            // 파일명 생성 (중복 방지)
            const fileExt = file.name.split('.').pop();
            const fileName = `book_${Math.random().toString(36).substring(2)}_${Date.now()}.${fileExt}`;
            const filePath = `covers/${fileName}`;

            // 업로드
            const { data, error } = await _supabase.storage
                .from('library')
                .upload(filePath, file);

            if (error) {
                console.error('Storage 업로드 에러:', error);
                // 버킷이 없는 경우 등에 대한 안내
                if (error.message.includes('bucket not found')) {
                    throw new Error("'library' 버킷을 찾을 수 없습니다. Supabase 설정을 확인해주세요.");
                }
                return null;
            }

            // Public URL 가져오기
            const { data: { publicUrl } } = _supabase.storage
                .from('library')
                .getPublicUrl(filePath);

            return publicUrl;
        } catch (err) {
            console.error('이미지 업로드 실패:', err);
            return null;
        }
    }

    // ISBN으로 정보 가져오기 버튼
    document.getElementById('fetch-isbn-btn').addEventListener('click', async () => {
        const isbn = document.getElementById('manual-isbn').value.trim();
        if (!isbn) {
            await window.customAlert("ISBN 숫자를 입력해 주세요!", "알림");
            return;
        }
        manualBookData = await searchBookByISBN(isbn, true);
    });

    closeManualBtn.addEventListener('click', () => {
        window.closeModal(manualModal);
    });

    saveManualBtn.addEventListener('click', async () => {
        const title = document.getElementById('manual-title').value.trim();
        const author = document.getElementById('manual-author').value.trim();
        const isbn = document.getElementById('manual-isbn').value.trim();
        
        if (!title) {
            await window.customAlert("책 이름을 알려주세요!", "입력 확인");
            return;
        }

        window.showLoading();
        window.updateLoadingMsg("책을 책장에 넣는 중... ✨");

        let coverUrl = '';
        
        // 1. 이미지가 선택된 경우 업로드 먼저 진행
        if (selectedImageFile) {
            window.updateLoadingMsg("이미지를 안전하게 저장하고 있어요... 📸");
            const uploadedUrl = await uploadBookCover(selectedImageFile);
            if (uploadedUrl) {
                coverUrl = uploadedUrl;
            } else if (selectedImageFile) {
                // 업로드 실패했지만 이미지가 있었던 경우 알림
                console.warn("이미지 업로드 실패, 기본 정보로 저장합니다.");
            }
        }
        
        const bookData = {
            title: title,
            author: author || '작가 미상',
            isbn: isbn,
            status: 'reading',
            cover_url: coverUrl || (manualBookData ? manualBookData.cover_url : '')
        };
        
        // 수동 수정된 내용 반영
        bookData.title = title;
        bookData.author = author;
        bookData.isbn = isbn;
        
        await addNewBook(bookData);
        
        window.hideLoading();
        window.closeModal(manualModal);
    });

    // --- Pull to Refresh 로직 (아이폰 캐시 방지용) ---
    let touchStart = 0;
    let touchMove = 0;
    const ptrIndicator = document.getElementById('ptr-indicator');
    const threshold = 120; // 새로고침이 실행될 당기기 거리

    window.addEventListener('touchstart', (e) => {
        // 페이지가 최상단에 있을 때만 시작
        if (window.scrollY <= 1) {
            touchStart = e.touches[0].screenY;
        } else {
            touchStart = 0;
        }
    }, { passive: true });

    window.addEventListener('touchmove', (e) => {
        if (touchStart === 0) return;
        
        touchMove = e.touches[0].screenY;
        const distance = touchMove - touchStart;

        if (distance > 0 && window.scrollY <= 1) {
            // 아래로 당기는 애니메이션 (저항감 효과)
            const pull = Math.pow(Math.min(distance, threshold * 2), 0.8) * 2;
            ptrIndicator.style.transform = `translateY(${pull}px)`;
            
            // 임계값 도달 시 아이콘 회전
            const icon = ptrIndicator.querySelector('i');
            if (distance > threshold) {
                icon.style.color = 'var(--accent-color)';
                icon.style.filter = 'drop-shadow(0 0 8px var(--accent-color))';
            } else {
                icon.style.color = 'var(--primary-color)';
                icon.style.filter = 'none';
            }
        }
    }, { passive: true });

    window.addEventListener('touchend', () => {
        const distance = touchMove - touchStart;
        
        if (distance > threshold && window.scrollY <= 1) {
            // 새로고침 실행
            ptrIndicator.style.transform = `translateY(80px)`;
            // 진동 피드백 (지원하는 기기만)
            if (window.navigator.vibrate) window.navigator.vibrate(50);
            
            setTimeout(() => {
                window.location.reload(true);
            }, 300);
        } else {
            // 취소: 원래 위치로 복구
            ptrIndicator.style.transform = 'translateY(0)';
        }
        touchStart = 0;
        touchMove = 0;
    });

    initApp();
});

