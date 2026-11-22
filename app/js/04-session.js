// Exile Companion main window, part 4 of 10: session page and goals, recent price checks, media page, game data and notices, characters.
// Classic scripts loaded in order by index.html; they share one global scope, so order matters.
"use strict";
/* ---------------- render: session ---------------- */
let tick=null;
function elapsed(){const s=S.session;return s.elapsed+(s.start?Date.now()-s.start:0)}
function hms(ms){const t=Math.floor(ms/1000);return [Math.floor(t/3600),Math.floor(t/60)%60,t%60].map((n,i)=>i?String(n).padStart(2,"0"):n).join(":")}
/* ---------- session goals ---------- */
const GOAL_KINDS=[["div","divines"],["chaos","chaos"],["maps","maps"],["time","hours"]];
function goalState(g){
  g=g||S.goal;if(!g||!g.target)return null;
  const maps=(S.session.maps||[]).filter(m=>(m.at||0)>=g.start);
  const sales=(S.sales||[]).filter(x=>x.t>=g.start).reduce((a,x)=>a+(x.chaos||0),0);
  const chaos=maps.reduce((a,m)=>a+(+m.profit||0),0)+sales;
  const cur=g.kind==="div"?(S.divine?chaos/S.divine:0):g.kind==="chaos"?chaos:g.kind==="maps"?maps.length:(Date.now()-g.start)/3.6e6;
  const unit=(GOAL_KINDS.find(k=>k[0]===g.kind)||[,""])[1];
  const show=v=>g.kind==="maps"?String(Math.floor(v)):g.kind==="time"?hms(v*3.6e6):g.kind==="div"?v.toFixed(1):fmt(v);
  return {cur,target:g.target,pct:Math.max(0,Math.min(1,cur/g.target)),done:cur>=g.target,label:`${g.kind==="time"?g.target+" hour"+(g.target==1?"":"s"):g.target+" "+unit}`,now:g.kind==="time"?`${show(cur)} of ${g.target}h`:`${show(cur)} / ${g.target} ${unit}`};
}
function goalBar(st){return `<div class="goal"><div class="goal-top"><span class="small"><b>Goal:</b> ${esc(st.label)}</span><span class="small num">${esc(st.now)}${st.done?" ✓":""}</span></div><div class="gbar"><i style="width:${Math.round(st.pct*100)}%"></i></div></div>`}
function checkGoal(){
  const st=goalState();if(!st||!st.done||S.goal.hit)return;
  S.goal.hit=Date.now();save();
  const time=S.goal.kind==="time";
  const msg=time?`You've played the ${st.label} you planned.`:`You reached ${st.label} this session.`;
  toast((time?"Time's up: ":"Goal reached: ")+msg);
  if(DESK&&DESK.notify)DESK.notify({kind:"milestones",title:time?"Session time is up":"Session goal reached",body:msg});
  publishOverlay();
}
function renderGoal(){
  const el=$("sessGoal");if(!el)return;const g=S.goal;const st=goalState();
  el.innerHTML=`<h2>Session goal</h2>
    ${st?goalBar(st)+`<p class="small muted" style="margin:0">Counts maps you log and sales since ${new Date(g.start).toLocaleTimeString([], {hour:"numeric",minute:"2-digit"})}. Shows on Home and the overlay; you get a notification when it's reached.</p><div class="row"><button class="btn ghost small" id="goalNew">New goal</button><button class="btn ghost small" id="goalClear">Clear goal</button></div>`
    :`<form id="goalForm" class="fgrid"><label class="f" for="goalN">Target<input type="number" id="goalN" min="0.1" step="any" placeholder="10" required></label>
      <label class="f" for="goalK">Of<select id="goalK">${GOAL_KINDS.map(([k,l])=>`<option value="${k}">${l}</option>`).join("")}</select></label>
      <div style="display:flex;align-items:end"><button class="btn primary" type="submit">Set goal</button></div></form>
      <p class="small muted" style="margin:0">For example 10 divines, 20 maps or 2 hours. Progress counts from now.</p>`}`;
  const f=$("goalForm");if(f)f.onsubmit=e=>{e.preventDefault();const n=+$("goalN").value;if(!(n>0))return;S.goal={kind:$("goalK").value,target:n,start:Date.now()};save();renderGoal();renderHome();publishOverlay()};
  const c=$("goalClear");if(c)c.onclick=()=>{const prev=S.goal;S.goal=null;save();renderGoal();renderHome();publishOverlay();toast("Goal cleared.",()=>{S.goal=prev;save();renderGoal();renderHome();publishOverlay()})};
  const nw=$("goalNew");if(nw)nw.onclick=()=>{S.goal=null;save();renderGoal();const i=$("goalN");if(i)i.focus()};
}
setInterval(()=>{if(S.goal&&!S.goal.hit){checkGoal();if(CUR_TAB==="session")renderGoal();if(CUR_TAB==="home")renderHome()}},60000);

/* ---------- recent price checks (desktop; kept in memory by the main process) ---------- */
let CLIP=[];
function renderClip(){
  const el=$("homeClip");if(!el)return;
  if(!DESK||!DESK.clipHistory||!CLIP.length){el.hidden=true;return}
  el.hidden=false;
  const col=r=>({Unique:"var(--unique)",Rare:"var(--rare)",Magic:"var(--magic)",Gem:"#1ba29b",Currency:"var(--muted)","Divination Card":"#cfe7ff"}[r]||"var(--text)");
  el.innerHTML=`<h2>Recent price checks</h2>
    <div class="clip-list">${CLIP.map((h,i)=>`<button class="clip-it" data-clip="${i}" title="Check the price again"><span style="color:${col(h.rarity)}">${esc(h.title)}</span><span class="small muted">${new Date(h.at).toLocaleTimeString([], {hour:"numeric",minute:"2-digit"})}</span></button>`).join("")}</div>
    <div class="row"><span class="small muted">The last ${CLIP.length===1?"item":CLIP.length+" items"} you copied in game. Click one to check it again. Cleared when the app closes.</span><button class="btn ghost small" id="clipClear">Clear</button></div>`;
  el.querySelectorAll("[data-clip]").forEach(b=>b.onclick=()=>DESK.clipRecheck(+b.dataset.clip));
  $("clipClear").onclick=()=>DESK.clipClear();
}

/* ---------- media page (desktop) ---------- */
let MNOW=null,MPL=null;
function renderMedia(){
  const a=$("mediaNow"),b=$("mediaPlayer");if(!a||!b)return;
  if(!DESK||!DESK.mediaToggle){a.innerHTML="";b.innerHTML="";return}
  const c=LIVE.cfg||{};const n=MNOW;
  a.innerHTML=`<h2>Now playing</h2>
    ${c.nowPlaying===false?'<p class="small muted" style="margin:0">Turned off.</p>'
      :n&&n.error?`<p class="small" style="margin:0;color:var(--warn)">${esc(n.error)}</p>`
      :n&&n.title?`<div class="np-big"><div><div class="np-t">${esc(n.title)}</div><div class="small muted">${esc([n.artist,n.album].filter(Boolean).join(" · "))}${n.appName?` · ${esc(n.appName)}`:""}</div></div><span class="pill ${n.status==="Playing"?"good":""}">${esc(n.status||"")}</span></div>
        <div class="row"><button class="btn ghost" data-mc="prev"${n.canPrev===false?" disabled":""} aria-label="Previous">⏮</button><button class="btn primary" data-mc="toggle">${n.status==="Playing"?"Pause":"Play"}</button><button class="btn ghost" data-mc="next"${n.canNext===false?" disabled":""} aria-label="Next">⏭</button></div>`
      :n?'<p class="small muted" style="margin:0">Nothing is playing in Windows right now.</p>':'<div class="skel"><i></i><i></i></div>'}
    <label class="row small"><input type="checkbox" id="mnOn"${c.nowPlaying!==false?" checked":""}> Show what plays in Windows (Spotify, Apple Music, Netflix or YouTube in your browser, Stremio…)</label>
    <p class="small muted" style="margin:0">Uses Windows' own media controls; it can pause or skip but never touches the game. The overlay shows it too, with buttons in click mode.</p>`;
  const p=MPL||{};
  b.innerHTML=`<h2>Mini player</h2>
    <p class="small muted" style="margin:0">A small player that stays on top of the game (Windowed Fullscreen). Signs in to YouTube or Twitch separately from your Path of Exile sites.</p>
    <div class="row"><button class="btn ${p.visible?"ghost":"primary"}" id="mpShow">${p.visible?"Hide player":"Open player"}</button>
      <button class="btn ghost small" data-mgo="https://www.youtube.com/">YouTube</button><button class="btn ghost small" data-mgo="https://music.youtube.com/">YouTube Music</button><button class="btn ghost small" data-mgo="https://www.twitch.tv/">Twitch</button></div>
    <form class="row" id="mpForm"><input type="text" id="mpUrl" placeholder="Paste a YouTube or Twitch link" style="flex:1;min-width:200px"><button class="btn small" type="submit">Play</button></form>
    ${p.open?`<p class="small" style="margin:0"><b>${esc((p.title||"").replace(/ - YouTube( Music)?$/,"")||"Nothing loaded")}</b></p>
    <div class="row"><button class="btn ghost" data-mp="prev" aria-label="Previous">⏮</button><button class="btn" data-mp="toggle">${p.has&&!p.paused?"Pause":"Play"}</button><button class="btn ghost" data-mp="next" aria-label="Next">⏭</button><button class="btn ghost small" data-mp="mute">${p.muted?"Unmute":"Mute"}</button></div>
    <div class="vol small"><label for="mpVol">Volume</label><input type="range" id="mpVol" min="0" max="100" value="${Math.round((p.volume??1)*100)}"></div>
    <div class="vol small"><label for="mpOp">See-through</label><input type="range" id="mpOp" min="30" max="100" step="5" value="${Math.round((p.opacity??1)*100)}"></div>
    <label class="row small"><input type="checkbox" id="mpClick"${p.clickThrough?" checked":""}> Click-through: clicks go to the game, not the player${c.mediaClickHotkey?` (${esc(keyName(c.mediaClickHotkey))})`:" (set a hotkey in Settings to switch it in game)"}</label>`:""}
    <p class="small muted" style="margin:0"><b>${esc(keyName(c.mediaHotkey||"Ctrl+Shift+M"))}</b> shows or hides the player. Netflix, Hulu, Paramount+, Disney+ and Apple Music can't play here (they need copy protection the app doesn't have); play them in your browser or their app and control them under Now playing.</p>`;
  a.querySelectorAll("[data-mc]").forEach(x=>x.onclick=async()=>{MNOW=await DESK.mediaCmd(x.dataset.mc);renderMedia()});
  $("mnOn").onchange=async e=>{LIVE.cfg=await DESK.setConfig({nowPlaying:e.target.checked});MNOW=null;renderMedia();if(e.target.checked)DESK.mediaNow()};
  $("mpShow").onclick=async()=>{await DESK.mediaToggle({show:!p.visible});MPL=await DESK.mediaPlayerState();renderMedia()};
  b.querySelectorAll("[data-mgo]").forEach(x=>x.onclick=()=>DESK.mediaGo(x.dataset.mgo));
  $("mpForm").onsubmit=async e=>{e.preventDefault();let u=$("mpUrl").value.trim();if(!u){const i=$("mpUrl");i.required=true;i.reportValidity();i.required=false;return}if(!/^https:\/\//.test(u))u="https://"+u.replace(/^http:\/\//,"");const ok=await DESK.mediaGo(u);if(!ok)toast("The player opens YouTube, YouTube Music, Twitch, Kick and SoundCloud links.")};
  b.querySelectorAll("[data-mp]").forEach(x=>x.onclick=async()=>{MPL=await DESK.mediaPlayer(x.dataset.mp);renderMedia()});
  const v=$("mpVol");if(v)v.onchange=async()=>{MPL=await DESK.mediaPlayer("volume",+v.value/100)};
  const o=$("mpOp");if(o)o.oninput=()=>DESK.mediaPlayer("opacity",+o.value/100);
  const cl=$("mpClick");if(cl)cl.onchange=async()=>{MPL=await DESK.mediaPlayer("click");renderMedia()};
}

/* ---------- game data: patch label, updatable strategies/tips, notices, new-league checklist, data health ----------
   data/game.json in this app's GitHub repo can update patch-specific text between releases. Only checked plain
   text, numbers and lists are taken from it, and it's shown escaped. The built-in values are the fallback. */
const GAME={patch:"3.30",name:"Covens of Umbra",v:"2026-11-22",src:"built in",notices:[]};
const RAW_GAME="https://raw.githubusercontent.com/nickolusliquori/exile-companion/main/data/game.json";
function validGame(d){
  const str=(x,n)=>typeof x==="string"&&x.length>0&&x.length<=(n||400);const num=x=>typeof x==="number"&&isFinite(x)&&x>=0&&x<=100;
  try{
    if(!d||!/^\d{4}-\d{2}-\d{2}$/.test(d.v||"")||!/^\d+\.\d+$/.test(d.patch||"")||!str(d.name,60))return false;
    if(d.notices!=null&&(!Array.isArray(d.notices)||d.notices.length>10||!d.notices.every(n=>n&&str(n.id,40)&&str(n.title,120)&&str(n.body,600)&&(!n.level||/^(info|warn)$/.test(n.level)))))return false;
    if(d.strats!=null){if(!Array.isArray(d.strats)||d.strats.length<1||d.strats.length>40)return false;
      for(const x of d.strats){if(!x||!str(x.id,30)||!str(x.name,60)||!str(x.sum,500)||!Array.isArray(x.tips)||!x.tips.every(t=>str(t,300))||!x.threads||typeof x.threads!=="object"||!Object.entries(x.threads).every(([k,v])=>str(k,30)&&num(v))||!x.need||!["clear","boss","tank"].every(k=>num(x.need[k]))||![x.pay,x.budget].every(num))return false}}
    if(d.progressTips!=null&&(typeof d.progressTips!=="object"||!Object.entries(d.progressTips).every(([k,v])=>str(k,10)&&str(v,300))))return false;
    if(d.mapmods!=null&&(typeof d.mapmods!=="object"||!Object.entries(d.mapmods).every(([k,v])=>str(k,20)&&v&&typeof v==="object"&&["label","frag","why"].every(f=>v[f]==null||str(v[f],200)))))return false;
    return true;
  }catch(e){return false}
}
function applyGame(d,src){
  if(!validGame(d)||d.v<GAME.v)return false;
  Object.assign(GAME,{patch:d.patch,name:d.name,v:d.v,src,notices:d.notices||[]});
  if(d.strats)STRATS.splice(0,STRATS.length,...d.strats.map(x=>({id:x.id,name:x.name,sum:x.sum,tips:x.tips.slice(),threads:{...x.threads},need:{clear:x.need.clear,boss:x.need.boss,tank:x.need.tank},pay:x.pay,budget:x.budget,layer:!!x.layer})));
  if(d.progressTips)PROGRESS.forEach(p=>{if(d.progressTips[p.id])p.tip=d.progressTips[p.id]});
  if(d.mapmods)MAPMODS.forEach(m=>{const o=d.mapmods[m.id];if(o){if(o.label)m.label=o.label;if(o.frag)m.frag=o.frag;if(o.why)m.why=o.why}});
  return true;
}
function showGameLabel(){
  const lg=S.league||(LIVE.cfg&&LIVE.cfg.league)||"";const el=$("brandSub");
  if(el)el.textContent=lg?`${GAME.patch} · ${lg}`:`${GAME.patch} ${GAME.name}`;
  document.title=`Exile Companion ${GAME.patch}`;
}
async function refreshGameData(force){
  if(!DESK||!DESK.http)return false;
  try{const r=await DESK.http({url:RAW_GAME,cacheMs:force?0:6*3600e3});if(r&&r.status===200&&applyGame(r.data,"GitHub")){store.set("gameData",r.data);showGameLabel();renderAll();return true}}catch(e){}
  return false;
}
// a newer copy saved on an earlier run applies straight away, before the network check
try{const cached=store.get("gameData",null);if(cached)applyGame(cached,"GitHub (saved)")}catch(e){}

// announcements from data/game.json (e.g. "3.31 launched: data is being updated"), each dismissable once
function renderNotices(){
  const host=$("homeNotices");if(!host)return;const seen=S.noticesSeen||{};
  const list=(GAME.notices||[]).filter(n=>!seen[n.id]);
  host.innerHTML=list.map(n=>`<div class="banner ${n.level==="warn"?"warn":""}" style="margin-bottom:12px"><div class="row" style="justify-content:space-between;flex-wrap:nowrap"><b>${esc(n.title)}</b><button class="btn ghost small" data-notice="${esc(n.id)}" aria-label="Dismiss">✕</button></div><p class="small" style="margin:4px 0 0">${esc(n.body)}</p></div>`).join("");
  host.querySelectorAll("[data-notice]").forEach(b=>b.onclick=()=>{S.noticesSeen={...(S.noticesSeen||{}),[b.dataset.notice]:Date.now()};save();renderNotices()});
}

// what the app ships with, for the health panel: [name, source, version, built for patch]
// versions come from the data files themselves once loaded (they're regenerated by scripts/update-data.sh)
const patchOf=v=>{const m=String(v||"").match(/(\d+\.\d+)/);return m?m[1]:GAME.patch};
function dataSets(){
  const row=(n,src,v)=>[n,src,v,/^PoB /.test(v)?GAME.patch:patchOf(v)];
  return [
    row("Passive tree","GGG skilltree-export",(window.SKILLTREE&&SKILLTREE.v)||"3.30.0"),row("Atlas tree","GGG atlastree-export",(window.ATLASTREE&&ATLASTREE.v)||"3.30.0c"),
    row("Crafting mods","RePoE export",(window.CRAFTDATA&&CRAFTDATA.v)||"3.30.0.4"),row("Map mods","RePoE export",(window.MAPMOD_DATA&&MAPMOD_DATA.v)||"3.30.0.4"),
    row("Timeless and cluster jewels","Path of Building",(window.TIMELESS&&TIMELESS.v)||"PoB 343b054"),["Campaign route and gems","exile-leveling","3.30","3.30"],
    ["Atlas strategies, tips, map-mod wording","data/game.json",`${GAME.v} (${GAME.src})`,GAME.patch],
    ["League page (Betrayal, Threads, Expedition)","data/league.json","checked when the page opens",GAME.patch],
    ["Prices","poe.ninja","live","live"],["Trade league","GGG trade site",(LIVE.cfg&&LIVE.cfg.league)||S.league||"not detected yet","live"]];
}
/* ---------------- characters (profiles) ----------------
   The active character's data stays where it always was (S and the saved builds), so nothing else changes.
   Switching saves the active character's part of S plus its two builds under "char.<id>", loads the other
   character's copy and reloads the page. Economy, settings and everything account-wide stay shared. */
const CHAR_KEYS=["progress","camp","campAct","have","levelUps","bosses","bossNotes","splitRuns","played","gameDeaths","questPoints","noBuild",
  "atlasHashes","atlasManual","strat","mapsDone","syncChar","logChar","logInfo","expHist","session","goal","recaps","recapFrom"];
function charList(){const c=store.get("chars",null);return c&&Array.isArray(c.list)&&c.list.length?c:null}
function charGuessName(){return (S.logChar)||(C&&!exC&&C.name)||(G&&!exG&&(G.ascend||G.className))||"Main character"}
function charSummary(){const lv=(S.logInfo&&S.logInfo.level)||(C&&!exC&&C.level)||null,cls=(S.logInfo&&S.logInfo.cls)||(C&&!exC&&(C.ascend||C.className))||(G&&!exG&&(G.ascend||G.className))||"";
  return {lvl:lv,cls}}
function ensureChars(){let c=charList();if(!c){c={active:"c1",list:[{id:"c1",name:charGuessName(),created:Date.now(),used:Date.now(),...charSummary()}]};store.set("chars",c)}return c}
function activeChar(){const c=charList();return c?c.list.find(x=>x.id===c.active)||c.list[0]:null}
function charSnapshot(){const st={};for(const k of CHAR_KEYS)if(S[k]!==undefined)st[k]=S[k];
  return {state:JSON.parse(JSON.stringify(st)),goal:store.get("xml.goal",null)||null,current:store.get("xml.current",null)||null,saved:Date.now()}}
function charSaveActive(){const c=ensureChars(),me=c.list.find(x=>x.id===c.active);if(me){Object.assign(me,charSummary(),{used:Date.now()});if(S.logChar&&/^Main character$/.test(me.name))me.name=S.logChar}
  store.set("char."+c.active,charSnapshot());store.set("chars",c)}
function charLoad(id){
  const snap=store.get("char."+id,null)||{state:{},goal:null,current:null};
  for(const k of CHAR_KEYS)delete S[k];
  Object.assign(S,JSON.parse(JSON.stringify(snap.state||{})));
  const d=S_DEFAULT();if(!S.progress)S.progress=d.progress;if(!S.session)S.session=d.session;
  const setX=(k,v)=>{try{if(v)localStorage.setItem("ec330."+k,JSON.stringify(v));else localStorage.removeItem("ec330."+k)}catch(e){}};
  setX("xml.goal",snap.goal);setX("xml.current",snap.current);try{localStorage.removeItem("ec330.xml")}catch(e){}
  save();
}
function switchChar(id,note){
  const c=ensureChars();if(id===c.active)return;if(!c.list.some(x=>x.id===id))return;
  charSaveActive();charLoad(id);c.active=id;const me=c.list.find(x=>x.id===id);me.used=Date.now();store.set("chars",c);
  store.set("charNote",note||`Switched to ${me.name}.`);location.reload();
}
function newChar(name,{copyBuild=false}={}){
  const c=ensureChars();charSaveActive();
  const id="c"+Date.now().toString(36);
  const goal=copyBuild?store.get("xml.goal",null):null;
  c.list.push({id,name:String(name||"New character").slice(0,40),created:Date.now(),used:Date.now(),cls:copyBuild&&G&&!exG?(G.ascend||G.className):"",lvl:null});
  store.set("char."+id,{state:{},goal,current:null,saved:Date.now()});store.set("chars",c);
  switchChar(id,`New character "${name}". ${goal?"The goal build was copied; import the current character when you have it.":"Import its build from Home, or just start playing."}`);
}
function renameChar(id,name){const c=ensureChars(),x=c.list.find(y=>y.id===id);if(!x||!name)return;x.name=String(name).slice(0,40);store.set("chars",c);renderChars();renderHeader()}
function deleteChar(id){
  const c=ensureChars();if(id===c.active||c.list.length<2)return;
  const i=c.list.findIndex(x=>x.id===id);if(i<0)return;const [gone]=c.list.splice(i,1),snap=store.get("char."+id,null);
  store.set("chars",c);try{localStorage.removeItem("ec330.char."+id)}catch(e){}renderChars();renderHeader();
  toast(`Removed ${gone.name}.`,()=>{const c2=ensureChars();c2.list.splice(i,0,gone);store.set("chars",c2);if(snap)store.set("char."+id,snap);renderChars();renderHeader()});
}
// header switcher + Settings card
function charChipHtml(){const c=charList();if(!c||c.list.length<2)return "";const me=activeChar();
  return `<button class="btn ghost small charbtn" id="charBtn" title="Switch character" aria-haspopup="menu"><span aria-hidden="true">&#x1F464;</span> ${esc(me.name)} <span aria-hidden="true">&#x25BE;</span></button>`}
function openCharMenu(anchor){
  closeCharMenu();const c=ensureChars();const m=document.createElement("div");m.id="charMenu";m.setAttribute("role","menu");
  m.innerHTML=c.list.slice().sort((a,b)=>(b.used||0)-(a.used||0)).map(x=>`<button role="menuitem" data-char="${x.id}"${x.id===c.active?' aria-current="true" class="on"':""}><b>${esc(x.name)}</b> <span class="small muted">${esc([x.cls,x.lvl?"lv "+x.lvl:""].filter(Boolean).join(" · "))}</span></button>`).join("")
    +`<hr><button role="menuitem" data-charnew>＋ New character</button><button role="menuitem" data-charmanage>Manage characters</button>`;
  document.body.appendChild(m);const z=ZF(),r=anchor.getBoundingClientRect();m.style.top=(r.bottom/z+6)+"px";m.style.left=Math.max(8,Math.min(innerWidth/z-260,r.left/z))+"px";
  m.querySelectorAll("[data-char]").forEach(b=>b.onclick=()=>{closeCharMenu();switchChar(b.dataset.char)});
  m.querySelector("[data-charnew]").onclick=()=>{closeCharMenu();promptNewChar()};
  m.querySelector("[data-charmanage]").onclick=()=>{closeCharMenu();showTab("settings");setTimeout(()=>{const e=$("setChars");if(e)e.scrollIntoView({block:"start"})},50)};
  const first=m.querySelector("button");if(first)first.focus();
  m.addEventListener("keydown",e=>{const bs=[...m.querySelectorAll("button")],i=bs.indexOf(document.activeElement);
    if(e.key==="ArrowDown"){e.preventDefault();bs[(i+1)%bs.length].focus()}else if(e.key==="ArrowUp"){e.preventDefault();bs[(i-1+bs.length)%bs.length].focus()}else if(e.key==="Escape"){closeCharMenu();anchor.focus()}});
  setTimeout(()=>document.addEventListener("click",closeCharMenuOutside,true),0);
}
function closeCharMenuOutside(e){const m=$("charMenu");if(m&&!m.contains(e.target)&&e.target.id!=="charBtn")closeCharMenu()}
function closeCharMenu(){const m=$("charMenu");if(m)m.remove();document.removeEventListener("click",closeCharMenuOutside,true)}
function promptNewChar(suggest){
  let d=$("charDlg");if(d)d.remove();d=document.createElement("dialog");d.id="charDlg";d.setAttribute("aria-label","New character");
  d.innerHTML=`<form method="dialog" class="col" style="gap:10px;min-width:300px"><h2 style="margin:0">New character</h2>
    <label class="small" for="chName">Name (for example its in-game name)</label><input id="chName" required maxlength="40" value="${esc(suggest||"")}">
    ${G&&!exG?`<label class="row small"><input type="checkbox" id="chCopy"> Copy the goal build (${esc(G.ascend||G.className)})</label>`:""}
    <div class="row" style="justify-content:flex-end"><button class="btn ghost" value="cancel" formnovalidate>Cancel</button><button class="btn primary" id="chOk" value="ok">Create and switch</button></div></form>`;
  document.body.appendChild(d);d.showModal();$("chName").focus();
  d.addEventListener("close",()=>{const nm=($("chName").value||"").trim(),copy=!!($("chCopy")&&$("chCopy").checked),ok=d.returnValue==="ok";d.remove();if(ok&&nm)newChar(nm,{copyBuild:copy})});
}
function renderChars(){
  const host=$("setChars");if(!host)return;const c=charList();
  if(!c){host.innerHTML=`<p class="small" style="margin:0">Play more than one character? Each one can keep its own builds, campaign progress, atlas, owned gear, boss notes and map log. Prices, trading, the loot filter and settings stay shared.</p>
    <div class="row"><button class="btn small" id="chStart">Add a second character</button></div>`;
    $("chStart").onclick=()=>{ensureChars();promptNewChar()};return}
  host.innerHTML=`<p class="small muted" style="margin:0">Each character keeps its own builds, campaign, atlas, owned gear, boss notes and map log. Switch from the top bar, Ctrl+K, or automatically when the game log shows you on another character.</p>
    <table class="tbl small"><thead><tr><th>Character</th><th>Class</th><th>Last played</th><th></th></tr></thead><tbody>${c.list.map(x=>`<tr>
      <td><input aria-label="Name of ${esc(x.name)}" data-chname="${x.id}" value="${esc(x.name)}" maxlength="40" style="width:100%"></td>
      <td>${esc([x.cls,x.lvl?"lv "+x.lvl:""].filter(Boolean).join(" · ")||"–")}</td><td>${x.used?new Date(x.used).toLocaleDateString():"–"}</td>
      <td style="white-space:nowrap">${x.id===c.active?'<span class="pill good">playing</span>':`<button class="btn small" data-chgo="${x.id}">Switch</button> <button class="btn ghost small" data-chdel="${x.id}" aria-label="Remove ${esc(x.name)}">Remove</button>`}</td></tr>`).join("")}</tbody></table>
    <div class="row"><button class="btn small" id="chNew">＋ New character</button><label class="row small"><input type="checkbox" id="chAuto"${S.charAuto!==false?" checked":""}> Offer to switch when the game log shows another character</label></div>`;
  host.querySelectorAll("[data-chname]").forEach(i=>i.onchange=()=>renameChar(i.dataset.chname,i.value.trim()));
  host.querySelectorAll("[data-chgo]").forEach(b=>b.onclick=()=>switchChar(b.dataset.chgo));
  host.querySelectorAll("[data-chdel]").forEach(b=>b.onclick=()=>deleteChar(b.dataset.chdel));
  $("chNew").onclick=()=>promptNewChar();$("chAuto").onchange=e=>{S.charAuto=e.target.checked;save()};
}
// the game log says which character is playing: offer to switch (once per name per session)
const CHAR_OFFERED=new Set();
// another saved character this game-log name belongs to (null when it's the active one or unknown)
function charOwner(name){const c=charList();if(!name||!c||c.list.length<2)return null;const me=activeChar();if(name===(S.logChar||me.name))return null;
  return c.list.find(x=>x.id!==c.active&&(x.name===name||(store.get("char."+x.id,{}).state||{}).logChar===name))||null}
function charFromLog(name){
  const other=charOwner(name);if(!other)return false;   // true = the event belongs to another character: don't record it here
  if(S.charAuto===false||CHAR_OFFERED.has(name))return true;CHAR_OFFERED.add(name);
  toast(`You're playing ${name}. Switch the app to that character?`,()=>switchChar(other.id,`Switched to ${other.name} (the game log showed you on it).`),"Switch");
  return true;
}
// after a switch: say what happened (the page has just reloaded)
setTimeout(()=>{const n=store.get("charNote",null);if(n){try{localStorage.removeItem("ec330.charNote")}catch(e){}toast(n)}},600);
function renderDataHealth(){
  const el=$("setData");if(!el)return;
  el.innerHTML=`<h2>Game data</h2>
    <p class="small muted" style="margin:0">What the app knows about the game and where it comes from. Current patch: <b>${esc(GAME.patch)}</b> (${esc(GAME.name)}). Data built for an older patch is flagged. Patch-specific text can update from GitHub without a new release; the rest arrives through auto-update.</p>
    <div class="tw"><table><thead><tr><th>Data</th><th>Source</th><th>Version</th><th></th></tr></thead><tbody>
    ${dataSets().map(([n,src,v,p])=>{const old=p!=="live"&&p!==GAME.patch;return `<tr><td>${esc(n)}</td><td class="small">${esc(src)}</td><td class="small">${esc(v)}</td><td>${old?`<span class="pill warn" title="Built for ${esc(p)}">May be out of date</span>`:'<span class="pill good">Current</span>'}</td></tr>`}).join("")}
    </tbody></table></div>
    <div class="row"><button class="btn ghost small" id="gdCheck"${DESK?"":" disabled"}>Check for data updates</button><span class="small muted" id="gdMsg">${DESK?"Checked automatically every 6 hours.":"Updates are checked in the desktop app."}</span></div>`;
  const b=$("gdCheck");if(b)b.onclick=async()=>{b.disabled=true;$("gdMsg").textContent="Checking…";const ok=await refreshGameData(true);renderDataHealth();$("gdMsg").textContent=ok?`Updated to ${GAME.v}.`:`You have the latest data (${GAME.v}).`};
}

// new league: a short checklist on Home
function renderNewLeague(){
  const host=$("homeNewLeague");const n=S.newLeague;
  if(!host)return;if(!n||n.done){host.hidden=true;host.innerHTML="";return}
  host.hidden=false;const st=n.steps||(n.steps={});
  const step=(k,label,btn)=>`<li class="row" style="justify-content:space-between;gap:8px;flex-wrap:nowrap"><label class="small" style="display:flex;gap:6px;align-items:center"><input type="checkbox" data-nl="${k}"${st[k]?" checked":""}> ${label}</label>${btn||""}</li>`;
  host.innerHTML=`<div class="row" style="justify-content:space-between"><h2>New league: ${esc(n.to)}</h2><button class="btn ghost small" id="nlDone">Done</button></div>
    <p class="small muted" style="margin:0">${n.from?`The app switched from ${esc(n.from)} to ${esc(n.to)}. `:""}A few things for the fresh start:</p>
    <ul class="clean" style="display:grid;gap:6px">
      ${step("league",`Price checks and prices use <b>${esc(n.to)}</b>`,n.from?`<button class="btn ghost small" id="nlBack">Stay on ${esc(n.from)}</button>`:"")}
      ${step("data","Check for game data updates",`<button class="btn ghost small" id="nlData">Check now</button>`)}
      ${step("session","Start a fresh session (the old league's summary is archived)",`<button class="btn ghost small" id="nlFresh">Start fresh</button>`)}
      ${step("build","Import the build you'll play this league",`<button class="btn ghost small" id="nlBuild">Import build</button>`)}
      ${step("camp","Reset campaign progress for a new character",`<button class="btn ghost small" id="nlCamp">Reset</button>`)}
    </ul>`;
  const done=k=>{st[k]=true;save();renderNewLeague()};
  host.querySelectorAll("[data-nl]").forEach(c=>c.onchange=()=>{st[c.dataset.nl]=c.checked;save()});
  $("nlDone").onclick=()=>{n.done=true;save();renderNewLeague()};
  const back=$("nlBack");if(back)back.onclick=async()=>{if(DESK)LIVE.cfg=await DESK.setConfig({league:n.from,leaguePinned:true});S.league=n.from;n.done=true;save();showGameLabel();renderNewLeague();toast(`Staying on ${n.from}. Untick "Keep this league" in Settings to follow new leagues again.`)};
  $("nlData").onclick=async()=>{const ok=await refreshGameData(true);toast(ok?`Game data updated (${GAME.v}).`:`Game data is up to date (${GAME.v}). Bigger updates arrive through auto-update.`);done("data")};
  $("nlFresh").onclick=()=>{const prev={session:JSON.parse(JSON.stringify(S.session)),net:S.netWorth,latest:S.netLatest,goal:S.goal,archive:S.archive};
    S.archive=(S.archive||[]).concat([{league:n.from,at:Date.now(),maps:S.session.maps.length,net:S.netLatest?S.netLatest.total:null}]).slice(-10);
    S.session={start:null,elapsed:0,maps:[]};S.netWorth=[];S.netLatest=null;S.goal=null;st.session=true;save();renderAll();
    toast("Fresh session started. The old league's summary is archived.",()=>{Object.assign(S,{session:prev.session,netWorth:prev.net,netLatest:prev.latest,goal:prev.goal,archive:prev.archive});st.session=false;save();renderAll()})};
  $("nlBuild").onclick=()=>{done("build");if(typeof openWizard==="function")openWizard()};
  $("nlCamp").onclick=()=>{const prev={camp:S.camp,act:S.campAct};S.camp={};S.campAct=1;st.camp=true;save();renderAll();toast("Campaign progress reset.",()=>{S.camp=prev.camp;S.campAct=prev.act;st.camp=false;save();renderAll()})};
}

function renderSession(){
  renderGoal();
  const s=S.session, ms=elapsed();
  const total=s.maps.reduce((a,m)=>a+(+m.profit||0),0);
  const mapMs=s.maps.reduce((a,m)=>a+(m.dur||0),0), basis=Math.max(ms,mapMs);
  const perHr=basis>60000?total/(basis/3.6e6):0;
  $("sessTimer").innerHTML=`<h2>Session</h2>
    <div class="stats">
      <div class="stat"><div class="k">Time</div><div class="v num" id="clock">${hms(ms)}</div></div>
      <div class="stat"><div class="k">Maps</div><div class="v num">${s.maps.length}</div></div>
      ${mapMs?`<div class="stat"><div class="k">Time in maps</div><div class="v num">${hms(mapMs)}</div></div>`:""}
      <div class="stat"><div class="k">Profit</div><div class="v num">${fmt(total)}c</div></div>
      <div class="stat"><div class="k">Per hour</div><div class="v num">${(perHr/S.divine).toFixed(2)} div</div></div>
    </div>
    <div class="row"><button class="btn primary" id="sessToggle">${s.start?"Pause":"Start"} timer</button><button class="btn ghost" id="sessReset">New session</button></div>
    <p class="small muted" style="margin:0">Divine valued at ${S.divine}c (change it in the crafting calculator).</p>`;
  $("sessToggle").onclick=()=>{if(s.start){s.elapsed+=Date.now()-s.start;s.start=null}else s.start=Date.now();save();renderSession()};
  $("sessReset").onclick=()=>{const prev=S.session;S.session={start:null,elapsed:0,maps:[]};save();renderSession();toast(`Session cleared (${prev.maps.length} map${prev.maps.length===1?"":"s"}).`,()=>{S.session=prev;save();renderSession()})};
  clearInterval(tick);if(s.start)tick=setInterval(()=>{const c=$("clock");if(c)c.textContent=hms(elapsed())},1000);
  const curStrat=(STRATS.find(x=>x.id===S.strat)||primaryStrat()).name;
  $("sessAdd").innerHTML=`<h2>Log a map</h2>
    <form id="mapForm" class="fgrid">
      <label class="f" for="mTier">Tier<input type="number" id="mTier" min="1" max="17" value="${s.maps.length?s.maps[s.maps.length-1].tier:16}"></label>
      <label class="f" for="mProfit">Profit (chaos)<input type="number" id="mProfit" step="any" value="0"></label>
      <label class="f" for="mThreads">Threads used<input type="number" id="mThreads" min="0" max="10" value="${s.maps.length?s.maps[s.maps.length-1].threads:4}"></label>
      <label class="f" for="mNote">Note<input type="text" id="mNote" placeholder="Fated boss, big drop…"></label>
      <div style="display:flex;align-items:end"><button class="btn primary" type="submit" style="width:100%">Add map</button></div>
    </form>
    <p class="small muted" style="margin:0">Logged under: ${esc(curStrat)}</p>`;
  $("mapForm").onsubmit=e=>{e.preventDefault();s.maps.push({tier:+$("mTier").value||16,profit:+$("mProfit").value||0,threads:+$("mThreads").value||0,note:$("mNote").value,strat:curStrat,at:Date.now()});save();renderSession()};
  const byStrat={};s.maps.forEach(m=>{(byStrat[m.strat]=byStrat[m.strat]||{n:0,p:0});byStrat[m.strat].n++;byStrat[m.strat].p+=m.profit});
  $("sessLog").innerHTML=`<h2>Map log</h2>${s.maps.length?`
    <div class="row">${Object.entries(byStrat).map(([k,v])=>`<span class="pill gold">${esc(k)}: ${fmt(v.p/v.n)}c avg/map</span>`).join("")}</div>
    <div class="tw"><table><thead><tr><th>#</th><th>Tier</th><th>Strategy</th><th>Time</th><th>Threads</th><th>Profit (c)</th><th>Note</th><th></th></tr></thead><tbody>
    ${s.maps.map((m,i)=>`<tr><td class="num">${i+1}</td><td class="num">T${m.tier}</td><td>${esc(m.strat)}</td><td class="num">${m.dur?hms(m.dur):"–"}</td><td class="num">${m.threads}</td><td><input class="pinput num" type="number" step="any" value="${m.profit}" data-profit="${i}" aria-label="Profit for map ${i+1}"></td><td>${esc(m.note)}</td><td><button class="btn ghost small" data-del="${i}" aria-label="Delete map ${i+1}">✕</button></td></tr>`).reverse().join("")}
    </tbody></table></div>`:emptyBox("No maps logged yet. Start the timer and log each map (or connect your game log to log them automatically) to see which strategy really pays best.",[["Start the timer","startTimer"],["Add a map","addMap"],[DESK?"Connect game log":"Upload Client.txt","findLog"]])}`;
  document.querySelectorAll("[data-del]").forEach(b=>b.onclick=()=>{const i=+b.dataset.del,m=S.session.maps.splice(i,1)[0];save();renderSession();toast(`Removed map ${i+1} from the log.`,()=>{S.session.maps.splice(i,0,m);save();renderSession()})});
  document.querySelectorAll("[data-profit]").forEach(inp=>inp.onchange=()=>{s.maps[+inp.dataset.profit].profit=+inp.value||0;save();renderSession()});
  renderGameLog();renderProfit();renderRecaps();renderSync();
}
