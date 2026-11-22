// Exile Companion main window, part 7 of 10: session recap, levelling, price alerts, sales, sync, stream overlay, map completion, bosses, backups, cheat sheets, wiki, cards, news, updates.
// Classic scripts loaded in order by index.html; they share one global scope, so order matters.
"use strict";
/* ---------- session recap ---------- */
function recapFromState(){return S.recapFrom||(S.recapFrom={t:Date.now(),level:(S.logInfo&&S.logInfo.level)||((C||G)&&(C||G).level)||1,mapIdx:S.session.maps.length,act:S.campAct||1,net:S.netLatest?S.netLatest.total:null})}
function makeRecap(){
  const f=recapFromState();
  const maps=S.session.maps.filter(m=>(m.at||0)>=f.t||S.session.maps.indexOf(m)>=f.mapIdx);
  const lvl=(S.logInfo&&S.logInfo.level)||((C||G)&&(C||G).level)||f.level;
  if(!maps.length&&lvl===f.level&&(S.campAct||1)===f.act) return null;
  const timed=maps.filter(m=>m.dur), ms=timed.reduce((a,m)=>a+m.dur,0), profit=maps.reduce((a,m)=>a+(+m.profit||0),0);
  const deaths=maps.reduce((a,m)=>{const x=String(m.note||"").match(/(\d+) death/);return a+(x?+x[1]:0)},0);
  const best=maps.slice().sort((a,b)=>(+b.profit||0)-(+a.profit||0))[0];
  return {start:f.t,end:Date.now(),maps:maps.length,mapMs:ms,profit,perHr:ms>60000?profit/(ms/3.6e6):null,div:S.divine,deaths,
    best:best&&best.profit?{name:String(best.note||"").split(" · ")[0]||("T"+best.tier),profit:best.profit}:null,
    levelFrom:f.level,levelTo:lvl,actFrom:f.act,actTo:S.campAct||1,netFrom:f.net,netTo:S.netLatest?S.netLatest.total:null};
}
function saveRecap(manual){
  const r=makeRecap();
  if(r){S.recaps=(S.recaps||[]).concat([r]).slice(-40);if(DESK&&manual)DESK.notify({kind:"milestones",title:"Session saved",body:recapLine(r)})}
  S.recapFrom=null;recapFromState();save();
  return r;
}
function recapLine(r){
  const parts=[];
  if(r.maps)parts.push(`${r.maps} map${r.maps>1?"s":""}`);
  if(r.perHr!=null)parts.push(`${(r.perHr/(r.div||S.divine)).toFixed(2)} div/h`);
  if(r.levelTo>r.levelFrom)parts.push(`level ${r.levelFrom} → ${r.levelTo}`);
  if(r.actTo>r.actFrom)parts.push(`Act ${r.actFrom} → ${r.actTo}`);
  if(r.deaths)parts.push(`${r.deaths} death${r.deaths>1?"s":""}`);
  return parts.join(" · ")||"Short session";
}
function renderRecaps(){
  const el=$("sessRecap");if(!el) return;
  const list=(S.recaps||[]).slice().reverse();
  const live=makeRecap();
  el.innerHTML=`<div class="row" style="justify-content:space-between"><h2>Session recaps</h2><button class="btn" id="rcSave">End session & save recap</button></div>
    ${live?`<p class="small" style="margin:0"><b>This session so far:</b> ${esc(recapLine(live))}${live.profit?` · ${fmt(live.profit)}c profit`:""}</p>`:emptyBox("Nothing to recap yet this session. Start the timer or run a few maps.",[["Start the timer","startTimer"]])}
    ${list.length?`<div class="tw"><table><thead><tr><th>When</th><th>Length</th><th>Summary</th><th>Profit</th><th>Best map</th></tr></thead><tbody>${list.slice(0,12).map(r=>`<tr><td>${new Date(r.start).toLocaleDateString()} ${new Date(r.start).toLocaleTimeString([], {hour:"2-digit",minute:"2-digit"})}</td><td class="num">${hms(r.end-r.start)}</td><td>${esc(recapLine(r))}</td><td class="num">${r.profit?fmt(r.profit)+"c":"–"}</td><td>${r.best?`${esc(r.best.name)} (${fmt(r.best.profit)}c)`:"–"}</td></tr>`).join("")}</tbody></table></div>`:""}
    <p class="note" style="margin:0">${DESK?"A recap is saved automatically when you close the app.":"Saved when you press the button (or when you leave this page)."}</p>`;
  $("rcSave").onclick=()=>{saveRecap(true);renderRecaps();renderSession()};
}
window.addEventListener("beforeunload",()=>{try{const r=makeRecap();if(r&&(r.maps||r.levelTo>r.levelFrom)){S.recaps=(S.recaps||[]).concat([r]).slice(-40);S.recapFrom=null;save()}}catch(e){}});

/* ---------- time to next level ---------- */
function addLevelUp(level,t){
  S.levelUps=S.levelUps||[];
  if(S.levelUps.some(x=>x.level===level)) return;
  S.levelUps.push({level,t});S.levelUps.sort((a,b)=>a.level-b.level);S.levelUps=S.levelUps.slice(-30);
}
function nextLevelEta(){
  const L=(S.levelUps||[]).slice(-6);
  if(L.length<3) return null;
  const iv=[];for(let i=1;i<L.length;i++){if(L[i].level===L[i-1].level+1){const d=L[i].t-L[i-1].t;if(d>0&&d<3*3600e3)iv.push(d)}}
  if(iv.length<2) return null;
  const ratios=[];for(let i=1;i<iv.length;i++)ratios.push(iv[i]/iv[i-1]);
  const r=Math.min(1.5,Math.max(0.9,ratios.reduce((a,b)=>a+b,0)/ratios.length));
  const est=iv[iv.length-1]*r;
  const since=Date.now()-L[L.length-1].t;
  return {est,left:Math.max(0,est-since),last:iv[iv.length-1],level:L[L.length-1].level};
}
function xpPerHour(){
  const h=(S.expHist||[]).slice(-6);if(h.length<2) return null;
  const a=h[0],b=h[h.length-1];if(b.t-a.t<10*60e3||b.exp<=a.exp) return null;
  return (b.exp-a.exp)/((b.t-a.t)/3.6e6);
}

/* ---------- price alerts ---------- */
function watchPrice(w,P){
  if(w.kind==="unique"){const l=P.items[w.name];if(!l)return null;const c=l.filter(x=>!(x.links>=5));return Math.min(...(c.length?c:l).map(x=>x.chaosValue).filter(v=>v!=null))}
  if(w.kind==="gem"){const l=P.items[w.name]||P.items[w.name+" Support"];if(!l)return null;const c=l.filter(x=>!x.corrupted);return Math.min(...(c.length?c:l).map(x=>x.chaosValue).filter(v=>v!=null))}
  return P.cur[w.name]??P.ex[w.name]??null;
}
let alertTimer=null;
async function checkAlerts(manual){
  if(!DESK) return;
  const ws=Object.values(S.watch||{});if(!ws.length) return;
  const P=await ninjaPrices(manual);
  for(const w of ws){
    const v=watchPrice(w,P);if(v==null||!isFinite(v)) continue;
    w.last=v;w.lastAt=Date.now();const tr=P.trend[w.name]||trendOf((P.items[w.name]||[])[0]);w.trend=tr?Math.round(tr.ch*10)/10:null;
    if(v<=w.target&&(!w.notifiedAt||Date.now()-w.notifiedAt>6*3600e3)){w.notifiedAt=Date.now();DESK.notify({kind:"milestones",title:`Price alert: ${w.name}`,body:`Now ${fmt(v)}c on poe.ninja (your target: ${fmt(w.target)}c).`})}
  }
  save();renderAlerts();
}
function startAlerts(){clearInterval(alertTimer);if(DESK)alertTimer=setInterval(()=>checkAlerts(false),15*60e3)}
function setWatch(name,kind,target){S.watch=S.watch||{};if(!target){const old=S.watch[name];delete S.watch[name];if(old)toast(`Removed the price alert for ${name}.`,()=>{S.watch[name]=old;save();renderAlerts();if(typeof renderShop==="function")renderShop()})}else S.watch[name]={...(S.watch[name]||{}),name,kind,target:+target};save();renderAlerts();checkAlerts(false)}
function renderAlerts(){
  const el=$("deskAlerts");if(!el) return;
  const ws=Object.values(S.watch||{});
  el.innerHTML=`<h2>Price alerts</h2>${ws.length?`<div class="tw"><table><thead><tr><th>Item</th><th>Now</th><th>Alert at</th><th></th></tr></thead><tbody>${ws.map(w=>`<tr><td>${esc(w.name)}</td><td class="num">${w.last!=null?`<span class="pill ${w.last<=w.target?"good":""}">${fmt(w.last)}c</span>${w.trend!=null?trendHtml({ch:w.trend,data:[]}):""}`:"–"}</td><td class="num">≤ ${fmt(w.target)}c</td><td><button class="btn ghost small" data-unwatch="${esc(w.name)}">Remove</button></td></tr>`).join("")}</tbody></table></div><div class="row"><button class="btn ghost small" id="alCheck">Check now</button></div>`:emptyBox("No price alerts yet. Set one next to any unique or gem on the Shopping list, or add one below. Prices are checked every 15 minutes while the app is open.",[["Open shopping list","shop"]])}
    <h3>Add any item</h3><div class="row"><input type="text" id="alName" placeholder="Exact name, e.g. Headhunter" style="flex:2"><input type="number" id="alTarget" placeholder="chaos" style="flex:1"><select id="alKind" aria-label="Item kind"><option value="unique">Unique</option><option value="gem">Gem</option><option value="currency">Currency/other</option></select><button class="btn" id="alAdd">Add</button></div>`;
  el.querySelectorAll("[data-unwatch]").forEach(b=>b.onclick=()=>setWatch(b.dataset.unwatch,null,0));
  const ck=$("alCheck");if(ck)ck.onclick=()=>checkAlerts(true);
  $("alAdd").onclick=()=>{const n=$("alName").value.trim(),t=+$("alTarget").value;if(n&&t>0)setWatch(n,$("alKind").value,t)};
}

/* ---------- sales tracker (from stash snapshots) ---------- */
const NOTE_RE=/~(?:b\/o|price)\s+([\d.]+)(?:\/(\d+))?\s+([a-z-]+)/i;
function listedFrom(tabItems,tabName){
  const tabNote=(tabName||"").match(NOTE_RE);
  return tabItems.map(raw=>{const m=String(raw.note||"").match(NOTE_RE)||tabNote;if(!m)return null;
    return {key:[tabName,stripTags(raw.name),stripTags(raw.typeLine),raw.ilvl||0,raw.note||""].join("|"),name:(stripTags(raw.name)?stripTags(raw.name)+" ":"")+stripTags(raw.typeLine),qty:raw.stackSize||1,amount:+m[1]/(+m[2]||1),cur:m[3].toLowerCase(),tab:tabName}}).filter(Boolean);
}
function recordSales(listed,P){
  const prev=S.listed||[];
  const now={};listed.forEach(x=>now[x.key]=(now[x.key]||0)+1);
  const seen={};const sold=[];
  prev.forEach(x=>{seen[x.key]=(seen[x.key]||0)+1;if(seen[x.key]>(now[x.key]||0))sold.push(x)});
  const rate=c=>c==="chaos"?1:c==="divine"?(P.div||0):(P.cur[c]||null);
  sold.forEach(x=>{const r=rate(x.cur);S.sales=(S.sales||[]).concat([{t:Date.now(),name:x.name,amount:x.amount*x.qty,cur:x.cur,chaos:r?x.amount*x.qty*r:null,tab:x.tab}]).slice(-500)});
  S.listed=listed;
  if(sold.length&&DESK) DESK.notify({kind:"trades",title:`${sold.length} item${sold.length>1?"s":""} sold`,body:sold.slice(0,3).map(x=>x.name).join(", ")+(sold.length>3?"…":"")});
  return sold;
}
function renderSales(){
  const el=$("acctSales");if(!el) return;
  const s=(S.sales||[]).slice().reverse();
  const sum=ms=>s.filter(x=>Date.now()-x.t<ms).reduce((a,x)=>a+(x.chaos||0),0);
  el.innerHTML=`<h2>Sales</h2>
    <div class="stats"><div class="stat"><div class="k">Today</div><div class="v num">${fmt(sum(86400e3))}c</div></div><div class="stat"><div class="k">7 days</div><div class="v num">${fmt(sum(7*86400e3))}c</div></div><div class="stat"><div class="k">Items sold</div><div class="v num">${s.length}</div></div></div>
    ${s.length?`<div class="tw"><table><thead><tr><th>When</th><th>Item</th><th>Price</th></tr></thead><tbody>${s.slice(0,15).map(x=>`<tr><td>${new Date(x.t).toLocaleString()}</td><td>${esc(x.name)}</td><td class="num">${x.amount} ${esc(x.cur)}${x.chaos!=null&&x.cur!=="chaos"?` <span class="muted">(${fmt(x.chaos)}c)</span>`:""}</td></tr>`).join("")}</tbody></table></div>`:""}
    <p class="note" style="margin:0">Works out sales by comparing net worth snapshots: a priced item (note or priced tab) that disappears counts as sold. Items you move or take out yourself also count, so treat it as a guide. Turn on auto-snapshots for regular tracking.</p>`;
}

/* ---------- guide notes for the current level / act ---------- */
function notesFor(level,act){
  const lines=String((G&&G.notes)||"").split(/\r?\n/).map(l=>l.trim());
  if(!lines.some(Boolean)) return null;
  const secs=[];let cur=null;
  for(const l of lines){
    const lm=l.match(/\b(?:lv|lvl|level)\s*\.?\s*(\d{1,3})\b/i), am=l.match(/\bact\s*(\d{1,2})\b/i);
    if((lm||am)&&l.length<120){cur={title:l,lvl:lm?+lm[1]:null,act:am?+am[1]:null,lines:[]};secs.push(cur);continue}
    if(cur&&l) cur.lines.push(l);
  }
  if(!secs.length) return null;
  const fit=secs.filter(s=>(s.lvl!=null&&s.lvl<=level)||(s.lvl==null&&s.act!=null&&s.act<=act));
  const s=fit.length?fit[fit.length-1]:null;
  return s?{title:s.title,lines:s.lines.slice(0,6)}:null;
}

/* ---------- sync between devices ---------- */
async function packState(full){
  const keep=full?{...S}:{progress:S.progress,camp:S.camp,campAct:S.campAct,have:S.have,strat:S.strat,budget:S.budget,clear:S.clear,avoidOff:S.avoidOff,league:S.league,logInfo:S.logInfo,divine:S.divine,session:{start:null,elapsed:0,maps:S.session.maps.slice(-40)},splitRuns:(S.splitRuns||[]).slice(-2),recaps:(S.recaps||[]).slice(-5)};
  if(full){delete keep.listed;delete keep.netLatest}
  const payload={v:1,at:Date.now(),S:keep};
  if(full){payload.goal=store.get("xml.goal",null);payload.current=store.get("xml.current",null);try{payload.live=localStorage.getItem("ec330.liveChar")}catch(e){}}
  const bytes=new TextEncoder().encode(JSON.stringify(payload));
  const cs=new Blob([bytes]).stream().pipeThrough(new CompressionStream("deflate"));
  const buf=new Uint8Array(await new Response(cs).arrayBuffer());
  let bin="";buf.forEach(b=>bin+=String.fromCharCode(b));
  return "EC1."+btoa(bin).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");
}
async function unpackState(code){
  code=String(code||"").trim();if(!code.startsWith("EC1.")) throw new Error("That isn't an Exile Companion sync code (it should start with EC1.).");
  let b=code.slice(4).replace(/-/g,"+").replace(/_/g,"/");while(b.length%4)b+="=";
  const bin=atob(b);const bytes=new Uint8Array(bin.length);for(let i=0;i<bin.length;i++)bytes[i]=bin.charCodeAt(i);
  const ds=new Blob([bytes]).stream().pipeThrough(new DecompressionStream("deflate"));
  return JSON.parse(await new Response(ds).text());
}
let qrLib=null;
function loadQr(){if(qrLib)return Promise.resolve(qrLib);return new Promise((res,rej)=>{const s=document.createElement("script");s.src="https://cdnjs.cloudflare.com/ajax/libs/qrcode-generator/1.4.4/qrcode.min.js";s.onload=()=>{qrLib=window.qrcode;res(qrLib)};s.onerror=()=>rej(new Error("QR library unavailable"));document.head.appendChild(s)})}
function renderSync(){
  const el=$("sessSync");if(!el) return;
  el.innerHTML=`<h2>Sync with another device</h2>
    <p class="small" style="margin:0">Move your progress between the desktop app and the web version on your phone. Create a code here, then open Settings on the other device and paste it in.</p>
    <div class="row"><button class="btn" id="syProg">Progress only (QR code)</button><button class="btn" id="syAll">Everything incl. builds</button></div>
    <div id="syOut"></div>
    <h3>Paste a code from another device</h3>
    <textarea id="syIn" placeholder="EC1.…" style="min-height:70px"></textarea>
    <div class="row"><button class="btn primary" id="syLoad">Load code</button><span class="small" id="syMsg" role="status"></span></div>`;
  const out=async full=>{
    const code=await packState(full);
    let qr="";
    if(code.length<=2300){try{const Q=await loadQr();const q=Q(0,"L");q.addData(code);q.make();qr=`<div style="background:#fff;padding:8px;border-radius:6px;justify-self:start;max-width:280px">${q.createSvgTag({cellSize:3,margin:2,scalable:true})}</div>`}catch(e){qr=`<p class="small muted" style="margin:0">QR code needs an internet connection; copy the code instead.</p>`}}
    else qr=`<p class="small muted" style="margin:0">Too big for a QR code (${code.length} characters). Copy it and send it to yourself.</p>`;
    $("syOut").innerHTML=`<div style="display:grid;gap:8px">${qr}${copyBox("syCode",full?"Sync code: everything":"Sync code: progress",code)}</div>`;bindCopy($("syOut"));
  };
  $("syProg").onclick=()=>out(false);$("syAll").onclick=()=>out(true);
  $("syLoad").onclick=async()=>{
    const msg=$("syMsg");
    try{const p=await unpackState($("syIn").value);
      if(!$("syLoad").dataset.armed){$("syLoad").dataset.armed="1";$("syLoad").textContent="Tap again to replace this device's data";msg.textContent=`Code from ${new Date(p.at).toLocaleString()}${p.goal?" with builds":""}.`;return}
      Object.assign(S,p.S);save();
      if(p.goal)store.set("xml.goal",p.goal);if(p.current)store.set("xml.current",p.current);
      if(p.live){try{localStorage.setItem("ec330.liveChar",p.live)}catch(e){}}
      msg.textContent="Loaded. Reloading…";setTimeout(()=>location.reload(),600);
    }catch(e){msg.textContent=e.message||"Couldn't read that code.";msg.style.color="var(--bad)"}
  };
}

/* ---------- stream overlay settings + data ---------- */
function publishStream(p){
  if(!DESK||!DESK.publishStream) return;
  const b=C||G;
  const deaths=S.session.maps.reduce((a,m)=>{const x=String(m.note||"").match(/(\d+) death/);return a+(x?+x[1]:0)},0);
  DESK.publishStream({cls:b.ascend||b.className,level:(S.logInfo&&S.logInfo.level)||b.level,deaths});
}
function renderStreamCard(){
  const el=$("deskStream");if(!el) return;const c=LIVE.cfg||{};
  el.innerHTML=`<h2>Stream overlay (OBS)</h2>
    <label class="row small"><input type="checkbox" id="stOn"${c.streamEnabled?" checked":""}> Serve a stream widget on this PC</label>
    <label class="f" for="stPort" style="max-width:200px">Port<input type="number" id="stPort" value="${esc(c.streamPort||47777)}"></label>
    ${LIVE.stream&&LIVE.stream.ok?copyBox("stUrl","Add this as a Browser Source in OBS (width 500, height 200)",LIVE.stream.url):`<p class="small muted" style="margin:0">${esc((LIVE.stream&&LIVE.stream.message)||"Off")}</p>`}
    <p class="small muted" style="margin:0">Shows your class, level, current map with a timer, maps and div/hour, or your act and next step while levelling. Only reachable from this PC.</p>
    <h3>Wiki lookup</h3><p class="small" style="margin:0">Copy an item in game, then press <b>${esc(keyName(c.wikiHotkey||"Ctrl+Alt+W"))}</b> to open its poewiki page. The price window has a Wiki button too.</p>`;
  bindCopy(el);
  $("stOn").onchange=async e=>{LIVE.cfg=await DESK.setConfig({streamEnabled:e.target.checked});renderStreamCard()};
  $("stPort").onchange=async e=>{LIVE.cfg=await DESK.setConfig({streamPort:+e.target.value||47777});renderStreamCard()};
}


/* ================= TREE VIEWER (skill + atlas), MAP COMPLETION, BOSSES, COST TO FINISH, BACKUP, OVERLAY PAGES ================= */
function loadScriptOnce(src,globalName){return new Promise((res,rej)=>{if(window[globalName])return res(window[globalName]);const s=document.createElement("script");s.src=src;s.onload=()=>window[globalName]?res(window[globalName]):rej(new Error("Tree data didn't load"));s.onerror=()=>rej(new Error(`Couldn't load ${src}`));document.head.appendChild(s)})}
function decodeTreeUrl(u){
  const seg=String(u||"").trim().split(/[\/?#]/).filter(Boolean).pop()||"";
  let b=seg.replace(/-/g,"+").replace(/_/g,"/");while(b.length%4)b+="=";
  const bin=atob(b);const by=[...bin].map(c=>c.charCodeAt(0));
  if(by.length<7) throw new Error("That link doesn't contain a tree.");
  const v=((by[0]<<24)|(by[1]<<16)|(by[2]<<8)|by[3])>>>0;
  let i=v>=4?7:6;const count=v>=4?by[6]:Math.floor((by.length-i)/2);const nodes=[];
  for(let k=0;k<count&&i+1<by.length;k++,i+=2) nodes.push((by[i]<<8)|by[i+1]);
  return {version:v,cls:by[4],asc:by[5],nodes};
}
const MECH_COLORS={legion:"#c76b4a",abyss:"#7f5fc9",breach:"#b04ad6",expedition:"#d1a04a",ritual:"#c94a4a",harvest:"#5fbf6a",essence:"#4ab0c9",strongbox:"#c9b84a",ultimatum:"#d9744a",blight:"#5fa04a",bestiary:"#a0784a",betrayal:"#6a8fd9",incursion:"#4ac99f",delirium:"#bbbbbb",shrine:"#e0d080",heretics:"#9a4a6a",threads:"#c9a45c",maps:"#8fa0b8",mercenaries:"#b89a6a",rogue:"#9a9a6a",exarch:"#e0703a",eater:"#6ad0a0",general:"#8a7d6a"};
const TV={kind:"skill",data:{},scale:0.03,ox:0,oy:0,w:0,h:0,hover:null,search:"",mode:"diff",stage:null,planned:null,fitted:{},pointers:new Map(),pinch:null,raf:0};
function tvSets(){
  if(TV.kind==="skill"){
    const g=G&&(G.specs[(TV.stage||G.activeSpec||1)-1]||G.specs[0]);
    const c=C&&C!==G?currentSpec(C):null;
    return {a:new Set((g&&g.ids||[]).map(Number)),b:new Set((c&&c.ids||[]).map(Number))};
  }
  const al=new Set([...(S.atlasHashes||[]).map(Number),...Object.entries(S.atlasManual||{}).filter(([,v])=>v).map(([k])=>+k)]);
  return {a:al,b:new Set(TV.planned||[])};
}
function tvState(id,sets){
  if(TV.kind==="skill"){const g=sets.a.has(id),c=sets.b.has(id);if(TV.mode==="goal")return g?"shared":"none";if(TV.mode==="current")return c?"shared":"none";return g&&c?"shared":g?"add":c?"remove":"none"}
  const al=sets.a.has(id),pl=sets.b.has(id);return al?"shared":pl?"add":"none";
}
const TV_COL={shared:"#c9a45c",get add(){return cssVar("--good")||"#71c27a"},get remove(){return cssVar("--bad")||"#e0584b"},none:"#4a3e30"};
function cssVar(n){try{return getComputedStyle(document.documentElement).getPropertyValue(n).trim()}catch(e){return ""}}
const TV_R={s:[14,1.4],n:[26,2.8],k:[40,4.2],m:[22,2.2],j:[26,2.8],c:[46,4]};
function tvDraw(){
  cancelAnimationFrame(TV.raf);
  TV.raf=requestAnimationFrame(()=>{
    const cv=$("tvCanvas");if(!cv) return;const d=TV.data[TV.kind];if(!d) return;
    const dpr=window.devicePixelRatio||1,w=cv.clientWidth,h=cv.clientHeight;
    if(cv.width!==Math.round(w*dpr)||cv.height!==Math.round(h*dpr)){cv.width=Math.round(w*dpr);cv.height=Math.round(h*dpr)}
    const ctx=cv.getContext("2d");ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,w,h);
    const sets=tvSets(),st=d.nodes.map(n=>tvState(n[0],sets));
    const X=x=>x*TV.scale+TV.ox,Y=y=>y*TV.scale+TV.oy;
    const stratMech=TV.kind==="atlas"?STRAT_MECH[(STRATS.find(s=>s.id===S.strat)||{}).id]:null;
    const q=TV.search.trim().toLowerCase();
    // edges
    ctx.lineWidth=Math.max(1,TV.scale*6);
    for(const [i,j,arc] of d.edges){
      const a=d.nodes[i],b=d.nodes[j];const sa=st[i],sb=st[j];
      const col=sa===sb&&sa!=="none"?TV_COL[sa]:(sa!=="none"&&sb!=="none")?TV_COL.shared:"#2c241b";
      ctx.strokeStyle=col;ctx.globalAlpha=col==="#2c241b"?1:.85;ctx.beginPath();
      if(arc){const g=d.groups[a[6]];const r=d.radii[a[7]];const a1=Math.atan2(a[2]-g[1],a[1]-g[0]),a2=Math.atan2(b[2]-g[1],b[1]-g[0]);let da=a2-a1;while(da>Math.PI)da-=2*Math.PI;while(da<-Math.PI)da+=2*Math.PI;ctx.arc(X(g[0]),Y(g[1]),r*TV.scale,a1,a1+da,da<0)}
      else{ctx.moveTo(X(a[1]),Y(a[2]));ctx.lineTo(X(b[1]),Y(b[2]))}
      ctx.stroke();
    }
    ctx.globalAlpha=1;
    // nodes
    d.nodes.forEach((n,i)=>{
      const [wr,minr]=TV_R[n[3]]||TV_R.s;const r=Math.max(wr*TV.scale,minr);const x=X(n[1]),y=Y(n[2]);
      if(x<-20||y<-20||x>w+20||y>h+20) return;
      let fill=TV_COL[st[i]];
      if(st[i]==="none"&&TV.kind==="atlas"&&(n[3]==="n"||n[3]==="k")) fill=MECH_COLORS[n[8]]||TV_COL.none;
      ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.fillStyle=fill;ctx.globalAlpha=st[i]==="none"?(n[3]==="s"?.55:.8):1;ctx.fill();ctx.globalAlpha=1;
      if(stratMech&&n[8]===stratMech&&(n[3]==="n"||n[3]==="k")){ctx.lineWidth=1.5;ctx.strokeStyle="#fff";ctx.stroke()}
      if(q&&(n[4].toLowerCase().includes(q)||n[5].toLowerCase().includes(q))){ctx.lineWidth=2;ctx.strokeStyle="#ffffff";ctx.beginPath();ctx.arc(x,y,r+3,0,Math.PI*2);ctx.stroke()}
      if(TV.hover===i){ctx.lineWidth=2;ctx.strokeStyle="#fff";ctx.beginPath();ctx.arc(x,y,r+2,0,Math.PI*2);ctx.stroke()}
      if((n[3]==="k"||n[3]==="n")&&TV.scale>0.09){ctx.fillStyle="#e8dfcf";ctx.font="11px "+getComputedStyle(document.body).fontFamily;ctx.textAlign="center";ctx.fillText(n[4],x,y-r-4)}
    });
  });
}
function tvFit(){
  const d=TV.data[TV.kind];const cv=$("tvCanvas");if(!d||!cv) return;
  const xs=d.nodes.map(n=>n[1]),ys=d.nodes.map(n=>n[2]);
  const x0=Math.min(...xs),x1=Math.max(...xs),y0=Math.min(...ys),y1=Math.max(...ys);
  const w=cv.clientWidth,h=cv.clientHeight;
  TV.scale=Math.min(w/(x1-x0),h/(y1-y0))*0.96;TV.ox=w/2-(x0+x1)/2*TV.scale;TV.oy=h/2-(y0+y1)/2*TV.scale;
}
function tvFocus(ids){
  const d=TV.data[TV.kind];const cv=$("tvCanvas");if(!d||!cv) return;const pts=d.nodes.filter(n=>ids.has(n[0]));if(!pts.length){tvFit();return}
  const xs=pts.map(n=>n[1]),ys=pts.map(n=>n[2]);const x0=Math.min(...xs),x1=Math.max(...xs),y0=Math.min(...ys),y1=Math.max(...ys);
  const w=cv.clientWidth,h=cv.clientHeight;TV.scale=Math.min(0.25,Math.min(w/(x1-x0+800),h/(y1-y0+800)));TV.ox=w/2-(x0+x1)/2*TV.scale;TV.oy=h/2-(y0+y1)/2*TV.scale;
}
function tvNodeAt(px,py){
  const d=TV.data[TV.kind];if(!d) return null;let best=null,bd=1e9;
  d.nodes.forEach((n,i)=>{const x=n[1]*TV.scale+TV.ox,y=n[2]*TV.scale+TV.oy;const dd=(x-px)**2+(y-py)**2;const r=Math.max((TV_R[n[3]]||TV_R.s)[0]*TV.scale,(TV_R[n[3]]||TV_R.s)[1])+6;if(dd<r*r&&dd<bd){bd=dd;best=i}});
  return best;
}
function tvTip(i,px,py){
  const tip=$("tvTip");if(!tip) return;
  if(i==null){tip.hidden=true;return}
  const n=TV.data[TV.kind].nodes[i];const sets=tvSets();const s=tvState(n[0],sets);
  const lab=TV.kind==="skill"?{shared:TV.mode==="diff"?"You have it, and so does the guide":"Allocated",add:"In the guide: take it",remove:"Not in the guide: refund it",none:""}[s]:{shared:"Allocated",add:"In your plan",none:""}[s];
  const kindName={s:"Passive",n:"Notable",k:"Keystone",m:"Mastery",j:"Jewel socket",c:"Class start"}[n[3]]||"";
  tip.innerHTML=`<b>${esc(n[4]||kindName)}</b> <span class="muted small">${kindName}${TV.kind==="atlas"&&n[8]&&n[8]!=="general"?" · "+esc(n[8]):""}</span>${n[5]?`<div class="small" style="white-space:pre-line">${esc(stripTags(n[5]))}</div>`:""}${lab?`<div class="small" style="color:${TV_COL[s]}">${lab}</div>`:""}`;
  const z=ZF(),B=$("tvWrap").getBoundingClientRect(),box={width:B.width/z,height:B.height/z};tip.hidden=false;
  const tw=tip.offsetWidth,th=tip.offsetHeight;tip.style.left=Math.min(box.width-tw-4,Math.max(4,px+14))+"px";tip.style.top=Math.min(box.height-th-4,Math.max(4,py+14))+"px";
}
function tvBind(){
  const cv=$("tvCanvas");if(!cv||cv.dataset.bound) return;cv.dataset.bound="1";
  const pos=e=>{const r=cv.getBoundingClientRect(),z=ZF();return [(e.clientX-r.left)/z,(e.clientY-r.top)/z]};
  cv.addEventListener("wheel",e=>{e.preventDefault();const [x,y]=pos(e);const f=Math.exp(-e.deltaY*0.0015);const ns=Math.min(1.2,Math.max(0.01,TV.scale*f));TV.ox=x-(x-TV.ox)*ns/TV.scale;TV.oy=y-(y-TV.oy)*ns/TV.scale;TV.scale=ns;tvDraw()},{passive:false});
  cv.addEventListener("pointerdown",e=>{cv.setPointerCapture(e.pointerId);TV.pointers.set(e.pointerId,pos(e));TV.moved=false;if(TV.pointers.size===2){const [a,b]=[...TV.pointers.values()];TV.pinch={d:Math.hypot(a[0]-b[0],a[1]-b[1]),s:TV.scale}}});
  cv.addEventListener("pointermove",e=>{
    const p=pos(e);
    if(TV.pointers.has(e.pointerId)){
      const prev=TV.pointers.get(e.pointerId);TV.pointers.set(e.pointerId,p);
      if(TV.pointers.size===2&&TV.pinch){const [a,b]=[...TV.pointers.values()];const d=Math.hypot(a[0]-b[0],a[1]-b[1]);const cx=(a[0]+b[0])/2,cy=(a[1]+b[1])/2;const ns=Math.min(1.2,Math.max(0.01,TV.pinch.s*d/TV.pinch.d));TV.ox=cx-(cx-TV.ox)*ns/TV.scale;TV.oy=cy-(cy-TV.oy)*ns/TV.scale;TV.scale=ns}
      else{TV.ox+=p[0]-prev[0];TV.oy+=p[1]-prev[1]}
      if(Math.abs(p[0]-prev[0])+Math.abs(p[1]-prev[1])>2)TV.moved=true;
      tvTip(null);tvDraw();return;
    }
    const i=tvNodeAt(p[0],p[1]);if(i!==TV.hover){TV.hover=i;tvDraw()}tvTip(i,p[0],p[1]);
  });
  const up=e=>{TV.pointers.delete(e.pointerId);if(TV.pointers.size<2)TV.pinch=null;
    if(!TV.moved&&TV.kind==="atlas"&&!(S.atlasHashes&&S.atlasHashes.length)){const [x,y]=pos(e);const i=tvNodeAt(x,y);if(i!=null){const id=TV.data.atlas.nodes[i][0];S.atlasManual=S.atlasManual||{};S.atlasManual[id]=!S.atlasManual[id];save();tvDraw();renderTreeSide();renderAtlasTree()}}
    if(!TV.moved&&e.pointerType!=="mouse"){const [x,y]=pos(e);const i=tvNodeAt(x,y);TV.hover=i;tvTip(i,x,y);tvDraw()}};
  cv.addEventListener("pointerup",up);cv.addEventListener("pointercancel",up);
  cv.addEventListener("pointerleave",()=>{TV.hover=null;tvTip(null);tvDraw()});
  window.addEventListener("resize",()=>{if($("tab-trees")&&$("tab-trees").classList.contains("on"))tvDraw()});
}
async function tvEnsure(){
  if(TV.data[TV.kind]) return true;
  $("tvStatus").textContent="Loading tree data…";
  try{const d=await loadScriptOnce(TV.kind==="skill"?"treedata.js":"atlasdata.js",TV.kind==="skill"?"SKILLTREE":"ATLASTREE");TV.data[TV.kind]=d;$("tvStatus").textContent="";return true}
  catch(e){$("tvStatus").textContent=e.message;return false}
}
function renderTreeSide(){
  const el=$("tvSide");if(!el) return;const d=TV.data[TV.kind];
  if(TV.kind==="skill"){
    const sets=tvSets();const nm=id=>{const n=d&&d.nodes.find(x=>x[0]===id);return n?n[4]:null};
    const add=[...sets.a].filter(i=>!sets.b.has(i)),rem=[...sets.b].filter(i=>!sets.a.has(i)),shared=[...sets.a].filter(i=>sets.b.has(i)).length;
    const notable=ids=>d?ids.map(id=>d.nodes.find(x=>x[0]===id)).filter(n=>n&&(n[3]==="n"||n[3]==="k")).map(n=>n[4]):[];
    el.innerHTML=`<div class="row"><span class="pill gold">${shared} shared</span><span class="pill good">${add.length} to take</span><span class="pill bad">${rem.length} to refund</span></div>
      ${C&&C!==G?"":emptyBox("Import your current character (or sync it from your account) to see what's left to buy.",[["Import current character","importCurrent"]].concat(DESK?[["Sync from account","syncChar"]]:[]))}
      ${notable(add).length?`<p class="small" style="margin:0"><b style="color:var(--good)">Notables to take:</b> ${notable(add).map(esc).join(", ")}</p>`:""}
      ${notable(rem).length?`<p class="small" style="margin:0"><b style="color:var(--bad)">Notables to refund:</b> ${notable(rem).map(esc).join(", ")}</p>`:""}`;
  } else {
    const sets=tvSets();const counts={};if(d)d.nodes.forEach(n=>{if(sets.a.has(n[0])&&n[3]!=="m")counts[n[8]]=(counts[n[8]]||0)+1});
    el.innerHTML=`<div class="row"><span class="pill gold">${sets.a.size} allocated</span>${TV.planned?`<span class="pill good">${TV.planned.filter(x=>!sets.a.has(x)).length} more in plan</span>`:""}</div>
      <p class="small muted" style="margin:0">${S.atlasHashes&&S.atlasHashes.length?"From your GGG account.":"Click nodes to mark them as taken (your clicks are saved), or read your tree from your account on the Atlas tab."} White rings: your chosen farm's nodes.</p>
      ${Object.keys(counts).length?`<div class="row">${Object.entries(counts).sort((a,b)=>b[1]-a[1]).slice(0,10).map(([k,v])=>`<span class="pill" style="border-color:${MECH_COLORS[k]||"#555"}">${esc(k)} ${v}</span>`).join("")}</div>`:""}
      <label class="f" for="tvPlan">Compare with a plan from GGG's atlas planner (paste its link)<div class="row"><input type="text" id="tvPlan" placeholder="https://www.pathofexile.com/fullscreen-atlas-skill-tree/…" style="flex:1"><button class="btn ghost small" id="tvPlanGo">Show</button>${TV.planned?'<button class="btn ghost small" id="tvPlanClear">Clear</button>':""}</div></label>`;
    $("tvPlanGo").onclick=()=>{try{TV.planned=decodeTreeUrl($("tvPlan").value).nodes;$("tvStatus").textContent="";renderTreeSide();tvDraw()}catch(e){$("tvStatus").textContent=e.message}};
    const pc=$("tvPlanClear");if(pc)pc.onclick=()=>{TV.planned=null;renderTreeSide();tvDraw()};
  }
}
async function renderTrees(){
  const el=$("treesCard");if(!el) return;
  const specs=G?G.specs:[];
  el.innerHTML=`<div class="row" style="justify-content:space-between"><div class="seg" id="tvKind"><button aria-pressed="${TV.kind==="skill"}" data-v="skill">Skill tree</button><button aria-pressed="${TV.kind==="atlas"}" data-v="atlas">Atlas tree</button></div>
      <div class="row">${TV.kind==="skill"?`${specs.length>1?`<select id="tvStage" aria-label="Guide stage">${specs.map((s,i)=>`<option value="${i+1}"${(TV.stage||G.activeSpec)===i+1?" selected":""}>${esc(s.title)}</option>`).join("")}</select>`:""}<div class="seg" id="tvMode"><button aria-pressed="${TV.mode==="diff"}" data-v="diff">Compare</button><button aria-pressed="${TV.mode==="goal"}" data-v="goal">Guide</button><button aria-pressed="${TV.mode==="current"}" data-v="current">Mine</button></div>`:""}
      <input type="text" id="tvSearch" placeholder="Search nodes" value="${esc(TV.search)}" style="width:150px"><button class="btn ghost small" id="tvFitBtn">Fit</button></div></div>
    <div id="tvWrap" style="position:relative;height:min(70vh,720px);min-height:320px;border:1px solid var(--line);border-radius:6px;background:#0b0a08;overflow:hidden;touch-action:none">
      <canvas id="tvCanvas" style="width:100%;height:100%;display:block;cursor:grab" aria-label="${TV.kind==="skill"?"Passive skill tree":"Atlas passive tree"}"></canvas>
      <div id="tvTip" hidden style="position:absolute;max-width:300px;background:var(--panel);border:1px solid var(--gold-dim);border-radius:6px;padding:8px 10px;pointer-events:none;display:grid;gap:3px;z-index:2"></div>
      <div class="small" style="position:absolute;left:8px;bottom:6px;display:flex;gap:10px;color:var(--muted)">${TV.kind==="skill"?'<span style="color:#c9a45c">● shared</span><span style="color:var(--good)">● to take</span><span style="color:var(--bad)">● to refund</span>':'<span style="color:#c9a45c">● allocated</span><span style="color:var(--good)">● in plan</span><span>colours: mechanic</span>'}</div>
    </div>
    <p class="small muted" id="tvStatus" role="status" style="margin:0"></p>
    <div id="tvSide" style="display:grid;gap:6px"></div>
    <p class="note" style="margin:0">Drag to move, scroll or pinch to zoom, hover (or tap) a node for details. Tree data: GGG's 3.30 export.</p>`;
  $("tvKind").onclick=async e=>{const v=e.target.dataset.v;if(v&&v!==TV.kind){TV.kind=v;TV.search="";await renderTrees()}};
  const md=$("tvMode");if(md)md.onclick=e=>{const v=e.target.dataset.v;if(v){TV.mode=v;md.querySelectorAll("button").forEach(b=>b.setAttribute("aria-pressed",b.dataset.v===v));tvDraw();renderTreeSide()}};
  const sg=$("tvStage");if(sg)sg.onchange=()=>{TV.stage=+sg.value;tvDraw();renderTreeSide()};
  $("tvSearch").oninput=e=>{TV.search=e.target.value;tvDraw()};
  $("tvFitBtn").onclick=()=>{tvFit();tvDraw()};
  tvBind();
  if(await tvEnsure()){
    if(!TV.fitted[TV.kind]){const sets=tvSets();const ids=TV.kind==="skill"?new Set([...sets.a,...sets.b]):sets.a;if(ids.size)tvFocus(ids);else tvFit();TV.fitted[TV.kind]=true}
    renderTreeSide();tvDraw();
  }
}

/* ---------- atlas map completion (from your game log) ---------- */
const normMap=s=>String(s||"").toLowerCase().replace(/ map$/,"").replace(/[^a-z]/g,"");
let MAP_POOL=(S.mapPool||[]);
async function refreshMapPool(force){
  if(!DESK) return;
  if(!force&&S.mapPool&&S.mapPool.length&&Date.now()-(S.mapPoolAt||0)<86400e3){MAP_POOL=S.mapPool;return}
  try{const lg=await ninjaLeagueId();const r=await DESK.http({url:`https://poe.ninja/poe1/api/economy/stash/current/item/overview?league=${encodeURIComponent(lg)}&type=Map`,cacheMs:6*3600e3});
    const seen={};((r.data&&r.data.lines)||[]).forEach(l=>{const nm=String(l.baseType||l.name||"").replace(/ Map$/,"").replace(/ \(Tier \d+\)$/,"");const k=normMap(nm);if(!k||seen[k])return;seen[k]={key:k,name:nm,tier:l.mapTier||null}});
    const pool=Object.values(seen).sort((a,b)=>(a.tier||99)-(b.tier||99)||a.name.localeCompare(b.name));
    if(pool.length>20){S.mapPool=pool;S.mapPoolAt=Date.now();MAP_POOL=pool;save();renderMapCompletion()}
  }catch(e){}
}
function markMapDone(id,t){const k=normMap(mapNameFromId(id));if(!k)return false;S.mapsDone=S.mapsDone||{};if(S.mapsDone[k])return false;S.mapsDone[k]=t||Date.now();return !MAP_POOL.length||MAP_POOL.some(m=>m.key===k)}
function renderMapCompletion(){
  const el=$("mapsCompletion");if(!el) return;
  const done=S.mapsDone||{};const total=MAP_POOL.length,n=total?MAP_POOL.filter(m=>done[m.key]).length:Object.keys(done).length;
  const left=MAP_POOL.filter(m=>!done[m.key]);
  const byTier={};left.forEach(m=>{const t=m.tier||"?";(byTier[t]=byTier[t]||[]).push(m)});
  el.innerHTML=`<div class="row" style="justify-content:space-between"><h2>Atlas map completion</h2><span class="pill ${total&&n===total?"good":"gold"}">${total?`${n}/${total} maps`:`${n} maps run`}</span></div>
    ${total?`<div class="meter"><i style="width:${Math.round(n/total*100)}%"></i></div>`:`<p class="small muted" style="margin:0">${DESK?"Loading this league's map list from poe.ninja…":"The full map list loads from poe.ninja in the desktop app."}</p>`}
    <p class="small muted" style="margin:0">Maps you've run, read from your game log${DESK?" (live)":" (upload Client.txt under Play → Session)"}. Each new map you complete adds to your atlas bonus; the in-game atlas is the final word on bonus objectives.</p>
    ${total&&left.length?`<details class="small"><summary style="cursor:pointer">Still to run (${left.length})</summary><div style="display:grid;gap:4px;margin-top:6px">${Object.entries(byTier).map(([t,ms])=>`<div><b>${t==="?"?"Other":"Tier "+t}:</b> ${ms.map(m=>esc(m.name)).join(", ")}</div>`).join("")}</div></details>`:total?'<p class="small" style="margin:0">Every map done. Nice.</p>':""}
    ${total?`<details class="small"><summary style="cursor:pointer">Mark maps by hand</summary><div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:2px;margin-top:6px;max-height:220px;overflow:auto">${MAP_POOL.slice().sort((a,b)=>a.name.localeCompare(b.name)).map(m=>`<label class="row"><input type="checkbox" data-mapd="${esc(m.key)}"${done[m.key]?" checked":""}> ${esc(m.name)}${m.tier?` <span class="muted">T${m.tier}</span>`:""}</label>`).join("")}</div></details>`:Object.keys(done).length?`<p class="small muted" style="margin:0">Run so far: ${Object.keys(done).map(esc).join(", ")}</p>`:""}`;
  el.querySelectorAll("[data-mapd]").forEach(c=>c.onchange=()=>{S.mapsDone=S.mapsDone||{};if(c.checked)S.mapsDone[c.dataset.mapd]=Date.now();else delete S.mapsDone[c.dataset.mapd];save();renderMapCompletion()});
}

/* ---------- pinnacle boss checklist ---------- */
const BOSSES=[
  {id:"exarch",name:"The Searing Exarch",tier:1},{id:"eater",name:"The Eater of Worlds",tier:1},{id:"shaper",name:"The Shaper",tier:1},{id:"elder",name:"The Elder",tier:1},
  {id:"maven",name:"The Maven",tier:2},{id:"uelder",name:"Uber Elder",tier:2},{id:"sirus",name:"Sirus, Awakener of Worlds",tier:2},
  {id:"uexarch",name:"Uber Searing Exarch",tier:3},{id:"ueater",name:"Uber Eater of Worlds",tier:3},{id:"ushaper",name:"Uber Shaper",tier:3},{id:"uuelder",name:"Uber Uber Elder",tier:3},{id:"umaven",name:"Uber Maven",tier:3},{id:"usirus",name:"Uber Sirus",tier:3},{id:"uatziri",name:"Uber Atziri (Temple: Cradle of Creation)",tier:3}];
const BOSS_REQ={1:{dps:2e6,pool:5000},2:{dps:4e6,pool:6000},3:{dps:2e7,pool:7500,ehp:60000}};
function bossReady(t,b){
  const r=BOSS_REQ[b.tier];const res=t.res;const capped=["fire","cold","lightning"].every(k=>res[k]==null||res[k]>=75);
  const checks=[["DPS",t.dps>=r.dps,`${fmt(t.dps)} / ${fmt(r.dps)}`],["Life + ES",t.pool>=r.pool,`${fmt(t.pool)} / ${fmt(r.pool)}`],["Resists capped",capped,capped?"yes":"no"]];
  if(r.ehp) checks.push(["Effective HP",t.ehp>=r.ehp,`${fmt(t.ehp)} / ${fmt(r.ehp)}`]);
  if(b.tier>=2) checks.push(["Chaos res ≥ 0",(res.chaos??-60)>=0,`${res.chaos??"?"}%`]);
  return checks;
}
function renderBosses(){
  const el=$("mapsBosses");if(!el) return;
  S.bosses=S.bosses||{};S.bossNotes=S.bossNotes||{};
  el.innerHTML=`<h2>Pinnacle bosses</h2>
    <p class="small muted" style="margin:0">Readiness uses your current character's numbers against rules of thumb. Write your own notes for each fight.</p>
    <div style="display:grid;gap:6px">${BOSSES.map(b=>{const ch=bossReady(T,b);const ok=ch.every(c=>c[1]);return `<details class="sg"><summary class="row" style="justify-content:space-between;cursor:pointer"><span class="row"><input type="checkbox" data-boss="${b.id}"${S.bosses[b.id]?" checked":""} aria-label="Killed ${esc(b.name)}"> <b${S.bosses[b.id]?' style="color:var(--good)"':""}>${esc(b.name)}</b></span><span class="pill ${S.bosses[b.id]?"good":ok?"good":"warn"}">${S.bosses[b.id]?"Killed":ok?"Ready":"Not yet"}</span></summary>
      <div class="row small" style="margin-top:6px">${ch.map(c=>`<span class="pill ${c[1]?"good":"bad"}">${c[0]}: ${esc(c[2])}</span>`).join("")}</div>
      <textarea data-bnote="${b.id}" placeholder="Your notes: phases, what killed you, flasks to use…" style="min-height:60px;margin-top:6px">${esc(S.bossNotes[b.id]||"")}</textarea></details>`}).join("")}</div>`;
  el.querySelectorAll("[data-boss]").forEach(c=>{c.onclick=e=>e.stopPropagation();c.onchange=()=>{S.bosses[c.dataset.boss]=c.checked;save();renderBosses()}});
  el.querySelectorAll("[data-bnote]").forEach(t=>t.onchange=()=>{S.bossNotes[t.dataset.bnote]=t.value;save()});
}

/* ---------- cost to finish the build (desktop) ---------- */
let STATIDX=null;
async function tradeStatIndex(){if(STATIDX)return STATIDX;const r=await DESK.http({url:"https://www.pathofexile.com/api/trade/data/stats",cacheMs:24*3600e3});STATIDX=new Map();((r.data&&r.data.result)||[]).forEach(g=>(g.entries||[]).forEach(e=>{const k=(e.type||g.id)+"|"+e.text.toLowerCase();if(!STATIDX.has(k))STATIDX.set(k,e.id)}));return STATIDX}
async function priceRareOnTrade(item,slot,P){
  const idx=await tradeStatIndex();const league=S.league||(LIVE.cfg&&LIVE.cfg.league);
  const local=/Weapon|Body|Helmet|Gloves|Boots/.test(slot);
  const filters=item.mods.filter(m=>!m.crafted).map(m=>({m,p:modWant(m.text).prio})).filter(x=>x.p>=(/Weapon/.test(slot)?3:4)).slice(0,4).map(x=>{const t=x.m.text.toLowerCase().replace(/\d+(\.\d+)?/g,"#");const id=(local&&idx.get("explicit|"+t+" (local)"))||idx.get("explicit|"+t);const v=valOf(x.m.text);return id?{id,value:v!=null&&v>=5?{min:Math.floor(v*0.8)}:{},disabled:false}:null}).filter(Boolean);
  if(!filters.length) return null;
  const s=await DESK.http({url:`https://www.pathofexile.com/api/trade/search/${encodeURIComponent(league)}`,method:"POST",body:{query:{status:{option:"online"},type:item.base,stats:[{type:"and",filters}],filters:{type_filters:{filters:{rarity:{option:"nonunique"}}}}},sort:{price:"asc"}}});
  if(s.status===429) throw new Error(`Trade site busy: try again in ${s.retryAfter||30}s.`);
  const ids=(s.data&&s.data.result||[]).slice(0,5);if(!ids.length) return {none:true};
  const f=await DESK.http({url:`https://www.pathofexile.com/api/trade/fetch/${ids.join(",")}?query=${s.data.id}`});
  const rate=c=>c==="chaos"?1:c==="divine"?P.div:c==="exalted"?P.cur["Exalted Orb"]:null;
  const vals=((f.data&&f.data.result)||[]).map(x=>x&&x.listing&&x.listing.price).filter(Boolean).map(p=>rate(p.currency)!=null?p.amount*rate(p.currency):null).filter(v=>v!=null).sort((a,b)=>a-b);
  return vals.length?{chaos:vals[Math.floor(vals.length/2)],url:`https://www.pathofexile.com/trade/search/${encodeURIComponent(league)}/${s.data.id}`}:{none:true};
}
async function computeCost(withRares){
  if(!DESK||!C||!G) return;
  S.cost={busy:true,rows:[]};renderCost();
  try{
    const P=await ninjaPrices(false);const r=compareAll();const rows=[];
    r.items.filter(x=>x.status!=="done"&&!/Flask/.test(x.slot)).forEach(x=>{
      if(x.item.rarity==="UNIQUE"){const l=P.items[x.item.name];const v=l?Math.min(...l.filter(y=>!(y.links>=5)||y.links===(x.item.links||0)).map(y=>y.chaosValue).filter(v=>v!=null)):null;rows.push({kind:"Unique",name:x.item.name,slot:x.slot,chaos:isFinite(v)?v:null})}
      else rows.push({kind:"Rare",name:x.item.base,slot:x.slot,chaos:null,item:x.item,pending:true});
    });
    r.gems.filter(x=>x.st==="missing").forEach(x=>{const l=P.items[x.g.name]||P.items[x.g.name+" Support"];let v=null;if(l){const ok=l.filter(y=>!y.corrupted);v=Math.min(...(ok.length?ok:l).map(y=>y.chaosValue).filter(v=>v!=null))}rows.push({kind:"Gem",name:x.g.name,chaos:isFinite(v)?v:(v==null&&!/^Awakened|^Vaal/.test(x.g.name)?1:null)})});
    S.cost={busy:!!withRares,rows,at:Date.now(),div:P.div};renderCost();
    if(withRares){for(const row of rows.filter(x=>x.pending)){row.status="Searching…";renderCost();try{const pr=await priceRareOnTrade(row.item,row.slot,P);row.chaos=pr&&pr.chaos||null;row.url=pr&&pr.url;row.status=pr&&pr.none?"No matches":""}catch(e){row.status=e.message;break}row.pending=false;await new Promise(r=>setTimeout(r,2500))}}
  }finally{if(S.cost){S.cost.busy=false;S.cost.rows.forEach(r=>{delete r.item});save()}renderCost()}
}
function renderCost(){
  const el=$("progCost");if(!el) return;
  if(!DESK){el.innerHTML=`<h2>Cost to finish</h2><p class="small muted" style="margin:0">Available in the desktop app (it needs live prices).</p>`;return}
  const c=S.cost;const tot=c?c.rows.reduce((a,r)=>a+(r.chaos||0),0):0;const unknown=c?c.rows.filter(r=>r.chaos==null).length:0;
  el.innerHTML=`<div class="row" style="justify-content:space-between"><h2>Cost to finish</h2>${c&&c.rows.length?`<span class="big num" style="font-size:1.6rem">${c.div?(tot/c.div).toFixed(1)+" div":fmt(tot)+"c"}</span>`:""}</div>
    <div class="row"><button class="btn" id="costGo"${c&&c.busy?" disabled":""}>Uniques & gems</button><button class="btn ghost" id="costRares"${c&&c.busy?" disabled":""}>Include rares (trade site, slow)</button></div>
    ${!C||C===G?'<p class="small muted" style="margin:0">Import or sync your current character first.</p>':""}
    ${c&&c.rows.length?`<div class="tw"><table><thead><tr><th>Item</th><th>Type</th><th>Price</th></tr></thead><tbody>${c.rows.slice().sort((a,b)=>(a.chaos??1e12)-(b.chaos??1e12)).map(r=>`<tr><td>${esc(r.name)}${r.slot?` <span class="muted">· ${esc(r.slot)}</span>`:""}</td><td>${r.kind}</td><td class="num">${r.chaos!=null?(r.url?`<a href="${esc(r.url)}" target="_blank" rel="noopener">${fmt(r.chaos)}c</a>`:fmt(r.chaos)+"c"):esc(r.status||"–")}</td></tr>`).join("")}</tbody></table></div><p class="small muted" style="margin:0">Cheapest first.${unknown?` ${unknown} item${unknown>1?"s":""} without a price yet.`:""} Rare prices are the median of the 5 cheapest listings with the guide's key mods at 80% of its rolls.</p>`:c&&!c.busy?'<p class="small" style="margin:0">Nothing left to buy. Your character matches the goal.</p>':""}`;
  $("costGo").onclick=()=>computeCost(false);$("costRares").onclick=()=>computeCost(true);
}

/* ---------- backups (desktop) ---------- */
function dumpData(){const o={};try{for(let i=0;i<localStorage.length;i++){const k=localStorage.key(i);if(k.startsWith("ec330."))o[k]=localStorage.getItem(k)}}catch(e){}return {app:"Exile Companion",v:1,at:Date.now(),data:o}}
async function restoreData(json){const p=typeof json==="string"?JSON.parse(json):json;if(!p||p.app!=="Exile Companion"||!p.data)throw new Error("That file isn't an Exile Companion backup.");Object.entries(p.data).forEach(([k,v])=>{try{localStorage.setItem(k,v)}catch(e){}});location.reload()}
function renderBackup(){
  const el=$("deskBackup");if(!el||!DESK||!DESK.backupSave) return;
  el.innerHTML=`<h2>Backup & restore</h2>
    <p class="small" style="margin:0">Everything the app knows (builds, progress, map log, net worth history, settings in the app) in one file. Your POESESSID and GGG sign-in are never included.</p>
    <div class="row"><button class="btn" id="bkSave">Save a backup…</button><button class="btn ghost" id="bkLoad">Restore from file…</button><span class="small" id="bkMsg" role="status"></span></div>
    <p class="small muted" style="margin:0">The app also keeps a daily automatic backup (last 7 days) in its data folder. ${LIVE.lastAutoBackup?`Last: ${esc(LIVE.lastAutoBackup)}`:""}</p>`;
  $("bkSave").onclick=async()=>{const r=await DESK.backupSave(JSON.stringify(dumpData()));$("bkMsg").textContent=r&&r.ok?`Saved to ${r.data}`:r&&r.error||"Cancelled"};
  $("bkLoad").onclick=async()=>{const r=await DESK.backupOpen();if(!r||!r.ok){$("bkMsg").textContent=r&&r.error||"Cancelled";return}try{await restoreData(r.data)}catch(e){$("bkMsg").textContent=e.message}};
}
async function autoBackup(){if(!DESK||!DESK.backupAuto)return;const r=await DESK.backupAuto(JSON.stringify(dumpData()));if(r&&r.ok){LIVE.lastAutoBackup=r.data;renderBackup()}}

/* ---------- cheat sheets (desktop) ---------- */
async function renderCheats(){
  const el=$("deskCheats");if(!el||!DESK||!DESK.cheatList) return;
  const list=await DESK.cheatList();const c=LIVE.cfg||{};
  el.innerHTML=`<h2>Cheat sheets</h2>
    <p class="small" style="margin:0">Add your own images (a Betrayal board, boss notes, a map of the Lab). Press <b>${esc(keyName(c.cheatHotkey||"Ctrl+Shift+H"))}</b> in game to show the first one, press again for the next, and once more after the last to hide them.</p>
    <div class="row"><button class="btn" id="chAdd">Add images…</button></div>
    ${list.length?`<ul class="clean small">${list.map(x=>`<li class="row" style="justify-content:space-between"><span>${esc(x)}</span><button class="btn ghost small" data-chdel="${esc(x)}">Remove</button></li>`).join("")}</ul>`:emptyBox("No cheat sheets yet. Add images with the button above.")}`;
  $("chAdd").onclick=async()=>{await DESK.cheatAdd();renderCheats()};
  el.querySelectorAll("[data-chdel]").forEach(b=>b.onclick=async()=>{const n=b.dataset.chdel;await DESK.cheatRemove(n);renderCheats();toast(`Removed cheat sheet "${n}".`,async()=>{if(DESK.cheatRestore)await DESK.cheatRestore(n);renderCheats()})});
}

/* ---------- overlay pages ---------- */
function overlayPages(){
  const pages={};
  try{
    if(C&&C!==G){
      const r=compareAll();
      pages.build={pct:r.overall,bars:r.scores,steps:nextSteps(r).slice(0,4).map(s=>s.t),res:TC.res,dps:[TC.dps,TG.dps],pool:[TC.pool,TG.pool],cost:S.cost&&S.cost.rows&&S.cost.div?S.cost.rows.reduce((a,x)=>a+(x.chaos||0),0)/S.cost.div:null};
      pages.gear=r.items.filter(x=>!/Flask/.test(x.slot)).map(x=>({slot:x.slot,status:x.status,goal:x.item.name,now:x.cItem?x.cItem.name:null,ok:x.ok,total:x.total}));
    }
    const strat=withBuild(liveB(),()=>STRATS.find(x=>x.id===S.strat)||primaryStrat());
    const mech=STRAT_MECH[strat.id];const have=new Set([...(S.atlasHashes||[]).map(String),...Object.entries(S.atlasManual||{}).filter(([,v])=>v).map(([k])=>k)]);
    const done=S.mapsDone||{};
    pages.atlas={done:MAP_POOL.length?MAP_POOL.filter(m=>done[m.key]).length:Object.keys(done).length,total:MAP_POOL.length||0,strat:strat.name,threads:Object.entries(strat.threads),next:mech?atlasNodesFor(mech).filter(n=>!have.has(String(n.id))).slice(0,4).map(n=>n.name):[],bosses:BOSSES.filter(b=>!S.bosses||!S.bosses[b.id]).slice(0,3).map(b=>b.name)};
    const maps=S.session.maps,timed=maps.filter(m=>m.dur),ms=timed.reduce((a,m)=>a+m.dur,0),profit=maps.reduce((a,m)=>a+(+m.profit||0),0);
    const live=makeRecap();
    pages.tools={searches:[...((S.trade&&S.trade.saved)||[]).map(x=>({name:x.name,text:x.text})),
      {name:"Chaos recipe pieces",text:'"rarity: rare" "item level: (6\\d|7[0-4])"'},{name:"Regal recipe pieces",text:'"rarity: rare" "item level: (7[5-9]|8\\d)"'},{name:"Unidentified rares",text:'"rarity: rare" unidentified'}].slice(0,16)};
    pages.session={goal:goalState(),maps:maps.length,mapMs:ms,div:ms>60000&&profit?profit/(ms/3.6e6)/S.divine:null,profit,net:S.netLatest&&S.netLatest.div?S.netLatest.total/S.netLatest.div:null,sales:(S.sales||[]).filter(x=>Date.now()-x.t<86400e3).reduce((a,x)=>a+(x.chaos||0),0),recap:live?recapLine(live):null};
    pages.trades={alerts:Object.values(S.watch||{}).filter(w=>w.last!=null&&w.last<=w.target).map(w=>`${w.name}: ${fmt(w.last)}c (≤ ${fmt(w.target)}c)`),sold:(S.sales||[]).slice(-3).reverse().map(x=>`${x.name}: ${x.amount} ${x.cur}`)};
  }catch(e){console.error(e)}
  return pages;
}


/* ================= GAME-DATA ROUND: chat readouts, trends, wiki, div cards, patch alerts, links ================= */
/* ---------- /passives, /deaths, /played readouts ---------- */
const PT_QUESTS=["The Dweller of the Deep","The Marooned Mariner","The Way Forward","Deal with the Bandits","Victario's Secrets","Piety's Pets","An Indomitable Spirit","In Service to Science","Kitava's Torments","The Father of War","The Puppet Mistress","The Cloven One","The Master of a Million Faces","Queen of Despair","Kishara's Star","Love is Dead","The Gemling Legion","Reflection of Terror","Queen of the Sands","The Ruler of Highgate","Vilenta's Vengeance","An End to Hunger"];
const PT_STEP=(()=>{const m={};PT_QUESTS.forEach(q=>{CAMPAIGN.forEach(c=>c.steps.forEach((s,i)=>{if(s.k==="pt"&&s.t.toLowerCase().includes(q.toLowerCase().replace(/^the /,"")))m[q]=c.act+"-"+i}))});return m})();
function onSystemLine(text,t){
  let changed=false,m;
  const low=text.toLowerCase();
  PT_QUESTS.forEach(q=>{if(low.includes(q.toLowerCase())&&PT_STEP[q]){S.camp=S.camp||{};if(!S.camp[PT_STEP[q]]){S.camp[PT_STEP[q]]=true;changed=true}}});
  if((m=text.match(/died (\d+) times?/i))||(m=text.match(/(\d+) deaths?\b/i))){S.gameDeaths={n:+m[1],t};changed=true}
  if((m=text.match(/played for (.+?)\.?$/i))&&/second|minute|hour|day/i.test(m[1])){const u={day:86400,hour:3600,minute:60,second:1};let s=0;m[1].replace(/(\d+)\s*(day|hour|minute|second)s?/gi,(x,n,k)=>{s+=+n*u[k.toLowerCase()]});if(s){S.played={s,t};changed=true}}
  if((m=text.match(/(\d+)\s+(?:total\s+)?passive skill points? from quests/i))){S.questPoints={n:+m[1],t};changed=true}
  return changed;
}
function renderChatReadouts(){
  const el=$("campReadouts");if(!el) return;
  const done=PT_QUESTS.filter(q=>PT_STEP[q]&&(S.camp||{})[PT_STEP[q]]).length;
  const d=S.played?S.played.s:0;
  el.innerHTML=`<h2>From the game's chat commands</h2>
    <p class="small" style="margin:0">Type these in game chat and the answers land here${DESK?" automatically":" after you upload Client.txt"}:</p>
    <div class="stats">
      <div class="stat"><div class="k">/passives</div><div class="v num">${done}/${PT_QUESTS.length}</div><div class="small muted">skill-point quests</div></div>
      <div class="stat"><div class="k">/deaths</div><div class="v num">${S.gameDeaths?S.gameDeaths.n:"–"}</div><div class="small muted">${S.gameDeaths?new Date(S.gameDeaths.t).toLocaleDateString():"not read yet"}</div></div>
      <div class="stat"><div class="k">/played</div><div class="v num">${d?`${Math.floor(d/86400)?Math.floor(d/86400)+"d ":""}${Math.floor(d/3600)%24}h ${Math.floor(d/60)%60}m`:"–"}</div><div class="small muted">${S.played?new Date(S.played.t).toLocaleDateString():"not read yet"}</div></div>
    </div>
    ${done<PT_QUESTS.length?`<details class="small"><summary style="cursor:pointer">Skill-point quests not yet seen (${PT_QUESTS.length-done})</summary><p style="margin:6px 0 0">${PT_QUESTS.filter(q=>!(PT_STEP[q]&&(S.camp||{})[PT_STEP[q]])).map(esc).join(" · ")}</p></details>`:""}
    <p class="note" style="margin:0">Quests named in the /passives answer are ticked off on your act checklists. If something doesn't register, tell us the exact line your game prints.</p>`;
}

/* ---------- poe.ninja: 7-day trends + more categories ---------- */
const trendOf=l=>{const s=l&&(l.sparkLine||l.receiveSparkLine||l.sparkline);return s&&typeof s.totalChange==="number"?{ch:s.totalChange,data:(s.data||[]).filter(v=>v!=null)}:null};
function trendHtml(tr){if(!tr) return "";const up=tr.ch>=0;const pts=tr.data.length>1?tr.data:null;let sp="";if(pts){const a=Math.min(...pts),b=Math.max(...pts);sp=`<svg viewBox="0 0 40 12" width="40" height="12" aria-hidden="true" style="vertical-align:-1px"><polyline points="${pts.map((v,i)=>(i/(pts.length-1)*40).toFixed(1)+","+(11-(v-a)/(b-a||1)*10).toFixed(1)).join(" ")}" fill="none" stroke="${up?"var(--good)":"var(--bad)"}" stroke-width="1.4"/></svg>`}return ` <span class="trend ${up?"up":"down"}" title="Change over 7 days">${sp} ${up?"▲":"▼"} ${Math.abs(tr.ch).toFixed(1)}%</span>`}
const EXTRA_ITEM_TYPES=["Incubator","Vial","Map","BlightedMap","BlightRavagedMap","ValdoMap","UniqueTincture","UniqueRelic","ForbiddenJewel","ShrineBelt","ImbuedGem","Wombgift","BaseType"];
async function ninjaExtras(P){
  if(P.extrasLoaded) return P;
  const lg=P.league||await ninjaLeagueId();
  for(const t of EXTRA_ITEM_TYPES){try{const r=await DESK.http({url:`https://poe.ninja/poe1/api/economy/stash/current/item/overview?league=${encodeURIComponent(lg)}&type=${t}`,cacheMs:15*60e3});
    ((r.data&&r.data.lines)||[]).forEach(l=>{const key=t==="BaseType"?"base:"+l.baseType:t.includes("Map")&&!t.includes("Unique")&&!t.includes("Valdo")?"map:"+(t==="BlightedMap"?"Blighted ":t==="BlightRavagedMap"?"Blight-ravaged ":"")+(l.baseType||l.name):l.name;(P.items[key]=P.items[key]||[]).push(l)})}catch(e){}}
  P.extrasLoaded=true;return P;
}
const _priceApiItem=priceApiItem;
priceApiItem=function(raw,P){
  const v=_priceApiItem(raw,P);if(v!=null) return v;
  const it=apiItem(raw,"x");const qty=raw.stackSize||1;
  const tier=propNum(raw,"Map Tier");
  if(tier!=null&&it.rarity!=="UNIQUE"){const l=P.items["map:"+it.base];if(l){const c=l.filter(x=>!x.mapTier||x.mapTier===tier);const pool=c.length?c:l;return Math.min(...pool.map(x=>x.chaosValue).filter(x=>x!=null))*qty}}
  if(it.rarity==="NORMAL"&&raw.ilvl){const l=P.items["base:"+it.base];if(l){const c=l.filter(x=>(x.levelRequired||0)<=raw.ilvl&&!x.variant).sort((a,b)=>(b.levelRequired||0)-(a.levelRequired||0));if(c[0]&&c[0].chaosValue>=1)return c[0].chaosValue}}
  const l=P.items[it.name];if(l&&l.length&&(it.rarity==="UNIQUE"||it.rarity==="NORMAL"||it.rarity==="CURRENCY")) return Math.min(...l.map(x=>x.chaosValue).filter(x=>x!=null))*qty;
  return null;
};

/* ---------- poewiki (Cargo API) ---------- */
const WIKI_API="https://www.poewiki.net/w/api.php";
const wikiText=s=>String(s||"").replace(/<br\s*\/?>/gi,"\n").replace(/<[^>]+>/g,"").replace(/\[\[(?:[^|\]]*\|)?([^\]]+)\]\]/g,"$1").replace(/&lt;/g,"<").replace(/&gt;/g,">").replace(/&amp;/g,"&").replace(/&#39;/g,"'").replace(/&quot;/g,'"').trim();
async function cargo(params){
  const q=new URLSearchParams({action:"cargoquery",format:"json",limit:"500",...params});
  const r=await DESK.http({url:`${WIKI_API}?${q}`,cacheMs:24*3600e3});
  if(!r||r.status>=400||!r.data) throw new Error("The wiki didn't answer.");
  if(r.data.error) throw new Error(r.data.error.info||"Wiki query failed.");
  return (r.data.cargoquery||[]).map(x=>x.title||{});
}
async function wikiItem(name){
  const where=`items.name="${String(name).replace(/"/g,"")}"`;
  try{return (await cargo({tables:"items",fields:"items.name=name,items.base_item=base,items.required_level=level,items.drop_text=droptext,items.drop_areas=areas,items.explicit_stat_text=stats,items.implicit_stat_text=implicits,items.flavour_text=flavour",where}))[0]||null}
  catch(e){return (await cargo({tables:"items",fields:"items.name=name,items.drop_text=droptext,items.drop_areas=areas",where}))[0]||null}
}
/* ---------- divination card helper ---------- */
async function cardIndex(force){
  if(!force&&S.cardIndex&&Date.now()-S.cardIndex.at<7*86400e3) return S.cardIndex;
  const cards=[];
  for(let off=0;off<2000;off+=500){
    const rows=await cargo({tables:"items",fields:"items.name=name,items.drop_areas=areas,items.drop_text=droptext",where:'items.class_id="DivinationCard" AND items.drop_enabled=1',offset:String(off)});
    rows.forEach(r=>cards.push({name:r.name,areas:String(r.areas||"").split(",").map(s=>s.trim()).filter(Boolean),text:wikiText(r.droptext)}));
    if(rows.length<500) break;
  }
  S.cardIndex={at:Date.now(),cards};save();return S.cardIndex;
}
function cardsForArea(areaId,P){
  const ci=S.cardIndex;if(!ci) return [];
  return ci.cards.filter(c=>c.areas.includes(areaId)).map(c=>({name:c.name,v:P&&P.ex[c.name]})).sort((a,b)=>(b.v||0)-(a.v||0));
}
function bestCardMaps(P){
  const ci=S.cardIndex;if(!ci) return [];
  const by={};
  ci.cards.forEach(c=>{const v=P&&P.ex[c.name];if(!v)return;c.areas.filter(a=>/^MapWorlds/.test(a)).forEach(a=>{(by[a]=by[a]||[]).push({name:c.name,v})})});
  return Object.entries(by).map(([a,cs])=>({area:a,map:mapNameFromId(a),cards:cs.sort((x,y)=>y.v-x.v),top:Math.max(...cs.map(c=>c.v))})).sort((a,b)=>b.top-a.top);
}
let CARD_P=null;
async function renderCards(force){
  const el=$("mapsCards");if(!el) return;
  if(!DESK){el.innerHTML=`<h2>Divination cards by map</h2><p class="small muted" style="margin:0">Available in the desktop app: it reads card drop areas from the wiki and prices from poe.ninja.</p>`;return}
  el.innerHTML=`<h2>Divination cards by map</h2><p class="small muted" style="margin:0">Loading card drop areas from the wiki…</p>`;
  try{await cardIndex(force);CARD_P=await ninjaPrices(false)}catch(e){el.innerHTML=`<h2>Divination cards by map</h2><p class="small" style="margin:0;color:var(--bad)">${esc(e.message)}</p><div><button class="btn ghost small" id="cdRetry">Try again</button></div>`;$("cdRetry").onclick=()=>renderCards(true);return}
  const best=bestCardMaps(CARD_P).slice(0,12);
  const here=LIVE.zone&&isMapId(LIVE.zone.id)?cardsForArea(LIVE.zone.id,CARD_P):[];
  el.innerHTML=`<h2>Divination cards by map</h2>
    ${here.length?`<div class="sg"><b>In ${esc(LIVE.zone.name)} now:</b> ${here.slice(0,5).map(c=>`${esc(c.name)}${c.v?` <span class="muted">(${fmt(c.v)}c)</span>`:""}`).join(" · ")}</div>`:""}
    <label class="f" for="cdSearch">Look up a map<input type="text" id="cdSearch" placeholder="e.g. Dig, Defiled Cathedral"></label><div id="cdOut" class="small"></div>
    <h3>Maps with the most valuable cards</h3>
    ${best.length?`<div class="tw"><table><thead><tr><th>Map</th><th>Best card</th><th>Others</th></tr></thead><tbody>${best.map(b=>`<tr><td>${esc(b.map)}</td><td>${esc(b.cards[0].name)} <span class="num">${fmt(b.cards[0].v)}c</span></td><td class="small muted">${b.cards.slice(1,4).map(c=>esc(c.name)).join(", ")}</td></tr>`).join("")}</tbody></table></div>`:'<p class="small muted" style="margin:0">No priced cards found for maps yet.</p>'}
    <p class="note" style="margin:0">Card drop areas come from the Path of Exile wiki (${S.cardIndex.cards.length} cards, refreshed weekly) and prices from poe.ninja. Drop rates aren't public, so value isn't the same as expected profit.</p>`;
  $("cdSearch").oninput=e=>{const q=normMap(e.target.value);if(q.length<3){$("cdOut").innerHTML="";return}const cs=S.cardIndex.cards.filter(c=>c.areas.some(a=>/^MapWorlds/.test(a)&&normMap(mapNameFromId(a)).includes(q))).map(c=>({name:c.name,v:CARD_P.ex[c.name]})).sort((a,b)=>(b.v||0)-(a.v||0));$("cdOut").innerHTML=cs.length?cs.slice(0,12).map(c=>`${esc(c.name)}${c.v?` <span class="muted">${fmt(c.v)}c</span>`:""}`).join(" · "):"No area-restricted cards found for that map."};
}

/* ---------- patch & news alerts (GGG's news page) ---------- */
async function checkNews(manual){
  if(!DESK) return;
  try{
    const r=await DESK.http({url:"https://www.pathofexile.com/news",text:true,cacheMs:manual?0:30*60e3});
    const html=typeof r.data==="string"?r.data:"";
    const seen=new Set(),items=[];
    for(const m of html.matchAll(/<a[^>]+href="(\/forum\/view-thread\/\d+)[^"]*"[^>]*>\s*([^<]{6,160}?)\s*<\/a>/g)){const title=wikiText(m[2]);if(/read more/i.test(title)||seen.has(m[1]))continue;seen.add(m[1]);items.push({title,url:"https://www.pathofexile.com"+m[1]})}
    if(!items.length) throw new Error("Couldn't read GGG's news page.");
    const first=items[0];
    if(S.newsTop&&S.newsTop!==first.url){const fresh=items.slice(0,items.findIndex(x=>x.url===S.newsTop)>0?items.findIndex(x=>x.url===S.newsTop):1);fresh.forEach(n=>DESK.notify({kind:"milestones",title:/patch|hotfix|deploy/i.test(n.title)?"New patch notes":"New from GGG",body:n.title}))}
    S.newsTop=first.url;S.news={at:Date.now(),items:items.slice(0,8)};save();
  }catch(e){S.news={...(S.news||{}),error:e.message}}
  renderNews();
}
function renderNews(){
  const el=$("deskNews");if(!el) return;const n=S.news||{};
  el.innerHTML=`<div class="row" style="justify-content:space-between"><h2>News & patch notes</h2><button class="btn ghost small" id="nwCheck">Check now</button></div>
    ${n.items&&n.items.length?`<ul class="clean small">${n.items.map(x=>`<li>${/patch|hotfix|deploy/i.test(x.title)?'<span class="pill gold">patch</span> ':""}<a href="${esc(x.url)}" target="_blank" rel="noopener">${esc(x.title)}</a></li>`).join("")}</ul>`:`<p class="small muted" style="margin:0">${esc(n.error||"Checks pathofexile.com/news every 30 minutes and notifies you of new posts.")}</p>`}
    ${n.at?`<p class="small muted" style="margin:0">Checked ${new Date(n.at).toLocaleTimeString()}</p>`:""}`;
  $("nwCheck").onclick=()=>checkNews(true);
}

/* ---------- import from pobb.in / pastebin links (desktop) ---------- */
async function fetchPobLink(url){
  const u=new URL(url);let raw=null;
  if(/pobb\.in$/.test(u.hostname)){const id=u.pathname.split("/").filter(Boolean)[0];raw=`https://pobb.in/${id}/raw`}
  else if(/pastebin\.com$/.test(u.hostname)){const id=u.pathname.split("/").filter(Boolean).pop();raw=`https://pastebin.com/raw/${id}`}
  if(!raw) throw new Error("Only pobb.in and pastebin links can be fetched. For other sites, copy the code.");
  const r=await DESK.http({url:raw,text:true});
  if(!r||r.status>=400||!r.data) throw new Error(`Couldn't fetch that link (${r?r.status:"no answer"}).`);
  return String(r.data).trim();
}


/* ---------- updates (desktop) ---------- */
function renderUpdates(){
  const u=LIVE.update||{};const b=$("updateBanner");
  if(b){if(u.state==="ready"){b.hidden=false;b.innerHTML=`<p><b>Version ${esc(u.version)} is ready.</b> Restart the app to finish updating; your data stays as it is.</p><button class="btn primary" id="upNowB">Restart & update</button>`;$("upNowB").onclick=()=>DESK.installUpdate()}else b.hidden=true}
  const el=$("deskUpdates");if(!el||!DESK||!DESK.updateStatus) return;
  const msg={idle:"Waiting to check…",checking:"Checking for updates…",current:"You're on the latest version.",downloading:`Downloading version ${u.version||""}${u.percent!=null?` (${u.percent}%)`:""}…`,ready:`Version ${u.version} is ready to install.`,dev:u.message,error:`Couldn't check for updates: ${u.message||"unknown error"}`}[u.state]||"";
  el.innerHTML=`<h2>Updates</h2>
    <div class="row"><span class="pill gold">Version ${esc(u.current||(LIVE.cfg&&LIVE.cfg.version)||"?")}</span><span class="pill ${u.state==="ready"?"good":u.state==="error"?"bad":""}">${esc(u.state||"idle")}</span></div>
    <p class="small" style="margin:0">${esc(msg)}</p>
    <div class="row"><button class="btn" id="upCheck"${u.state==="checking"||u.state==="downloading"?" disabled":""}>Check now</button>${u.state==="ready"?'<button class="btn primary" id="upNow">Restart & update</button>':""}</div>
    <p class="note" style="margin:0">The app checks GitHub for new releases on start and every 6 hours, downloads them in the background and installs on restart. Every download is checked against the checksum published with the release.</p>`;
  $("upCheck").onclick=async()=>{LIVE.update=await DESK.checkUpdate();renderUpdates()};
  const n=$("upNow");if(n)n.onclick=()=>DESK.installUpdate();
}
