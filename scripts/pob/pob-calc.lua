-- Exile Companion: ask Path of Building (running headless) for a build's numbers, and optionally
-- how they change with another item in a slot. Usage (from Path of Building's src folder):
--   luajit pob-calc.lua <build.xml> [<item.txt> <slot name>]
-- Prints one line of JSON.
local xmlPath, itemPath, slotName = arg[1], arg[2], arg[3]
dofile("HeadlessWrapper.lua")
local function read(p) local f = assert(io.open(p, "rb")); local s = f:read("*a"); f:close(); return s end
loadBuildFromXML(read(xmlPath))
local out = build.calcsTab.mainOutput
local function pick(o)
  return { dps = o.FullDPS or o.CombinedDPS or o.TotalDPS or 0, life = o.Life or 0, es = o.EnergyShield or 0, ehp = o.TotalEHP or 0,
    fire = o.FireResist or 0, cold = o.ColdResist or 0, lightning = o.LightningResist or 0, chaos = o.ChaosResist or 0 }
end
local function json(t) local p = {} for k, v in pairs(t) do p[#p + 1] = string.format('"%s":%.4f', k, tonumber(v) or 0) end return "{" .. table.concat(p, ",") .. "}" end
local base = pick(out)
if itemPath then
  local item = new("Item", read(itemPath))
  local calcFunc = build.calcsTab:GetMiscCalculator()
  local with = pick(calcFunc({ repSlotName = slotName, repItem = item }))
  print('{"ok":true,"skill":"' .. tostring(build.calcsTab.mainEnv and build.calcsTab.mainEnv.player and build.calcsTab.mainEnv.player.mainSkill and build.calcsTab.mainEnv.player.mainSkill.activeEffect.grantedEffect.name or "") .. '","now":' .. json(base) .. ',"with":' .. json(with) .. '}')
else
  print('{"ok":true,"now":' .. json(base) .. '}')
end
