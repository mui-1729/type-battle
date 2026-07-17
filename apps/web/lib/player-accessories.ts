export type PlayerAccessory = {
  id: string;
  label: string;
  glyph: string;
  unlockPoints: number;
};

export const PLAYER_ACCESSORIES: readonly PlayerAccessory[] = [
  { id: "none", label: "なし", glyph: "·", unlockPoints: 0 },
  { id: "cap", label: "キャップ", glyph: "⌒", unlockPoints: 0 },
  { id: "headband", label: "ハチマキ", glyph: "═", unlockPoints: 0 },
  { id: "glasses", label: "サングラス", glyph: "▰", unlockPoints: 5 },
  { id: "headphones", label: "ヘッドホン", glyph: "◖◗", unlockPoints: 5 },
  { id: "wizard-hat", label: "魔法使いの帽子", glyph: "△", unlockPoints: 5 },
  { id: "crown", label: "王冠", glyph: "♛", unlockPoints: 10 },
  { id: "kabuto", label: "武将風のかぶと", glyph: "兜", unlockPoints: 10 },
  { id: "halo", label: "天使の輪", glyph: "○", unlockPoints: 10 }
] as const;

export function isValidAccessoryIndex(value: number): boolean {
  return Number.isInteger(value) && value >= 0 && value < PLAYER_ACCESSORIES.length;
}

export function getAccessory(index: number): PlayerAccessory {
  return PLAYER_ACCESSORIES[isValidAccessoryIndex(index) ? index : 0]!;
}

export function getUnlockedAccessoryIndices(points: number, unlockedAccessoryIds: readonly string[] = []): number[] {
  return PLAYER_ACCESSORIES.reduce<number[]>((indices, accessory, index) => {
    if (accessory.unlockPoints <= points || unlockedAccessoryIds.includes(accessory.id)) {
      indices.push(index);
    }
    return indices;
  }, []);
}
