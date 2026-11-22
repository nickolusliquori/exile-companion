/* League content (3.30 Covens of Umbra): Thread costs and map return, Betrayal board,
   Expedition currency values, Heist and Labyrinth notes. Reads prices and your own map log only. */
"use strict";
(function(){
const LG={};window.LeagueTools=LG;
const esc2=s=>String(s==null?"":s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const go=u=>{if(typeof showTab==="function"&&typeof brGo==="function"&&DESK){showTab("browser");brGo(u)}else window.open(u,"_blank","noopener")};

/* ---------- data ---------- */
const THREADS=["Abyss","Bestiary","Betrayal","Blight","Breach","Expedition","Incursion","Legion","Ritual","Ultimatum"];
const CAP=8;
const DIVS=[["T","Transportation"],["F","Fortification"],["R","Research"],["I","Intervention"]];
const INTERVENTION="Trapped stash of one class of unique items (more and rarer at higher rank)";
// c:1 = changed in 3.30 (patch notes); other cells are unchanged from 3.29
const SYN={
  "Aisling":{T:"Items with two veiled mods",F:"Bench: Veiled Exalted Orb",R:"Bench: Veiled Chaos Orb"},
  "Cameria":{T:"Chests with a specific Allflame Ember",F:"Trapped chest: jewels",R:"Bench: crafting currency on a jewel",c:"T"},
  "Elreon":{T:"Chests with a specific Allflame Ember",F:"Trapped chest: corrupted equipment",R:"Bench: Tainted currency on a corrupted item",c:"T"},
  "Gravicius":{T:"Stack of divination cards",F:"Trapped chest: divination cards",R:"Bench: swap a divination card"},
  "Guff":{T:"Random currency",F:"Trapped chest: rare equipment",R:"Bench: Reflecting Mist on a jewel"},
  "Haku":{T:"Unique strongbox",F:"Chests with a specific Allflame Ember",R:"Bench: Hinekora's Lock / influenced Exalted Orb",c:"F"},
  "Hillock":{T:"Trapped chest: influenced equipment",F:"Bench: influenced Exalted Orb",R:"Bench: Eldritch implicit"},
  "It That Fled":{T:"Trapped chest: Foulborn uniques",F:"Bench: Foulborn currency on a Breach ring",R:"Bench: Tainted socket currency"},
  "Janus":{T:"Gold piles",F:"Chests with a specific Allflame Ember",R:"Cadiro's offer (buy a unique)",c:"F"},
  "Jorgin":{T:"Chests with a specific Allflame Ember",F:"Trapped chest: Delve equipment",R:"Bench: Tainted currency on a talisman",c:"T"},
  "Korell":{T:"Chests with a specific Allflame Ember",F:"Trapped chest: Essence equipment",R:"Bench: Essences on an item",c:"T"},
  "Leo":{T:"Chests with a specific Allflame Ember",F:"Trapped chest: corrupted unique",R:"Bench: special corruption on a unique",c:"T"},
  "Riker":{T:"Unique items",F:"Chests with Ancient Orbs",R:"Bench: Ancient Orb on a unique",c:"F"},
  "Rin":{T:"Originator maps",F:"Chests with Threads",R:"Trapped stash: Threads in various stack sizes",c:"FR"},
  "Tora":{T:"Quality gems and Facetor's Lens",F:"Trapped chest: gems",R:"Bench: gem currency"},
  "Vagan":{T:"Incubators",F:"Bench: complete all Incubators",R:"Bench: Fracturing Orb"},
  "Vorici":{T:"Stack of currency",F:"Bench: reforge colours, sockets and links",R:"Trapped stashes: quality skill gems with a Soul Core",c:"R"}
};
const MEMBERS=Object.keys(SYN);
const reward=(m,d)=>d==="I"?INTERVENTION:(SYN[m]&&SYN[m][d])||"";
const changed=(m,d)=>d==="I"||String((SYN[m]&&SYN[m].c)||"").includes(d);
// starting ideas, not rules: who to keep where
const PRESETS={
  threads:{name:"Threads and Ancient Orbs",t:{"Rin":"R","Riker":"F","Gravicius":"T","Janus":"T"}},
  benches:{name:"Crafting benches",t:{"Aisling":"R","Cameria":"R","Vagan":"R","Hillock":"F"}},
  gems:{name:"Gems",t:{"Vorici":"R","Tora":"R","Rin":"F","Riker":"F"}},
  uniques:{name:"Uniques",t:{"Riker":"T","It That Fled":"T","Leo":"F","Janus":"I"}}
};
const ARTIFACTS=["Exotic Coinage","Burial Medallion","Scrap Metal","Astragali"];
const ARTIFACT_VENDOR={"Exotic Coinage":"Rog (reroll deals: 1, 3 or 5 rerolls in 3.30)","Burial Medallion":"Dannig","Scrap Metal":"Tujen (no longer sells Oils)","Astragali":"Gwennen (now modifies one rare item instead of gambling)"};

/* ---------- maths ---------- */
function priceOf(P,name){if(!P)return null;const v=(P.cur&&P.cur[name])??(P.ex&&P.ex[name]);return v==null||!isFinite(v)?null:v}
function threadPrices(P){const o={};THREADS.forEach(t=>o[t]=priceOf(P,t+" Thread"));return o}
// counts: {Legion:4,...}; free: free Threads from a Shaped Region; uv: Unwavering Vision (+2 past the cap)
function planCost(counts,prices,opts){
  opts=opts||{};const used=Object.entries(counts).filter(([,n])=>n>0);
  const total=used.reduce((a,[,n])=>a+n,0);const cap=CAP+(opts.uv?2:0);
  const free=Math.max(0,Math.min(opts.free||0,total));
  // free Threads cover the most expensive copies of that region's type first
  let cost=0,missing=[];
  used.forEach(([t,n])=>{const p=prices[t];if(p==null){missing.push(t);return}
    const f=opts.freeType===t?free:0;cost+=Math.max(0,n-f)*p});
  const warn=[];
  if(total>cap)warn.push(`${total} Threads is over the cap of ${cap}.`);
  if(opts.uv&&used.length>1)warn.push("Unwavering Vision allows only one Thread type.");
  return {total,cost,missing,warn,cap};
}
// return per map from the session log, grouped by strategy
function mapReturn(maps,avgThread){
  const by={};(maps||[]).forEach(m=>{if(!m||!m.strat)return;const b=by[m.strat]||(by[m.strat]={n:0,profit:0,threads:0,ms:0,timed:0});b.n++;b.profit+=+m.profit||0;b.threads+=+m.threads||0;if(m.dur){b.ms+=m.dur;b.timed++}});
  return Object.entries(by).map(([strat,b])=>{const avgP=b.profit/b.n,avgT=b.threads/b.n,spend=avgThread!=null?avgT*avgThread:null;
    return {strat,n:b.n,avgProfit:avgP,avgThreads:avgT,spend,perChaos:spend?avgP/spend:null,perHour:b.timed?b.profit/b.n/(b.ms/b.timed/3600e3):null}}).sort((a,b)=>b.avgProfit-a.avgProfit);
}
// Betrayal: what to do with each member, given placement and target
function boardAdvice(board,target){
  return MEMBERS.map(m=>{const cur=board[m]||{},want=target[m];
    if(want&&cur.d===want)return {m,ok:true,text:cur.r>=3?"In place at rank 3. Raid this safehouse when it's ready.":"In place. Keep them here and rank them up."};
    if(want)return {m,ok:false,text:cur.d?`Move from ${divName(cur.d)} to ${divName(want)}.`:`Get them into ${divName(want)}.`};
    if(cur.d&&Object.values(target).includes(cur.d)&&Object.entries(target).some(([k,v])=>v===cur.d&&(board[k]||{}).d!==v))return {m,ok:false,text:`Taking a ${divName(cur.d)} slot you want for someone else. Move or remove them.`};
    return {m,ok:null,text:cur.d?"Not part of your plan.":""};
  });
}
const divName=d=>(DIVS.find(x=>x[0]===d)||[,""])[1];

/* ---------- state ---------- */
function st(){const s=S.league3||(S.league3={plan:{},free:0,freeType:"",uv:false,board:{},target:{},preset:""});s.plan=s.plan||{};s.board=s.board||{};s.target=s.target||{};return s}

/* ---------- UI ---------- */
let P=null;
const money=c=>c==null||!isFinite(c)?"–":P&&P.div&&Math.abs(c)>=P.div*0.8?(c/P.div).toFixed(1)+" div":(Math.abs(c)>=100?Math.round(c).toLocaleString():c.toFixed(Math.abs(c)<10?1:0))+"c";
async function render(){
  const root=$("leagueTools");if(!root)return;
  root.innerHTML=`<div class="card hl" id="lgThreads"></div>
    <div class="card" id="lgReturn"></div>
    <div class="card" id="lgBetrayal"></div>
    <div class="grid"><div class="card" id="lgExped"></div><div class="card" id="lgHeist"></div></div>
    <div class="grid"><div class="card" id="lgLab"></div><div class="card" id="lgDrops"></div></div>`;
  renderThreads();renderReturn();renderBetrayal();renderExped();renderHeist();renderLab();renderDrops();
  if(DESK&&typeof ninjaPrices==="function"){try{P=await ninjaPrices(false)}catch(e){P=null}renderThreads();renderReturn();renderExped()}
}
function prefillPlan(){const s=st();if(Object.keys(s.plan).length)return;
  const strat=(typeof STRATS!=="undefined"&&STRATS.find(x=>x.id===S.strat))||null;
  if(strat&&strat.threads)s.plan={...strat.threads};
}
function renderThreads(){
  const el=$("lgThreads");if(!el)return;const s=st();prefillPlan();
  const pr=threadPrices(P);const r=planCost(s.plan,pr,{free:s.free,freeType:s.freeType,uv:s.uv});
  const known=Object.values(pr).filter(v=>v!=null);const avg=known.length?known.reduce((a,b)=>a+b,0)/known.length:null;
  const fray=priceOf(P,"Frayed Thread");
  el.innerHTML=`<h2>Threads per map</h2>
    <p class="small muted" style="margin:0">Scarabs are gone in 3.30. Threads add a league mechanic to a map (up to ${CAP} per map) and more of them raise the chance of transformative effects. Set what you put in the map device to see what each map costs.</p>
    <div class="tw"><table><thead><tr><th>Thread</th><th>Price</th><th>Per map</th><th>Cost</th></tr></thead><tbody>
    ${THREADS.map(t=>`<tr><td>${esc2(t)} Thread</td><td class="num">${money(pr[t])}</td><td><input class="pinput num" type="number" min="0" max="10" value="${s.plan[t]||0}" data-lgt="${t}" aria-label="${t} Threads per map"></td><td class="num">${s.plan[t]?money(pr[t]==null?null:Math.max(0,s.plan[t]-(s.freeType===t?Math.min(s.free,s.plan[t]):0))*pr[t]):""}</td></tr>`).join("")}
    </tbody></table></div>
    <div class="fgrid">
      <label class="f" for="lgFree">Free Threads from a Shaped Region<input type="number" id="lgFree" min="0" max="10" value="${s.free||0}"></label>
      <label class="f" for="lgFreeType">Region type<select id="lgFreeType"><option value="">None</option>${THREADS.map(t=>`<option${s.freeType===t?" selected":""}>${t}</option>`).join("")}</select></label>
      <label class="f" style="flex-direction:row;align-items:center;gap:8px"><input type="checkbox" id="lgUV"${s.uv?" checked":""}> Unwavering Vision</label>
    </div>
    <div class="row"><span class="pill gold">${r.total} Thread${r.total===1?"":"s"} · ${money(r.cost)} per map</span>${avg!=null?`<span class="pill">Average Thread ${money(avg)}</span>`:""}${fray!=null&&avg!=null?`<span class="pill">Frayed Thread ${money(fray)} (rolls a random Thread)</span>`:""}</div>
    ${r.warn.map(w=>`<p class="small" style="margin:0;color:var(--bad)">${esc2(w)}</p>`).join("")}
    ${r.missing.length?`<p class="small muted" style="margin:0">No price yet for: ${r.missing.map(esc2).join(", ")}${P?"":" (prices load in the desktop app)"}.</p>`:""}
    <div class="row"><button class="btn ghost small" id="lgFromStrat">Use my atlas strategy</button><button class="btn ghost small" id="lgClear">Clear</button></div>`;
  el.querySelectorAll("[data-lgt]").forEach(i=>i.onchange=()=>{const n=Math.max(0,Math.min(10,+i.value||0));if(n)s.plan[i.dataset.lgt]=n;else delete s.plan[i.dataset.lgt];save();renderThreads();renderReturn()});
  $("lgFree").onchange=e=>{s.free=Math.max(0,+e.target.value||0);save();renderThreads()};
  $("lgFreeType").onchange=e=>{s.freeType=e.target.value;save();renderThreads()};
  $("lgUV").onchange=e=>{s.uv=e.target.checked;save();renderThreads()};
  $("lgFromStrat").onclick=()=>{s.plan={};prefillPlan();save();renderThreads();renderReturn()};
  $("lgClear").onclick=()=>{const prev=s.plan;s.plan={};save();renderThreads();if(typeof toast==="function")toast("Thread plan cleared.",()=>{s.plan=prev;save();renderThreads()})};
}
function renderReturn(){
  const el=$("lgReturn");if(!el)return;const s=st();
  const pr=threadPrices(P);const known=Object.values(pr).filter(v=>v!=null);const avg=known.length?known.reduce((a,b)=>a+b,0)/known.length:null;
  const rows=mapReturn(S.session&&S.session.maps,avg);
  el.innerHTML=`<h2>What your maps return</h2>
    ${rows.length?`<p class="small muted" style="margin:0">From your session log. Thread spend uses the average Thread price; log profit before Thread costs for a fair "return per chaos".</p>
    <div class="tw"><table><thead><tr><th>Strategy</th><th>Maps</th><th>Avg profit</th><th>Avg Threads</th><th>Thread spend</th><th>Return per chaos</th><th>Per hour</th></tr></thead><tbody>
    ${rows.map(x=>`<tr><td>${esc2(x.strat)}</td><td class="num">${x.n}</td><td class="num">${money(x.avgProfit)}</td><td class="num">${x.avgThreads.toFixed(1)}</td><td class="num">${money(x.spend)}</td><td class="num">${x.perChaos==null?"–":x.perChaos.toFixed(1)+"×"}</td><td class="num">${x.perHour==null?"–":money(x.perHour)}</td></tr>`).join("")}
    </tbody></table></div>`:emptyBox("No maps logged yet. Log maps on the Session page (or connect your game log) to compare what each strategy returns for the Threads you spend.",[["Open Session","goSession"]])}`;
}
function renderBetrayal(){
  const el=$("lgBetrayal");if(!el)return;const s=st();
  const adv=boardAdvice(s.board,s.target);
  const todo=adv.filter(a=>a.ok===false);
  el.innerHTML=`<h2>Betrayal board</h2>
    <p class="small muted" style="margin:0">Betrayal only appears through Betrayal Threads in 3.30. Intervention safehouses now give a stash of one class of unique items, and Scarab rewards became Allflame Ember chests. Set where each member is now and where you want them; <span class="lg-new">highlighted</span> rewards changed in 3.30.</p>
    <div class="row"><label class="f" for="lgPreset" style="min-width:220px">Plan<select id="lgPreset"><option value="">My own</option>${Object.entries(PRESETS).map(([k,v])=>`<option value="${k}"${s.preset===k?" selected":""}>${esc2(v.name)}</option>`).join("")}</select></label>
      <button class="btn ghost small" id="lgBoardReset" style="align-self:end">Clear board</button>
      <button class="btn ghost small" id="lgWiki" style="align-self:end">Full table on the wiki</button></div>
    ${todo.length?`<div class="row">${todo.map(a=>`<span class="pill">${esc2(a.m)}: ${esc2(a.text)}</span>`).join("")}</div>`:Object.keys(s.target).length?'<p class="small" style="margin:0;color:var(--good)">Your board matches the plan.</p>':""}
    <div class="tw"><table class="lg-syn"><thead><tr><th>Member</th>${DIVS.map(([,n])=>`<th>${n}</th>`).join("")}<th>Now</th><th>Rank</th><th>Want</th></tr></thead><tbody>
    ${MEMBERS.map(m=>{const b=s.board[m]||{},w=s.target[m]||"";return `<tr><td><b>${esc2(m)}</b></td>${DIVS.map(([d])=>`<td class="small${changed(m,d)?" lg-new":""}${b.d===d?" lg-here":""}${w===d?" lg-want":""}">${esc2(reward(m,d))}</td>`).join("")}
      <td><select data-lgd="${esc2(m)}" aria-label="${esc2(m)} division now"><option value="">–</option>${DIVS.map(([d,n])=>`<option value="${d}"${b.d===d?" selected":""}>${n}</option>`).join("")}</select></td>
      <td><select data-lgr="${esc2(m)}" aria-label="${esc2(m)} rank">${[0,1,2,3].map(r=>`<option${(b.r||0)===r?" selected":""}>${r}</option>`).join("")}</select></td>
      <td><select data-lgw="${esc2(m)}" aria-label="${esc2(m)} target division"><option value="">–</option>${DIVS.map(([d,n])=>`<option value="${d}"${w===d?" selected":""}>${n}</option>`).join("")}</select></td></tr>`}).join("")}
    </tbody></table></div>
    <p class="small muted" style="margin:0">Rewards not named in the 3.30 patch notes are shown as they were in 3.29. The patch notes don't say which unique class each member's Intervention stash holds.</p>`;
  const upd=(k,m,v)=>{if(k==="w"){if(v)s.target[m]=v;else delete s.target[m];s.preset=""}else{const b=s.board[m]||(s.board[m]={});b[k]=k==="r"?+v:v;if(!b.d&&!b.r)delete s.board[m]}save();renderBetrayal()};
  el.querySelectorAll("[data-lgd]").forEach(x=>x.onchange=()=>upd("d",x.dataset.lgd,x.value));
  el.querySelectorAll("[data-lgr]").forEach(x=>x.onchange=()=>upd("r",x.dataset.lgr,x.value));
  el.querySelectorAll("[data-lgw]").forEach(x=>x.onchange=()=>upd("w",x.dataset.lgw,x.value));
  $("lgPreset").onchange=e=>{const k=e.target.value;s.preset=k;if(k)s.target={...PRESETS[k].t};save();renderBetrayal()};
  $("lgBoardReset").onclick=()=>{const prev={b:s.board,t:s.target,p:s.preset};s.board={};s.target={};s.preset="";save();renderBetrayal();if(typeof toast==="function")toast("Betrayal board cleared.",()=>{s.board=prev.b;s.target=prev.t;s.preset=prev.p;save();renderBetrayal()})};
  $("lgWiki").onclick=()=>go("https://www.poewiki.net/wiki/Immortal_Syndicate");
}
function renderExped(){
  const el=$("lgExped");if(!el)return;
  const rows=ARTIFACTS.map(a=>({a,p:priceOf(P,a)}));const best=rows.filter(r=>r.p!=null).sort((x,y)=>y.p-x.p)[0];
  el.innerHTML=`<h2>Expedition</h2>
    <p class="small muted" style="margin:0">Expedition now needs Expedition Threads. What 100 of each currency is worth, so you know which vendor to spend at and which to sell.</p>
    <div class="tw"><table><thead><tr><th>Currency</th><th>Per 100</th><th>Spend at</th></tr></thead><tbody>
    ${rows.map(r=>`<tr><td>${esc2(r.a)}${best&&best.a===r.a?' <span class="pill gold">highest</span>':""}</td><td class="num">${money(r.p==null?null:r.p*100)}</td><td class="small">${esc2(ARTIFACT_VENDOR[r.a])}</td></tr>`).join("")}
    </tbody></table></div>
    <ul class="small" style="margin:0;padding-left:18px">
      <li>Gwennen: pay one Astragali to "take a chance" on a rare item. Pick one of three pairs of crafting options and she applies one at random. Each pair also costs Broken Circle Artifacts.</li>
      <li>Rog's reroll deals use 1, 3 or 5 rerolls (was 3, 6 or 10).</li>
      <li>Tormented Spirits now spawn in gravestones near Expeditions; detonate the gravestone to free them.</li>
    </ul>`;
}
function renderHeist(){
  const el=$("lgHeist");if(!el)return;
  el.innerHTML=`<h2>Heist</h2>
    <ul class="small" style="margin:0;padding-left:18px">
      <li>Contracts, Blueprints and Rogue's Markers no longer drop from the normal item pool.</li>
      <li><b>Whakano</b> (level 68+) sells Contracts, and rarely Blueprints, for Gold. Offer level follows your Atlas completion, and Gold rerolls the shop. Normal Contracts cost Orbs of Alchemy.</li>
      <li>Finishing a level 68+ Contract can give a bonus Blueprint reveal; higher-level Contracts give better odds.</li>
      <li>Reward-room chests in Contracts have much better Blueprint chances, and Smuggler's Caches in maps give Blueprints that can have special implicits.</li>
      <li>Heist targets sell to Faustus for more Rogue's Markers: up to twice as many from level 83 Contracts.</li>
      <li>Fragment reward chests now give Threads, and Heist equipment doubles them.</li>
    </ul>`;
}
function renderLab(){
  const el=$("lgLab");if(!el)return;
  el.innerHTML=`<h2>Labyrinth</h2>
    <p class="small muted" style="margin:0">The end-of-Labyrinth chests that dropped identified items are gone in 3.30, so run it for enchants and ascendancy points.</p>
    <div class="row"><button class="btn small primary" id="lgPoelab">Today's layouts on poelab</button></div>
    <p class="small muted" style="margin:0">Opens poelab.com${DESK?" in the app's browser":""}.</p>`;
  $("lgPoelab").onclick=()=>go("https://www.poelab.com/");
}
function renderDrops(){
  const el=$("lgDrops");if(!el)return;
  el.innerHTML=`<h2>Where Threads come from</h2>
    <ul class="small" style="margin:0;padding-left:18px">
      <li><b>Shaped Regions</b> give their maps free Threads of one type. Finishing a region's objective adds +1 free Thread to its other maps. Astrolabes place a region with more free Threads.</li>
      <li><b>Eater of Worlds altars</b>: Breach, Legion, Blight, Ritual, Incursion. <b>Searing Exarch altars</b>: Abyss, Expedition, Betrayal, Bestiary, Ultimatum.</li>
      <li><b>Strongboxes</b> drop 2–5 of one Thread type. Monsters touched by Tormented Heretics can drop them.</li>
      <li><b>Betrayal</b>: Rin's Research and Fortification safehouses.</li>
      <li><b>Frayed Thread</b> rolls a random Thread. Old Scarabs converted to Threads or Frayed Threads.</li>
    </ul>`;
}
LG.render=render;
LG._test={planCost,mapReturn,boardAdvice,reward,changed,threadPrices,PRESETS,MEMBERS,THREADS};
})();
