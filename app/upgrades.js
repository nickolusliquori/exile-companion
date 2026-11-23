/* Upgrade finder: weights the stats your build cares about (editable), scores your current gear, and searches
   the trade site for items that beat each slot, ranked by score gained per divine. Reads only. */
"use strict";
(function(){
const UP={};window.Upgrades=UP;
const esc2=s=>String(s==null?"":s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const ELEM=["Fire","Cold","Lightning"];
const n=x=>+x||0;
// k, label, trade stat [type, text], local scorer(text) -> amount
const resIn=(el)=>t=>{let m=t.match(/^\+(\d+)% to all Elemental Resistances$/);if(m&&el!=="Chaos")return +m[1];
  m=t.match(/^\+(\d+)% to (.+?) Resistances?$/);if(!m)return 0;const parts=m[2].replace(/ and /g,",").split(",").map(x=>x.trim());return parts.includes(el)?+m[1]:0};
const STATS=[
  {k:"life",label:"Maximum Life",trade:["pseudo","+# total maximum Life"],f:t=>{let m;if(m=t.match(/^\+(\d+) to maximum Life$/))return +m[1];if(m=t.match(/^\+(\d+) to Strength$/))return m[1]/2;if(m=t.match(/^\+(\d+) to all Attributes$/))return m[1]/2;if(m=t.match(/^\+(\d+) to Strength and (Dexterity|Intelligence)$/))return m[1]/2;return 0}},
  {k:"es",label:"Maximum Energy Shield",trade:["pseudo","+# total maximum Energy Shield"],f:t=>{const m=t.match(/^\+(\d+) to maximum Energy Shield$/);return m?+m[1]:0}},
  ...ELEM.map(e=>({k:e.toLowerCase()+"Res",label:e+" Resistance",trade:["pseudo",`+#% total to ${e} Resistance`],f:resIn(e)})),
  {k:"chaosRes",label:"Chaos Resistance",trade:["pseudo","+#% total to Chaos Resistance"],f:resIn("Chaos")},
  {k:"move",label:"Movement Speed",trade:["explicit","#% increased Movement Speed"],f:t=>{const m=t.match(/^(\d+)% increased Movement Speed$/);return m?+m[1]:0},slots:["Boots"]},
  {k:"suppress",label:"Spell Suppression",trade:["explicit","+#% chance to Suppress Spell Damage"],f:t=>{const m=t.match(/^\+(\d+)% chance to Suppress Spell Damage$/);return m?+m[1]:0}},
  {k:"atkSpeed",label:"Attack Speed",trade:["explicit","#% increased Attack Speed"],f:t=>{const m=t.match(/^(\d+)% increased Attack Speed$/);return m?+m[1]:0}},
  {k:"castSpeed",label:"Cast Speed",trade:["explicit","#% increased Cast Speed"],f:t=>{const m=t.match(/^(\d+)% increased Cast Speed$/);return m?+m[1]:0}},
  {k:"critMulti",label:"Critical Strike Multiplier",trade:["explicit","+#% to Global Critical Strike Multiplier"],f:t=>{const m=t.match(/^\+(\d+)% to Global Critical Strike Multiplier$/);return m?+m[1]:0}},
  {k:"spellDmg",label:"Spell Damage",trade:["explicit","#% increased Spell Damage"],f:t=>{const m=t.match(/^(\d+)% increased Spell Damage$/);return m?+m[1]:0}},
  {k:"elemAtk",label:"Elemental Damage with Attacks",trade:["explicit","#% increased Elemental Damage with Attack Skills"],f:t=>{const m=t.match(/^(\d+)% increased Elemental Damage with Attack Skills$/);return m?+m[1]:0}},
  ...ELEM.concat(["Physical","Chaos"]).map(e=>({k:"inc"+e,label:e+" Damage",trade:["explicit",`#% increased ${e} Damage`],f:t=>{const m=t.match(new RegExp(`^(\\d+)% increased ${e} Damage$`));return m?+m[1]:0}})),
  ...ELEM.concat(["Physical","Chaos"]).map(e=>({k:"adds"+e,label:`Added ${e} to Attacks (avg)`,trade:["explicit",`Adds # to # ${e} Damage to Attacks`],f:t=>{const m=t.match(new RegExp(`^Adds (\\d+) to (\\d+) ${e} Damage to Attacks$`));return m?(+m[1]+ +m[2])/2:0}})),
];
const SLOTS=[["Helmet","armour.helmet"],["Body Armour","armour.chest"],["Gloves","armour.gloves"],["Boots","armour.boots"],["Belt","accessory.belt"],["Amulet","accessory.amulet"],["Ring 1","accessory.ring"],["Ring 2","accessory.ring"]];
const ATTACK=/(Arrow|Strike|Slam|Cyclone|Shot|Cleave|Barrage|Frenzy|Lacerate|Smite|Spectral|Flicker|Rain of|Puncture|Ballista|Boneshatter|Earthquake|Sunder|Reave|Molten|Splitting Steel|Volcanic|Leap|Blade Flurry|Bladestorm|Kinetic|Melee|Multistrike|Mirage Archer|with Attacks)/i;
const SPELL=/(Spell|Controlled Destruction|Arcane Surge|Unleash|Cascade|Echo|Totem.*Spell|Arc\b|Fireball|Spark|Storm|Bolt|Nova|Orb|Ball Lightning|Blight|Essence Drain|Bane|Vortex|Firestorm|Comet|Hexblast|Detonate)/i;

// which stats the build wants, and how much
function defaultWeights(t,cur,mainNames){
  const w={};const set=(k,v)=>{w[k]=v};
  if(!t)return {life:1,fireRes:1,coldRes:1,lightningRes:1,chaosRes:0.5,move:2};
  if(t.esBased)set("es",1);else set("life",1);
  const res=(cur&&cur.res)||{};
  ELEM.forEach(e=>{const v=res[e.toLowerCase()];set(e.toLowerCase()+"Res",v==null||v<75?1.2:0.3)});
  set("chaosRes",res.chaos!=null&&res.chaos>=0?0.3:0.6);
  set("move",2);
  const atk=ATTACK.test(mainNames||""),spl=!atk&&SPELL.test(mainNames||"");
  const els=(t.elems||[]).filter(e=>e!=="phys");
  if(atk){set("atkSpeed",2.5);if(els.length)set("elemAtk",1.5);(t.elems||[]).forEach(e=>{const E=e==="phys"?"Physical":e[0].toUpperCase()+e.slice(1);set("adds"+E,2);set("inc"+E,1)})}
  else if(spl||!t.minion){set("castSpeed",2.5);set("spellDmg",1);els.forEach(e=>set("inc"+e[0].toUpperCase()+e.slice(1),1))}
  if(/Crit|Critical|Assassin|Power Charge/i.test(mainNames||""))set("critMulti",1.5);
  return w;
}
function itemLines(it){if(!it)return [];const L=x=>(x||[]).map(m=>typeof m==="string"?m:m&&m.text).filter(Boolean);
  return [...L(it.implicits),...L(it.mods),...L(it.implicitMods),...L(it.explicitMods),...L(it.craftedMods),...L(it.fracturedMods),...L(it.enchantMods)].map(x=>String(x).replace(/\s*\(\w+\)$/,"").trim())}
function score(lines,weights,slot){
  let total=0;const parts={};
  for(const st of STATS){const w=n(weights[st.k]);if(!w)continue;if(st.slots&&slot&&!st.slots.includes(slot))continue;
    const v=lines.reduce((a,l)=>a+st.f(l),0);if(v){parts[st.k]=v;total+=v*w}}
  return {total,parts};
}
function query(statIds,weights,slot,cat,minScore,maxDiv){
  const filters=STATS.filter(st=>n(weights[st.k])&&statIds[st.k]&&(!st.slots||st.slots.includes(slot))).map(st=>({id:statIds[st.k],value:{weight:n(weights[st.k])}}));
  const q={query:{status:{option:"online"},stats:[{type:"weight",value:{min:Math.max(1,Math.round(minScore))},filters}],filters:{type_filters:{filters:{category:{option:cat}}}}},sort:{price:"asc"}};
  if(maxDiv>0)q.query.filters.trade_filters={filters:{price:{max:maxDiv,option:"divine"}}};
  return {q,used:filters.length};
}
function toChaos(price,P){if(!price||price.amount==null)return null;const c=String(price.currency||"").toLowerCase();
  if(c==="chaos")return price.amount;if(c==="divine")return P&&P.div?price.amount*P.div:null;
  const map={exalted:"Exalted Orb",alch:"Orb of Alchemy",alt:"Orb of Alteration",chance:"Orb of Chance",fusing:"Orb of Fusing",vaal:"Vaal Orb",annul:"Orb of Annulment",regal:"Regal Orb",gcp:"Gemcutter's Prism",mirror:"Mirror of Kalandra"};
  const r=P&&P.cur&&P.cur[map[c]||c];return r?price.amount*r:null}
// rank fetched listings: score gained over the current item, per divine
function rank(listings,weights,slot,curScore,P){
  return listings.map(x=>{if(!x||!x.item)return null;const sc=score(itemLines(x.item),weights,slot).total;const c=toChaos(x.listing&&x.listing.price,P);
    const gain=sc-curScore;const div=c!=null&&P&&P.div?c/P.div:null;
    return {name:[x.item.name,x.item.typeLine].filter(Boolean).join(" "),score:sc,gain,chaos:c,perDiv:div?gain/Math.max(div,0.05):null,whisper:x.listing&&x.listing.whisper,price:x.listing&&x.listing.price,id:x.id}})
    .filter(r=>r&&r.gain>0).sort((a,b)=>(b.perDiv??-1)-(a.perDiv??-1));
}

/* ---------- UI ---------- */
const st=()=>{const s=S.upg||(S.upg={w:null,max:0,res:{}});s.res=s.res||{};return s};
const cur=()=>typeof C!=="undefined"&&C?C:null;
const goalB=()=>typeof G!=="undefined"&&G?G:null;
function mainNames(b){const g=b&&typeof mainGroup==="function"?mainGroup(b):null;return g?g.gems.map(x=>x.name).join(" "):""}
function weights(){const s=st();if(!s.w){const b=goalB()||cur();s.w=defaultWeights(typeof TG!=="undefined"?TG:null,typeof TC!=="undefined"?TC:null,mainNames(b));save()}return s.w}
function slotItem(slot){const b=cur();if(!b||typeof currentSlots!=="function")return null;const s=currentSlots(b).find(x=>x.name===slot);return s?b.items[s.itemId]:null}
async function statIds(){const idx=await tradeStatIndex();const out={};STATS.forEach(s=>{const id=idx.get(s.trade[0]+"|"+s.trade[1].toLowerCase());if(id)out[s.k]=id});return out}
let BUSY=false;
/* ---------- ranking by Path of Building ----------
   The top results go through the user's own Path of Building (Desktop tools → Path of Building numbers): each
   trade item becomes Ctrl+C-style item text, compared in this exact slot, ranked by real DPS and EHP per divine. */
const SLOT_CLASS={"Helmet":"Helmets","Body Armour":"Body Armours","Gloves":"Gloves","Boots":"Boots","Belt":"Belts","Amulet":"Amulets","Ring 1":"Rings","Ring 2":"Rings"};
const tx=v=>(typeof stripTags==="function"?stripTags(String(v||"")):String(v||"")).replace(/<<[^>]*>>/g,"").trim();
function apiItemText(it,slot){
  if(!it)return "";const L=[],mods=a=>(a||[]).map(m=>typeof m==="string"?m:m&&m.text).filter(Boolean).map(tx);
  L.push(`Item Class: ${SLOT_CLASS[slot]||""}`,`Rarity: ${["Normal","Magic","Rare","Unique"][it.frameType]||"Rare"}`);
  if(it.name&&tx(it.name))L.push(tx(it.name));L.push(tx(it.typeLine||it.baseType));
  L.push("--------");
  const q=(it.properties||[]).find(p=>p.name==="Quality");if(q&&q.values&&q.values[0])L.push(`Quality: ${q.values[0][0]}`);
  if(it.ilvl)L.push(`Item Level: ${it.ilvl}`);
  if(it.sockets&&it.sockets.length){const g={};it.sockets.forEach(x=>(g[x.group]=g[x.group]||[]).push(x.sColour||x.attr||"W"));L.push("Sockets: "+Object.values(g).map(a=>a.join("-")).join(" "))}
  const inf=it.influences||{};["shaper","elder","crusader","redeemer","hunter","warlord"].forEach(k=>{if(inf[k])L.push(`${k[0].toUpperCase()+k.slice(1)} Item`)});
  if(it.synthesised)L.push("Synthesised Item");if(it.fractured)L.push("Fractured Item");
  const ench=mods(it.enchantMods),imp=mods(it.implicitMods);
  if(ench.length||imp.length){L.push("--------");ench.forEach(m=>L.push(m+" (enchant)"));imp.forEach(m=>L.push(m+" (implicit)"))}
  const ex=[...mods(it.fracturedMods).map(m=>m+" (fractured)"),...mods(it.explicitMods),...mods(it.craftedMods).map(m=>m+" (crafted)")];
  if(ex.length){L.push("--------");ex.forEach(m=>L.push(m))}
  if(it.corrupted){L.push("--------","Corrupted")}
  return L.join("\n");
}
const pobOn=()=>{const s=st();return !!(DESK&&DESK.pobCompare&&s.usePob!==false&&LIVE.pob&&LIVE.pob.available&&LIVE.pob.enabled&&LIVE.pob.dir)};
async function pobRank(listings,slot,P){
  const rows=[];let errors=0,skill="";
  for(const x of listings){if(!x||!x.item)continue;
    const r=await DESK.pobCompare(apiItemText(x.item,slot),[slot]);
    if(!r||!r.ok||!r.summary||!r.summary.best){errors++;continue}
    const b=r.summary.best,c=toChaos(x.listing&&x.listing.price,P),div=c!=null&&P&&P.div?c/P.div:null;skill=r.summary.skill||skill;
    const value=b.dpsPct+0.7*b.ehpPct;
    rows.push({name:[tx(x.item.name),tx(x.item.typeLine)].filter(Boolean).join(" "),pob:{dps:b.dpsPct,ehp:b.ehpPct,life:b.d.life||0,es:b.d.es||0,res:(b.d.fire||0)+(b.d.cold||0)+(b.d.lightning||0)},
      gain:value,chaos:c,perDiv:div?value/Math.max(div,0.05):null,whisper:x.listing&&x.listing.whisper,price:x.listing&&x.listing.price,id:x.id});
  }
  return {list:rows.filter(r=>r.gain>0.05).sort((a,b)=>(b.perDiv??-1)-(a.perDiv??-1)||b.gain-a.gain),errors,skill,checked:rows.length};
}
const pct=v=>`${v>=0?"+":""}${v.toFixed(Math.abs(v)<10?1:0)}%`;

function render(){
  const el=$("btUpg");if(!el)return;const s=st();const w=weights();const C0=cur();
  const used=STATS.filter(x=>n(w[x.k]));
  el.innerHTML=`<h2>Upgrade finder</h2>
    <p class="small muted" style="margin:0">Scores each gear slot by the stats your build values, then searches the trade site for items that beat it, ranked by score gained per divine. Weights start from your goal build; change them to taste.${C0?"":" Import or sync your current character to compare against your real gear."}</p>
    <details${s.open?" open":""} id="upW"><summary class="small"><b>Stat weights</b> (${used.length} in use)</summary>
      <div class="up-w">${STATS.map(x=>`<label class="small"><span>${esc2(x.label)}</span><input type="number" step="0.1" min="0" value="${n(w[x.k])||""}" placeholder="0" data-upw="${x.k}"></label>`).join("")}</div>
      <div class="row"><button class="btn ghost small" id="upReset">Reset from my build</button></div></details>
    <div class="row"><label class="f" for="upMax" style="max-width:180px">Max price (divines, 0 = any)<input type="number" id="upMax" min="0" step="0.5" value="${s.max||0}"></label>
      ${LIVE.pob&&LIVE.pob.available&&LIVE.pob.dir&&LIVE.pob.enabled?`<label class="row small" style="align-self:end;gap:4px"><input type="checkbox" id="upPob"${s.usePob!==false?" checked":""}> Rank with Path of Building (real DPS and EHP)</label>`:""}
      <button class="btn primary small" id="upAll" style="align-self:end"${!DESK||BUSY?" disabled":""}>Check all slots</button><span class="small muted" id="upMsg" style="align-self:end">${DESK?"":"Trade searches run in the desktop app."}</span></div>
    <div class="tw"><table><thead><tr><th>Slot</th><th>Now</th><th>Score</th><th>Best find</th><th title="Weighted score gained per divine, or with Path of Building: DPS% + 0.7 × EHP% per divine">Gain / div</th><th></th></tr></thead><tbody>
    ${SLOTS.map(([slot])=>{const it=slotItem(slot);const sc=score(itemLines(it),w,slot).total;const r=s.res[slot];const best=r&&r.list&&r.list[0];
      return `<tr><td>${esc2(slot)}</td><td class="small">${it?esc2(it.name||it.base):'<span class="muted">empty</span>'}</td><td class="num">${sc.toFixed(0)}</td>
      <td class="small">${r&&r.err?`<span style="color:var(--warn)">${esc2(r.err)}</span>`:best?`${esc2(best.name)} · ${best.pob?`<b>DPS ${pct(best.pob.dps)}, EHP ${pct(best.pob.ehp)}</b>`:`+${best.gain.toFixed(0)}`} for ${best.price?esc2(best.price.amount+" "+best.price.currency):"?"}`:r?'<span class="muted">nothing better in budget</span>':""}</td>
      <td class="num">${best&&best.perDiv!=null?best.perDiv.toFixed(best.pob?1:0):""}</td>
      <td>${r&&r.list&&r.list.length?`<button class="btn ghost small" data-upshow="${esc2(slot)}">Show</button>`:`<button class="btn ghost small" data-upgo="${esc2(slot)}"${!DESK||BUSY?" disabled":""}>Search</button>`}</td></tr>`}).join("")}
    </tbody></table></div>
    <div id="upOut"></div>`;
  el.querySelectorAll("[data-upw]").forEach(i=>i.onchange=()=>{const v=Math.max(0,+i.value||0);if(v)w[i.dataset.upw]=v;else delete w[i.dataset.upw];s.res={};save();render()});
  $("upW").ontoggle=e=>{s.open=e.target.open;save()};
  $("upReset").onclick=()=>{const prev=s.w;s.w=null;s.res={};save();render();toast("Weights reset from your build.",()=>{s.w=prev;save();render()})};
  $("upMax").onchange=e=>{s.max=Math.max(0,+e.target.value||0);s.res={};save()};
  el.querySelectorAll("[data-upgo]").forEach(b=>b.onclick=()=>run([b.dataset.upgo]));
  el.querySelectorAll("[data-upshow]").forEach(b=>b.onclick=()=>{s.show=b.dataset.upshow;save();showList(s.show)});
  $("upAll").onclick=()=>run(SLOTS.map(x=>x[0]));
  const up=$("upPob");if(up)up.onchange=e=>{s.usePob=e.target.checked;s.res={};save();render()};
  const open=s.show&&s.res[s.show];if(open&&open.list&&open.list.length)showList(s.show);
}
function showList(slot){const s=st(),r=s.res[slot],o=$("upOut");if(!o||!r)return;
  if(r.pob){o.innerHTML=`<h3 style="margin:6px 0 0">${esc2(slot)}: best value by Path of Building${r.skill?` <span class="small muted">(${esc2(r.skill)})</span>`:""}</h3>
    <p class="small muted" style="margin:0">${r.checked} items checked against what you wear${r.errors?`; ${r.errors} couldn't be read`:""}. Value = DPS% + 0.7 × EHP%, per divine.</p>
    <div class="tw"><table><thead><tr><th>Item</th><th>Price</th><th class="num">DPS</th><th class="num">EHP</th><th class="num">Life</th><th class="num">Res</th><th class="num">Value / div</th><th></th></tr></thead><tbody>
    ${r.list.map((x,i)=>`<tr><td class="small">${esc2(x.name)}</td><td class="num">${x.price?esc2(x.price.amount+" "+x.price.currency):"?"}</td><td class="num">${pct(x.pob.dps)}</td><td class="num">${pct(x.pob.ehp)}</td><td class="num">${x.pob.life?`${x.pob.life>0?"+":""}${Math.round(x.pob.life)}`:""}</td><td class="num">${x.pob.res?`${x.pob.res>0?"+":""}${Math.round(x.pob.res)}%`:""}</td><td class="num"><b>${x.perDiv!=null?x.perDiv.toFixed(1):"–"}</b></td><td>${x.whisper?`<button class="btn ghost small" data-upwh="${i}">Copy whisper</button>`:""}</td></tr>`).join("")||`<tr><td colspan="8" class="muted small">None of these beat what you wear.</td></tr>`}
    </tbody></table></div><div class="row"><button class="btn ghost small" id="upTrade">Open this search on the trade site</button><button class="btn ghost small" id="upRe"${BUSY?" disabled":""}>Search again</button><span class="small muted">Whispers are copied for you to paste in game.</span></div>`;}
  else o.innerHTML=`<h3 style="margin:6px 0 0">${esc2(slot)}: best value</h3><div class="tw"><table><thead><tr><th>Item</th><th>Price</th><th>Score</th><th>Gain</th><th>Gain / div</th><th></th></tr></thead><tbody>
  ${r.list.map((x,i)=>`<tr><td class="small">${esc2(x.name)}</td><td class="num">${x.price?esc2(x.price.amount+" "+x.price.currency):"?"}</td><td class="num">${x.score.toFixed(0)}</td><td class="num">+${x.gain.toFixed(0)}</td><td class="num">${x.perDiv!=null?x.perDiv.toFixed(0):"–"}</td><td>${x.whisper?`<button class="btn ghost small" data-upwh="${i}">Copy whisper</button>`:""}</td></tr>`).join("")}
  </tbody></table></div><div class="row"><button class="btn ghost small" id="upTrade">Open this search on the trade site</button><button class="btn ghost small" id="upRe"${BUSY?" disabled":""}>Search again</button><span class="small muted">Whispers are copied for you to paste in game.</span></div>`;
  o.querySelectorAll("[data-upwh]").forEach(b=>b.onclick=()=>{const t=r.list[+b.dataset.upwh].whisper;if(DESK&&DESK.copy)DESK.copy(t);toast("Whisper copied. Paste it in game chat with Ctrl+V.")});
  $("upRe").onclick=()=>run([slot]);
  $("upTrade").onclick=()=>{const lg=encodeURIComponent(S.league||(LIVE.cfg&&LIVE.cfg.league)||"Standard");const u=`https://www.pathofexile.com/trade/search/${lg}/${r.searchId}`;if(DESK&&DESK.openExternal)DESK.openExternal(u);else window.open(u,"_blank","noopener")};
}
async function run(slots){
  if(BUSY||!DESK)return;BUSY=true;const s=st();const w=weights();const msg=()=>$("upMsg");
  try{
    const ids=await statIds();const P=typeof ninjaPrices==="function"?await ninjaPrices(false):null;
    const lg=S.league||(LIVE.cfg&&LIVE.cfg.league)||"Standard";
    for(let i=0;i<slots.length;i++){const slot=slots[i];const cat=SLOTS.find(x=>x[0]===slot)[1];
      if(msg())msg().textContent=`Searching ${slot} (${i+1} of ${slots.length})… the app paces requests to stay within the trade site's limits.`;
      const curSc=score(itemLines(slotItem(slot)),w,slot).total;
      const {q,used}=query(ids,w,slot,cat,curSc*1.1+1,s.max);
      if(!used){s.res[slot]={err:"No weighted stats apply to this slot."};continue}
      const sr=await DESK.http({url:`https://www.pathofexile.com/api/trade/search/${encodeURIComponent(lg)}`,method:"POST",body:q});
      if(sr.status===429){s.res[slot]={err:`Trade site busy: try again in ${sr.retryAfter||30}s.`};break}
      if(!sr.data||!sr.data.id){s.res[slot]={err:(sr.data&&sr.data.error&&sr.data.error.message)||"Search failed."};continue}
      const top=(sr.data.result||[]).slice(0,10);let list=[];
      let extra={};
      if(top.length){const fr=await DESK.http({url:`https://www.pathofexile.com/api/trade/fetch/${top.join(",")}?query=${sr.data.id}`});const got=(fr.data&&fr.data.result)||[];
        if(pobOn()){if(msg())msg().textContent=`Checking ${slot} results in Path of Building (${i+1} of ${slots.length})…`;const pr=await pobRank(got,slot,P);
          if(pr.checked){list=pr.list;extra={pob:true,skill:pr.skill,checked:pr.checked,errors:pr.errors}}else list=rank(got,w,slot,curSc,P)}
        else list=rank(got,w,slot,curSc,P)}
      s.res[slot]={list,searchId:sr.data.id,total:sr.data.total,at:Date.now(),...extra};s.show=slot;save();render();
    }
    if(msg())msg().textContent="Done. Click a slot's Search to see its list.";
  }catch(e){if(msg())msg().textContent="Couldn't search: "+(e.message||e)}
  finally{BUSY=false;render()}
}
UP.render=render;
UP._test={STATS,SLOTS,defaultWeights,score,query,rank,toChaos,itemLines,apiItemText,pobRank};
})();
