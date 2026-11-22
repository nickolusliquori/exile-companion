// Exile Companion main window, part 3 of 10: reading Client.txt (levels, zones, deaths) and gem data helpers.
// Classic scripts loaded in order by index.html; they share one global scope, so order matters.
"use strict";
/* ---------------- game log (Client.txt) ---------------- */
const LEAGUE_START="2026-11-13";
const isTownOrHideout=id=>/hideout|_town$|town/i.test(id)||/^(KalguuranSettlersLeague|Menagerie|Sanctum|HeistHub|Delve|BetrayalSafeHouse)/i.test(id);
const mapNameFromId=id=>id.replace(/^MapWorlds|^MapAtlas|^Map/,"").replace(/_/g," ").replace(/([a-z])([A-Z])/g,"$1 $2").trim()||id;
function parseClientLog(text,since){
  const R={chars:{},runs:[],deaths:[],areas:0,maxAct:0,lastAct:0,lastZone:null,first:null,last:null,lines:0,campaignMs:0,camps:[]};
  let cur=null,run=null,lastT=0,camp=null;
  const SPAN_CAP=20*60000;
  const lines=text.split(/\r?\n/);
  for(const l of lines){
    if(!(l.includes("Generating level")||l.includes("is now level")||l.includes("has been slain")||l.includes("You have entered")||l.includes("[SCENE] Set Source")||l.includes("Passive Skill")||l.includes("You have died")||l.includes("have played for")||l.includes("Deal with the Bandits"))) continue;
    const m=l.match(/^(\d{4})\/(\d\d)\/(\d\d) (\d\d):(\d\d):(\d\d)/);if(!m) continue;
    const t=new Date(+m[1],m[2]-1,+m[3],+m[4],+m[5],+m[6]).getTime();
    if(t<since) continue;
    R.lines++;if(!R.first)R.first=t;R.last=t;lastT=t;
    let g;
    if((g=l.match(/Generating level (\d+) area "([^"]+)"(?: with seed (\d+))?/))){
      const lvl=+g[1],id=g[2],seed=g[3]||"";
      if(cur){const span=Math.min(t-cur.t,90*60000);if(cur.run){cur.run.inMs+=span;cur.run.end=t}if(cur.act)R.campaignMs+=span;
        if(cur.camp&&cur.campAct){cur.camp.ms[cur.campAct]=(cur.camp.ms[cur.campAct]||0)+Math.min(t-cur.t,SPAN_CAP);cur.camp.last=t}}
      R.areas++;
      cur={id,lvl,seed,t,run:null,act:0};
      const ar=AREAS[id];
      const a=id.match(/^\d_(\d{1,2})_/);
      if(id==="1_1_1"&&(!camp||camp.maxAct>1)){camp={start:t,ms:{},firstAt:{1:t},maxAct:1,char:null,done:null,last:t};R.camps.push(camp)}
      if(a){const act=+a[1];if(act>=1&&act<=10){cur.act=act;R.maxAct=Math.max(R.maxAct,act);R.lastAct=act;
          if(camp&&!camp.done){if(!camp.firstAt[act])camp.firstAt[act]=t;camp.maxAct=Math.max(camp.maxAct,act)}}
        else if(act>10&&camp&&!camp.done){camp.done=t;camp=null}
        run=null}
      else if(/^Map/i.test(id)&&!/hideout/i.test(id)){
        const key=id+"#"+seed;
        if(!(run&&run.key===key)){run={key,id,lvl,seed,start:t,end:t,inMs:0,deaths:[],name:ar?ar[0]:""};R.runs.push(run)}
        cur.run=run;
      } else if(!isTownOrHideout(id)) cur.run=run;
      if(camp&&!camp.done){if(/^Map/i.test(id)&&!/hideout/i.test(id)){camp.done=t;camp=null}else{cur.camp=camp;cur.campAct=cur.act||camp.maxAct}}
      R.lastZone={id,lvl,t,name:ar?ar[0]:""};
      continue;
    }
    if((g=l.match(/\] : (.+?) \(([A-Za-z]+)\) is now level (\d+)/))){R.chars[g[1]]={name:g[1],cls:g[2],level:+g[3],t};(R.levelUps=R.levelUps||[]).push({name:g[1],level:+g[3],t});if(camp)camp.char=g[1];continue}
    if(/Passive Skill|You have died|have played for|Deal with the Bandits/.test(l)&&(g=l.match(/\] : (.+)$/))){(R.system=R.system||[]).push({text:g[1],t});continue}
    if((g=l.match(/\] : (.+?) has been slain\./))){R.deaths.push({name:g[1],t});if(cur&&cur.run)cur.run.deaths.push(g[1]);continue}
    if((g=l.match(/You have entered (.+?)\.\s*$/)||l.match(/\[SCENE\] Set Source \[(.+?)\]/))){
      const nm=g[1];if(nm&&nm!=="(null)"&&nm!=="(unknown)"){if(R.lastZone&&!R.lastZone.name)R.lastZone.name=nm;if(cur&&cur.run&&!cur.run.name)cur.run.name=nm}
    }
  }
  if(cur&&cur.run){cur.run.inMs+=Math.min(lastT-cur.t,90*60000);cur.run.end=lastT}
  if(cur&&cur.camp&&cur.campAct){cur.camp.ms[cur.campAct]=(cur.camp.ms[cur.campAct]||0)+Math.min(lastT-cur.t,SPAN_CAP)}
  return R;
}
let LOG=null;
async function readLogFile(file,sinceStr,full){
  const MAX=60*1024*1024;
  const blob=(!full&&file.size>MAX)?file.slice(file.size-MAX):file;
  const text=await blob.text();
  const since=new Date(sinceStr+"T00:00:00").getTime()||0;
  return {R:parseClientLog(text,since),partial:blob!==file,size:file.size};
}
function pickChar(R){
  const list=Object.values(R.chars).sort((a,b)=>b.t-a.t);
  if(!list.length) return null;
  const want=S.logChar&&list.find(c=>c.name===S.logChar);
  if(want) return want;
  const asc=C&&(C.ascend||C.className);
  return (asc&&list.find(c=>c.cls===asc))||list[0];
}
function applyLog(R,ch){
  const out=[];
  const name=ch&&ch.name;
  (R.system||[]).forEach(s=>{if(onSystemLine(s.text,s.t))out.push(`Read from chat: ${s.text.slice(0,60)}`)});
  if(ch){S.logChar=name;S.logInfo={name,cls:ch.cls,level:ch.level,t:ch.t,act:R.lastAct||null};out.push(`Level set to ${ch.level} (${name}).`);(R.levelUps||[]).filter(x=>x.name===name).forEach(x=>addLevelUp(x.level,x.t))}
  else if(R.lastAct){S.logInfo={...(S.logInfo||{}),act:R.lastAct}}
  const runs=R.runs.filter(r=>r.inMs>=30000);
  let newMaps=0;runs.forEach(r=>{if(markMapDone(r.id,r.start))newMaps++});
  if(newMaps)out.push(`${newMaps} new map${newMaps>1?"s":""} towards atlas completion.`);
  if(R.maxAct||runs.length){
    S.camp=S.camp||{};
    const reached=runs.length?11:R.maxAct;
    let ticked=0;
    CAMPAIGN.forEach(c=>{if(c.act<reached){c.steps.forEach((s,i)=>{if(s.k==="boss"&&!S.camp[c.act+"-"+i]){S.camp[c.act+"-"+i]=true;ticked++}})}});
    if(reached>10){S.progress.p1=true;S.campAct=10;out.push("Campaign complete: you've been running maps.")}
    else{S.campAct=R.lastAct||R.maxAct;out.push(`Campaign: you've reached Act ${R.maxAct}${ticked?`; ticked ${ticked} act boss${ticked>1?"es":""}`:""}.`)}
  }
  const have=new Set(S.session.maps.map(m=>m.key).filter(Boolean));
  const strat=withBuild(liveB(),()=>(STRATS.find(x=>x.id===S.strat)||primaryStrat()).name);
  let added=0;
  runs.forEach(r=>{const key=r.key+"@"+r.start;
    const myDeaths=name?r.deaths.filter(d=>d===name).length:r.deaths.length;
    if(have.has(key)){const ex=S.session.maps.find(m=>m.key===key);if(ex&&ex.src==="log"&&r.inMs>(ex.dur||0)){ex.dur=r.inMs;ex.note=(r.name||mapNameFromId(r.id))+(myDeaths?` · ${myDeaths} death${myDeaths>1?"s":""}`:"")}return}
    S.session.maps.push({key,src:"log",tier:r.lvl>=68?Math.min(17,r.lvl-67):r.lvl,profit:0,threads:0,dur:r.inMs,at:r.start,strat,note:(r.name||mapNameFromId(r.id))+(myDeaths?` · ${myDeaths} death${myDeaths>1?"s":""}`:"")});added++});
  S.session.maps.sort((a,b)=>(a.at||0)-(b.at||0));
  if(R.camps.length){
    S.splitRuns=S.splitRuns||[];
    R.camps.forEach(c=>{const rec={start:c.start,char:c.char,ms:c.ms,maxAct:c.maxAct,done:c.done};
      const i=S.splitRuns.findIndex(x=>x.start===c.start);if(i>=0)S.splitRuns[i]=rec;else S.splitRuns.push(rec)});
    S.splitRuns.sort((a,b)=>a.start-b.start);S.splitRuns=S.splitRuns.slice(-10);
    const latest=S.splitRuns[S.splitRuns.length-1];
    out.push(`Act splits updated${latest.char?` for ${latest.char}`:""}: ${latest.done?"campaign finished in "+hms(Object.values(latest.ms).reduce((a,b)=>a+b,0)):"run in progress, Act "+latest.maxAct}.`);
  }
  if(runs.length) out.push(added?`Added ${added} new map${added>1?"s":""} to your map log (fill in profit when you know it).`:"No new maps since your last update.");
  save();
  return out;
}
/* linked log file (File System Access API, Chrome/Edge desktop) */
let LOGH=null, logTimer=null, logBusy=false;
const FS_OK=()=>!window.exileDesktop&&typeof window.showOpenFilePicker==="function"&&!S.fsBlocked;
function idb(){return new Promise((res,rej)=>{try{const r=indexedDB.open("ec330",1);r.onupgradeneeded=()=>r.result.createObjectStore("kv");r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)}catch(e){rej(e)}})}
async function idbSet(k,v){try{const db=await idb();await new Promise((res,rej)=>{const tx=db.transaction("kv","readwrite");tx.objectStore("kv").put(v,k);tx.oncomplete=res;tx.onerror=()=>rej(tx.error)})}catch(e){}}
async function idbGet(k){try{const db=await idb();return await new Promise((res,rej)=>{const r=db.transaction("kv").objectStore("kv").get(k);r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)})}catch(e){return null}}
async function idbDel(k){try{const db=await idb();db.transaction("kv","readwrite").objectStore("kv").delete(k)}catch(e){}}
const logSig=()=>JSON.stringify([S.logInfo&&S.logInfo.level,S.campAct,S.session.maps.length,S.session.maps.reduce((a,m)=>a+(m.dur||0),0)]);
async function processLogFile(file,{full=false,quiet=false,tailMB=60}={}){
  const MAX=tailMB*1024*1024;
  const blob=(!full&&file.size>MAX)?file.slice(file.size-MAX):file;
  const text=await blob.text();
  const changed=await processLogText(text,{quiet,partial:blob!==file,size:file.size,file});
  S.logLastMod=file.lastModified;save();
  return changed;
}
async function processLogText(text,{quiet=false,partial=false,size=0,file=null}={}){
  const before=logSig();
  const since=new Date((S.logSince||LEAGUE_START)+"T00:00:00").getTime()||0;
  const R=parseClientLog(text,since);
  const prevChars=LOG&&quiet?LOG.R.chars:{};
  R.chars={...prevChars,...R.chars};
  const prevApplied=LOG&&quiet?LOG.applied:null;
  LOG={R,partial,size,file,checked:Date.now(),applied:null};
  LOG.applied=R.lines?applyLog(R,pickChar(R)):prevApplied;
  save();
  return before!==logSig();
}
async function checkLinked(manual){
  if(!LOGH||logBusy) return;
  logBusy=true;
  try{
    const perm=await LOGH.queryPermission({mode:"read"});
    if(perm!=="granted"){S.logNeedsPerm=true;stopLogTimer();renderGameLog();return}
    const f=await LOGH.getFile();
    if(!manual&&LOG&&f.lastModified===S.logLastMod&&LOG.size===f.size){LOG.checked=Date.now();updateChecked();return}
    const changed=await processLogFile(f,{quiet:!manual,tailMB:LOG&&!manual?20:60});
    if(changed||manual){renderAll()}else{updateChecked()}
  }catch(e){console.error(e);const st=$("logStatus");if(st){st.className="status err";st.textContent="Couldn't read the linked file. It may have moved: link it again."}}
  finally{logBusy=false}
}
function updateChecked(){const el=$("logChecked");if(el&&LOG)el.textContent="Last checked "+new Date(LOG.checked).toLocaleTimeString()}
function stopLogTimer(){clearInterval(logTimer);logTimer=null}
function startLogTimer(){stopLogTimer();const m=+S.logAuto||0;if(LOGH&&m>0)logTimer=setInterval(()=>checkLinked(false),m*60000)}
async function initLinkedLog(){
  if(!FS_OK()) return;
  const hnd=await idbGet("logHandle");if(!hnd) return;
  LOGH=hnd;
  try{const perm=await hnd.queryPermission({mode:"read"});S.logNeedsPerm=perm!=="granted"}catch(e){S.logNeedsPerm=true}
  if(S.logAuto==null) S.logAuto=5;
  if(!S.logNeedsPerm){await checkLinked(true);startLogTimer()}else renderGameLog();
}
function renderGameLog(){
  const el=$("sessGameLog");if(!el)return;
  const since=S.logSince||LEAGUE_START;
  let res="";
  if(LOG){
    const R=LOG.R, ch=pickChar(R), chars=Object.values(R.chars).sort((a,b)=>b.t-a.t);
    const name=ch&&ch.name;
    const myDeaths=R.deaths.filter(d=>!name||d.name===name).length;
    const runs=R.runs.filter(r=>r.inMs>=30000);
    const avg=runs.length?runs.reduce((a,r)=>a+r.inMs,0)/runs.length:0;
    res=`<div class="stats">
        <div class="stat"><div class="k">Character</div><div class="v" style="font-size:1rem">${ch?esc(ch.name):"–"}</div></div>
        <div class="stat"><div class="k">Level</div><div class="v num">${ch?ch.level:"–"}</div></div>
        <div class="stat"><div class="k">Furthest act</div><div class="v num">${runs.length?"Maps":R.maxAct||"–"}</div></div>
        <div class="stat"><div class="k">Maps run</div><div class="v num">${runs.length}</div></div>
        <div class="stat"><div class="k">Avg map time</div><div class="v num">${avg?hms(avg):"–"}</div></div>
        <div class="stat"><div class="k">Deaths</div><div class="v num">${myDeaths}</div></div>
      </div>
      ${chars.length>1?`<label class="f" for="logChar">Characters in the log<select id="logChar">${chars.map(c=>`<option value="${esc(c.name)}"${c.name===name?" selected":""}>${esc(c.name)} · ${esc(c.cls)} · Lv ${c.level}</option>`).join("")}</select></label>`:""}
      ${R.lastZone?`<p class="small muted" style="margin:0">Last area: ${esc(R.lastZone.name||mapNameFromId(R.lastZone.id))} (area level ${R.lastZone.lvl}) · ${new Date(R.lastZone.t).toLocaleString()}</p>`:""}
      ${LOG.applied?`<ul class="small" style="margin:0;padding-left:18px">${LOG.applied.map(x=>`<li>${esc(x)}</li>`).join("")}</ul>`:""}
      ${LOG.partial?`<p class="small muted" style="margin:0">Read the newest 60 MB of a ${(LOG.size/1048576).toFixed(0)} MB log. <button class="btn ghost small" id="logFull">Read the whole file</button></p>`:""}
      ${!R.lines?'<p class="small" style="margin:0;color:var(--warn)">No play activity found after that date. Pick an earlier date, or check you chose Client.txt.</p>':""}`;
  }
  el.innerHTML=`<h2>Update from game log</h2>
    ${window.exileDesktop?`<div class="row"><span class="pill ${typeof LIVE!=="undefined"&&LIVE.status&&LIVE.status.ok?"good":"warn"}">${typeof LIVE!=="undefined"&&LIVE.status&&LIVE.status.ok?"Live log on: updates as you play":"Live log not connected"}</span><button class="btn ghost small" id="toDesk">Desktop settings</button></div>`:""}
    <p class="small" style="margin:0">Upload your <b>Client.txt</b> to update your level, campaign act and map log in one go. Do it from your PC after a session; re-upload any time and only new maps are added.</p>
    <div class="fgrid">
      <label class="f" for="logFile">Client.txt<input type="file" id="logFile" accept=".txt,text/plain"></label>
      <label class="f" for="logSince">Only read activity since<input type="date" id="logSince" value="${esc(since)}"></label>
    </div>
    ${FS_OK()?(LOGH&&!S.logNeedsPerm?`<div class="sg" style="display:grid;gap:8px"><div class="row" style="justify-content:space-between"><span class="pill good">Linked: ${esc(LOGH.name)}</span><span class="small muted" id="logChecked">${LOG?"Last checked "+new Date(LOG.checked).toLocaleTimeString():""}</span></div>
        <div class="row"><label class="f" for="logAuto" style="flex-direction:row">Check automatically<select id="logAuto">${[[0,"Off"],[2,"Every 2 min"],[5,"Every 5 min"],[10,"Every 10 min"],[15,"Every 15 min"]].map(([v,t])=>`<option value="${v}"${+S.logAuto===v?" selected":""}>${t}</option>`).join("")}</select></label>
        <button class="btn" id="logNow">Check now</button><button class="btn ghost" id="logUnlink">Unlink</button></div>
        <p class="small muted" style="margin:0">Reads the log when the app opens and on this schedule while it stays open.</p></div>`
      :LOGH&&S.logNeedsPerm?`<div class="row"><button class="btn primary" id="logReconnect">Reconnect ${esc(LOGH.name)}</button><span class="small muted">Your browser wants one click per visit before reading it again.</span></div>`
      :`<div class="row"><button class="btn primary" id="logLink">Link Client.txt for auto-updates</button><span class="small muted">Chrome or Edge on a computer.</span></div>`):""}
    <div class="status" id="logStatus" role="status"></div>
    ${res}
    <details class="small"><summary style="cursor:pointer">Where is Client.txt?</summary>
      <ul style="margin:6px 0 0;padding-left:18px">
        <li>Standalone: <span class="code" style="display:inline;padding:1px 4px">C:\\Program Files (x86)\\Grinding Gear Games\\Path of Exile\\logs\\Client.txt</span></li>
        <li>Steam: <span class="code" style="display:inline;padding:1px 4px">…\\steamapps\\common\\Path of Exile\\logs\\Client.txt</span> (Steam: right-click the game → Manage → Browse local files)</li>
      </ul></details>
    <p class="note" style="margin:0">The log has zones, level-ups and deaths, but no gear, gems or passives: re-import your character from PoB for those. Profit isn't in the log either; type it into the map log. Your progress saves in this browser only, so updating on your PC won't change what your phone shows.</p>`;
  $("logSince").onchange=e=>{S.logSince=e.target.value||LEAGUE_START;save()};
  const td=$("toDesk");if(td)td.onclick=()=>showTab("desktop");
  const run=async(file,full)=>{
    const st=$("logStatus");st.className="status";st.textContent="Reading log…";
    try{
      await processLogFile(file,{full});
      renderAll();showTab("session");
      const st2=$("logStatus");if(st2){st2.className="status ok";st2.textContent=LOG.R.lines?"Log read. Your app is updated.":""}
    }catch(e){console.error(e);st.className="status err";st.textContent="Couldn't read that file. Make sure it's Client.txt from the game's logs folder."}
  };
  $("logFile").onchange=e=>{const f=e.target.files[0];if(f)run(f,false)};
  const lf=$("logFull");if(lf)lf.onclick=()=>run(LOG.file,true);
  const ll=$("logLink");if(ll)ll.onclick=async()=>{
    const st=$("logStatus");
    try{const [hnd]=await window.showOpenFilePicker({types:[{description:"Path of Exile log",accept:{"text/plain":[".txt"]}}],multiple:false});
      LOGH=hnd;S.logNeedsPerm=false;if(S.logAuto==null)S.logAuto=5;save();await idbSet("logHandle",hnd);
      st.className="status";st.textContent="Reading log…";await checkLinked(true);startLogTimer();showTab("session");
      const s2=$("logStatus");if(s2){s2.className="status ok";s2.textContent="Linked. The app will read it on launch and on your schedule."}}
    catch(e){if(e&&e.name==="AbortError")return;
      if(e&&(e.name==="SecurityError"||e.name==="NotAllowedError"||e.name==="TypeError")){S.fsBlocked=true;save();renderGameLog();const s3=$("logStatus");if(s3){s3.className="status err";s3.textContent="Your browser blocks linking files inside this page. Use the Client.txt upload above instead."}}
      else{st.className="status err";st.textContent="Couldn't link that file."}}
  };
  const rc=$("logReconnect");if(rc)rc.onclick=async()=>{try{const p=await LOGH.requestPermission({mode:"read"});if(p==="granted"){S.logNeedsPerm=false;save();await checkLinked(true);startLogTimer()}}catch(e){S.fsBlocked=true;save();renderGameLog()}};
  const ln=$("logNow");if(ln)ln.onclick=()=>checkLinked(true);
  const la=$("logAuto");if(la)la.onchange=()=>{S.logAuto=+la.value;save();startLogTimer()};
  const lu=$("logUnlink");if(lu)lu.onclick=async()=>{stopLogTimer();LOGH=null;S.logNeedsPerm=false;save();await idbDel("logHandle");renderGameLog()};
  const lc=$("logChar");if(lc)lc.onchange=()=>{S.logChar=lc.value;const ch=LOG.R.chars[lc.value];LOG.applied=applyLog(LOG.R,ch);renderAll();showTab("session")};
}


/* ---------------- gem data helpers ---------------- */
const gemNorm=n=>String(n||"").toLowerCase().replace(/ support$/,"").trim();
const GEMIDX=new Map(GEMDB.map((g,i)=>[gemNorm(g[0]),i]));
function gemInfo(name){
  const n=gemNorm(name);let i=GEMIDX.get(n),note="";
  if(i==null){const m=n.match(/^(.*) of [a-z' -]+$/);if(m&&GEMIDX.has(m[1])){i=GEMIDX.get(m[1]);note="transfigured"}}
  if(i==null&&/^awakened /.test(n)) return {i:null,name,note:"awakened"};
  if(i==null) return null;
  const d=GEMDB[i];return {i,name:d[0].replace(/ Support$/,""),lvl:d[1],attr:d[2],sup:!!d[3],note,orig:name};
}
function gemSources(info,cls){
  const bit=1<<CLASSES.indexOf(cls);
  const r=(REWARDS[info.i]||[]).filter(x=>x[2]&bit);
  return {quest:r.filter(x=>x[1]===0),vendor:r.filter(x=>x[1]===1)};
}
function buildGemList(b){const seen=new Map();currentSkills(b).forEach(s=>s.enabled&&s.gems.forEach(g=>{if(g.enabled&&!seen.has(gemNorm(g.name)))seen.set(gemNorm(g.name),g)}));return [...seen.values()]}
function gemPlan(b){
  const cls=b.className, start=CHARS[cls]||[];
  const gems=buildGemList(b).map(g=>({g,info:gemInfo(g.name)}));
  const takenQuest=new Map(); const plan=[];
  const sorted=gems.filter(x=>x.info&&x.info.i!=null).sort((a,b)=>a.info.lvl-b.info.lvl);
  for(const x of sorted){
    const base=x.info.name;
    if(start.map(gemNorm).includes(gemNorm(base))){plan.push({...x,how:"start",act:1,text:`You start with ${base}${gemNorm(start[1])===gemNorm(base)?" (chest in the Twilight Strand)":""}.`});continue}
    const src=gemSources(x.info,cls);
    const q=src.quest.find(r=>!takenQuest.has(r[0]));
    if(q){takenQuest.set(q[0],base);const Q=QUESTS[q[0]];plan.push({...x,how:"quest",act:Q[1],qi:q[0],npc:q[3],text:`Take ${base} from ${q[3]} for "${Q[0]}".`});continue}
    const v=src.vendor[0];
    if(v){const Q=QUESTS[v[0]];plan.push({...x,how:"vendor",act:Q[1],qi:v[0],npc:v[3],text:`Buy ${base} from ${v[3]} after "${Q[0]}".`});continue}
    plan.push({...x,how:"siosa",act:3,text:`${base}: buy from Siosa (Act 3 Library) or Lilly Roth (Act 6).`});
  }
  gems.filter(x=>!x.info||x.info.i==null).forEach(x=>plan.push({...x,how:"late",act:11,text:`${x.g.name}: ${x.info&&x.info.note==="awakened"?"endgame upgrade, buy on trade":"not a campaign reward, buy on trade"}.`}));
  plan.forEach(p=>{if(p.info&&p.info.note==="transfigured")p.text+=` Transfigure it to ${p.g.name} later (Labyrinth Dedication) or buy it on trade.`});
  return plan.sort((a,b)=>a.act-b.act||(a.qi||0)-(b.qi||0));
}
/* search strings */
const RX_ESC=s=>s.replace(/[.*+?^${}()|[\]\\]/g,"\\$&");
const GEM_POOL=GEMDB.map(g=>g[0].toLowerCase());
function gemFragment(name){
  const n=name.toLowerCase();const vaal=n.startsWith("vaal ");
  const pool=GEM_POOL.filter(o=>o!==n&&o!==n+" support"&&(vaal||!o.startsWith("vaal ")));
  for(const wordStart of [true,false])for(let len=4;len<=n.length;len++)for(let s=0;s+len<=n.length;s++){if(wordStart&&s>0&&n[s-1]!==" ")continue;const f=n.slice(s,s+len);if(/^ | $/.test(f))continue;if(!pool.some(o=>o.includes(f)))return f}
  return n;
}
function searchStrings(frags,limit=250){
  const out=[];let cur=[];
  const len=a=>a.join("|").length+2;
  frags.forEach(f=>{const e=RX_ESC(f);if(cur.length&&len([...cur,e])>limit){out.push(cur);cur=[]}cur.push(e)});
  if(cur.length)out.push(cur);
  return out.map(a=>`"${a.join("|")}"`);
}
function gemSearchFor(gemNames){const fr=[...new Set(gemNames.map(n=>{const i=gemInfo(n);return gemFragment(i&&i.i!=null?i.name:n)}))];return searchStrings(fr)}
function copyBox(id,label,str){return `<div style="display:grid;gap:4px"><span class="small muted">${esc(label)}</span><div class="row" style="flex-wrap:nowrap;align-items:stretch"><div class="code" style="flex:1" id="${id}">${esc(str)}</div><button class="btn ghost small" data-copy="${id}">Copy</button></div></div>`}
function bindCopy(root){(root||document).querySelectorAll("[data-copy]").forEach(b=>b.onclick=async()=>{const t=$(b.dataset.copy).textContent;try{await navigator.clipboard.writeText(t);b.textContent="Copied"}catch(e){b.textContent="Select & copy"}setTimeout(()=>b.textContent="Copy",1500)})}
const LEVEL_RX=[["3-link (any colours)",'"[rgbw]-[rgbw]-[rgbw]"'],["4-link (any colours)",'"[rgbw]-[rgbw]-[rgbw]-[rgbw]"'],["Movement speed boots",'"movement speed"']];
/* splits */
function splitTotals(r){let cum=0;const rows=[];for(let a=1;a<=10;a++){const v=r.ms[a];if(v==null)continue;cum+=v;rows.push({act:a,ms:v,cum})}return rows}
function renderSplits(){
  const el=$("campSplits");if(!el)return;
  const runs=S.splitRuns||[];
  if(!runs.length){el.innerHTML=`<h2>Act splits</h2><p class="small" style="margin:0">Upload or link your Client.txt (Play → Session) and your time per act appears here, compared with your best run.</p><div><button class="btn ghost small" id="splitGo">Go to game log</button></div>`;$("splitGo").onclick=()=>showTab("session");return}
  const latest=runs[runs.length-1];
  const finished=runs.filter(r=>r.done);
  const pb=finished.length?finished.reduce((a,b)=>Object.values(a.ms).reduce((x,y)=>x+y,0)<=Object.values(b.ms).reduce((x,y)=>x+y,0)?a:b):null;
  const best={};runs.forEach(r=>{for(let a=1;a<=10;a++){const v=r.ms[a];const nextReached=r.done||r.maxAct>a;if(v!=null&&nextReached&&(best[a]==null||v<best[a]))best[a]=v}});
  const rows=splitTotals(latest), pbRows=pb&&pb!==latest?splitTotals(pb):[];
  const pbCum=a=>{const r=pbRows.find(x=>x.act===a);return r?r.cum:null};
  const d=ms=>{const s=Math.round(Math.abs(ms)/1000);return (ms<0?"−":"+")+(s>=3600?Math.floor(s/3600)+":":"")+String(Math.floor(s/60)%60).padStart(s>=3600?2:1,"0")+":"+String(s%60).padStart(2,"0")};
  const total=rows.length?rows[rows.length-1].cum:0;
  el.innerHTML=`<div class="row" style="justify-content:space-between"><h2>Act splits</h2><span class="row" style="gap:4px">${pb===latest&&finished.length>1?'<span class="pill good">New best run</span>':""}<span class="pill ${latest.done?"good":"gold"}">${latest.done?"Finished":"In progress · Act "+latest.maxAct}</span></span></div>
    <p class="small muted" style="margin:0">${latest.char?esc(latest.char)+" · ":""}started ${new Date(latest.start).toLocaleDateString()} · total ${hms(total)}${pb&&pb!==latest?` · best run ${hms(pbRows[pbRows.length-1].cum)}`:""}</p>
    <div class="tw"><table><thead><tr><th>Act</th><th>Time</th><th>Total</th>${pbRows.length?"<th>vs best run</th>":""}<th>Best act</th></tr></thead><tbody>
    ${rows.map(r=>{const pc=pbCum(r.act);const diff=pc!=null?r.cum-pc:null;return `<tr><td>${r.act}</td><td class="num">${hms(r.ms)}</td><td class="num">${hms(r.cum)}</td>${pbRows.length?`<td class="num delta ${diff==null?"":diff<=0?"pos":"neg"}">${diff==null?"–":d(diff)}</td>`:""}<td class="num">${best[r.act]!=null?hms(best[r.act])+(best[r.act]===r.ms&&(latest.done||latest.maxAct>r.act)?' <span class="pill good">best</span>':""):"–"}</td></tr>`}).join("")}
    </tbody></table></div>
    ${runs.length>1?`<p class="small muted" style="margin:0">${runs.length} campaign runs found in your logs.</p>`:""}
    <p class="note" style="margin:0">Times come from your game log. Time spent in town and your hideout counts toward the current act, and any single stay over 20 minutes is capped so AFK breaks don't wreck your splits.</p>`;
}
/* gem rewards card */
function renderCampGems(A){
  const el=$("campGems");if(!el)return;
  const plan=gemPlan(B);
  const cls=B.className;
  const byAct={};plan.forEach(p=>{(byAct[p.act]=byAct[p.act]||[]).push(p)});
  const thisAct=byAct[A.act]||[];
  const buyable=plan.filter(p=>(p.how==="vendor"||p.how==="quest")&&p.act<=A.act||p.how==="siosa"&&A.act>=3).map(p=>p.info.name);
  const rx=buyable.length?gemSearchFor(buyable):[];
  el.innerHTML=`<h2>Gem rewards for your ${esc(cls)}</h2>
    <p class="small muted" style="margin:0">From your goal build's gems and the ${esc(cls)} reward tables. Take the quest reward when it's free; buy the rest from the vendor.</p>
    <h3>Act ${A.act}</h3>
    ${thisAct.length?`<ul class="clean small">${thisAct.map(p=>`<li class="row" style="flex-wrap:nowrap;align-items:flex-start"><span class="pill ${p.how==="quest"?"good":p.how==="vendor"?"gold":""}" style="flex:none">${p.how==="quest"?"Free":p.how==="vendor"?"Buy":p.how==="start"?"Start":"Vendor"}</span><span>${esc(p.text)} <span class="muted">(level ${p.info.lvl})</span></span></li>`).join("")}</ul>`:'<p class="small muted" style="margin:0">No new build gems unlock in this act.</p>'}
    ${rx.length?rx.map((s,i)=>copyBox("gemRx"+i,i?"…continued":"Vendor search: build gems you can buy by now",s)).join(""):""}
    <details class="small"><summary style="cursor:pointer">All acts</summary><ul class="clean" style="margin-top:6px">${Object.entries(byAct).map(([a,ps])=>`<li><b>${a>10?"After the campaign":"Act "+a}</b><ul style="margin:2px 0 0;padding-left:18px">${ps.map(p=>`<li>${esc(p.text)}</li>`).join("")}</ul></li>`).join("")}</ul></details>
    <h3>Leveling vendor searches</h3>
    ${LEVEL_RX.map(([l,s],i)=>copyBox("lvRx"+i,l,s)).join("")}
    <p class="note" style="margin:0">Paste a search into any vendor or stash search box and matching items light up. The game caps a search at 250 characters, so long lists are split.</p>`;
  bindCopy(el);
}
/* farming profitability */
function renderProfit(){
  const el=$("sessProfit");if(!el)return;
  const maps=S.session.maps;
  const g={};maps.forEach(m=>{const k=m.strat||"Unassigned";const x=(g[k]=g[k]||{n:0,p:0,dur:0,durN:0,pDur:0,priced:0});x.n++;x.p+=+m.profit||0;if(m.profit)x.priced++;if(m.dur){x.dur+=m.dur;x.durN++;x.pDur+=+m.profit||0}});
  const rows=Object.entries(g).map(([k,x])=>({k,...x,avgP:x.p/x.n,avgT:x.durN?x.dur/x.durN:null,cph:x.dur>60000?x.pDur/(x.dur/3.6e6):null})).sort((a,b)=>(b.cph??-1e9)-(a.cph??-1e9));
  const bestK=rows.find(r=>r.cph!=null&&r.priced>=3);
  el.innerHTML=`<h2>Which farm pays best?</h2>${rows.length?`
    <div class="tw"><table><thead><tr><th>Strategy</th><th>Maps</th><th>Avg time</th><th>Avg profit</th><th>Per hour</th></tr></thead><tbody>
    ${rows.map(r=>`<tr><td>${esc(r.k)}${bestK&&bestK.k===r.k?' <span class="pill good">best</span>':""}</td><td class="num">${r.n}</td><td class="num">${r.avgT?hms(r.avgT):"–"}</td><td class="num">${fmt(r.avgP)}c</td><td class="num">${r.cph!=null?`${fmt(r.cph)}c · ${(r.cph/S.divine).toFixed(2)} div`:"–"}</td></tr>`).join("")}
    </tbody></table></div>
    <p class="note" style="margin:0">Per hour uses maps with a recorded time (from the game log) and the profit you entered. A strategy is marked best once it has 3+ maps with profit filled in. Switch strategy on the Atlas tab and new maps log under it.</p>`:emptyBox("Log maps (by hand or from your game log) under different strategies to compare chaos per hour.",[["Add a map","addMap"]])}`;
}
