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
            await window.customAlert("서버 연결에 실패했어요. 나중에 다시 시도해 주세요!", "오류");
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

        bookListContainer.innerHTML = filteredBooks.map(book => `
            <div class="book-card" onclick="openBookDetail('${book.id}')" style="position: relative;">
                <img src="${book.cover_url || 'https://via.placeholder.com/150x200?text=No+Cover'}" class="book-cover" alt="${book.title}">
                <div class="status-badge">
                    ${getStatusText(book.status)}
                </div>
                ${book.status === 'reading' && book.current_page ? `
                    <div class="page-badge">
                        <i class="fas fa-bookmark" style="margin-right: 4px;"></i>p.${book.current_page}
                    </div>
                ` : ''}
                <div class="book-info">
                    <h3 class="book-title">${book.title}</h3>
                    <p class="book-author">${book.author || '작가 미상'}</p>
                </div>
            </div>
        `).join('');
    }

    function getStatusText(status) {
        const map = { 'want': '읽고 싶어요', 'reading': '읽고 있어요', 'finished': '다 읽었어요 ✨' };
        return map[status] || status;
    }

    function getStatusColor(status) {
        const map = { 'want': '#8E8E8E', 'reading': '#7AD7F0', 'finished': '#FF85A2' };
        return map[status] || '#000';
    }

    // 6. 통계 업데이트
    function updateStats() {
        const finishedCount = books.filter(b => b.status === 'finished').length;
        totalBooksEl.innerText = finishedCount;
        
        // 10권 단위로 목표 자동 갱신 (10, 20, 30...)
        currentGoal = Math.ceil((finishedCount + 1) / 10) * 10;
        document.getElementById('current-goal').innerText = currentGoal;
        
        const progress = Math.min((finishedCount / currentGoal) * 100, 100);
        document.getElementById('goal-progress').style.width = `${progress}%`;
        
        const remaining = currentGoal - finishedCount;
        remainingBooksEl.innerText = 
            remaining > 0 ? `${remaining}` : '0';
        
        // 문구 업데이트 (필요시 추가 엘리먼트 생성 가능하지만 여기선 기존 UI 유지)
        const goalMsgEl = document.querySelector('.goal-msg');
        if (goalMsgEl) {
            goalMsgEl.innerHTML = remaining > 0 
                ? `목표까지 <span id="remaining-books">${remaining}</span>권 남았어요! <div class="mini-progress"><div id="goal-progress" class="mini-fill"></div></div>`
                : `목표 달성! 대단해요 교은아! 🎉 <div class="mini-progress"><div id="goal-progress" class="mini-fill" style="width:100%"></div></div>`;
            
            // goalProgressEl이 동적으로 변경되었으므로 다시 할당하거나 직접 업데이트
            const newFill = document.getElementById('goal-progress');
            if (newFill) newFill.style.width = `${progress}%`;
        }

        // 식물 성장 로직 (무한 성장 버전)
        updatePlantGrowth(finishedCount);
    }

    function updatePlantGrowth(count) {
        const plantIcon = document.getElementById('magic-plant');
        const levelName = document.getElementById('plant-level-name');
        const expFill = document.getElementById('plant-exp');
        
        // 현재 사이클 (0~9권: 레벨 1, 10~19권: 레벨 2...)
        const forestLevel = Math.floor(count / 10) + 1;
        const cycleCount = count % 10;
        
        let icon = '🌱';
        let name = `레벨 ${forestLevel} 정원사 교은이`;
        let progress = (cycleCount / 10) * 100;

        if (count === 0) {
            icon = '🌱'; name = '초보 정원사 교은이';
        } else if (cycleCount === 0 && count > 0) {
            // 딱 10, 20, 30권을 채웠을 때 (완성된 나무)
            const trees = ['🌳', '🍎🌳', '🍊🌳', '🍇🌳', '💎🌳', '🌟🌳', '🌈🌳', '🏰'];
            icon = trees[Math.min(forestLevel - 2, trees.length - 1)] + '✨';
            name = `전설의 나무를 완성했어요! (총 ${count}권)`;
            progress = 100;
        } else {
            // 성장 중인 상태
            if (cycleCount >= 7) icon = '🌸';
            else if (cycleCount >= 4) icon = '🪴';
            else icon = '🌿';
            
            const titles = ['', '꿈나무', '우등', '숲의 관리자', '요정의 친구', '마법사', '전설의 왕'];
            const title = titles[Math.min(forestLevel, titles.length - 1)];
            name = `${title} 정원사 교은이 (${count}권)`;
        }

        plantIcon.innerText = icon;
        levelName.innerText = name;
        expFill.style.width = `${Math.min(progress, 100)}%`;
    }

    // 7. 칭찬 도장 렌더링
    function renderStamps() {
        const finishedCount = books.filter(b => b.status === 'finished').length;
        
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
            if (i <= finishedCount) {
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
                <img src="${book.cover_url || 'https://via.placeholder.com/150x200?text=No+Cover'}" class="detail-cover">
                <h2 class="detail-title">${book.title}</h2>
                <p class="detail-author">${book.author}</p>
                
                <div class="status-selector">
                    <p class="selector-label">교은아, 지금 이 책은 어떤 상태야?</p>
                    <div class="status-options">
                        <button class="opt-btn ${book.status === 'reading' ? 'active' : ''}" onclick="updateBookStatus('${book.id}', 'reading')">
                            <i class="fas fa-book-reader"></i><br>읽고 있어요
                        </button>
                        <button class="opt-btn ${book.status === 'finished' ? 'active' : ''}" onclick="updateBookStatus('${book.id}', 'finished')">
                            <i class="fas fa-check-circle"></i><br>다 읽었어요!
                        </button>
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
        
        // 상태 변경 시 업데이트 데이터 구성
        const updateData = { status: newStatus };
        
        // '다 읽었어요' 상태로 변경될 때 페이지 정보는 더 이상 표시하지 않음 (필요시 0으로 초기화 가능)
        // 여기서는 그냥 두고 렌더링 시 status === 'reading' 일 때만 보여주는 방식으로 처리함
        
        const { error } = await _supabase
            .from('library_books')
            .update(updateData)
            .eq('id', bookId);
            
        if (!error) {
            // 다 읽었을 때 아빠에게 알림 보내기
            if (newStatus === 'finished' && oldBook.status !== 'finished') {
                window.closeModal(document.getElementById('book-modal'));
                sendCelebrationToDad(oldBook.title);
                await window.customAlert("우와! 교은이가 책을 한 권 더 읽었네요!\n아빠한테 자랑했어요! 🥳💖", "축하해요!");
            } else {
                // 상태만 변경된 경우 다시 상세 모달을 열어 북마크 섹션이 보이게 함 (reading 상태로 바뀐 경우)
                if (newStatus === 'reading') {
                    // 약간의 지연 후 다시 렌더링된 데이터로 모달 갱신
                    await fetchBooks();
                    openBookDetail(bookId);
                } else {
                    window.closeModal(document.getElementById('book-modal'));
                }
            }
        }
    };

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

    async function sendCelebrationToDad(bookTitle) {
        try {
            // 기존 텔레그램 전송 함수 활용
            await _supabase.functions.invoke('send-telegram', {
                body: { 
                    text: `<b>[교은이의 독서 소식]</b>\n\n교은이가 책 한 권을 다 읽었어요! 🥳\n\n📖 제목: <b>${bookTitle}</b>\n\n아빠, 교은이에게 칭찬 한마디 부탁드려요! ❤️`
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

    manualInputBtn.addEventListener('click', () => {
        manualBookData = null;
        document.getElementById('manual-isbn').value = '';
        document.getElementById('manual-title').value = '';
        document.getElementById('manual-author').value = '';
        window.openModal(manualModal);
    });

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
        
        const bookData = manualBookData || {
            title: title,
            author: author || '작가 미상',
            isbn: isbn,
            status: 'reading',
            cover_url: ''
        };
        
        // 수동 수정된 내용 반영
        bookData.title = title;
        bookData.author = author;
        bookData.isbn = isbn;
        
        await addNewBook(bookData);
        
        window.closeModal(manualModal);
    });

    initApp();
});
