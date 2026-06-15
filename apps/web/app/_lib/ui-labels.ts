import type { BotDifficulty, DeviceKind, MatchRule, PromptCategory, RoomState } from "@type-battle/shared";
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

export const MATCH_RULE_DETAILS: Record<
  MatchRule,
  {
    label: string;
    description: string;
  }
> = {
  race: {
    label: "レース",
    description: "先に最後まで打ち切った人が勝ち。完走速度だけで決まる、いちばんシンプルなルール。"
  },
  timeAttack: {
    label: "タイムアタック",
    description: "制限時間内にどれだけ進めるかを競う。完走の早さより、時間切れ時点の進捗が重要。"
  },
  hpBattle: {
    label: "HPバトル",
    description: "正解で相手のHPを削り、ミスでも自分が減る。完走より先にHPを0にした方が勝ち。"
  }
};

export const MATCH_RULE_LABELS: Record<MatchRule, string> = {
  race: MATCH_RULE_DETAILS.race.label,
  timeAttack: MATCH_RULE_DETAILS.timeAttack.label,
  hpBattle: MATCH_RULE_DETAILS.hpBattle.label
};

export const DEVICE_KIND_LABELS: Record<DeviceKind, string> = {
  mobile: "スマホ",
  desktop: "PC"
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

export function getPlayerDeviceLabel(player: RoomState["players"][number]): string {
  if (player.isBot) {
    return "PC";
  }

  if (player.deviceKind) {
    return DEVICE_KIND_LABELS[player.deviceKind];
  }

  return "未設定";
}
