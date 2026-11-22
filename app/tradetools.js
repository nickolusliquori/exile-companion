/* Trading tools: search-string builder, dump-tab pricer, currency flip watcher and collections.
   Everything only reads data; notes and searches are copied for the player to paste in game. */
"use strict";
(function(){
const TT={};window.TradeTools=TT;
const esc2=s=>String(s==null?"":s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const MAXLEN=250;   // the game's search box limit
const copy=t=>{if(DESK&&DESK.copy)DESK.copy(t);else if(navigator.clipboard)navigator.clipboard.writeText(t).catch(()=>{});if(typeof toast==="function")toast("Copied. Paste it in game with Ctrl+V.")};

/* ---------- search strings ---------- */
const normT=t=>String(t).toLowerCase().replace(/[+-]?\d+(\.\d+)?/g,"#");
// lines on a map that aren't modifiers but must not be hit by an "avoid" search
const MAP_LINES=["item quantity: +#%","item rarity: +#%","monster pack size: +#%","more currency: +#%","more maps: +#%","more scarabs: +#%","more threads: +#%","map tier: #","item level: #","quality: +#%","area level: #","travel to this map by using it in a personal map device. maps can only be used once.","corrupted","unidentified","rarity: rare","rarity: magic","rarity: normal","area is influenced by the shaper","area is influenced by the elder","delirium","map"];
function familyLines(f){return f.v.map(v=>v.split(" / ").map(normT))}
function candidates(lines){const out=new Set();for(const l of lines)for(let i=0;i<l.length;i++)for(let n=3;n<=16&&i+n<=l.length;n++){const t=l.slice(i,i+n);if(/^[a-z' ]+$/.test(t)&&t.trim()===t)out.add(t)}return out}
// shortest set of fragments that hits every chosen family (any tier) and nothing else on a map
function avoidTokens(chosen,all){
  if(!chosen.length)return [];
  const names=((window.MAPMOD_DATA&&MAPMOD_DATA.names)||[]).map(n=>n.toLowerCase());
  const others=all.filter(f=>!chosen.includes(f)).flatMap(f=>familyLines(f).flat()).concat(MAP_LINES,names);
  const covers=f=>t=>familyLines(f).every(lines=>lines.some(l=>l.includes(t)));
  const cand=new Map();
  chosen.forEach(f=>candidates(familyLines(f).flat()).forEach(t=>{if(cand.has(t))return;if(others.some(o=>o.includes(t)))return;cand.set(t,chosen.filter(g=>covers(g)(t)))}));
  const left=new Set(chosen),picked=[];
  while(left.size){
    let best=null,score=-1;
    for(const [t,fs] of cand){const n=fs.filter(f=>left.has(f)).length;if(!n)continue;const sc=n/(t.length+1);if(sc>score||(sc===score&&t.length<best.length)){best=t;score=sc}}
    if(!best)break;picked.push(best);cand.get(best).forEach(f=>left.delete(f));
  }
  return {tokens:picked,missed:[...left]};
}
// regex for "a whole number at least n"
function geq(n){n=Math.max(0,Math.floor(n));if(!n)return "\\d+";const s=String(n),parts=[`\\d{${s.length+1},}`];
  for(let i=0;i<s.length;i++){const d=+s[i],pre=s.slice(0,i);if(i===s.length-1)parts.push(pre+(d===9?"9":`[${d}-9]`));else if(d<9)parts.push(pre+(d+1===9?"9":`[${d+1}-9]`)+"\\d".repeat(s.length-i-1))}
  return "("+parts.join("|")+")"}
const PROPS=[["qty","Item quantity","tity: \\+"],["rar","Item rarity","rity: \\+"],["pack","Monster pack size","size: \\+"],["maps","More maps","aps: \\+"],["cur","More currency","ncy: \\+"],["scar","More scarabs","abs: \\+"]];
const VENDOR=[
  ["3-link (any colours)",'"\\w-\\w-\\w"'],["4-link (any colours)",'"\\w-\\w-\\w-\\w"'],
  ["Red, green and blue linked (chromatic recipe)",'"r-g-b|r-b-g|g-r-b|g-b-r|b-r-g|b-g-r"'],
  ["Movement speed (boots)",'"movement speed"'],["+1 to socketed gems",'"socketed gems"'],["Any 6-socket item",'"sockets: \\w.\\w.\\w.\\w.\\w.\\w"'],
];
function buildSearch(st){
  const all=(window.MAPMOD_DATA&&MAPMOD_DATA.mods)||[];
  const chosen=all.filter(f=>st.avoid.includes(f.x));
  const r=avoidTokens(chosen,all);const parts=[];
  if(r.tokens&&r.tokens.length)parts.push(`"!${r.tokens.join("|")}"`);
  PROPS.forEach(([k,,re])=>{const v=+st.min[k]||0;if(v>0)parts.push(`"${re}${geq(v)}%"`)});
  return {text:parts.join(" "),missed:r.missed||[]};
}

/* ---------- prices and notes ---------- */
async function prices(){try{return await ninjaExtras(await ninjaPrices())}catch(e){return null}}
function noteFor(total,P,under){
  const v=total*(1-(under||0)/100);if(!(v>0))return null;const div=P&&P.div;
  if(div&&v>=div*0.9){const d=Math.max(0.1,Math.floor(v/div*10)/10);return {text:`~b/o ${d} divine`,chaos:d*div}}
  if(v<1)return null;
  const c=v>=10?Math.floor(v):Math.max(1,Math.round(v));return {text:`~b/o ${c} chaos`,chaos:c};
}
const money=(c,P)=>c==null||!isFinite(c)?"–":P&&P.div&&c>=P.div*0.8?(c/P.div).toFixed(1)+" div":(c>=100?Math.round(c).toLocaleString():c.toFixed(c<10?1:0))+"c";
const nm=raw=>(typeof stripTags==="function"?stripTags(raw.name)||stripTags(raw.typeLine):raw.name||raw.typeLine)||"Item";

/* ---------- state ---------- */
function st(){const s=S.trade||(S.trade={avoid:[],min:{},saved:[],under:5,flip:{gap:10,count:20,watch:false,seen:{}},collect:null});s.min=s.min||{};s.saved=s.saved||[];s.flip=s.flip||{gap:10,count:20,watch:false,seen:{}};s.flip.seen=s.flip.seen||{};return s}

/* ---------- UI ---------- */
async function render(){
  const root=$("tradeTools");if(!root)return;
  if(!window.MAPMOD_DATA){try{await loadScriptOnce("mapmods.js","MAPMOD_DATA")}catch(e){}}
  root.innerHTML=`<div class="grid"><div class="card hl" id="ttSearch"></div><div class="card" id="ttVendor"></div></div>
    <div class="card" id="ttDump"></div>
    <div class="grid"><div class="card" id="ttFlip"></div><div class="card" id="ttCollect"></div></div>`;
  renderSearch();renderVendor();renderDump();renderFlip();renderCollect();
}
function renderSearch(){
  const el=$("ttSearch");if(!el)return;const s=st();const all=(window.MAPMOD_DATA&&MAPMOD_DATA.mods)||[];
  const out=buildSearch(s);const f=(s.mfilter||"").toLowerCase();
  const list=all.filter(m=>!f||m.x.toLowerCase().includes(f));
  el.innerHTML=`<h2>Map search builder</h2>
    <p class="small" style="margin:0">Tick the map mods you won't run, set the minimum quantity or pack size, then paste the search into your map tab. Fragments are worked out from the game's own mod texts${window.MAPMOD_DATA?` (patch ${esc2(MAPMOD_DATA.v)})`:""}, so they match every tier of a mod and nothing else.</p>
    <div class="ttout"><code id="ttStr">${esc2(out.text)||'<span class="muted">Nothing selected yet</span>'}</code></div>
    <div class="row"><button class="btn primary" id="ttCopy"${out.text?"":" disabled"}>Copy search</button><span class="small ${out.text.length>MAXLEN?"":"muted"}" style="${out.text.length>MAXLEN?"color:var(--warn)":""}">${out.text.length}/${MAXLEN} characters${out.text.length>MAXLEN?": too long for the game's search box. Untick a few mods.":""}</span>
      <button class="btn ghost small" id="ttSave"${out.text?"":" disabled"}>Save</button><button class="btn ghost small" id="ttClear">Clear</button></div>
    ${out.missed.length?`<p class="small" style="margin:0;color:var(--warn)">No safe fragment for: ${out.missed.map(m=>esc2(m.x)).join("; ")}.</p>`:""}
    <div class="fgrid">${PROPS.map(([k,l])=>`<label class="f">${l} at least<input type="number" min="0" max="999" data-min="${k}" value="${s.min[k]||""}" placeholder="any"></label>`).join("")}</div>
    <p class="small muted" style="margin:0">More maps, currency and scarabs only work if your maps show those lines.</p>
    <div class="row" style="justify-content:space-between"><b class="small">Mods to avoid (${s.avoid.length} ticked)</b><input id="ttMf" type="text" placeholder="Filter, e.g. reflect" value="${esc2(s.mfilter||"")}" style="max-width:200px"></div>
    <ul class="clean tt-mods">${list.map(m=>`<li><label class="row small fl-opt"><input type="checkbox" data-ttav="${esc2(m.x)}"${s.avoid.includes(m.x)?" checked":""}><span>${esc2(m.x.replace(/#/g,"#"))}${m.uber?' <span class="pill">uber</span>':""}</span></label></li>`).join("")||'<li class="muted small">No mods match.</li>'}</ul>
    ${s.saved.length?`<h3>Saved searches</h3><ul class="clean small" style="display:grid;gap:4px">${s.saved.map((x,i)=>`<li class="row" style="justify-content:space-between"><span><b>${esc2(x.name)}</b> <code class="muted">${esc2(x.text.slice(0,60))}${x.text.length>60?"…":""}</code></span><span class="row"><button class="btn ghost small" data-scopy="${i}">Copy</button><button class="btn ghost small" data-sdel="${i}" aria-label="Delete">✕</button></span></li>`).join("")}</ul>`:""}`;
  $("ttCopy").onclick=()=>copy(out.text);
  $("ttClear").onclick=()=>{const prev={avoid:s.avoid.slice(),min:{...s.min}};s.avoid=[];s.min={};save();renderSearch();toast&&toast("Search cleared.",()=>{s.avoid=prev.avoid;s.min=prev.min;save();renderSearch()})};
  $("ttSave").onclick=()=>{const name=`Maps (${s.avoid.length} avoided)`;s.saved.unshift({name,text:out.text});s.saved=s.saved.slice(0,12);save();renderSearch()};
  $("ttMf").oninput=e=>{s.mfilter=e.target.value;renderSearch();const i=$("ttMf");i.focus();i.setSelectionRange(i.value.length,i.value.length)};
  el.querySelectorAll("[data-ttav]").forEach(cb=>cb.onchange=()=>{const k=cb.dataset.ttav;s.avoid=cb.checked?[...new Set([...s.avoid,k])]:s.avoid.filter(x=>x!==k);save();renderSearch()});
  el.querySelectorAll("[data-min]").forEach(inp=>inp.onchange=()=>{s.min[inp.dataset.min]=Math.max(0,+inp.value||0);save();renderSearch()});
  el.querySelectorAll("[data-scopy]").forEach(b=>b.onclick=()=>copy(s.saved[+b.dataset.scopy].text));
  el.querySelectorAll("[data-sdel]").forEach(b=>b.onclick=()=>{const i=+b.dataset.sdel,x=s.saved.splice(i,1)[0];save();renderSearch();toast&&toast("Saved search removed.",()=>{s.saved.splice(i,0,x);save();renderSearch()})});
}
function renderVendor(){
  const el=$("ttVendor");if(!el)return;
  el.innerHTML=`<h2>Vendor and stash searches</h2>
    <p class="small" style="margin:0">Common searches for vendor windows and stash tabs. Click to copy, then paste with Ctrl+V.</p>
    <ul class="clean" style="display:grid;gap:6px">${VENDOR.map(([l,r],i)=>`<li class="row" style="justify-content:space-between;flex-wrap:nowrap"><span class="small">${esc2(l)}<br><code class="muted">${esc2(r)}</code></span><button class="btn ghost small" data-vcopy="${i}">Copy</button></li>`).join("")}</ul>
    <p class="small muted" style="margin:0">Your build's gems already have vendor searches on the Shopping list.</p>`;
  el.querySelectorAll("[data-vcopy]").forEach(b=>b.onclick=()=>copy(VENDOR[+b.dataset.vcopy][1]));
}

let DUMP=null;
function renderDump(){
  const el=$("ttDump");if(!el)return;const s=st();
  if(!DESK){el.innerHTML=`<h2>Dump-tab pricer</h2>${emptyBox("Needs the desktop app: it reads your stash tab and current prices.")}`;return}
  const tabs=ACCT.tabs||[];
  el.innerHTML=`<h2>Dump-tab pricer</h2>
    <p class="small" style="margin:0">Prices every item in a stash tab and gives you a <code>~b/o</code> note to copy onto each one (right-click the item in game → Note). Uses poe.ninja for currency, cards, uniques and gems; rares need a Ctrl+C price check.</p>
    <div class="row">${tabs.length?`<select id="ttTab">${tabs.map(t=>`<option value="${esc2(t.id)}"${s.dumpTab===t.id?" selected":""}>${esc2(t.name)}</option>`).join("")}</select>`:`<button class="btn" id="ttTabs">Load my stash tabs</button>`}
      <label class="small row" style="gap:4px">Undercut <input type="number" id="ttUnder" min="0" max="50" value="${s.under}" style="width:64px">%</label>
      <button class="btn primary" id="ttPrice"${tabs.length?"":" disabled"}>Price this tab</button></div>
    <div id="ttDumpOut">${DUMP?dumpTable():""}</div>`;
  const lt=$("ttTabs");if(lt)lt.onclick=async()=>{lt.disabled=true;lt.textContent="Loading…";await loadTabs();renderDump()};
  const ts=$("ttTab");if(ts)ts.onchange=()=>{s.dumpTab=ts.value;save()};
  $("ttUnder").onchange=e=>{s.under=Math.max(0,Math.min(50,+e.target.value||0));save();if(DUMP){DUMP.rows.forEach(r=>r.note=r.total!=null?noteFor(r.total,DUMP.P,s.under):null);$("ttDumpOut").innerHTML=dumpTable();bindDump()}};
  const pb=$("ttPrice");if(pb)pb.onclick=async()=>{
    const tab=tabs.find(t=>t.id===($("ttTab")||{}).value)||tabs[0];if(!tab)return;s.dumpTab=tab.id;save();
    const out=$("ttDumpOut");out.innerHTML='<p class="small muted" style="margin:0">Reading the tab and getting prices…</p>';pb.disabled=true;
    try{const P=await prices();if(!P){out.innerHTML=emptyBox("Couldn't reach poe.ninja. Try again in a minute.");return}
      const lg=S.league||(LIVE.cfg&&LIVE.cfg.league);
      const r=await DESK.stashTab({account:ACCT.status&&ACCT.status.accountName,league:lg,tab});
      if(!r.ok){out.innerHTML=emptyBox(r.error||"Couldn't read that tab. Is your POESESSID set in Settings?");return}
      const rows=r.data.map(raw=>{const total=priceApiItem(raw,P);return {name:nm(raw),qty:raw.stackSize||1,total,cur:raw.note||null,x:raw.x,y:raw.y,rare:raw.frameType===2,note:total!=null?noteFor(total,P,s.under):null}}).sort((a,b)=>(b.total||0)-(a.total||0));
      DUMP={tab:tab.name,P,rows,at:Date.now()};out.innerHTML=dumpTable();bindDump();
    }finally{pb.disabled=false}};
  bindDump();
}
function dumpTable(){
  const D=DUMP,P=D.P;const priced=D.rows.filter(r=>r.note),cheap=D.rows.filter(r=>r.total!=null&&!r.note),un=D.rows.filter(r=>r.total==null);
  const sum=priced.reduce((a,r)=>a+r.note.chaos,0);
  return `<p class="small" style="margin:6px 0 0"><b>${esc2(D.tab)}</b>: ${priced.length} to list for about <b>${money(sum,P)}</b> in total${cheap.length?`, ${cheap.length} worth under 1c (vendor them)`:""}${un.length?`, ${un.length} without a price`:""}.</p>
    ${priced.length?`<div class="tw"><table><thead><tr><th>Item</th><th>Qty</th><th>Worth</th><th>Note</th><th></th></tr></thead><tbody>${priced.map((r,i)=>`<tr><td>${esc2(r.name)}${r.cur?`<br><span class="small muted">now: ${esc2(r.cur)}</span>`:""}</td><td class="num">${r.qty}</td><td class="num">${money(r.total,P)}</td><td><code>${esc2(r.note.text)}</code></td><td><button class="btn ghost small" data-dcopy="${i}">Copy</button></td></tr>`).join("")}</tbody></table></div>`:""}
    ${un.length?`<details class="small"><summary>Without a price (${un.length})</summary><p class="muted" style="margin:4px 0">${un.map(r=>esc2(r.name)+(r.rare?" (rare: Ctrl+C it in game)":"")).join(", ")}</p></details>`:""}
    <p class="small muted" style="margin:0">A stack's note prices the whole stack. Prices from poe.ninja, ${new Date(D.at).toLocaleTimeString()}.</p>`;
}
function bindDump(){const el=$("ttDumpOut");if(!el||!DUMP)return;const priced=DUMP.rows.filter(r=>r.note);el.querySelectorAll("[data-dcopy]").forEach(b=>b.onclick=()=>copy(priced[+b.dataset.dcopy].note.text))}

/* ---------- flip watcher ---------- */
let FLIP=null;
async function loadFlip(){
  const lg=await ninjaLeagueId();
  const r=await DESK.http({url:`https://poe.ninja/poe1/api/economy/stash/current/currency/overview?league=${encodeURIComponent(lg)}&type=Currency`,cacheMs:10*60e3});
  const lines=(r&&r.data&&r.data.lines)||[];
  const rows=lines.map(l=>{const a=l.receive&&l.receive.value,p=l.pay&&l.pay.value;if(!(a>0)||!(p>0))return null;const b=1/p;const lo=Math.min(a,b),hi=Math.max(a,b);
    const cnt=Math.min((l.receive&&(l.receive.listing_count||l.receive.count))||0,(l.pay&&(l.pay.listing_count||l.pay.count))||0);
    return {name:l.currencyTypeName,lo,hi,gap:(hi/lo-1)*100,cnt}}).filter(Boolean).sort((x,y)=>y.gap-x.gap);
  FLIP={at:Date.now(),rows,league:lg};return FLIP;
}
function flipHits(s){return FLIP?FLIP.rows.filter(r=>r.gap>=s.flip.gap&&r.cnt>=s.flip.count&&r.name!=="Chaos Orb"):[]}
function renderFlip(){
  const el=$("ttFlip");if(!el)return;const s=st();
  if(!DESK){el.innerHTML=`<h2>Currency flip watcher</h2>${emptyBox("Needs the desktop app, which can reach poe.ninja.")}`;return}
  const hits=flipHits(s);
  el.innerHTML=`<h2>Currency flip watcher</h2>
    <p class="small" style="margin:0">The gap between what buyers pay and what sellers ask, per currency, from poe.ninja. A big gap with plenty of listings can be worth flipping: buy at the low side, sell at the high side.</p>
    <div class="fgrid"><label class="f">Gap at least (%)<input type="number" id="ttGap" min="1" max="200" value="${s.flip.gap}"></label><label class="f">Listings at least<input type="number" id="ttCnt" min="0" value="${s.flip.count}"></label></div>
    <div class="row"><button class="btn" id="ttFlipGo">${FLIP?"Refresh":"Check now"}</button><label class="small row fl-opt"><input type="checkbox" id="ttWatch"${s.flip.watch?" checked":""}><span>Notify me every 15 minutes while the app is open</span></label></div>
    ${FLIP?(hits.length?`<div class="tw"><table><thead><tr><th>Currency</th><th>Low</th><th>High</th><th>Gap</th><th>Listings</th></tr></thead><tbody>${hits.slice(0,15).map(r=>`<tr><td>${esc2(r.name)}</td><td class="num">${r.lo.toFixed(r.lo<10?2:0)}c</td><td class="num">${r.hi.toFixed(r.hi<10?2:0)}c</td><td class="num">${r.gap.toFixed(1)}%</td><td class="num">${r.cnt}</td></tr>`).join("")}</tbody></table></div>`:`<p class="small muted" style="margin:0">No currency passes your gap and listing limits right now.</p>`)+`<p class="small muted" style="margin:0">${FLIP.league}, ${new Date(FLIP.at).toLocaleTimeString()}. Gaps close fast and listings can be fake; check the trade site before buying. Not financial advice, even in Wraeclast.</p>`:""}`;
  $("ttGap").onchange=e=>{s.flip.gap=Math.max(1,+e.target.value||10);save();renderFlip()};
  $("ttCnt").onchange=e=>{s.flip.count=Math.max(0,+e.target.value||0);save();renderFlip()};
  $("ttWatch").onchange=e=>{s.flip.watch=e.target.checked;save();startFlipWatch()};
  $("ttFlipGo").onclick=async()=>{const b=$("ttFlipGo");b.disabled=true;b.textContent="Checking…";try{await loadFlip()}catch(e){}renderFlip()};
}
let flipTimer=null;
function startFlipWatch(){clearInterval(flipTimer);const s=st();if(!DESK||!s.flip.watch)return;
  const tick=async()=>{try{await loadFlip()}catch(e){return}const now=Date.now();const fresh=flipHits(s).filter(r=>!(s.flip.seen[r.name]>now-2*3600e3));
    if(fresh.length){fresh.forEach(r=>s.flip.seen[r.name]=now);save();DESK.notify({kind:"milestones",title:`Flip: ${fresh[0].name} ${fresh[0].gap.toFixed(0)}% gap`,body:fresh.slice(0,3).map(r=>`${r.name}: ${r.lo.toFixed(1)}c → ${r.hi.toFixed(1)}c`).join(" · ")})}
    if($("ttFlip"))renderFlip()};
  tick();flipTimer=setInterval(tick,15*60e3)}

/* ---------- collections ---------- */
function renderCollect(){
  const el=$("ttCollect");if(!el)return;const s=st();const c=s.collect;
  if(!DESK){el.innerHTML=`<h2>Collections</h2>${emptyBox("Needs the desktop app: it reads your stash.")}`;return}
  const div=c?Object.entries(c.div).map(([name,x])=>({name,...x,pct:Math.min(1,x.have/(x.need||1))})).sort((a,b)=>b.pct-a.pct||(b.price||0)-(a.price||0)):[];
  el.innerHTML=`<h2>Collections</h2>
    <p class="small" style="margin:0">Divination card sets you're working on and the uniques you own, read from the stash tabs chosen for net worth.</p>
    <div class="row"><button class="btn" id="ttScan">${c?"Scan again":"Scan my stash"}</button>${c?`<span class="small muted">${new Date(c.t).toLocaleString()}</span>`:""}</div>
    <div id="ttScanMsg" class="small muted"></div>
    ${c?`<h3>Divination cards (${div.length})</h3>${div.length?`<ul class="clean" style="display:grid;gap:6px">${div.slice(0,25).map(d=>`<li><div class="row small" style="justify-content:space-between"><span>${esc2(d.name)}</span><span class="muted">${d.have}/${d.need}${d.price?` · ${(d.need-Math.min(d.have,d.need))>0?"finish for "+((d.need-Math.min(d.have,d.need))*d.price).toFixed(0)+"c":"complete"}`:""}</span></div><div class="meter"><i style="width:${(d.pct*100).toFixed(0)}%"></i></div></li>`).join("")}</ul>`:'<p class="small muted" style="margin:0">No divination cards in the scanned tabs.</p>'}
      <h3>Uniques (${c.uniques.length})</h3>${c.uniques.length?`<p class="small" style="margin:0">${c.uniques.slice(0,40).map(u=>esc2(u.name)+(u.price?` <span class="muted">(${u.price.toFixed(0)}c)</span>`:"")).join(", ")}${c.uniques.length>40?` and ${c.uniques.length-40} more`:""}</p>`:'<p class="small muted" style="margin:0">No uniques in the scanned tabs.</p>'}`:""}`;
  $("ttScan").onclick=scanCollect;
}
async function scanCollect(){
  const s=st();const msg=$("ttScanMsg");const btn=$("ttScan");btn.disabled=true;
  try{
    if(!ACCT.tabs){msg.textContent="Loading your stash tabs…";await loadTabs();if(!ACCT.tabs){msg.textContent=ACCT.err||"Couldn't load your stash tabs. Check your account in Settings.";return}}
    const tabs=ACCT.tabs.filter(t=>S.netTabs[t.id]!==false);const lg=S.league||(LIVE.cfg&&LIVE.cfg.league);
    const P=await prices();const div={},uniq={};
    for(let i=0;i<tabs.length;i++){const t=tabs[i];msg.textContent=`Reading tab ${i+1} of ${tabs.length}: ${t.name}`;
      const r=await DESK.stashTab({account:ACCT.status&&ACCT.status.accountName,league:lg,tab:t});if(!r.ok){msg.textContent=`${t.name}: ${r.error}`;break}
      for(const raw of r.data){const name=nm(raw);
        if(raw.frameType===6){const d=div[name]||(div[name]={have:0,need:raw.maxStackSize||1,price:P&&P.ex[name]||null});d.have+=raw.stackSize||1;d.need=Math.max(d.need,raw.maxStackSize||1)}
        else if(raw.frameType===3&&!uniq[name])uniq[name]={name,price:P&&P.items[name]?Math.min(...P.items[name].map(l=>l.chaosValue).filter(v=>v!=null)):null};
      }}
    s.collect={t:Date.now(),div,uniques:Object.values(uniq).sort((a,b)=>(b.price||0)-(a.price||0))};save();
  }finally{btn.disabled=false;renderCollect()}
}
TT.render=render;TT.startFlipWatch=startFlipWatch;
TT._test={avoidTokens,geq,buildSearch,noteFor,familyLines};
})();
