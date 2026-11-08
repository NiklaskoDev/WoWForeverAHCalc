// Item table: "Item Name": [itemId, vendorBuyPriceCopper, quality, itemLevel, kind]
//   itemId 0     = unknown; use "Resolve IDs" in Settings & Sync (Blizzard API) or type it on the Prices tab.
//   vendorBuy    = only set for items sold by NPC vendors (thread, vials, dye...). The Blizzard
//                  item sync replaces these estimates with the real purchase price.
//   quality      = 0 poor, 1 common, 2 uncommon, 3 rare, 4 epic (only needed for gear / disenchanting)
//   kind         = "a" armor, "w" weapon (only needed for disenchanting)
// Quality / item level here are best-effort estimates; the Blizzard item sync overwrites them.
window.WOW_ITEMS = {
  // ---------- Cloth & tailoring supplies ----------
  "Linen Cloth": [2589], "Wool Cloth": [2592], "Silk Cloth": [4306], "Mageweave Cloth": [4338],
  "Runecloth": [14047], "Felcloth": [14256], "Mooncloth": [14342],
  "Bolt of Linen Cloth": [2996], "Bolt of Woolen Cloth": [2997], "Bolt of Silk Cloth": [4305],
  "Bolt of Mageweave": [4339], "Bolt of Runecloth": [14048],
  "Coarse Thread": [2320, 10], "Fine Thread": [2321, 100], "Silken Thread": [4291, 300],
  "Heavy Silken Thread": [8343, 1600], "Rune Thread": [14341, 5000],
  "Bleach": [2324, 25], "Gray Dye": [4340, 350], "Red Dye": [2604, 50], "Blue Dye": [6260, 50],
  "Green Dye": [2605, 100], "Black Dye": [2325, 2500], "Purple Dye": [4342, 1250], "Ghost Dye": [9210],

  // ---------- Leather ----------
  "Ruined Leather Scraps": [2934], "Light Leather": [2318], "Medium Leather": [2319],
  "Heavy Leather": [4234], "Thick Leather": [4304], "Rugged Leather": [8170],
  "Light Hide": [783], "Medium Hide": [4232], "Heavy Hide": [4235], "Thick Hide": [8169], "Rugged Hide": [8171],
  "Cured Light Hide": [4231], "Cured Medium Hide": [4233], "Cured Heavy Hide": [4236],
  "Cured Thick Hide": [8172], "Cured Rugged Hide": [15407],
  "Salt": [4289, 50], "Deeprock Salt": [8150], "Refined Deeprock Salt": [15409],
  "Devilsaur Leather": [15417], "Enchanted Leather": [12810],
  "Light Armor Kit": [2304], "Medium Armor Kit": [2313], "Heavy Armor Kit": [4265],
  "Thick Armor Kit": [8173], "Rugged Armor Kit": [15564],

  // ---------- Ore, bars, stone ----------
  "Copper Ore": [2770], "Tin Ore": [2771], "Silver Ore": [2775], "Iron Ore": [2772], "Gold Ore": [2776],
  "Mithril Ore": [3858], "Truesilver Ore": [7911], "Thorium Ore": [10620], "Dark Iron Ore": [11370],
  "Copper Bar": [2840], "Tin Bar": [3576], "Bronze Bar": [2841], "Silver Bar": [2842], "Iron Bar": [3575],
  "Gold Bar": [3577], "Steel Bar": [3859], "Mithril Bar": [3860], "Truesilver Bar": [6037],
  "Thorium Bar": [12359], "Dark Iron Bar": [11371], "Arcanite Bar": [12360], "Enchanted Thorium Bar": [12655],
  "Rough Stone": [2835], "Coarse Stone": [2836], "Heavy Stone": [2838], "Solid Stone": [7912], "Dense Stone": [12365],
  "Weak Flux": [2880, 100], "Strong Flux": [3466, 200], "Coal": [3857, 500],
  "Blue Power Crystal": [11184], "Green Power Crystal": [11185], "Red Power Crystal": [11186], "Yellow Power Crystal": [11188],

  // ---------- Gems, pearls, rare mats ----------
  "Malachite": [774], "Tigerseye": [818], "Moss Agate": [1206], "Jade": [1529], "Aquamarine": [7909],
  "Iridescent Pearl": [5500], "Black Pearl": [7971], "Golden Pearl": [13926], "Arcane Crystal": [12363],
  "Black Vitriol": [9262],

  // ---------- Elementals ----------
  "Elemental Earth": [7067], "Elemental Fire": [7068], "Elemental Air": [7069], "Elemental Water": [7070],
  "Heart of Fire": [7077], "Essence of Earth": [7076], "Essence of Fire": [7078], "Essence of Water": [7080],
  "Essence of Air": [7082], "Essence of Undeath": [12808], "Living Essence": [12803],
  "Righteous Orb": [12811], "Blood of the Mountain": [11382],

  // ---------- Herbs ----------
  "Peacebloom": [2447], "Silverleaf": [765], "Earthroot": [2449], "Mageroyal": [785], "Briarthorn": [2450],
  "Swiftthistle": [2452], "Stranglekelp": [3820], "Bruiseweed": [2453], "Wild Steelbloom": [3355],
  "Grave Moss": [3369], "Kingsblood": [3356], "Liferoot": [3357], "Fadeleaf": [3818], "Goldthorn": [3821],
  "Khadgar's Whisker": [3358], "Wintersbite": [3819], "Firebloom": [4625], "Purple Lotus": [8831],
  "Arthas' Tears": [8836], "Sungrass": [8838], "Blindweed": [8839], "Ghost Mushroom": [8845],
  "Gromsblood": [8846], "Golden Sansam": [13464], "Dreamfoil": [13463], "Mountain Silversage": [13465],
  "Plaguebloom": [13466], "Icecap": [13467], "Black Lotus": [13468], "Wildvine": [8153],

  // ---------- Alchemy supplies & intermediates ----------
  "Empty Vial": [3371, 20], "Leaded Vial": [3372, 80], "Crystal Vial": [8925, 400], "Imbued Vial": [18256, 6000],
  "Oily Blackmouth": [6358], "Firefin Snapper": [6359], "Stonescale Eel": [13422],
  "Blackmouth Oil": [6370], "Fire Oil": [6371], "Stonescale Oil": [13423], "Shadow Oil": [3824], "Frost Oil": [3829],
  "Small Flame Sac": [4402], "Small Venom Sac": [1475], "Large Venom Sac": [1288],
  "Philosophers' Stone": [9149],

  // ---------- Potions, elixirs, flasks ----------
  "Minor Healing Potion": [118], "Lesser Healing Potion": [858], "Healing Potion": [929],
  "Greater Healing Potion": [1710], "Superior Healing Potion": [3928], "Major Healing Potion": [13446],
  "Minor Mana Potion": [2455], "Lesser Mana Potion": [3385], "Mana Potion": [3827], "Greater Mana Potion": [6149],
  "Superior Mana Potion": [13443], "Major Mana Potion": [13444], "Minor Rejuvenation Potion": [2456],
  "Elixir of Lion's Strength": [2454], "Elixir of Minor Defense": [5997], "Elixir of Minor Fortitude": [2458],
  "Weak Troll's Blood Potion": [3382], "Strong Troll's Blood Potion": [3388], "Mighty Troll's Blood Potion": [3826],
  "Swiftness Potion": [2459], "Elixir of Wisdom": [3383], "Elixir of Defense": [3389],
  "Elixir of Water Breathing": [5996], "Lesser Invisibility Potion": [3823], "Elixir of Firepower": [6373],
  "Elixir of Fortitude": [3825], "Elixir of Lesser Agility": [3390], "Elixir of Ogre's Strength": [3391],
  "Free Action Potion": [5634], "Elixir of Detect Lesser Invisibility": [3828], "Fire Protection Potion": [6049],
  "Elixir of Agility": [8949], "Elixir of Greater Defense": [8951], "Catseye Elixir": [10592],
  "Oil of Immolation": [8956], "Elixir of Detect Undead": [9154], "Magic Resistance Potion": [9036],
  "Elixir of Greater Agility": [9187], "Elixir of Giants": [9206], "Elixir of Dream Vision": [9197],
  "Gift of Arthas": [9088], "Arcane Elixir": [9155], "Elixir of Shadow Power": [9264],
  "Elixir of Demonslaying": [9224], "Wildvine Potion": [9144], "Invisibility Potion": [9172],
  "Limited Invulnerability Potion": [3387], "Dreamless Sleep Potion": [12190], "Greater Dreamless Sleep Potion": [20002],
  "Elixir of Greater Firepower": [21546], "Elixir of Superior Defense": [13445], "Greater Stoneshield Potion": [13455],
  "Mighty Rage Potion": [13442], "Elixir of the Sages": [13447], "Elixir of the Mongoose": [13452],
  "Elixir of Brute Force": [13453], "Greater Arcane Elixir": [13454], "Mageblood Potion": [20007],
  "Greater Fire Protection Potion": [13457], "Greater Frost Protection Potion": [13456],
  "Greater Nature Protection Potion": [13458], "Greater Shadow Protection Potion": [13459],
  "Greater Arcane Protection Potion": [13461], "Purification Potion": [13462],
  "Flask of the Titans": [13510], "Flask of Distilled Wisdom": [13511], "Flask of Supreme Power": [13512],
  "Flask of Chromatic Resistance": [13513], "Flask of Petrification": [13506],

  // ---------- Enchanting materials (disenchant results) ----------
  "Strange Dust": [10940], "Soul Dust": [11083], "Vision Dust": [11137], "Dream Dust": [11176], "Illusion Dust": [16204],
  "Lesser Magic Essence": [10938], "Greater Magic Essence": [10939], "Lesser Astral Essence": [10998],
  "Greater Astral Essence": [11082], "Lesser Mystic Essence": [11134], "Greater Mystic Essence": [11135],
  "Lesser Nether Essence": [11174], "Greater Nether Essence": [11175], "Lesser Eternal Essence": [16202],
  "Greater Eternal Essence": [16203],
  "Small Glimmering Shard": [10978], "Large Glimmering Shard": [11084], "Small Glowing Shard": [11138],
  "Large Glowing Shard": [11139], "Small Radiant Shard": [11177], "Large Radiant Shard": [11178],
  "Small Brilliant Shard": [14343], "Large Brilliant Shard": [14344], "Nexus Crystal": [20725],

  // ---------- Enchanting products & supplies ----------
  "Copper Rod": [6217, 124], "Silver Rod": [6338], "Golden Rod": [11128], "Truesilver Rod": [11144], "Arcanite Rod": [16206],
  "Runed Copper Rod": [6218], "Runed Silver Rod": [6339], "Runed Golden Rod": [11130],
  "Runed Truesilver Rod": [11145], "Runed Arcanite Rod": [16207],
  "Simple Wood": [4470, 38], "Star Wood": [11291, 380], "Maple Seed": [17034, 25], "Stranglethorn Seed": [17035, 50],
  "Lesser Magic Wand": [11287, 0, 2, 13, "w"], "Greater Magic Wand": [11288, 0, 2, 23, "w"],
  "Lesser Mystic Wand": [11289, 0, 2, 31, "w"], "Greater Mystic Wand": [11290, 0, 2, 37, "w"],
  "Minor Wizard Oil": [20744], "Minor Mana Oil": [20745], "Lesser Wizard Oil": [20746], "Lesser Mana Oil": [20747],
  "Wizard Oil": [20750], "Brilliant Wizard Oil": [20749], "Brilliant Mana Oil": [20748],
  "Smoking Heart of the Mountain": [11811],

  // ---------- Blacksmithing products ----------
  "Rough Sharpening Stone": [2862], "Coarse Sharpening Stone": [2863], "Heavy Sharpening Stone": [2871],
  "Solid Sharpening Stone": [7964], "Dense Sharpening Stone": [12404], "Elemental Sharpening Stone": [18262],
  "Rough Weightstone": [3239], "Coarse Weightstone": [3240], "Heavy Weightstone": [3241],
  "Solid Weightstone": [7965], "Dense Weightstone": [12643],
  "Rough Grinding Stone": [3470], "Coarse Grinding Stone": [3478], "Heavy Grinding Stone": [3486],
  "Solid Grinding Stone": [7966], "Dense Grinding Stone": [12644],
  "Silver Skeleton Key": [15869], "Golden Skeleton Key": [15870], "Truesilver Skeleton Key": [15871], "Arcanite Skeleton Key": [15872],
  "Iron Buckle": [7071], "Iron Shield Spike": [6042], "Mithril Shield Spike": [7967], "Mithril Spurs": [7969],
  "Copper Chain Pants": [2852, 0, 1, 9, "a"], "Copper Bracers": [2853, 0, 1, 7, "a"], "Rough Copper Vest": [10421, 0, 1, 7, "a"],
  "Copper Chain Belt": [2851, 0, 1, 11, "a"], "Runed Copper Belt": [2857, 0, 2, 18, "a"],
  "Rough Bronze Leggings": [2865, 0, 1, 21, "a"], "Patterned Bronze Bracers": [2868, 0, 2, 25, "a"],
  "Green Iron Boots": [3484, 0, 2, 29, "a"], "Green Iron Leggings": [3842, 0, 2, 31, "a"],
  "Green Iron Bracers": [3835, 0, 2, 33, "a"], "Green Iron Helm": [3836, 0, 2, 34, "a"],
  "Heavy Mithril Gauntlet": [7919, 0, 1, 40, "a"], "Heavy Mithril Shoulder": [7918, 0, 2, 41, "a"],
  "Heavy Mithril Pants": [7921, 0, 1, 42, "a"], "Mithril Scale Bracers": [7924, 0, 2, 43, "a"],
  "Steel Plate Helm": [7922, 0, 1, 43, "a"], "Mithril Coif": [7931, 0, 2, 44, "a"],
  "Heavy Mithril Breastplate": [7930, 0, 2, 46, "a"], "Heavy Mithril Boots": [7933, 0, 1, 47, "a"],
  "Heavy Mithril Helm": [7934, 0, 2, 49, "a"],
  "Thorium Armor": [12405, 0, 2, 50, "a"], "Thorium Belt": [12406, 0, 2, 50, "a"], "Thorium Bracers": [12408, 0, 2, 51, "a"],

  // ---------- Leatherworking products ----------
  "Handstitched Leather Boots": [2302, 0, 1, 8, "a"], "Handstitched Leather Vest": [5957, 0, 1, 10, "a"],
  "Embossed Leather Gloves": [4239, 0, 1, 15, "a"], "Fine Leather Belt": [4246, 0, 2, 18, "a"],
  "Dark Leather Boots": [2315, 0, 2, 25, "a"], "Dark Leather Tunic": [2317, 0, 2, 24, "a"],
  "Guardian Pants": [5962, 0, 2, 34, "a"],
  "Nightscape Headband": [8176, 0, 2, 42, "a"], "Nightscape Tunic": [8175, 0, 2, 41, "a"],
  "Nightscape Shoulders": [8192, 0, 2, 44, "a"], "Nightscape Pants": [8193, 0, 2, 47, "a"], "Nightscape Boots": [8197, 0, 2, 49, "a"],
  "Wicked Leather Gauntlets": [15083, 0, 2, 53, "a"], "Wicked Leather Bracers": [15084, 0, 2, 54, "a"],
  "Wicked Leather Headband": [15086, 0, 2, 57, "a"], "Wicked Leather Pants": [15087, 0, 2, 59, "a"],
  "Wicked Leather Belt": [15088, 0, 2, 61, "a"], "Wicked Leather Armor": [15085, 0, 2, 61, "a"],
  "Devilsaur Gauntlets": [15063, 0, 3, 63, "a"], "Devilsaur Leggings": [15062, 0, 3, 63, "a"],

  // ---------- Tailoring products ----------
  "Brown Linen Vest": [2568, 0, 1, 10, "a"], "Linen Cloak": [0, 0, 1, 10, "a"], "Brown Linen Pants": [4343, 0, 1, 12, "a"],
  "Brown Linen Robe": [6238, 0, 1, 12, "a"], "Heavy Linen Gloves": [4307, 0, 1, 15, "a"],
  "Reinforced Linen Cape": [2580, 0, 1, 17, "a"], "Linen Bag": [4238],
  "Woolen Cape": [2584, 0, 1, 18, "a"], "Woolen Bag": [4240], "Heavy Woolen Gloves": [4310, 0, 1, 20, "a"],
  "Gray Woolen Shirt": [2587], "Double-stitched Woolen Shoulders": [4314, 0, 1, 22, "a"],
  "Azure Silk Pants": [7046, 0, 2, 28, "a"], "Azure Silk Hood": [7048, 0, 2, 29, "a"], "Small Silk Pack": [4245],
  "Silk Headband": [7050, 0, 1, 32, "a"], "Formal White Shirt": [4334], "Crimson Silk Belt": [7055, 0, 2, 35, "a"],
  "Black Mageweave Vest": [9998, 0, 2, 41, "a"], "Black Mageweave Leggings": [9999, 0, 2, 41, "a"],
  "Black Mageweave Robe": [10001, 0, 2, 42, "a"], "Black Mageweave Gloves": [10003, 0, 2, 43, "a"],
  "Black Mageweave Headband": [10024, 0, 2, 46, "a"], "Black Mageweave Shoulders": [10027, 0, 2, 46, "a"],
  "Black Mageweave Boots": [10026, 0, 2, 48, "a"], "Mageweave Bag": [10050], "Red Mageweave Bag": [10051],
  "Runecloth Belt": [13856, 0, 2, 52, "a"], "Runecloth Robe": [13858, 0, 2, 52, "a"], "Runecloth Cloak": [13860, 0, 2, 53, "a"],
  "Runecloth Gloves": [13863, 0, 2, 55, "a"], "Runecloth Boots": [13864, 0, 2, 56, "a"], "Runecloth Pants": [13865, 0, 2, 57, "a"],
  "Runecloth Headband": [13866, 0, 2, 59, "a"], "Runecloth Shoulders": [13867, 0, 2, 61, "a"],
  "Runecloth Bag": [14046], "Mooncloth Bag": [14155],

  // ---------- Engineering ----------
  "Rough Blasting Powder": [4357], "Coarse Blasting Powder": [4364], "Heavy Blasting Powder": [4377],
  "Solid Blasting Powder": [10505], "Dense Blasting Powder": [15992],
  "Rough Dynamite": [4358], "Coarse Dynamite": [4365], "Heavy Dynamite": [4378], "Dense Dynamite": [18641],
  "Handful of Copper Bolts": [4359], "Rough Copper Bomb": [4360], "Copper Tube": [4361], "Rough Boomstick": [4362, 0, 1, 10, "w"],
  "Copper Modulator": [4363], "Large Copper Bomb": [4370], "Bronze Tube": [4371], "Deadly Blunderbuss": [4369, 0, 2, 26, "w"],
  "Small Bronze Bomb": [4374], "Whirring Bronze Gizmo": [4375], "Big Bronze Bomb": [4380], "Bronze Framework": [4382],
  "Explosive Sheep": [4384], "Iron Strut": [4387], "Iron Grenade": [4390], "Big Iron Bomb": [4394],
  "Flying Tiger Goggles": [4368, 0, 2, 25, "a"], "Silver Contact": [4404], "Crude Scope": [4405], "Standard Scope": [4406],
  "Arclight Spanner": [6219], "Wooden Stock": [4399, 96],
  "Crafted Light Shot": [8067], "Crafted Heavy Shot": [8068], "Crafted Solid Shot": [8069],
  "Gyromatic Micro-Adjustor": [10498], "Gold Power Core": [10558], "Mithril Tube": [10559], "Unstable Trigger": [10560],
  "Mithril Casing": [10561], "Hi-Explosive Bomb": [10562], "Hi-Impact Mithril Slugs": [10512], "Mithril Gyro-Shot": [10513],
  "Thorium Grenade": [15993], "Thorium Widget": [15994], "Thorium Shells": [15997], "Thorium Tube": [16000],

  // ---------- Cooking ----------
  "Mild Spices": [2678, 10], "Hot Spices": [2692, 40], "Soothing Spices": [3713, 160], "Refreshing Spring Water": [159, 25],
  "Stringy Wolf Meat": [2672], "Charred Wolf Meat": [2679], "Spiced Wolf Meat": [2680],
  "Chunk of Boar Meat": [769], "Roasted Boar Meat": [2681], "Small Egg": [6889], "Herb Baked Egg": [6888],
  "Goretusk Liver": [723], "Goretusk Liver Pie": [724], "Bear Meat": [3173], "Smoked Bear Meat": [6890],
  "Lean Wolf Flank": [1015], "Lean Wolf Steak": [12209], "Raptor Flesh": [12184], "Roast Raptor": [12210],
  "Mystery Meat": [12037], "Dragonbreath Chili": [12217], "Giant Egg": [12207], "Monster Omelet": [12218],
  "Tender Wolf Meat": [12208], "Tender Wolf Steak": [18045], "Deviate Fish": [6522], "Savory Deviate Delight": [6657],
  "Raw Brilliant Smallfish": [6291], "Brilliant Smallfish": [6290],
  "Raw Longjaw Mud Snapper": [6289], "Longjaw Mud Snapper": [4592],
  "Raw Rainbow Fin Albacore": [6361], "Rainbow Fin Albacore": [5095],
  "Raw Bristle Whisker Catfish": [6308], "Bristle Whisker Catfish": [4593],
  "Raw Rockscale Cod": [6362], "Rockscale Cod": [4594],
  "Raw Sagefish": [21071], "Smoked Sagefish": [21072], "Raw Greater Sagefish": [21153], "Sagefish Delight": [21217],
  "Raw Mithril Head Trout": [8365], "Mithril Head Trout": [8364],
  "Raw Spotted Yellowtail": [4603], "Spotted Yellowtail": [6887],
  "Raw Glossy Mightfish": [13754], "Cooked Glossy Mightfish": [13927],
  "Winter Squid": [13755], "Grilled Squid": [13928], "Raw Nightfin Snapper": [13759], "Nightfin Soup": [13931],
  "Raw Sunscale Salmon": [13760], "Poached Sunscale Salmon": [13932], "Darkclaw Lobster": [13888], "Lobster Stew": [13933],
  "Large Raw Mightfish": [13893], "Mightfish Steak": [13934], "Raw Whitescale Salmon": [13889], "Baked Salmon": [13935],
  "Runn Tum Tuber": [18255], "Runn Tum Tuber Surprise": [18254], "Sandworm Meat": [20424], "Smoked Desert Dumplings": [20452],

  // ---------- First Aid ----------
  "Linen Bandage": [1251], "Heavy Linen Bandage": [2581], "Wool Bandage": [3530], "Heavy Wool Bandage": [3531],
  "Silk Bandage": [6450], "Heavy Silk Bandage": [6451], "Mageweave Bandage": [8544], "Heavy Mageweave Bandage": [8545],
  "Runecloth Bandage": [14529], "Heavy Runecloth Bandage": [14530], "Anti-Venom": [6452], "Strong Anti-Venom": [6453]
};
