releaseButton.textContent='v1.64';
releaseButton.setAttribute('aria-label','版本 v1.64，查看更新紀錄');
const release64=document.createElement('article');release64.className='release-entry';
release64.innerHTML='<b>v1.64</b><time>2026-10-26</time><p>全員資料改由後台每天台灣時間早上 07:50 自動更新，關閉網頁也能執行。開站只查看更新狀態，保留管理者手動更新；沿用防重複與帳號權限，更新不重新安排路線。排程可能因後台排隊稍有延遲。</p>';
releaseHistory.querySelector('h2').after(release64);