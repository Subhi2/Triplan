/**
 * Items to carry: the list in docs/06-seed-data.md, with names and lucide icon names. Shared by the
 * seed script and the estimated guidance (src/lib/guideDefaults.ts).
 */
export const CARRY_ITEMS = {
  raincoat: { name: "Raincoat", icon: "cloud-rain" },
  leech_socks: { name: "Leech socks", icon: "bug" },
  cash: { name: "Cash", icon: "banknote" },
  torch: { name: "Torch", icon: "flashlight" },
  jacket: { name: "Jacket", icon: "shirt" },
  gloves: { name: "Gloves", icon: "hand" },
  water_2l: { name: "Water (2 L)", icon: "cup-soda" },
  cap: { name: "Cap", icon: "sun" },
  trekking_shoes: { name: "Trekking shoes", icon: "footprints" },
  grip_shoes: { name: "Shoes with good grip", icon: "footprints" },
  socks_hot_rock: { name: "Socks for hot rock", icon: "thermometer-sun" },
  modest_clothing: { name: "Modest clothing", icon: "shirt" },
  traditional_attire: { name: "Traditional attire", icon: "shirt" },
  snacks: { name: "Snacks", icon: "cookie" },
  dry_bag: { name: "Dry bag", icon: "backpack" },
  spare_clothes: { name: "Spare clothes", icon: "shirt" },
  power_bank: { name: "Power bank", icon: "battery-charging" },
  first_aid: { name: "First aid kit", icon: "cross" },
  forest_permit: { name: "Forest permit", icon: "file-check" },
} as const satisfies Record<string, { name: string; icon: string }>;

export type CarrySlug = keyof typeof CARRY_ITEMS;
