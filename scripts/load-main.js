// Loads main.js with a stand-in for Electron, to catch errors that only happen at startup (order, typos). Used by check.js.
const Module=require("module");const path=require("path");
const noop=()=>{};const proxy=()=>new Proxy(function(){},{get:(t,k)=>k==="then"?undefined:(k===Symbol.toPrimitive?()=>"":proxy()),apply:()=>proxy(),construct:()=>proxy()});
const handlers={};
const electron=new Proxy({},{get:(t,k)=>{
  if(k==="app")return new Proxy({},{get:(t2,k2)=>k2==="getVersion"?()=>"0.0.0":k2==="getPath"?()=>"/tmp/ec-test":k2==="requestSingleInstanceLock"?()=>true:k2==="isPackaged"?false:k2==="whenReady"?()=>new Promise(()=>{}):k2==="on"?noop:proxy()});
  if(k==="ipcMain")return {handle:(c,f)=>{handlers[c]=f},on:(c,f)=>{handlers[c]=f},removeHandler:noop};
  return proxy();
}});
const orig=Module._load;Module._load=function(req,...a){if(req==="electron")return electron;if(req==="electron-updater")return {autoUpdater:proxy()};return orig.call(this,req,...a)};
require(path.resolve(__dirname, "..", "main.js"));
console.log("main.js loads; IPC channels:",Object.keys(handlers).length,["browser:go","browser:bounds","filter:choose","diag:get","pin:toggle","pin:nav","clip:history","clip:recheck"].every(c=>handlers[c])?"(browser, pinned browser, clipboard history, filter and report channels present)":"MISSING");
