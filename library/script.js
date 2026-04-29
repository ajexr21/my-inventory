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
    function renderBooks() {
        if (books.length === 0) {
            bookListContainer.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-book-medical"></i>
                    <p>아직 등록된 책이 없어요.<br>바코드로 책을 등록해볼까요?</p>
                </div>`;
            return;
        }

        bookListContainer.innerHTML = books.map(book => `
            <div class="book-card" onclick="openBookDetail('${book.id}')">
                <img src="${book.cover_url || 'https://via.placeholder.com/150x200?text=No+Cover'}" class="book-cover" alt="${book.title}">
                <div class="status-badge" style="color: ${getStatusColor(book.status)}">
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
        totalBooksEl.textContent = finishedCount;
        
        const progress = Math.min((finishedCount / currentGoal) * 100, 100);
        goalProgressEl.style.width = `${progress}%`;
        remainingBooksEl.textContent = Math.max(currentGoal - finishedCount, 0);
    }

    // 7. 칭찬 도장 렌더링
    function renderStamps() {
        const finishedCount = books.filter(b => b.status === 'finished').length;
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
        if (html5QrcodeScanner && html5QrcodeScanner.isScanning) {
            html5QrcodeScanner.stop().then(() => {
                stopScanBtn.classList.add('hidden');
            });
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
            
            if (target === 'tab-scan') {
                startScanner();
            } else {
                stopScanner();
            }
        });
    });

    stopScanBtn.addEventListener('click', stopScanner);

    // 테마 토글
    themeToggleBtn.addEventListener('click', () => {
        const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
        if (isDark) {
            document.documentElement.removeAttribute('data-theme');
        } else {
            document.documentElement.setAttribute('data-theme', 'dark');
        }
    });

    initApp();
});
