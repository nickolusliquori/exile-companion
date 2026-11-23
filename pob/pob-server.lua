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
  return { dps = num(o.FullDPS ~= nil and o.FullDPS > 0 and o.FullDPS or o.CombinedDPS or o.TotalDPS), hit = num(o.TotalDPS), life = num(o.Life), es = num(o.EnergyShield), mana = num(o.Mana),
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

-- gem comparisons for the main skill: what each support adds, what +1 level to the skill gem adds, and the best
-- compatible supports in place of the weakest one. Everything is put back afterwards.
function handlers.gems(req)
  if not loaded then return { ok = false, error = "no build loaded" } end
  local grp = build.skillsTab.socketGroupList[build.mainSocketGroup]
  if not grp then return { ok = false, error = "no main skill group" } end
  local function recalc() build.skillsTab:ProcessSocketGroup(grp); build.calcsTab:BuildOutput() end
  local function both() local o = pick(build.calcsTab:GetMiscCalculator()({}, true)); return o.dps, o.hit end
  local function dps() return (both()) end
  local base, baseHit = both()
  local more = function(withDps, withoutDps) if withoutDps and withoutDps > 0 then return (withDps / withoutDps - 1) * 100 end return 0 end
  local out = { ok = true, skill = mainSkillName(), base = base, current = {}, candidates = {} }
  -- each support's share: the DPS lost without it
  for i, g in ipairs(grp.gemList) do
    local ge = g.gemData and g.gemData.grantedEffect
    if g.enabled ~= false and ge and ge.support then
      g.enabled = false; recalc(); local without, withoutHit = both(); g.enabled = true; recalc()
      out.current[#out.current + 1] = { name = g.nameSpec, level = g.level, quality = g.quality, worth = more(base, without), hitWorth = more(baseHit, withoutHit), idx = i }
    end
  end
  -- +1 level to the active skill gem
  for _, g in ipairs(grp.gemList) do
    local ge = g.gemData and g.gemData.grantedEffect
    if g.enabled ~= false and ge and not ge.support then
      local lv = g.level; g.level = lv + 1; recalc(); out.levelUp = { name = g.nameSpec, level = lv, gain = more(dps(), base) }; g.level = lv; recalc()
      break
    end
  end
  -- every compatible support in the weakest support's socket
  local weakest = nil
  for _, c in ipairs(out.current) do if not weakest or c.worth < weakest.worth then weakest = c end end
  if weakest then
    out.replace = { name = weakest.name, worth = weakest.worth }
    local g = grp.gemList[weakest.idx]
    local saved = { gemId = g.gemId, nameSpec = g.nameSpec, skillId = g.skillId, level = g.level, quality = g.quality }
    local have = {}
    for _, x in ipairs(grp.gemList) do if x.gemData then have[x.gemData.name] = true end end
    local active = build.calcsTab.mainEnv and build.calcsTab.mainEnv.player and build.calcsTab.mainEnv.player.mainSkill
    local tried, maxTry = 0, tonumber(req.max) or 150
    for id, gem in pairs(build.data.gems) do
      local ge = gem.grantedEffect
      if tried < maxTry and ge and ge.support and not ge.unsupported and not have[gem.name] and active
        and pcall(calcLib.canGrantedEffectSupportActiveSkill, ge, active) and calcLib.canGrantedEffectSupportActiveSkill(ge, active) then
        tried = tried + 1
        g.gemId = id; g.nameSpec = gem.name; g.skillId = nil; g.level = gem.naturalMaxLevel or 20; g.quality = 20
        if pcall(recalc) then local d, h = both(); out.candidates[#out.candidates + 1] = { name = gem.name, level = g.level, gain = more(d, base), hitGain = more(h, baseHit) } end
      end
    end
    g.gemId, g.nameSpec, g.skillId, g.level, g.quality = saved.gemId, saved.nameSpec, saved.skillId, saved.level, saved.quality
    recalc()
    out.tried = tried
    table.sort(out.candidates, function(a, b) return a.gain > b.gain end)
    for i = #out.candidates, 16, -1 do out.candidates[i] = nil end
  end
  for _, c in ipairs(out.current) do c.idx = nil end
  table.sort(out.current, function(a, b) return a.worth > b.worth end)
  out.check = dps()   -- should equal base again: everything was put back
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
