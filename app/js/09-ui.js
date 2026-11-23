// Exile Companion main window, part 9 of 10: undo toasts, help, settings, setup wizard, icons, tooltips, look and feel, first-time experience.
// Classic scripts loaded in order by index.html; they share one global scope, so order matters.
"use strict";
/* ---------------- update 2: undo toasts, empty states, help, settings, setup wizard ---------------- */
let toastT=null;
function toast(msg,undo,label){
  const t=$("toast");if(!t)return;
  t.innerHTML=`<span>${esc(msg)}</span>${undo?`<button class="btn primary small" id="toastUndo">${esc(label||"Undo")}</button>`:""}<button class="btn ghost small" id="toastX" aria-label="Dismiss">✕</button>`;
  t.hidden=false;clearTimeout(toastT);toastT=setTimeout(()=>{t.hidden=true},undo?9000:4000);
  if(undo)$("toastUndo").onclick=()=>{t.hidden=true;clearTimeout(toastT);try{undo()}catch(e){console.error(e)}};
  $("toastX").onclick=()=>{t.hidden=true};
}
function emptyBox(msg,fixes){fixes=fixes||[];return `<div class="emptybox"><p>${esc(msg)}</p>${fixes.length?`<div class="row">${fixes.map(([l,a],i)=>`<button class="btn ${i?"ghost":"primary"} small" data-fix="${a}">${esc(l)}</button>`).join("")}</div>`:""}</div>`}
const scrollToCard=id=>setTimeout(()=>{const c=$(id);if(c){c.scrollIntoView({block:"start",behavior:"smooth"});c.classList.remove("flash");void c.offsetWidth;c.classList.add("flash")}},60);
const FIX={
  importGoal:()=>openImport("goal"),importCurrent:()=>openImport("current"),wizard:()=>openWizard(),shop:()=>showTab("shop"),
  startTimer:()=>{const t=$("sessToggle");if(t&&!S.session.start)t.click();showTab("session")},
  goSession:()=>showTab("session"),
  addMap:()=>{showTab("session");scrollToCard("sessAdd");setTimeout(()=>{const i=$("sessAdd").querySelector("input,select");if(i)i.focus()},400)},
  findLog:()=>{if(DESK){showTab("desktop");setTimeout(()=>{const b=$("dkDetect");if(b)b.click()},60)}else{showTab("session");scrollToCard("sessGameLog")}},
  syncChar:()=>{showTab("account");scrollToCard("acctChar")},
  snapshot:()=>{showTab("account");setTimeout(()=>{const b=$("nwSnap");if(b)b.click()},60)},
  account:()=>{showTab("settings");scrollToCard("acctConn")},
  report:()=>openReport(),
};
document.addEventListener("click",e=>{const b=e.target.closest("[data-fix]");if(b&&FIX[b.dataset.fix]){e.preventDefault();if(b.closest("#setup"))$("setup").close();FIX[b.dataset.fix]()}});

const HELP={
  deskPob:"Uses your own Path of Building Community to calculate what a price-checked item does to your build (DPS, life, ES, EHP, resistances), compared with what you wear. It runs Path of Building in the background; the first check takes a few seconds, later ones are almost instant.",
  deskStash:"When someone buys from you, outlines the item over your stash using the tab and position in their whisper. Line the grid up with a normal stash tab once; it only draws on top of the game.",
  deskChat:"Alerts you when chat mentions your keywords. One keyword per line; -word skips messages with that word, /regex/ for patterns. Reads chat from your game log only.",
  deskPhone:"Shows the overlay's information on your phone over your home network. Scan the QR code; the link has a private key, and New link makes old links stop working.",
  deskTwitch:"Answers chat commands like !build and !level in your Twitch chat using what the app already knows. Sign in once with a code; turn single commands off, add your own, or make them mods-only.",
  setCharsCard:"Keep several characters, each with its own builds, campaign progress, atlas, owned gear and map log. Prices, trading and settings stay shared.",
  setData:"Where the app's game data comes from and how current it is. It updates itself when new data is published.",
  deskRules:"How the app stays within Grinding Gear Games' rules: it reads the game log and your clipboard once per key press, and never sends input to the game.",
  acctRecipe:"Counts full sets of rare gear in the stash tabs you include in net worth: helmet, body, gloves, boots, belt, amulet, two rings and a weapon (two-hander, or one-hander plus shield or second one-hander). Lowest item level 60–74 gives Chaos Orbs, all 75+ gives Regal Orbs; unidentified sets pay double.",
  mediaNow:"Shows what's playing anywhere in Windows (Spotify, Apple Music, a Netflix or YouTube tab in your browser, Stremio…) through Windows' own media controls, with play/pause and skip. The overlay shows it too; its buttons work in click mode.",
  mediaPlayer:"A small always-on-top player over the game for YouTube, YouTube Music, Twitch, Kick and SoundCloud. Click-through lets your clicks pass to the game. Netflix, Hulu, Disney+, Apple Music and similar can't play in it: they need copy protection the app doesn't have.",
  btUpg:"Each slot gets a score: the sum of its stats times your weights. Searches ask the trade site for items scoring at least 10% higher, cheapest first, and rank them by score gained per divine. Searches are paced to stay within the trade site's limits.",
  sessGoal:"Set a target for this session: divines or chaos earned (maps you log plus sales), maps run, or hours played. Progress shows on Home and the overlay, and you get a notification when you reach it.",
  btTimeless:"Pick a timeless jewel, seed, conqueror and socket to see what each notable in its radius becomes. Find seeds ranks every seed by how many notables get the results you tick. Data from Path of Building.",
  btGems:"Uncorrupted gem prices from poe.ninja: what a gem costs at low level and what it sells for levelled (and with 20% quality). Listings filter out thin markets.",
  lgThreads:"Set how many of each Thread you put in the map device. Prices come from poe.ninja; free Threads from a Shaped Region of the same type are taken off the cost.",
  lgBetrayal:"Track where each Syndicate member is and where you want them. Pick a plan to fill in the targets, then follow the moves listed above the table.",
  homeChar:"Your character at a glance. The percentage compares your current character with the goal build: passive tree, gear, gems and level.",
  homeNext:"The most useful things to do right now: the next campaign steps (or atlas milestone) and the biggest gaps between your character and the guide.",
  homeSession:"Time, maps and earnings for the current play session. The timer starts and pauses from here or the Session page.",
  homeLive:"What the desktop app is connected to right now: the game log, the overlay, trade requests, your stash value and app updates.",
  buildSummary:"The build from your Path of Building code. Switch between the goal build and your current character at the top.",
  buildDefence:"Resistances and defences as Path of Building calculated them, with whatever config (flasks, charges, buffs) was on when you exported.",
  buildSkills:"Every skill group in the build with its gem levels and quality. The main skill is listed first.",
  buildGear:"Each equipped item. Click one to plan a craft for that slot.",
  progSummary:"How close your current character is to the goal build, by passive tree, gear, gems and level.",
  progNext:"A to-do list ordered by impact: resistances first, then links, key uniques and gear mods.",
  progCost:"A rough price for everything you still need, from poe.ninja prices for uniques and gems.",
  progTree:"Passives the guide has that you don't, and passives you have that the guide doesn't.",
  progGems:"Gems missing from your character or below the guide's level and quality.",
  progItems:"Slot by slot: how many of the guide's key mods your current item has.",
  shopSummary:"Everything worth buying or looking out for, built from the goal build.",
  shopGems:"Where to get each gem: quest reward, vendor, or the trade site, with copyable vendor searches.",
  shopItems:"Uniques and key rare bases for the build, with trade links and optional price alerts.",
  shopFilter:"A loot filter add-on that highlights your build's bases and uniques.",
  campAct:"Step-by-step route for the act, with the target level to be when you leave.",
  campGems:"Gems you can take or buy in this act for your build.",
  campSplits:"Your time per act, read from Client.txt, compared with your best run.",
  campReadouts:"Answers from in-game chat commands like /played and /passives, picked up from your game log.",
  mapsNext:"The next step of atlas progression for your build's strength.",
  mapsDanger:"Map mods your build should avoid, plus a stash search that hides maps with them.",
  mapsCompletion:"Which maps you've completed for atlas bonus, so you know what's left.",
  mapsBosses:"Pinnacle bosses and what you need to fight them.",
  mapsCards:"Valuable divination cards and the maps that drop them.",
  atlasProfile:"Your build's strengths decide which farming strategies fit it best.",
  atlasPhases:"How to grow the atlas tree as you get more points.",
  craftPlan:"A crafting plan for the selected slot: base, method and expected cost.",
  clItem:"Pick the base type, item level and influences. You can start from an item in your goal build.",
  clOdds:"For the mods you ticked: the chance per try and the average cost of each method, simulated with the game's mod weights and current prices.",
  clEmu:"Click currency on the item to practice a craft with the game's real odds. Undo and New item are free; the spent counter uses current prices.",
  clSim:"Build a plan from steps (for example Alteration until 2 targets, then Regal, then Exalt) and run it thousands of times for the average, median and unlucky cost.",
  ttSearch:"Builds a search for your map tab: maps with any ticked mod are hidden, and you can require a minimum quantity or pack size.",
  ttVendor:"Ready-made searches for vendor windows and stash tabs, such as linked sockets for the chromatic recipe.",
  ttDump:"Prices a whole stash tab and writes a buyout note for each item, ready to copy onto it in game.",
  ttFlip:"Shows currencies where buyers and sellers are far apart on price, and can notify you when a gap opens up.",
  ttCollect:"Divination card sets you're collecting and the uniques you own, from your stash.",
  brBar:"A browser for Path of Exile sites. Pages run in their own sandbox with no access to the app, your files or your saved POESESSID; other sites open in your own browser.",
  flFile:"Open the NeverSink filter you use. Changes are saved as a separate ExileCompanion-… copy; your original file is never touched.",
  flPrev:"A typical set of endgame drops run through your edited filter, top to bottom like the game does. Click a label to edit the rule that styles it.",
  flTiers:"Every rule in the filter, grouped by section. Hidden rules are dimmed. Pick one to edit it.",
  flEdit:"Show or hide the rule and change its text size, colours, drop sound, light beam and minimap icon. Changes appear in the preview straight away.",
  flEcon:"Moves currency, divination cards and uniques between the filter's own tiers using today's poe.ninja prices. You see every move before it's applied.",
  flTweaks:"Highlight your goal build's items, hide weapon types you don't use, and hide the lowest tiers of currency, cards, uniques or maps.",
  clPool:"Every prefix and suffix that can roll on this base at this item level, with how often each comes up. Tick the ones you want.",
  craftProfit:"Crafts that tend to sell for more than they cost.",
  craftCalc:"Estimate the cost of a craft from the chance per try and the price per try.",
  sessTimer:"Times your play session. Maps from the game log land here automatically in the desktop app.",
  sessGameLog:"Reads Client.txt, the game's log file, for levels, zones, deaths and maps. It only ever reads it.",
  sessAdd:"Log a map by hand with its profit, so strategies can be compared.",
  sessProfit:"Chaos per hour for each farming strategy you logged.",
  sessRecap:"Save a summary of a session: length, levels, maps and profit.",
  sessLog:"Every map this session. Removed one by mistake? Use Undo in the message at the bottom.",
  acctChar:"Pulls your character from your GGG account so the Current build stays up to date without PoB.",
  acctNet:"Prices the stash tabs you choose with poe.ninja and tracks the total over time.",
  acctFinds:"Rares in your stash that beat your gear for the goal build, or look worth selling.",
  acctCx:"What each currency has been worth over the last day on GGG's currency exchange.",
  acctSales:"Items you sold, read from trade whispers in your game log.",
  deskLog:"Connects the app to Client.txt so it follows your game live.",
  deskOverlay:"A click-through panel over the game. It shows act steps in the campaign and map info in maps.",
  deskPrice:"Press Ctrl+C on an item in game, then the price hotkey (Ctrl+D): a price window opens with poe.ninja values and live listings. The clipboard is read once per hotkey press.",
  deskTrades:"Incoming trade whispers with the item, price and stash position. Buttons copy the reply for you to paste.",
  deskAlerts:"Get a notification when an item drops to your target price.",
  deskCheats:"Your own reference images (Betrayal board, Lab layout) shown over the game with a hotkey.",
  deskNews:"New posts from pathofexile.com/news, such as patch notes.",
  setGeneral:"Rerun the setup wizard, swap builds and change price-check options.",
  setHotkeys:"Click a box and press the new key combination. Backspace resets it, Esc cancels.",
  acctConn:"Your account name and the optional POESESSID, which is stored encrypted on this PC.",
  deskDiscord:"Show your character on Discord and choose which desktop notifications you get.",
  deskUpdates:"The app updates itself from GitHub. Every download is checked against its published checksum.",
  deskBackup:"Save all your app data to a file, or load one. Secrets like POESESSID are never included.",
  sessSync:"Move your data to the web version on your phone with a code.",
  deskStream:"A local page you can add to OBS as a Browser Source to show your run on stream.",
};
const HELP_OPEN=new Set();let helpQ=0;
function helpAnchor(el,h){let a=h;while(a.parentElement&&a.parentElement!==el)a=a.parentElement;return a}
function ensureHelp(){
  if(S.helpOff){document.querySelectorAll(".helpbtn,.helptext").forEach(x=>x.remove());return}
  for(const id in HELP){const el=document.getElementById(id);if(!el||!el.firstElementChild)continue;const h=el.querySelector("h2");if(!h||h.querySelector(".helpbtn"))continue;
    const b=document.createElement("button");b.type="button";b.className="helpbtn";b.textContent="?";b.dataset.help=id;b.setAttribute("aria-label","What is this?");b.setAttribute("aria-expanded",String(HELP_OPEN.has(id)));h.appendChild(b);
    if(HELP_OPEN.has(id)&&!el.querySelector(":scope > .helptext")){const p=document.createElement("p");p.className="helptext";p.textContent=HELP[id];helpAnchor(el,h).after(p)}}
}
document.addEventListener("click",e=>{const b=e.target.closest(".helpbtn");if(!b)return;e.preventDefault();e.stopPropagation();const id=b.dataset.help,el=$(id);
  if(HELP_OPEN.has(id)){HELP_OPEN.delete(id);const p=el.querySelector(":scope > .helptext");if(p)p.remove();b.setAttribute("aria-expanded","false")}
  else{HELP_OPEN.add(id);const p=document.createElement("p");p.className="helptext";p.textContent=HELP[id];helpAnchor(el,b.closest("h2")).after(p);b.setAttribute("aria-expanded","true")}},true);
new MutationObserver(()=>{if(!helpQ)helpQ=requestAnimationFrame(()=>{helpQ=0;ensureHelp()})}).observe(document.querySelector("main"),{childList:true,subtree:true});
const h2Text=h=>[...h.childNodes].filter(n=>!(n.classList&&n.classList.contains("helpbtn"))).map(n=>n.textContent).join("").trim();

/* shared build import (dialog + wizard) */
async function importBuild(input,slot){
  input=String(input||"").trim();if(!input) throw new Error("Paste a Path of Building code or link first.");
  let link=null;
  if(window.exileDesktop&&/^https?:\/\//i.test(input)){link=input.slice(0,200);input=await fetchPobLink(input)}
  const xml=await decodePob(input);
  if(slot==="goal"&&exC&&C){C=null}
  await loadSlot(slot,xml,false);
  if(slot==="goal"){S.goalLink=link;save()}   /* the guide's link, for Twitch !build */
  S.view=slot;save();renderBuild();bindItems();
}

/* settings page */
const HOTKEYS=[["overlayHotkey","Show / hide overlay","Ctrl+Shift+O"],["interactHotkey","Overlay click mode","Ctrl+Shift+I"],["widgetHotkey","Overlay tools (searches, stopwatch, notes)","Ctrl+Shift+Space"],["stashHotkey","Show the latest trade's item in your stash","Ctrl+Shift+G"],["pageHotkey","Next overlay page","Ctrl+Shift+P"],["copyHotkey","Copy overlay search","Ctrl+Shift+F"],["priceHotkey","Price check (after Ctrl+C)","Ctrl+D"],["wikiHotkey","Wiki lookup","Ctrl+Alt+W"],["cheatHotkey","Cheat sheets","Ctrl+Shift+H"],["pinHotkey","Browser over the game","Ctrl+Shift+B"],["mediaHotkey","Media player","Ctrl+Shift+M"],["mediaPlayHotkey","Play / pause music","",],["mediaClickHotkey","Media player click-through",""]];
const RESERVED_KEYS=["Ctrl+C","Ctrl+V","Ctrl+X","Ctrl+A","Ctrl+Z","Ctrl+F","Alt+F4","Ctrl+Enter"];
function accelFrom(e){
  if(["Control","Shift","Alt","Meta"].includes(e.key)) return null;
  let k=null;const c=e.code||"";
  if(/^Key[A-Z]$/.test(c))k=c.slice(3);else if(/^Digit\d$/.test(c))k=c.slice(5);else if(/^F\d{1,2}$/.test(c))k=c;else if(/^Numpad\d$/.test(c))k="num"+c.slice(6);
  else k={Space:"Space",Backquote:"`",Minus:"-",Equal:"=",BracketLeft:"[",BracketRight:"]",Semicolon:";",Quote:"'",Comma:",",Period:".",Slash:"/",Home:"Home",End:"End",PageUp:"PageUp",PageDown:"PageDown",Insert:"Insert"}[c]||null;
  if(!k) return {err:"That key can't be used. Try a letter, number or F-key."};
  const mods=[e.ctrlKey&&"Ctrl",e.altKey&&"Alt",e.shiftKey&&"Shift"].filter(Boolean);
  if(!mods.length&&!/^F\d/.test(k)) return {err:"Add Ctrl, Alt or Shift so the key still works normally in game."};
  const a=mods.concat([k]).join("+");
  if(RESERVED_KEYS.includes(a)) return {err:`${a} is used by the game (Ctrl+C copies the item for a price check), so it can't be a hotkey.`};
  return {a};
}
function renderSettings(){
  const g=$("setGeneral");if(!g) return;
  const c=LIVE.cfg||{};
  const bname=(b,ex)=>b?`${esc(b.ascend||b.className)} · level ${b.level}${ex?' <span class="pill">example</span>':""}`:'<span class="muted">none</span>';
  g.innerHTML=`<h2>General</h2>
    <div class="row"><button class="btn primary" data-fix="wizard">Run setup wizard</button><button class="btn ghost" id="stSearch">Search everything <kbd>Ctrl K</kbd></button><button class="btn ghost" data-fix="report">Report a problem</button></div>
    ${DESK&&DESK.openLogFolder?`<div class="row"><button class="btn ghost small" id="stLog" type="button">Open log folder</button>${SAFE_STATE.safe?'<button class="btn small" id="stNormal" type="button">Restart normally</button>':'<button class="btn ghost small" id="stSafe" type="button">Restart in safe mode</button>'}<span class="small muted">The log keeps errors, crashes and startup times on this PC only. Safe mode starts without the overlay, hotkeys, media and graphics acceleration.</span></div>`:""}
    <h3>Builds</h3>
    <ul class="clean small" style="display:grid;gap:6px">
      <li class="row" style="justify-content:space-between"><span><b>Goal:</b> ${bname(G,exG)}</span><button class="btn ghost small" id="stImpG">${exG?"Import":"Replace"}</button></li>
      <li class="row" style="justify-content:space-between"><span><b>Current:</b> ${bname(C,exC)}</span><span class="row"><button class="btn ghost small" id="stImpC">${C&&!exC?"Replace":"Import"}</button>${C&&!exC?'<button class="btn ghost small" id="stDelC">Remove</button>':""}</span></li>
    </ul>
    ${DESK?`<h3>Price check</h3>
    <p class="small muted" style="margin:0">Price checks run when you press the price hotkey after Ctrl+C. The app doesn't watch the clipboard in the background: GGG allows one clipboard read per key press.</p>
    <div class="fgrid"><label class="f" for="stLeague">Trade league<input type="text" id="stLeague" value="${esc(c.league||"")}" data-cfg="league" placeholder="detected automatically"></label>
      <label class="row small" style="align-self:end"><input type="checkbox" id="stPin"${c.leaguePinned?" checked":""}> Keep this league (don't switch when a new league launches)</label>
      <label class="f" for="stContact">Contact for API requests (optional)<input type="text" id="stContact" value="${esc(c.contact||"")}" data-cfg="contact" placeholder="email or forum name"></label></div>`:""}
    ${DESK?`<h3>Web links</h3>
    <label class="row small"><input type="checkbox" id="stInApp"${c.inAppBrowser!==false?" checked":""}> Open trade, wiki and poe.ninja links in the app's browser (other sites always open in your own browser)</label>
    <div class="row"><button class="btn ghost small" id="stBrClear">Clear browser data</button><span class="small muted">Signs you out of pathofexile.com in the app and clears its cookies and cache.</span></div>`:""}
    <h3>Look and feel</h3>
    <div class="theme-pick" role="group" aria-label="Theme">${THEMES.map(([k,l,d])=>`<button class="theme-opt" data-theme-pick="${k}" aria-pressed="${UI.theme===k}"><span class="theme-sw t-${k}"><b></b><b></b></span><span><b>${l}</b><br><span class="small muted">${d}</span></span></button>`).join("")}</div>
    <div class="row small" role="group" aria-label="Accessibility"><label for="stScale">Text size</label><select id="stScale">${[90,100,110,125,150].map(v=>`<option value="${v}"${(+UI.scale||100)===v?" selected":""}>${v}%</option>`).join("")}</select><span class="muted">Ctrl + plus / minus / 0</span>${DESK?`<label for="stOvScale" style="margin-left:12px">Overlay text size</label><select id="stOvScale">${[90,100,110,125,150].map(v=>`<option value="${v}"${(+UI.overlayScale||100)===v?" selected":""}>${v}%</option>`).join("")}</select>`:""}</div>
    <label class="row small"><input type="checkbox" id="stContrast"${UI.contrast?" checked":""}> Higher contrast (brighter secondary text and borders, stronger focus outline)</label>
    <label class="row small"><input type="checkbox" id="stCb"${UI.cb?" checked":""}> Colorblind-friendly colors (blue for good, orange for bad, here and in the overlay and price check)</label>
    <label class="row small"><input type="checkbox" id="stStarter"${UI.mode==="starter"?" checked":""}> Starter mode: show only the main pages (others unlock when you open them)</label>
    <div class="row"><button class="btn ghost small" id="stTour" type="button">Take the tour</button><button class="btn ghost small" id="stHints" type="button">Show in-game hints again</button></div>
    <label class="row small"><input type="checkbox" id="stMotion"${UI.motion!==false?" checked":""}> Animations (menus, loading and buttons)${REDUCED_MOTION?' <span class="muted">· Windows "reduce motion" is on, so they stay off</span>':""}</label>
    <label class="row small"><input type="checkbox" id="stSound"${UI.sound!==false?" checked":""}> Sounds: a soft click on buttons and a cue when a required field is empty</label>
    <div class="vol small"><label for="stVol">Volume</label><input type="range" id="stVol" min="0" max="100" step="5" value="${Math.round((UI.vol??0.4)*100)}"${UI.sound===false?" disabled":""}><button class="btn ghost small" id="stVolTest" type="button">Test</button></div>
    <h3>Display</h3>
    <label class="row small"><input type="checkbox" id="stCompact"${S.compact?" checked":""}> Compact mode: smaller text and tighter spacing for small screens or a side monitor</label>
    <label class="row small"><input type="checkbox" id="stHelp"${S.helpOff?"":" checked"}> Show the ? explainer button on cards</label>`;
  $("stSearch").onclick=()=>openSearch();
  const lg=$("stLog");if(lg)lg.onclick=()=>DESK.openLogFolder();
  const sf=$("stSafe");if(sf)sf.onclick=()=>{if(confirm("Restart in safe mode? The overlay, price window, hotkeys, media and Discord stay off until you restart normally."))DESK.restartApp("safe")};
  const nm=$("stNormal");if(nm)nm.onclick=()=>DESK.restartApp("normal");
  $("stImpG").onclick=()=>openImport("goal");$("stImpC").onclick=()=>openImport("current");
  const dc=$("stDelC");if(dc)dc.onclick=()=>{const xml=store.get("xml.current",null);clearSlot("current");renderSettings();if(xml)toast("Removed your current character.",async()=>{await loadSlot("current",xml,false);renderSettings()})};
  $("stHelp").onchange=e=>{S.helpOff=!e.target.checked;save();ensureHelp()};
  document.querySelectorAll("[data-theme-pick]").forEach(b=>b.onclick=()=>{setTheme(b.dataset.themePick);renderSettings()});
  $("stMotion").onchange=e=>{UI.motion=e.target.checked;save();applyMotion()};
  $("stStarter").onchange=e=>setMode(e.target.checked?"starter":"full");
  $("stScale").onchange=e=>setScale(+e.target.value);
  const ovs=$("stOvScale");if(ovs)ovs.onchange=e=>setOverlayScale(+e.target.value);
  $("stContrast").onchange=e=>{UI.contrast=e.target.checked;save();applyA11y()};
  $("stCb").onchange=e=>{UI.cb=e.target.checked;save();applyA11y()};
  $("stTour").onclick=()=>startTour();
  $("stHints").onclick=()=>{S.hints={};save();toast("In-game hints will show again as you play.")};
  $("stSound").onchange=e=>{UI.sound=e.target.checked;save();renderSettings();if(UI.sound)SND.click()};
  $("stVol").oninput=e=>{UI.vol=+e.target.value/100;save()};$("stVol").onchange=()=>SND.click();
  $("stVolTest").onclick=()=>{SND.click();setTimeout(()=>SND.warn(),250)};
  $("stCompact").onchange=e=>setCompact(e.target.checked);
  if(DESK){const ia=$("stInApp");if(ia)ia.onchange=async e=>{LIVE.cfg=await DESK.setConfig({inAppBrowser:e.target.checked});toast(e.target.checked?"Links open in the app's browser.":"Links open in your own browser.")};
    const bc=$("stBrClear");if(bc)bc.onclick=async()=>{const r=await DESK.browserClear();toast(r&&r.ok?"Browser data cleared. You're signed out of pathofexile.com in the app.":"Couldn't clear browser data.")}}
  if(DESK){

    const pin=$("stPin");if(pin)pin.onchange=async()=>{LIVE.cfg=await DESK.setConfig({leaguePinned:pin.checked});toast(pin.checked?"League kept: the app won't switch when a new league launches.":"The app will follow new leagues automatically.")};
    g.querySelectorAll("[data-cfg]").forEach(inp=>inp.onchange=async()=>{const patch={};patch[inp.dataset.cfg]=inp.value.trim()||null;LIVE.cfg=await DESK.setConfig(patch);if(inp.dataset.cfg==="league"&&LIVE.cfg.league){S.league=LIVE.cfg.league;save();renderShop()}publishOverlay();renderDesktop()});
  }
  const hkEl=$("setHotkeys");
  if(!DESK){hkEl.innerHTML="";return}
  if(document.activeElement&&document.activeElement.dataset&&document.activeElement.dataset.hk) return;
  const cur=k=>c[k]||(HOTKEYS.find(x=>x[0]===k)||[])[2]||"";
  const counts={};HOTKEYS.forEach(([k])=>{const v=cur(k).toLowerCase();if(v)counts[v]=(counts[v]||0)+1});
  hkEl.innerHTML=`<h2>Hotkeys</h2>
    <div>${HOTKEYS.map(([k,l,d])=>`<div class="hk"><label for="hk_${k}" class="small">${esc(l)}${cur(k)&&counts[cur(k).toLowerCase()]>1?' <span class="dup">· used twice</span>':""}</label><input id="hk_${k}" readonly data-hk="${k}" value="${esc(keyName(cur(k)))}"><button class="btn ghost small" data-hkdef="${k}"${cur(k)===d?" disabled":""}>Default</button></div>`).join("")}</div>
    <p class="small muted" style="margin:0" id="hkMsg">Click a box, then press the new combination. Backspace resets it to the default, Esc cancels.</p>
    ${LIVE.warn?`<p class="small" style="margin:0;color:var(--warn)">${esc(LIVE.warn)}</p>`:""}
    <div><button class="btn ghost small" id="hkReset">Reset all to defaults</button></div>`;
  const setKey=async(k,v)=>{LIVE.warn=null;LIVE.cfg=await DESK.setConfig({[k]:v});publishOverlay()};
  hkEl.querySelectorAll("[data-hk]").forEach(inp=>{
    inp.onfocus=()=>{inp.classList.add("rec");inp.value="Press keys…";if(DESK.suspendHotkeys)DESK.suspendHotkeys(true)};
    inp.onblur=()=>{inp.classList.remove("rec");if(DESK.suspendHotkeys)DESK.suspendHotkeys(false);setTimeout(()=>{renderSettings();renderDesktop()},0)};
    inp.onkeydown=async e=>{e.preventDefault();e.stopPropagation();const k=inp.dataset.hk;
      if(e.key==="Escape"||e.key==="Tab"){inp.blur();return}
      if(e.key==="Backspace"||e.key==="Delete"){await setKey(k,HOTKEYS.find(x=>x[0]===k)[2]);inp.blur();return}
      const r=accelFrom(e);if(!r)return;
      if(r.err){$("hkMsg").textContent=r.err;$("hkMsg").style.color="var(--warn)";return}
      await setKey(k,r.a);inp.blur();toast(`${HOTKEYS.find(x=>x[0]===k)[1]}: ${r.a}`)};
  });
  hkEl.querySelectorAll("[data-hkdef]").forEach(b=>b.onclick=async()=>{const k=b.dataset.hkdef;await setKey(k,HOTKEYS.find(x=>x[0]===k)[2]);renderSettings();renderDesktop()});
  $("hkReset").onclick=async()=>{const prev={};const patch={};HOTKEYS.forEach(([k,,d])=>{prev[k]=c[k]||d;patch[k]=d});LIVE.cfg=await DESK.setConfig(patch);renderSettings();renderDesktop();
    toast("All hotkeys reset to defaults.",async()=>{LIVE.cfg=await DESK.setConfig(prev);renderSettings();renderDesktop()})};
}

/* first-run setup wizard */
const WIZ={i:0,ovl:false,t:null};
function wizSteps(){return [["goal","Goal build"],["current","Your character"]].concat(DESK?[["log","Game log"],["overlay","Overlay & price check"]]:[]).concat([["finish","Done"]])}
function wizOk(id){return id==="goal"?!exG:id==="current"?!!(C&&!exC):id==="log"?!!(LIVE.status&&LIVE.status.ok):id==="overlay"?WIZ.ovl:false}
function openWizard(){WIZ.i=0;WIZ.ovl=false;wizRender();try{$("setup").showModal()}catch(e){$("setup").setAttribute("open","")}}
function wizImportHtml(slot){
  const b=slot==="goal"?(!exG&&G):(C&&!exC&&C);
  return `${b?`<p class="status ok" style="margin:0">✓ Loaded: ${esc(b.ascend||b.className)} level ${b.level}. Paste another code to replace it, or press Next.</p>`:""}
    <textarea id="wzCode" placeholder="Paste a Path of Building code, or a pobb.in / pastebin link"></textarea>
    <div class="row"><button class="btn primary" id="wzLoad">Load ${slot==="goal"?"goal build":"my character"}</button><span class="status" id="wzSt"></span></div>`;
}
function wizRender(){
  clearInterval(WIZ.t);
  const st=wizSteps();WIZ.i=Math.max(0,Math.min(WIZ.i,st.length-1));const id=st[WIZ.i][0];const c=LIVE.cfg||{};
  $("wizDots").innerHTML=st.map((x,i)=>`<li class="${i===WIZ.i?"on":wizOk(x[0])?"ok":""}">${wizOk(x[0])&&i!==WIZ.i?"✓ ":""}${i+1}. ${esc(x[1])}</li>`).join("");
  const body=$("wizBody");
  if(id==="goal") body.innerHTML=`<h3>Which build are you following?</h3>
    <p class="small" style="margin:0">Paste the Path of Building code (or pobb.in link) from your build guide. This is your <b>goal</b>: the shopping list, crafting plans and progress all compare against it.</p>${wizImportHtml("goal")}
    <p class="small muted" style="margin:0">In Path of Building: Import/Export Build → Generate → Copy. Most guides link a pobb.in page; its URL works too${DESK?"":" in the desktop app"}.</p>
    <details class="nobuild"${exG?" open":""}><summary><b>No build yet?</b></summary>
      <p class="small" style="margin:6px 0 0">Pick one from a guide site. Every guide links its Path of Building code (often a pobb.in link): copy it and paste it above.</p>
      <div class="row">${[["Maxroll build guides","https://maxroll.gg/poe/build-guides"],["Mobalytics builds","https://mobalytics.gg/poe/builds"],["poe.ninja: what players run","https://poe.ninja/poe1/builds"]].map(([l,u])=>`<button class="btn ghost small" data-wzlink="${u}">${l}</button>`).join("")}</div>
      <p class="small" style="margin:6px 0 0">Or start without one: the campaign route, overlay, price checks and maps all work without a build, and you can add one any time.</p>
      <div class="row"><button class="btn small" id="wzNoBuild">Just leveling for now</button></div></details>`;
  else if(id==="current") body.innerHTML=`<h3>Where is your character now?</h3>
    <p class="small" style="margin:0">Import your <b>current</b> character the same way to see exactly what's left to do. In Path of Building: Import/Export Build → Import from website → your account → your character, then Generate.</p>${wizImportHtml("current")}
    <p class="small muted" style="margin:0">${DESK?"No PoB handy? Skip this and use Live character sync on the Account page (Economy) later. It pulls your character from your GGG account.":"You can skip this and do it any time from Import PoB."}</p>`;
  else if(id==="log"){const s=LIVE.status;body.innerHTML=`<h3>Connect the game log</h3>
    <p class="small" style="margin:0">The app follows <b>Client.txt</b>, the game's log file, to track zones, levels, deaths, maps and trade whispers as you play. It only ever reads it.</p>
    <p class="status ${s&&s.ok?"ok":""}" style="margin:0;word-break:break-all">${s&&s.ok?"✓ Connected: "+esc(s.path):esc((s&&s.message)||"Not connected yet.")}</p>
    <div class="row"><button class="btn primary" id="wzFind">Find it for me</button><button class="btn ghost" id="wzChoose">Choose file…</button></div>
    <div id="wzFound"></div>
    <p class="small muted" style="margin:0">It's in the game's <b>logs</b> folder, e.g. C:\\Program Files (x86)\\Grinding Gear Games\\Path of Exile\\logs or Steam\\steamapps\\common\\Path of Exile\\logs.</p>`;
    $("wzFind").onclick=async()=>{const f=$("wzFound");f.innerHTML='<p class="small muted" style="margin:0">Looking…</p>';const list=await DESK.detectLogs();
      if(list.length===1){LIVE.cfg=await DESK.setConfig({logPath:list[0].path});setTimeout(wizRender,800);f.innerHTML=`<p class="status ok" style="margin:0">Found it. Connecting…</p>`;return}
      f.innerHTML=list.length?`<ul class="clean small">${list.map(d=>`<li class="row" style="justify-content:space-between"><span style="word-break:break-all">${esc(d.path)}</span><button class="btn ghost small" data-wzlog="${esc(d.path)}">Use</button></li>`).join("")}</ul>`:'<p class="small muted" style="margin:0">Not in the usual places. Use Choose file.</p>';
      f.querySelectorAll("[data-wzlog]").forEach(b=>b.onclick=async()=>{LIVE.cfg=await DESK.setConfig({logPath:b.dataset.wzlog});setTimeout(wizRender,800)})};
    $("wzChoose").onclick=async()=>{const p=await DESK.chooseLog();if(p)setTimeout(wizRender,800)};
    WIZ.t=setInterval(()=>{if(LIVE.status&&LIVE.status.ok&&!body.querySelector(".status.ok"))wizRender()},1000);}
  else if(id==="overlay"){const key=keyName(c.overlayHotkey||"Ctrl+Shift+O");let last=LIVE.overlayVisible;
    body.innerHTML=`<h3>Try the overlay</h3>
    <p class="small" style="margin:0">The overlay sits on top of the game with your act steps, map info and trade requests. Run the game in <b>Windowed Fullscreen</b> (Options → Graphics) so it can show.</p>
    <p style="margin:0">Press <kbd>${esc(key)}</kbd> now. It works from anywhere, including this window.</p>
    <p class="status ${WIZ.ovl?"ok":""}" id="wzOvl" style="margin:0">${WIZ.ovl?"✓ Hotkey works. ":""}The overlay is ${LIVE.overlayVisible?"showing":"hidden"}.</p>
    <div class="row"><button class="btn ghost" id="wzOvlBtn">Show / hide it for me</button><a class="small" href="#settings" data-fix="none">Use a different key</a></div>
    <h3>Price check</h3>
    <p class="small" style="margin:0">In game, hover an item and press <kbd>Ctrl+C</kbd>, then <kbd>${esc(keyName(c.priceHotkey||"Ctrl+D"))}</kbd>. A price window opens next to your cursor.</p>`;
    $("wzOvlBtn").onclick=()=>DESK.toggleOverlay(!LIVE.overlayVisible);
    body.querySelector('a[href="#settings"]').onclick=e=>{e.preventDefault();$("setup").close();showTab("settings");scrollToCard("setHotkeys")};
    WIZ.t=setInterval(()=>{if(LIVE.overlayVisible!==last){last=LIVE.overlayVisible;WIZ.ovl=true;const s=$("wzOvl");if(s){s.className="status ok";s.textContent=`✓ Hotkey works. The overlay is ${last?"showing":"hidden"}.`}}},300);}
  else body.innerHTML=`<h3>You're set</h3>
    <ul class="clean small" style="display:grid;gap:6px">${wizSteps().filter(x=>x[0]!=="finish").map(x=>`<li>${wizOk(x[0])?'<span class="pill good">done</span>':'<span class="pill">skipped</span>'} ${esc(x[1])}</li>`).join("")}</ul>
    <p class="small" style="margin:0">A few things worth knowing:</p>
    <ul class="small" style="margin:0;padding-left:18px;display:grid;gap:4px">
      <li><b>Home</b> shows what to do next, your session and live status.</li>
      <li>Press <kbd>Ctrl K</kbd> anywhere to jump to any page, card or action.</li>
      <li>Tap <b>?</b> next to a card's title for a short explanation.</li>
      <li><b>Settings</b> has hotkeys, your GGG account, Discord, updates and backups. You can rerun this wizard from there.</li>
    </ul>
    ${UI.mode==="starter"?'<p class="small" style="margin:0">You\'re in <b>starter mode</b>: only the main pages show. Click <b>＋ All pages</b> in the top bar whenever you want crafting, trading and the rest.</p>':""}
    <div class="row"><button class="btn primary" id="wzTour">Take a 1-minute tour</button></div>`;
  body.querySelectorAll("[data-wzlink]").forEach(b=>b.onclick=()=>{const u=b.dataset.wzlink;if(DESK&&DESK.openExternal)DESK.openExternal(u);else window.open(u,"_blank","noopener")});
  const nb=$("wzNoBuild");if(nb)nb.onclick=()=>{S.noBuild=true;save();WIZ.i++;wizRender()};
  const ld=$("wzLoad");if(ld)ld.onclick=async()=>{const s=$("wzSt");s.className="status";s.textContent="Loading…";
    try{await importBuild($("wzCode").value,id);s.className="status ok";s.textContent="Loaded.";setTimeout(()=>{WIZ.i++;wizRender()},700)}catch(err){s.className="status err";s.textContent=err.message||"Couldn't read that build."}};
  const tb=$("wzTour");if(tb)tb.onclick=()=>{$("setup").close();startTour()};
  $("wizBack").hidden=WIZ.i===0;$("wizSkip").hidden=id==="finish"||wizOk(id);
  $("wizNext").textContent=id==="finish"?"Finish":"Next";
}
$("wizBack").onclick=()=>{WIZ.i--;wizRender()};
$("wizSkip").onclick=()=>{WIZ.i++;wizRender()};
$("wizNext").onclick=()=>{if(wizSteps()[WIZ.i][0]==="finish"){$("setup").close();showTab("home");return}WIZ.i++;wizRender()};
$("setup").addEventListener("close",()=>{clearInterval(WIZ.t);try{store.set("setupDone",1)}catch(e){}renderAll()});

/* ---------------- update 3: icons, item tooltips, compact mode, phone header ---------------- */
const ICONS={
  home:'<path d="M3 11l9-7 9 7"/><path d="M5 10v10h14V10"/><path d="M10 20v-6h4v6"/>',
  sword:'<path d="M14.5 3H21v6.5L10 20.5 3.5 14z"/><path d="M5 16l3 3"/><path d="M3 21l2.5-2.5"/>',
  chart:'<path d="M4 20V10"/><path d="M10 20V4"/><path d="M16 20v-7"/><path d="M22 20H2"/>',
  bag:'<path d="M5 8h14l-1 13H6z"/><path d="M9 8V6a3 3 0 0 1 6 0v2"/>',
  tree:'<circle cx="12" cy="5" r="2"/><circle cx="5" cy="19" r="2"/><circle cx="19" cy="19" r="2"/><circle cx="12" cy="13" r="2"/><path d="M12 7v4M10.5 14.5l-4 3M13.5 14.5l4 3"/>',
  flag:'<path d="M5 21V4"/><path d="M5 4h11l-2 4 2 4H5"/>',
  map:'<path d="M9 4L3 6v14l6-2 6 2 6-2V4l-6 2z"/><path d="M9 4v14M15 6v14"/>',
  compass:'<circle cx="12" cy="12" r="9"/><path d="M15.5 8.5l-2 5-5 2 2-5z"/>',
  hourglass:'<path d="M6 3h12M6 21h12"/><path d="M7 3c0 5 10 5 10 9s-10 4-10 9"/><path d="M17 3c0 5-10 5-10 9s10 4 10 9"/>',
  hammer:'<path d="M14 6l4 4"/><path d="M11 3l7 7-3 3-7-7z"/><path d="M10 10l-7 7 3 3 7-7"/>',
  coins:'<ellipse cx="9" cy="7" rx="6" ry="3"/><path d="M3 7v4c0 1.7 2.7 3 6 3s6-1.3 6-3V7"/><path d="M9 14v3c0 1.7 2.7 3 6 3s6-1.3 6-3v-4c0-1.7-2.7-3-6-3"/>',
  gear:'<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M2 12h3M19 12h3M4.9 19.1L7 17M17 7l2.1-2.1"/>',
  monitor:'<rect x="3" y="4" width="18" height="12" rx="1"/><path d="M8 20h8M12 16v4"/>',
  shield:'<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/>',
  gem:'<path d="M6 3h12l4 6-10 12L2 9z"/><path d="M2 9h20M12 21L8 9l4-6 4 6z"/>',
  list:'<path d="M9 6h12M9 12h12M9 18h12"/><circle cx="4" cy="6" r="1"/><circle cx="4" cy="12" r="1"/><circle cx="4" cy="18" r="1"/>',
  skull:'<path d="M12 3a8 8 0 0 0-5 14v3h10v-3a8 8 0 0 0-5-14z"/><circle cx="9" cy="11" r="1.5"/><circle cx="15" cy="11" r="1.5"/><path d="M10 20v-2M14 20v-2"/>',
  card:'<rect x="5" y="3" width="14" height="18" rx="1"/><path d="M9 8h6M9 12h6"/>',
  bolt:'<path d="M13 2L4 14h7l-1 8 9-12h-7z"/>',
  clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  user:'<circle cx="12" cy="8" r="4"/><path d="M4 21c1-4 4-6 8-6s7 2 8 6"/>',
  bell:'<path d="M6 16V11a6 6 0 0 1 12 0v5l2 2H4z"/><path d="M10 21h4"/>',
  chat:'<path d="M4 5h16v11H9l-5 4z"/>',
  save:'<path d="M5 3h11l3 3v15H5z"/><path d="M8 3v5h7V3M8 21v-7h8v7"/>',
  refresh:'<path d="M20 11a8 8 0 0 0-14.5-4.5L3 9"/><path d="M3 4v5h5"/><path d="M4 13a8 8 0 0 0 14.5 4.5L21 15"/><path d="M21 20v-5h-5"/>',
  phone:'<rect x="7" y="2" width="10" height="20" rx="2"/><path d="M11 18h2"/>',
  video:'<rect x="3" y="6" width="13" height="12" rx="1"/><path d="M16 10l5-3v10l-5-3"/>',
  key:'<circle cx="8" cy="15" r="4"/><path d="M11 12l9-9M17 6l3 3M14 9l2 2"/>',
  image:'<rect x="3" y="4" width="18" height="16" rx="1"/><circle cx="9" cy="10" r="2"/><path d="M21 17l-5-5-9 8"/>',
  news:'<rect x="3" y="4" width="18" height="16" rx="1"/><path d="M7 8h10M7 12h10M7 16h6"/>',
  scale:'<path d="M12 3v18M5 21h14M4 7h16"/><path d="M4 7l-2 6a3 3 0 0 0 4 0zM20 7l-2 6a3 3 0 0 0 4 0z"/>',
  trade:'<path d="M4 8h14l-3-3M20 16H6l3 3"/>',
  search:'<circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/>',
  chest:'<rect x="3" y="8" width="18" height="12" rx="1"/><path d="M3 8l2-4h14l2 4M3 13h18M11 12h2v3h-2z"/>',
  filter:'<path d="M3 4h18l-7 9v6l-4 2v-8z"/>',
  calc:'<rect x="5" y="3" width="14" height="18" rx="1"/><path d="M8 7h8M8 12h2M14 12h2M8 16h2M14 16h2"/>',
  route:'<circle cx="6" cy="19" r="2"/><circle cx="18" cy="5" r="2"/><path d="M8 19h8a3 3 0 0 0 0-6H8a3 3 0 0 1 0-6h8"/>',
  wand:'<path d="M4 20L16 8"/><path d="M15 3v3M18 6h3M19 2l-1 2M13 5l2 1"/>',
};
const svgIcon=(n,cls)=>ICONS[n]?`<svg class="${cls||"ico-s"}" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${ICONS[n]}</svg>`:"";
const TAB_ICONS={media:"video",buildtools:"gem",league:"chest",trading:"trade",browser:"search",filter:"filter",craftlab:"wand",home:"home",build:"sword",progress:"chart",shop:"bag",trees:"tree",campaign:"flag",maps:"map",atlas:"compass",session:"hourglass",craft:"hammer",account:"coins",settings:"gear",desktop:"monitor"};
const GROUP_ICONS={home:"home",char:"user",play:"map",trade:"coins",app:"gear"};
function decorateNav(){
  document.querySelectorAll("#tabs [data-tab]").forEach(b=>{if(!b.querySelector("svg"))b.insertAdjacentHTML("afterbegin",svgIcon(TAB_ICONS[b.dataset.tab]))});
  document.querySelectorAll("#groups [data-group]").forEach(b=>{if(!b.querySelector("svg"))b.insertAdjacentHTML("afterbegin",svgIcon(GROUP_ICONS[b.dataset.group]))});
  const sb=$("openSearch");if(sb&&!sb.querySelector("svg")){const g=sb.querySelector('span[aria-hidden]');if(g)g.remove();sb.insertAdjacentHTML("afterbegin",svgIcon("search"))}
}
decorateNav();
const CARD_ICONS={acctRecipe:"coins",ttSaved:"save",mediaNow:"bell",mediaPlayer:"video",btUpg:"trade",sessGoal:"flag",homeClip:"refresh",btTimeless:"gem",btCluster:"gem",btMeta:"chart",btGems:"coins",lgThreads:"coins",lgReturn:"chart",lgBetrayal:"skull",lgExped:"compass",lgHeist:"key",lgLab:"route",lgDrops:"map",homeChar:"user",homeNext:"route",homeSession:"hourglass",homeLive:"bolt",homeQuick:"wand",
  buildSummary:"user",buildDefence:"shield",buildSkills:"gem",buildGear:"sword",buildNotes:"news",
  progSummary:"chart",progNext:"list",progCost:"coins",progStats:"chart",progTree:"tree",progGems:"gem",progItems:"sword",
  shopSummary:"bag",shopGems:"gem",shopItems:"sword",shopFilter:"filter",
  campAct:"flag",campGems:"gem",campSplits:"clock",campBuild:"tree",campRules:"scale",campReadouts:"chat",campOverview:"route",
  mapsNext:"route",mapsDanger:"skull",mapsProgress:"list",mapsCompletion:"map",mapsBosses:"skull",mapsCards:"card",
  treesCard:"tree",atlasProfile:"compass",atlasPhases:"route",atlasTree:"tree",
  clItem:"sword",clOdds:"calc",clPool:"list",clEmu:"hammer",clSim:"refresh",
  ttSearch:"map",ttVendor:"search",ttDump:"coins",ttFlip:"chart",ttCollect:"card",
  flFile:"filter",flPrev:"image",flTiers:"list",flEdit:"wand",flEcon:"coins",flTweaks:"user",
  craftGearList:"sword",craftPlan:"hammer",craftProfit:"coins",craftCalc:"calc",craftRef:"news",
  sessTimer:"hourglass",sessGameLog:"news",sessAdd:"list",sessProfit:"coins",sessRecap:"clock",sessLog:"list",
  acctChar:"user",acctNet:"chest",acctFinds:"search",acctCx:"chart",acctSales:"trade",
  deskLog:"news",deskOverlay:"monitor",deskPrice:"coins",deskTrades:"trade",deskAlerts:"bell",deskCheats:"image",deskNews:"news",deskRules:"scale",
  setGeneral:"gear",setHotkeys:"key",acctConn:"user",deskDiscord:"chat",deskUpdates:"refresh",deskBackup:"save",sessSync:"phone",deskStream:"video"};
function ensureCardIcons(){
  for(const id in CARD_ICONS){const el=document.getElementById(id);if(!el||!el.firstElementChild)continue;const h=el.querySelector("h2");if(!h||h.querySelector(".ico-h"))continue;h.insertAdjacentHTML("afterbegin",svgIcon(CARD_ICONS[id],"ico-h"))}
}
new MutationObserver(()=>{if(!ensureCardIcons.q)ensureCardIcons.q=requestAnimationFrame(()=>{ensureCardIcons.q=0;ensureCardIcons()})}).observe(document.querySelector("main"),{childList:true,subtree:true});

/* game-style item tooltip */
const tipEl=document.createElement("div");tipEl.id="itemTip";tipEl.setAttribute("role","tooltip");tipEl.hidden=true;document.body.appendChild(tipEl);
function itemTipHtml(it){
  const r=(it.rarity||"NORMAL").toUpperCase();
  const mod=m=>`<div class="tm ${m.crafted?"crafted":m.fractured?"fractured":""}">${esc(m.text)}</div>`;
  const flags=(it.flags||[]).filter(f=>!/^(Corrupted|Mirrored|Twice Corrupted)$/i.test(f));
  const bad=(it.flags||[]).filter(f=>/^(Corrupted|Mirrored|Twice Corrupted)$/i.test(f));
  const sections=[];
  const props=[];if(it.ilvl)props.push(`<div class="tp">Item Level: <b>${it.ilvl}</b></div>`);if(flags.length)props.push(`<div class="tp">${flags.map(esc).join(" · ")}</div>`);
  if(props.length)sections.push(props.join(""));
  if(it.implicits&&it.implicits.length)sections.push(it.implicits.map(mod).join(""));
  if(it.mods&&it.mods.length)sections.push(it.mods.map(mod).join(""));
  if(bad.length)sections.push(bad.map(f=>`<div class="tm corrupt">${esc(f)}</div>`).join(""));
  const two=(r==="RARE"||r==="UNIQUE")&&it.base&&it.base!==it.name;
  return `<div class="th ${r}"><div>${esc(it.name||it.base||"Item")}</div>${two?`<div>${esc(it.base)}</div>`:""}</div><div class="tb ${r}">${sections.length?sections.join('<div class="tsep"></div>'):'<div class="tp">No mods</div>'}</div>`;
}
function tipItemFor(el){const b=el.dataset.tipb==="c"?C:G;return b&&b.items?b.items[el.dataset.item]:null}
function placeTip(x,y){const z=ZF(),R=tipEl.getBoundingClientRect(),r={width:R.width/z,height:R.height/z},W=innerWidth/z,H=innerHeight/z,pad=14;x/=z;y/=z;let L=x+pad,T=y+pad;if(L+r.width>W-8)L=Math.max(8,x-r.width-pad);if(T+r.height>H-8)T=Math.max(8,H-r.height-8);tipEl.style.left=L+"px";tipEl.style.top=T+"px"}
let tipFor=null;
function showTip(el,x,y){const it=tipItemFor(el);if(!it){hideTip();return}if(tipFor!==el){tipEl.innerHTML=itemTipHtml(it);tipFor=el}tipEl.hidden=false;placeTip(x,y)}
function hideTip(){tipEl.hidden=true;tipFor=null}
setInterval(()=>{if(tipFor&&(!tipFor.isConnected||!tipFor.offsetParent))hideTip()},400);
if(matchMedia("(hover:hover)").matches){
  document.addEventListener("mousemove",e=>{const el=e.target.closest&&e.target.closest("[data-item][data-tipb]");if(el)showTip(el,e.clientX,e.clientY);else if(!tipEl.hidden)hideTip()},{passive:true});
  document.addEventListener("focusin",e=>{const el=e.target.closest&&e.target.closest("[data-item][data-tipb]");if(el){const r=el.getBoundingClientRect();showTip(el,r.right,r.top)}});
  document.addEventListener("focusout",hideTip);
  addEventListener("scroll",hideTip,{passive:true});
  document.addEventListener("keydown",e=>{if(e.key==="Escape")hideTip()});
}

/* compact mode */
/* ---------- look and feel: themes, motion, sounds, busy bar ---------- */
const THEMES=[["minimal","Dark minimal","Near-black, one gold accent, quiet"],["modern","Modern","Neutral charcoal with a blue accent"],["poe","Path of Exile","Gold-trimmed panels like the game"]];
const UI=S.ui||(S.ui={theme:"minimal",motion:true,sound:true,vol:0.4});
const REDUCED_MOTION=matchMedia("(prefers-reduced-motion: reduce)").matches;
function setTheme(t){if(!THEMES.some(x=>x[0]===t))return;UI.theme=t;save();document.documentElement.dataset.theme=t;toast(`Theme: ${THEMES.find(x=>x[0]===t)[1]}`)}
// accessibility: settings are applied by the early script in <head> (also in the price popup and overlay)
function applyA11y(){if(window.__applyA11y)window.__applyA11y()}
const SCALES=[75,90,100,110,125,150,175,200];
// text size is CSS zoom on <html>: measured positions come back zoomed, positions we set are unzoomed, so divide by ZF()
const ZF=()=>parseFloat(document.documentElement.style.zoom)||1;
function pushScale(){if(DESK&&DESK.uiScale)DESK.uiScale({main:+UI.scale||100,overlay:+UI.overlayScale||100})}
function setScale(v,quiet){v=Math.min(200,Math.max(75,Math.round(v)||100));UI.scale=v;save();applyA11y();pushScale();if(!quiet)toast(`Text size ${v}%`)}
function setOverlayScale(v){const old=+UI.overlayScale||100;v=Math.min(200,Math.max(75,Math.round(v)||100));UI.overlayScale=v;save();pushScale();
  if(DESK&&DESK.overlayResize&&old!==v)DESK.overlayResize(v/old);toast(`Overlay text size ${v}%`)}
document.addEventListener("keydown",e=>{
  if(!(e.ctrlKey||e.metaKey)||e.altKey)return;
  const cur=+UI.scale||100;
  if(e.key==="="||e.key==="+"){e.preventDefault();setScale(SCALES.find(v=>v>cur)||200)}
  else if(e.key==="-"||e.key==="_"){e.preventDefault();setScale([...SCALES].reverse().find(v=>v<cur)||75)}
  else if(e.key==="0"){e.preventDefault();setScale(100)}
});
// section buttons at the top of long pages jump to that section
document.addEventListener("click",e=>{const b=e.target.closest&&e.target.closest(".secnav [data-sec]");if(!b)return;const t=document.getElementById(b.dataset.sec);if(!t)return;
  t.scrollIntoView({block:"start",behavior:document.documentElement.classList.contains("no-motion")?"auto":"smooth"});t.setAttribute("tabindex","-1");t.focus({preventScroll:true})});
// arrow keys move between section and page buttons (standard tab-list keys)
for(const id of ["groups","tabs"])document.getElementById(id).addEventListener("keydown",e=>{
  if(!["ArrowLeft","ArrowRight","Home","End"].includes(e.key))return;
  const bs=[...e.currentTarget.querySelectorAll("button")].filter(b=>!b.hidden&&b.offsetParent!==null&&getComputedStyle(b).display!=="none");
  let i=bs.indexOf(document.activeElement);if(i<0)return;e.preventDefault();
  i=e.key==="Home"?0:e.key==="End"?bs.length-1:(i+(e.key==="ArrowRight"?1:-1)+bs.length)%bs.length;bs[i].focus();
});
// fields described only by a placeholder get it as their accessible name
function labelFields(root){(root||document).querySelectorAll("input:not([type=hidden]):not([type=checkbox]):not([type=radio]),textarea,select").forEach(el=>{
  if(el.getAttribute("aria-label")||el.getAttribute("aria-labelledby")||(el.labels&&el.labels.length)||el.title)return;
  const ph=(el.getAttribute("placeholder")||"").replace(/,?\s*e\.g\..*$/i,"").replace(/…$/,"").trim();
  const near=el.closest("label,.row,div")&&el.previousElementSibling&&/^(LABEL|SPAN|B)$/.test(el.previousElementSibling.tagName)?el.previousElementSibling.textContent.trim():"";
  const name=ph||near;if(name)el.setAttribute("aria-label",name.slice(0,80))})}
{let lt=0;new MutationObserver(()=>{clearTimeout(lt);lt=setTimeout(()=>labelFields(),120)}).observe(document.body,{childList:true,subtree:true});setTimeout(()=>labelFields(),0)}
// pages are tab panels of the page buttons
document.querySelectorAll("section.tab").forEach(sec=>{const name=sec.id.replace(/^tab-/,""),b=document.querySelector(`#tabs [data-tab="${name}"]`);sec.setAttribute("role","tabpanel");
  if(b){b.id=b.id||"tb-"+name;b.setAttribute("aria-controls",sec.id);sec.setAttribute("aria-labelledby",b.id)}});
function applyMotion(){document.documentElement.classList.toggle("no-motion",UI.motion===false||REDUCED_MOTION)}
document.documentElement.dataset.theme=UI.theme||"minimal";applyMotion();
// tiny synthesized sounds (no audio files): a soft tick for buttons, a low two-note cue for a missing field
const SND=(()=>{let ctx=null,lastWarn=0;
  const ac=()=>{if(!ctx){const C=window.AudioContext||window.webkitAudioContext;if(!C)return null;ctx=new C()}if(ctx.state==="suspended")ctx.resume().catch(()=>{});return ctx};
  const tone=(f1,f2,dur,type,peak,at)=>{const c=ac();if(!c)return;const t=c.currentTime+(at||0),o=c.createOscillator(),g=c.createGain();o.type=type;o.frequency.setValueAtTime(f1,t);if(f2)o.frequency.exponentialRampToValueAtTime(f2,t+dur);
    g.gain.setValueAtTime(0.0001,t);g.gain.exponentialRampToValueAtTime(Math.max(0.0002,peak),t+0.006);g.gain.exponentialRampToValueAtTime(0.0001,t+dur);o.connect(g).connect(c.destination);o.start(t);o.stop(t+dur+0.02)};
  const vol=()=>UI.sound===false?0:Math.max(0,Math.min(1,UI.vol??0.4));
  return {click(){const v=vol();if(v)tone(1900,1200,0.035,"sine",0.06*v)},
    warn(){const v=vol();if(!v||Date.now()-lastWarn<400)return;lastWarn=Date.now();tone(330,300,0.09,"triangle",0.16*v);tone(247,220,0.14,"triangle",0.16*v,0.1)}};
})();
document.addEventListener("click",e=>{const b=e.target.closest&&e.target.closest("button,.btn,[role=tab],summary,.theme-opt");if(b&&!b.disabled&&!b.classList.contains("dis"))SND.click()},true);
// a required field left empty: play the cue, shake the field once
document.addEventListener("invalid",e=>{const el=e.target;SND.warn();el.classList.remove("ec-invalid");void el.offsetWidth;el.classList.add("ec-invalid");setTimeout(()=>el.classList.remove("ec-invalid"),1500)},true);
// busy bar while the app fetches data or loads a page module
let BUSY=0;const busy=d=>{BUSY=Math.max(0,BUSY+d);document.body.classList.toggle("busy",BUSY>0)};
addEventListener("ec-busy",e=>busy(+e.detail||0));
{const ls=loadScriptOnce;loadScriptOnce=(src,g)=>window[g]?ls(src,g):(busy(1),ls(src,g).finally(()=>busy(-1)))}
// safe mode banner (main process decides; see Settings → Restart in safe mode)
let SAFE_STATE={};
function renderSafe(){const el=$("homeSafe");if(!el)return;el.hidden=!SAFE_STATE.safe;if(!SAFE_STATE.safe)return;
  el.innerHTML=`<div class="banner warn" role="status"><div><b>Safe mode.</b> ${SAFE_STATE.safe==="crashed"?"The app didn't finish starting the last two times, so it started with":"Started at your request with"} the overlay, price window, hotkeys, media, Discord and graphics acceleration off. If this works, the problem is likely one of those (often the graphics driver). Report a problem includes the log.</div>
    <div class="row"><button class="btn primary small" id="safeNormal">Restart normally</button><button class="btn ghost small" data-fix="report">Report a problem</button><button class="btn ghost small" id="safeLog">Open log folder</button></div></div>`;
  $("safeNormal").onclick=()=>DESK.restartApp("normal");$("safeLog").onclick=()=>DESK.openLogFolder();
  el.querySelectorAll("[data-fix]").forEach(b=>b.onclick=()=>FIX[b.dataset.fix]&&FIX[b.dataset.fix]())}
function applyCompact(){document.body.classList.toggle("compact",!!S.compact)}
/* ---------- first-time experience: starter mode, guided tour, in-game hints ----------
   Starter mode shows only the main pages so a new player isn't faced with twenty at once. Any page opened
   from Ctrl+K or a link unlocks itself; "Show all pages" (nav or Settings) turns starter mode off. */
const STARTER=["home","build","progress","campaign","maps","session","settings","desktop"];
if(!UI.mode){UI.mode=store.get("setupDone",0)?"full":"starter";save()}
const starterHidden=t=>UI.mode==="starter"&&!STARTER.includes(t)&&!(S.unlocked||{})[t];
function applyStarter(){
  document.querySelectorAll("#tabs button[data-tab]").forEach(b=>b.classList.toggle("starter-hide",starterHidden(b.dataset.tab)));
  document.querySelectorAll("#groups [data-group]").forEach(g=>{
    const any=[...document.querySelectorAll(`#tabs button[data-g="${g.dataset.group}"]`)].some(b=>!b.hidden&&!b.classList.contains("starter-hide"));
    g.classList.toggle("starter-hide",!any);
  });
  let more=$("moreBtn");
  if(UI.mode==="starter"){
    if(!more){more=document.createElement("button");more.id="moreBtn";more.className="more-btn";more.title="Starter mode shows the main pages. Click to show all of them.";
      more.textContent="＋ All pages";more.onclick=()=>setMode("full");const k=$("openSearch");k.parentNode.insertBefore(more,k)}
  }else if(more)more.remove();
}
function setMode(m){UI.mode=m;save();applyStarter();syncNav();if(CUR_TAB==="settings")renderSettings();
  toast(m==="full"?"All pages are showing. Switch back to starter mode in Settings → Look and feel.":"Starter mode: only the main pages show. Anything you open from Ctrl+K stays unlocked.")}
// opening a hidden page (Ctrl+K, a link, a button) unlocks it instead of refusing
function unlockTab(t){if(!starterHidden(t))return;S.unlocked={...(S.unlocked||{}),[t]:Date.now()};save();applyStarter();
  const b=tabBtn(t);toast(`Unlocked ${b?b.textContent.trim():t}. "＋ All pages" shows everything.`)}

// guided tour: a short spotlight walk through the main parts, replayable from Settings or Ctrl+K
const TOUR=[
  {sel:"#groups",title:"Sections",text:"Everything lives in five sections: Home, Character, Play, Economy and Settings. Each has its own pages underneath."},
  {sel:"#openSearch",title:"Search everything",text:"Press Ctrl+K (or /) to jump to any page, card, item or action by typing a few letters."},
  {sel:"#homeChar",tab:"home",title:"Your build at a glance",text:"How close your character is to the build you're following. Import builds in the setup wizard or with Import PoB."},
  {sel:"#homeNext",tab:"home",title:"What to do next",text:"The next campaign steps or atlas milestone, plus the biggest upgrades for your build."},
  {sel:"#homeSession",tab:"home",title:"Your session",text:"A play timer, maps you've run, chaos per hour and session goals. The game log fills most of this in for you."},
  {sel:"#homeLive",tab:"home",desk:true,title:"In game",text:"Ctrl+Shift+O shows the overlay over the game. For prices, hover an item, press Ctrl+C, then Ctrl+D. Ctrl+Shift+Space opens quick tools."},
  {sel:".card .helpbtn",tab:"home",title:"Explanations",text:"Tap ? next to any card title for a short explanation of what it does."},
  {sel:"#moreBtn",starter:true,title:"More pages",text:"You're in starter mode, showing the main pages. Click here when you want crafting, trading, the loot filter and the rest."},
];
const TOURST={i:0,on:false};
function startTour(){TOURST.i=0;TOURST.on=true;showTab("home");setTimeout(tourRender,80)}
function endTour(done){TOURST.on=false;["tourBox","tourHole"].forEach(id=>{const e=$(id);if(e)e.remove()});if(done){S.tourDone=Date.now();save()}}
function tourSteps(){return TOUR.filter(s=>(!s.desk||DESK)&&(!s.starter||UI.mode==="starter")&&document.querySelector(s.sel))}
function tourRender(){
  const steps=tourSteps();if(!TOURST.on||!steps.length)return endTour(true);
  TOURST.i=Math.max(0,Math.min(TOURST.i,steps.length-1));const st=steps[TOURST.i];
  if(st.tab&&CUR_TAB!==st.tab)showTab(st.tab);
  const el=document.querySelector(st.sel);if(!el)return endTour(true);
  el.scrollIntoView({block:"center",behavior:"auto"});
  // the spotlight is its own fixed layer (a ring with a huge shadow), so card layers and animations can't hide it
  let hole=$("tourHole");if(!hole){hole=document.createElement("div");hole.id="tourHole";document.body.appendChild(hole)}
  let box=$("tourBox");if(!box){box=document.createElement("div");box.id="tourBox";box.setAttribute("role","dialog");box.setAttribute("aria-label","Tour");document.body.appendChild(box)}
  box.innerHTML=`<div class="small muted">${TOURST.i+1} of ${steps.length}</div><h3 style="margin:2px 0 4px">${esc(st.title)}</h3><p class="small" style="margin:0">${esc(st.text)}</p>
    <div class="row" style="justify-content:space-between;margin-top:8px"><button class="btn ghost small" id="tourSkip">Skip tour</button><span class="row">${TOURST.i?'<button class="btn ghost small" id="tourBack">Back</button>':""}<button class="btn primary small" id="tourNext">${TOURST.i===steps.length-1?"Finish":"Next"}</button></span></div>`;
  const tok=TOURST.tok=(TOURST.tok||0)+1;
  const place=()=>{if(tok!==TOURST.tok||!TOURST.on)return;
    // the web version sizes text with CSS zoom: positions are measured zoomed but set unzoomed
    const z=parseFloat(document.documentElement.style.zoom)||1,R=el.getBoundingClientRect(),r={top:R.top/z,left:R.left/z,right:R.right/z,bottom:R.bottom/z,width:R.width/z,height:R.height/z},innerWidth=window.innerWidth/z,innerHeight=window.innerHeight/z,pad=6,bw=Math.min(320,innerWidth-24);box.style.width=bw+"px";const bh=box.offsetHeight||150;
    Object.assign(hole.style,{top:(r.top-pad)+"px",left:(r.left-pad)+"px",width:(r.width+pad*2)+"px",height:(r.height+pad*2)+"px"});
    const clampY=y=>Math.max(8,Math.min(innerHeight-bh-8,y)),clampX=x=>Math.max(12,Math.min(innerWidth-bw-12,x));
    let top,left;
    if(r.right+16+bw<innerWidth){left=r.right+16;top=clampY(r.top)}            // right of it
    else if(r.left-16-bw>0){left=r.left-16-bw;top=clampY(r.top)}               // left of it
    else if(r.bottom+12+bh<innerHeight){top=r.bottom+12;left=clampX(r.left)}   // below
    else{top=clampY(r.top-bh-12);left=clampX(r.left)}                          // above
    box.style.top=top+"px";box.style.left=left+"px"};
  place();setTimeout(place,350);
  $("tourSkip").onclick=()=>endTour(true);
  const bk=$("tourBack");if(bk)bk.onclick=()=>{TOURST.i--;tourRender()};
  $("tourNext").onclick=()=>{if(TOURST.i>=steps.length-1)endTour(true);else{TOURST.i++;tourRender()}};
  $("tourNext").focus();
}
document.addEventListener("keydown",e=>{if(TOURST.on&&e.key==="Escape")endTour(true)});
addEventListener("resize",()=>{if(TOURST.on)tourRender()});

// in-game hints: each shown once on the overlay, at the moment it's useful
function gameHint(id,text){
  if(!DESK||!DESK.overlayHint||(S.hints||{})[id])return;
  S.hints={...(S.hints||{}),[id]:Date.now()};save();DESK.overlayHint(text);
}


function setCompact(on){S.compact=!!on;save();applyCompact();toast(on?"Compact mode on.":"Compact mode off.")}
applyCompact();

/* phone: hide the title bar while scrolling down, bring it back when scrolling up */
{let lastY=scrollY;addEventListener("scroll",()=>{const y=scrollY,h=document.querySelector("header");if(!h)return;if(innerWidth>700){h.classList.remove("tuck");lastY=y;return}
  const bar=h.querySelector(".bar");if(bar)h.style.setProperty("--barH",bar.offsetHeight+"px");if(y>120&&y>lastY+6)h.classList.add("tuck");else if(y<lastY-6||y<60)h.classList.remove("tuck");lastY=y},{passive:true});}
