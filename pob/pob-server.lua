-- Exile Companion: keeps Path of Building loaded (headless) and answers requests, one JSON object per line.
-- Started by the app with Path of Building's own folder as the working directory and this folder as arg[1].
-- Replies are lines starting with "@@EC " (Path of Building prints its own progress lines too).
--   {"id":1,"op":"load","xml":"<PathOfBuilding>..."}     load a build
--   {"id":2,"op":"compare","item":"<item text>","slots":["Ring 1","Ring 2"]}   numbers now vs with the item
--   {"id":3,"op":"ping"}
local here = arg[1] or "."

-- Path of Building's files can start with a UTF-8 BOM and a "#@" line that its launcher strips: do the same.
-- Files it doesn't ship (HeadlessWrapper.lua, _SimpleGraphic.def.lua) come from this script's folder.
local function loadClean(p)
  local f = io.open(p, "rb"); if not f then f = io.open(here .. "/" .. p, "rb") end
  if not f then return nil, "cannot open " .. tostring(p) end
  local s = f:read("*a"); f:close()
  s = s:gsub("^\239\187\191", ""); if s:sub(1, 1) == "#" then s = "--" .. s end
  return loadstring(s, "@" .. p)
end
loadfile = function(p) return loadClean(p) end
dofile = function(p) local fn, err = loadClean(p); if not fn then error(err, 2) end; return fn() end

local realWrite = io.write
local function send(s) realWrite("@@EC ", s, "\n"); io.stdout:flush() end

local okInit, errInit = xpcall(function() dofile("HeadlessWrapper.lua") end, debug.traceback)
local json = okInit and require("dkjson")
if not okInit or not json then send('{"ok":false,"fatal":true,"error":"Path of Building could not start headless"}'); io.stderr:write(tostring(errInit), "\n"); os.exit(2) end

local function num(v) v = tonumber(v); if not v or v ~= v or v == math.huge or v == -math.huge then return 0 end; return v end
local function pick(o)
  return { dps = num(o.FullDPS ~= nil and o.FullDPS > 0 and o.FullDPS or o.CombinedDPS or o.TotalDPS), life = num(o.Life), es = num(o.EnergyShield), mana = num(o.Mana),
    ehp = num(o.TotalEHP), fire = num(o.FireResist), cold = num(o.ColdResist), lightning = num(o.LightningResist), chaos = num(o.ChaosResist),
    armour = num(o.Armour), evasion = num(o.Evasion), speed = num(o.MovementSpeedMod) }
end
local function mainSkillName()
  local env = build.calcsTab.mainEnv
  local ok, n = pcall(function() return env.player.mainSkill.activeEffect.grantedEffect.name end)
  return ok and n or ""
end
local function slotItemName(slot)
  local ok, n = pcall(function() local s = build.itemsTab.slots[slot]; local it = s and build.itemsTab.items[s.selItemId]; return it and it.name or "" end)
  return ok and n or ""
end

local loaded = false
local handlers = {}
function handlers.ping() return { ok = true, loaded = loaded } end
function handlers.load(req)
  loadBuildFromXML(req.xml or "")
  for _ = 1, 4 do runCallback("OnFrame") end         -- the build finishes loading and calculating over a few frames
  build = __mainObject__.main.modes["BUILD"] or build
  loaded = true
  local calcFunc = build.calcsTab:GetMiscCalculator()
  return { ok = true, skill = mainSkillName(), now = pick(calcFunc({}, true)) }
end
function handlers.compare(req)
  if not loaded then return { ok = false, error = "no build loaded" } end
  local item = new("Item"):Item(req.item or "")      -- the same steps as pasting an item into Path of Building
  if not item.base then return { ok = false, error = "Path of Building didn't recognise this item" } end
  item:NormaliseQuality(); item:BuildModList()
  local calcFunc = build.calcsTab:GetMiscCalculator()
  local out = { ok = true, skill = mainSkillName(), now = pick(calcFunc({}, true)), slots = {} }
  for _, slot in ipairs(req.slots or {}) do
    if build.itemsTab.slots[slot] then
      out.slots[#out.slots + 1] = { slot = slot, current = slotItemName(slot), with = pick(calcFunc({ repSlotName = slot, repItem = item }, true)) }
    end
  end
  return out
end

send('{"ok":true,"ready":true}')
for line in io.lines() do
  local req = json.decode(line)
  if type(req) == "table" and handlers[req.op] then
    local ok, res = xpcall(function() return handlers[req.op](req) end, debug.traceback)
    if not ok then res = { ok = false, error = tostring(res):sub(1, 400) } end
    res.id = req.id
    send(json.encode(res))
  elseif type(req) == "table" then
    send(json.encode({ id = req.id, ok = false, error = "unknown request" }))
  end
end
