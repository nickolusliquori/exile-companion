// Loads main.js with a stand-in for Electron, to catch errors that only happen at startup (order, typos). Used by check.js.
const Module=require("module");const path=require("path");
const noop=()=>{};const proxy=()=>new Proxy(function(){},{get:(t,k)=>k==="then"?undefined:(k===Symbol.toPrimitive?()=>"":proxy()),apply:()=>proxy(),construct:()=>proxy()});
const handlers={};
const electron=new Proxy({},{get:(t,k)=>{
  if(k==="app")return new Proxy({},{get:(t2,k2)=>k2==="getVersion"?()=>"0.0.0":k2==="getPath"?()=>process.env.EC_TEST_DIR||"/tmp/ec-test":k2==="requestSingleInstanceLock"?()=>true:k2==="isPackaged"?false:k2==="whenReady"?()=>(process.env.EC_TEST_DIR?Promise.resolve():new Promise(()=>{})):k2==="on"?noop:k2==="disableHardwareAcceleration"?()=>{global.__noGpu=true}:k2==="exit"||k2==="quit"||k2==="relaunch"?noop:proxy()});
  if(k==="ipcMain")return {handle:(c,f)=>{handlers[c]=f},on:(c,f)=>{handlers[c]=f},removeHandler:noop};
  return proxy();
}});
const orig=Module._load;Module._load=function(req,...a){if(req==="electron")return electron;if(req==="electron-updater")return {autoUpdater:proxy()};return orig.call(this,req,...a)};
require(path.resolve(__dirname, "..", "main.js"));
console.log("main.js loads; IPC channels:",Object.keys(handlers).length,["browser:go","browser:bounds","filter:choose","diag:get","pin:toggle","pin:nav","clip:history","clip:recheck","media:toggle","media:player","media:now","media:cmd"].every(c=>handlers[c])?"(browser, pinned browser, media, clipboard history, filter and report channels present)":"MISSING");

// EC_TEST_DIR set: also run the "app is ready" code, then report what the log saw
if(process.env.EC_TEST_DIR){setTimeout(()=>{const fs=require("fs");let log="";try{log=fs.readFileSync(path.join(process.env.EC_TEST_DIR,"logs","app.log"),"utf8")}catch(e){}
  const errs=log.split("\n").filter(l=>/ ERROR /.test(l));
  console.log(JSON.stringify({ready:true,safe:/SAFE MODE/.test(log),noGpu:!!global.__noGpu,errors:errs}));process.exit(0)},400)}
