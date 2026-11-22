// Exile Companion main window, part 2 of 10: header and build, maps, atlas, crafting, campaign and shopping list pages.
// Classic scripts loaded in order by index.html; they share one global scope, so order matters.
"use strict";
/* ---------------- render: header & build ---------------- */
function renderHeader(){
  $("exampleBanner").hidden=!(exG||(C&&exC));
  const chip=(b,t,ex,cls,slot,label)=>b?`<button class="bchip ${cls}" data-imp="${slot}"><span>${label}:</span> <b>${esc(b.ascend||b.className)}</b> · Lv ${b.level} · ${esc(t.main)}${ex?' <span class="pill warn">example</span>':""}</button>`:`<button class="bchip empty" data-imp="${slot}">+ Add ${label.toLowerCase()} build</button>`;
  $("buildchip").innerHTML=chip(G,TG,exG,"goal","goal","Goal")+chip(C,TC,exC,"","current","Current");
  if(typeof charChipHtml==="function"){const cc=$("charChip");cc.innerHTML=charChipHtml();const cb=$("charBtn");if(cb)cb.onclick=()=>$("charMenu")?closeCharMenu():openCharMenu(cb)}
  document.querySelectorAll("[data-imp]").forEach(b=>b.onclick=()=>openImport(b.dataset.imp));
}
function sel(id,opts,cur,label){
  if(opts.length<2) return "";
  return `<label class="f" for="${id}">${label}<select id="${id}">${opts.map(o=>`<option value="${o.v}"${o.v==cur?" selected":""}>${esc(o.t)}</option>`).join("")}</select></label>`;
}
function renderBuild(){
  const sp=currentSpec(B);
  const st=B.stats;
  const viewSeg=C?`<div class="row"><span class="small muted">Showing</span><div class="seg" id="segView"><button aria-pressed="${B===G}" data-v="goal">Goal build</button><button aria-pressed="${B===C}" data-v="current">Current character</button></div></div>`:"";
  $("buildSummary").innerHTML=viewSeg+`
    <div class="row" style="justify-content:space-between"><h2>${esc(B.ascend||B.className)} <span class="muted small">Level ${B.level}</span></h2>
    <span class="pill gold">${esc(T.minion?"Minions":T.totem?"Totems":T.trap?"Traps/Mines":T.dot?"Damage over time":"Hits")}</span></div>
    <div class="stats">
      <div class="stat"><div class="k">Main skill</div><div class="v" style="font-size:1rem">${esc(T.main)}</div></div>
      <div class="stat"><div class="k">DPS</div><div class="v num">${fmt(T.dps)}</div></div>
      <div class="stat"><div class="k">Life</div><div class="v num">${fmt(T.life)}</div></div>
      <div class="stat"><div class="k">Energy shield</div><div class="v num">${fmt(T.es)}</div></div>
    </div>
    <div class="fgrid">
      ${sel("selSpec",B.specs.map((s,i)=>({v:i+1,t:s.title})),B.activeSpec,"Tree stage")}
      ${sel("selSkill",B.skillSets.map(s=>({v:s.id,t:s.title})),B.activeSkillSet,"Skill set")}
      ${sel("selItems",B.itemSets.map(s=>({v:s.id,t:s.title})),B.activeItemSet,"Item set")}
    </div>
    ${sp?`<p class="small muted" style="margin:0">${sp.nodes} passives allocated · tree ${esc(sp.version.replace("_","."))}${sp.url&&!isExample?` · <a href="${esc(sp.url)}" target="_blank" rel="noopener">Open tree on pathofexile.com</a>`:""}</p>`:""}
    <div class="row"><span class="pill">Damage: ${esc(T.elems.join(", "))}</span>${T.curses?'<span class="pill">Uses curses/marks</span>':""}${T.leech?'<span class="pill">Leech</span>':""}${T.charges?'<span class="pill">Charges</span>':""}</div>`;
  const rp=(k,v)=>{const cls=v==null?"":k==="chaos"?(v>=0?"good":v>=-30?"warn":"bad"):(v>=75?"good":v>=60?"warn":"bad");return `<div class="stat"><div class="k">${k}</div><div class="v num"><span class="pill ${cls}" style="font-size:1rem">${v==null?"?":v+"%"}</span></div></div>`};
  $("buildDefence").innerHTML=`<h2>Defences</h2>
    <div class="stats">${rp("fire",T.res.fire)}${rp("cold",T.res.cold)}${rp("lightning",T.res.lightning)}${rp("chaos",T.res.chaos)}</div>
    <div class="stats">
      <div class="stat"><div class="k">Effective HP</div><div class="v num">${fmt(T.ehp)}</div></div>
      <div class="stat"><div class="k">Armour</div><div class="v num">${fmt(st.Armour)}</div></div>
      <div class="stat"><div class="k">Evasion</div><div class="v num">${fmt(st.Evasion)}</div></div>
      <div class="stat"><div class="k">Suppression</div><div class="v num">${st.SpellSuppressionChance!=null?st.SpellSuppressionChance+"%":"–"}</div></div>
    </div>
    <div class="row"><span class="pill ${T.tank===3?"good":T.tank===2?"warn":"bad"}">Toughness: ${["","fragile","solid","very tanky"][T.tank]}</span><span class="pill ${T.boss===3?"good":T.boss===2?"warn":"bad"}">Bossing: ${["","low","mid","high"][T.boss]}</span></div>
    <p class="note" style="margin:0">Numbers come straight from your PoB export, so they reflect whatever config (charges, flasks, buffs) was on when you exported.</p>`;
  const sk=currentSkills(B);
  $("buildSkills").innerHTML=`<h2>Skills & links</h2>`+(sk.length?sk.filter(s=>s.gems.length).map((s,i)=>`
    <div class="sg ${sk.indexOf(s)===B.mainSocketGroup-1?"main":""}"><h4>${esc(s.label||s.slot||"Group "+(i+1))}${s.slot&&s.label?` · ${esc(s.slot)}`:""}${!s.enabled?" · disabled":""}</h4>
    ${s.gems.map(g=>`<div class="gem"><span${g.enabled?"":' class="muted"'}>${esc(g.name)}</span><span class="muted num small">${g.level}/${g.quality}</span></div>`).join("")}</div>`).join(""):'<p class="muted">No skills in this export.</p>');
  $("buildGear").innerHTML=`<h2>Gear</h2><div style="display:grid;gap:6px">${gearButtons("gear")}</div><p class="note" style="margin:0">Tap an item to open its crafting plan.</p>`;
  $("buildNotes").innerHTML=`<h2>Guide notes</h2>${B.notes?`<div style="white-space:pre-wrap;max-height:320px;overflow:auto" class="small">${esc(B.notes)}</div>`:'<p class="muted" style="margin:0">This build has no notes. Guide authors often put leveling steps and gear priorities here.</p>'}`;
  const sv=$("segView");if(sv)sv.onclick=e=>{const v=e.target.dataset.v;if(v){S.view=v;save();renderBuild();bindItems()}};
  const tgt=B;
  ["selSpec","selSkill","selItems"].forEach(id=>{const el=$(id);if(el)el.onchange=()=>{const v=+el.value;if(id==="selSpec")tgt.activeSpec=v;if(id==="selSkill")tgt.activeSkillSet=v;if(id==="selItems")tgt.activeItemSet=v;reanalyze();renderAll()}});
}
function slotItems(){
  const out=currentSlots(B).map(s=>({slot:s.name,item:B.items[s.itemId]})).filter(x=>x.item);
  const sp=currentSpec(B);
  if(sp) sp.jewels.forEach((id,i)=>{if(B.items[id]) out.push({slot:"Tree jewel "+(i+1),item:B.items[id]})});
  return out;
}
function gearButtons(prefix){
  const list=slotItems();
  if(!list.length) return '<p class="muted">No items in this export.</p>';
  return list.map(({slot,item},i)=>`<button class="item ${item.rarity}${selectedItem===item.id?" sel":""}" data-item="${esc(item.id)}" data-tipb="${B===C?"c":"g"}" data-slot="${esc(slot)}"><span class="slot">${esc(slot)}</span><span class="nm">${item.icon&&window.exileDesktop?`<img src="${esc(item.icon)}" alt="" class="ico">`:""}${esc(item.name)}</span>${item.base&&item.base!==item.name?`<span class="small muted">${esc(item.base)}</span>`:""}</button>`).join("");
}

/* ---------------- render: maps ---------------- */
function avoidList(){return MAPMODS.filter(m=>m.when(T))}
// map mods you marked in the price popup (warning / danger), kept in their own storage key
function renderMapMarks(){
  const host=document.querySelector('[data-avoid]')&&document.querySelector('[data-avoid]').closest(".card");if(!host)return;
  let box=$("mapMarks");if(!box){box=document.createElement("div");box.id="mapMarks";host.appendChild(box)}
  let marks={};try{marks=JSON.parse(localStorage.getItem("ec330.mapMarks")||"{}")||{}}catch(e){}
  const list=Object.entries(marks).sort((a,b)=>(a[1].v===b[1].v?0:a[1].v==="danger"?-1:1));
  box.innerHTML=`<h3 style="margin:10px 0 4px">Mods you marked</h3>${list.length?`<ul class="clean">${list.map(([k,m])=>`<li class="row" style="justify-content:space-between;flex-wrap:nowrap"><span class="small" style="color:${m.v==="danger"?"var(--bad)":"var(--warn)"}">${m.v==="danger"?"⛔":"⚠"} ${esc(m.text||k)}</span><button class="btn ghost small" data-unmark="${esc(k)}" aria-label="Remove mark">✕</button></li>`).join("")}</ul>`:'<p class="small muted" style="margin:0">None yet. Ctrl+C a map in game and click any mod in the price window to mark it as a warning or danger for every map.</p>'}`;
  box.querySelectorAll("[data-unmark]").forEach(b=>b.onclick=()=>{delete marks[b.dataset.unmark];try{localStorage.setItem("ec330.mapMarks",JSON.stringify(marks))}catch(e){}renderMapMarks()});
}
function renderMaps(){
  const done=PROGRESS.filter(p=>S.progress[p.id]).length;
  const next=PROGRESS.find(p=>!S.progress[p.id]);
  const strat=STRATS.find(s=>s.id===S.strat)||primaryStrat();
  const tt=Object.entries(strat.threads);
  $("mapsNext").innerHTML=`<h2>Your next move</h2>
    ${next?`<div class="check"><input type="checkbox" id="nextChk" aria-label="Mark done"><div><div class="t"><b>${esc(next.t)}</b></div><div class="small muted">${esc(next.tip)}</div>${gateHtml(next)}</div></div>`:'<p>Every milestone is done. Push Uber bosses or min-max your farm.</p>'}
    <h3>Map device setup</h3>
    <p class="small" style="margin:0">Farming <b>${esc(strat.name)}</b> (change it on the Atlas tab).</p>
    ${tt.length?`<div class="threads">${tt.map(([k,v])=>`<span class="thread">${v}× ${esc(k)} Thread</span>`).join("")}</div>`:'<p class="small muted" style="margin:0">No Threads needed: this content spawns in maps through your atlas tree. Add any Thread you have spare for extra loot.</p>'}
    <ol class="steps small">
      <li>${tt.length?`Run maps inside the <b>${esc(tt[0][0])}</b> Shaped Region for free Threads of that type.`:"Run maps inside any Shaped Region: the free Threads add loot on top of your farm."}</li>
      <li>Finish the region's objective: every other map in that region gets +1 free Thread.</li>
      <li>Use an Astrolabe to place a new ${esc(tt[0]?tt[0][0]+" ":"")}region on a map you want to run. Astrolabe regions start with more free Threads.</li>
      <li>Roll maps with the avoid-regex below, then add Threads. Up to 8 per map; more Threads raise the chance of transformative effects.</li>
    </ol>
    <p class="small muted" style="margin:0">${done}/${PROGRESS.length} milestones done.</p>`;
  const nx=$("nextChk");if(nx)nx.onchange=()=>{S.progress[next.id]=true;save();renderMaps()};
  const av=avoidList();
  const active=av.filter(m=>!S.avoidOff[m.id]);
  const rx=active.map(m=>m.frag);
  const regex=rx.length?`"!${rx.join("|")}"`:"";
  $("mapsDanger").innerHTML=`<h2>Map mods to avoid</h2>
    <p class="small muted" style="margin:0">Picked from your build. Untick any you're fine with.</p>
    <ul class="clean">${av.map(m=>`<li><label class="check"><input type="checkbox" data-avoid="${m.id}"${S.avoidOff[m.id]?"":" checked"}><div><div class="t">${esc(m.label)}</div><div class="small muted">${esc(typeof m.why==="function"?m.why(T):m.why)}</div></div></label></li>`).join("")}</ul>
    <label class="f" for="regexOut">Stash search regex (paste into the map stash search box)</label>
    <div class="code" id="regexOut">${esc(regex||"Nothing to avoid")}</div>
    <div class="row"><button class="btn" id="copyRegex">Copy regex</button><span class="small muted" id="copyMsg" role="status"></span></div>
    <p class="note" style="margin:0">Map mod wording can shift between patches. Test the regex on one map tab first; maps that stay highlighted are safe to run.</p>`;
  document.querySelectorAll("[data-avoid]").forEach(c=>c.onchange=()=>{S.avoidOff[c.dataset.avoid]=!c.checked;save();renderMaps()});
  renderMapMarks();
  $("copyRegex").onclick=async()=>{try{await navigator.clipboard.writeText(regex);$("copyMsg").textContent="Copied."}catch(e){$("copyMsg").textContent="Copy blocked: select the text and copy it manually."}};
  $("mapsProgress").innerHTML=`<h2>Atlas progression</h2>
    <ul class="clean">${PROGRESS.map(p=>`<li><label class="check ${S.progress[p.id]?"done":""}"><input type="checkbox" data-prog="${p.id}"${S.progress[p.id]?" checked":""}><div style="flex:1"><div class="t">${esc(p.t)}</div><div class="small muted">${esc(p.tip)}</div>${gateHtml(p)}</div></label></li>`).join("")}</ul>
    <div class="row small"><span class="muted">Loot filters:</span><a href="https://www.filterblade.xyz/" target="_blank" rel="noopener">FilterBlade</a><a href="https://github.com/NeverSinkDev/NeverSink-Filter" target="_blank" rel="noopener">NeverSink's filter</a><span class="muted">· Labyrinth:</span><a href="https://www.poelab.com/" target="_blank" rel="noopener">poelab.com</a></div>
    <p class="note" style="margin:0">Tip: move to a stricter filter level as you enter red maps so only valuable drops show. Readiness checks are rules of thumb based on your imported DPS and life/ES. Re-import as you upgrade and they update.</p>`;
  document.querySelectorAll("[data-prog]").forEach(c=>c.onchange=()=>{S.progress[c.dataset.prog]=c.checked;save();renderMaps()});
  renderMapCompletion();renderBosses();
}
function gateHtml(p){const g=p.gate(T);if(!g.msg)return"";return `<div style="margin-top:4px"><span class="pill ${g.ok?"good":"warn"}">${g.ok?"Ready":"Not yet"} · ${esc(g.msg)}</span></div>`}

/* ---------------- render: atlas ---------------- */
function rankStrats(){
  const have={clear:S.clear,boss:T.boss,tank:T.tank};
  return STRATS.map(s=>{
    let gaps=0;
    for(const k of ["clear","boss","tank"]){const gap=s.need[k]-have[k];if(gap>0)gaps+=gap}
    if(s.budget>S.budget) gaps+=1.5;
    const score=10-gaps*3+s.pay*1.5-(s.layer?2:0);
    const fit=gaps===0?"good":gaps<=1?"ok":"bad";
    return {s,score,fit};
  }).sort((a,b)=>b.score-a.score);
}
function primaryStrat(){return (rankStrats().find(r=>!r.s.layer)||rankStrats()[0]).s}
function renderAtlas(){
  $("atlasProfile").innerHTML=`<h2>Farming profile</h2>
    <p class="small muted" style="margin:0">Bossing and toughness come from your build. Set clear speed and budget yourself, since PoB can't measure them.</p>
    <div class="row">
      <span class="pill ${T.boss===3?"good":T.boss===2?"warn":"bad"}">Bossing: ${["","low","mid","high"][T.boss]} (${fmt(T.dps)} DPS)</span>
      <span class="pill ${T.tank===3?"good":T.tank===2?"warn":"bad"}">Toughness: ${["","fragile","solid","very tanky"][T.tank]}</span>
    </div>
    <div class="row">
      <span class="small">Clear speed</span><div class="seg" id="segClear">${["Slow","Average","Zoomy"].map((l,i)=>`<button aria-pressed="${S.clear===i+1}" data-v="${i+1}">${l}</button>`).join("")}</div>
      <span class="small">Budget</span><div class="seg" id="segBudget">${["League start","Mid","Rich"].map((l,i)=>`<button aria-pressed="${S.budget===i+1}" data-v="${i+1}">${l}</button>`).join("")}</div>
    </div>`;
  $("segClear").onclick=e=>{const v=+e.target.dataset.v;if(v){S.clear=v;save();renderAtlas();renderMaps()}};
  $("segBudget").onclick=e=>{const v=+e.target.dataset.v;if(v){S.budget=v;save();renderAtlas();renderMaps()}};
  const ranked=rankStrats();
  const chosen=S.strat||primaryStrat().id;
  $("atlasStrats").innerHTML=ranked.map(({s,fit},i)=>{
    const tt=Object.entries(s.threads);
    return `<div class="card strat fit-${fit}${s.id===chosen?" hl":""}">
      <div class="row" style="justify-content:space-between"><h3>${esc(s.name)}</h3><span class="pill ${fit==="good"?"good":fit==="ok"?"warn":"bad"}">${fit==="good"?"Great fit":fit==="ok"?"Workable":"Poor fit"}</span></div>
      <p class="small" style="margin:0">${esc(s.sum)}</p>
      ${tt.length?`<div class="threads">${tt.map(([k,v])=>`<span class="thread">${v}× ${esc(k)}</span>`).join("")}</div>`:""}
      <ul class="small" style="margin:0;padding-left:18px">${s.tips.map(t=>`<li>${esc(t)}</li>`).join("")}</ul>
      <div><button class="btn${s.id===chosen?" primary":""}" data-strat="${s.id}">${s.id===chosen?"Current farm":"Farm this"}</button></div>
    </div>`}).join("");
  document.querySelectorAll("[data-strat]").forEach(b=>b.onclick=()=>{S.strat=b.dataset.strat;save();renderAtlas();renderMaps()});
  const strat=STRATS.find(s=>s.id===chosen);
  $("atlasPhases").innerHTML=`<h2>Atlas tree path for ${esc(strat.name)}</h2>
    <p class="small muted" style="margin:0">The 3.30 tree starts at the centre and grows outward, up to 150 points. Spend respec points freely: quest bosses now give them.</p>
    <ol class="steps">
      <li><b>0–30 points · sustain.</b> Take the generic Maps cluster first so you don't run out of maps. Add the Strongbox cluster if you're short on Threads.</li>
      <li><b>30–70 points · core farm.</b> Path into the rebuilt <b>${esc(strat.name.split(" (")[0])}</b> cluster${Object.keys(strat.threads).length?` and start adding ${esc(Object.keys(strat.threads)[0])} Threads`:""}. Skip map-wide Item Rarity nodes: in 3.30 rarity mainly upgrades drops from rare and unique monsters.</li>
      <li><b>70–110 points · layers.</b> Add a secondary mechanic that needs no Threads (Harvest, Essence or Covens Fates if you can boss) so every map pays twice.</li>
      <li><b>110–150 points · scale.</b> Pick a keystone: <b>Unwavering Vision</b> (one Thread type, +2 Threads past the cap) or <b>Phantom Anomalies</b> (anomalies on completing any Shaped Region).</li>
    </ol>
    <p class="note" style="margin:0" data-x="1">Removed in 3.30: Scarabs, Delve and Heist atlas clusters, and keystones like Crop Rotation, Lucid Dreams and Meticulous Appraiser. For exact node-by-node trees, check a current atlas planner, since the tree is brand new.</p>`;
  renderAtlasTree();
}

/* ---------------- render: crafting ---------------- */
function slotCategory(slot,base){
  const s=(slot||"").toLowerCase();
  if(/weapon|offhand/.test(s)) return "weapon";
  if(/ring|amulet|belt/.test(s)) return "jewellery";
  if(/flask/.test(s)) return "flask";
  if(/jewel/.test(s)||/Jewel$/.test(base||"")) return "jewel";
  return "armour";
}
function craftPlan(item,slot){
  const cat=slotCategory(slot,item.base);
  if(item.rarity==="UNIQUE") return `<h2>${esc(item.name)}</h2><p class="small muted" style="margin:0">${esc(slot)} · ${esc(item.base)}</p>
    <ol class="steps"><li>Buy it on the trade site: unique items can't be crafted.</li><li>Compare rolls: PoB's version may assume perfect or specific variants.</li><li>Upgrade path: corruption for an implicit. 3.30 allows a second corruption (Twice Corrupted) via the Altar of Corruption or Lapidary Lens, which can destroy the item.</li></ol>`;
  if(cat==="flask") return `<h2>${esc(item.name)}</h2><ol class="steps"><li>Buy a base at item level 82+ for the best mods.</li><li>Alteration-spam for the prefix and suffix in the name.</li><li>Use Glassblower's Baubles to 20% quality and enkindling/instilling orbs if your build lists them.</li></ol>`;
  const key=item.mods.filter(m=>!m.crafted);
  const ess=[];key.forEach(m=>{const e=ESSENCES.find(x=>x.re.test(m.text));if(e&&!ess.includes(e.ess))ess.push(e.ess)});
  const minTier=MIN_TIER[item.base];
  const lock={weapon:"4 Divine + 1 Sacred Orb",armour:"4 Divine + 4 Blessed Orbs",jewellery:"4 Divine + 8 Exalted Orbs",jewel:"bench cost shown in-game"}[cat];
  const frac=item.mods.find(m=>m.fractured);
  const steps=[];
  steps.push(`Get a <b>${esc(item.base)}</b> at item level ${Math.max(item.ilvl||0,cat==="jewel"?1:84)}+${minTier?` (only drops at Item Tier ${minTier}+ in 3.30)`:""}. Rare and magic items from Act 6 onward can roll Item Tier 2–5: higher tiers mean better mods and bases.`);
  if(frac) steps.push(`Look for a fractured base with <b>${esc(frac.text)}</b>. Tier 5 drops can be Fractured Magic, a strong starting point.`);
  if(ess.length) steps.push(`Spam <b>${esc(ess[0])}</b> to force <i>${esc(key.find(m=>ESSENCES.find(x=>x.ess===ess[0]).re.test(m.text)).text)}</i>${ess.length>1?` (alternative: ${esc(ess.slice(1).join(", "))})`:""}.`);
  else steps.push(`Chaos- or Harvest-reforge until 2 of the target mods land. No common essence forces this item's key mod.`);
  steps.push(`Once you hit 2+ good mods on one side, lock them with the bench meta-craft "Prefixes/Suffixes cannot be changed" (1–2 Divine Orbs), then reroll the other side.`);
  if(cat==="jewellery") steps.push(`Alternative: Recombinate two rings/amulets that each hold half the mods; the result keeps the item level of the base you pick.`);
  steps.push(`Fix resistances with Harvest swaps (300 Lifeforce of two types) and fill open slots from the bench.`);
  const stillNeed=item.mods.filter(m=>m.crafted);
  return `<h2 class="${item.rarity==="RARE"?"t-rare":"t-magic"}">${esc(item.name)}</h2>
    <p class="small muted" style="margin:0">${esc(slot)} · ${esc(item.base)}${item.ilvl?` · ilvl ${item.ilvl}`:""}${item.flags.length?" · "+esc(item.flags.join(", ")):""}</p>
    <div class="mods">${item.implicits.map(m=>`<div class="mod-impl">${esc(m.text)}</div>`).join("")}${item.implicits.length?'<hr style="border:0;border-top:1px solid var(--line);width:100%;margin:2px 0">':""}${item.mods.map(m=>`<div class="mod ${m.crafted?"crafted":""} ${m.fractured?"fractured":""}">${esc(m.text)}${m.crafted?" <span class='small'>(bench)</span>":""}${m.fractured?" <span class='small'>(fractured)</span>":""}</div>`).join("")}</div>
    <h3>Crafting plan</h3>
    <ol class="steps small">${steps.map(s=>`<li>${s}</li>`).join("")}</ol>
    ${stillNeed.length?`<p class="small" style="margin:0">Bench-craft last: ${stillNeed.map(m=>esc(m.text)).join("; ")}.</p>`:""}
    <p class="small muted" style="margin:0">Full Divine lock for this slot: ${esc(lock)}.</p>
    <p class="note" style="margin:0">Not sure it's worth crafting? Search the trade site for the same base with your 2–3 most important mods. If it's cheaper than ~2 Divine Orbs, buy it.</p>`;
}
function openTradeTools(){
  const el=$("tradeTools");if(el&&!el.firstChild)el.innerHTML='<div class="card hl"><h2>Trading</h2><div class="skel" aria-label="Loading"><i></i><i></i><i></i></div></div>';
  loadScriptOnce("tradetools.js","TradeTools").then(()=>TradeTools.render()).catch(e=>{if(el)el.innerHTML=`<div class="card"><h2>Trading</h2>${emptyBox("Couldn't load the trading tools: "+(e.message||e))}</div>`});
}
function openBuildTools(){
  const el=$("buildTools");if(el&&!el.children.length)el.innerHTML='<div class="card"><h2>Build tools</h2><div class="skel" aria-label="Loading"><i></i><i></i><i></i></div></div>';
  loadScriptOnce("buildtools.js","BuildTools").then(()=>BuildTools.render()).catch(e=>{if(el)el.innerHTML=`<div class="card"><h2>Build tools</h2>${emptyBox("Couldn't load the build tools: "+(e.message||e))}</div>`});
}
function openLeague(){
  const el=$("leagueTools");if(el&&!el.children.length)el.innerHTML='<div class="card"><h2>League</h2><div class="skel" aria-label="Loading"><i></i><i></i><i></i></div></div>';
  loadScriptOnce("league.js","LeagueTools").then(()=>LeagueTools.render()).catch(e=>{if(el)el.innerHTML=`<div class="card"><h2>League</h2>${emptyBox("Couldn't load the league tools: "+(e.message||e))}</div>`});
}
function openFilterLab(){
  const el=$("filterLab");if(el&&!el.firstChild)el.innerHTML='<div class="card hl"><h2>Loot filter</h2><div class="skel" aria-label="Loading"><i></i><i></i><i></i></div></div>';
  loadScriptOnce("filterlab.js","FilterLab").then(()=>FilterLab.render()).catch(e=>{if(el)el.innerHTML=`<div class="card"><h2>Loot filter</h2>${emptyBox("Couldn't load the filter editor: "+(e.message||e))}</div>`});
}
function openCraftLab(item){
  const el=$("craftLab");if(el&&!el.firstChild)el.innerHTML='<div class="card hl"><h2>Craft lab</h2><div class="skel" aria-label="Loading"><i></i><i></i><i></i></div></div>';
  loadScriptOnce("craftlab.js","CraftLab").then(()=>CraftLab.load()).then(()=>{if(item)CraftLab.fromItem(item);else CraftLab.render()})
    .catch(e=>{if(el)el.innerHTML=`<div class="card"><h2>Craft lab</h2>${emptyBox("Couldn't load the crafting data: "+(e.message||e))}</div>`});
}
function renderCraft(){
  $("craftGearList").innerHTML=`<h2>Your gear</h2><p class="small muted" style="margin:0">Pick a piece to plan the craft that turns it into the guide's target.</p><div style="display:grid;gap:6px">${gearButtons("craft")}</div>`;
  const list=slotItems();
  const cur=(selectedSlot&&list.find(x=>x.slot===selectedSlot))||list.find(x=>x.item.id===selectedItem)||list.find(x=>x.item.rarity==="RARE")||list[0];
  $("craftPlan").innerHTML=cur?craftPlan(cur.item,cur.slot)+curCompareHtml(cur.slot,cur.item)+(cur.item.rarity!=="UNIQUE"?`<div><button class="btn" id="toLab">Work out the odds in the Craft lab</button></div>`:""):'<h2>Crafting plan</h2><p class="muted">Import a build with items to get a plan.</p>';
  {const tl=$("toLab");if(tl&&cur)tl.onclick=()=>{showTab("craftlab");openCraftLab(withBuild(viewB(),()=>cur.item))}}
  $("craftProfit").innerHTML=`<h2>Craft for profit</h2>
    ${PROFIT.map(p=>`<details class="sg"><summary class="row" style="justify-content:space-between;cursor:pointer"><b>${esc(p.name)}</b><span class="pill ${p.risk==="High"?"bad":p.risk==="Medium"?"warn":"good"}">Risk: ${p.risk}</span></summary>
      <p class="small muted" style="margin:6px 0">${esc(p.slot)}</p><ol class="steps small">${p.steps.map(s=>`<li>${esc(s)}</li>`).join("")}</ol><p class="small muted" style="margin:6px 0 0">${esc(p.note)}</p></details>`).join("")}
    <p class="note" style="margin:0">Prices move fast in week one. Check poe.ninja and the trade site before you invest.</p>`;
  const c=S.calc;
  const ev=()=>{const p=c.chance/100;const attempts=p>0?1/p:Infinity;const cost=attempts*c.cost;return {attempts,cost,profit:c.sell-cost}};
  const r=ev();
  $("craftCalc").innerHTML=`<h2>Is this craft worth it?</h2>
    <div class="fgrid">
      <label class="f" for="cCost">Cost per attempt (chaos)<input type="number" id="cCost" min="0" step="any" value="${c.cost}"></label>
      <label class="f" for="cChance">Hit chance per attempt (%)<input type="number" id="cChance" min="0" max="100" step="any" value="${c.chance}"></label>
      <label class="f" for="cSell">Sell price (chaos)<input type="number" id="cSell" min="0" step="any" value="${c.sell}"></label>
      <label class="f" for="cDiv">Divine price (chaos)<input type="number" id="cDiv" min="1" step="any" value="${S.divine}"></label>
    </div>
    <div class="stats">
      <div class="stat"><div class="k">Avg attempts</div><div class="v num">${isFinite(r.attempts)?r.attempts.toFixed(1):"∞"}</div></div>
      <div class="stat"><div class="k">Avg cost</div><div class="v num">${isFinite(r.cost)?fmt(r.cost)+"c":"∞"}</div></div>
      <div class="stat"><div class="k">Expected profit</div><div class="v num"><span class="pill ${r.profit>0?"good":"bad"}" style="font-size:1rem">${isFinite(r.profit)?(r.profit>=0?"+":"")+fmt(r.profit)+"c":"–"}</span></div></div>
      <div class="stat"><div class="k">In divines</div><div class="v num">${isFinite(r.profit)?(r.profit/S.divine).toFixed(2):"–"}</div></div>
    </div>
    <p class="note" style="margin:0">Expected value over many attempts. With a 15% chance, about 1 in 4 crafters needs twice the average attempts, so keep a buffer.</p>`;
  [["cCost","cost"],["cChance","chance"],["cSell","sell"]].forEach(([id,k])=>$(id).onchange=e=>{c[k]=Math.max(0,+e.target.value||0);save();renderCraft()});
  $("cDiv").onchange=e=>{S.divine=Math.max(1,+e.target.value||1);save();renderCraft();renderSession()};
  $("craftRef").innerHTML=`<h2>3.30 crafting cheat sheet</h2><div class="tw"><table>
    <thead><tr><th>Method</th><th>What changed</th></tr></thead><tbody>
    <tr><td>Bench meta-crafts</td><td>Lock 1 or 2 prefixes / suffixes for 1–2 Divine Orbs.</td></tr>
    <tr><td>Bench Divine locks</td><td>Weapons 4 Divine + 1 Sacred · Armour/quivers 4 Divine + 4 Blessed · Jewellery 4 Divine + 8 Exalted.</td></tr>
    <tr><td>Item Tier</td><td>Act 6+ magic/rare drops roll Tier 2–5 (better mods, base, quality, sockets). Stygian Vise needs Tier 5, Steel Ring Tier 3.</td></tr>
    <tr><td>Harvest</td><td>Resist swap 300 Lifeforce of two types; damage-type swap adds a Crystallised Rancour.</td></tr>
    <tr><td>Recombinator</td><td>Output uses the selected base's item level; illegal mods no longer count; no Corrupted items.</td></tr>
    <tr><td>Gwennen</td><td>Gambling removed; coin-flip between two crafting options for one Astragali.</td></tr>
    <tr><td>Corruption</td><td>Twice Corrupted via Altar of Corruption / Lapidary Lens, can destroy the item. Vaal Orb recipe: 5 Vaal gems.</td></tr>
    <tr><td>Essences</td><td>New Essence of Trickery. Weeping/Wailing gone from yellow/red maps.</td></tr>
    </tbody></table></div>`;
}


/* ---------------- campaign (acts 1-10) ---------------- */
// k: pt = passive skill point quest, trial = Trial of Ascendancy, boss = act boss, opt = optional
const CAMPAIGN=[
 {act:1,lvl:[12,13],tip:"Grab a movement skill as soon as a vendor offers one, and keep a Quicksilver Flask on from here to maps.",steps:[
  {t:"Twilight Strand → Hillock → Lioneye's Watch. Take your first gem rewards."},
  {t:"The Coast (waypoint) → Mud Flats: collect the 3 glyphs to open the Submerged Passage."},
  {t:"Tidal Island: kill Hailrake, bring the Medicine Chest to Nessa and take the Quicksilver Flask."},
  {t:"Flooded Depths (off the Submerged Passage): The Dweller of the Deep.",k:"pt"},
  {t:"The Ledge → The Climb → Lower Prison: Trial of Ascendancy.",k:"trial"},
  {t:"Upper Prison → kill Brutus."},
  {t:"Prisoner's Gate → Ship Graveyard → Cave: take the Allflame, kill Captain Fairgraves (The Marooned Mariner).",k:"pt"},
  {t:"Cavern of Wrath → Cavern of Anger → kill Merveil.",k:"boss"}]},
 {act:2,lvl:[22,23],tip:"Most guides kill all three bandits for +2 passive points. Only help one if your guide says so.",steps:[
  {t:"Southern Forest → Forest Encampment → Old Fields → The Crossroads (waypoint)."},
  {t:"Chamber of Sins 1 → 2: Trial of Ascendancy in level 2, kill Fidelitas for the Baleful Gem.",k:"trial"},
  {t:"Fellshrine Ruins → The Crypt level 1: Trial of Ascendancy.",k:"trial",opt:1},
  {t:"Western Forest: Weaver's Chambers → kill The Weaver for Maligaro's Spike."},
  {t:"The Way Forward.",k:"pt"},
  {t:"Deal with the Bandits: find Kraityn, Alira and Oak (Broken Bridge, Western Forest, Wetlands). Kill all = 2 points.",k:"pt"},
  {t:"Wetlands → open the seal → Vaal Ruins → Northern Forest → Caverns → Ancient Pyramid."},
  {t:"Kill the Vaal Oversoul.",k:"boss"}]},
 {act:3,lvl:[33,34],tip:"Do the Normal Labyrinth once you have all 6 trials (around level 33) for your first 2 ascendancy points.",steps:[
  {t:"City of Sarn → Sarn Encampment → The Slums → Crematorium: Trial of Ascendancy.",k:"trial"},
  {t:"The Sewers: collect Victario's 3 busts (Victario's Secrets).",k:"pt"},
  {t:"Marketplace → Catacombs: Trial of Ascendancy.",k:"trial"},
  {t:"Battlefront → Docks (Thaumetic Sulphite) → Solaris Temple (Lady Dialla)."},
  {t:"Ebony Barracks → kill General Gravicius → Lunaris Temple 1–2: defeat Piety (Piety's Pets).",k:"pt"},
  {t:"Imperial Gardens: Trial of Ascendancy, then the Library: find Siosa's pages; he then sells every gem.",k:"trial"},
  {t:"Sceptre of God → Upper Sceptre → kill Dominus.",k:"boss"},
  {t:"Aspirants' Plaza: run the Normal Labyrinth (needs all 6 trials).",opt:1}]},
 {act:4,lvl:[40,41],tip:"Recheck resistances here. Act 5 ends with a −30% penalty, so aim to overcap before Kitava.",steps:[
  {t:"Highgate → Aqueduct → Dried Lake: kill Voll for Deshret's Banner."},
  {t:"Mines 1–2: free Deshret's spirit (An Indomitable Spirit).",k:"pt"},
  {t:"Crystal Veins → Kaom's Dream/Stronghold (Kaom) and Daresso's Dream/Grand Arena (Daresso) for the two Eyes."},
  {t:"Belly of the Beast 1–2 → Piety → The Harvest: kill Doedre, Maligaro and Shavronne."},
  {t:"The Black Core → kill Malachai.",k:"boss"}]},
 {act:5,lvl:[45,46],tip:"Killing Kitava applies −30% to all resistances. Have ~105% elemental resistances in gear/bench crafts first, or plan to fix them in Act 6.",steps:[
  {t:"Slave Pens → Control Blocks: grab the Miasmeter (In Service to Science).",k:"pt"},
  {t:"Oriath Square → Templar Courts → Chamber of Innocence → kill Innocence."},
  {t:"Torched Courts → Ruined Square → Reliquary: collect the 3 torments (Kitava's Torments).",k:"pt"},
  {t:"Cathedral Rooftop → kill Kitava. Resistances −30%.",k:"boss"}]},
 {act:6,lvl:[50,51],tip:"From Act 6 onward magic and rare drops can roll higher Item Tiers in 3.30, so check rares for upgrades more often.",steps:[
  {t:"Twilight Strand: clear it to unlock Lilly Roth, who sells every gem."},
  {t:"Coast → Mud Flats → Karui Fortress: kill Tukohama (The Father of War).",k:"pt"},
  {t:"The Ridge → Lower Prison: Trial of Ascendancy (Cruel).",k:"trial"},
  {t:"Shavronne's Tower: kill Brutus and Shavronne."},
  {t:"Prisoner's Gate: kill Abberath (The Cloven One).",k:"pt"},
  {t:"Western Forest → Riverways → Wetlands: kill Ryslatha (The Puppet Mistress).",k:"pt"},
  {t:"Southern Forest → Cavern of Anger → The Beacon: light it."},
  {t:"Brine King's Reef → kill the Brine King.",k:"boss"}]},
 {act:7,lvl:[55,56],tip:"Run the Cruel Labyrinth after this act's trials for ascendancy points 3–4.",steps:[
  {t:"Broken Bridge → Crossroads → Fellshrine Ruins → The Crypt: Trial of Ascendancy (Cruel), grab Maligaro's Map.",k:"trial"},
  {t:"Chamber of Sins 1–2: Trial of Ascendancy (Cruel) in level 2.",k:"trial"},
  {t:"Maligaro's Sanctum: kill Maligaro (The Master of a Million Faces).",k:"pt"},
  {t:"The Den → Ashen Fields → Northern Forest → Dread Thicket: kill Gruthkul (Queen of Despair).",k:"pt"},
  {t:"The Causeway: find Kishara's Star (Kishara's Star).",k:"pt"},
  {t:"Vaal City → Temple of Decay 1–2 → kill Arakaali.",k:"boss"},
  {t:"Run the Cruel Labyrinth.",opt:1}]},
 {act:8,lvl:[60,61],tip:"Push your life pool and resistances now: Acts 9–10 hit hard and maps follow.",steps:[
  {t:"Sarn Ramparts → Toxic Conduits → Doedre's Cesspool: kill Doedre."},
  {t:"Grand Promenade → Bath House: Trial of Ascendancy (Merciless).",k:"trial"},
  {t:"High Gardens: kill Yugul (Reflection of Terror).",k:"pt"},
  {t:"The Quay: Love is Dead.",k:"pt"},
  {t:"The Grain Gate: The Gemling Legion.",k:"pt"},
  {t:"Lunaris and Solaris temples: kill Dawn and Dusk."},
  {t:"Harbour Bridge → kill Solaris and Lunaris.",k:"boss"}]},
 {act:9,lvl:[63,64],tip:"Keep your gems levelled in a weapon-swap if your guide swaps skills at higher levels.",steps:[
  {t:"Blood Aqueduct → Highgate → The Descent → Vastiri Desert → Oasis: kill Shakari (Queen of the Sands).",k:"pt"},
  {t:"The Foothills → Boiling Lake: kill the Basilisk."},
  {t:"The Tunnel: Trial of Ascendancy (Merciless).",k:"trial"},
  {t:"The Quarry: The Ruler of Highgate.",k:"pt"},
  {t:"The Refinery: kill General Adus."},
  {t:"Belly of the Beast → Rotting Core → kill the Depraved Trinity.",k:"boss"}]},
 {act:10,lvl:[67,68],tip:"The second Kitava kill applies another −30% to resistances (−60% total). Have gear ready to re-cap before your first map.",steps:[
  {t:"Oriath Docks → Cathedral Rooftop: save Bannon."},
  {t:"Ravaged Square → Control Blocks: kill Vilenta (Vilenta's Vengeance).",k:"pt"},
  {t:"The Ossuary: Trial of Ascendancy (Merciless).",k:"trial"},
  {t:"Torched Courts → Desecrated Chambers: kill Avarius."},
  {t:"Canals → Feeding Trough → kill Kitava (An End to Hunger). Resistances −30% again.",k:"boss"},
  {t:"Run the Merciless Labyrinth (ascendancy points 5–6), then the Epilogue to open the Atlas.",opt:1}]}
];
const CAMP_RULES=[
 "XP falls off when you're too far above or below the zone level: the safe gap is 3 + (your level ÷ 16), rounded down. Hitting the target levels keeps you in range without grinding.",
 "Craft movement speed on boots as soon as you can. There's a Crafting Bench in every town from Act 2 onwards.",
 "Use a movement skill (Leap Slam, Flame Dash, Frostblink, Dash) and keep a Quicksilver Flask up.",
 "Buy linked items from vendors: a 3-link at Act 1–2 and a 4-link around Act 3–4 give big damage jumps.",
 "Pick up and identify rares from Act 6 onward: 3.30's Item Tiers make campaign rares better than before.",
 "Skip side zones unless they give a skill point, a trial or something on your guide's list.",
 "Use your portal scroll and waypoint to restock instead of walking back.",
 "Bench-reroll a bad rare for chaos (3 mods for 3 Chaos) instead of hunting for a replacement."
];
function campPct(a){const st=CAMPAIGN[a-1].steps;return st.filter((s,i)=>S.camp[a+"-"+i]).length/st.length}
function renderCampaign(){
  S.camp=S.camp||{};
  if(!S.campAct){const first=CAMPAIGN.find(c=>campPct(c.act)<1);S.campAct=first?first.act:10}
  const A=CAMPAIGN[S.campAct-1];
  const lv=Math.max((C||B).level,(S.logInfo&&S.logInfo.level)||0), [lo,hi]=A.lvl;
  const lvPill=(C?exC:isExample)?"":lv<lo-2?`<span class="pill warn">Your character is level ${lv}: a bit low for the end of this act</span>`:lv>hi+4?`<span class="pill">Your character is level ${lv}: past this act</span>`:`<span class="pill good">Your character is level ${lv}: on pace</span>`;
  $("campAct").innerHTML=`<div class="row" style="justify-content:space-between"><h2>Act ${A.act}</h2><span class="pill gold">Target: level ${lo}–${hi} at the act boss</span></div>
    <div class="actseg" id="actSeg">${CAMPAIGN.map(c=>`<button aria-pressed="${c.act===A.act}" class="${campPct(c.act)===1?"done":""}" data-act="${c.act}" aria-label="Act ${c.act}">${c.act}</button>`).join("")}</div>
    ${lvPill?`<div>${lvPill}</div>`:""}
    <ul class="clean">${A.steps.map((s,i)=>{const k=A.act+"-"+i,d=S.camp[k];return `<li><label class="check ${d?"done":""}"><input type="checkbox" data-camp="${k}"${d?" checked":""}><div><span class="t">${esc(s.t)}</span>${s.k==="pt"?'<span class="tag pt">skill point</span>':""}${s.k==="trial"?'<span class="tag trial">trial</span>':""}${s.k==="boss"?'<span class="tag boss">act boss</span>':""}${s.opt?'<span class="tag">optional</span>':""}</div></label></li>`}).join("")}</ul>
    ${(()=>{const pl=gemPlan(B).filter(p=>p.act===A.act&&(p.how==="quest"||p.how==="vendor"));return pl.length?`<p class="small" style="margin:0"><b>Gems this act:</b> ${pl.map(p=>`${p.how==="quest"?"take":"buy"} ${esc(p.info.name)} (${esc(p.npc)})`).join(" · ")}</p>`:""})()}
    ${(()=>{const e=nextLevelEta();return e?`<p class="small" style="margin:0"><b>Next level:</b> about ${hms(e.left)} to go (your last level took ${hms(e.last)})</p>`:""})()}
    <p class="small" style="margin:0"><b>Tip:</b> ${esc(A.tip)}</p>
    <div class="row">${A.act>1?`<button class="btn ghost" data-act="${A.act-1}">← Act ${A.act-1}</button>`:""}${A.act<10?`<button class="btn" data-act="${A.act+1}">Act ${A.act+1} →</button>`:'<button class="btn" data-goto="maps">On to maps →</button>'}</div>`;
  document.querySelectorAll("#campAct [data-act]").forEach(b=>b.onclick=()=>{S.campAct=+b.dataset.act;save();renderCampaign()});
  const g=document.querySelector("#campAct [data-goto]");if(g)g.onclick=()=>showTab("maps");
  document.querySelectorAll("[data-camp]").forEach(c=>c.onchange=()=>{S.camp[c.dataset.camp]=c.checked;
    if(A.steps.every((s,i)=>S.camp[A.act+"-"+i])&&A.act<10){S.campAct=A.act+1}
    if(c.checked&&A.steps[+c.dataset.camp.split("-")[1]].k==="boss"&&A.act===10){S.progress.p1=true;renderMaps()}
    save();renderCampaign()});
  // build card
  const specs=B.specs.map((s,i)=>({i:i+1,title:s.title,n:s.nodes,lv:+((s.title.match(/(\d{1,3})/)||[])[1]||0)}));
  const pick=specs.filter(s=>s.lv&&s.lv<=hi).pop();
  const noteLines=(B.notes||"").split(/\r?\n/).map(l=>l.trim()).filter(l=>/\b(act|level|lvl|leveling|levelling|campaign|lab)\b/i.test(l)).slice(0,10);
  const asc=B.ascend||"your ascendancy";
  $("campBuild").innerHTML=`<h2>Your build while leveling</h2>
    ${specs.length>1?`<h3>Tree stages in your guide</h3><ul class="clean small">${specs.map(s=>`<li class="row" style="justify-content:space-between"><span>${esc(s.title)} <span class="muted">· ${s.n} passives</span></span>${pick&&pick.i===s.i?'<span class="pill good">use for Act '+A.act+'</span>':`<button class="btn ghost small" data-spec="${s.i}">View</button>`}</li>`).join("")}</ul>`:`<p class="small muted" style="margin:0">Your PoB has one tree. Many guides add leveling trees (e.g. "Level 30", "Level 60"); if yours has them, they'll be listed here with the one to use now.</p>`}
    <h3>Gems</h3>
    <p class="small" style="margin:0">Endgame main skill: <b>${esc(T.main)}</b>. Siosa (Act 3 Library) and Lilly Roth (Act 6) sell every gem, including off-class ones.</p>
    <h3>Labyrinth for ${esc(asc)} <a class="small" href="https://www.poelab.com/" target="_blank" rel="noopener" style="font-family:var(--body);font-weight:400">Today's layouts on poelab.com</a></h3>
    <ul class="small" style="margin:0;padding-left:18px"><li>Normal: after Act 3 (~level 33)</li><li>Cruel: after Act 7 (~level 55–60)</li><li>Merciless: after Act 10 (~level 68–70)</li><li>Uber: from maps, for the last 2 points</li></ul>
    ${noteLines.length?`<h3>From your guide's notes</h3><ul class="small" style="margin:0;padding-left:18px">${noteLines.map(l=>`<li>${esc(l)}</li>`).join("")}</ul>`:""}`;
  document.querySelectorAll("[data-spec]").forEach(b=>b.onclick=()=>{G.activeSpec=+b.dataset.spec;S.view="goal";reanalyze();renderAll();showTab("build")});
  renderCampGems(A);renderSplits();renderChatReadouts();
  $("campRules").innerHTML=`<div class="row" style="justify-content:space-between"><span class="small muted">${S.logInfo?`Last log update: ${esc(S.logInfo.name)} Lv ${S.logInfo.level}${S.logInfo.act?`, Act ${S.logInfo.act}`:""}`:"Tick steps by hand, or read your game log to update automatically."}</span><button class="btn ghost small" id="campLogBtn">Update from game log</button></div><h2>Speed rules</h2><ol class="steps small">${CAMP_RULES.map(r=>`<li>${esc(r)}</li>`).join("")}</ol>`;
  $("campLogBtn").onclick=()=>{showTab("session");setTimeout(()=>{const el=$("sessGameLog");if(el)el.scrollIntoView({block:"start"})},50)};
  const all=CAMPAIGN.flatMap(c=>c.steps.map((s,i)=>({...s,key:c.act+"-"+i})));
  const pts=all.filter(s=>s.k==="pt"), trials=all.filter(s=>s.k==="trial");
  const got=x=>x.filter(s=>S.camp[s.key]).length;
  $("campOverview").innerHTML=`<h2>Campaign progress</h2>
    <div class="stats">
      <div class="stat"><div class="k">Acts done</div><div class="v num">${CAMPAIGN.filter(c=>campPct(c.act)===1).length}/10</div></div>
      <div class="stat"><div class="k">Skill-point quests</div><div class="v num">${got(pts)}/${pts.length}</div></div>
      <div class="stat"><div class="k">Trials</div><div class="v num">${got(trials)}/${trials.length}</div></div>
    </div>
    <div class="tw"><table><thead><tr><th>Act</th><th>Target level</th><th>Skill points</th><th>Trials</th><th>Done</th></tr></thead><tbody>
    ${CAMPAIGN.map(c=>{const p=c.steps.filter(s=>s.k==="pt"),t=c.steps.filter(s=>s.k==="trial");return `<tr><td>${c.act}</td><td class="num">${c.lvl[0]}–${c.lvl[1]}</td><td>${p.length||"–"}</td><td>${t.length||"–"}</td><td><span class="pill ${campPct(c.act)===1?"good":campPct(c.act)>0?"warn":""}">${Math.round(campPct(c.act)*100)}%</span></td></tr>`}).join("")}
    </tbody></table></div>
    <p class="note" style="margin:0">Level targets are typical for a smooth league-start run; faster racers go lower. Bandit "kill all" gives 2 points from one quest.</p>`;
}


/* ---------------- shopping list ---------------- */
const MOD_PRIO=[
 [/maximum Life/i,5,"life"],[/maximum Energy Shield|increased Energy Shield/i,4,"energy shield"],[/to Level of/i,5,"gem levels"],
 [/Resistance/i,4,"resistance"],[/Suppress Spell/i,4,"suppression"],[/Movement Speed/i,4,"movement speed"],
 [/Critical Strike Multiplier/i,3,"crit multi"],[/Critical Strike Chance/i,3,"crit chance"],[/Adds .* Damage|increased .*Damage/i,3,"damage"],
 [/Attack Speed|Cast Speed/i,3,"speed"],[/Damage over Time Multiplier/i,3,"DoT multi"],[/Attributes|to (Strength|Dexterity|Intelligence)/i,2,"attributes"]
];
function modWant(text){
  const nums=text.match(/\d+(\.\d+)?/g)||[];
  const pr=MOD_PRIO.find(([re])=>re.test(text));
  const prio=pr?pr[1]:1;
  if(nums.length===1&&+nums[0]>=4){const v=+nums[0];const min=v>=20?Math.floor(v*0.8/5)*5:Math.floor(v*0.8);return {prio,want:`aim for ${min}+ (guide: ${v})`}}
  return {prio,want:""};
}
function tradeUrl(q){const lg=encodeURIComponent(S.league||"Covens of Umbra");return `https://www.pathofexile.com/trade/search/${lg}?q=${encodeURIComponent(JSON.stringify({query:{...q,status:{option:"online"}}}))}`}
function gemTags(g){
  const t=[];
  if(/^Awakened/i.test(g.name)) t.push(["Awakened · late upgrade","warn"]);
  if(/^Vaal /i.test(g.name)) t.push(["Vaal gem","gold"]);
  if(/ of [A-Z]/.test(g.name)&&!/^Awakened/.test(g.name)) t.push(["Transfigured","gold"]);
  if(g.level>20||g.quality>20) t.push([`${g.level}/${g.quality}: corrupted upgrade`,"warn"]);
  return t;
}
function renderShop(){
  S.have=S.have||{};
  const sk=currentSkills(B).filter(s=>s.enabled&&s.gems.length);
  const mg=mainGroup(B);
  const items=slotItems();
  const linkBySlot={};sk.forEach(s=>{if(s.slot){const n=s.gems.filter(g=>g.enabled).length;linkBySlot[s.slot]=Math.max(linkBySlot[s.slot]||0,n)}});
  const gemKey=g=>"gem:"+g.name, itemKey=it=>"item:"+(it.rarity==="UNIQUE"?it.name:it.id+":"+it.base);
  const gemsAll=sk.flatMap(s=>s.gems.filter(g=>g.enabled));
  const uniqueGems=[...new Map(gemsAll.map(g=>[g.name,g])).values()];
  const curGemNames=new Set(C&&C!==G?currentSkills(C).flatMap(s=>s.gems.filter(g=>g.enabled).map(g=>g.name)):[]);
  const autoG=g=>curGemNames.has(g.name), autoI=x=>!!(C&&C!==G&&compareSlot(x.slot,x.item).status==="done");
  const hasG=g=>S.have[gemKey(g)]||autoG(g), hasI=x=>S.have[itemKey(x.item)]||autoI(x);
  const haveG=uniqueGems.filter(hasG).length, haveI=items.filter(hasI).length;
  // buy order
  const mainSlot=mg&&mg.slot;
  const ord=[];
  if(mg) ord.push(`Main skill gems: ${mg.gems.filter(g=>g.enabled).map(g=>g.name).join(", ")}`);
  if(mainSlot&&linkBySlot[mainSlot]>=4) ord.push(`A ${linkBySlot[mainSlot]}-link ${mainSlot} for the main skill`);
  const uniq=items.filter(x=>x.item.rarity==="UNIQUE"&&!/Flask/i.test(x.slot));
  if(uniq.length) ord.push(`Uniques the build is built around: ${uniq.map(x=>x.item.name).join(", ")}`);
  const w=items.find(x=>/Weapon 1/i.test(x.slot)&&x.item.rarity!=="UNIQUE");if(w) ord.push(`Weapon: ${w.item.base} with your top damage mods`);
  ord.push("Rare armour and jewellery to cap resistances and raise life/ES");
  if(items.some(x=>/jewel/i.test(x.slot))) ord.push("Jewels for extra life and damage");
  if(items.some(x=>/Flask/i.test(x.slot))) ord.push("Flasks with the guide's prefix/suffix");
  ord.push("Late upgrades: Awakened gems, 21/20 or 23% corrupted gems, better rolls");
  $("shopSummary").innerHTML=`<div class="row" style="justify-content:space-between"><h2>What to look for</h2><span class="pill gold">From: ${esc(B.ascend||B.className)} · ${esc(T.main)}</span></div>
    <div class="stats">
      <div class="stat"><div class="k">Gems</div><div class="v num">${haveG}/${uniqueGems.length}</div></div>
      <div class="stat"><div class="k">Items</div><div class="v num">${haveI}/${items.length}</div></div>
      <div class="stat"><div class="k">Biggest link</div><div class="v num">${Math.max(0,...Object.values(linkBySlot))}-link</div></div>
    </div>
    <h3>Get them in this order</h3>
    <ol class="steps small order">${ord.map(o=>`<li>${esc(o)}</li>`).join("")}</ol>
    <label class="f" for="leagueIn" style="max-width:320px">Trade league for links<input type="text" id="leagueIn" value="${esc(S.league||"Covens of Umbra")}"></label>
    <p class="note" style="margin:0">Trade links open pathofexile.com/trade with the gem, unique name or base type filled in. Add mod filters there for rares. If a link opens an empty search, type the name in by hand.</p>`;
  $("leagueIn").onchange=e=>{S.league=e.target.value.trim()||"Covens of Umbra";save();renderShop()};
  // gems
  const allNames=uniqueGems.filter(g=>!hasG(g)).map(g=>g.name);
  const mainNames=mg?mg.gems.filter(g=>g.enabled).map(g=>g.name):[];
  const rxAll=allNames.length?gemSearchFor(allNames):[], rxMain=mainNames.length?gemSearchFor(mainNames):[];
  $("shopGems").innerHTML=`<h2>Gems</h2>
    ${rxMain.map((s,i)=>copyBox("shRxM"+i,i?"…continued":"Search: main skill setup",s)).join("")}
    ${rxAll.map((s,i)=>copyBox("shRxA"+i,i?"…continued":"Search: every gem you still need",s)).join("")}${sk.map((s,i)=>{const n=s.gems.filter(g=>g.enabled).length;return `<div class="sg${s===mg?" main":""}">
    <h4>${esc(s.label||s.slot||"Group "+(i+1))}${s.slot?` · ${esc(s.slot)}`:""} · ${n}-link${s===mg?' · <span style="color:var(--gold)">main skill</span>':""}</h4>
    ${s.gems.filter(g=>g.enabled).map(g=>{const k=gemKey(g),hv=hasG(g),au=autoG(g);return `<div class="gem have${hv?" got":""}"><input type="checkbox" data-have="${esc(k)}"${hv?" checked":""}${au?" disabled":""} aria-label="Have ${esc(g.name)}"><div style="flex:1"><div>${esc(g.name)} <span class="muted small num">${g.level}/${g.quality}</span>${(()=>{const gi=gemInfo(g.name);return gi&&gi.i!=null?` <span class="small" style="color:${gi.attr==="s"?"#e0584b":gi.attr==="d"?"#71c27a":gi.attr==="i"?"#7f8fff":"var(--muted)"}">● lvl ${gi.lvl}</span>`:""})()}${au?' <span class="pill good">in your character</span>':""}</div>${gemTags(g).map(([t,c])=>`<span class="pill ${c}">${esc(t)}</span>`).join(" ")}</div>${window.exileDesktop&&(/^Awakened|^Vaal| of [A-Z]/.test(g.name)||g.level>20||g.quality>20)?`<input type="number" class="pinput" data-watch="${esc(g.name)}" data-kind="gem" value="${S.watch&&S.watch[g.name]?S.watch[g.name].target:""}" placeholder="alert c" title="Price alert (chaos)" aria-label="Price alert for ${esc(g.name)}">`:""}<a class="small" href="${esc(tradeUrl({type:g.name}))}" target="_blank" rel="noopener">Trade</a></div>`}).join("")}</div>`}).join("")||'<p class="muted">No gems in this build.</p>'}
    <p class="note" style="margin:0">Normal gems: buy from Siosa (Act 3 Library) or Lilly Roth (Act 6+). Levels and quality shown are the guide's targets.</p>`;
  // items
  $("shopItems").innerHTML=`<h2>Items</h2>${items.map(({slot,item})=>{const k=itemKey(item),au=autoI({slot,item}),hv=hasI({slot,item});const links=linkBySlot[slot];
    const mods=item.mods.map(m=>({m,...modWant(m.text)})).sort((a,b)=>b.prio-a.prio);
    const must=mods.filter(x=>x.prio>=(/Weapon/i.test(slot)?3:4)&&!x.m.crafted).slice(0,4);
    const q=item.rarity==="UNIQUE"?{name:item.name,type:item.base}:{type:item.base};
    return `<div class="sg have${hv?" got":""}" style="display:flex"><input type="checkbox" data-have="${esc(k)}"${hv?" checked":""}${au?" disabled":""} aria-label="Have ${esc(item.name)}"><div style="flex:1;display:grid;gap:4px">${au?'<span class="pill good" style="justify-self:start">Your character already has this</span>':""}
      <div class="item ${item.rarity}" style="cursor:default;border:0;padding:0;background:none"><span class="slot">${esc(slot)}${links>=3?` · needs ${links} links`:""}</span><span class="nm">${esc(item.name)}</span>${item.base!==item.name?`<span class="small muted">${esc(item.base)}${item.ilvl&&item.rarity!=="UNIQUE"?` · ilvl ${item.ilvl}+`:""}</span>`:""}</div>
      ${item.rarity==="UNIQUE"&&window.exileDesktop?`<label class="row small">Price alert at ≤ <input type="number" class="pinput" data-watch="${esc(item.name)}" data-kind="unique" value="${S.watch&&S.watch[item.name]?S.watch[item.name].target:""}" placeholder="chaos"> c${S.watch&&S.watch[item.name]&&S.watch[item.name].last!=null?` <span class="muted">now ${fmt(S.watch[item.name].last)}c</span>`:""}</label>`:""}
      ${item.rarity==="UNIQUE"?`<p class="small" style="margin:0">Buy this unique. Check the roll and variant match the guide.${item.flags.includes("Corrupted")?" The guide's copy is corrupted: an uncorrupted one works to start.":""}</p>`:
       must.length?`<div class="small"><b>Must have:</b><ul style="margin:2px 0 0;padding-left:18px">${must.map(x=>`<li>${esc(x.m.text)}${x.want?` <span class="want">${esc(x.want)}</span>`:""}</li>`).join("")}</ul></div>`+
       (mods.length>must.length?`<div class="small muted">Nice to have: ${mods.filter(x=>!must.includes(x)).map(x=>esc(x.m.text)).join(" · ")}</div>`:""):'<p class="small muted" style="margin:0">Any decent roll of this base works.</p>'}
      <div class="row small"><a href="${esc(tradeUrl(q))}" target="_blank" rel="noopener">Search trade</a>${item.rarity!=="UNIQUE"&&!/Flask/i.test(slot)?`<button class="btn ghost small" data-craftitem="${esc(item.id)}">Or craft it</button>`:""}</div>
    </div></div>`}).join("")||'<p class="muted">No items in this build.</p>'}
    <p class="note" style="margin:0">"Aim for" is about 80% of the guide's roll: usually most of the power for a fraction of the price.</p>`;
  document.querySelectorAll("[data-have]").forEach(c=>c.onchange=()=>{S.have[c.dataset.have]=c.checked;save();renderShop()});
  bindCopy($("shopGems"));
  document.querySelectorAll("#tab-shop [data-watch]").forEach(inp=>inp.onchange=()=>setWatch(inp.dataset.watch,inp.dataset.kind,+inp.value));
  renderFilterBuilder();
  document.querySelectorAll("[data-craftitem]").forEach(b=>b.onclick=()=>{selectedItem=b.dataset.craftitem;selectedSlot=null;renderCraft();renderBuild();bindItems();showTab("craft")});
}
