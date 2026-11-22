/* Loot filter editor: opens a NeverSink-style .filter, lets you restyle, show/hide and re-tier it,
   previews sample drops through a filter evaluator, and saves an ExileCompanion-<name>.filter copy.
   Edits are kept as a list of operations replayed on the original text, so the original is never changed. */
"use strict";
(function(){
const FL={};window.FilterLab=FL;
const esc2=s=>String(s==null?"":s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));

/* ---------- parsing ---------- */
const BLOCK_RE=/^\s*(Show|Hide|Minimal)\b/;
function tokenize(s){const out=[];const re=/"([^"]*)"|(\S+)/g;let m;while((m=re.exec(s)))out.push(m[1]!=null?{q:true,v:m[1]}:{q:false,v:m[2]});return out}
function parseLine(raw){
  const code=raw.replace(/#.*$/,"").trim();const comment=(raw.match(/#(.*)$/)||[])[1]||"";
  if(!code)return {raw,blank:!comment.trim(),comment};
  const toks=tokenize(code);const key=toks[0].v;let op=null,args=toks.slice(1);
  if(args.length&&!args[0].q&&/^(==|=|!=|!|<=|>=|<|>)$/.test(args[0].v)){op=args[0].v;args=args.slice(1)}
  else if(args.length&&!args[0].q&&/^(==|!=|<=|>=|<|>)(\d+)$/.test(args[0].v)){const mm=args[0].v.match(/^(==|!=|<=|>=|<|>)(\d+)$/);op=mm[1];args=[{q:false,v:mm[2]}].concat(args.slice(1))}
  return {raw,key,op,args,comment,indent:(raw.match(/^\s*/)||[""])[0]};
}
function parse(text){
  const lines=text.replace(/\r\n/g,"\n").split("\n");const items=[];let sec="",sub="",i=0,bi=0;
  while(i<lines.length){
    const raw=lines[i];
    const s1=raw.match(/^#\s*\[\[(\d+)\]\]\s*(.+)$/);if(s1){sec=s1[2].trim();sub=""}
    const s2=raw.match(/^#\s*\[(\d+)\]\s*(.+)$/);if(s2)sub=s2[2].trim();
    if(BLOCK_RE.test(raw)){
      const head=parseLine(raw);const tags={};(head.comment.match(/\$\w+->[^\s]+/g)||[]).forEach(t=>{const [k,v]=t.slice(1).split("->");tags[k]=v});
      const body=[];i++;
      while(i<lines.length&&!BLOCK_RE.test(lines[i])&&lines[i].trim()!==""&&!/^#/.test(lines[i]))body.push(parseLine(lines[i++]));
      items.push({block:true,idx:bi++,vis:head.key,head,tags,sec,sub,body});
      continue;
    }
    items.push({block:false,raw});i++;
  }
  return {items,blocks:items.filter(x=>x.block)};
}
function lineText(l){if(l.raw!=null&&!l.dirty)return l.raw;const a=(l.args||[]).map(x=>x.q?`"${x.v}"`:x.v).join(" ");return `${l.indent||"\t"}${l.key}${l.op?" "+l.op:""}${a?" "+a:""}${l.comment?" #"+l.comment:""}`}
function serialize(model){
  return model.items.map(it=>{if(!it.block)return it.raw;
    const head=it.headDirty?`${it.vis}${it.head.comment?" #"+it.head.comment:""}`:it.head.raw;
    return [head].concat(it.body.filter(l=>!l.removed).map(lineText)).join("\n")}).join("\n");
}

/* ---------- block helpers ---------- */
const ACTIONS=["SetFontSize","SetTextColor","SetBorderColor","SetBackgroundColor","PlayAlertSound","PlayAlertSoundPositional","CustomAlertSound","CustomAlertSoundOptional","DisableDropSound","EnableDropSound","DisableDropSoundIfAlertSound","EnableDropSoundIfAlertSound","PlayEffect","MinimapIcon","Continue"];
const getLine=(b,key)=>b.body.find(l=>l.key===key&&!l.removed);
function setAction(b,key,args){
  let l=getLine(b,key);
  if(args==null){if(l){l.removed=true}return}
  const a=args.map(v=>typeof v==="object"?v:{q:false,v:String(v)});
  if(l){l.args=a;l.op=null;l.dirty=true;l.comment=""}
  else{const ind=(b.body[0]&&b.body[0].indent)||"\t";const nl={key,args:a,op:null,indent:ind,dirty:true,comment:""};const ci=b.body.findIndex(x=>x.key==="Continue"&&!x.removed);if(ci>=0)b.body.splice(ci,0,nl);else b.body.push(nl)}
}
function conds(b){return b.body.filter(l=>l.key&&!ACTIONS.includes(l.key)&&!l.removed)}
function style(b){
  const g=k=>{const l=getLine(b,k);return l?l.args.map(x=>x.v):null};
  return {size:g("SetFontSize"),text:g("SetTextColor"),border:g("SetBorderColor"),bg:g("SetBackgroundColor"),sound:g("PlayAlertSound")||g("PlayAlertSoundPositional"),custom:g("CustomAlertSound")||g("CustomAlertSoundOptional"),effect:g("PlayEffect"),icon:g("MinimapIcon"),cont:!!getLine(b,"Continue")};
}
function blockTitle(b){
  if(b.tags.type)return `${b.tags.type}${b.tags.tier?" → "+b.tags.tier:""}`;
  const c=conds(b).slice(0,2).map(l=>`${l.key}${l.op?" "+l.op:""} ${l.args.slice(0,3).map(x=>x.v).join(", ")}${l.args.length>3?"…":""}`);
  return c.join(" · ")||"(every item)";
}

/* ---------- operations ---------- */
function applyOp(model,op){
  const b=model.blocks[op.b];if(!b&&op.k!=="addTop")return false;
  switch(op.k){
    case "vis": b.vis=op.v;b.headDirty=true;return true;
    case "act": setAction(b,op.key,op.args);return true;
    case "move":{const from=getLine(model.blocks[op.b],"BaseType"),to=getLine(model.blocks[op.to],"BaseType");if(!from||!to)return false;
      const i=from.args.findIndex(x=>x.v===op.item);if(i<0)return false;from.args.splice(i,1);from.dirty=true;
      if(!to.args.some(x=>x.v===op.item)){to.args.push({q:true,v:op.item});to.dirty=true}
      if(!from.args.length){model.blocks[op.b].vis="Hide";model.blocks[op.b].headDirty=true;from.args=[{q:true,v:"__exile_companion_empty__"}]}
      if(from.op==null)from.op="==";if(to.op==null)to.op="==";return true}
    default: return false;
  }
}
function build(text,ops,extraTop){
  const model=parse(text);let failed=0;
  for(const op of ops) if(!applyOp(model,op)) failed++;
  model.failed=failed;
  if(extraTop){model.items.unshift({block:false,raw:extraTop})}
  return model;
}

/* ---------- evaluator (for the loot preview) ---------- */
const RAR=["Normal","Magic","Rare","Unique"];
function cmp(a,op,b){switch(op){case "<":return a<b;case "<=":return a<=b;case ">":return a>b;case ">=":return a>=b;case "!=":case "!":return a!==b;default:return a===b}}
function condMatch(l,it){
  const k=l.key,op=l.op,vals=l.args.map(x=>x.v);
  if(k==="Class"||k==="BaseType"){const v=String(it[k==="Class"?"cls":"base"]||"");const exact=op==="=="||op==="!=";
    const hit=vals.some(x=>exact?v===x:v.includes(x));return op==="!="||op==="!"?!hit:hit}
  if(k==="Rarity"){const r=RAR.indexOf(it.rarity||"Normal");if(!op||op==="=="||op==="=")return vals.some(x=>RAR.indexOf(x)===r);return vals.length?cmp(r,op,RAR.indexOf(vals[0])):false}
  if(k==="HasInfluence"){const inf=it.influence||[];if(vals[0]==="None")return !inf.length;const hit=vals.filter(x=>inf.includes(x)).length;return op==="=="?hit===vals.length:hit>0}
  if(k==="Sockets"||k==="SocketGroup"){const n=parseInt(vals[0]);if(isNaN(n))return false;return cmp(it[k==="Sockets"?"sockets":"sockets"]||0,op||">=",n)}
  const v=it[k[0].toLowerCase()+k.slice(1)];
  if(vals.length===1&&/^(True|False)$/.test(vals[0])){return (!!v)===(vals[0]==="True")}
  if(vals.length&&/^-?\d+$/.test(vals[0])&&!/^Has/.test(k)){return cmp(+(v||0),op||"==",+vals[0])}
  return false;
}
function evaluate(model,item){
  const it=Object.assign({areaLevel:83,itemLevel:83,stackSize:1,identified:false},item);
  let st={};
  for(const b of model.blocks){
    if(conds(b).every(l=>condMatch(l,it))){
      const s=style(b);for(const k in s)if(s[k]!=null&&s[k]!==false)st[k]=s[k];
      if(!s.cont)return {vis:b.vis,style:st,block:b};
      st.vis=b.vis;
    }
  }
  return {vis:"Show",style:st,block:null};
}

/* ---------- sample drops ---------- */
const SAMPLES=[
  {name:"Mirror of Kalandra",cls:"Stackable Currency",base:"Mirror of Kalandra",rarity:"Normal",stackSize:1},
  {name:"Divine Orb",cls:"Stackable Currency",base:"Divine Orb",stackSize:1},
  {name:"Exalted Orb",cls:"Stackable Currency",base:"Exalted Orb",stackSize:1},
  {name:"Chaos Orb",cls:"Stackable Currency",base:"Chaos Orb",stackSize:1},
  {name:"Orb of Alchemy",cls:"Stackable Currency",base:"Orb of Alchemy",stackSize:1},
  {name:"Orb of Alteration",cls:"Stackable Currency",base:"Orb of Alteration",stackSize:1},
  {name:"Chromatic Orb",cls:"Stackable Currency",base:"Chromatic Orb",stackSize:1},
  {name:"Orb of Transmutation",cls:"Stackable Currency",base:"Orb of Transmutation",stackSize:1},
  {name:"Portal Scroll",cls:"Stackable Currency",base:"Portal Scroll",stackSize:1},
  {name:"Scroll of Wisdom",cls:"Stackable Currency",base:"Scroll of Wisdom",stackSize:1},
  {name:"Deafening Essence of Greed",cls:"Stackable Currency",base:"Deafening Essence of Greed",stackSize:1},
  {name:"Pristine Fossil",cls:"Stackable Currency",base:"Pristine Fossil",stackSize:1},
  {name:"The Doctor",cls:"Divination Cards",base:"The Doctor",stackSize:1},
  {name:"The Apothecary",cls:"Divination Cards",base:"The Apothecary",stackSize:1},
  {name:"The Lover",cls:"Divination Cards",base:"The Lover",stackSize:1},
  {name:"Rain of Chaos",cls:"Divination Cards",base:"Rain of Chaos",stackSize:1},
  {name:"Headhunter",cls:"Belts",base:"Leather Belt",rarity:"Unique",itemLevel:83},
  {name:"Tabula Rasa",cls:"Body Armours",base:"Simple Robe",rarity:"Unique",itemLevel:83,sockets:6,linkedSockets:6},
  {name:"Goldrim",cls:"Helmets",base:"Leather Cap",rarity:"Unique",itemLevel:83},
  {name:"Rare Vaal Regalia (ilvl 85)",cls:"Body Armours",base:"Vaal Regalia",rarity:"Rare",itemLevel:85,dropLevel:68},
  {name:"Rare Two-Stone Ring (ilvl 84)",cls:"Rings",base:"Two-Stone Ring",rarity:"Rare",itemLevel:84,dropLevel:20},
  {name:"Rare Hubris Circlet (ilvl 86)",cls:"Helmets",base:"Hubris Circlet",rarity:"Rare",itemLevel:86,dropLevel:69},
  {name:"Rare Siege Axe (ilvl 80)",cls:"Two Hand Axes",base:"Siege Axe",rarity:"Rare",itemLevel:80,dropLevel:59},
  {name:"Shaper Opal Ring (ilvl 86)",cls:"Rings",base:"Opal Ring",rarity:"Rare",itemLevel:86,influence:["Shaper"],dropLevel:80},
  {name:"Magic Iron Ring",cls:"Rings",base:"Iron Ring",rarity:"Magic",itemLevel:80,dropLevel:1},
  {name:"Normal Plate Vest",cls:"Body Armours",base:"Plate Vest",rarity:"Normal",itemLevel:80,dropLevel:1},
  {name:"6-link Simple Robe",cls:"Body Armours",base:"Simple Robe",rarity:"Normal",itemLevel:80,sockets:6,linkedSockets:6,dropLevel:1},
  {name:"6-socket Plate Vest",cls:"Body Armours",base:"Plate Vest",rarity:"Normal",itemLevel:80,sockets:6,linkedSockets:2,dropLevel:1},
  {name:"Tier 16 map",cls:"Maps",base:"Crimson Temple Map",rarity:"Normal",mapTier:16,itemLevel:83},
  {name:"Tier 1 map",cls:"Maps",base:"Arcade Map",rarity:"Normal",mapTier:1,itemLevel:68},
  {name:"Ambush Scarab",cls:"Map Fragments",base:"Ambush Scarab",stackSize:1},
  {name:"Enlighten Support",cls:"Support Gems",base:"Enlighten Support",gemLevel:1,quality:0},
  {name:"Vaal Grace (20% quality)",cls:"Skill Gems",base:"Vaal Grace",gemLevel:1,quality:20,corrupted:true},
  {name:"Divine Life Flask",cls:"Life Flasks",base:"Divine Life Flask",rarity:"Normal",itemLevel:83,dropLevel:60},
  {name:"Quicksilver Flask",cls:"Utility Flasks",base:"Quicksilver Flask",rarity:"Magic",itemLevel:83,dropLevel:4},
  {name:"Rare Cobalt Jewel",cls:"Jewels",base:"Cobalt Jewel",rarity:"Rare",itemLevel:84},
];
const DEFAULT_TEXT={Normal:[200,200,200],Magic:[136,136,255],Rare:[255,255,119],Unique:[175,96,37]};
function defaultText(it){if(/Currency|Fragments/.test(it.cls))return [170,158,130];if(it.cls==="Divination Cards")return [14,186,255];if(/Gems/.test(it.cls))return [27,162,155];return DEFAULT_TEXT[it.rarity||"Normal"]}
const rgba=(a,def)=>{const v=a?a.map(Number):def;if(!v)return null;return `rgba(${v[0]|0},${v[1]|0},${v[2]|0},${v.length>3?(v[3]/255).toFixed(2):1})`};
const EFFECT_COLORS={Red:"#ff4b4b",Green:"#5bdd5b",Blue:"#4b8bff",Brown:"#a0682d",White:"#f2f2f2",Yellow:"#ffe04b",Cyan:"#4bf0ff",Grey:"#9a9a9a",Orange:"#ff9a3b",Pink:"#ff7bd5",Purple:"#b46bff"};
function labelHtml(st,text,it,hidden){
  const size=st.size?+st.size[0]:32;const px=Math.max(9,Math.min(24,size*0.45));
  const fg=rgba(st.text,defaultText(it||{}));const bg=rgba(st.bg,[0,0,0,240]);const bd=st.border?rgba(st.border):"transparent";
  const beam=st.effect?EFFECT_COLORS[st.effect[0]]:null;const icon=st.icon?EFFECT_COLORS[st.icon[1]]:null;
  return `<span class="fl-label${hidden?" hid":""}" style="font-size:${px.toFixed(1)}px;color:${fg};background:${bg};border-color:${bd}">${beam?`<i class="fl-beam" style="background:${beam}" title="Beam: ${esc2(st.effect.join(" "))}"></i>`:""}${icon?`<i class="fl-icon" style="color:${icon}" title="Minimap icon: ${esc2(st.icon.join(" "))}">◆</i>`:""}${esc2(text)}${st.sound?`<i class="fl-snd" title="Sound ${esc2(st.sound.join(" "))}">♪</i>`:""}</span>`;
}

/* ---------- economy re-tiering ---------- */
const ECON_TYPES=[["currency","Currency"],["divination","Divination cards"],["uniques","Uniques (by base type)"]];
function priceOf(type,name,P){
  if(!P)return null;
  if(type==="currency")return P.cur[name]!=null?P.cur[name]:(P.ex[name]!=null?P.ex[name]:null);
  if(type==="divination")return P.ex[name]!=null?P.ex[name]:null;
  if(type==="uniques"){let best=null;for(const lines of Object.values(P.items))for(const l of lines){if(l.baseType===name&&!(l.links>=5)&&l.chaosValue!=null&&(best==null||l.chaosValue>best))best=l.chaosValue}return best}
  return null;
}
// NeverSink's main price ladders (exception, stacked, replica and lifeforce tiers are left alone)
const LADDER={
  currency:(b,t)=>/Regular Currency Tiering/i.test(b.sec)&&/^t\d/.test(t),
  divination:(b,t)=>/^t\d$/.test(t),
  uniques:(b,t)=>/^uniques$/i.test(String(b.sec).trim())&&(/^t\d$/.test(t)||t==="hideable"),
};
function retierPlan(model,type,P){
  const tiers=model.blocks.filter(b=>b.tags.type===type&&b.tags.tier&&LADDER[type]&&LADDER[type](b,b.tags.tier)&&getLine(b,"BaseType")&&conds(b).every(l=>["BaseType","Class","Rarity"].includes(l.key)));
  if(tiers.length<2)return {tiers,moves:[]};
  const priced=tiers.map(b=>{const ps=getLine(b,"BaseType").args.map(a=>({item:a.v,p:priceOf(type,a.v,P)}));const known=ps.filter(x=>x.p!=null).map(x=>x.p).sort((a,c)=>a-c);return {b,ps,med:known.length?known[known.length>>1]:null}});
  // tiers are listed most valuable first; cut points sit between neighbouring tiers' medians
  const withMed=priced.filter(t=>t.med!=null);
  const cuts=[];for(let i=0;i<withMed.length-1;i++){const a=withMed[i].med,c=withMed[i+1].med;cuts.push(a>c?Math.sqrt(Math.max(a,0.01)*Math.max(c,0.01)):null)}
  const tierFor=p=>{for(let i=0;i<cuts.length;i++){if(cuts[i]!=null&&p>=cuts[i])return withMed[i]}return withMed[withMed.length-1]};
  const moves=[];
  // only move an item when its price is clearly past the boundary (25% margin), so small price wobbles don't shuffle tiers
  const MARGIN=1.25;
  priced.forEach(t=>t.ps.forEach(x=>{if(x.p==null||!withMed.includes(t)||x.item==="Chaos Orb")return;const dest=tierFor(x.p);if(!dest||dest===t)return;
    const ti=withMed.indexOf(t),di=withMed.indexOf(dest);const cut=di<ti?cuts[ti-1]:cuts[ti];
    if(cut!=null&&(di<ti?x.p<cut*MARGIN:x.p>cut/MARGIN))return;
    moves.push({item:x.item,p:x.p,from:t.b,to:dest.b})}));
  return {tiers,moves,medians:withMed.map(t=>({tier:t.b.tags.tier,med:t.med}))};
}

/* ---------- UI ---------- */
let BASE=null,MODEL=null,SEL=null,SEL_ITEM=null,OPEN={};
function st(){const s=S.filterLab||(S.filterLab={file:"",ops:{},filter:"",showHidden:true,build:false,hideClasses:false,strict:{}});s.ops=s.ops||{};s.strict=s.strict||{};return s}
function opsFor(){const s=st();return s.ops[s.file]||(s.ops[s.file]=[])}
function buildTop(){
  const s=st();let top="";
  if(s.build&&typeof filterRules==="function"){try{const r=filterRules();if(r)top+="# ===== Exile Companion: your build =====\n"+r+"\n"}catch(e){}}
  if(s.hideClasses&&typeof G!=="undefined"&&G&&typeof slotItemsOf==="function"){
    const keep=new Set(slotItemsOf(G).map(x=>x.item&&x.item.base).filter(Boolean));
    const WEAPONS=["Bows","Claws","Daggers","Rune Daggers","One Hand Axes","One Hand Maces","One Hand Swords","Thrusting One Hand Swords","Sceptres","Wands","Staves","Warstaves","Two Hand Axes","Two Hand Maces","Two Hand Swords"];
    const used=new Set();slotItemsOf(G).forEach(x=>{const c=x.item&&(x.item.itemClass||x.item.cls);if(c)used.add(c)});
    const hide=WEAPONS.filter(w=>!used.has(w));
    if(hide.length&&keep.size)top+=`# ===== Exile Companion: weapon types your build doesn't use =====\nHide\n\tRarity Normal Magic Rare\n\tHasInfluence None\n\tLinkedSockets < 5\n\tSockets < 6\n\tClass == ${hide.map(c=>`"${c}"`).join(" ")}\n\tAreaLevel >= 68\n\n`;
  }
  return top;
}
function rebuild(){if(!BASE){MODEL=null;return}MODEL=build(BASE.text,opsFor().concat(strictOps()),buildTop())}
function strictOps(){
  const s=st();const out=[];if(!BASE)return out;const m=parse(BASE.text);
  for(const [type] of [["currency"],["divination"],["uniques"],["maps"]]){const n=+(s.strict[type]||0);if(!n)continue;
    const tiers=m.blocks.filter(b=>b.tags.type===type&&b.vis==="Show");tiers.slice(-n).forEach(b=>out.push({k:"vis",b:b.idx,v:"Hide"}))}
  return out;
}
function pushOp(op,label){const ops=opsFor();ops.push(op);save();rebuild();renderAll2();if(label&&typeof toast==="function")toast(label,()=>{const o=opsFor();const i=o.lastIndexOf(op);if(i>=0)o.splice(i,1);save();rebuild();renderAll2()})}

async function loadFile(name,text){BASE={name,text};st().file=name;save();SEL=null;rebuild();renderAll2()}
async function render(){
  const root=$("filterLab");if(!root)return;
  const s=st();
  root.innerHTML=`<div class="grid"><div class="card hl" id="flFile"></div><div class="card" id="flPrev"></div></div>
    <div class="grid"><div class="card" id="flTiers"></div><div class="card" id="flEdit"></div></div>
    <div class="grid"><div class="card" id="flEcon"></div><div class="card" id="flTweaks"></div></div>`;
  if(!BASE&&s.file&&DESK){const r=await DESK.readFilter(s.file);if(r&&r.ok)BASE={name:s.file,text:r.data};rebuild()}
  renderAll2();
}
function renderAll2(){renderFile();renderPreview();renderTiers();renderEdit();renderEcon();renderTweaks()}
function renderFile(){
  const el=$("flFile");if(!el)return;const s=st();
  const changes=opsFor().length+(s.build?1:0)+(s.hideClasses?1:0)+Object.values(s.strict).filter(Boolean).length;
  el.innerHTML=`<h2>Filter</h2>
    ${DESK?`<label class="f" for="flPick">Your filter<select id="flPick"><option value="">Choose a filter from your game folder…</option></select></label>`:`<label class="f" for="flUp">Open a .filter file<input type="file" id="flUp" accept=".filter"></label>`}
    ${BASE?`<p class="small" style="margin:0"><b>${esc2(BASE.name)}</b> · ${MODEL.blocks.length.toLocaleString()} rules · ${changes} change${changes===1?"":"s"}${MODEL.failed?` · <span style="color:var(--warn)">${MODEL.failed} change${MODEL.failed>1?"s":""} no longer match this file</span>`:""}</p>
      <div class="row"><label class="f" for="flName" style="flex:1">Save as<input id="flName" type="text" value="${esc2(saveName())}"></label></div>
      <div class="row"><button class="btn primary" id="flSave">${DESK?"Save to my filter folder":"Download filter"}</button><button class="btn ghost" id="flUndo"${opsFor().length?"":" disabled"}>Undo</button><button class="btn ghost" id="flReset"${changes?"":" disabled"}>Reset all changes</button></div>
      <p class="small muted" style="margin:0">Your original file is never changed. In game: Options → Game → Item Filter, pick the saved filter, then press reload.</p>`
    :emptyBox(DESK?"Pick the NeverSink filter you use. Download one from FilterBlade first if your folder is empty: it's the most up-to-date source.":"Open the .filter file you use. In the desktop app the editor reads and saves your game's filter folder directly.")}
    <p class="small" id="flMsg" style="margin:0"></p>`;
  if(DESK){DESK.listFilters().then(r=>{const sel=$("flPick");if(!sel)return;const files=(r.files||[]).filter(f=>!/^ExileCompanion/i.test(f.name));sel.innerHTML=`<option value="">Choose a filter from your game folder…</option>`+files.map(f=>`<option${BASE&&BASE.name===f.name?" selected":""}>${esc2(f.name)}</option>`).join("");
    sel.onchange=async()=>{if(!sel.value)return;const rr=await DESK.readFilter(sel.value);if(!rr.ok){$("flMsg").textContent=rr.error;return}loadFile(sel.value,rr.data)}})}
  else{const up=$("flUp");if(up)up.onchange=()=>{const f=up.files[0];if(!f)return;const rd=new FileReader();rd.onload=()=>loadFile(f.name,String(rd.result));rd.readAsText(f)}}
  if(!BASE)return;
  $("flSave").onclick=async()=>{const name=saveName($("flName").value);const text=serialize(MODEL);
    if(DESK){const w=await DESK.writeFilter(name,text);$("flMsg").innerHTML=w&&w.ok?`<span style="color:var(--good)">Saved ${esc2(name)}. Pick it in game (Options → Game → Item Filter) and press reload.</span>`:esc2((w&&w.error)||"Couldn't save.")}
    else{const a=document.createElement("a");a.href=URL.createObjectURL(new Blob([text],{type:"text/plain"}));a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),5000);$("flMsg").textContent=`Downloaded ${name}. Put it in Documents\\My Games\\Path of Exile.`}};
  $("flUndo").onclick=()=>{opsFor().pop();save();rebuild();renderAll2()};
  $("flReset").onclick=()=>{const s2=st();const prev={ops:opsFor().slice(),build:s2.build,hide:s2.hideClasses,strict:{...s2.strict}};s2.ops[s2.file]=[];s2.build=false;s2.hideClasses=false;s2.strict={};save();rebuild();renderAll2();
    if(typeof toast==="function")toast("All changes reset.",()=>{s2.ops[s2.file]=prev.ops;s2.build=prev.build;s2.hideClasses=prev.hide;s2.strict=prev.strict;save();rebuild();renderAll2()})};
}
function saveName(v){const raw=(v||(BASE&&BASE.name)||"filter").replace(/\.filter$/i,"").replace(/^ExileCompanion[-_ ]?/i,"").replace(/[^\w .()-]/g,"").trim()||"filter";return `ExileCompanion-${raw}.filter`}
function renderPreview(){
  const el=$("flPrev");if(!el)return;const s=st();
  if(!MODEL){el.innerHTML=`<h2>Loot preview</h2>${emptyBox("Open a filter to see how it shows a typical set of drops.")}`;return}
  const res=SAMPLES.map(it=>({it,r:evaluate(MODEL,it)}));const hidden=res.filter(x=>x.r.vis==="Hide").length;
  el.innerHTML=`<div class="row" style="justify-content:space-between"><h2>Loot preview</h2><label class="small row" style="gap:4px"><input type="checkbox" id="flShowHid"${s.showHidden?" checked":""}> Show hidden items</label></div>
    <div class="fl-ground">${res.filter(x=>s.showHidden||x.r.vis!=="Hide").map(x=>`<button class="fl-drop" data-blk="${x.r.block?x.r.block.idx:""}" data-base="${esc2(x.it.base)}" title="${esc2(x.r.block?(x.r.block.sub||x.r.block.sec)+" · "+blockTitle(x.r.block):"No rule matched: shown with default style")}">${labelHtml(x.r.style,x.it.name,x.it,x.r.vis==="Hide")}</button>`).join("")}</div>
    <p class="small muted" style="margin:0">${SAMPLES.length} sample drops at area level 83; ${hidden} hidden. Click a label to edit the rule that styles it. Sounds, beams and minimap icons are shown as ♪, a coloured bar and ◆.</p>`;
  $("flShowHid").onchange=e=>{s.showHidden=e.target.checked;save();renderPreview()};
  el.querySelectorAll("[data-blk]").forEach(b=>b.onclick=()=>{if(b.dataset.blk==="")return;SEL=+b.dataset.blk;SEL_ITEM=b.dataset.base||null;const bl=MODEL.blocks[SEL];OPEN[bl.sec+"|"+bl.sub]=true;renderTiers();renderEdit();$("flEdit").scrollIntoView({block:"nearest",behavior:"smooth"})});
}
function renderTiers(){
  const el=$("flTiers");if(!el)return;const s=st();
  if(!MODEL){el.innerHTML=`<h2>Rules</h2>${emptyBox("Open a filter to see its sections and tiers.")}`;return}
  const f=s.filter.trim().toLowerCase();const groups=[];const byKey={};
  MODEL.blocks.forEach(b=>{const k=b.sec+"|"+b.sub;if(!byKey[k]){byKey[k]={k,sec:b.sec,sub:b.sub,blocks:[]};groups.push(byKey[k])}byKey[k].blocks.push(b)});
  const match=b=>!f||blockTitle(b).toLowerCase().includes(f)||(b.sub+" "+b.sec).toLowerCase().includes(f)||conds(b).some(l=>l.args.some(a=>a.v.toLowerCase().includes(f)));
  const shown=groups.map(g=>({...g,blocks:g.blocks.filter(match)})).filter(g=>g.blocks.length);
  el.innerHTML=`<div class="row" style="justify-content:space-between"><h2>Rules</h2><input id="flFind" type="text" placeholder="Find, e.g. divine or Two-Stone Ring" value="${esc2(s.filter)}" style="max-width:240px"></div>
    <div class="fl-tree">${shown.slice(0,120).map(g=>`<details${OPEN[g.k]||f?" open":""} data-grp="${esc2(g.k)}"><summary><b>${esc2(g.sub||g.sec||"Rules")}</b> <span class="small muted">${g.sub&&g.sec?esc2(g.sec)+" · ":""}${g.blocks.length}</span></summary>
      <ul class="clean">${g.blocks.slice(0,80).map(b=>{const sty=style(b);const sample=sampleFor(b,f);return `<li class="fl-rule${SEL===b.idx?" on":""}" data-sel="${b.idx}"><span class="fl-vis ${b.vis}">${b.vis==="Hide"?"hidden":b.vis==="Minimal"?"minimal":"shown"}</span>${labelHtml(sty,sample.name,sample,b.vis==="Hide")}<span class="small muted fl-what">${esc2(blockTitle(b))}</span></li>`}).join("")}</ul></details>`).join("")||'<p class="small muted">No rules match.</p>'}</div>`;
  $("flFind").oninput=e=>{s.filter=e.target.value;save();renderTiers()};
  el.querySelectorAll("details[data-grp]").forEach(d=>d.ontoggle=()=>{OPEN[d.dataset.grp]=d.open});
  el.querySelectorAll("[data-sel]").forEach(li=>li.onclick=()=>{SEL=+li.dataset.sel;SEL_ITEM=s.filter.trim()||null;renderTiers();renderEdit()});
}
function sampleFor(b,prefer){
  const bt=getLine(b,"BaseType"),cl=getLine(b,"Class"),ra=getLine(b,"Rarity");
  const pick=bt&&prefer?bt.args.find(a=>a.v.toLowerCase()===prefer.toLowerCase())||bt.args.find(a=>a.v.toLowerCase().includes(prefer.toLowerCase())):null;
  const name=pick?pick.v:bt&&bt.args[0]?bt.args[0].v:cl&&cl.args[0]?cl.args[0].v:"Item";
  return {name,cls:cl&&cl.args[0]?cl.args[0].v:"",rarity:ra&&ra.args.length?(ra.op&&ra.op.includes(">")?ra.args[0].v:ra.args[ra.args.length-1].v):"Normal"};
}
const SOUNDS=["1","2","3","4","5","6","7","8","9","10","11","12","13","14","15","16"];
const COLORS=Object.keys(EFFECT_COLORS);
const SHAPES=["Circle","Diamond","Hexagon","Square","Star","Triangle","Cross","Moon","Raindrop","Kite","Pentagon","UpsideDownHouse"];
const toHex=a=>a?"#"+a.slice(0,3).map(v=>(+v).toString(16).padStart(2,"0")).join(""):"#000000";
const fromHex=(h,alpha)=>{const n=parseInt(h.slice(1),16);return [(n>>16)&255,(n>>8)&255,n&255,alpha==null?255:alpha]};
function renderEdit(){
  const el=$("flEdit");if(!el)return;
  if(!MODEL||SEL==null||!MODEL.blocks[SEL]){el.innerHTML=`<h2>Edit rule</h2>${emptyBox(MODEL?"Pick a rule from the list or click a label in the loot preview.":"Open a filter first.")}`;return}
  const b=MODEL.blocks[SEL];const sy=style(b);const sample=sampleFor(b,SEL_ITEM);
  const colorRow=(key,label,val,def)=>`<div class="fl-crow"><span>${label}</span><input type="color" data-col="${key}" value="${toHex(val||def)}"><label class="small row" style="gap:4px"><input type="checkbox" data-coloff="${key}"${val?"":" checked"}> default</label></div>`;
  el.innerHTML=`<h2>Edit rule</h2>
    <p class="small muted" style="margin:0">${esc2(b.sec)}${b.sub?" → "+esc2(b.sub):""}</p>
    <div class="fl-big">${labelHtml(sy,sample.name,sample,b.vis==="Hide")}</div>
    <div class="row" role="radiogroup" aria-label="Visibility">${["Show","Minimal","Hide"].map(v=>`<label class="row small" style="gap:4px"><input type="radio" name="flVis" value="${v}"${b.vis===v?" checked":""}> ${v==="Show"?"Show":v==="Minimal"?"Minimal (small label)":"Hide"}</label>`).join("")}</div>
    <label class="f">Text size <span class="muted small">(${sy.size?sy.size[0]:"32 default"})</span><input type="range" min="18" max="45" id="flSize" value="${sy.size?sy.size[0]:32}"></label>
    ${colorRow("SetTextColor","Text",sy.text,defaultText(sample))}${colorRow("SetBorderColor","Border",sy.border,[0,0,0])}${colorRow("SetBackgroundColor","Background",sy.bg,[0,0,0])}
    <div class="fgrid">
      <label class="f">Drop sound<select id="flSound"><option value="">None</option>${SOUNDS.map(n=>`<option${sy.sound&&sy.sound[0]===n?" selected":""}>${n}</option>`).join("")}</select></label>
      <label class="f">Volume<input type="number" id="flVol" min="0" max="300" value="${sy.sound&&sy.sound[1]?sy.sound[1]:300}"></label>
      <label class="f">Light beam<select id="flBeam"><option value="">None</option>${COLORS.map(c=>`<option${sy.effect&&sy.effect[0]===c?" selected":""}>${c}</option>`).join("")}</select></label>
      <label class="f">Minimap icon<select id="flIcon"><option value="">None</option>${COLORS.map(c=>`<option${sy.icon&&sy.icon[1]===c?" selected":""}>${c}</option>`).join("")}</select></label>
      <label class="f">Icon shape<select id="flShape">${SHAPES.map(c=>`<option${sy.icon&&sy.icon[2]===c?" selected":""}>${c}</option>`).join("")}</select></label>
      <label class="f">Icon size<select id="flIsz">${[["0","Large"],["1","Medium"],["2","Small"]].map(([v,l])=>`<option value="${v}"${sy.icon&&sy.icon[0]===v?" selected":""}>${l}</option>`).join("")}</select></label>
    </div>
    ${sy.custom?`<p class="small muted" style="margin:0">Custom sound: ${esc2(sy.custom.join(" "))}</p>`:""}
    <details class="small"><summary>What this rule matches</summary><pre class="rp-pre">${esc2(conds(b).map(l=>lineText({...l,dirty:true,indent:""})).join("\n")||"Every item that reaches it")}</pre></details>`;
  const set=(key,args,label)=>pushOp({k:"act",b:b.idx,key,args},label);
  el.querySelectorAll('input[name="flVis"]').forEach(r=>r.onchange=()=>pushOp({k:"vis",b:b.idx,v:r.value},`Rule set to ${r.value}.`));
  $("flSize").onchange=e=>set("SetFontSize",[e.target.value]);
  el.querySelectorAll("[data-col]").forEach(inp=>inp.onchange=()=>{const k=inp.dataset.col;const cur=style(b)[k==="SetTextColor"?"text":k==="SetBorderColor"?"border":"bg"];set(k,fromHex(inp.value,cur&&cur[3]!=null?+cur[3]:255))});
  el.querySelectorAll("[data-coloff]").forEach(cb=>cb.onchange=()=>{const k=cb.dataset.coloff;if(cb.checked)set(k,null);else{const inp=el.querySelector(`[data-col="${k}"]`);set(k,fromHex(inp.value))}});
  const snd=()=>{const v=$("flSound").value;set(getLine(b,"PlayAlertSoundPositional")?"PlayAlertSoundPositional":"PlayAlertSound",v?[v,$("flVol").value||300]:null)};
  $("flSound").onchange=snd;$("flVol").onchange=()=>{if($("flSound").value)snd()};
  $("flBeam").onchange=e=>set("PlayEffect",e.target.value?[e.target.value]:null);
  const icn=()=>{const c=$("flIcon").value;set("MinimapIcon",c?[$("flIsz").value,c,$("flShape").value]:null)};
  $("flIcon").onchange=icn;$("flShape").onchange=()=>{if($("flIcon").value)icn()};$("flIsz").onchange=()=>{if($("flIcon").value)icn()};
}
let ECON=null;
function renderEcon(){
  const el=$("flEcon");if(!el)return;
  if(!MODEL){el.innerHTML=`<h2>Re-tier with current prices</h2>${emptyBox("Open a filter first.")}`;return}
  el.innerHTML=`<h2>Re-tier with current prices</h2>
    <p class="small" style="margin:0">Moves items between this filter's tiers using today's poe.ninja prices, so valuable drops stand out even if the filter is behind the market. Tier boundaries come from the prices of what's already in each tier.</p>
    <div class="row">${ECON_TYPES.map(([k,l])=>`<button class="btn small" data-econ="${k}"${DESK?"":" disabled"}>${esc2(l)}</button>`).join("")}</div>
    ${DESK?"":'<p class="small muted" style="margin:0">Needs the desktop app, which can reach poe.ninja.</p>'}
    <div id="flEconOut"></div>`;
  el.querySelectorAll("[data-econ]").forEach(b=>b.onclick=async()=>{const out=$("flEconOut");out.innerHTML='<p class="small muted" style="margin:0">Getting prices…</p>';
    let P=null;try{P=await ninjaPrices()}catch(e){}
    if(!P){out.innerHTML=emptyBox("Couldn't reach poe.ninja. Try again in a minute.");return}
    const type=b.dataset.econ;const plan=retierPlan(MODEL,type,P);ECON={type,plan};
    if(plan.tiers.length<2){out.innerHTML=emptyBox(`This filter has no ${type} tiers the editor recognises (it looks for NeverSink's $type->${type} tags).`);return}
    const div=P.div||null;const money=c=>div&&c>=div*0.8?(c/div).toFixed(1)+" div":(c>=100?Math.round(c):c.toFixed(1))+"c";
    out.innerHTML=plan.moves.length?`<p class="small" style="margin:6px 0 0">${plan.moves.length} item${plan.moves.length>1?"s":""} would move. Untick any you want to keep where they are.</p>
      <div class="tw"><table><thead><tr><th></th><th>Item</th><th>Price</th><th>From</th><th>To</th></tr></thead><tbody>${plan.moves.sort((a,c)=>c.p-a.p).map((m,i)=>`<tr><td><input type="checkbox" data-mv="${i}" checked aria-label="Move ${esc2(m.item)}"></td><td>${esc2(m.item)}</td><td class="num">${money(m.p)}</td><td>${esc2(m.from.tags.tier)}</td><td>${esc2(m.to.tags.tier)}${m.to.vis==="Hide"?' <span class="pill warn">hidden</span>':""}</td></tr>`).join("")}</tbody></table></div>
      <div class="row"><button class="btn primary" id="flEconGo">Apply ${plan.moves.length} moves</button></div>`
      :'<p class="small" style="margin:6px 0 0;color:var(--good)">Every priced item is already in the right tier.</p>';
    const go=$("flEconGo");if(go)go.onclick=()=>{const ticked=[...out.querySelectorAll("[data-mv]")].filter(x=>x.checked).map(x=>plan.moves[+x.dataset.mv]);
      const ops=opsFor();ticked.forEach(m=>ops.push({k:"move",b:m.from.idx,to:m.to.idx,item:m.item}));save();rebuild();renderAll2();
      if(typeof toast==="function")toast(`Moved ${ticked.length} item${ticked.length>1?"s":""}.`,()=>{const o=opsFor();o.splice(o.length-ticked.length,ticked.length);save();rebuild();renderAll2()})}});
}
function renderTweaks(){
  const el=$("flTweaks");if(!el)return;const s=st();
  if(!MODEL){el.innerHTML=`<h2>Build and strictness</h2>${emptyBox("Open a filter first.")}`;return}
  const m=parse(BASE.text);const tierCount=t=>m.blocks.filter(b=>b.tags.type===t&&b.vis==="Show").length;
  el.innerHTML=`<h2>Build and strictness</h2>
    <label class="row small fl-opt"><input type="checkbox" id="flBuild"${s.build?" checked":""}><span>Highlight my goal build's bases, uniques and gems (added at the top)</span></label>
    <label class="row small fl-opt"><input type="checkbox" id="flHideW"${s.hideClasses?" checked":""}><span>Hide weapon types my build doesn't use: normal, magic and rare, in maps only. Influenced, 5-link and 6-socket items still show.</span></label>
    <h3>Hide the lowest tiers</h3>
    <div class="fgrid">${[["currency","Currency"],["divination","Divination cards"],["uniques","Uniques"],["maps","Maps"]].map(([k,l])=>{const n=tierCount(k);return `<label class="f">${l}<select data-strict="${k}"${n?"":" disabled"}>${Array.from({length:Math.min(n,6)+1},(_,i)=>`<option value="${i}"${(+s.strict[k]||0)===i?" selected":""}>${i?`Hide lowest ${i}`:"No change"}</option>`).join("")}</select></label>`}).join("")}</div>
    <p class="small muted" style="margin:0">For a whole different strictness, download that version of the filter from FilterBlade and open it here.</p>`;
  $("flBuild").onchange=e=>{s.build=e.target.checked;save();rebuild();renderAll2()};
  $("flHideW").onchange=e=>{s.hideClasses=e.target.checked;save();rebuild();renderAll2()};
  el.querySelectorAll("[data-strict]").forEach(x=>x.onchange=()=>{s.strict[x.dataset.strict]=+x.value;save();rebuild();renderAll2()});
}
FL.render=render;
FL._test={parse,serialize,build,evaluate,retierPlan,applyOp,style,SAMPLES,saveName};
})();
