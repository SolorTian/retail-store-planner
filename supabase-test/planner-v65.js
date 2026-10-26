releaseButton.textContent='v1.65';
releaseButton.setAttribute('aria-label','版本 v1.65，查看更新紀錄');
const release65=document.createElement('article');release65.className='release-entry';
release65.innerHTML='<b>v1.65</b><time>2026-10-26</time><p>全員資料每日自動更新改為台灣時間早上 07:00 開始，無需開啟網頁。完成進度依實際執行結果顯示。</p>';
releaseHistory.querySelector('h2').after(release65);