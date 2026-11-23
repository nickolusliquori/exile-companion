-- Exile Companion: ask Path of Building (running headless) for a build's numbers, and optionally
-- how they change with another item in a slot. Usage (from Path of Building's src folder):
--   luajit pob-calc.lua <build.xml> [<item.txt> <slot name>]
-- Prints one line of JSON.
local xmlPath, itemPath, slotName = arg[1], arg[2], arg[3]
-- run with Path of Building's folder as the working directory; files it doesn't ship (HeadlessWrapper.lua,
-- _SimpleGraphic.def.lua) are taken from this script's own folder
local here = (arg[0] or ""):match("^(.*)[/\\][^/\\]*$") or "."
-- Path of Building's files can start with a UTF-8 BOM and a "#@" line that its own launcher strips: do the same
-- for everything it loads (keeps line numbers: the line becomes a comment)
local function loadClean(p)
  local f = io.open(p, "rb"); if not f then f = io.open(here .. "/" .. p, "rb") end
  if not f then return nil, "cannot open " .. tostring(p) end
  local s = f:read("*a"); f:close()
  s = s:gsub("^\239\187\191", ""); if s:sub(1, 1) == "#" then s = "--" .. s end
  return loadstring(s, "@" .. p)
end
loadfile = function(p) return loadClean(p) end
dofile = function(p) local fn, err = loadClean(p); if not fn then error(err, 2) end; return fn() end
local okLoad, errLoad = xpcall(function() dofile("HeadlessWrapper.lua") end, debug.traceback)
if not okLoad then io.stderr:write(tostring(errLoad), "\n"); print('{"ok":false,"error":"loading Path of Building failed"}'); os.exit(2) end
local function read(p) local f = assert(io.open(p, "rb")); local s = f:read("*a"); f:close(); return s end
local okB, errB = xpcall(function() loadBuildFromXML(read(xmlPath)) end, debug.traceback)
if not okB then io.stderr:write(tostring(errB), "\n"); print('{"ok":false,"error":"loading the build failed"}'); os.exit(3) end
-- the build finishes loading and calculating over the next frames of Path of Building's main loop
for _ = 1, 4 do runCallback("OnFrame") end
build = __mainObject__.main.modes["BUILD"] or build
local out = build.calcsTab.mainOutput
local function pick(o)
  return { dps = o.FullDPS or o.CombinedDPS or o.TotalDPS or 0, life = o.Life or 0, es = o.EnergyShield or 0, ehp = o.TotalEHP or 0,
    fire = o.FireResist or 0, cold = o.ColdResist or 0, lightning = o.LightningResist or 0, chaos = o.ChaosResist or 0 }
end
local function json(t) local p = {} for k, v in pairs(t) do p[#p + 1] = string.format('"%s":%.4f', k, tonumber(v) or 0) end return "{" .. table.concat(p, ",") .. "}" end
local base = pick(out)
if itemPath then
  local with
  local okI, errI = xpcall(function()
    -- the same steps Path of Building's item tab uses for a pasted item, then its tooltip comparison
    local item = new("Item"):Item(read(itemPath))
    if not item.base then error("Path of Building didn't recognise this item's base") end
    item:NormaliseQuality(); item:BuildModList()
    local calcFunc = build.calcsTab:GetMiscCalculator()
    base = pick(calcFunc({}, true))
    with = pick(calcFunc({ repSlotName = slotName, repItem = item }, true))
  end, debug.traceback)
  if not okI then print("ITEM ERROR: " .. tostring(errI)); print('{"ok":false,"error":"item compare failed"}'); os.exit(4) end
  print('{"ok":true,"skill":"' .. tostring(build.calcsTab.mainEnv and build.calcsTab.mainEnv.player and build.calcsTab.mainEnv.player.mainSkill and build.calcsTab.mainEnv.player.mainSkill.activeEffect.grantedEffect.name or "") .. '","now":' .. json(base) .. ',"with":' .. json(with) .. '}')
else
  print('{"ok":true,"now":' .. json(base) .. '}')
end
