// Anchor navigation to the visible viewport, including iOS standalone keyboard transitions.
const mobileFooter25=document.querySelector('.bottomnav');let footerFrame25=0,footerTimers25=[];
function placeFooter25(){footerFrame25=0;if(!mobileFooter25||!matchMedia('(max-width:600px)').matches){document.documentElement.style.removeProperty('--planner-nav-top25');return;}const viewport=window.visualViewport,height=viewport?.height||innerHeight,offset=viewport?.offsetTop||0,navHeight=mobileFooter25.offsetHeight;if(!navHeight)return;document.documentElement.style.setProperty('--planner-visible-height25',height+'px');document.documentElement.style.setProperty('--planner-nav-height25',navHeight+'px');document.documentElement.style.setProperty('--planner-nav-top25',Math.max(0,offset+height-navHeight)+'px');}
function queueFooter25(){if(!footerFrame25)footerFrame25=requestAnimationFrame(placeFooter25);}
function settleFooter25(){queueFooter25();footerTimers25.forEach(clearTimeout);footerTimers25=[80,250,500].map(delay=>setTimeout(queueFooter25,delay));}
for(const event of ['resize','scroll'])window.addEventListener(event,queueFooter25,{passive:true});
for(const event of ['resize','scroll'])window.visualViewport?.addEventListener(event,queueFooter25,{passive:true});
for(const event of ['orientationchange','pageshow'])window.addEventListener(event,settleFooter25,{passive:true});
for(const event of ['focusin','focusout'])document.addEventListener(event,settleFooter25);
document.addEventListener('visibilitychange',()=>{if(!document.hidden)settleFooter25();});
if(window.ResizeObserver)new ResizeObserver(queueFooter25).observe(mobileFooter25);
const viewportStyle25=document.createElement('style');viewportStyle25.textContent='@media(max-width:600px){.bottomnav{position:fixed!important;top:var(--planner-nav-top25,calc(100dvh - 82px - env(safe-area-inset-bottom)))!important;bottom:auto!important;left:0!important;right:0!important;width:100%!important;height:max-content!important;margin:0!important;transform:translate3d(0,0,0);backface-visibility:hidden;isolation:isolate;z-index:1000;box-shadow:0 -2px 10px #182d3210}body[data-mobile-view] .shell{padding-bottom:calc(var(--planner-nav-height25,82px) + 16px)!important}body[data-mobile-view="map"] #map{height:calc(var(--planner-visible-height25,100dvh) - 112px - var(--planner-nav-height25,82px))!important}}';document.head.append(viewportStyle25);
const footerSwitch25=switchView;switchView=function(view){footerSwitch25(view);settleFooter25();};
settleFooter25();
releaseButton.textContent='v1.25';releaseButton.setAttribute('aria-label','版本 v1.25，查看更新紀錄');const entry25=document.createElement('article');entry25.className='release-entry';entry25.innerHTML='<b>v1.25</b><time>2026-10-05</time><p>修正手機底部頁籤在捲動、鍵盤收合、旋轉與返回網頁時停留在內容中間的問題。</p>';releaseHistory.querySelector('h2').after(entry25);
