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
    
    // 2. State
    let _supabase = null;
    let books = [];
    let html5QrcodeScanner = null;
    let currentGoal = 10;
    
    // 3. Supabase 초기화
    async function initApp() {
        try {
            _supabase = supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);
            await fetchBooks();
            
            // 실시간 구독
            _supabase.channel('library-changes')
                .on('postgres_changes', { event: '*', schema: 'public', table: 'library_books' }, () => {
                    fetchBooks();
                })
                .subscribe();
                
        } catch (error) {
            console.error("초기화 에러:", error);
            alert("서버 연결에 실패했어요. 나중에 다시 시도해 주세요!");
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
            <div class="book-card" onclick="openBookDetail('${book.id}')">
                <img src="${book.cover_url || 'https://via.placeholder.com/150x200?text=No+Cover'}" class="book-cover" alt="${book.title}">
                <div class="status-badge">
                    ${getStatusText(book.status)}
                </div>
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
            fps: 10, 
            qrbox: { width: 250, height: 150 },
            aspectRatio: 1.0
        };
        
        html5QrcodeScanner.start(
            { facingMode: "environment" },
            config,
            async (decodedText) => {
                // 바코드 인식 성공 (ISBN)
                stopScanner();
                await searchBookByISBN(decodedText);
            }
        ).then(() => {
            stopScanBtn.classList.remove('hidden');
        }).catch(err => console.error("Scanner error:", err));
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

    // 9. 도서 검색 (보안이 적용된 Supabase Edge Function 활용)
    async function searchBookByISBN(isbn) {
        try {
            if (!_supabase) return;

            // 서버 측 함수 호출 (API 키는 서버 안에 숨겨져 있음)
            const { data, error } = await _supabase.functions.invoke('search-books', {
                body: { isbn: isbn }
            });

            if (error) throw error;
            
            if (data && data.documents && data.documents.length > 0) {
                const b = data.documents[0];
                const bookData = {
                    title: b.title,
                    author: b.authors.join(', '),
                    publisher: b.publisher,
                    cover_url: b.thumbnail,
                    isbn: isbn
                };
                await addNewBook(bookData);
            } else {
                alert(`책 정보를 찾지 못했어요. (ISBN: ${isbn})\n나중에 직접 입력 기능을 추가해 드릴게요!`);
            }
        } catch (error) {
            console.error("도서 검색 실패:", error);
            alert("도서 정보를 가져오는 중 오류가 발생했어요.");
        }
    }

    async function addNewBook(book) {
        if (!_supabase) return;
        
        const { error } = await _supabase
            .from('library_books')
            .insert([book]);
            
        if (!error) {
            // 성공 피드백 (진동/소리 등 가능)
            alert(`'${book.title}' 책을 등록했어요!`);
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
                        <button class="opt-btn ${book.status === 'reading' ? 'active' : ''}" onclick="updateBookStatus('${book.id}', 'reading')">읽고 있어요</button>
                        <button class="opt-btn ${book.status === 'finished' ? 'active' : ''}" onclick="updateBookStatus('${book.id}', 'finished')">다 읽었어요! ✨</button>
                    </div>
                </div>
                
                <button class="delete-btn" onclick="deleteBook('${book.id}')">책 목록에서 지우기</button>
            </div>
        `;
        
        modal.classList.remove('hidden');
    };

    window.updateBookStatus = async (bookId, newStatus) => {
        if (!_supabase) return;
        
        const oldBook = books.find(b => b.id === bookId);
        const { error } = await _supabase
            .from('library_books')
            .update({ status: newStatus })
            .eq('id', bookId);
            
        if (!error) {
            document.getElementById('book-modal').classList.add('hidden');
            
            // 다 읽었을 때 아빠에게 알림 보내기
            if (newStatus === 'finished' && oldBook.status !== 'finished') {
                sendCelebrationToDad(oldBook.title);
                alert("우와! 교은이가 책을 한 권 더 읽었네요! 아빠한테 자랑했어요! 🥳💖");
            }
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
        if (!confirm("정말 이 책을 지울까요?")) return;
        if (!_supabase) return;
        
        const { error } = await _supabase
            .from('library_books')
            .delete()
            .eq('id', bookId);
            
        if (!error) {
            document.getElementById('book-modal').classList.add('hidden');
        }
    };

    document.querySelector('.close-modal').onclick = () => {
        document.getElementById('book-modal').classList.add('hidden');
    };

    // 11. 탭 전환 이벤트
    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const target = btn.getAttribute('data-target');
            
            tabBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            
            tabContents.forEach(c => c.classList.remove('active'));
            document.getElementById(target).classList.add('active');

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
        const currentTheme = document.documentElement.getAttribute('data-theme');
        const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
        
        if (newTheme === 'dark') {
            document.documentElement.setAttribute('data-theme', 'dark');
            themeToggleBtn.innerHTML = '<i class="fas fa-moon"></i>';
        } else {
            document.documentElement.removeAttribute('data-theme');
            themeToggleBtn.innerHTML = '<i class="fas fa-sun"></i>';
        }
        localStorage.setItem('library-theme', newTheme);
    });

    // 초기 테마 설정
    const savedTheme = localStorage.getItem('library-theme') || 'light';
    if (savedTheme === 'dark') {
        document.documentElement.setAttribute('data-theme', 'dark');
        themeToggleBtn.innerHTML = '<i class="fas fa-moon"></i>';
    } else {
        themeToggleBtn.innerHTML = '<i class="fas fa-sun"></i>';
    }

    // 12. 직접 입력 로직
    manualInputBtn.addEventListener('click', () => {
        manualModal.classList.remove('hidden');
    });

    closeManualBtn.addEventListener('click', () => {
        manualModal.classList.add('hidden');
    });

    saveManualBtn.addEventListener('click', async () => {
        const title = document.getElementById('manual-title').value.trim();
        const author = document.getElementById('manual-author').value.trim();
        
        if (!title) {
            alert("책 이름을 알려주세요!");
            return;
        }
        
        const bookData = {
            title: title,
            author: author || '작가 미상',
            status: 'reading', // 직접 입력 시 기본값은 '읽는 중'
            cover_url: '' // 커버는 직접 입력 시 비워둠 (향후 기본 이미지 처리)
        };
        
        await addNewBook(bookData);
        
        // 입력 필드 초기화 및 모달 닫기
        document.getElementById('manual-title').value = '';
        document.getElementById('manual-author').value = '';
        manualModal.classList.add('hidden');
    });

    initApp();
});
