// Exile Companion main window, part 6 of 10: desktop app integration: overlay, account, net worth, stash finds, trends, filters, trades, recipes, reminders, Discord.
// Classic scripts loaded in order by index.html; they share one global scope, so order matters.
"use strict";
/* ---------------- desktop app integration (Electron) ---------------- */
const DESK=window.exileDesktop||null;
const LIVE={zone:null,map:null,status:null,cfg:null,overlayVisible:true,interactive:false,refreshAt:0,warn:null,detected:null};
const isMapId=id=>/^Map/i.test(id)&&!/hideout/i.test(id);
const isCampId=id=>/^\d_\d{1,2}_/.test(id)&&(AREAS[id]?AREAS[id][1]<=10:true);
function xpInfo(pl,al){
  if(!pl||!al) return null;
  const safe=3+Math.floor(pl/16), diff=Math.max(0,Math.abs(pl-al)-safe);
  const pct=Math.round(Math.pow((pl+5)/(pl+5+Math.pow(diff,2.5)),1.5)*100);
  return {pct,cls:pct>=99?"good":pct>=70?"warn":"bad",label:pct>=99?"Full XP":`XP ${pct}%: you're ${pl>al?"over":"under"}levelled here`};
}
const keyName=a=>String(a||"").replace(/CommandOrControl|CmdOrCtrl/g,"Ctrl").replace(/\+/g,"+");
function onLiveEvents(evs){
  let levelChanged=false;const actBefore=S.campAct;
  onTradeEvents(evs);
  for(const e of evs){
    if(e.type==="zone"){
      const ar=AREAS[e.id];
      gameHint("firstZone",`Exile Companion is following your game. ${keyName((LIVE.cfg&&LIVE.cfg.overlayHotkey)||"Ctrl+Shift+O")} hides this overlay, ${keyName((LIVE.cfg&&LIVE.cfg.interactHotkey)||"Ctrl+Shift+I")} makes it clickable.`);
      if(isMapId(e.id))gameHint("firstMap",`Price an item: hover it, Ctrl+C, then ${keyName((LIVE.cfg&&LIVE.cfg.priceHotkey)||"Ctrl+D")}. ${keyName((LIVE.cfg&&LIVE.cfg.widgetHotkey)||"Ctrl+Shift+Space")} opens stash searches, a stopwatch and notes.`);
      LIVE.zone={id:e.id,lvl:e.lvl,seed:e.seed,t:e.t,name:ar?ar[0]:(isMapId(e.id)?mapNameFromId(e.id):e.id),act:ar&&/^\d_/.test(e.id)?ar[1]:0};
      if(isMapId(e.id)){const key=e.id+"#"+e.seed;if(!LIVE.map||LIVE.map.key!==key)LIVE.map={key,name:LIVE.zone.name,tier:e.lvl>=68?Math.min(17,e.lvl-67):null,start:e.t,deaths:0};if(markMapDone(e.id,e.t)){save();renderMapCompletion();DESK.notify({kind:"milestones",title:`New map: ${LIVE.zone.name}`,body:MAP_POOL.length?`${MAP_POOL.filter(m=>S.mapsDone[m.key]).length}/${MAP_POOL.length} maps towards atlas completion.`:"Added to your atlas completion."})}}
      else if(isCampId(e.id)) LIVE.map=null;
      if(isCampId(e.id)&&LIVE.zone.act&&LIVE.zone.act<=10&&S.campAct!==LIVE.zone.act&&LIVE.zone.act>(S.campAct||0)){S.campAct=LIVE.zone.act;save()}
    }
    else if(e.type==="scene"&&LIVE.zone&&!AREAS[LIVE.zone.id]) LIVE.zone.name=e.name;
    else if(e.type==="level"&&charFromLog(e.name)){/* another saved character: not recorded on this one */}
    else if(e.type==="level"){if(!S.logChar||S.logChar===e.name||(S.logInfo&&e.level>S.logInfo.level&&e.cls===S.logInfo.cls)){S.logChar=e.name;S.logInfo={...(S.logInfo||{}),name:e.name,cls:e.cls,level:e.level,t:e.t};addLevelUp(e.level,e.t);levelChanged=true}}
    else if(e.type==="death"&&LIVE.map&&(!S.logChar||e.name===S.logChar)) LIVE.map.deaths++;
    else if(e.type==="system"&&onSystemLine(e.text,e.t)){save();renderCampaign()}
  }
  if(levelChanged){save();renderCampaign();reminderOnLevel(S.logInfo.level)}
  if(S.campAct!==actBefore&&S.campAct>(actBefore||0)) reminderOnAct(S.campAct);
  if(evs.some(e=>e.type==="zone"||e.type==="level")) publishDiscord();
  publishOverlay();
  scheduleRefresh();
}
let refreshT=null;
function scheduleRefresh(delay=2500){clearTimeout(refreshT);refreshT=setTimeout(refreshFromLog,delay)}
async function refreshFromLog(){
  if(!DESK) return;
  try{
    const r=await DESK.readLogTail(25);
    if(!r||r.error||!r.text) return;
    const mapsBefore=S.session.maps.length;
    const changed=await processLogText(r.text,{quiet:true,partial:r.partial,size:r.size});
    if(S.session.maps.length>mapsBefore) reminderOnMaps();
    LIVE.refreshAt=Date.now();
    if(changed) renderAll(); else {renderGameLog();renderProfit()}
    publishOverlay();
  }catch(e){console.error(e)}
}
function buildOverlayPayload(){
  const z=LIVE.zone;
  const lvl=(S.logInfo&&S.logInfo.level)||(C||G).level;
  const campaignDone=!!S.progress.p1;
  let mode;
  if(z&&isMapId(z.id)) mode="maps";
  else if(z&&isCampId(z.id)) mode="campaign";
  else if(z&&LIVE.map&&!isTownOrHideout(z.id)) mode="maps";
  else mode=campaignDone?"maps":"campaign";
  const eta=nextLevelEta();
  const p={mode,zone:z?{name:z.name,lvl:z.lvl,id:z.id}:null,char:{name:S.logInfo&&S.logInfo.name,level:lvl},xp:z&&z.lvl&&mode==="campaign"?xpInfo(lvl,z.lvl):null,eta:eta&&lvl<100?eta.left:null};
  p.pages=overlayPages();
  p.trades=TRADES.filter(t=>Date.now()-t.t<20*60e3).slice(0,3).map(t=>({name:t.name,item:t.item,price:`${t.amount} ${t.currency}`,where:t.tab?`"${t.tab}" left ${t.left}, top ${t.top}`:"",joined:t.joined,cmds:tradeCmds(t)}));
  const c=LIVE.cfg||{};
  p.hint=`${keyName(c.pageHotkey||"Ctrl+Shift+P")}: pages · ${keyName(c.interactHotkey||"Ctrl+Shift+I")}: click mode · ${keyName(c.copyHotkey||"Ctrl+Shift+F")}: copy search · ${keyName(c.overlayHotkey||"Ctrl+Shift+O")}: hide`;
  if(mode==="campaign"){
    const act=z&&z.act&&z.act<=10?z.act:(S.campAct||1);
    const A=CAMPAIGN[act-1];
    const steps=A.steps.map((s,i)=>({key:act+"-"+i,text:s.t,tag:s.k,done:!!(S.camp||{})[act+"-"+i]})).filter(s=>!s.done).slice(0,4);
    const plan=gemPlan(G);
    const gems=plan.filter(x=>x.act===act&&(x.how==="quest"||x.how==="vendor")).map(x=>`${x.how==="quest"?"Take":"Buy"} ${x.info.name} (${x.npc})`);
    const buyable=plan.filter(x=>(x.how==="vendor"||x.how==="quest")&&x.act<=act||x.how==="siosa"&&act>=3).map(x=>x.info.name);
    const rx=buyable.length?gemSearchFor(buyable)[0]:"";
    const runs=S.splitRuns||[];const latest=runs[runs.length-1];
    let split=null;
    if(latest&&!latest.done){const best=runs.filter(r=>r.done&&r.ms[act]!=null).map(r=>r.ms[act]);const inAct=z&&z.act===act&&isCampId(z.id);
      split={actMs:latest.ms[act]||0,bestMs:best.length?Math.min(...best):null,totalMs:Object.values(latest.ms).reduce((a,b)=>a+b,0),since:inAct&&LIVE.refreshAt?LIVE.refreshAt:null}}
    p.campaign={act,target:A.lvl,steps,gems,split};
    p.notes=notesFor(lvl,act);
    p.regex=rx;p.regexLabel="Vendor search: build gems you can buy";
  } else {
    const maps=S.session.maps, timed=maps.filter(m=>m.dur);
    const mapMs=timed.reduce((a,m)=>a+m.dur,0), profit=maps.reduce((a,m)=>a+(+m.profit||0),0);
    const avoid=withBuild(liveB(),()=>avoidList().filter(m=>!S.avoidOff[m.id]));
    const strat=withBuild(liveB(),()=>STRATS.find(x=>x.id===S.strat)||primaryStrat());
    const next=PROGRESS.find(x=>!S.progress[x.id]);
    p.maps={current:z&&LIVE.map&&!isTownOrHideout(z.id)?LIVE.map:null,
      session:{count:maps.length,avgMs:timed.length?mapMs/timed.length:0,div:mapMs>60000&&profit?profit/(mapMs/3.6e6)/S.divine:null,goal:goalState()},
      avoid:avoid.map(m=>m.label),strat:{name:strat.name,threads:Object.entries(strat.threads)},next:next?next.t:null,
      cards:z&&isMapId(z.id)&&S.cardIndex?cardsForArea(z.id,CARD_P).slice(0,4).map(c=>c.name+(c.v?` (${fmt(c.v)}c)`:"")):[]};
    p.regex=avoid.length?`"!${avoid.map(m=>m.frag).join("|")}"`:"";p.regexLabel="Map stash search: hide bad mods";
  }
  return p;
}
let pubT=null;
function publishOverlay(){if(!DESK)return;clearTimeout(pubT);pubT=setTimeout(()=>{try{DESK.publishOverlay(buildOverlayPayload());publishStream()}catch(e){console.error(e)}},60)}
function renderDesktop(){
  if(!DESK) return;
  const c=LIVE.cfg||{};
  const st=LIVE.status;
  $("deskLog").innerHTML=`<h2>Live game log</h2>
    <div class="row"><span class="pill ${st&&st.ok?"good":"warn"}">${st&&st.ok?"Connected":"Not connected"}</span><span class="small muted" style="word-break:break-all">${esc(st&&st.ok?st.path:(st&&st.message)||"Looking for Client.txt…")}</span></div>
    <div class="row"><button class="btn" id="dkDetect">Find Client.txt</button><button class="btn ghost" id="dkChoose">Choose file…</button></div>
    ${LIVE.detected?`<ul class="clean small">${LIVE.detected.length?LIVE.detected.map(d=>`<li class="row" style="justify-content:space-between"><span style="word-break:break-all">${esc(d.path)}</span><button class="btn ghost small" data-uselog="${esc(d.path)}">Use</button></li>`).join(""):"<li class='muted'>No Client.txt found in the usual places. Use Choose file.</li>"}</ul>`:""}
    <p class="small" style="margin:0">The app follows the log as you play: zone changes move the overlay to the right act, level-ups update your level, and finished maps land in your map log automatically.</p>
    ${LIVE.zone?`<p class="small muted" style="margin:0">Now in: ${esc(LIVE.zone.name)} (area level ${LIVE.zone.lvl})</p>`:""}`;
  $("dkDetect").onclick=async()=>{LIVE.detected=await DESK.detectLogs();renderDesktop()};
  $("dkChoose").onclick=async()=>{await DESK.chooseLog()};
  document.querySelectorAll("[data-uselog]").forEach(b=>b.onclick=async()=>{LIVE.cfg=await DESK.setConfig({logPath:b.dataset.uselog});LIVE.detected=null;renderDesktop()});
  const hk=(id,label,key)=>`<label class="f" for="${id}">${label}<input type="text" id="${id}" value="${esc(c[key]||"")}" data-cfg="${key}" placeholder="e.g. Ctrl+Shift+O"></label>`;
  $("deskOverlay").innerHTML=`<h2>Overlay</h2>
    <div class="row"><button class="btn primary" id="dkOvl">${LIVE.overlayVisible?"Hide overlay":"Show overlay"}</button><button class="btn" id="dkInt">${LIVE.interactive?"Back to click-through":"Click mode (move, tick, copy)"}</button><button class="btn ghost" id="dkReset">Reset position</button></div>
    <label class="f" for="dkOpacity">Opacity: ${Math.round((c.overlayOpacity||0.92)*100)}%<input type="range" id="dkOpacity" min="0.4" max="1" step="0.02" value="${c.overlayOpacity||0.92}"></label>
    <p class="small muted" style="margin:0">Hotkeys: <b>${esc(keyName(c.overlayHotkey||"Ctrl+Shift+O"))}</b> show/hide · <b>${esc(keyName(c.interactHotkey||"Ctrl+Shift+I"))}</b> click mode · <b>${esc(keyName(c.copyHotkey||"Ctrl+Shift+F"))}</b> copy search. <a href="#settings">Change them in Settings</a>.</p>
    <p class="small muted" style="margin:0">Run Path of Exile in <b>Windowed Fullscreen</b> (Options → Graphics); true fullscreen hides overlays. In campaign zones the overlay shows the act's next steps, gem rewards and XP range. In maps it shows a map timer, deaths, your session rate and the map-mod search.</p>`;
  $("dkOvl").onclick=()=>DESK.toggleOverlay(!LIVE.overlayVisible);
  $("dkInt").onclick=()=>DESK.setInteractive(!LIVE.interactive);
  $("dkReset").onclick=()=>DESK.resetOverlay();
  $("dkOpacity").onchange=async e=>{LIVE.cfg=await DESK.setConfig({overlayOpacity:+e.target.value});renderDesktop()};
  $("deskPrice").innerHTML=`<h2>Price check</h2>
    <p class="small" style="margin:0">Hover an item in game, press <b>Ctrl+C</b> (the game's own copy), then <b>${esc(keyName(c.priceHotkey||"Ctrl+D"))}</b>. A price window pops up next to your cursor with poe.ninja values and the cheapest live listings. For rares and magic items it searches for items with similar mods, and you can tick mods on or off and search again.</p>
    <p class="small muted" style="margin:0">The app reads the clipboard only when you press <b>${esc(keyName(c.priceHotkey||"Ctrl+D"))}</b>, once per press, as GGG's rules ask. League ${esc(c.league||"detected automatically")}. <a href="#settings">Change in Settings</a>.</p>
    <details class="small"><summary style="cursor:pointer">Test with pasted item text</summary><textarea id="dkTest" placeholder="Paste text copied from an item in game"></textarea><button class="btn" id="dkTestGo" style="margin-top:6px">Run price check</button></details>
    <p class="note" style="margin:0">Prices come from pathofexile.com/trade and poe.ninja, cached for 15 minutes. The trade site limits how often you can search, so the app waits when it's told to.</p>`;
  $("dkTestGo").onclick=()=>{const t=$("dkTest").value.trim();if(t)DESK.testPrice(t)};
  renderSettings();
  document.querySelectorAll("#tab-desktop [data-cfg]").forEach(inp=>inp.onchange=async()=>{const patch={};patch[inp.dataset.cfg]=inp.value.trim()||null;LIVE.cfg=await DESK.setConfig(patch);if(inp.dataset.cfg==="league"&&LIVE.cfg.league){S.league=LIVE.cfg.league;save();renderShop()}publishOverlay()});
  $("deskRules").innerHTML=`<h2>Playing by the rules</h2>
    <ul class="small" style="margin:0;padding-left:18px">
      <li>The app only <b>reads</b> your log file and clipboard. It never presses keys, clicks, or reads game memory.</li>
      <li>Price checks read the clipboard once, only when you press the price hotkey. The app never presses keys in the game for you.</li>
      <li>Hotkeys only affect this app (show the overlay, copy a search). You paste searches yourself.</li>
    </ul>
    <p class="note" style="margin:0">GGG doesn't certify third-party tools and can change its policy. This app follows the same approach as long-standing tools like PoE Overlay and Exile UI.</p>
    ${LIVE.warn?`<p class="small" style="margin:0;color:var(--warn)">${esc(LIVE.warn)}</p>`:""}`;
  renderTrades();renderDiscordCard();renderAlerts();renderStreamCard();renderBackup();renderCheats();renderNews();renderUpdates();
}
async function initDesktop(){
  if(!DESK) return;
  $("deskTabBtn").hidden=false;if(DESK.mediaToggle)$("mediaTabBtn").hidden=false;syncNav();
  LIVE.cfg=await DESK.getConfig();
  LIVE.overlayVisible=LIVE.cfg.overlayVisible!==false;
  if(LIVE.cfg.league){S.league=LIVE.cfg.league;save()}
  DESK.onLogEvents(onLiveEvents);
  pushScale();
  if(DESK.safeState)DESK.safeState().then(st=>{SAFE_STATE=st||{};renderSafe()}).catch(()=>{});
  DESK.onLogStatus(s=>{LIVE.status=s;renderDesktop();renderGameLog();if(s.ok)scheduleRefresh(100)});
  DESK.onLeague(l=>{if(l){LIVE.cfg.league=l;S.league=l;save();showGameLabel();renderDesktop();renderShop()}});
  if(DESK.onLeagueNew)DESK.onLeagueNew(x=>{if(!x||!x.to)return;S.league=x.to;LIVE.cfg.league=x.to;S.newLeague={from:x.from,to:x.to,at:Date.now(),steps:{}};save();showGameLabel();renderNewLeague();refreshGameData(true)});
  DESK.onWarning(w=>{LIVE.warn=w;renderDesktop()});
  DESK.onOverlayInteractive(v=>{LIVE.interactive=v;renderDesktop()});
  DESK.onOverlayVisible(v=>{LIVE.overlayVisible=v;renderDesktop()});
  DESK.onOverlayAction(a=>{
    if(a&&a.type==="tick"&&a.key){S.camp=S.camp||{};S.camp[a.key]=true;save();renderCampaign();publishOverlay()}
  });
  renderDesktop();
  publishOverlay();
}


/* ================= ACCOUNT FEATURES (desktop) + atlas / filter helpers (all) ================= */
const FRAME={0:"NORMAL",1:"MAGIC",2:"RARE",3:"UNIQUE",4:"GEM",5:"CURRENCY",6:"DIVINATION",9:"UNIQUE"};
const INV_SLOT={Weapon:"Weapon 1",Offhand:"Weapon 2",Weapon2:"Weapon 1 Swap",Offhand2:"Weapon 2 Swap",Helm:"Helmet",BodyArmour:"Body Armour",Gloves:"Gloves",Boots:"Boots",Amulet:"Amulet",Ring:"Ring 1",Ring2:"Ring 2",Ring3:"Ring 3",Belt:"Belt"};
const ASC_BASE={Slayer:"Duelist",Gladiator:"Duelist",Champion:"Duelist",Assassin:"Shadow",Saboteur:"Shadow",Trickster:"Shadow",Juggernaut:"Marauder",Berserker:"Marauder",Chieftain:"Marauder",Necromancer:"Witch",Occultist:"Witch",Elementalist:"Witch",Deadeye:"Ranger",Raider:"Ranger",Pathfinder:"Ranger",Warden:"Ranger",Inquisitor:"Templar",Hierophant:"Templar",Guardian:"Templar",Ascendant:"Scion",Reliquarian:"Scion"};
const stripTags=t=>String(t||"").replace(/\[([^\]|]*\|)?([^\]]*)\]/g,"$2");
const propNum=(it,name)=>{const p=(it.properties||[]).find(x=>x.name===name);if(!p||!p.values||!p.values[0])return null;const n=parseInt(String(p.values[0][0]).replace(/[^\d-]/g,""),10);return isNaN(n)?null:n};
function apiItem(it,id){
  const rarity=FRAME[it.frameType]||"NORMAL";
  const name=stripTags(it.name)||stripTags(it.typeLine);
  return {id,rarity,name,base:stripTags(it.baseType||it.typeLine),ilvl:it.ilvl||null,
    implicits:(it.implicitMods||[]).map(t=>({text:stripTags(t)})),
    mods:[...(it.fracturedMods||[]).map(t=>({text:stripTags(t),fractured:true})),...(it.explicitMods||[]).map(t=>({text:stripTags(t)})),...(it.craftedMods||[]).map(t=>({text:stripTags(t),crafted:true}))],
    flags:[...(it.corrupted?["Corrupted"]:[]),...(it.fractured?["Fractured"]:[]),...(it.identified===false?["Unidentified"]:[])],
    links:Math.max(0,...Object.values((it.sockets||[]).reduce((a,s)=>{a[s.group]=(a[s.group]||0)+1;return a},{}))),
    stack:it.stackSize||1,raw:"",icon:it.icon||null};
}
function buildFromCharacter(ch,prev){
  const items={},slots=[],skills=[];let n=0;
  for(const it of ch.equipment||[]){
    let slot=INV_SLOT[it.inventoryId];
    if(it.inventoryId==="Flask") slot=`Flask ${(it.x||0)+1}`;
    if(!slot) continue;
    const id=String(++n);items[id]=apiItem(it,id);slots.push({name:slot,itemId:id});
    // gems by socket group
    const groups={};
    (it.socketedItems||[]).forEach(g=>{if(g.abyssJewel)return;const grp=it.sockets&&it.sockets[g.socket]?it.sockets[g.socket].group:0;(groups[grp]=groups[grp]||[]).push({name:stripTags(g.typeLine).replace(/ Support$/,""),level:propNum(g,"Level")||1,quality:propNum(g,"Quality")||0,enabled:true,support:!!g.support})});
    Object.values(groups).forEach(gems=>skills.push({label:"",slot,enabled:true,mainActive:1,gems:gems.sort((a,b)=>a.support-b.support)}));
  }
  (ch.jewels||[]).forEach(it=>{const id=String(++n);items[id]=apiItem(it,id)});
  const jewelIds=Object.keys(items).filter(k=>!slots.find(s=>s.itemId===k));
  // main skill: the group holding the goal's main skill, else the biggest group
  const gMain=G?gemNorm(mainSkillName(G)):"";
  let mi=skills.findIndex(s=>s.gems.some(g=>gemNorm(g.name)===gMain));
  if(mi<0){let best=0;skills.forEach((s,i)=>{if(s.gems.length>best){best=s.gems.length;mi=i}})}
  const cls=ch.class||"";
  return {level:ch.level||1,className:ASC_BASE[cls]||cls||"Unknown",ascend:ASC_BASE[cls]?cls:"",mainSocketGroup:mi+1,
    stats:{...(prev&&prev.stats||{})},minionStats:{...(prev&&prev.minionStats||{})},
    skillSets:[{id:1,title:"Live",skills}],itemSets:[{id:1,title:"Live",slots}],items,
    specs:[{title:"Live from GGG",version:"",nodes:(ch.passives&&ch.passives.hashes||[]).length,ids:(ch.passives&&ch.passives.hashes||[]).map(String),url:"",jewels:jewelIds}],
    notes:"",activeSkillSet:1,activeItemSet:1,activeSpec:1,live:{at:Date.now(),name:ch.name,league:ch.league,statsFrom:prev&&prev.stats&&Object.keys(prev.stats).length?"pob":null}};
}
function syncDiff(a,b){
  if(!a) return ["First sync."];
  const out=[];
  const gear=x=>Object.fromEntries(currentSlots(x).map(s=>[s.name,x.items[s.itemId]&&x.items[s.itemId].name]));
  const ga=gear(a),gb=gear(b);
  Object.keys({...ga,...gb}).forEach(k=>{if(ga[k]!==gb[k]&&!/Flask/.test(k))out.push(gb[k]?`${k}: ${gb[k]}`:`${k}: removed`)});
  const pa=(currentSpec(a)||{}).nodes||0,pb=(currentSpec(b)||{}).nodes||0;if(pb!==pa)out.push(`${pb-pa>0?"+":""}${pb-pa} passives`);
  if(b.level!==a.level)out.push(`Level ${a.level} → ${b.level}`);
  const ma=gemMap(a),mb=gemMap(b);
  mb.forEach((g,k)=>{const o=ma.get(k);if(!o)out.push(`New gem: ${g.name}`);else if(g.level>o.level)out.push(`${g.name} ${o.level} → ${g.level}`)});
  return out.length?out:["No changes."];
}

/* ---------- prices from poe.ninja (for net worth & stash finds) ---------- */
let NINJA=null;
async function ninjaPrices(force){
  if(NINJA&&!force&&Date.now()-NINJA.at<15*60e3) return NINJA;
  const lg=await ninjaLeagueId();
  const P={at:Date.now(),cur:{chaos:1,"Chaos Orb":1},items:{},ex:{},trend:{},div:null,league:lg};
  const get=async u=>{try{const r=await DESK.http({url:u,cacheMs:15*60e3});return r&&r.data}catch(e){return null}};
  for(const t of ["Currency","Fragment"]){const d=await get(`https://poe.ninja/poe1/api/economy/stash/current/currency/overview?league=${encodeURIComponent(lg)}&type=${t}`);(d&&d.lines||[]).forEach(l=>{P.cur[l.currencyTypeName]=l.chaosEquivalent;const tr=trendOf(l);if(tr)P.trend[l.currencyTypeName]=tr})}
  P.div=P.cur["Divine Orb"]||null;
  for(const t of ["DivinationCard","Essence","Oil","Fossil","Resonator","DeliriumOrb","Omen","Tattoo","Artifact","Thread","AllflameEmber","Astrolabe","Runegraft","DjinnCoin"]){
    const d=await get(`https://poe.ninja/poe1/api/economy/exchange/current/overview?league=${encodeURIComponent(lg)}&type=${t}`);
    if(!d||!d.lines) continue;
    const core=d.core||{};const names={};
    const items=core.items||d.items||[];
    (Array.isArray(items)?items:Object.entries(items).map(([id,v])=>({id,...v}))).forEach(x=>{if(x&&x.id)names[x.id]=x.name||x.text||x.id});
    const primary=String(core.primary||"chaos").toLowerCase();
    const mult=primary.includes("div")?(P.div||0):1;
    d.lines.forEach(l=>{const nm=names[l.id]||l.name;if(nm&&l.primaryValue!=null&&mult){P.ex[nm]=l.primaryValue*mult;const tr=trendOf(l);if(tr)P.trend[nm]=tr}});
  }
  for(const t of ["UniqueWeapon","UniqueArmour","UniqueAccessory","UniqueFlask","UniqueJewel","UniqueMap","SkillGem","ClusterJewel","Invitation","Memory"]){
    const d=await get(`https://poe.ninja/poe1/api/economy/stash/current/item/overview?league=${encodeURIComponent(lg)}&type=${t}`);
    (d&&d.lines||[]).forEach(l=>{(P.items[l.name]=P.items[l.name]||[]).push(l)});
  }
  NINJA=P;return P;
}
async function ninjaLeagueId(){
  const want=S.league||(LIVE.cfg&&LIVE.cfg.league)||"";
  try{const r=await DESK.http({url:"https://poe.ninja/poe1/api/economy/leagues",cacheMs:3600e3});const l=Array.isArray(r.data)?r.data:[];const hit=l.find(x=>x.id===want||x.name===want);return hit?hit.id:(want||(l[0]&&l[0].id)||"Standard")}catch(e){return want||"Standard"}
}
function priceApiItem(raw,P){
  const it=apiItem(raw,"x");const qty=raw.stackSize||1;
  const each=(()=>{
    if(it.rarity==="CURRENCY"){return P.cur[it.name]??P.ex[it.name]??null}
    if(it.rarity==="DIVINATION") return P.ex[it.name]??null;
    if(it.rarity==="UNIQUE"){const lines=P.items[it.name];if(!lines)return null;const lk=it.links>=5?it.links:0;const c=lines.filter(l=>(l.links||0)===lk);const pool=c.length?c:lines;return Math.min(...pool.map(l=>l.chaosValue).filter(v=>v!=null))}
    if(it.rarity==="GEM"){const lines=P.items[it.name];if(!lines)return null;const lv=propNum(raw,"Level")||1;const q=propNum(raw,"Quality")||0;const c=lines.filter(l=>{const m=String(l.variant||"").match(/^(\d+)(?:\/(\d+))?/);return m&&+m[1]<=lv&&(+m[2]||0)<=q&&!!l.corrupted===!!raw.corrupted});const pool=c.length?c:lines.filter(l=>!l.corrupted);return pool.length?Math.max(...pool.map(l=>l.chaosValue||0)):null}
    return P.ex[it.name]??P.cur[it.name]??null;
  })();
  return each==null||!isFinite(each)?null:each*qty;
}

/* ---------- account tab ---------- */
const ACCT={status:null,chars:null,tabs:null,busy:null,cx:null,cxBusy:false,stashItems:null,lastSyncDiff:null,syncTimer:null,netTimer:null};
async function acctRefreshStatus(){ACCT.status=await DESK.acctStatus();renderAccount()}
async function loadCharacters(){
  ACCT.busy="Loading characters…";renderAccount();
  const r=await DESK.characters({account:ACCT.status&&ACCT.status.accountName});
  ACCT.busy=null;
  if(!r.ok){ACCT.err=r.error;renderAccount();return}
  ACCT.err=null;ACCT.chars=r.data.filter(c=>!c.expired);renderAccount();
}
async function syncCharacter(name,quiet){
  name=name||S.syncChar;if(!name) return;
  if(!quiet){ACCT.busy=`Syncing ${name}…`;renderAccount()}
  const r=await DESK.character({account:ACCT.status&&ACCT.status.accountName,name});
  ACCT.busy=null;
  if(!r.ok){ACCT.err=r.error;renderAccount();return}
  ACCT.err=null;
  const prevC=C&&C!==G?C:null;
  const nb=buildFromCharacter(r.data,prevC);
  ACCT.lastSyncDiff=syncDiff(prevC&&prevC.live?prevC:null,nb);
  C=nb;exC=false;reanalyze();
  S.syncChar=name;S.syncAt=Date.now();
  if(r.data.experience){S.expHist=(S.expHist||[]).filter(x=>Date.now()-x.t<6*3600e3).concat([{t:Date.now(),exp:r.data.experience}]).slice(-20)}
  save();
  try{localStorage.setItem("ec330.liveChar",JSON.stringify(r.data))}catch(e){}
  if(r.data.league&&!S.league){S.league=r.data.league}
  renderAll();
}
function startAutoSync(){clearInterval(ACCT.syncTimer);const m=+S.syncEvery||0;if(m>0&&S.syncChar)ACCT.syncTimer=setInterval(()=>syncCharacter(null,true),m*60e3)}
function renderAccount(){
  const el=$("acctConn");if(!el||!DESK) return;
  const st=ACCT.status||{};const c=LIVE.cfg||{};
  el.innerHTML=`<h2>Your GGG account</h2>
    <div class="row"><span class="pill ${st.signedIn?"good":"gold"}">${st.signedIn?`Signed in${st.user?" as "+esc(st.user):""}`:"Using your public profile"}</span>${st.hasSession?'<span class="pill good">POESESSID saved</span>':""}${st.encrypted===false?'<span class="pill warn">Secrets not encrypted on this PC</span>':""}</div>
    <label class="f" for="acName">Account name (with the #1234 part)<input type="text" id="acName" value="${esc(c.accountName||"")}" placeholder="YourName#1234"></label>
    <p class="small muted" style="margin:0">Character sync works with a <b>public</b> profile (pathofexile.com → My Account → Privacy → show characters). Stash features need your POESESSID or a GGG sign-in.</p>
    <details class="small"><summary style="cursor:pointer">POESESSID (for stash tabs)</summary>
      <p class="muted" style="margin:6px 0">Log in at pathofexile.com, press F12 → Application → Cookies → copy <b>POESESSID</b>. It's stored encrypted on this PC and only sent to pathofexile.com. It's like a password: never share it, and log out of the website to invalidate it.</p>
      <div class="row"><input type="password" id="acSess" placeholder="${st.hasSession?"saved: paste to replace":"paste POESESSID"}" style="flex:1"><button class="btn" id="acSessSave">Save</button>${st.hasSession?'<button class="btn ghost" id="acSessClear">Remove</button>':""}</div></details>
    <details class="small"><summary style="cursor:pointer">Official GGG sign-in (OAuth)</summary>
      <p class="muted" style="margin:6px 0">Needs your own OAuth client ID from GGG, registered as a public client with the redirect below. GGG's developer page currently says it can't process new applications, so leave this empty until they reopen. Signing in unlocks the atlas tree check and uploading filters to your account.</p>
      <div class="fgrid"><label class="f" for="acClient">Client ID<input type="text" id="acClient" value="${esc(c.oauthClientId||"")}"></label><label class="f" for="acRedir">Redirect URI<input type="text" id="acRedir" value="${esc(c.oauthRedirect||"http://127.0.0.1:8080/callback")}"></label></div>
      <div class="row">${st.signedIn?'<button class="btn ghost" id="acOut">Sign out</button>':`<button class="btn" id="acIn"${c.oauthClientId?"":" disabled"}>Sign in with GGG</button>`}</div></details>
    ${ACCT.err?`<p class="small" style="margin:0;color:var(--bad)">${esc(ACCT.err)}</p>`:""}${ACCT.busy?`<p class="small muted" style="margin:0">${esc(ACCT.busy)}</p>`:""}`;
  $("acName").onchange=async e=>{LIVE.cfg=await DESK.setConfig({accountName:e.target.value.trim()});await acctRefreshStatus()};
  $("acSessSave").onclick=async()=>{const v=$("acSess").value.trim();if(!v)return;ACCT.status=await DESK.setSession(v);renderAccount()};
  const sc=$("acSessClear");if(sc)sc.onclick=async()=>{ACCT.status=await DESK.setSession("");renderAccount()};
  $("acClient").onchange=async e=>{LIVE.cfg=await DESK.setConfig({oauthClientId:e.target.value.trim()});renderAccount()};
  $("acRedir").onchange=async e=>{LIVE.cfg=await DESK.setConfig({oauthRedirect:e.target.value.trim()})};
  const si=$("acIn");if(si)si.onclick=async()=>{ACCT.busy="Finish signing in in your browser…";renderAccount();const r=await DESK.login();ACCT.busy=null;if(!r.ok)ACCT.err=r.error;else{ACCT.err=null;ACCT.status=r.data}renderAccount()};
  const so=$("acOut");if(so)so.onclick=async()=>{ACCT.status=await DESK.logout();renderAccount()};
  renderCharSync();renderNetWorth();renderRecipes();renderStashFinds();renderCurrencyTrends();renderSales();
}
function renderCharSync(){
  const el=$("acctChar");if(!el) return;
  const chars=ACCT.chars;
  el.innerHTML=`<h2>Live character sync</h2>
    <p class="small" style="margin:0">Pulls your character's gear, gems, passives and level straight from GGG and makes it your <b>Current</b> build, so Progress and the Shopping list stay up to date without PoB.</p>
    <div class="row"><button class="btn" id="csList">${chars?"Refresh list":"Load my characters"}</button>${S.syncChar?`<button class="btn primary" id="csNow">Sync ${esc(S.syncChar)} now</button>`:""}</div>
    ${chars?`<label class="f" for="csPick">Character<select id="csPick"><option value="">Choose…</option>${chars.map(c=>`<option value="${esc(c.name)}"${c.name===S.syncChar?" selected":""}>${esc(c.name)} · ${esc(c.class)} ${c.level} · ${esc(c.league)}</option>`).join("")}</select></label>`:""}
    <label class="f" for="csEvery" style="max-width:260px">Sync automatically<select id="csEvery">${[[0,"Off"],[5,"Every 5 min"],[10,"Every 10 min"],[30,"Every 30 min"]].map(([v,t])=>`<option value="${v}"${(+S.syncEvery||0)===v?" selected":""}>${t}</option>`).join("")}</select></label>
    ${S.syncAt?`<p class="small muted" style="margin:0">Last sync ${new Date(S.syncAt).toLocaleTimeString()}${ACCT.lastSyncDiff?": "+ACCT.lastSyncDiff.map(esc).join(" · "):""}</p>`:""}
    ${xpPerHour()?`<p class="small" style="margin:0"><b>XP per hour:</b> ${fmt(xpPerHour())} (from your last syncs)</p>`:""}
    <p class="note" style="margin:0">GGG's data has no DPS or resistance totals, so those stay at your last Path of Building import (re-import occasionally for exact numbers).</p>`;
  $("csList").onclick=loadCharacters;
  const now=$("csNow");if(now)now.onclick=()=>syncCharacter();
  const pk=$("csPick");if(pk)pk.onchange=()=>{if(pk.value){S.syncChar=pk.value;save();syncCharacter(pk.value);startAutoSync()}};
  $("csEvery").onchange=e=>{S.syncEvery=+e.target.value;save();startAutoSync()};
}
/* ---------- net worth ---------- */
async function loadTabs(){
  const lg=S.league||(LIVE.cfg&&LIVE.cfg.league);
  ACCT.busy="Loading stash tabs…";renderAccount();
  const r=await DESK.stashList({account:ACCT.status&&ACCT.status.accountName,league:lg});
  ACCT.busy=null;if(!r.ok){ACCT.err=r.error;renderAccount();return}
  ACCT.err=null;ACCT.tabs=r.data.filter(t=>!t.hidden&&t.type!=="Folder");
  S.netTabs=S.netTabs||{};renderAccount();
}
async function snapshotNetWorth(auto){
  if(ACCT.snapBusy) return;
  const lg=S.league||(LIVE.cfg&&LIVE.cfg.league);
  if(!ACCT.tabs){await loadTabs();if(!ACCT.tabs)return}
  const tabs=ACCT.tabs.filter(t=>S.netTabs[t.id]!==false);
  ACCT.snapBusy=true;
  try{
    const P=await ninjaExtras(await ninjaPrices(true));
    const byTab={},top=[],keep=[],listedAll=[];let total=0,priced=0,unpriced=0;
    for(let i=0;i<tabs.length;i++){
      const t=tabs[i];ACCT.busy=`Reading tab ${i+1} of ${tabs.length}: ${t.name}`;renderNetWorth();
      const r=await DESK.stashTab({account:ACCT.status&&ACCT.status.accountName,league:lg,tab:t});
      if(!r.ok){ACCT.err=`${t.name}: ${r.error}`;break}
      let sum=0;
      for(const raw of r.data){
        const v=priceApiItem(raw,P);
        if(v!=null){sum+=v;priced++;const nm=stripTags(raw.name)||stripTags(raw.typeLine);const tr=P.trend[nm]||trendOf((P.items[nm]||[])[0]);top.push({name:nm,qty:raw.stackSize||1,v,tab:t.name,icon:raw.icon||null,tr:tr?Math.round(tr.ch*10)/10:null})}else unpriced++;
        if(raw.frameType===2||raw.frameType===3) keep.push({tab:t.name,x:raw.x,y:raw.y,raw});
      }
      byTab[t.name]=sum;total+=sum;
      listedAll.push(...listedFrom(r.data,t.name));
    }
    top.sort((a,b)=>b.v-a.v);
    if(!ACCT.err) recordSales(listedAll,P);
    const snap={t:Date.now(),total,byTab,div:P.div,priced,unpriced,top:top.slice(0,25)};
    S.netWorth=(S.netWorth||[]).concat([{t:snap.t,total,div:P.div}]).slice(-300);
    S.netLatest=snap;save();setTimeout(renderRecipes,0);
    ACCT.stashItems=keep;try{await idbSet("stashItems",keep.map(k=>({tab:k.tab,x:k.x,y:k.y,raw:k.raw})))}catch(e){}
    ACCT.busy=null;
    if(!auto&&S.netWorth.length>1){const prev=S.netWorth[S.netWorth.length-2];DESK.notify({kind:"milestones",title:"Net worth updated",body:`${fmt(total)}c (${total>=prev.total?"+":""}${fmt(total-prev.total)}c since last snapshot)`})}
  }finally{ACCT.snapBusy=false;ACCT.busy=null;renderAccount()}
}
function startNetTimer(){clearInterval(ACCT.netTimer);const m=+S.netEvery||0;if(m>0)ACCT.netTimer=setInterval(()=>snapshotNetWorth(true),m*60e3)}
function lineChart(points,{w=560,h=160,fmtY=v=>fmt(v)+"c"}={}){
  if(points.length<2) return '<p class="small muted" style="margin:0">Take two or more snapshots to see a trend.</p>';
  const xs=points.map(p=>p.t),ys=points.map(p=>p.v);
  const x0=Math.min(...xs),x1=Math.max(...xs),y0=Math.min(...ys)*0.95,y1=Math.max(...ys)*1.05||1;
  const X=t=>40+(t-x0)/(x1-x0||1)*(w-50),Y=v=>h-22-(v-y0)/(y1-y0||1)*(h-34);
  const path=points.map((p,i)=>`${i?"L":"M"}${X(p.t).toFixed(1)},${Y(p.v).toFixed(1)}`).join("");
  const last=points[points.length-1];
  const grid=[0,0.5,1].map(f=>{const v=y0+(y1-y0)*f;return `<line x1="40" x2="${w-10}" y1="${Y(v)}" y2="${Y(v)}" stroke="var(--line)" stroke-dasharray="3 3"/><text x="36" y="${Y(v)+4}" text-anchor="end" font-size="10" fill="var(--muted)">${fmtY(v)}</text>`}).join("");
  return `<svg viewBox="0 0 ${w} ${h}" width="100%" role="img" aria-label="Trend chart">${grid}<path d="${path} L${X(last.t)},${h-22} L${X(points[0].t)},${h-22} Z" fill="var(--gold)" opacity=".12"/><path d="${path}" fill="none" stroke="var(--gold)" stroke-width="2"/><circle cx="${X(last.t)}" cy="${Y(last.v)}" r="4" fill="var(--gold)"/><text x="40" y="${h-6}" font-size="10" fill="var(--muted)">${new Date(x0).toLocaleDateString()}</text><text x="${w-10}" y="${h-6}" font-size="10" fill="var(--muted)" text-anchor="end">${new Date(x1).toLocaleString()}</text></svg>`;
}
// net worth history for a range, in divines (each snapshot's own divine price) or chaos
function netSeries(range,unit){
  const span={day:864e5,week:7*864e5}[range];const now=Date.now();
  const pts=(S.netWorth||[]).filter(p=>!span||now-p.t<=span).map(p=>({t:p.t,v:unit==="div"&&p.div?p.total/p.div:p.total}));
  const fmtv=unit==="div"?(v=>(Math.abs(v)>=100?Math.round(v):v.toFixed(1))+" div"):(v=>fmt(v)+"c");
  if(pts.length<2)return {points:pts,delta:null,perDay:null,fmt:fmtv};
  const d=pts[pts.length-1].v-pts[0].v,days=(pts[pts.length-1].t-pts[0].t)/864e5;
  return {points:pts,delta:d,perDay:days>=0.5?d/days:null,fmt:fmtv};
}
function renderNetWorth(){
  const el=$("acctNet");if(!el) return;
  const L=S.netLatest, hist=S.netWorth||[];
  el.innerHTML=`<div class="row" style="justify-content:space-between"><h2>Net worth</h2>${L?`<span class="big num" style="font-size:1.8rem">${L.div?(L.total/L.div).toFixed(1)+" div":fmt(L.total)+"c"}</span>`:""}</div>
    ${L?`<p class="small muted" style="margin:0">${fmt(L.total)}c · ${L.priced} priced items${L.unpriced?`, ${L.unpriced} without a price`:""} · ${new Date(L.t).toLocaleString()}</p>`:""}
    ${(()=>{const nw=netSeries(S.nwRange||"week",S.nwUnit||"div");return `<div class="row" style="justify-content:space-between"><div class="seg" role="group" aria-label="Range">${[["day","24 h"],["week","7 days"],["all","All"]].map(([k,l])=>`<button data-nwr="${k}" aria-pressed="${(S.nwRange||"week")===k}">${l}</button>`).join("")}</div>
      <div class="seg" role="group" aria-label="Unit">${[["div","Divines"],["chaos","Chaos"]].map(([k,l])=>`<button data-nwu="${k}" aria-pressed="${(S.nwUnit||"div")===k}">${l}</button>`).join("")}</div></div>
      ${nw.delta!=null?`<p class="small" style="margin:0"><span class="delta ${nw.delta>=0?"pos":"neg"}">${nw.delta>=0?"+":""}${nw.fmt(nw.delta)}</span> <span class="muted">over this range${nw.perDay!=null?` · about ${nw.perDay>=0?"+":""}${nw.fmt(nw.perDay)} a day`:""}</span></p>`:""}
      ${lineChart(nw.points,{fmtY:nw.fmt})}`})()}
    <div class="row"><button class="btn primary" id="nwSnap"${ACCT.snapBusy?" disabled":""}>${ACCT.snapBusy?"Working…":"Take snapshot"}</button><button class="btn ghost" id="nwTabs">${ACCT.tabs?"Reload tabs":"Choose tabs"}</button>
      <label class="small row">Auto<select id="nwEvery">${[[0,"Off"],[30,"30 min"],[60,"1 hour"]].map(([v,t])=>`<option value="${v}"${(+S.netEvery||0)===v?" selected":""}>${t}</option>`).join("")}</select></label></div>
    ${ACCT.busy&&ACCT.snapBusy?`<p class="small muted" style="margin:0">${esc(ACCT.busy)}</p>`:""}
    ${ACCT.tabs?`<details class="small"><summary style="cursor:pointer">Tabs to include (${ACCT.tabs.filter(t=>S.netTabs[t.id]!==false).length}/${ACCT.tabs.length})</summary><div style="display:grid;gap:2px;margin-top:6px;max-height:200px;overflow:auto">${ACCT.tabs.map(t=>`<label class="row"><input type="checkbox" data-nt="${esc(t.id)}"${S.netTabs[t.id]!==false?" checked":""}> ${esc(t.name)} <span class="muted">${esc(t.type||"")}</span></label>`).join("")}</div></details>`:""}
    ${L&&L.top.length?`<details class="small"><summary style="cursor:pointer">Most valuable items</summary><div class="tw"><table><thead><tr><th>Item</th><th>Tab</th><th>Value</th><th>7 days</th></tr></thead><tbody>${L.top.map(x=>`<tr><td>${x.icon&&DESK?`<img src="${esc(x.icon)}" alt="" class="ico">`:""}${x.qty>1?x.qty+"× ":""}${esc(x.name)}</td><td>${esc(x.tab)}</td><td class="num">${fmt(x.v)}c</td><td>${x.tr!=null?trendHtml({ch:x.tr,data:[]}):""}</td></tr>`).join("")}</tbody></table></div></details>`:""}
    ${L?`<details class="small"><summary style="cursor:pointer">By tab</summary><ul class="clean" style="margin-top:6px">${Object.entries(L.byTab).sort((a,b)=>b[1]-a[1]).map(([k,v])=>`<li class="row" style="justify-content:space-between"><span>${esc(k)}</span><span class="num">${fmt(v)}c</span></li>`).join("")}</ul></details>`:""}
    <p class="note" style="margin:0">Values use poe.ninja prices for currency, fragments, cards, essences and similar, uniques and gems. Rares aren't valued (see Stash finds). Reading tabs is slow on purpose: GGG limits how fast stash data can be fetched.</p>`;
  $("nwSnap").onclick=()=>snapshotNetWorth(false);
  el.querySelectorAll("[data-nwr]").forEach(b=>b.onclick=()=>{S.nwRange=b.dataset.nwr;save();renderNetWorth()});
  el.querySelectorAll("[data-nwu]").forEach(b=>b.onclick=()=>{S.nwUnit=b.dataset.nwu;save();renderNetWorth()});
  $("nwTabs").onclick=loadTabs;
  $("nwEvery").onchange=e=>{S.netEvery=+e.target.value;save();startNetTimer()};
  el.querySelectorAll("[data-nt]").forEach(c=>c.onchange=()=>{S.netTabs[c.dataset.nt]=c.checked;save();renderNetWorth()});
}
/* ---------- stash finds: upgrades for the goal build + things to sell ---------- */
const BASE_FAMILY=[["ring",/\bRing$/],["amulet",/Amulet$|Talisman$/],["belt",/Belt$|Sash$|Stygian Vise$/],["boots",/Boots$|Greaves$|Slippers$|Shoes$/],["gloves",/Gloves$|Gauntlets$|Mitts$|Bracers$/],["helmet",/Helmet$|Helm$|Hood$|Mask$|Cap$|Circlet$|Crown$|Burgonet$|Bascinet$|Tricorne$|Pelt$|Cage$|Sallet$|Coif$|Visage$|Hat$/],["shield",/Shield$|Buckler$|Bundle$|Spirit Shield$/],["quiver",/Quiver$/],["jewel",/Jewel$/],["flask",/Flask$/]];
const familyOf=base=>{const f=BASE_FAMILY.find(([,re])=>re.test(base||""));return f?f[0]:"other"};
function stashFinds(){
  const items=(ACCT.stashItems||[]).map(k=>({...k,it:apiItem(k.raw,"s")}));
  if(!items.length||!G) return {ups:[],sell:[]};
  const goal=slotItemsOf(G).filter(x=>x.item.rarity!=="UNIQUE"&&!/Flask/.test(x.slot));
  const ups=[];
  for(const g of goal){
    const fam=familyOf(g.item.base);
    const must=g.item.mods.filter(m=>!m.crafted).map(m=>({m,w:modWant(m.text)})).filter(x=>x.w.prio>=(/Weapon/.test(g.slot)?3:4));
    if(!must.length) continue;
    const cur=C?(slotItemsOf(C).find(x=>x.slot===g.slot)||{}).item:null;
    const score=it=>{const all=[...it.implicits,...it.mods];return must.filter(x=>all.some(y=>tmpl(y.text)===tmpl(x.m.text)&&(valOf(y.text)??0)>=(valOf(x.m.text)??0)*0.8)).length};
    const curScore=cur?score(cur):0;
    items.filter(s=>s.it.rarity==="RARE"&&(s.it.base===g.item.base||(fam!=="other"&&familyOf(s.it.base)===fam))).forEach(s=>{const sc=score(s.it);if(sc>=2&&sc>curScore)ups.push({slot:g.slot,s,sc,of:must.length,curScore})});
  }
  ups.sort((a,b)=>b.sc-a.sc);
  const sell=[];
  items.forEach(s=>{if(s.it.rarity!=="RARE")return;const good=[...s.it.implicits,...s.it.mods].filter(m=>modWant(m.text).prio>=4).length;if(good>=3&&!ups.some(u=>u.s===s))sell.push({s,good})});
  sell.sort((a,b)=>b.good-a.good);
  return {ups:ups.slice(0,20),sell:sell.slice(0,20)};
}
function renderStashFinds(){
  const el=$("acctFinds");if(!el) return;
  if(!ACCT.stashItems){el.innerHTML=`<h2>Stash finds</h2>${emptyBox("Take a net worth snapshot first. Then this lists rares in your stash that beat your current gear for the goal build, and rares worth price-checking to sell.",[["Take a snapshot","snapshot"]])}`;return}
  const f=stashFinds();
  const pos=s=>s.x!=null?` · left ${s.x+1}, top ${s.y+1}`:"";
  el.innerHTML=`<h2>Stash finds</h2>
    <h3>Upgrades for your goal build</h3>
    ${f.ups.length?`<ul class="clean small">${f.ups.map(u=>`<li class="sg"><div class="row" style="justify-content:space-between"><b class="t-rare">${u.s.it.icon&&DESK?`<img src="${esc(u.s.it.icon)}" alt="" class="ico">`:""}${esc(u.s.it.name)}</b><span class="pill good">${u.sc}/${u.of} key mods${u.curScore?` (now ${u.curScore})`:""}</span></div><div class="muted">${esc(u.slot)} · ${esc(u.s.it.base)} · tab "${esc(u.s.tab)}"${pos(u.s)}</div></li>`).join("")}</ul>`:'<p class="small muted" style="margin:0">Nothing in the snapshot beats your current gear on the guide\'s key mods.</p>'}
    <h3>Worth a price check</h3>
    ${f.sell.length?`<ul class="clean small">${f.sell.map(x=>`<li class="row" style="justify-content:space-between"><span><b class="t-rare">${esc(x.s.it.name)}</b> <span class="muted">${esc(x.s.it.base)} · "${esc(x.s.tab)}"${pos(x.s)}</span></span><span class="pill gold">${x.good} strong mods</span></li>`).join("")}</ul><p class="small muted" style="margin:0">Hover them in game and press Ctrl+C for a live price.</p>`:'<p class="small muted" style="margin:0">No standout rares found.</p>'}`;
}
/* ---------- currency trends (GGG currency exchange history) ---------- */
async function loadCurrencyTrends(){
  if(ACCT.cxBusy) return;ACCT.cxBusy=true;
  const lg=S.league||(LIVE.cfg&&LIVE.cfg.league);
  const nowH=Math.floor(Date.now()/3600e3);
  const series={};
  try{
    for(let h=24;h>=1;h--){
      const id=(nowH-h)*3600;ACCT.cxMsg=`Loading hour ${25-h} of 24…`;renderCurrencyTrends();
      const r=await DESK.currencyHour(id);
      if(!r.ok){ACCT.cxMsg=r.error;break}
      ((r.data&&r.data.markets)||[]).forEach(m=>{
        if(lg&&m.league&&m.league!==lg) return;
        const pair=m.market_pair||String(m.market_id||"").split("|");
        if(!pair.includes("chaos")) return;
        const other=pair.find(x=>x!=="chaos");const v=m.volume_traded||{};
        if(!other||!v.chaos||!v[other]) return;
        (series[other]=series[other]||[]).push({t:id*1000,v:v.chaos/v[other],vol:v.chaos});
      });
    }
    ACCT.cx=Object.entries(series).map(([k,pts])=>({k,pts,vol:pts.reduce((a,p)=>a+p.vol,0)})).sort((a,b)=>b.vol-a.vol).slice(0,12);
    if(ACCT.cx.length) ACCT.cxMsg=null; else if(!ACCT.cxMsg) ACCT.cxMsg="No chaos markets found for your league in the last 24 hours.";
  }finally{ACCT.cxBusy=false;renderCurrencyTrends()}
}
function spark(pts){if(pts.length<2)return"";const ys=pts.map(p=>p.v),a=Math.min(...ys),b=Math.max(...ys);const X=i=>i/(pts.length-1)*80,Y=v=>18-(v-a)/(b-a||1)*16;return `<svg viewBox="0 0 80 20" width="80" height="20" aria-hidden="true"><polyline points="${pts.map((p,i)=>X(i).toFixed(1)+","+Y(p.v).toFixed(1)).join(" ")}" fill="none" stroke="var(--gold)" stroke-width="1.5"/><circle cx="80" cy="${Y(ys[ys.length-1])}" r="2" fill="var(--gold)"/></svg>`}
function renderCurrencyTrends(){
  const el=$("acctCx");if(!el) return;
  const pretty=k=>k.replace(/[-_]/g," ").replace(/\b\w/g,c=>c.toUpperCase());
  el.innerHTML=`<h2>Currency trends</h2>
    <p class="small" style="margin:0">Hourly trade data from GGG's currency exchange for your league: what each currency has been worth in chaos over the last 24 hours.</p>
    <div class="row"><button class="btn" id="cxLoad"${ACCT.cxBusy?" disabled":""}>${ACCT.cx?"Refresh":"Load last 24 hours"}</button></div>
    ${ACCT.cxMsg?`<p class="small muted" style="margin:0">${esc(ACCT.cxMsg)}</p>`:""}
    ${ACCT.cx&&ACCT.cx.length?`<div class="tw"><table><thead><tr><th>Currency</th><th>Now</th><th>24h</th><th>Trend</th><th>Hint</th></tr></thead><tbody>${ACCT.cx.map(c=>{const a=c.pts[0].v,b=c.pts[c.pts.length-1].v,ch=(b-a)/a*100;return `<tr><td>${esc(pretty(c.k))}</td><td class="num">${b>=10?fmt(b):b.toFixed(2)}c</td><td class="num delta ${ch>=0?"pos":"neg"}">${ch>=0?"+":""}${ch.toFixed(1)}%</td><td>${spark(c.pts)}</td><td class="small muted">${ch>5?"Rising: hold if you can":ch<-5?"Falling: sell sooner":"Steady"}</td></tr>`}).join("")}</tbody></table></div>`:""}
    <p class="note" style="margin:0">Hints only look at the last 24 hours and aren't financial advice, even in Wraeclast.</p>`;
  $("cxLoad").onclick=loadCurrencyTrends;
}

/* ---------- atlas: notables per mechanic (all) + reading your tree (desktop, signed in) ---------- */
const STRAT_MECH={legion:"legion",abyss:"abyss",expedition:"expedition",ritual:"ritual",breach:"breach",harvest:"harvest",essence:"essence",strongbox:"strongbox",ultimatum:"ultimatum",blight:"blight",covens:null,unwavering:"threads"};
function atlasNodesFor(mech){return Object.entries(ATLAS).filter(([id,n])=>n[2]===mech&&(n[1]==="n"||n[1]==="k")).map(([id,n])=>({id,name:n[0],kind:n[1],stats:(n[3]||[]).map(stripTags)}))}
function renderAtlasTree(){
  const el=$("atlasTree");if(!el) return;
  const strat=STRATS.find(s=>s.id===S.strat)||primaryStrat();
  const mech=STRAT_MECH[strat.id];
  const have=new Set(S.atlasHashes||[]);
  const manual=S.atlasManual||{};
  const nodes=mech?atlasNodesFor(mech):[];
  const kst=Object.entries(ATLAS).filter(([,n])=>n[1]==="k").map(([id,n])=>({id,name:n[0],stats:(n[3]||[]).map(stripTags)}));
  const taken=id=>have.has(+id)||have.has(String(id))||manual[id];
  const counts={};(S.atlasHashes||[]).forEach(h=>{const n=ATLAS[h];if(n&&n[1]!=="m")counts[n[2]]=(counts[n[2]]||0)+1});
  const canRead=DESK&&ACCT.status&&ACCT.status.signedIn;
  el.innerHTML=`<h2>Atlas notables for ${esc(strat.name)}</h2>
    <p class="small muted" style="margin:0">From GGG's 3.30 atlas tree data. ${S.atlasHashes?`Read from your account ${new Date(S.atlasAt).toLocaleString()}: ${S.atlasHashes.length} points spent.`:"Tick the ones you've taken, or read your tree from your account (desktop app, GGG sign-in)."}</p>
    ${DESK?`<div class="row"><button class="btn" id="atRead"${canRead?"":" disabled"}>Read my atlas tree</button>${canRead?"":'<span class="small muted">Needs a GGG sign-in (Settings)</span>'}</div>`:""}
    ${S.atlasHashes&&Object.keys(counts).length?`<div class="row">${Object.entries(counts).sort((a,b)=>b[1]-a[1]).slice(0,8).map(([k,v])=>`<span class="pill ${k===mech?"good":""}">${esc(k)} ${v}</span>`).join("")}</div>`:""}
    ${nodes.length?`<ul class="clean small">${nodes.map(n=>`<li><label class="check ${taken(n.id)?"done":""}"><input type="checkbox" data-atl="${n.id}"${taken(n.id)?" checked":""}${have.size?" disabled":""}><div><div class="t"><b>${esc(n.name)}</b>${n.kind==="k"?' <span class="tag trial">keystone</span>':""}</div><div class="muted">${esc(n.stats.join(" "))}</div></div></label></li>`).join("")}</ul>`:`<p class="small muted" style="margin:0">${strat.id==="covens"?"Covens & Fates has no atlas cluster: it's the league mechanic.":"No dedicated notables for this one."}</p>`}
    <details class="small"><summary style="cursor:pointer">All keystones (${kst.length})</summary><ul class="clean" style="margin-top:6px">${kst.map(k=>`<li><b${taken(k.id)?' style="color:var(--good)"':""}>${esc(k.name)}</b> <span class="muted">${esc(k.stats.join(" "))}</span></li>`).join("")}</ul></details>`;
  el.querySelectorAll("[data-atl]").forEach(c=>c.onchange=()=>{S.atlasManual=S.atlasManual||{};S.atlasManual[c.dataset.atl]=c.checked;save();renderAtlasTree()});
  const rb=$("atRead");if(rb)rb.onclick=async()=>{rb.disabled=true;rb.textContent="Reading…";const r=await DESK.leagueAccount({league:S.league||(LIVE.cfg&&LIVE.cfg.league)});
    if(r.ok){const trees=(r.data&&r.data.atlas_passive_trees)||[];const t=trees[0]||{hashes:[]};S.atlasHashes=t.hashes||[];S.atlasAt=Date.now();save()}else{rb.textContent=r.error}
    renderAtlasTree()};
}

/* ---------- loot filter rules for the build (all; desktop writes the file) ---------- */
const q=s=>`"${String(s).replace(/"/g,"")}"`;
function filterRules(){
  if(!G) return "";
  const goal=slotItemsOf(G);
  const rareBases=[...new Set(goal.filter(x=>x.item.rarity!=="UNIQUE"&&!/Flask|jewel/i.test(x.slot)).map(x=>x.item.base).filter(Boolean))];
  const uniqueBases=[...new Set(goal.filter(x=>x.item.rarity==="UNIQUE").map(x=>x.item.base).filter(Boolean))];
  const have=C&&C!==G?new Set(currentSkills(C).flatMap(s=>s.gems.map(g=>gemNorm(g.name)))):new Set();
  const gems=[...new Set(buildGemList(G).filter(g=>!have.has(gemNorm(g.name))).map(g=>{const i=gemInfo(g.name);return i&&i.i!=null?GEMDB[i.i][0]:null}).filter(Boolean))];
  const L=[`# ===== Exile Companion: rules for ${G.ascend||G.className} (${T?T.main:mainSkillName(G)}) =====`,`# Generated ${new Date().toLocaleString()}. These come first so they win over the filter below.`,""];
  if(rareBases.length) L.push("# Goal build bases (rare, high item level)","Show",'\tRarity Rare',`\tBaseType == ${rareBases.map(q).join(" ")}`,"\tItemLevel >= 75","\tSetFontSize 45","\tSetBorderColor 201 164 92 255","\tSetBackgroundColor 40 30 15 240","\tPlayAlertSound 2 250","\tMinimapIcon 1 Yellow Star","\tPlayEffect Yellow","");
  if(rareBases.length) L.push("# Same bases for crafting (normal, item level 84+)","Show","\tRarity Normal",`\tBaseType == ${rareBases.map(q).join(" ")}`,"\tItemLevel >= 84","\tSetFontSize 40","\tSetBorderColor 201 164 92 200","\tMinimapIcon 2 Yellow Diamond","");
  if(uniqueBases.length) L.push("# Bases of the build's uniques","Show","\tRarity Unique",`\tBaseType == ${uniqueBases.map(q).join(" ")}`,"\tSetFontSize 45","\tSetBorderColor 175 96 37 255","\tSetBackgroundColor 50 25 10 240","\tPlayAlertSound 3 300","\tMinimapIcon 0 Orange Star","\tPlayEffect Orange","");
  if(gems.length) L.push("# Gems your character still needs","Show",'\tClass == "Skill Gems" "Support Gems"',`\tBaseType == ${gems.map(q).join(" ")}`,"\tSetFontSize 42","\tSetBorderColor 27 162 155 255","\tPlayAlertSound 6 200","\tMinimapIcon 1 Cyan Triangle","");
  L.push("# Campaign helpers: 4-links while levelling","Show","\tLinkedSockets >= 4","\tAreaLevel < 68","\tSetBorderColor 255 255 255 255","\tSetFontSize 40","",`# ===== end of Exile Companion rules =====`,"");
  return L.join("\n");
}
function renderFilterBuilder(){
  const el=$("shopFilter");if(!el) return;
  const rules=filterRules();
  el.innerHTML=`<h2>Loot filter for your build</h2>
    <p class="small" style="margin:0">Rules that make your goal build's bases, the uniques' bases and the gems you still need stand out with a border, sound and minimap icon. ${DESK?"Pick your usual filter and the app writes a combined copy into the game's filter folder.":"Copy them to the very top of your .filter file."}</p>
    ${DESK?`<div class="row"><label class="f" for="flBase" style="flex:1">Your current filter<select id="flBase"><option value="">Loading…</option></select></label></div>
      <div class="row"><button class="btn primary" id="flWrite">Write ExileCompanion.filter</button>${ACCT.status&&ACCT.status.signedIn?'<button class="btn" id="flUpload">Upload to my GGG account (private)</button>':""}</div>
      <p class="small muted" id="flMsg" style="margin:0">In game: Options → Game → Item Filter → choose <b>ExileCompanion</b>. Write it again whenever your build changes.</p>`:""}
    <details class="small"><summary style="cursor:pointer">Show the rules</summary>${copyBox("flRules","Paste at the top of any filter",rules)}</details>`;
  bindCopy(el);
  if(!DESK) return;
  DESK.listFilters().then(r=>{const s=$("flBase");if(!s)return;const files=r.files.filter(f=>!/^ExileCompanion/i.test(f.name));s.innerHTML=files.length?files.map(f=>`<option value="${esc(f.name)}"${f.name===S.filterBase?" selected":""}>${esc(f.name)}</option>`).join(""):'<option value="">No filters found: rules only</option>';ACCT.filterDir=r.dir});
  $("flBase").onchange=e=>{S.filterBase=e.target.value;save()};
  $("flWrite").onclick=async()=>{
    const base=$("flBase").value;let text=rules;
    if(base){const r=await DESK.readFilter(base);if(!r.ok){$("flMsg").textContent=r.error;return}text=rules+"\n# ===== "+base+" =====\n"+r.data}
    const w=await DESK.writeFilter("ExileCompanion.filter",text);
    $("flMsg").innerHTML=w.ok?`Saved to <span class="code" style="display:inline;padding:1px 4px">${esc(w.data)}</span>. In game: Options → Game → Item Filter → <b>ExileCompanion</b>. If it's already selected, type <b>/reloaditemfilter</b> in chat.`:esc(w.error);
  };
  const up=$("flUpload");if(up)up.onclick=async()=>{
    const base=$("flBase").value;let text=rules;
    if(base){const r=await DESK.readFilter(base);if(r.ok)text=rules+"\n"+r.data}
    const list=await DESK.remoteFilters();const ex=list.ok?list.data.find(f=>f.filter_name==="Exile Companion"):null;
    const r=await DESK.saveRemoteFilter({id:ex&&ex.id,name:"Exile Companion",text});
    $("flMsg").textContent=r.ok?`Uploaded to your account${r.data&&r.data.validation&&r.data.validation.valid===false?" (GGG says it has errors: check it in game)":""}. Pick "Exile Companion" in game.`:r.error;
  };
}

/* ---------- trades (log whispers) ----------
   Incoming requests (people buying from you) and outgoing ones (you buying), read from Client.txt.
   Every button only copies text for you to paste in game: the app never types or sends anything. */
const TRADES=[],BUYS=[];
const CUR_CODE={chaos:"Chaos Orb",divine:"Divine Orb",exalted:"Exalted Orb",exa:"Exalted Orb",alch:"Orb of Alchemy",alt:"Orb of Alteration",fusing:"Orb of Fusing",chrome:"Chromatic Orb",regal:"Regal Orb",vaal:"Vaal Orb",annul:"Orb of Annulment",gcp:"Gemcutter's Prism",mirror:"Mirror of Kalandra",chance:"Orb of Chance",scour:"Orb of Scouring",regret:"Orb of Regret",blessed:"Blessed Orb",jew:"Jeweller's Orb"};
function unitPrice(P,name){if(!P||!name)return null;const n=CUR_CODE[String(name).toLowerCase()]||name;
  if(P.cur[n]!=null)return P.cur[n];if(P.ex[n]!=null)return P.ex[n];const l=(P.items[n]||[]).filter(x=>!x.links||x.links<5).sort((a,b)=>a.chaosValue-b.chaosValue)[0];return l?l.chaosValue:null}
// is the buyer's offer (bulk) or your own listing price (single item) in line with poe.ninja?
function fairHint(tr,P){
  if(!P)return null;
  const pay=(+String(tr.amount).replace(/,/g,""))*(unitPrice(P,tr.currency)??NaN);if(!isFinite(pay)||pay<=0)return null;
  let qty=1,name=tr.item;const m=String(tr.item).match(/^([\d.,]+) (.+)$/);if(tr.bulk&&m){qty=+m[1].replace(/,/g,"");name=m[2]}
  const each=unitPrice(P,name);if(each==null)return null;
  const worth=qty*each,r=pay/worth;
  if(tr.dir==="out")return r>1.15?{cls:"warn",text:`Paying ${Math.round((r-1)*100)}% over poe.ninja`}:r<0.85?{cls:"good",text:`${Math.round((1-r)*100)}% under poe.ninja`}:{cls:"",text:"Close to poe.ninja"};
  return tr.bulk?(r<0.85?{cls:"bad",text:`Offer is ${Math.round((1-r)*100)}% under poe.ninja`}:r>1.15?{cls:"good",text:`${Math.round((r-1)*100)}% over poe.ninja`}:{cls:"",text:"Fair (close to poe.ninja)"})
    :(r<0.75?{cls:"warn",text:`Your price is ${Math.round((1-r)*100)}% under poe.ninja (~${fmt(worth)}c)`}:null);
}
const DEFAULT_REPLIES=[{l:"One moment",t:"@{name} One moment please, finishing a map."},{l:"Thanks",t:"@{name} Thanks, good luck!"}];
const fillReply=(t,tr)=>String(t).replace(/\{name\}/g,tr.name).replace(/\{item\}/g,tr.item).replace(/\{price\}/g,`${tr.amount} ${tr.currency}`);
function onTradeEvents(evs){
  let changed=false;
  for(const e of evs){
    if(e.type==="whisper"&&e.trade&&e.dir==="in"){TRADES.unshift({name:e.name,t:e.t,...e.trade,dir:"in",joined:false,state:"new"});changed=true}
    else if(e.type==="whisper"&&e.trade&&e.dir==="out"){if(!BUYS.some(x=>x.name===e.name&&x.item===e.trade.item&&Date.now()-x.t<10*60e3)){BUYS.unshift({name:e.name,t:e.t,...e.trade,dir:"out"});changed=true}}
    else if(e.type==="join"){const tr=TRADES.find(x=>x.name===e.name&&Date.now()-x.t<30*60e3);if(tr){tr.joined=true;changed=true;DESK.notify({kind:"trades",title:`${e.name} is here`,body:`Buyer for ${tr.item} joined your area.`})}}
  }
  TRADES.splice(12);BUYS.splice(8);
  if(changed){renderTrades();publishOverlay();if(DESK&&typeof ninjaPrices==="function")ninjaPrices(false).then(P=>{[...TRADES,...BUYS].forEach(t=>{if(t.hint===undefined)t.hint=fairHint(t,P)});renderTrades()}).catch(()=>{})}
}
function tradeCmds(tr){
  const own=(S.tradeReplies||DEFAULT_REPLIES).filter(r=>r&&r.l&&r.t).map(r=>[r.l,fillReply(r.t,tr)]);
  if(tr.dir==="out")return [["Visit hideout",`/hideout ${tr.name}`],["Still for sale?",`@${tr.name} Hi, is your ${tr.item} still for sale?`],["Thanks",`@${tr.name} Thanks!`]];
  return [["Invite",`/invite ${tr.name}`],["Trade",`/tradewith ${tr.name}`],["Sold",`@${tr.name} Sorry, that item is sold.`],["Kick",`/kick ${tr.name}`],...own];
}
function tradeLi(t,i,list){return `<li class="sg"><div class="row" style="justify-content:space-between"><b>${esc(t.name)}</b>${t.joined?'<span class="pill good">in your area</span>':`<span class="muted">${new Date(t.t).toLocaleTimeString()}</span>`}</div>
  <div>${esc(t.item)} · <b>${esc(t.amount)} ${esc(t.currency)}</b>${t.tab?` <span class="muted">· "${esc(t.tab)}" left ${t.left}, top ${t.top}</span>`:""}</div>
  ${t.hint?`<div class="small" style="color:var(--${t.hint.cls==="bad"?"bad":t.hint.cls==="warn"?"warn":t.hint.cls==="good"?"good":"muted"})">${esc(t.hint.text)}</div>`:""}
  <div class="row" style="margin-top:4px">${tradeCmds(t).map(([l,c],j)=>`<button class="btn ghost small" data-tc="${list}:${i}:${j}" title="${esc(c)}">${esc(l)}</button>`).join("")}<button class="btn ghost small" data-tx="${list}:${i}">Dismiss</button></div></li>`}
function renderTrades(){
  const el=$("deskTrades");if(!el) return;
  const reps=S.tradeReplies||DEFAULT_REPLIES;
  el.innerHTML=`<h2>Trade requests</h2>
    ${TRADES.length?`<ul class="clean small">${TRADES.map((t,i)=>tradeLi(t,i,"in")).join("")}</ul>`:'<p class="small muted" style="margin:0">Incoming trade whispers will show here with the item, price, stash position and quick replies.</p>'}
    ${BUYS.length?`<h3 style="margin:8px 0 0">You're buying</h3><ul class="clean small">${BUYS.map((t,i)=>tradeLi(t,i,"out")).join("")}</ul>`:""}
    <p class="small muted" style="margin:0">Buttons copy the command; paste it in game chat with Enter, Ctrl+V, Enter. The app never sends anything for you. Price hints compare with poe.ninja where it has a price.</p>
    <details class="small"><summary style="cursor:pointer">Quick replies</summary>
      <div class="rep-list">${reps.map((r,i)=>`<div class="row" style="flex-wrap:nowrap"><input type="text" value="${esc(r.l)}" data-repl="${i}" aria-label="Button label" style="width:110px"><input type="text" value="${esc(r.t)}" data-rept="${i}" aria-label="Message" style="flex:1"><button class="btn ghost small" data-repx="${i}" aria-label="Remove">✕</button></div>`).join("")}</div>
      <div class="row"><button class="btn ghost small" id="repAdd">Add reply</button><span class="muted">Use {name}, {item} and {price} in the message.</span></div></details>`;
  const listOf=k=>k==="out"?BUYS:TRADES;
  el.querySelectorAll("[data-tc]").forEach(b=>b.onclick=()=>{const [k,i,j]=b.dataset.tc.split(":");const t=listOf(k)[+i];DESK.copy(tradeCmds(t)[+j][1]);b.textContent="Copied"});
  el.querySelectorAll("[data-tx]").forEach(b=>b.onclick=()=>{const [k,i]=b.dataset.tx.split(":");const L=listOf(k),t=L.splice(+i,1)[0];renderTrades();publishOverlay();toast(`Dismissed ${t.name}'s ${k==="out"?"listing":"request"}.`,()=>{L.splice(+i,0,t);renderTrades();publishOverlay()})});
  const setReps=f=>{const r=(S.tradeReplies||DEFAULT_REPLIES).map(x=>({...x}));f(r);S.tradeReplies=r;save()};
  el.querySelectorAll("[data-repl]").forEach(x=>x.onchange=()=>setReps(r=>{r[+x.dataset.repl].l=x.value.trim().slice(0,24)}));
  el.querySelectorAll("[data-rept]").forEach(x=>x.onchange=()=>setReps(r=>{r[+x.dataset.rept].t=x.value.slice(0,240)}));
  el.querySelectorAll("[data-repx]").forEach(x=>x.onclick=()=>{setReps(r=>r.splice(+x.dataset.repx,1));renderTrades();el.querySelector("details").open=true});
  $("repAdd").onclick=()=>{setReps(r=>r.push({l:"Reply",t:"@{name} "}));renderTrades();el.querySelector("details").open=true};
}

/* ---------- vendor recipes (chaos / regal) from stash snapshots ---------- */
const WEAPON_CLASS=/^(Bow|Claw|Dagger|Rune Dagger|Wand|Sceptre|Staff|Warstaff|One Handed (Sword|Axe|Mace)|Two Handed (Sword|Axe|Mace)|Thrusting One Handed Sword|Fishing Rod)$/;
function recipeSlot(raw){
  const base=stripTags(raw.baseType||raw.typeLine||"");const fam=familyOf(base);
  if(["ring","amulet","belt","boots","gloves","helmet","shield"].includes(fam))return fam;
  const p0=raw.properties&&raw.properties[0]&&raw.properties[0].name;
  if(p0&&WEAPON_CLASS.test(p0))return /Two Handed|Bow|Staff|Warstaff/.test(p0)?"weapon2":"weapon1";
  const armourish=(raw.properties||[]).some(p=>/Armour|Evasion Rating|Energy Shield|Ward/.test(p.name));
  if(armourish&&raw.w===2&&raw.h===3)return "body";
  return null;
}
// how many full sets you can vendor, split into chaos (lowest piece ilvl 60-74) and regal (all 75+)
function recipeSets(items){
  const pieces=items.filter(x=>x&&x.slot&&x.ilvl>=60);
  const need=["helmet","body","gloves","boots","belt","amulet"];
  const pool=pieces.slice();const take=(slot,pred)=>{const i=pool.findIndex(x=>x.slot===slot&&pred(x));return i>=0?pool.splice(i,1)[0]:null};
  const sets=[];
  const tryBuild=(unidOnly)=>{const pred=x=>!unidOnly||x.unid;const snapshot=pool.slice();
    // prefer to spend one 60-74 piece per set and keep the rest high for regal sets later
    const set=[];const lowFirst=(slot)=>take(slot,x=>pred(x)&&x.ilvl<75)||take(slot,pred);
    for(const sl of need){const p=lowFirst(sl);if(!p){pool.splice(0,pool.length,...snapshot);return null}set.push(p)}
    const r1=lowFirst("ring"),r2=r1&&take("ring",pred);if(!r1||!r2){pool.splice(0,pool.length,...snapshot);return null}set.push(r1,r2);
    const w2=take("weapon2",pred);if(w2)set.push(w2);else{const a=take("weapon1",pred)||null;const b=a&&(take("weapon1",pred)||take("shield",pred));if(!a||!b){pool.splice(0,pool.length,...snapshot);return null}set.push(a,b)}
    return set};
  for(const unid of [true,false]){let s;while((s=tryBuild(unid)))sets.push({items:s,unid:s.every(x=>x.unid),regal:Math.min(...s.map(x=>x.ilvl))>=75})}
  const have={};pieces.forEach(x=>{have[x.slot]=(have[x.slot]||0)+1});
  const left={};pool.forEach(x=>{left[x.slot]=(left[x.slot]||0)+1});
  const missing=need.filter(sl=>!left[sl]);if((left.ring||0)<2)missing.push((left.ring||0)?"1 ring":"2 rings");
  if(!left.weapon2&&!((left.weapon1||0)+(left.shield||0)>=2&&left.weapon1))missing.push("weapon (a two-hander, or a one-hander with a shield or second one-hander)");
  return {sets,have,missing,chaos:sets.filter(s=>!s.regal),regal:sets.filter(s=>s.regal)};
}
function renderRecipes(){
  const el=$("acctRecipe");if(!el)return;
  const items=(ACCT.stashItems||[]).filter(k=>k.raw&&k.raw.frameType===2).map(k=>({slot:recipeSlot(k.raw),ilvl:k.raw.ilvl||0,unid:k.raw.identified===false,tab:k.tab}));
  if(!items.length){el.innerHTML=`<h2>Vendor recipes</h2>${emptyBox("Take a net worth snapshot first: the recipe tracker reads the rare items in the tabs you include.",[["Take snapshot","netSnap"]])}`;
    el.querySelectorAll('[data-fix="netSnap"]').forEach(b=>b.onclick=e=>{e.stopPropagation();snapshotNetWorth(false)});return}
  const r=recipeSets(items);
  const pay=s=>s.regal?(s.unid?"2 Regal Orbs":"1 Regal Orb"):(s.unid?"2 Chaos Orbs":"1 Chaos Orb");
  const chaosC=r.chaos.reduce((a,s)=>a+(s.unid?2:1),0),regalC=r.regal.reduce((a,s)=>a+(s.unid?2:1),0);
  const SLOTS=[["helmet","Helmets"],["body","Body armours"],["gloves","Gloves"],["boots","Boots"],["belt","Belts"],["amulet","Amulets"],["ring","Rings"],["weapon2","Two-handers"],["weapon1","One-handers"],["shield","Shields"]];
  const searches=[["Chaos pieces",'"rarity: rare" "item level: (6\\d|7[0-4])"'],["Regal pieces",'"rarity: rare" "item level: (7[5-9]|8\\d)"'],["Unidentified rares","\"rarity: rare\" unidentified"]];
  el.innerHTML=`<h2>Vendor recipes</h2>
    <p class="small muted" style="margin:0">Full sets of rare gear (item level 60+) sell to any vendor: lowest piece 60–74 for Chaos Orbs, all 75+ for Regal Orbs, doubled if every piece is unidentified. From your last snapshot of the tabs you include.</p>
    <div class="row"><div class="stat"><div class="k">Chaos sets</div><div class="v">${r.chaos.length}</div></div><div class="stat"><div class="k">Regal sets</div><div class="v">${r.regal.length}</div></div><div class="stat"><div class="k">Payout</div><div class="v small">${chaosC} chaos${regalC?` · ${regalC} regal`:""}</div></div></div>
    ${r.sets.length?`<p class="small" style="margin:0">${r.sets.map(s=>pay(s)).join(" · ")}</p>`:""}
    <p class="small" style="margin:0"><b>Next set needs:</b> ${r.missing.length?esc(r.missing.join(", ")):"nothing: you have another full set"}</p>
    <div class="row small">${SLOTS.map(([k,l])=>`<span class="pill">${l}: ${r.have[k]||0}</span>`).join("")}</div>
    <div class="row">${searches.map(([l,q],i)=>`<button class="btn ghost small" data-rcs="${i}" title="${esc(q)}">Copy search: ${l}</button>`).join("")}</div>
    <p class="small muted" style="margin:0">Paste a search into your stash's search box (Ctrl+F, Ctrl+V) to highlight those items. The 3.30 patch notes didn't mention the recipe, so this follows how it worked in 3.29.</p>`;
  el.querySelectorAll("[data-rcs]").forEach(b=>b.onclick=()=>{DESK.copy(searches[+b.dataset.rcs][1]);b.textContent="Copied"});
}

/* ---------- reminders (notifications) ---------- */
function reminderOnLevel(level){
  if(!DESK||!G) return;
  const act=(LIVE.zone&&LIVE.zone.act)||S.campAct||1;
  gemPlan(G).filter(p=>p.info&&p.info.lvl===level&&p.how!=="late"&&p.how!=="start").forEach(p=>DESK.notify({kind:"gems",title:`Level ${level}: ${p.info.name} is usable`,body:p.how==="quest"&&p.act>act?`It's a quest reward in Act ${p.act}.`:p.text}));
  G.specs.forEach((s,i)=>{const m=s.title.match(/(\d{1,3})/);if(m&&+m[1]===level)DESK.notify({kind:"gems",title:`Tree stage: ${s.title}`,body:"Your guide has a passive tree for this level. Open the Build tab to see it."})});
}
function reminderOnAct(act){
  if(!DESK) return;
  const A=CAMPAIGN[act-1];if(!A) return;
  const g=gemPlan(G).filter(p=>p.act===act&&(p.how==="quest"||p.how==="vendor")).map(p=>p.info.name);
  DESK.notify({kind:"acts",title:`Act ${act}`,body:`Aim for level ${A.lvl[0]}–${A.lvl[1]} at the boss.${g.length?" Gems: "+g.join(", ")+".":""}`});
}
function reminderOnMaps(){const n=S.session.maps.length;if([10,25,50,100,250,500].includes(n))DESK.notify({kind:"milestones",title:`${n} maps logged`,body:"Check Play → Session to see which farm pays best."})}

/* ---------- Discord presence ---------- */
let discordT=null,discordStart=Date.now();
function publishDiscord(){
  if(!DESK||!(LIVE.cfg&&LIVE.cfg.discordEnabled)) return;
  clearTimeout(discordT);discordT=setTimeout(()=>{
    const b=C||G,lvl=(S.logInfo&&S.logInfo.level)||b.level,z=LIVE.zone;
    let state="In town";
    if(z&&isMapId(z.id)) state=`Mapping: ${z.name}${LIVE.map&&LIVE.map.tier?` (T${LIVE.map.tier})`:""}`;
    else if(z&&isCampId(z.id)) state=`Act ${z.act}: ${z.name}`;
    else if(z&&/hideout/i.test(z.id)) state="In hideout";
    else if(z) state=z.name;
    DESK.discordActivity({details:`${b.ascend||b.className} · Level ${lvl}`,state,timestamps:{start:Math.floor(discordStart/1000)},instance:false});
  },4000);
}
function renderDiscordCard(){
  const el=$("deskDiscord");if(!el) return;const c=LIVE.cfg||{};
  el.innerHTML=`<h2>Discord & reminders</h2>
    <label class="row small"><input type="checkbox" id="dcOn"${c.discordEnabled?" checked":""}> Show my class, level and zone on Discord</label>
    <label class="f" for="dcId">Discord application ID<input type="text" id="dcId" value="${esc(c.discordAppId||"")}" placeholder="from discord.com/developers/applications"></label>
    <p class="small muted" style="margin:0">Create a free application named "Path of Exile" (or anything) at discord.com/developers, copy its Application ID here, and keep Discord open. ${LIVE.discord?`<b>${esc(LIVE.discord.message||"")}</b>`:""}</p>
    <h3>Notifications</h3>
    ${[["gems","Gem and tree reminders on level-up"],["acts","New act: target level and gems"],["trades","Trade whispers and buyers arriving"],["milestones","Map and net-worth milestones"]].map(([k,l])=>`<label class="row small"><input type="checkbox" data-nf="${k}"${!c.notify||c.notify[k]!==false?" checked":""}> ${l}</label>`).join("")}`;
  $("dcOn").onchange=async e=>{LIVE.cfg=await DESK.setConfig({discordEnabled:e.target.checked});publishDiscord();renderDiscordCard()};
  $("dcId").onchange=async e=>{LIVE.cfg=await DESK.setConfig({discordAppId:e.target.value.trim()});publishDiscord()};
  el.querySelectorAll("[data-nf]").forEach(cb=>cb.onchange=async()=>{const n={...(LIVE.cfg.notify||{})};n[cb.dataset.nf]=cb.checked;LIVE.cfg=await DESK.setConfig({notify:n})});
}

/* ---------- gear snapshot for the price window's upgrade check ---------- */
function publishGear(){
  if(!DESK) return;
  const b=C||G, t=b===C?TC:TG;
  const slots={};slotItemsOf(b).forEach(({slot,item})=>{slots[slot]={name:item.name,base:item.base,rarity:item.rarity,mods:[...item.implicits,...item.mods].map(m=>m.text)}});
  const goal={};slotItemsOf(G).forEach(({slot,item})=>{if(item.rarity!=="UNIQUE")goal[slot]=item.mods.filter(m=>!m.crafted).map(m=>({text:m.text,must:modWant(m.text).prio>=(/Weapon/.test(slot)?3:4)}))});
  const avoid=withBuild(liveB(),()=>avoidList().filter(m=>!S.avoidOff[m.id]).map(m=>({label:m.label,frag:m.frag})));
  DESK.publishGear({slots,goal,res:t?t.res:{},from:b===C?"current":"goal",name:b.ascend||b.className,avoid});
}
async function initAccount(){
  if(!DESK) return;
  $("acctTabBtn").hidden=false;syncNav();
  ACCT.status=await DESK.acctStatus();
  try{const raw=localStorage.getItem("ec330.liveChar");if(raw&&S.syncChar){const ch=JSON.parse(raw);const prev=C&&C!==G?C:null;C=buildFromCharacter(ch,prev);C.live.at=S.syncAt||Date.now();exC=false;reanalyze()}}catch(e){}
  try{const it=await idbGet("stashItems");if(it)ACCT.stashItems=it}catch(e){}
  DESK.onDiscordStatus(s=>{LIVE.discord=s;renderDiscordCard()});
  if(DESK.onStreamStatus)DESK.onStreamStatus(s=>{LIVE.stream=s;renderStreamCard()});
  if(DESK.onUpdate){DESK.onUpdate(s=>{LIVE.update={...(LIVE.update||{}),...s};renderUpdates()});DESK.updateStatus().then(s=>{LIVE.update=s;renderUpdates()})}
  startAlerts();setTimeout(()=>checkAlerts(false),5000);
  setTimeout(autoBackup,10000);setInterval(autoBackup,6*3600e3);
  refreshMapPool(false);
  setTimeout(()=>checkNews(false),15000);setInterval(()=>checkNews(false),30*60e3);
  setTimeout(()=>{cardIndex(false).then(()=>ninjaPrices(false)).then(p=>{CARD_P=p;publishOverlay()}).catch(()=>{})},20000);
  startAutoSync();startNetTimer();
  if(S.syncChar&&+S.syncEvery>0) syncCharacter(null,true);
  renderAll();
}


/* ================= QOL: recaps, level timing, alerts, sales, notes, sync, stream ================= */
