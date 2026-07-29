export const COSMETIC_RARITIES = ["normal", "rare", "epic", "legendary"] as const;

export type CosmeticRarity = (typeof COSMETIC_RARITIES)[number];
export type CosmeticSlot = "head" | "held";

type CosmeticDefinition<Id extends string, Slot extends CosmeticSlot> = Readonly<{
  id: Id;
  slot: Slot;
  rarity: CosmeticRarity;
  name: string;
  price: number;
}>;

export const HEAD_ACCESSORY_CATALOG = [
  { id: "none", slot: "head", rarity: "normal", name: "なし", price: 0 },
  { id: "cap", slot: "head", rarity: "normal", name: "キャップ", price: 50 },
  { id: "headband", slot: "head", rarity: "normal", name: "ヘッドバンド", price: 50 },
  { id: "sunglasses", slot: "head", rarity: "normal", name: "サングラス", price: 75 },
  { id: "beanie", slot: "head", rarity: "normal", name: "ニット帽", price: 75 },
  { id: "cat-ears", slot: "head", rarity: "normal", name: "ネコミミ", price: 100 },
  { id: "paper-bag", slot: "head", rarity: "normal", name: "紙袋", price: 50 },
  { id: "headphones", slot: "head", rarity: "rare", name: "ヘッドホン", price: 200 },
  { id: "goggles", slot: "head", rarity: "rare", name: "ゴーグル", price: 175 },
  { id: "devil-horns", slot: "head", rarity: "rare", name: "悪魔の角", price: 250 },
  { id: "crown", slot: "head", rarity: "legendary", name: "王冠", price: 1000 },
  { id: "wizard-hat", slot: "head", rarity: "epic", name: "魔法使いの帽子", price: 400 },
  { id: "samurai-helmet", slot: "head", rarity: "legendary", name: "侍兜", price: 900 },
  { id: "afro", slot: "head", rarity: "epic", name: "アフロ", price: 350 },
  { id: "halo", slot: "head", rarity: "legendary", name: "天使の輪", price: 750 }
] as const satisfies readonly CosmeticDefinition<string, "head">[];

export const HELD_ITEM_CATALOG = [
  { id: "none", slot: "held", rarity: "normal", name: "なし", price: 0 },
  { id: "wood-sword", slot: "held", rarity: "normal", name: "木の剣", price: 50 },
  { id: "umbrella", slot: "held", rarity: "normal", name: "傘", price: 75 },
  { id: "frying-pan", slot: "held", rarity: "normal", name: "フライパン", price: 50 },
  { id: "baseball-bat", slot: "held", rarity: "normal", name: "バット", price: 100 },
  { id: "baguette", slot: "held", rarity: "normal", name: "バゲット", price: 50 },
  { id: "iron-sword", slot: "held", rarity: "rare", name: "鉄の剣", price: 200 },
  { id: "spear", slot: "held", rarity: "rare", name: "槍", price: 175 },
  { id: "electric-guitar", slot: "held", rarity: "epic", name: "エレキギター", price: 400 },
  { id: "toy-hammer", slot: "held", rarity: "rare", name: "ピコピコハンマー", price: 150 },
  { id: "greatsword", slot: "held", rarity: "epic", name: "大剣", price: 500 },
  { id: "magic-wand", slot: "held", rarity: "epic", name: "魔法の杖", price: 350 },
  { id: "keyboard", slot: "held", rarity: "rare", name: "キーボード", price: 250 },
  { id: "frozen-tuna", slot: "held", rarity: "epic", name: "冷凍マグロ", price: 450 },
  { id: "katana", slot: "held", rarity: "legendary", name: "刀", price: 800 },
  { id: "scythe", slot: "held", rarity: "legendary", name: "大鎌", price: 1000 },
  { id: "giant-pencil", slot: "held", rarity: "legendary", name: "巨大鉛筆", price: 750 }
] as const satisfies readonly CosmeticDefinition<string, "held">[];

export type HeadAccessoryId = (typeof HEAD_ACCESSORY_CATALOG)[number]["id"];
export type HeldItemId = (typeof HELD_ITEM_CATALOG)[number]["id"];

export const HEAD_ACCESSORY_IDS = HEAD_ACCESSORY_CATALOG.map(({ id }) => id);
export const HELD_ITEM_IDS = HELD_ITEM_CATALOG.map(({ id }) => id);

const headAccessoryIdAllowlist: ReadonlySet<string> = new Set(HEAD_ACCESSORY_IDS);
const heldItemIdAllowlist: ReadonlySet<string> = new Set(HELD_ITEM_IDS);

export function isHeadAccessoryId(value: unknown): value is HeadAccessoryId {
  return typeof value === "string" && headAccessoryIdAllowlist.has(value);
}

export function isHeldItemId(value: unknown): value is HeldItemId {
  return typeof value === "string" && heldItemIdAllowlist.has(value);
}

export const INITIAL_OWNED_HEAD_ACCESSORY_IDS = ["none", "cap", "headband"] as const satisfies readonly HeadAccessoryId[];
export const INITIAL_OWNED_HELD_ITEM_IDS = ["none", "wood-sword"] as const satisfies readonly HeldItemId[];

export const DEFAULT_EQUIPMENT = {
  headAccessoryId: "cap",
  heldItemId: "wood-sword"
} as const satisfies Readonly<{ headAccessoryId: HeadAccessoryId; heldItemId: HeldItemId }>;
