// Exile Companion main window, part 10 of 10: Report a problem and the in-app browser page.
// Classic scripts loaded in order by index.html; they share one global scope, so order matters.
"use strict";
/* ---------------- Report a problem ---------------- */
const REPORT_ISSUES="https://github.com/nickolusliquori/exile-companion/issues/new";
function redactText(t,ctx){
  t=String(t==null?"":t);const esc2=s=>String(s).replace(/[.*+?^${}()|[\]\\]/g,"\\$&");
  if(ctx&&ctx.home){t=t.replace(new RegExp(esc2(ctx.home),"gi"),"~").replace(new RegExp(esc2(ctx.home.replace(/\\/g,"/")),"gi"),"~")}
  t=t.replace(/([A-Za-z]:[\\/]+Users[\\/]+)[^\\/\s"']+/gi,"$1<user>").replace(/(\/(?:home|Users)\/)[^/\s"']+/g,"$1<user>");
  if(ctx&&ctx.user&&ctx.user.length>2)t=t.replace(new RegExp(`\\b${esc2(ctx.user)}\\b`,"gi"),"<user>");
  t=t.replace(/POESESSID\s*[=:]\s*\S+/gi,"POESESSID=[redacted]").replace(/\b[a-f0-9]{32}\b/gi,"[redacted]")
   .replace(/\b(Bearer|access_token|refresh_token|code_verifier|token)(["'\s:=]+)[\w.\-~+/]{8,}/gi,"$1$2[redacted]").replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g,"[email]");
  return t;
}
let REPORT_DIAG=null;
function buildReport(){
  const d=REPORT_DIAG||{}, ctx=d.redactCtx||{};
  const what=$("rpWhat").value.trim(), doing=$("rpDoing").value.trim(), more=$("rpMore").checked;
  const ts=t=>new Date(t).toLocaleTimeString();
  const L=[];
  L.push("## What went wrong",what||"(not described)","");
  if(doing)L.push("## What I was doing",doing,"");
  L.push("## App");
  L.push(`- Exile Companion ${d.app||"web"} (${DESK?"desktop":"web version"})`);
  if(DESK)L.push(`- Electron ${d.electron} · Chrome ${d.chrome} · Node ${d.node}${d.packaged===false?" · development build":""}`,`- ${d.os} · locale ${d.locale} · displays ${(d.displays||[]).join(", ")}`,`- Memory ${d.memoryMB} MB · running ${d.uptimeMin} min`);
  else L.push(`- Browser: ${navigator.userAgent}`);
  L.push(`- Window ${innerWidth}x${innerHeight} @${devicePixelRatio}x · page "${CUR_TAB}" · compact ${S.compact?"on":"off"}`,"");
  if(more){
    L.push("## Status");
    L.push(`- Goal build: ${G?`${G.ascend||G.className} lv ${G.level}${exG?" (example)":""}`:"none"}`,`- Current build: ${C?`${C.ascend||C.className} lv ${C.level}${exC?" (example)":""}`:"none"}`);
    if(DESK){const st=LIVE.status,a=ACCT.status||{};
      L.push(`- Game log: ${st&&st.ok?"connected":"not connected"}${d.log?` (path set: ${d.log.set}, file exists: ${d.log.exists})`:""}${st&&!st.ok&&st.message?` · ${st.message}`:""}`);
      L.push(`- Zone: ${LIVE.zone?`${LIVE.zone.name} (${LIVE.zone.id}, level ${LIVE.zone.lvl})`:"none yet"}`,`- Overlay: ${LIVE.overlayVisible?"visible":"hidden"}${LIVE.interactive?" · click mode":""}`);
      L.push(`- Account: ${a.signedIn?"signed in with GGG":"public profile"} · POESESSID saved: ${a.hasSession?"yes":"no"} · encryption available: ${a.encrypted===false?"no":"yes"}`);
      L.push(`- Update: ${d.update?`${d.update.state}${d.update.version?" "+d.update.version:""}${d.update.message?" · "+d.update.message:""}`:"?"}`);
      L.push(`- Maps this session: ${S.session.maps.length} · net worth snapshot: ${S.netLatest?new Date(S.netLatest.t).toLocaleString():"none"}`);}
    L.push("");
    if(DESK&&d.cfg){L.push("## Settings","```json",JSON.stringify(d.cfg,null,1),"```","")}
    const rErr=(window.__ERRS||[]).slice(-20);
    L.push("## Recent errors in the app window",rErr.length?rErr.map(e=>`- ${ts(e.t)} [${e.k}] ${e.m}`).join("\n"):"- none","");
    if(DESK){L.push("## Recent background errors",(d.errors||[]).length?d.errors.map(e=>`- ${ts(e.t)} ${e.m}`).join("\n"):"- none","");
      L.push("## Recent warnings",(d.warnings||[]).length?d.warnings.map(e=>`- ${ts(e.t)} ${e.m}`).join("\n"):"- none","");
      L.push("## Log (last lines)","```",(d.logTail||[]).length?d.logTail.join("\n"):"(empty)","```","");}
  }
  L.push(`_Report created ${new Date().toISOString()}. Account secrets (POESESSID, sign-in tokens) are never included; your Windows user name and e-mail addresses are removed._`);
  return redactText(L.join("\n"),ctx);
}
function refreshReport(){$("rpPreview").textContent=buildReport();$("rpCount").textContent=`${$("rpPreview").textContent.length.toLocaleString()} characters`}
async function openReport(){
  const dlg2=$("reportDlg");REPORT_DIAG=null;
  if(DESK&&DESK.diagnostics){try{REPORT_DIAG=await DESK.diagnostics()}catch(e){REPORT_DIAG=null}}
  $("rpMsg").textContent="";$("rpSave").hidden=!(DESK&&DESK.saveReport);refreshReport();
  try{dlg2.showModal()}catch(e){dlg2.setAttribute("open","")}setTimeout(()=>$("rpWhat").focus(),30);
}
async function copyText(t){try{await navigator.clipboard.writeText(t);return true}catch(e){const ta=document.createElement("textarea");ta.value=t;document.body.appendChild(ta);ta.select();let ok=false;try{ok=document.execCommand("copy")}catch(_){}ta.remove();return ok}}
["rpWhat","rpDoing"].forEach(id=>$(id).addEventListener("input",refreshReport));$("rpMore").onchange=refreshReport;
$("rpCopy").onclick=async()=>{const ok=await copyText(buildReport());$("rpMsg").textContent=ok?"Copied. Paste it wherever you're reporting the problem.":"Couldn't copy. Select the text under \"See exactly what's included\" and copy it."};
$("rpSave").onclick=async()=>{const n=await DESK.saveReport(buildReport());if(n)$("rpMsg").textContent=`Saved as ${n}.`};
$("rpIssue").onclick=async()=>{
  const full=buildReport();await copyText(full);
  const what=$("rpWhat").value.trim();const title=(what.split("\n")[0]||"Problem report").slice(0,80);
  let body=full;if(body.length>1200)body=body.slice(0,1200)+"\n\n…the full report is on your clipboard: paste it below this line (Ctrl+V).\n";
  let url=`${REPORT_ISSUES}?labels=bug&title=${encodeURIComponent(title)}&body=${encodeURIComponent(body)}`;
  while(url.length>2000&&body.length>200){body=body.slice(0,body.length-200)+"\n…paste the full report from your clipboard.";url=`${REPORT_ISSUES}?labels=bug&title=${encodeURIComponent(title)}&body=${encodeURIComponent(body)}`}
  if(DESK&&DESK.openExternal)DESK.openExternal(url);else window.open(url,"_blank","noopener");
  $("rpMsg").textContent="Opening GitHub. The full report is also on your clipboard. You need a free GitHub account to post.";
};
$("rpClose").onclick=()=>$("reportDlg").close();
// offer a report the first time something breaks in this session
{let offered=false;const n0=(window.__ERRS||[]).length;window.__onAppError=()=>{if(offered||!document.body)return;offered=true;setTimeout(()=>toast("Something went wrong in the app.",()=>openReport(),"Report it"),300)};if(n0)setTimeout(window.__onAppError,3000);}

/* ---------------- in-app browser page ---------------- */
const BR_LINKS=[["Trade","https://www.pathofexile.com/trade"],["Currency exchange","https://www.pathofexile.com/trade/exchange"],["poe.ninja","https://poe.ninja/economy"],["Builds","https://poe.ninja/builds"],["Wiki","https://www.poewiki.net/wiki/Path_of_Exile_Wiki"],["poedb","https://poedb.tw/us/"],["Lab layout","https://www.poelab.com/"],["Craft of Exile","https://www.craftofexile.com/"],["FilterBlade","https://www.filterblade.xyz/?game=Poe1"],["poe.re","https://poe.re/"],["pobb.in","https://pobb.in/"]];
const BR={state:null,blocked:null,last:"",started:false};
function brUrlFrom(v){v=String(v||"").trim();if(!v)return null;if(/^https?:\/\//i.test(v))return v.replace(/^http:/i,"https:");if(/^[\w-]+(\.[\w-]+)+(\/\S*)?$/.test(v))return "https://"+v;return "https://www.poewiki.net/index.php?search="+encodeURIComponent(v)}
function brGo(v){const u=brUrlFrom(v);if(!u)return;BR.asked=true;if(!DESK){window.open(u,"_blank","noopener");return}BR.blocked=null;DESK.browserGo(u);renderBrowserBar()}
function renderBrowser(){
  const el=$("browserPage");if(!el)return;
  if(!DESK){el.innerHTML=`<div class="card hl"><h2>Browser</h2><p class="small" style="margin:0">In the desktop app, these sites open inside the app, signed in and next to your build. Here they open in a new tab.</p><div class="row">${BR_LINKS.map(([l,u])=>`<a class="btn ghost small" href="${esc(u)}" target="_blank" rel="noopener">${esc(l)}</a>`).join("")}</div></div>`;return}
  if(!$("brBar")){el.innerHTML=`<div class="card br-bar" id="brBar"></div><div id="brHost" class="br-host" aria-label="Web page"><div class="br-empty">${emptyBox("Pick a site above, or type an address or a wiki search.")}</div></div>`}
  renderBrowserBar();
  if(!BR.started){BR.started=true;DESK.browserState().then(st=>{if(st&&st.url&&st.url!=="about:blank"){BR.state=st;renderBrowserBar()}else if(!BR.asked)brGo(S.browserLast||BR_LINKS[0][1])})}
}
/* trade searches: an automatic history of the last 30, and the ones you save */
const TRADE_RE=/^https:\/\/(www\.)?pathofexile\.com\/trade\/(search|exchange)\/([^/?#]+)\/([A-Za-z0-9]+)/;
function tradeKey(u){const m=String(u||"").match(TRADE_RE);return m?{kind:m[2],league:decodeURIComponent(m[3]),id:m[4],url:`https://www.pathofexile.com/trade/${m[2]}/${m[3]}/${m[4]}`}:null}
function rememberTradeSearch(u){const k=tradeKey(u);if(!k)return;S.tradeHist=(S.tradeHist||[]).filter(h=>h.url!==k.url);S.tradeHist.unshift({...k,t:Date.now()});S.tradeHist=S.tradeHist.slice(0,30)}
function saveTradeSearch(u,name){const k=tradeKey(u);if(!k)return false;S.tradeSaved=(S.tradeSaved||[]).filter(h=>h.url!==k.url);S.tradeSaved.unshift({...k,name:(name||"").trim()||`${k.kind==="exchange"?"Bulk exchange":"Search"} ${new Date().toLocaleDateString()}`,t:Date.now()});save();return true}
function renderBrowserBar(){
  const bar=$("brBar");if(!bar)return;const st=BR.state||{};const editing=document.activeElement&&document.activeElement.id==="brAddr";
  const host=(()=>{try{return new URL(st.url).hostname.replace(/^www\./,"")}catch(e){return ""}})();
  bar.innerHTML=`<div class="br-row">
      <button class="btn ghost small" id="brBack" aria-label="Back"${st.canBack?"":" disabled"}>◀</button>
      <button class="btn ghost small" id="brFwd" aria-label="Forward"${st.canForward?"":" disabled"}>▶</button>
      <button class="btn ghost small" id="brReload" aria-label="${st.loading?"Stop":"Reload"}">${st.loading?"✕":"⟳"}</button>
      <form id="brForm" class="br-addr"><input id="brAddr" type="text" spellcheck="false" autocomplete="off" aria-label="Address or wiki search" placeholder="Address, or search the wiki" value="${esc(editing?$("brAddr").value:(st.url&&st.url!=="about:blank"?st.url:""))}"></form>
      <button class="btn ghost small" id="brSave" title="Save this trade search"${tradeKey(st.url)?"":" hidden"}>${(S.tradeSaved||[]).some(x=>tradeKey(st.url)&&x.url===tradeKey(st.url).url)?"★ Saved":"☆ Save search"}</button>
      <button class="btn ghost small" id="brPin" title="Show this page in a window over the game (${esc(keyName((LIVE.cfg&&LIVE.cfg.pinHotkey)||"Ctrl+Shift+B"))})"${DESK.pinToggle?"":" hidden"}>Pin over game</button>
      <button class="btn ghost small" id="brExt" title="Open this page in your own web browser"${st.url&&/^https:/.test(st.url)?"":" disabled"}>Open in my browser</button>
    </div>
    <div class="br-row br-links">${BR_LINKS.map(([l,u])=>`<button class="btn ghost small" data-brgo="${esc(u)}">${esc(l)}</button>`).join("")}</div>
    <div class="small br-status">${BR.blocked?`<span style="color:var(--warn)">${BR.blocked.reason==="download"?"Downloads are blocked in the app's browser.":`The app only opens trusted Path of Exile sites itself; this link goes to <b>${esc((()=>{try{return new URL(BR.blocked.url).hostname}catch(e){return BR.blocked.url}})())}</b>.`}</span> <button class="btn primary small" id="brBlockedOpen">Open in my browser</button> <button class="btn ghost small" id="brBlockedX">Dismiss</button>`
      :st.error?`<span style="color:var(--warn)">Couldn't load the page: ${esc(st.error)}</span>`
      :/just a moment|attention required|verify you are human|security check/i.test(st.title||"")?`<span class="muted">Cloudflare is checking that you're human. Tick the box if one shows. Stuck?</span> <button class="btn ghost small" id="brCfOpen">Open in my browser</button>`
      :`<span class="muted">${st.loading?"Loading…":esc(st.title||"")}${host?` · ${esc(host)}`:""}</span>`}</div>`;
  $("brBack").onclick=()=>DESK.browserNav("back");$("brFwd").onclick=()=>DESK.browserNav("forward");
  $("brReload").onclick=()=>DESK.browserNav(st.loading?"stop":"reload");
  $("brForm").onsubmit=e=>{e.preventDefault();brGo($("brAddr").value);$("brAddr").blur()};
  $("brExt").onclick=()=>{if(st.url)DESK.browserExternal(st.url)};
  $("brSave").onclick=()=>{const k=tradeKey(st.url);if(!k)return;if((S.tradeSaved||[]).some(x=>x.url===k.url)){toast("Already saved. Rename or remove it on the Trading page.");return}saveTradeSearch(st.url,"");renderBrowserBar();toast("Search saved. Find it on the Trading page.",()=>{S.tradeSaved=S.tradeSaved.filter(x=>x.url!==k.url);save();renderBrowserBar()})};
  $("brPin").onclick=()=>{if(DESK.pinToggle)DESK.pinToggle({show:true,url:st.url&&/^https:/.test(st.url)?st.url:null})};
  bar.querySelectorAll("[data-brgo]").forEach(b=>b.onclick=()=>brGo(b.dataset.brgo));
  const bo=$("brBlockedOpen");if(bo)bo.onclick=()=>{DESK.browserExternal(BR.blocked.url);BR.blocked=null;renderBrowserBar()};
  const bx=$("brBlockedX");if(bx)bx.onclick=()=>{BR.blocked=null;renderBrowserBar()};
  const cf=$("brCfOpen");if(cf)cf.onclick=()=>{if(st.url)DESK.browserExternal(st.url)};
  if(editing){const a=$("brAddr");a.focus();a.setSelectionRange(a.value.length,a.value.length)}
}
// keep the native web view over the page's host box; hide it whenever something should sit on top
function brSync(){
  if(!DESK||!DESK.browserBounds)return;
  const host=$("brHost");let b={visible:false};
  if(CUR_TAB==="browser"&&host&&!document.hidden&&!document.querySelector("dialog[open]")){
    const top=host.getBoundingClientRect().top;host.style.height=Math.max(200,(innerHeight-top-12)/ZF())+"px";
    const r=host.getBoundingClientRect();if(r.width>50&&r.height>50)b={visible:true,x:r.left,y:r.top,width:r.width,height:r.height};
  }
  const key=JSON.stringify(b);if(key!==BR.last){BR.last=key;DESK.browserBounds(b)}
}
if(DESK&&DESK.onBrowserState){
  DESK.onBrowserState(st=>{BR.state=st;if(st&&st.url&&/^https:/.test(st.url)&&!st.error){S.browserLast=st.url;rememberTradeSearch(st.url);save()}if(CUR_TAB==="browser")renderBrowserBar()});
  DESK.onBrowserBlocked(x=>{BR.blocked=x;if(CUR_TAB!=="browser")showTab("browser");renderBrowserBar()});
  if(DESK.onCraftItem)DESK.onCraftItem(it=>{if(!it||!it.base)return;showTab("craftlab");openCraftLab(it);toast(`Opened ${it.base} in the Craft lab.`)});
  if(DESK.onMediaNow){DESK.onMediaNow(n=>{MNOW=n;if(CUR_TAB==="media")renderMedia()});DESK.onMediaPlayer(s=>{MPL=s;if(CUR_TAB==="media"&&!(document.activeElement&&/mpVol|mpOp|mpUrl/.test(document.activeElement.id)))renderMedia()})}
  if(DESK.clipHistory){DESK.clipHistory().then(h=>{CLIP=h||[];renderClip()}).catch(()=>{});DESK.onClipHistory(h=>{CLIP=h||[];renderClip()})}
  DESK.onBrowserShow(x=>{BR.started=true;BR.blocked=null;if(CUR_TAB!=="browser")showTab("browser");BR.state={...(BR.state||{}),url:x.url,loading:true};renderBrowserBar()});
  setInterval(brSync,150);addEventListener("resize",brSync);
}

const dlg=$("importDlg");
const openImport=slot=>{if(typeof slot!=="string")slot=exG?"goal":"current";$(slot==="current"?"slotCur":"slotGoal").checked=true;$("pobCode").value="";$("pobFile").value="";$("importStatus").textContent="";$("importStatus").className="status";try{dlg.showModal()}catch(e){dlg.setAttribute("open","")}setTimeout(()=>$("pobCode").focus(),50)};
$("openImport").onclick=openImport;$("openImport2").onclick=openImport;
$("importCancel").onclick=()=>dlg.close();
$("pobFile").onchange=async e=>{const f=e.target.files[0];if(!f)return;$("pobCode").value=await f.text();$("importStatus").textContent="File loaded. Tap Load build.";$("importStatus").className="status ok"};
$("importGo").onclick=async()=>{
  const st=$("importStatus");st.className="status";st.textContent="Unpacking…";
  try{const slot=$("slotCur").checked?"current":"goal";
    await importBuild($("pobCode").value,slot);st.className="status ok";st.textContent="Loaded.";dlg.close();
    showTab(slot==="current"?(G&&!exG?"progress":"build"):(C&&!exC?"progress":"build"))}
  catch(err){st.className="status err";st.textContent=err.message||"Couldn't read that build."}
};

const EXAMPLE_CURRENT=EXAMPLE_XML
  .replace('level="91"','level="80"').replace('"Life" value="4820"','"Life" value="3950"').replace('"CombinedDPS" value="2650000"','"CombinedDPS" value="940000"')
  .replace('"TotalEHP" value="21500"','"TotalEHP" value="12800"').replace('"ColdResist" value="75"','"ColdResist" value="63"').replace('"ChaosResist" value="-8"','"ChaosResist" value="-31"')
  .replace('"SpellSuppressionChance" value="100"','"SpellSuppressionChance" value="62"')
  .replace(/nodes="[^"]*"/,'nodes="'+Array.from({length:96},(_,i)=>i<88?i+100:i+400).join(",")+'"').replace('title="Level 91"','title="My character"')
  .replace('nameSpec="Lightning Arrow" skillId="LightningArrow" level="21" quality="20"','nameSpec="Lightning Arrow" skillId="LightningArrow" level="18" quality="11"')
  .replace(/<Gem nameSpec="Increased Critical Damage"[^>]*\/>/,"").replace(/<Gem nameSpec="Trinity"[^>]*\/>/,"")
  .replace("+98 to maximum Life\n121% increased","+61 to maximum Life\n121% increased").replace("+20% chance to Suppress Spell Damage\n","")
  .replace(/<Item id="3">[\s\S]*?<\/Item>/,'<Item id="3">Rarity: RARE\nWhisper Pelt\nZodiac Leather\nItem Level: 74\nImplicits: 0\n+52 to maximum Life\n+30% to Fire Resistance</Item>')
  .replace('<Slot name="Belt" itemId="4"/>','<Slot name="Belt" itemId="4"/><Slot name="Body Armour 2" itemId="0"/>')
  .replace("+112 to maximum Life\n+41% to Fire","+72 to maximum Life\n+41% to Fire")
  .replace(/<Notes>[\s\S]*?<\/Notes>/,"<Notes>Example current character.</Notes>");
(async function init(){
  const goal=store.get("xml.goal",null)||store.get("xml",null), cur=store.get("xml.current",null);
  try{if(goal)await loadSlot("goal",goal,false,true);else await loadSlot("goal",EXAMPLE_XML,true,true)}catch(e){await loadSlot("goal",EXAMPLE_XML,true,true)}
  try{if(cur)await loadSlot("current",cur,false,true);else if(!goal)await loadSlot("current",EXAMPLE_CURRENT,true,true)}catch(e){}
  renderAll();
  initLinkedLog();
  recapFromState();save();
  initDesktop().then(initAccount);
  const h=location.hash.slice(1);
  showTab(TAB_LIST().includes(h)?h:store.get("tab","home"));
  if(!store.get("setupDone",0)&&exG) setTimeout(openWizard,400);
  if(DESK&&S.trade&&S.trade.flip&&S.trade.flip.watch) setTimeout(()=>loadScriptOnce("tradetools.js","TradeTools").then(()=>TradeTools.startFlipWatch()).catch(()=>{}),15000);
})();
