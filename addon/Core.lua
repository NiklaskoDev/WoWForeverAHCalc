-- Shows prices from your Forever AH Crafting server on item tooltips.
-- Addons can't use the network, so sync.ps1 writes Data.lua and the game reads it on /reload.

local LINES = { "auction", "lowest", "listed", "sold", "vendor", "age" }
local STALE_SECONDS = 2 * 60 * 60
local PREFIX = "|cff66bbffForever AH Prices:|r "

local options = {}
local shownOn = {}
local getItemInfo = (C_Item and C_Item.GetItemInfo) or GetItemInfo

local function isSecret(value)
  return type(issecretvalue) == "function" and issecretvalue(value)
end

local function money(copper)
  copper = math.floor(copper + 0.5)
  if GetCoinTextureString then return GetCoinTextureString(copper) end
  return string.format("%dg %ds %dc", math.floor(copper / 10000), math.floor(copper / 100) % 100, copper % 100)
end

local function ageText(seconds)
  if seconds < 90 then return "just now" end
  if seconds < 5400 then return string.format("%d min ago", math.floor(seconds / 60 + 0.5)) end
  if seconds < 129600 then return string.format("%d h ago", math.floor(seconds / 3600 + 0.5)) end
  return string.format("%d days ago", math.floor(seconds / 86400 + 0.5))
end

local function stackSize(tooltip, maxStack)
  local owner = tooltip:GetOwner()
  if not owner or (owner.IsForbidden and owner:IsForbidden()) then return 1 end
  local count = owner.count
  if isSecret(count) or type(count) ~= "number" or count < 2 then return 1 end
  if maxStack and count > maxStack then return 1 end
  return count
end

local function addLine(tooltip, label, value)
  tooltip:AddDoubleLine(label, value, 0.4, 0.73, 1, 1, 1, 1)
end

local function addPrice(tooltip, label, unitPrice, stack)
  addLine(tooltip, label, money(unitPrice))
  if stack > 1 then addLine(tooltip, label .. " x" .. stack, money(unitPrice * stack)) end
end

local function addPrices(tooltip, id)
  if tooltip:IsForbidden() or isSecret(id) or type(id) ~= "number" then return end
  local data = ForeverAHPrices_Data
  local row = data and data.items[id]
  if not row or shownOn[tooltip] == id then return end
  shownOn[tooltip] = id

  local market, lowest, listed, sold = row[1], row[2], row[3], row[4]
  local _, _, _, _, _, _, _, maxStack, _, _, vendor = getItemInfo(id)
  local stack = stackSize(tooltip, maxStack)

  if options.auction then addPrice(tooltip, "Auction", market, stack) end
  if options.lowest then addLine(tooltip, "Lowest listing", money(lowest)) end
  if options.listed then addLine(tooltip, "Listed", tostring(listed)) end
  if options.sold and sold then addLine(tooltip, "Sold / day", string.format("%.1f", sold)) end
  if options.vendor and vendor and vendor > 0 then addPrice(tooltip, "Vendor", vendor, stack) end
  if options.age then
    local seconds = time() - data.ts
    if seconds > STALE_SECONDS then
      tooltip:AddLine("Prices from " .. ageText(seconds), 1, 0.6, 0.2)
    else
      tooltip:AddLine("Prices from " .. ageText(seconds), 0.55, 0.55, 0.55)
    end
  end
  tooltip:Show()
end

local function hookTooltips()
  local tooltips = { GameTooltip, ItemRefTooltip }
  for _, tooltip in ipairs(tooltips) do
    tooltip:HookScript("OnTooltipCleared", function(self) shownOn[self] = nil end)
  end

  if TooltipDataProcessor and TooltipDataProcessor.AddTooltipPostCall and Enum and Enum.TooltipDataType then
    TooltipDataProcessor.AddTooltipPostCall(Enum.TooltipDataType.Item, function(tooltip, info)
      if tooltip == GameTooltip or tooltip == ItemRefTooltip then addPrices(tooltip, info and info.id) end
    end)
    return
  end

  for _, tooltip in ipairs(tooltips) do
    tooltip:HookScript("OnTooltipSetItem", function(self)
      local _, link = self:GetItem()
      if link and not isSecret(link) then addPrices(self, tonumber(link:match("item:(%d+)"))) end
    end)
  end
end

local function summary()
  local data = ForeverAHPrices_Data
  if not data then return "no prices yet. Run Sync prices.bat in this addon's folder, then type /reload." end
  return string.format("%d items from %s (%s). Type /reload to load newer prices.", data.count, ageText(time() - data.ts), data.label)
end

local function showOptions()
  local parts = {}
  for _, name in ipairs(LINES) do
    parts[#parts + 1] = name .. (options[name] and " |cff55dd55on|r" or " |cffdd5555off|r")
  end
  print(PREFIX .. summary())
  print(PREFIX .. table.concat(parts, ", "))
  print(PREFIX .. "turn a line on or off with /fah <name>, for example /fah vendor")
end

SLASH_FOREVERAHPRICES1 = "/fah"
SlashCmdList.FOREVERAHPRICES = function(message)
  local name = message:lower():match("%S+")
  if name and options[name] ~= nil then
    options[name] = not options[name]
    print(PREFIX .. name .. (options[name] and " is on" or " is off"))
  else
    showOptions()
  end
end

local events = CreateFrame("Frame")
events:RegisterEvent("PLAYER_LOGIN")
events:SetScript("OnEvent", function()
  ForeverAHPricesDB = ForeverAHPricesDB or {}
  options = ForeverAHPricesDB
  for _, name in ipairs(LINES) do
    if options[name] == nil then options[name] = true end
  end
  hookTooltips()
  print(PREFIX .. summary())
end)
