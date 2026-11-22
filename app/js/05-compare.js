// Exile Companion main window, part 5 of 10: goal vs current comparison.
// Classic scripts loaded in order by index.html; they share one global scope, so order matters.
"use strict";
/* ---------------- goal vs current ---------------- */
const tmpl=t=>t.toLowerCase().replace(/\d+(\.\d+)?/g,"#").replace(/\s+/g," ").trim();
const valOf=t=>{const m=t.match(/Adds (\d+(?:\.\d+)?) to (\d+(?:\.\d+)?)/i);if(m)return (+m[1]+ +m[2])/2;const n=t.match(/\d+(\.\d+)?/);return n?+n[0]:null};
function compareSlot(slot,gItem){
  const cItem=(slotItemsOf(C).find(x=>x.slot===slot)||{}).item;
  if(!cItem) return {status:"missing",cItem:null,mods:[]};
  if(gItem.rarity==="UNIQUE"){const same=cItem.rarity==="UNIQUE"&&cItem.name===gItem.name;return {status:same?"done":"swap",cItem,mods:[]}}
  if(/Flask/i.test(slot)) return {status:cItem.base===gItem.base?"done":"swap",cItem,mods:[]};
  const cm=[...cItem.implicits,...cItem.mods];
  const isW=/Weapon/i.test(slot);
  const mods=gItem.mods.filter(m=>!m.crafted).map(m=>{
    const w=modWant(m.text);const must=w.prio>=(isW?3:4);
    const hit=cm.find(x=>tmpl(x.text)===tmpl(m.text));
    const gv=valOf(m.text), cv=hit?valOf(hit.text):null;
    const st=!hit?"missing":(gv==null||cv==null||cv>=gv*0.8)?"met":"short";
    return {text:m.text,must,st,gv,cv};
  });
  const must=mods.filter(m=>m.must);
  const ok=must.filter(m=>m.st==="met").length;
  const status=!must.length?(cItem.base===gItem.base?"done":"close"):ok===must.length?"done":ok>=must.length/2?"close":"upgrade";
  return {status,cItem,mods,ok,total:must.length};
}
const ST_LABEL={done:["Done","good"],close:["Close","warn"],upgrade:["Upgrade","bad"],missing:["Empty slot","bad"],swap:["Get the unique","bad"]};
function curCompareHtml(slot,gItem){
  if(!C||C===G) return "";
  const r=compareSlot(slot,gItem);const [lab,cls]=ST_LABEL[r.status];
  return `<h3>Your current ${esc(slot)} <span class="pill ${cls}">${lab}</span></h3>
    ${r.cItem?`<p class="small" style="margin:0"><span class="t-${r.cItem.rarity.toLowerCase()}">${esc(r.cItem.name)}</span>${r.cItem.base!==r.cItem.name?` <span class="muted">· ${esc(r.cItem.base)}</span>`:""}</p>`:'<p class="small muted" style="margin:0">Nothing equipped here.</p>'}
    ${r.mods.length?`<div>${r.mods.map(m=>`<div class="mstat"><span>${m.must?"<b>":""}${esc(m.text)}${m.must?"</b>":""}</span><span class="pill ${m.st==="met"?"good":m.st==="short"?"warn":"bad"}">${m.st==="met"?"have":m.st==="short"?`${m.cv} / ${m.gv}`:"missing"}</span></div>`).join("")}</div>`:""}`;
}
function gemMap(b){const m=new Map();currentSkills(b).forEach(s=>s.enabled&&s.gems.forEach(g=>{if(!g.enabled)return;const o=m.get(g.name);if(!o||g.level>o.level)m.set(g.name,g)}));return m}
function compareAll(){
  const gItems=slotItemsOf(G);
  const items=gItems.map(x=>({slot:x.slot,item:x.item,...compareSlot(x.slot,x.item)}));
  const gg=gemMap(G), cg=gemMap(C);
  const gems=[...gg.values()].map(g=>{const c=cg.get(g.name);return {g,c,st:!c?"missing":(c.level<Math.min(g.level,20)||c.quality<Math.min(g.quality,20))?"low":"ok"}});
  const links=currentSkills(G).filter(s=>s.enabled&&s.gems.length).map(s=>{
    const act=s.gems.find(g=>g.enabled&&!/Support/i.test(g.name))||s.gems[0];
    const cs=currentSkills(C).find(x=>x.gems.some(g=>g.name===act.name));
    const need=s.gems.filter(g=>g.enabled).length, have=cs?cs.gems.filter(g=>g.enabled).length:0;
    return {label:s.label||act.name,slot:s.slot,act:act.name,need,have,main:s===mainGroup(G)};
  });
  const gs=currentSpec(G), cs=currentSpec(C);
  const gIds=new Set(gs?gs.ids:[]), cIds=new Set(cs?cs.ids:[]);
  const shared=[...gIds].filter(i=>cIds.has(i)).length;
  const nm=id=>(TREE.n[id]&&TREE.n[id][0])||TREE.a[id]||null;
  const addNamed=[...gIds].filter(i=>!cIds.has(i)).map(nm).filter(Boolean);
  const remNamed=[...cIds].filter(i=>!gIds.has(i)).map(nm).filter(Boolean);
  const tree={goal:gIds.size,cur:cIds.size,shared,toAdd:gIds.size-shared,toRemove:[...cIds].filter(i=>!gIds.has(i)).length,gUrl:gs&&gs.url,cUrl:cs&&cs.url,addNamed,remNamed};
  const itemScore=items.length?items.reduce((a,x)=>a+(x.status==="done"?1:x.status==="close"?0.6:x.total?(x.ok||0)/x.total*0.5:0),0)/items.length:1;
  const gemScore=gems.length?gems.reduce((a,x)=>a+(x.st==="ok"?1:x.st==="low"?0.6:0),0)/gems.length:1;
  const treeScore=tree.goal?shared/tree.goal:1;
  const lvlScore=Math.min(1,C.level/Math.max(1,G.level));
  const overall=Math.round((itemScore*0.35+gemScore*0.2+treeScore*0.3+lvlScore*0.15)*100);
  return {items,gems,links,tree,scores:{items:itemScore,gems:gemScore,tree:treeScore,level:lvlScore},overall};
}
function nextSteps(r){
  const out=[];const res=TC.res;
  ["fire","cold","lightning"].forEach(k=>{if(res[k]!=null&&res[k]<75)out.push({p:10,t:`Cap ${k} resistance: you're at ${res[k]}%, need 75%.`,tab:"craft",btn:"Crafting"})});
  if(TG.res.chaos!=null&&TC.res.chaos!=null&&TC.res.chaos<Math.min(0,TG.res.chaos)) out.push({p:5,t:`Raise chaos resistance: ${TC.res.chaos}% now, the guide has ${TG.res.chaos}%.`,tab:"shop",btn:"Shopping list"});
  if(G.ascend&&C.ascend&&G.ascend!==C.ascend) out.push({p:11,t:`Your character is ${C.ascend} but the guide is ${G.ascend}. Check you imported the right builds.`});
  r.links.filter(l=>l.main&&l.have<l.need).forEach(l=>out.push({p:9,t:`Link your main skill: ${l.have||0}-link now, the guide uses a ${l.need}-link${l.slot?` in ${l.slot}`:""}.`,tab:"shop",btn:"Shopping list"}));
  r.gems.filter(x=>x.st==="missing").forEach(x=>out.push({p:/^Awakened/i.test(x.g.name)?2:7,t:`Get ${x.g.name}${/^Awakened/i.test(x.g.name)?" (late upgrade)":""}.`,tab:"shop",btn:"Shopping list"}));
  r.items.filter(x=>x.item.rarity==="UNIQUE"&&x.status!=="done").forEach(x=>out.push({p:8,t:`Get ${x.item.name} for your ${x.slot}.`,tab:"shop",btn:"Shopping list"}));
  r.items.filter(x=>x.item.rarity!=="UNIQUE"&&(x.status==="upgrade"||x.status==="missing")).forEach(x=>{const miss=x.mods.filter(m=>m.must&&m.st!=="met").map(m=>m.text);out.push({p:6,t:`Upgrade your ${x.slot}${miss.length?`: still need ${miss.slice(0,2).join("; ")}${miss.length>2?"…":""}`:""}.`,tab:"craft",btn:"Plan craft",slot:x.slot})});
  if(r.tree.toAdd>0) out.push({p:6,t:`Allocate ${r.tree.toAdd} guide passives you don't have yet${G.level>C.level?` (${G.level-C.level} levels to go)`:""}.`,tab:"build",btn:"Open tree"});
  if(r.tree.toRemove>0) out.push({p:4,t:`Refund ${r.tree.toRemove} passives the guide doesn't use (Orbs of Regret, or quest respec points).`});
  r.items.filter(x=>x.item.rarity!=="UNIQUE"&&x.status==="close").forEach(x=>out.push({p:3,t:`Polish your ${x.slot}: ${x.ok}/${x.total} key mods met.`,tab:"craft",btn:"Plan craft",slot:x.slot}));
  r.gems.filter(x=>x.st==="low").forEach(x=>out.push({p:3,t:`Level ${x.g.name}: ${x.c.level}/${x.c.quality} now, guide ${x.g.level}/${x.g.quality}.`}));
  if(TC.dps<TG.dps*0.5) out.push({p:1,t:`Your DPS is ${Math.round(TC.dps/Math.max(1,TG.dps)*100)}% of the guide's. The steps above close most of that gap.`});
  return out.sort((a,b)=>b.p-a.p);
}
function renderProgress(){
  if(!C){
    $("progSummary").innerHTML=`<h2>How close are you?</h2><p style="margin:0">Import your <b>current character</b> to compare it with your goal build.</p><p class="small muted" style="margin:0">In Path of Building: Import/Export Build → Import character → enter your account name, pick the character, then Generate a code and paste it here.</p><div><button class="btn primary" id="progImp">Import current character</button></div>`;
    $("progImp").onclick=()=>openImport("current");
    ["progNext","progStats","progTree","progGems","progItems"].forEach(id=>$(id).hidden=true);return;
  }
  ["progNext","progStats","progTree","progGems","progItems"].forEach(id=>$(id).hidden=false);
  renderCost();
  const r=compareAll(), sc=r.scores;
  const bar=(l,v)=>`<div><div class="row" style="justify-content:space-between"><span class="small">${l}</span><span class="small num">${Math.round(v*100)}%</span></div><div class="meter"><i style="width:${Math.round(v*100)}%"></i></div></div>`;
  $("progSummary").innerHTML=`<div class="row" style="justify-content:space-between;align-items:flex-end"><div><h2>How close are you?</h2><p class="small muted" style="margin:0">${esc(C.ascend||C.className)} Lv ${C.level} → ${esc(G.ascend||G.className)} Lv ${G.level}</p></div><div class="big num">${r.overall}%</div></div>
    <div style="display:grid;gap:8px">${bar("Passive tree",sc.tree)}${bar("Gear",sc.items)}${bar("Gems",sc.gems)}${bar("Level",sc.level)}</div>
    ${(exG||exC)?'<p class="note" style="margin:0">One or both builds are examples. Import yours from the chips at the top.</p>':""}`;
  const steps=nextSteps(r);
  $("progNext").innerHTML=`<h2>What to do next</h2>${steps.length?`<ol class="steps">${steps.slice(0,12).map((s,i)=>`<li><div class="row" style="justify-content:space-between"><span>${esc(s.t)}</span>${s.tab?`<button class="btn ghost small" data-go="${s.tab}" data-slot="${esc(s.slot||"")}">${esc(s.btn)}</button>`:""}</div></li>`).join("")}</ol>${steps.length>12?`<p class="small muted" style="margin:0">+${steps.length-12} smaller steps below.</p>`:""}`:'<p style="margin:0">Your character matches the goal build. Time to pick a new goal!</p>'}`;
  document.querySelectorAll("[data-go]").forEach(b=>b.onclick=()=>{if(b.dataset.slot){selectedSlot=b.dataset.slot;renderCraft()}if(b.dataset.go==="build"){S.view="goal";save();renderBuild();bindItems()}showTab(b.dataset.go)});
  const rows=[["Level",C.level,G.level],["DPS",TC.dps,TG.dps,1],["Life",TC.life,TG.life,1],["Energy shield",TC.es,TG.es,1],["Effective HP",TC.ehp,TG.ehp,1],["Fire res",TC.res.fire,TG.res.fire],["Cold res",TC.res.cold,TG.res.cold],["Lightning res",TC.res.lightning,TG.res.lightning],["Chaos res",TC.res.chaos,TG.res.chaos],["Passives",r.tree.cur,r.tree.goal]];
  $("progStats").innerHTML=`<h2>Stats: now vs goal</h2><div class="tw"><table><thead><tr><th>Stat</th><th>Now</th><th>Goal</th><th>Gap</th></tr></thead><tbody>${rows.map(([k,c,g,f])=>{if(c==null&&g==null)return"";const d=(c||0)-(g||0);const show=v=>v==null?"?":f?fmt(v):v;return `<tr><td>${k}</td><td class="num">${show(c)}</td><td class="num">${show(g)}</td><td class="num delta ${d>=0?"pos":"neg"}">${d>=0?"✓":(f?"−"+fmt(-d):d)}</td></tr>`}).join("")}</tbody></table></div>`;
  const t=r.tree;
  $("progTree").innerHTML=`<h2>Passive tree</h2>
    <div class="stats"><div class="stat"><div class="k">Matching</div><div class="v num">${t.shared}/${t.goal}</div></div><div class="stat"><div class="k">To allocate</div><div class="v num">${t.toAdd}</div></div><div class="stat"><div class="k">To refund</div><div class="v num">${t.toRemove}</div></div></div>
    <p class="small" style="margin:0">${t.toRemove?`Refund the ${t.toRemove} off-guide passives when you have Orbs of Regret or respec points, then follow the guide's tree.`:t.toAdd?"You're on the guide's path. Keep levelling and allocating.":"Your tree matches the guide."}</p>
    ${t.addNamed.length?`<p class="small" style="margin:0"><b>Notables to take:</b> ${t.addNamed.slice(0,20).map(esc).join(", ")}${t.addNamed.length>20?"…":""}</p>`:""}
    ${t.remNamed.length?`<p class="small" style="margin:0"><b>Not in the guide:</b> ${t.remNamed.slice(0,12).map(esc).join(", ")}</p>`:""}
    <div class="row small">${t.cUrl&&!exC?`<a href="${esc(t.cUrl)}" target="_blank" rel="noopener">Your tree</a>`:""}${t.gUrl&&!exG?`<a href="${esc(t.gUrl)}" target="_blank" rel="noopener">Guide tree</a>`:""}</div>
    <p class="note" style="margin:0">Compares the active tree in each import. Pick a different guide stage on the Build tab (Goal view) to compare against an earlier tree.</p>`;
  $("progGems").innerHTML=`<h2>Gems & links</h2>
    ${r.links.map(l=>`<div class="mstat"><span>${l.main?"<b>":""}${esc(l.label)}${l.main?"</b>":""}${l.slot?` <span class="muted">· ${esc(l.slot)}</span>`:""}</span><span class="pill ${l.have>=l.need?"good":l.have?"warn":"bad"}">${l.have}/${l.need} links</span></div>`).join("")}
    <h3 style="margin-top:6px">Gems</h3>
    ${r.gems.map(x=>`<div class="mstat"><span>${esc(x.g.name)} <span class="muted small num">${x.c?x.c.level+"/"+x.c.quality+" → ":""}${x.g.level}/${x.g.quality}</span></span><span class="pill ${x.st==="ok"?"good":x.st==="low"?"warn":"bad"}">${x.st==="ok"?"have":x.st==="low"?"level up":"missing"}</span></div>`).join("")}`;
  $("progItems").innerHTML=`<h2>Gear by slot</h2>${r.items.map(x=>{const [lab,cls]=ST_LABEL[x.status];return `<button class="item ${x.item.rarity}" data-pslot="${esc(x.slot)}"><span class="row" style="justify-content:space-between"><span class="slot">${esc(x.slot)}</span><span class="pill ${cls}">${lab}${x.total&&x.status!=="done"?` · ${x.ok}/${x.total}`:""}</span></span><span class="nm">${esc(x.item.name)}</span><span class="small muted">Now: ${x.cItem?esc(x.cItem.name):"nothing equipped"}</span></button>`}).join("")}<p class="note" style="margin:0">Tap a slot for the mod-by-mod comparison and crafting plan.</p>`;
  document.querySelectorAll("[data-pslot]").forEach(b=>b.onclick=()=>{selectedSlot=b.dataset.pslot;renderCraft();showTab("craft")});
}
