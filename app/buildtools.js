/* Build tools: gem levelling profit, cluster jewel notables, timeless jewel lookup and a meta check.
   Jewel data comes from Path of Building Community (MIT); prices from poe.ninja's economy API. Reads only. */
"use strict";
(function(){
const BT={};window.BuildTools=BT;
const esc2=s=>String(s==null?"":s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const open=u=>{if(typeof DESK!=="undefined"&&DESK&&DESK.openExternal)DESK.openExternal(u);else window.open(u,"_blank","noopener")};
const goal=()=>typeof G!=="undefined"&&G?G:null;
let P=null;
const money=c=>c==null||!isFinite(c)?"–":P&&P.div&&Math.abs(c)>=P.div*0.8?(c/P.div).toFixed(1)+" div":(Math.abs(c)>=100?Math.round(c).toLocaleString():c.toFixed(Math.abs(c)<10?1:0))+"c";
function st(){const s=S.btools||(S.btools={gems:{min:10,q:"",kind:"all"},cl:{size:"Large",tag:""},tj:{jewel:"Militant Faith",seed:"",conq:"",socket:"",alloc:true,want:[]},tjUsed:false});
  s.gems=s.gems||{min:10,q:"",kind:"all"};s.cl=s.cl||{size:"Large",tag:""};s.tj=s.tj||{jewel:"Militant Faith",seed:"",conq:"",socket:"",alloc:true,want:[]};s.tj.want=s.tj.want||[];return s}

/* ---------- gem levelling profit ---------- */
function gemVariant(l){
  const m=String(l.variant||"").match(/^(\d+)(?:\/(\d+))?(c)?$/);
  const lvl=m?+m[1]:(l.gemLevel||1),q=m?+(m[2]||0):(l.gemQuality||0),c=m?!!m[3]:!!l.corrupted;
  return {lvl,q,c,price:l.chaosValue,n:l.listingCount||0};
}
// lines: {name:[poe.ninja SkillGem lines]}; gcp: Gemcutter's Prism price
function gemProfits(items,gcp,minList){
  const out=[];
  for(const [name,lines] of Object.entries(items||{})){
    const v=(lines||[]).map(gemVariant).filter(x=>!x.c&&x.price!=null&&x.n>=minList);
    if(v.length<2)continue;
    const find=(lvl,q)=>v.find(x=>x.lvl===lvl&&x.q===q);
    const lo=Math.min(...v.map(x=>x.lvl)),hi=Math.max(...v.filter(x=>x.lvl<=20).map(x=>x.lvl));
    if(!(hi>lo))continue;
    const buy=find(lo,0)||find(lo,20);if(!buy)continue;
    const sell0=find(hi,0),sell20=find(hi,20);
    const opts=[];
    if(sell0&&buy.q===0)opts.push({how:`Level ${lo} → ${hi}`,cost:buy.price,sell:sell0.price});
    if(sell20)opts.push({how:`Level ${lo}${buy.q?"/20":""} → ${hi}/20${buy.q?"":" (+20 Gemcutter's)"}`,cost:buy.price+(buy.q?0:20*(gcp||0)),sell:sell20.price,needGcp:!buy.q});
    if(sell0&&sell20&&gcp)opts.push({how:`Quality a level ${hi} gem (20 Gemcutter's)`,cost:sell0.price+20*gcp,sell:sell20.price,quality:true});
    opts.forEach(o=>{o.profit=o.sell-o.cost;o.name=name;o.support=/Support$/.test(name);o.awakened=/^Awakened /.test(name);o.listings=Math.min(buy.n,(sell20||sell0||{}).n||0)});
    const best=opts.filter(o=>!o.needGcp||gcp).sort((a,b)=>b.profit-a.profit)[0];
    if(best&&best.profit>0)out.push(best);
  }
  return out.sort((a,b)=>b.profit-a.profit);
}

/* ---------- cluster jewels ---------- */
function clusterNotables(tag,data){
  data=data||window.CLUSTERDATA;if(!data)return [];
  const pool=data.notables.filter(n=>n.w[tag]>0);
  const tot={P:0,S:0};pool.forEach(n=>tot[n.t]+=n.w[tag]);
  return pool.map(n=>({...n,weight:n.w[tag],share:n.w[tag]/tot[n.t]})).sort((a,b)=>b.share-a.share);
}
// enchants that fit the build: from analyze() traits
function clusterSuggest(t,data){
  data=data||window.CLUSTERDATA;if(!data||!t)return [];
  const words=[];
  const EL={fire:"Fire",cold:"Cold",lightning:"Lightning",chaos:"Chaos",phys:"Physical"};
  (t.elems||[]).forEach(e=>EL[e]&&words.push(EL[e]));
  if(t.minion)words.push("Minion");if(t.totem)words.push("Totem");if(t.trap)words.push("Trap and Mine");if(t.dot)words.push("Damage over Time");
  const out=[];
  for(const [size,sz] of Object.entries(data.sizes))for(const sk of sz.skills){
    if(words.some(w=>sk.name.includes(w))&&/Damage/.test(sk.name)&&!/Legacy/.test(sk.name)&&!(sk.name.includes("over Time")&&!t.dot)&&!(sk.name.includes("Minion")&&!t.minion))out.push({size,tag:sk.tag,name:sk.name});
  }
  return out;
}

/* ---------- timeless jewels ---------- */
const TJ={bytes:{}};
const CONQ_ALL=()=>Object.values(window.TIMELESS.jewels).flatMap(j=>j.conq.map(c=>[c,j]));
async function inflate(b64){
  const bin=Uint8Array.from(atob(b64),c=>c.charCodeAt(0));
  if(typeof DecompressionStream==="undefined")throw new Error("This browser can't unpack the jewel data.");
  const ds=new DecompressionStream("deflate");const buf=await new Response(new Blob([bin]).stream().pipeThrough(ds)).arrayBuffer();return new Uint8Array(buf);
}
async function jewelBytes(name){if(!TJ.bytes[name])TJ.bytes[name]=await inflate(window.TIMELESS.jewels[name].data);return TJ.bytes[name]}
function notIndex(){if(!TJ.idx){TJ.idx={};window.TIMELESS.notables.forEach((id,i)=>TJ.idx[id]=i)}return TJ.idx}
function seedOk(j,seed){return Number.isInteger(seed)&&seed>=j.min&&seed<=j.max&&(seed-j.min)%j.step===0}
// what a notable becomes: {kind:"replace"|"add", node}
function lookup(T,bytes,name,seed,nodeId){
  const j=T.jewels[name];const row=notIndex()[nodeId];if(row==null||!seedOk(j,seed))return null;
  const size=(j.max-j.min)/j.step+1;const b=bytes[row*size+(seed-j.min)/j.step];
  const g=j.l2g[b]!=null?j.l2g[b]:b;
  return g>=337?{kind:"replace",node:T.nodes[g-337],gid:g}:{kind:"add",node:T.additions[g],gid:g};
}
function smallEffect(T,j){
  const t=j.type;
  if(t==="karui")return "+4 to Strength (+2 on attribute passives)";
  if(t==="maraketh")return "+4 to Dexterity (+2 on attribute passives)";
  if(t==="kalguur")return "2% increased Ward (1% on attribute passives)";
  if(t==="templar")return `+5 to Devotion; attribute passives become "${T.nodes[T.small.templar].s.join(", ")}"`;
  if(t==="eternal")return "Small passives lose their stats";
  return "";
}
function parseTimeless(text){
  if(!window.TIMELESS)return null;
  for(const [c,j] of CONQ_ALL()){const m=String(text).match(new RegExp("(\\d+)[^\\n]*?\\b"+c+"\\b"));if(m){const name=Object.keys(window.TIMELESS.jewels).find(k=>window.TIMELESS.jewels[k]===j);return {jewel:name,seed:+m[1],conq:c}}}
  return null;
}
// goal build: timeless jewels with their sockets, and allocated nodes
function goalTimeless(){
  const b=goal();if(!b||typeof currentSpec!=="function")return [];
  const sp=currentSpec(b);if(!sp)return [];
  return (sp.sockets||[]).map(s=>{const it=b.items[s.itemId];if(!it)return null;const text=[it.name,it.base,...(it.implicits||[]),...(it.mods||[])].map(x=>typeof x==="string"?x:x&&x.text).join("\n");const p=parseTimeless(text);return p?{...p,socket:String(s.node)}:null}).filter(Boolean);
}
function allocated(){const b=goal();if(!b||typeof currentSpec!=="function")return null;const sp=currentSpec(b);return sp?new Set((sp.ids||[]).map(String)):null}
async function seedSearch(T,name,socket,want,onlyIds){
  const j=T.jewels[name];const bytes=await jewelBytes(name);
  const ids=(T.sockets[socket]||[]).filter(id=>T.tree[id]&&T.tree[id][0]==="n"&&(!onlyIds||onlyIds.has(String(id))));
  const W=new Set(want);const res=[];
  for(let seed=j.min;seed<=j.max;seed+=j.step){let n=0;const hits=[];for(const id of ids){const r=lookup(T,bytes,name,seed,id);if(r&&W.has(r.node.id)){n++;hits.push(T.tree[id][1])}}if(n)res.push({seed,n,hits})}
  res.sort((a,b)=>b.n-a.n||a.seed-b.seed);
  const top=res.length?res[0].n:0;const out=res.slice(0,25);out.tied=res.filter(x=>x.n===top).length;out.total=res.length;return out;
}

/* ---------- UI ---------- */
/* ---------- support gems by Path of Building ----------
   Asks the user's Path of Building what each support in the main skill adds, what +1 level to the skill gem adds,
   and which compatible supports would beat the weakest one (Desktop tools → Path of Building numbers). */
let SUP=null,SUP_BUSY=false;
function gemPriceFor(name,level){
  const lines=P&&P.items&&P.items[name];if(!lines||!lines.length)return null;
  const exact=lines.filter(l=>new RegExp(`^${level}(/|$)`).test(String(l.variant||l.gemLevel||"")));
  const pool=(exact.length?exact:lines).map(l=>l.chaosValue).filter(v=>v!=null);return pool.length?Math.min(...pool):null;
}
const sgn=v=>`${v>=0?"+":""}${v.toFixed(Math.abs(v)<10?1:0)}%`;
function renderSupports(){
  const el=$("btSupports");if(!el)return;
  const ok=typeof DESK!=="undefined"&&DESK&&DESK.pobGems&&LIVE.pob&&LIVE.pob.available&&LIVE.pob.enabled&&LIVE.pob.dir;
  const r=SUP,chaos=c=>c==null?"":P&&P.div&&c>=P.div*0.9?`${(c/P.div).toFixed(1)} div`:`${Math.round(c)}c`;
  el.innerHTML=`<h2>Support gems (Path of Building)</h2>
    <p class="small" style="margin:0">What each support in your main skill really adds, what one more level of the skill gem is worth, and which supports would beat your weakest one, all calculated by your own Path of Building on your imported build.</p>
    ${!ok?`<p class="small muted" style="margin:0">Needs the desktop app with Path of Building Community found (Desktop tools → Path of Building numbers).</p>`
    :`<div class="row"><button class="btn ${r?"ghost":"primary"} small" id="supGo"${SUP_BUSY?" disabled":""}>${SUP_BUSY?"Calculating… (can take up to a minute)":r?"Calculate again":"Compare supports"}</button></div>`}
    ${r&&!r.ok?`<p class="small err" style="margin:0">${esc(r.error||(r.missing?"Path of Building wasn't found.":"Couldn't compare."))}</p>`:""}
    ${r&&r.ok?`<div class="cols2">
      <div><h3>${esc(r.skill||"Main skill")}: what each support adds</h3><div class="tw"><table><tbody>
        ${r.current.map(c=>`<tr><td>${esc(c.name)} <span class="muted small">${c.level}/${c.quality||0}</span></td><td class="num"><b>${sgn(c.worth)}</b> more damage</td></tr>`).join("")||`<tr><td class="muted">No supports found in the main skill.</td></tr>`}
        ${r.levelUp?`<tr><td>${esc(r.levelUp.name)} level ${r.levelUp.level} → ${r.levelUp.level+1}</td><td class="num"><b>${sgn(r.levelUp.gain)}</b></td></tr>`:""}
      </tbody></table></div></div>
      ${r.replace?`<div><h3>Instead of ${esc(r.replace.name)} (${sgn(r.replace.worth)})</h3><div class="tw"><table><thead><tr><th>Support</th><th class="num" title="All damage, including damage over time">Total</th><th class="num" title="Damage from your skill's hits">Hits</th><th class="num">Price</th></tr></thead><tbody>
        ${r.candidates.slice(0,12).map(c=>{const pr=gemPriceFor(c.name,c.level),dot=c.hitGain!=null&&c.gain>5&&c.hitGain<c.gain*0.25;
          return `<tr><td>${esc(c.name)} <span class="muted small">${c.level}/20</span>${dot?` <span class="pill warn" title="Most of this comes from an extra damage-over-time effect that doesn't scale much with your build. Check it fits how you play.">mostly added DoT</span>`:""}</td><td class="num"><b class="${c.gain>0?"good":"bad"}">${sgn(c.gain)}</b></td><td class="num">${c.hitGain!=null?sgn(c.hitGain):""}</td><td class="num muted">${chaos(pr)}</td></tr>`}).join("")}
      </tbody></table></div><p class="small muted" style="margin:0">${r.tried} compatible supports tried at max level, 20% quality. "Total" counts every damage source Path of Building does, including added damage over time; "Hits" is your skill's own hit damage.</p></div>`:""}
    </div>`:""}`;
  const b=$("supGo");if(b)b.onclick=async()=>{SUP_BUSY=true;renderSupports();try{SUP=await DESK.pobGems()}catch(e){SUP={ok:false,error:e.message}}SUP_BUSY=false;renderSupports()};
}
async function render(){
  const root=$("buildTools");if(!root)return;
  root.innerHTML=`<div class="card hl" id="btUpg"></div>
    <div class="card" id="btSupports"></div>
    <div class="card" id="btTimeless"></div>
    <div class="grid"><div class="card" id="btCluster"></div><div class="card" id="btMeta"></div></div>
    <div class="card" id="btGems"></div>`;
  renderMeta();renderTimeless();renderSupports();
  loadScriptOnce("upgrades.js","Upgrades").then(()=>Upgrades.render()).catch(e=>{const u=$("btUpg");if(u)u.innerHTML=`<h2>Upgrade finder</h2>${emptyBox("Couldn't load: "+(e.message||e))}`});
  if(!window.CLUSTERDATA){try{await loadScriptOnce("clusterdata.js","CLUSTERDATA")}catch(e){}}
  renderCluster();renderGems();
  if(typeof DESK!=="undefined"&&DESK&&typeof ninjaPrices==="function"){try{P=await ninjaPrices(false)}catch(e){P=null}renderGems();renderSupports()}
}

function renderGems(){
  const el=$("btGems");if(!el)return;const s=st().gems;
  if(!P){el.innerHTML=`<h2>Gem levelling profit</h2>${emptyBox(typeof DESK!=="undefined"&&DESK?"Loading gem prices from poe.ninja…":"Gem prices load in the desktop app, which can reach poe.ninja.")}`;return}
  const gcp=(P.cur&&P.cur["Gemcutter's Prism"])||null;
  let rows=gemProfits(P.items&&Object.fromEntries(Object.entries(P.items).filter(([k,l])=>l&&l[0]&&(l[0].variant!=null||l[0].gemLevel!=null))),gcp,s.min);
  if(s.kind==="support")rows=rows.filter(r=>r.support);else if(s.kind==="awakened")rows=rows.filter(r=>r.awakened);else if(s.kind==="active")rows=rows.filter(r=>!r.support);
  if(s.q)rows=rows.filter(r=>r.name.toLowerCase().includes(s.q.toLowerCase()));
  el.innerHTML=`<h2>Gem levelling profit</h2>
    <p class="small muted" style="margin:0">Buy low-level gems, level them in your gear, sell them higher. Uncorrupted prices from poe.ninja${gcp?`; Gemcutter's Prism at ${money(gcp)}`:""}. Levelling to 20 takes a long time for most gems, so weigh profit against how long a socket is busy.</p>
    <div class="fgrid">
      <label class="f" for="btGq">Find<input type="search" id="btGq" value="${esc2(s.q)}" placeholder="Gem name"></label>
      <label class="f" for="btGk">Show<select id="btGk">${[["all","All gems"],["active","Skill gems"],["support","Support gems"],["awakened","Awakened gems"]].map(([v,l])=>`<option value="${v}"${s.kind===v?" selected":""}>${l}</option>`).join("")}</select></label>
      <label class="f" for="btGm">Min listings<input type="number" id="btGm" min="1" value="${s.min}"></label>
    </div>
    ${rows.length?`<div class="tw"><table><thead><tr><th>Gem</th><th>Plan</th><th>Cost</th><th>Sells for</th><th>Profit</th><th>Listings</th></tr></thead><tbody>
    ${rows.slice(0,40).map(r=>`<tr><td>${esc2(r.name)}</td><td class="small">${esc2(r.how)}</td><td class="num">${money(r.cost)}</td><td class="num">${money(r.sell)}</td><td class="num"><b>${money(r.profit)}</b></td><td class="num">${r.listings}</td></tr>`).join("")}
    </tbody></table></div>`:emptyBox("No profitable gems with that many listings. Lower the minimum listings or clear the search.")}`;
  $("btGq").oninput=e=>{s.q=e.target.value;save();clearTimeout(BT._gt);BT._gt=setTimeout(()=>{renderGems();const i=$("btGq");if(i){i.focus();i.setSelectionRange(i.value.length,i.value.length)}},250)};
  $("btGk").onchange=e=>{s.kind=e.target.value;save();renderGems()};
  $("btGm").onchange=e=>{s.min=Math.max(1,+e.target.value||1);save();renderGems()};
}

function renderCluster(){
  const el=$("btCluster");if(!el)return;const s=st().cl;const D=window.CLUSTERDATA;
  if(!D){el.innerHTML=`<h2>Cluster jewels</h2>${emptyBox("Couldn't load the cluster jewel data.")}`;return}
  const t=typeof TG!=="undefined"?TG:null;const sug=clusterSuggest(t,D);
  const skills=D.sizes[s.size].skills;if(!skills.some(k=>k.tag===s.tag))s.tag=(sug.find(x=>x.size===s.size)||skills[0]).tag;
  const sk=skills.find(k=>k.tag===s.tag);const list=clusterNotables(s.tag,D);
  const words=t?(t.elems||[]).map(e=>({fire:"fire",cold:"cold",lightning:"lightning",chaos:"chaos",phys:"physical"}[e])).filter(Boolean):[];
  const fits=n=>words.some(w=>n.s.join(" ").toLowerCase().includes(w));
  el.innerHTML=`<h2>Cluster jewels</h2>
    <p class="small muted" style="margin:0">Which notables each enchant can roll, and how likely each one is. A ${s.size.toLowerCase()} jewel has ${D.sizes[s.size].min}–${D.sizes[s.size].max} passives.</p>
    <div class="fgrid">
      <label class="f" for="btCs">Size<select id="btCs">${Object.keys(D.sizes).reverse().map(k=>`<option${k===s.size?" selected":""}>${k}</option>`).join("")}</select></label>
      <label class="f" for="btCt">Enchant<select id="btCt">${skills.map(k=>`<option value="${k.tag}"${k.tag===s.tag?" selected":""}>${esc2(k.name)}</option>`).join("")}</select></label>
    </div>
    ${sug.length?`<div class="row"><span class="small muted">Fits ${esc2(t.main)}:</span>${sug.map(x=>`<button class="btn ghost small" data-btsug="${x.size}|${x.tag}">${x.size} · ${esc2(x.name)}</button>`).join("")}</div>`:""}
    ${sk?`<p class="small" style="margin:0">Small passives: ${esc2(sk.stats.join(", "))}</p>`:""}
    <div class="tw"><table><thead><tr><th>Notable</th><th>Chance</th><th>Item level</th><th>Effect</th></tr></thead><tbody>
    ${list.map(n=>`<tr${fits(n)?' class="bt-fit"':""}><td><b>${esc2(n.n)}</b> <span class="small muted">${n.t==="P"?"prefix":"suffix"}</span></td><td class="num">${(n.share*100).toFixed(0)}%</td><td class="num">${n.lv}+</td><td class="small">${esc2(n.s.join(" · "))}</td></tr>`).join("")}
    </tbody></table></div>
    <p class="small muted" style="margin:0">Chance is the share of that notable among the ${"prefix or suffix"} notables the enchant can roll. Item level is the minimum needed for it to roll.</p>`;
  $("btCs").onchange=e=>{s.size=e.target.value;s.tag="";save();renderCluster()};
  $("btCt").onchange=e=>{s.tag=e.target.value;save();renderCluster()};
  el.querySelectorAll("[data-btsug]").forEach(b=>b.onclick=()=>{const [z,tg]=b.dataset.btsug.split("|");s.size=z;s.tag=tg;save();renderCluster()});
}

function renderMeta(){
  const el=$("btMeta");if(!el)return;const b=goal();
  if(!b){el.innerHTML=`<h2>Meta check</h2>${emptyBox("Import your goal build to compare it with what other players run.",[["Import goal build","importGoal"]])}`;return}
  const main=typeof mainSkillName==="function"?mainSkillName(b):"";
  const mg=typeof mainGroup==="function"?mainGroup(b):null;
  const items=(typeof currentSlots==="function"?currentSlots(b):[]).map(s=>b.items[s.itemId]).filter(Boolean);
  const uniq=[...new Set(items.filter(i=>/unique/i.test(i.rarity||"")).map(i=>i.name))];
  const sp=typeof currentSpec==="function"?currentSpec(b):null;
  const ks=sp&&window.SKILLTREE?SKILLTREE.nodes.filter(n=>n[3]==="k"&&sp.ids.includes(String(n[0]))).map(n=>n[4]):[];
  const url=`https://poe.ninja/poe1/builds?skills=${encodeURIComponent(main)}`;
  el.innerHTML=`<h2>Meta check</h2>
    <p class="small muted" style="margin:0">See what other ${esc2(main)} players use on poe.ninja, then tick off what your goal build already has. poe.ninja doesn't allow apps to read its build data, so the comparison happens on their page.</p>
    <div class="row"><button class="btn small primary" id="btNinja">Open ${esc2(main)} builds on poe.ninja</button></div>
    <p class="small" style="margin:0"><b>Your goal build</b>${b.ascend?` · ${esc2(b.ascend)}`:""}</p>
    <ul class="small" style="margin:0;padding-left:18px">
      ${mg?`<li><b>Main links:</b> ${esc2(mg.gems.map(g=>g.name).join(", "))}</li>`:""}
      <li><b>Uniques:</b> ${uniq.length?esc2(uniq.join(", ")):"none"}</li>
      <li><b>Keystones:</b> ${ks.length?esc2(ks.join(", ")):"none"}</li>
    </ul>
    <p class="small muted" style="margin:0">On poe.ninja, the items, gems and keystones near the top of each list are what most players run. Anything there that's missing above is worth a look.</p>`;
  $("btNinja").onclick=()=>open(url);
}

async function renderTimeless(){
  const el=$("btTimeless");if(!el)return;const s=st();const t=s.tj;
  if(!window.TIMELESS){
    el.innerHTML=`<h2>Timeless jewels</h2>
      <p class="small muted" style="margin:0">See what Lethal Pride, Brutal Restraint, Militant Faith, Elegant Hubris or Heroic Tragedy does in any jewel socket, find seeds that give the notables you want, and search a seed on the trade site. Uses Path of Building's lookup tables.</p>
      <div class="row"><button class="btn primary small" id="btTjLoad">Load timeless jewel data (8 MB)</button></div><p class="small muted" style="margin:0" id="btTjMsg"></p>`;
    const go=async()=>{const m=$("btTjMsg");if(m)m.textContent="Loading…";try{await loadScriptOnce("timelessdata.js","TIMELESS");s.tjUsed=true;save();renderTimeless()}catch(e){if(m)m.textContent="Couldn't load: "+(e.message||e)}};
    $("btTjLoad").onclick=go;if(s.tjUsed)go();return;
  }
  const T=window.TIMELESS;const names=Object.keys(T.jewels);
  if(!T.jewels[t.jewel])t.jewel=names[0];
  const j=T.jewels[t.jewel];if(!j.conq.includes(t.conq))t.conq=j.conq[0];
  const sockets=Object.keys(T.sockets);const alloc=allocated();
  if(!T.sockets[t.socket])t.socket=sockets.find(id=>alloc&&alloc.has(id))||sockets[0];
  const seed=+t.seed;const fromGoal=goalTimeless();
  let rows=[];let err="";
  if(t.seed!==""&&!seedOk(j,seed))err=`Seeds for ${t.jewel} run from ${j.min.toLocaleString()} to ${j.max.toLocaleString()}${j.step>1?` in steps of ${j.step}`:""}.`;
  else if(t.seed!==""){const bytes=await jewelBytes(t.jewel);
    rows=(T.sockets[t.socket]||[]).filter(id=>T.tree[id]&&T.tree[id][0]!=="s").map(id=>{const [type,name]=T.tree[id];const a=alloc?alloc.has(String(id)):null;
      if(type==="k")return {id,name,type,a,res:{kind:"replace",node:T.keystones[j.type+"_"+t.conq]||{n:"Keystone",s:[]}}};
      return {id,name,type,a,res:lookup(T,bytes,t.jewel,seed,id)}}).filter(r=>r.res).filter(r=>!t.alloc||!alloc||r.a);
  }
  const outcomes=[...new Map(T.nodes.concat(T.additions).filter(n=>n.id&&n.id.startsWith(j.type+"_notable")).map(n=>[n.id,n])).values()];
  const label=id=>`Near ${T.labels[id]||id}${alloc&&alloc.has(id)?" (in your tree)":""}`;
  el.innerHTML=`<h2>Timeless jewels</h2>
    ${fromGoal.length?`<div class="row"><span class="small muted">In your goal build:</span>${fromGoal.map((g,i)=>`<button class="btn ghost small" data-btgoal="${i}">${esc2(g.jewel)} ${g.seed} (${esc2(g.conq)})</button>`).join("")}</div>`:""}
    <div class="fgrid">
      <label class="f" for="btTj">Jewel<select id="btTj">${names.map(n=>`<option${n===t.jewel?" selected":""}>${n}</option>`).join("")}</select></label>
      <label class="f" for="btTs">Seed<input type="number" id="btTs" min="${j.min}" max="${j.max}" step="${j.step}" value="${esc2(t.seed)}" placeholder="${j.min}–${j.max}"></label>
      <label class="f" for="btTc">Conqueror<select id="btTc">${j.conq.map(c=>`<option${c===t.conq?" selected":""}>${c}</option>`).join("")}</select></label>
      <label class="f" for="btTk">Socket<select id="btTk">${sockets.map(id=>`<option value="${id}"${id===t.socket?" selected":""}>${esc2(label(id))}</option>`).join("")}</select></label>
    </div>
    ${alloc?`<label class="small" style="display:flex;gap:6px;align-items:center"><input type="checkbox" id="btTa"${t.alloc?" checked":""}> Only passives allocated in my goal tree</label>`:""}
    <p class="small" style="margin:0"><b>Small passives in radius:</b> ${esc2(smallEffect(T,j))}</p>
    ${err?`<p class="small" style="margin:0;color:var(--bad)">${esc2(err)}</p>`:""}
    ${rows.length?`<div class="tw"><table><thead><tr><th>Passive</th><th>Becomes</th></tr></thead><tbody>${rows.map(r=>`<tr><td>${r.type==="k"?"🔑 ":""}${esc2(r.name)}${r.a?' <span class="pill">allocated</span>':""}</td><td class="small">${r.res.kind==="replace"?`<b>${esc2(r.res.node.n)}</b>: ${esc2(r.res.node.s.join(" · "))}`:`Keeps its stats, adds: ${esc2(r.res.node.s.join(" · "))}`}</td></tr>`).join("")}</tbody></table></div>
      <div class="row"><button class="btn small" id="btTrade">Search this seed on trade</button></div>`:t.seed===""?'<p class="small muted" style="margin:0">Enter a seed, pick one from your goal build, or find seeds below.</p>':err?"":'<p class="small muted" style="margin:0">No notables in this socket\'s radius'+(t.alloc&&alloc?" are allocated in your goal tree":"")+".</p>"}
    <h3 style="margin:8px 0 0">Find seeds</h3>
    <p class="small muted" style="margin:0">Pick the results you want; seeds are ranked by how many ${t.alloc&&alloc?"allocated ":""}notables in this socket get one of them.</p>
    <div class="bt-want">${outcomes.map(o=>`<label class="small"><input type="checkbox" data-btw="${esc2(o.id)}"${t.want.includes(o.id)?" checked":""}> ${esc2(o.n&&!/^(Notable|Devotion)$/.test(o.n)?o.n+": ":"")}${esc2(o.s.join(" · "))}</label>`).join("")}</div>
    <div class="row"><button class="btn small primary" id="btFind"${t.want.length?"":" disabled"}>Find seeds</button><span class="small muted" id="btFindMsg"></span></div>
    <div id="btFindOut"></div>
    <p class="small muted" style="margin:0">Glorious Vanity isn't included yet: its lookup table is 22 MB. Data from Path of Building Community (${esc2(T.v)}).</p>`;
  const upd=(k,v)=>{t[k]=v;save();renderTimeless()};
  $("btTj").onchange=e=>{t.jewel=e.target.value;t.seed="";t.want=[];save();renderTimeless()};
  $("btTs").onchange=e=>upd("seed",e.target.value.trim());
  $("btTc").onchange=e=>upd("conq",e.target.value);
  $("btTk").onchange=e=>upd("socket",e.target.value);
  if($("btTa"))$("btTa").onchange=e=>upd("alloc",e.target.checked);
  el.querySelectorAll("[data-btgoal]").forEach(b=>b.onclick=()=>{const g=fromGoal[+b.dataset.btgoal];Object.assign(t,{jewel:g.jewel,seed:String(g.seed),conq:g.conq,socket:g.socket});save();renderTimeless()});
  el.querySelectorAll("[data-btw]").forEach(c=>c.onchange=()=>{const id=c.dataset.btw;t.want=c.checked?[...new Set([...t.want,id])]:t.want.filter(x=>x!==id);save();$("btFind").disabled=!t.want.length});
  if($("btTrade"))$("btTrade").onclick=()=>open(tradeUrl({stats:[{type:"count",value:{min:1},filters:j.trade.map(id=>({id,value:{min:seed,max:seed}}))}]}));
  $("btFind").onclick=async()=>{const m=$("btFindMsg");m.textContent="Searching…";
    const r=await seedSearch(T,t.jewel,t.socket,t.want,t.alloc&&alloc?alloc:null);m.textContent=r.length?(r.tied>1?`${r.tied.toLocaleString()} seeds tie for the best result (${r[0].n} notables); showing the first ${Math.min(25,r.length)}.`:`Top ${r.length} of ${r.total.toLocaleString()} seeds.`):"No seed gives those results here.";
    $("btFindOut").innerHTML=r.length?`<div class="tw"><table><thead><tr><th>Seed</th><th>Matches</th><th>Notables</th><th></th></tr></thead><tbody>${r.map(x=>`<tr><td class="num">${x.seed}</td><td class="num">${x.n}</td><td class="small">${esc2(x.hits.slice(0,6).join(", "))}${x.hits.length>6?` and ${x.hits.length-6} more`:""}</td><td><button class="btn ghost small" data-btpick="${x.seed}">Show</button></td></tr>`).join("")}</tbody></table></div>`:"";
    $("btFindOut").querySelectorAll("[data-btpick]").forEach(b=>b.onclick=()=>{t.seed=b.dataset.btpick;save();renderTimeless().then(()=>scrollToCard&&scrollToCard("btTimeless"))});
  };
}
BT.render=render;
BT._test={gemVariant,gemProfits,clusterNotables,clusterSuggest,lookup,seedOk,parseTimeless,seedSearch,smallEffect,notIndex,TJ};
})();
