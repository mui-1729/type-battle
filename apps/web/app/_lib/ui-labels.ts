import type { BotDifficulty, MatchRule, PromptCategory, RoomState } from "@type-battle/shared";
import type { PlayerSettings } from "../../lib/player-settings";

export const PROMPT_CATEGORY_LABELS: Record<PromptCategory, string> = {
  short: "短め",
  standard: "標準",
  long: "長め"
};

export const BOT_DIFFICULTY_LABELS: Record<BotDifficulty, string> = {
  easy: "かんたん",
  normal: "ふつう",
  hard: "むずかしい"
};

export const MATCH_RULE_LABELS: Record<MatchRule, string> = {
  race: "レース",
  timeAttack: "タイム",
  hpBattle: "HPバトル"
};

export const THEME_LABELS: Record<PlayerSettings["theme"], string> = {
  system: "システム",
  light: "ライト",
  dark: "ダーク"
};

export const FONT_SIZE_LABELS: Record<PlayerSettings["fontSize"], string> = {
  small: "小",
  normal: "標準",
  large: "大"
};

export const STATUS_LABELS: Record<RoomState["status"] | "result", string> = {
  waiting: "待機中",
  countdown: "カウントダウン",
  playing: "対戦中",
  finished: "終了",
  result: "結果"
};

export function getPlayerRoleLabel(player: RoomState["players"][number]): string {
  if (player.isBot) {
    return "COM";
  }

  if (player.isHost) {
    return "ホスト";
  }

  return player.ready ? "準備完了" : "待機中";
}

export function getPlayerConnectionLabel(player: RoomState["players"][number]): string {
  if (player.isBot) {
    return "COM";
  }

  if (player.finishTimeMs === Infinity) {
    return "棄権";
  }

  return player.connected ? "接続中" : "再接続中...";
}
