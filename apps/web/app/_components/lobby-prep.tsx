import { Check, ChevronLeft, ChevronRight, Clipboard, LogOut, MessageCircle } from "lucide-react";
import { useState } from "react";
import { QUICK_REACTIONS } from "@type-battle/shared";
import type { BotDifficulty, MatchRule, PlayerState, PromptCategory, QuickReaction, RoomState } from "@type-battle/shared";
import { getAccessory, type PlayerAccessory } from "../../lib/player-accessories";
import { BOT_DIFFICULTY_LABELS, MATCH_RULE_DETAILS, PROMPT_CATEGORY_LABELS } from "../_lib/ui-labels";
import { PlayerIdentity } from "./player-identity";
import { StickFigure } from "./stick-figure";
import { Button, SectionHeading, SurfaceCard } from "./ui";

type LobbyPrepProps = {
  room: RoomState;
  localPlayerId: string;
  accessoryIndex: number;
  onPreviousAccessory: () => void;
  onNextAccessory: () => void;
  onCopyRoomCode: () => void;
  onLeave: () => void;
  onToggleReady: () => void;
  onMatchRuleChange: (rule: MatchRule) => void;
  onPromptCategoryChange: (category: PromptCategory) => void;
  onBotDifficultyChange: (difficulty: BotDifficulty) => void;
  onReaction: (reaction: QuickReaction) => void;
  remoteReaction: { playerId: string; reaction: QuickReaction } | null;
};

export function LobbyPrep({
  room,
  localPlayerId,
  accessoryIndex,
  onPreviousAccessory,
  onNextAccessory,
  onCopyRoomCode,
  onLeave,
  onToggleReady,
  onMatchRuleChange,
  onPromptCategoryChange,
  onBotDifficultyChange,
  onReaction,
  remoteReaction
}: LobbyPrepProps) {
  const localPlayer = room.players.find((player) => player.id === localPlayerId) ?? null;
  const humanPlayers = room.players.filter((player) => !player.isBot);
  const playerOne = room.players.find((player) => player.isHost) ?? room.players[0] ?? null;
  const playerTwo = room.players.find((player) => player.id !== playerOne?.id) ?? null;
  const reactionPlayer = remoteReaction
    ? room.players.find((player) => player.id === remoteReaction.playerId) ?? null
    : null;
  const isHost = Boolean(localPlayer?.isHost);
  const selectedAccessory = getAccessory(localPlayer?.accessoryIndex ?? accessoryIndex);
  const [reaction, setReaction] = useReactionCooldown(onReaction);

  return (
    <section className="lobbyPrep" aria-labelledby="lobby-prep-title" data-testid="lobby-prep">
      <div className="lobbyPrepHeader">
        <SectionHeading
          eyebrow="MATCH READY"
          title="試合の準備"
          description="アクセサリを選び、準備ができたらREADY。両者の準備完了で自動的に始まります。"
          id="lobby-prep-title"
        />
        <div className="lobbyRoomCode" aria-label={`ルームコード ${room.roomCode}`}>
          <span>ROOM</span>
          <strong>{room.roomCode}</strong>
          <Button variant="icon" iconOnly type="button" onClick={onCopyRoomCode} aria-label="ルームコードをコピー" title="ルームコードをコピー">
            <Clipboard size={18} />
          </Button>
          <Button variant="icon" iconOnly type="button" onClick={onLeave} aria-label="ルームを退出" title="ルームを退出">
            <LogOut size={18} />
          </Button>
        </div>
      </div>

      <div className="lobbyPlayerGrid" aria-label="参加プレイヤー">
        <LobbyPlayerCard
          player={playerOne}
          fallbackLabel="ホストを待っています"
          slot="1P"
          isLocal={playerOne?.id === localPlayerId}
          ready={Boolean(playerOne?.ready)}
          accessory={playerOne?.id === localPlayerId ? selectedAccessory : getAccessory(playerOne?.accessoryIndex ?? (playerOne?.isBot ? 1 : 0))}
          {...(playerOne?.id === localPlayerId
            ? { onPreviousAccessory, onNextAccessory }
            : {})}
        />
        <LobbyPlayerCard
          player={playerTwo}
          fallbackLabel="対戦相手を待っています"
          slot="2P"
          isLocal={playerTwo?.id === localPlayerId}
          ready={Boolean(playerTwo?.ready)}
          accessory={playerTwo?.id === localPlayerId ? selectedAccessory : getAccessory(playerTwo?.accessoryIndex ?? (playerTwo?.isBot ? 1 : 0))}
          {...(playerTwo?.id === localPlayerId
            ? { onPreviousAccessory, onNextAccessory }
            : {})}
        />
      </div>

      <div className="lobbyPrepControls">
        <SurfaceCard className="lobbySettingsCard">
          <div className="lobbySettingsHeading">
            <div>
              <p className="eyebrow">NEXT MATCH</p>
              <h3>次の試合設定</h3>
            </div>
            <span className="lobbyHostOnly">{isHost ? "HOST" : "HOST ONLY"}</span>
          </div>
          <div className="lobbySettingGroup">
            <span>ルール</span>
            <div className="lobbyChoiceGrid">
              {(Object.keys(MATCH_RULE_DETAILS) as MatchRule[]).map((rule) => (
                <button
                  className={room.matchRule === rule ? "lobbyChoice active" : "lobbyChoice"}
                  key={rule}
                  type="button"
                  disabled={!isHost}
                  onClick={() => onMatchRuleChange(rule)}
                  aria-pressed={room.matchRule === rule}
                >
                  <strong>{MATCH_RULE_DETAILS[rule].label}</strong>
                  <small>{MATCH_RULE_DETAILS[rule].description}</small>
                </button>
              ))}
            </div>
          </div>
          <div className="lobbySettingRow">
            <label htmlFor="lobby-prompt-category">課題</label>
            <select
              id="lobby-prompt-category"
              value={room.promptCategory}
              disabled={!isHost}
              onChange={(event) => onPromptCategoryChange(event.target.value as PromptCategory)}
            >
              {(Object.keys(PROMPT_CATEGORY_LABELS) as PromptCategory[]).map((category) => (
                <option key={category} value={category}>{PROMPT_CATEGORY_LABELS[category]}</option>
              ))}
            </select>
          </div>
          <div className="lobbySettingRow">
            <label htmlFor="lobby-bot-difficulty">COMの強さ</label>
            <select
              id="lobby-bot-difficulty"
              value={room.botDifficulty}
              disabled={!isHost}
              onChange={(event) => onBotDifficultyChange(event.target.value as BotDifficulty)}
            >
              {(Object.keys(BOT_DIFFICULTY_LABELS) as BotDifficulty[]).map((difficulty) => (
                <option key={difficulty} value={difficulty}>{BOT_DIFFICULTY_LABELS[difficulty]}</option>
              ))}
            </select>
          </div>
        </SurfaceCard>

        <SurfaceCard className="lobbyReactionCard">
          <div className="lobbySettingsHeading">
            <div>
              <p className="eyebrow">QUICK REACTION</p>
              <h3>定型リアクション</h3>
            </div>
            <MessageCircle size={20} aria-hidden="true" />
          </div>
          <div className="reactionGrid" aria-label="定型リアクション">
            {QUICK_REACTIONS.map((item) => (
              <button
                className={reaction === item ? "reactionButton active" : "reactionButton"}
                key={item}
                type="button"
                onClick={() => setReaction(item)}
                aria-pressed={reaction === item}
              >
                {item}
              </button>
            ))}
          </div>
          <p className="lobbyReactionStatus" role="status" aria-live="polite">
            {reaction ? `${reaction} を送りました` : "自由入力なし・3秒に1回送信できます"}
          </p>
          {remoteReaction && remoteReaction.playerId !== localPlayerId ? (
            <p className="lobbyRemoteReaction" role="status" aria-live="polite">
              {reactionPlayer?.nickname ?? "相手"}: 「{remoteReaction.reaction}」
            </p>
          ) : null}
        </SurfaceCard>
      </div>

      <div className="lobbyReadySummary" role="status" aria-live="polite">
        <span className={localPlayer?.ready ? "readyBadge active" : "readyBadge"}>
          {localPlayer?.ready ? <Check size={15} /> : null} YOU {localPlayer?.ready ? "READY" : "WAITING"}
        </span>
        <span className={playerTwo?.ready ? "readyBadge active" : "readyBadge"}>
          {playerTwo?.ready ? <Check size={15} /> : null} 2P {playerTwo?.ready ? "READY" : "WAITING"}
        </span>
        <span>{humanPlayers.length === 1 ? "あなたのREADYで開始します" : "両者READYで開始します"}</span>
        <Button
          className="lobbyReadyButton"
          variant={localPlayer?.ready ? "secondary" : "primary"}
          type="button"
          onClick={onToggleReady}
          disabled={!localPlayer}
          aria-pressed={Boolean(localPlayer?.ready)}
        >
          {localPlayer?.ready ? "READYを取り消す" : "READYにする"}
        </Button>
      </div>
    </section>
  );
}

type LobbyPlayerCardProps = {
  player: PlayerState | null;
  fallbackLabel: string;
  slot: "1P" | "2P";
  isLocal?: boolean;
  ready: boolean;
  accessory: PlayerAccessory;
  onPreviousAccessory?: () => void;
  onNextAccessory?: () => void;
};

function LobbyPlayerCard({
  player,
  fallbackLabel,
  slot,
  isLocal = false,
  ready,
  accessory,
  onPreviousAccessory,
  onNextAccessory
}: LobbyPlayerCardProps) {
  const kind = player?.isBot ? "com" : isLocal ? "you" : slot === "1P" ? "one" : "two";

  return (
    <SurfaceCard className={`lobbyPlayerCard ${player ? "" : "isEmpty"}`.trim()}>
      <div className="lobbyPlayerCardTop">
        <PlayerIdentity
          nickname={player?.nickname ?? fallbackLabel}
          kind={kind}
          slot={slot}
          meta={player?.isBot ? "COM" : player ? (player.isHost ? "HOST" : "PLAYER") : "待機中"}
        />
        <span className={ready ? "readyBadge active" : "readyBadge"}>{ready ? "READY" : "WAITING"}</span>
      </div>
      <div className="lobbyFigureArea">
        {player ? (
          <>
            <span className="lobbyAccessory" aria-label={`アクセサリ ${accessory.label}`}>
              {accessory.glyph}
            </span>
            <StickFigure side={slot === "1P" ? "left" : "right"} pose={ready ? "ready" : "idle"} status="waiting" />
          </>
        ) : (
          <div className="lobbyEmptyFigure" aria-hidden="true">?</div>
        )}
      </div>
      {isLocal && player ? (
        <div className="accessoryPicker" aria-label="自分のアクセサリ">
          <button type="button" onClick={onPreviousAccessory} aria-label="前のアクセサリ">
            <ChevronLeft size={18} />
          </button>
          <span>{accessory.label}</span>
          <button type="button" onClick={onNextAccessory} aria-label="次のアクセサリ">
            <ChevronRight size={18} />
          </button>
        </div>
      ) : null}
    </SurfaceCard>
  );
}

function useReactionCooldown(onReaction: (reaction: QuickReaction) => void): [string, (reaction: QuickReaction) => void] {
  const [reaction, setReactionState] = useState("");
  const [cooldownUntil, setCooldownUntil] = useState(0);

  const setReaction = (nextReaction: QuickReaction) => {
    if (Date.now() < cooldownUntil) {
      return;
    }

    setReactionState(nextReaction);
    onReaction(nextReaction);
    setCooldownUntil(Date.now() + 3_000);
    window.setTimeout(() => setReactionState(""), 2_400);
  };

  return [reaction, setReaction];
}
