// Exile Companion main window, part 8 of 10: event wiring, Home dashboard and Ctrl+K search.
// Classic scripts loaded in order by index.html; they share one global scope, so order matters.
"use strict";
/* ---------------- wiring ---------------- */
function renderAll(){if(window.exileDesktop){publishOverlay();setTimeout(()=>{renderDesktop();renderAccount();publishGear();publishDiscord()},0)}renderHeader();renderBuild();renderProgress();renderShop();renderCampaign();renderMaps();renderAtlas();renderCraft();renderSession();bindItems();try{renderHome();renderSettings();renderNotices();renderNewLeague();renderDataHealth();showGameLabel();renderChars()}catch(e){console.error(e)}}
{const wrap=(f,pick)=>function(){return withBuild(pick(),()=>f.apply(this,arguments))};
 renderBuild=wrap(renderBuild,viewB);renderShop=wrap(renderShop,()=>G);renderCraft=wrap(renderCraft,()=>G);renderCampaign=wrap(renderCampaign,()=>G);
 renderMaps=wrap(renderMaps,liveB);renderAtlas=wrap(renderAtlas,liveB);renderSession=wrap(renderSession,liveB);
 bindItems=wrap(bindItems,viewB);}
function bindItems(){document.querySelectorAll("[data-item]").forEach(b=>b.onclick=()=>{selectedItem=b.dataset.item;selectedSlot=b.dataset.slot;renderBuild();renderCraft();bindItems();showTab("craft")})}
let CUR_TAB="home";
const TAB_LIST=()=>[...document.querySelectorAll("#tabs [data-tab]")].map(b=>b.dataset.tab);
const tabBtn=t=>document.querySelector(`#tabs [data-tab="${t}"]`);
const tabVisible=t=>{const b=tabBtn(t);return !!b&&!b.hidden};
const groupOf=t=>{const b=tabBtn(t);return b?b.dataset.g:"home"};
function syncNav(){
  const g=groupOf(CUR_TAB);
  document.querySelectorAll("#groups [data-group]").forEach(b=>b.setAttribute("aria-current",String(b.dataset.group===g)));
  let vis=0;document.querySelectorAll("#tabs button").forEach(b=>{const on=b.dataset.g===g;b.classList.toggle("gx",!on);if(on&&!b.hidden&&!b.classList.contains("starter-hide"))vis++});
  $("tabs").classList.toggle("solo",vis<=1);
  if(typeof applyStarter==="function")applyStarter();
}
function showTab(name){
  if(!tabVisible(name)) name="home";
  if(typeof starterHidden==="function"&&starterHidden(name))unlockTab(name);
  CUR_TAB=name;if(typeof hideTip==="function")hideTip();
  document.querySelectorAll("#tabs button").forEach(b=>b.setAttribute("aria-selected",b.dataset.tab===name));
  document.querySelectorAll("section.tab").forEach(s=>s.classList.toggle("on",s.id==="tab-"+name));
  try{store.set("tab",name);const L=store.get("navLast",{})||{};L[groupOf(name)]=name;store.set("navLast",L)}catch(e){}
  syncNav();
  if(name==="home") setTimeout(renderHome,0);
  if(name==="settings") setTimeout(renderSettings,0);
  if(name==="craftlab") setTimeout(openCraftLab,0);
  if(name==="filter") setTimeout(openFilterLab,0);
  if(name==="trading") setTimeout(openTradeTools,0);
  if(name==="league") setTimeout(openLeague,0);
  if(name==="buildtools") setTimeout(openBuildTools,0);
  if(name==="media") setTimeout(renderMedia,0);
  if(name==="browser") setTimeout(()=>{renderBrowser();brSync()},0);
  document.body.classList.toggle("browsing",name==="browser"&&!!DESK);
  if(typeof brSync==="function") setTimeout(brSync,0);
  if(name==="trees") setTimeout(renderTrees,0);
  if(name==="maps"&&!$("mapsCards").dataset.loaded){$("mapsCards").dataset.loaded="1";setTimeout(()=>renderCards(false),0)}
  if(location.hash!=="#"+name) history.replaceState(null,"","#"+name);
  window.scrollTo({top:0});
}
$("tabs").onclick=e=>{const t=e.target.closest("button");if(t)showTab(t.dataset.tab)};
$("groups").onclick=e=>{
  if(e.target.closest("#openSearch")){openSearch();return}
  const b=e.target.closest("[data-group]");if(!b)return;const g=b.dataset.group;
  let last=null;try{last=(store.get("navLast",{})||{})[g]}catch(_){}
  const first=[...document.querySelectorAll(`#tabs [data-g="${g}"]`)].find(x=>!x.hidden);
  showTab(last&&tabVisible(last)&&groupOf(last)===g?last:first?first.dataset.tab:"home");
};
window.addEventListener("hashchange",()=>{const h=location.hash.slice(1);if(TAB_LIST().includes(h)&&h!==CUR_TAB)showTab(h)});

/* ---------------- home dashboard ---------------- */
function homeBtns(el){el.querySelectorAll("[data-hgo]").forEach(b=>b.onclick=()=>{if(b.dataset.slot){selectedSlot=b.dataset.slot;renderCraft()}showTab(b.dataset.hgo)})}
function renderHome(){
  if(!$("homeChar")) return;
  const name=S.logInfo&&S.logInfo.name, lvl=(S.logInfo&&S.logInfo.level)||(C||G||{}).level||1;
  let r=null;if(C&&G){try{r=compareAll()}catch(e){r=null}}
  const eta=(()=>{try{return nextLevelEta()}catch(e){return null}})();
  const who=C||G;
  $("homeChar").innerHTML=`<div class="row" style="justify-content:space-between;align-items:flex-end">
      <div><h2>${esc(name||"Your character")}</h2><p class="small muted" style="margin:0">${who?esc(who.ascend||who.className||""):""} · Level ${lvl}${eta&&lvl<100?` · next level in about ${hms(eta.left)}`:""}</p></div>
      ${r?`<div class="big num">${r.overall}%</div>`:""}</div>
    ${r?`<div><div class="small muted">Progress toward your goal build</div><div class="meter"><i style="width:${r.overall}%"></i></div></div>`:
      `<p class="small" style="margin:0">${exG?"Import the build guide you're following as your <b>goal</b>, then your <b>current</b> character, and this shows how close you are.":"Import your <b>current</b> character to see how close you are to the goal build."}</p>`}
    ${(exG||exC)?'<p class="note" style="margin:0">Showing example builds until you import your own.</p>':""}
    <div class="row">${exG?'<button class="btn primary" id="hImpG">Import goal build</button>':""}${!C||exC?`<button class="btn${exG?"":" primary"}" id="hImpC">Import current character</button>`:""}${r?'<button class="btn ghost" data-hgo="progress">See full progress</button>':""}</div>`;
  const ig=$("hImpG");if(ig)ig.onclick=()=>openImport("goal");const ic=$("hImpC");if(ic)ic.onclick=()=>openImport("current");
  homeBtns($("homeChar"));

  // what to do next
  let nx="";
  if(!S.progress.p1){
    const act=(LIVE.zone&&LIVE.zone.act&&LIVE.zone.act<=10)?LIVE.zone.act:(S.campAct||1);
    const A=CAMPAIGN[act-1];
    const left=A.steps.map((x,i)=>({t:x.t,done:!!(S.camp||{})[act+"-"+i]})).filter(x=>!x.done).slice(0,3);
    nx+=`<h3>Campaign · Act ${act}</h3>${left.length?`<ol class="steps tight small">${left.map(x=>`<li>${esc(x.t)}</li>`).join("")}</ol>`:`<p class="small muted" style="margin:0">Act ${act} is done.</p>`}
      <div class="row"><span class="pill">Target level ${A.lvl.join("–")}</span><button class="btn ghost small" data-hgo="campaign">Open campaign</button></div>`;
  } else {
    const p=PROGRESS.find(x=>!S.progress[x.id]);
    nx+=`<h3>Atlas</h3>${p?`<p class="small" style="margin:0">${esc(p.t)}</p><p class="small muted" style="margin:0">${esc(p.tip)}</p>`:'<p class="small" style="margin:0">Every atlas milestone is done.</p>'}
      <div class="row"><button class="btn ghost small" data-hgo="maps">Open maps</button><button class="btn ghost small" data-hgo="atlas">Atlas strategy</button></div>`;
  }
  if(r){const st=nextSteps(r).slice(0,3);
    if(st.length) nx+=`<h3>Build upgrades</h3><ol class="steps tight small">${st.map(x=>`<li><div class="row" style="justify-content:space-between"><span>${esc(x.t)}</span>${x.tab?`<button class="btn ghost small" data-hgo="${x.tab}" data-slot="${esc(x.slot||"")}">${esc(x.btn)}</button>`:""}</div></li>`).join("")}</ol>`;}
  $("homeNext").innerHTML=`<h2>What to do next</h2>${nx}`;
  homeBtns($("homeNext"));

  // session
  const s=S.session, ms=elapsed(), maps=s.maps, timed=maps.filter(m=>m.dur);
  const mapMs=timed.reduce((a,m)=>a+m.dur,0), profit=maps.reduce((a,m)=>a+(+m.profit||0),0), basis=Math.max(ms,mapMs);
  const perHr=basis>60000&&profit?profit/(basis/3.6e6):0;
  $("homeSession").innerHTML=`<h2>This session</h2>
    <div class="stats"><div class="stat"><div class="k">Time</div><div class="v num">${hms(ms)}</div></div>
      <div class="stat"><div class="k">Maps</div><div class="v num">${maps.length}</div></div>
      <div class="stat"><div class="k">Avg map</div><div class="v num">${timed.length?hms(mapMs/timed.length):"–"}</div></div>
      <div class="stat"><div class="k">Per hour</div><div class="v num">${perHr?(S.divine?(perHr/S.divine).toFixed(1)+" div":fmt(perHr)+"c"):"–"}</div></div></div>
    ${goalState()?goalBar(goalState()):""}
    ${S.netLatest?(()=>{const nw=netSeries("day","div");const L=S.netLatest;return `<p class="small" style="margin:0"><b>Net worth</b> ${L.div?(L.total/L.div).toFixed(1)+" div":fmt(L.total)+"c"}${nw.delta!=null?` <span class="delta ${nw.delta>=0?"pos":"neg"}">${nw.delta>=0?"+":""}${nw.fmt(nw.delta)}</span> <span class="muted">in 24 h</span>`:""}</p>`})():""}
    <div class="row"><button class="btn" id="hSess">${s.start?"Pause timer":"Start timer"}</button>${goalState()?"":'<button class="btn ghost" id="hGoal">Set a goal</button>'}<button class="btn ghost" data-hgo="session">Open session</button></div>`;
  $("hSess").onclick=()=>{const t=$("sessToggle");if(t){t.click();renderHome()}};
  if($("hGoal"))$("hGoal").onclick=()=>{showTab("session");scrollToCard("sessGoal");setTimeout(()=>{const i=$("goalN");if(i)i.focus()},400)};
  checkGoal();renderClip();
  homeBtns($("homeSession"));

  // live status
  if(DESK){
    const st=LIVE.status, u=LIVE.update||{}, L=S.netLatest, tr=TRADES.filter(t=>Date.now()-t.t<20*60e3).length;
    const li=(ok,label,detail)=>`<li class="row" style="justify-content:space-between"><span><span class="pill ${ok===true?"good":ok===false?"warn":""}">${label}</span></span><span class="small muted" style="text-align:right">${detail}</span></li>`;
    $("homeLive").innerHTML=`<h2>Live status</h2><ul class="clean" style="display:grid;gap:6px">
      ${li(!!(st&&st.ok),st&&st.ok?"Game log connected":"Game log not found",LIVE.zone?`In ${esc(LIVE.zone.name)} (level ${LIVE.zone.lvl})`:st&&st.ok?"Waiting for a zone change":'<a href="#desktop">Find Client.txt</a>')}
      ${li(LIVE.overlayVisible?true:null,LIVE.overlayVisible?"Overlay on":"Overlay hidden",esc(keyName((LIVE.cfg||{}).overlayHotkey||"Ctrl+Shift+O"))+" to toggle")}
      ${li(tr?true:null,tr?`${tr} trade request${tr>1?"s":""}`:"No trade requests",tr?'<a href="#desktop">Open</a>':"")}
      ${L?li(null,"Net worth",`${L.div?(L.total/L.div).toFixed(1)+" div":fmt(L.total)+"c"} · ${new Date(L.t).toLocaleDateString()}`):""}
      ${li(u.state==="ready"?true:u.state==="error"?false:null,u.state==="ready"?`Update ${esc(u.version||"")} ready`:`Version ${esc(u.current||(LIVE.cfg&&LIVE.cfg.version)||"?")}`,u.state==="ready"?'<button class="btn primary small" id="hUp">Restart & update</button>':u.state==="current"?"Up to date":"")}
    </ul>`;
    const hu=$("hUp");if(hu)hu.onclick=()=>DESK.installUpdate();
  } else {
    $("homeLive").innerHTML=`<h2>Desktop app</h2><p class="small" style="margin:0">The Windows app adds a live game log, an in-game overlay, price checks (Ctrl+C then Ctrl+D), stash net worth and trade alerts, and updates itself.</p>
      <div class="row"><a class="btn" href="https://github.com/nickolusliquori/exile-companion/releases/latest" target="_blank" rel="noopener">Download for Windows</a></div>`;
  }

  // quick actions
  const q=[["Import a build","Paste a PoB code or pobb.in link",()=>openImport()],["Search","Find any page or card · Ctrl+K",()=>openSearch()]];
  if(DESK){q.push([LIVE.overlayVisible?"Hide overlay":"Show overlay","Shows on top of the game",()=>{DESK.toggleOverlay(!LIVE.overlayVisible);setTimeout(renderHome,300)}]);
    if($("nwSnap"))q.push(["Net worth snapshot","Price your chosen stash tabs",()=>{showTab("account");$("nwSnap").click()}]);
    if($("csNow"))q.push(["Sync character","Pull gear and tree from your account",()=>{showTab("account");$("csNow").click()}]);
    q.push(["Settings & hotkeys","Hotkeys, account, Discord, updates",()=>showTab("settings")]);}
  q.push(["Shopping list","Gems and items to pick up",()=>showTab("shop")],["Crafting","Plan upgrades and money crafts",()=>showTab("craft")]);
  $("homeQuick").innerHTML=`<h2>Quick actions</h2><div class="hgrid">${q.map((x,i)=>`<button class="btn ghost" data-hq="${i}"><b>${esc(x[0])}</b><small>${esc(x[1])}</small></button>`).join("")}</div>`;
  $("homeQuick").querySelectorAll("[data-hq]").forEach(b=>b.onclick=()=>q[+b.dataset.hq][2]());
}
setInterval(()=>{if(CUR_TAB==="home"&&!document.hidden)renderHome()},10000);

/* ---------------- Ctrl+K search ---------------- */
const cmdk=$("cmdk");let CMDK=[],CMDK_SEL=0,CMDK_ITEMS=[];
function cmdkIndex(){
  const out=[], names={};document.querySelectorAll("#tabs [data-tab]").forEach(b=>names[b.dataset.tab]=b.textContent.trim());
  const acts=[["Import goal build",()=>openImport("goal")],["Import current character",()=>openImport("current")],["Run setup wizard",()=>openWizard()],["Report a problem",()=>openReport()],["Edit my loot filter",()=>showTab("filter")],["Build a map search",()=>showTab("trading")],["Plan Threads per map",()=>showTab("league")],["Chaos recipe sets",()=>{showTab("account");scrollToCard("acctRecipe")}],["Saved trade searches",()=>{showTab("trading");scrollToCard("ttSaved")}],["Set a session goal",()=>{showTab("session");scrollToCard("sessGoal")}],["Recent price checks",()=>{showTab("home");scrollToCard("homeClip")}],["Open the media player",()=>{if(DESK&&DESK.mediaToggle)DESK.mediaToggle({show:true})}],["Media controls",()=>showTab("media")],["Pin the browser over the game",()=>{if(DESK&&DESK.pinToggle)DESK.pinToggle({show:true})}],["Take the tour",()=>startTour()],["Show all pages",()=>setMode("full")],["Find gear upgrades",()=>{showTab("buildtools");scrollToCard("btUpg")}],["Timeless jewel lookup",()=>showTab("buildtools")],["Cluster jewel notables",()=>{showTab("buildtools");scrollToCard("btCluster")}],["Gem levelling profit",()=>{showTab("buildtools");scrollToCard("btGems")}],["Betrayal board",()=>{showTab("league");scrollToCard("lgBetrayal")}],["Price a dump tab",()=>{showTab("trading");scrollToCard("ttDump")}],["Open the trade site",()=>{showTab("browser");brGo("https://www.pathofexile.com/trade")}],["Open poe.ninja",()=>{showTab("browser");brGo("https://poe.ninja/economy")}],["Open the wiki",()=>{showTab("browser");brGo("https://www.poewiki.net/wiki/Path_of_Exile_Wiki")}],[S.compact?"Turn compact mode off":"Turn compact mode on",()=>setCompact(!S.compact)]];
  {const cl=charList();if(cl){for(const x of cl.list)if(x.id!==cl.active)acts.push([`Switch to ${x.name}`,()=>switchChar(x.id)])}acts.push(["New character",()=>{ensureChars();promptNewChar()}])}
  if(DESK)acts.push(["Change hotkeys",()=>{showTab("settings");scrollToCard("setHotkeys")}]);
  if($("sessToggle"))acts.push([S.session.start?"Pause session timer":"Start session timer",()=>$("sessToggle").click()]);
  if(DESK){acts.push([LIVE.overlayVisible?"Hide overlay":"Show overlay",()=>DESK.toggleOverlay(!LIVE.overlayVisible)]);
    if($("upCheck"))acts.push(["Check for app updates",()=>{showTab("desktop");$("upCheck").click()}]);
    if($("nwSnap"))acts.push(["Take net worth snapshot",()=>{showTab("account");$("nwSnap").click()}]);
    if($("csNow"))acts.push(["Sync character now",()=>{showTab("account");$("csNow").click()}]);
    if($("bkSave"))acts.push(["Save a backup",()=>{showTab("desktop");$("bkSave").click()}]);}
  acts.forEach(([t,run])=>out.push({k:"Action",t,run,top:1}));
  document.querySelectorAll("#tabs [data-tab]").forEach(b=>{if(!b.hidden)out.push({k:"Page",t:b.textContent.trim(),run:()=>showTab(b.dataset.tab),top:1})});
  document.querySelectorAll("section.tab").forEach(sec=>{const tab=sec.id.slice(4);if(!tabVisible(tab))return;
    sec.querySelectorAll(".card").forEach(c=>{if(c.hidden)return;const h=c.querySelector("h2");const t=h&&h2Text(h);if(!t)return;
      out.push({k:names[tab],t,run:()=>{showTab(tab);setTimeout(()=>{c.scrollIntoView({block:"start",behavior:"smooth"});c.classList.remove("flash");void c.offsetWidth;c.classList.add("flash")},40)}})})});
  const seen=new Set();document.querySelectorAll("#tab-build [data-item]").forEach(b=>{const ln=(b.innerText||b.textContent).split(/\n+/).map(x=>x.trim()).filter(Boolean);const t=(ln.length>=2?ln[1]+" · "+ln[0]:ln[0]||"").slice(0,80);if(!t||seen.has(t))return;seen.add(t);out.push({k:"Item",t,run:()=>b.click()})});
  return out;
}
function fuzzy(q,t){
  const s=t.toLowerCase();const i=s.indexOf(q);
  if(i>=0) return {sc:200-i+(i===0||/\W/.test(s[i-1])?60:0)-s.length*.2,h:esc(t.slice(0,i))+"<mark>"+esc(t.slice(i,i+q.length))+"</mark>"+esc(t.slice(i+q.length))};
  let j=0,sc=0,h="",prev=-2;
  for(let k=0;k<t.length;k++){if(j<q.length&&s[k]===q[j]){sc+=(k===prev+1?6:1)+(k===0||/\W/.test(s[k-1])?8:0);prev=k;j++;h+="<mark>"+esc(t[k])+"</mark>"}else h+=esc(t[k])}
  return j===q.length?{sc:sc-s.length*.2,h}:null;
}
function cmdkRender(){
  const q=$("cmdkQ").value.trim().toLowerCase();let res;
  if(!q) res=CMDK.filter(x=>x.top).map(x=>({x,h:esc(x.t),sc:0}));
  else res=CMDK.map(x=>{let m=fuzzy(q,x.t);if(!m&&q.includes(" ")){const hay=(x.t+" "+x.k).toLowerCase();if(q.split(/\s+/).every(w=>hay.includes(w)))m={sc:20,h:esc(x.t)}}
      if(!m&&x.k&&x.k.toLowerCase().startsWith(q))m={sc:5,h:esc(x.t)};return m?{x,h:m.h,sc:m.sc+(x.k==="Page"?30:0)}:null}).filter(Boolean).sort((a,b)=>b.sc-a.sc);
  CMDK_ITEMS=res.slice(0,40);CMDK_SEL=Math.min(CMDK_SEL,Math.max(0,CMDK_ITEMS.length-1));
  $("cmdkList").innerHTML=CMDK_ITEMS.length?CMDK_ITEMS.map((r,i)=>`<li role="option" data-i="${i}" aria-selected="${i===CMDK_SEL}"><span>${r.h}</span><span class="k">${esc(r.x.k||"")}</span></li>`).join(""):'<li class="empty">Nothing matches. Try a page name like "maps" or a card like "net worth".</li>';
  const sel=$("cmdkList").querySelector('[aria-selected="true"]');if(sel)sel.scrollIntoView({block:"nearest"});
}
function cmdkRun(i){const r=CMDK_ITEMS[i];if(!r)return;cmdk.close();r.x.run()}
function openSearch(){if(cmdk.open)return;CMDK=cmdkIndex();CMDK_SEL=0;$("cmdkQ").value="";cmdkRender();try{cmdk.showModal()}catch(e){cmdk.setAttribute("open","")}setTimeout(()=>$("cmdkQ").focus(),20)}
$("cmdkQ").oninput=()=>{CMDK_SEL=0;cmdkRender()};
$("cmdkQ").onkeydown=e=>{
  if(e.key==="ArrowDown"){e.preventDefault();CMDK_SEL=Math.min(CMDK_SEL+1,CMDK_ITEMS.length-1);cmdkRender()}
  else if(e.key==="ArrowUp"){e.preventDefault();CMDK_SEL=Math.max(CMDK_SEL-1,0);cmdkRender()}
  else if(e.key==="Enter"){e.preventDefault();cmdkRun(CMDK_SEL)}
};
$("cmdkList").onclick=e=>{const li=e.target.closest("[data-i]");if(li)cmdkRun(+li.dataset.i)};
cmdk.onclick=e=>{if(e.target===cmdk)cmdk.close()};
document.addEventListener("keydown",e=>{
  if((e.ctrlKey||e.metaKey)&&!e.altKey&&!e.shiftKey&&e.key.toLowerCase()==="k"){e.preventDefault();cmdk.open?cmdk.close():openSearch();return}
  const typing=/^(INPUT|TEXTAREA|SELECT)$/.test((e.target||{}).tagName||"")||(e.target&&e.target.isContentEditable);
  if(e.key==="/"&&!typing&&!document.querySelector("dialog[open]")){e.preventDefault();openSearch()}
});
