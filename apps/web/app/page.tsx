"use client";

import Link from "next/link";
import { Clipboard, Swords, Users } from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  createRealtimeSocket,
  getDefaultRealtimeUrl,
  type RealtimeTransport,
  type RealtimeSocket
} from "./_lib/realtime-client";
import {
  calculateAccuracy,
  calculateWpm,
  createRoomCode,
  normalizeNickname,
  validateNickname
} from "@type-battle/shared";
import type {
  MatchRule,
  MatchResult,
  PlayerResult,
  PromptCategory,
  QuickReaction,
  RoomState,
  TypingProgress
} from "@type-battle/shared";
import { GameHeader } from "./_components/game-header";
import { HomeModeMenu } from "./_components/home-mode-menu";
import { LobbyPrep } from "./_components/lobby-prep";
import { BattleStage } from "./_components/battle-stage";
import { PlayerSettingsModal } from "./_components/player-settings-modal";
import { ExitConfirmationModal } from "./_components/exit-confirmation-modal";
import { MatchSettingsModal } from "./_components/match-settings-modal";
import { ProgressBlock } from "./_components/progress-block";
import { ResultPanel } from "./_components/result-panel";
import { RivalBar } from "./_components/rival-bar";
import { Stat } from "./_components/stat";
import { TypingInput } from "./_components/typing-input";
import { StatusPill } from "./_components/status-pill";
import { TypingPrompt } from "./_components/typing-prompt";
import { PlayerIdentity } from "./_components/player-identity";
import { PracticeStage } from "./_components/practice-stage";
import { SectionHeading, SurfaceCard } from "./_components/ui";
import {
  createEmptyProgress,
  type MistakeSample,
  type ProgressState
} from "./_lib/typing-progress";
import {
  buildRomajiTypingPlan
} from "./_lib/romaji-typing";
import {
  getCanonicalProgressIndex
} from "./_lib/looping-typing";
import {
  getHomePageViewModel,
  type PracticeSession
} from "./_lib/home-page-view-model";
import { detectDeviceKind } from "./_lib/device-kind";
import { advanceTypingProgress } from "./_lib/typing-input-strategy";
import { shouldHandleDesktopTypingKey } from "./_lib/desktop-typing-input";
import { reconcileRoomProgress } from "./_lib/reconcile-room-progress";
import { resolveRoomSnapshot } from "./_lib/room-state-order";
import { getProgressSyncLabel } from "./_lib/progress-sync";
import {
  getStoredRoomJoinFailureAction,
  getStoredRoomRejoinDelayMs
} from "./_lib/room-reconnect";
import {
  DEVICE_KIND_LABELS,
  MATCH_RULE_DETAILS,
  PROMPT_CATEGORY_LABELS,
  getPlayerDeviceLabel,
  getPlayerConnectionLabel,
  getPlayerRoleLabel
} from "./_lib/ui-labels";
import {
  applyPlayerSettingsToDocument,
  DEFAULT_PLAYER_SETTINGS,
  loadPlayerSettings,
  persistPlayerSettings,
  type PlayerSettings
} from "../lib/player-settings";
import {
  loadGuestSession,
  persistGuestSession,
  touchGuestSession,
  type GuestSession
} from "../lib/guest-session";
import { playCountdownSound, playTypingSound, primeSoundPlayback } from "../lib/sound";
import {
  DAILY_CHALLENGE_MAX_ATTEMPTS,
  consumeDailyChallengeAttempt,
  getVisibleDailyChallengeRecord,
  loadDailyChallengeRecord,
  recordDailyChallengeAttempt,
  type DailyChallengeRecord
} from "../lib/daily-challenge";
import {
  formatMistakeTarget,
  loadMistakeTrendRecord,
  persistMistakeTrendRecord,
  updateMistakeTrendRecord,
  type MistakeTrendRecord
} from "../lib/mistake-trends";

type ClientSocket = RealtimeSocket;

type StoredRoomRecoveryState = {
  status: "idle" | "reconnecting" | "failed";
  message: string;
};

type HomeMode = "battle" | "solo";
type ExitRequest = "room" | "practice";

const REALTIME_TRANSPORT: RealtimeTransport = "cloudflare";
const CLOUDFLARE_REALTIME_URL = process.env.NEXT_PUBLIC_CLOUDFLARE_REALTIME_URL?.trim() ?? "";
const REALTIME_UNAVAILABLE_MESSAGE = "Realtime transport is not configured.";
const ROOM_CODE_KEY = "type-battle:room-code";

export default function HomePage() {
  const socketRef = useRef<ClientSocket | null>(null);
  const [socketMode, setSocketMode] = useState<"practice" | "room" | null>(null);
  const settingsRef = useRef(DEFAULT_PLAYER_SETTINGS);
  const nicknameRef = useRef(DEFAULT_PLAYER_SETTINGS.nickname);
  const nicknameInputRef = useRef<HTMLInputElement | null>(null);
  const countdownSecondRef = useRef<number | null>(null);
  const typingInputRef = useRef<HTMLTextAreaElement | null>(null);
  const exitTriggerRef = useRef<HTMLElement | null>(null);
  const [connected, setConnected] = useState(false);
  const [guestSession, setGuestSession] = useState<GuestSession | null>(null);
  const [playerId, setPlayerId] = useState("");
  const [settings, setSettings] = useState<PlayerSettings>(DEFAULT_PLAYER_SETTINGS);
  const [settingsHydrated, setSettingsHydrated] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [matchSettingsOpen, setMatchSettingsOpen] = useState(false);
  const [exitRequest, setExitRequest] = useState<ExitRequest | null>(null);
  const [homeMode, setHomeMode] = useState<HomeMode | null>(null);
  const [accessoryIndex, setAccessoryIndex] = useState(0);
  const [joinCode, setJoinCode] = useState("");
  const [room, setRoom] = useState<RoomState | null>(null);
  const [remoteReaction, setRemoteReaction] = useState<{ playerId: string; reaction: QuickReaction } | null>(null);
  const [result, setResult] = useState<MatchResult | null>(null);
  const [practiceSession, setPracticeSession] = useState<PracticeSession | null>(null);
  const [practiceResult, setPracticeResult] = useState<MatchResult | null>(null);
  const [practiceCategory, setPracticeCategory] = useState<PromptCategory>("standard");
  const [dailyChallengeRecord, setDailyChallengeRecord] = useState<DailyChallengeRecord | null>(null);
  const [dailyAttemptConsumed, setDailyAttemptConsumed] = useState(false);
  const [mistakeTrendRecord, setMistakeTrendRecord] = useState<MistakeTrendRecord | null>(null);
  const [error, setError] = useState("");
  const [rematchPending, setRematchPending] = useState(false);
  const [rematchError, setRematchError] = useState("");
  const [storedRoomRecovery, setStoredRoomRecovery] = useState<StoredRoomRecoveryState>({
    status: "idle",
    message: ""
  });
  const [countdownMs, setCountdownMs] = useState(0);
  const [matchTimerMs, setMatchTimerMs] = useState(0);
  const [syncClock, setSyncClock] = useState(() => Date.now());
  const [lastProgressSentAt, setLastProgressSentAt] = useState<number | null>(null);
  const [localProgress, setLocalProgress] = useState<ProgressState>(createEmptyProgress());
  const [roomFinishPending, setRoomFinishPending] = useState(false);
  const [practiceProgress, setPracticeProgress] = useState<ProgressState>(createEmptyProgress());
  const [inputMode, setInputMode] = useState<"kana" | "romaji">("romaji");
  const [inputModeInitialized, setInputModeInitialized] = useState(false);
  const [localRealtimeUrl, setLocalRealtimeUrl] = useState("");
  const localProgressRef = useRef<ProgressState>(createEmptyProgress());
  const roomFinishPendingRef = useRef(false);
  const practiceProgressRef = useRef<ProgressState>(createEmptyProgress());
  const inputModeRef = useRef<"kana" | "romaji">("romaji");
  const dailyAttemptConsumedRef = useRef(false);
  const inputSequenceRef = useRef(0);
  const roomRef = useRef<RoomState | null>(null);
  const resultRef = useRef<MatchResult | null>(null);
  const guestSessionRef = useRef<GuestSession | null>(null);
  const socketModeRef = useRef<"practice" | "room" | null>(null);
  const storedRoomCodeRef = useRef<string | null>(null);
  const storedRoomJoinInFlightRef = useRef(false);
  const storedRoomJoinAttemptsRef = useRef(0);
  const storedRoomRetryTimerRef = useRef<number | null>(null);
  const autoStartRoomRef = useRef<string | null>(null);
  const attemptStoredRoomJoinRef = useRef<(socket: ClientSocket) => void>(() => undefined);
  const realtimeUrl = CLOUDFLARE_REALTIME_URL || localRealtimeUrl;
  const realtimeConfigured = realtimeUrl.length > 0;
  const guestId = guestSession?.guestId ?? "";
  const sessionId = guestSession?.sessionId ?? "";

  const nickname = settings.nickname;
  const setNickname = (next: string) => {
    nicknameRef.current = next;
    setSettings((s) => ({ ...s, nickname: next }));
  };

  const currentPlayer = useMemo(
    () => room?.players.find((player) => player.id === playerId) ?? null,
    [playerId, room]
  );
  const [dailyChallengeNow, setDailyChallengeNow] = useState(() => new Date());
  const homePageViewModel = useMemo(
    () =>
      getHomePageViewModel({
        now: Date.now(),
        room,
        playerId,
        currentPlayer,
        result,
        practiceSession,
        practiceResult,
        dailyChallengeNow,
        dailyChallengeRecord,
        mistakeTrendRecord,
        localProgress,
        practiceProgress,
        connected,
        lastProgressSentAt,
        syncClock,
        matchTimerMs,
        inputMode,
        inputModeInitialized,
        roomFinishPending
      }),
    [
      room,
      playerId,
      currentPlayer,
      result,
      practiceSession,
      practiceResult,
      dailyChallengeNow,
      dailyChallengeRecord,
      mistakeTrendRecord,
      localProgress,
      practiceProgress,
      connected,
      lastProgressSentAt,
      syncClock,
      matchTimerMs,
      inputMode,
      inputModeInitialized,
      roomFinishPending
    ]
  );
  const {
    activeResult,
    activePrompt,
    activePromptText,
    activeInputDeviceKind,
    dailyChallengeInfo,
    dailyChallengePrompt,
    visibleDailyChallengeRecord,
    activePracticeMode,
    mistakeTrendSummary,
    mistakeTrendTotal,
    activeRomajiTypingPlan,
    activeTypingText,
    isRoomPlaying,
    isPracticePlaying,
    activeProgress,
    isTimeAttackPlaying,
    activeGuideProgressIndex,
    activeProgressPercent,
    activeWpm,
    activeAccuracy,
    activeResultPlayer,
    isTimeAttackExpired,
    activeTimeAttackRemainingSeconds,
    acceptingTextInput,
    progressSyncState,
    displayRoom,
    typingInputKey
  } = homePageViewModel;

  useLayoutEffect(() => {
    const nextMode = activeInputDeviceKind === "mobile" ? "kana" : "romaji";
    inputModeRef.current = nextMode;
    setInputMode(nextMode);
    setInputModeInitialized(true);
  }, [activeInputDeviceKind, activePrompt?.id, practiceSession?.practiceId, room?.roomCode]);

  const setPromptCategory = useCallback(
    (category: "short" | "standard" | "long") => {
      if (!room || !socketRef.current || !currentPlayer?.isHost) {
        return;
      }

      socketRef.current.emit("room:setPromptCategory", { roomCode: room.roomCode, category }, (response) => {
        if (!response.ok) {
          setError(response.error);
        }
      });
    },
    [room, currentPlayer]
  );

  const setBotDifficulty = useCallback(
    (difficulty: "easy" | "normal" | "hard") => {
      if (!room || !socketRef.current || !currentPlayer?.isHost) {
        return;
      }

      socketRef.current.emit("room:setBotDifficulty", { roomCode: room.roomCode, difficulty }, (response) => {
        if (!response.ok) {
          setError(response.error);
        }
      });
    },
    [room, currentPlayer]
  );

  const setMatchRule = useCallback(
    (rule: MatchRule) => {
      if (!room || !socketRef.current || !currentPlayer?.isHost) {
        return;
      }

      socketRef.current.emit("room:setMatchRule", { roomCode: room.roomCode, rule }, (response) => {
        if (!response.ok) {
          setError(response.error);
        }
      });
    },
    [room, currentPlayer]
  );

  const clearPracticeState = useCallback(() => {
    setPracticeSession(null);
    setPracticeResult(null);
    setPracticeProgress(createEmptyProgress());
    practiceProgressRef.current = createEmptyProgress();
  }, []);

  const recordMistakeSamples = useCallback(
    (samples: MistakeSample[]) => {
      if (!settingsHydrated || samples.length === 0) {
        return;
      }

      setMistakeTrendRecord((current) => updateMistakeTrendRecord(current, samples));
    },
    [settingsHydrated]
  );

  const resetTyping = useCallback(() => {
    setLocalProgress(createEmptyProgress());
    localProgressRef.current = createEmptyProgress();
    roomFinishPendingRef.current = false;
    setRoomFinishPending(false);
    inputSequenceRef.current = 0;
    resultRef.current = null;
    setResult(null);
    setLastProgressSentAt(null);
  }, []);

  useEffect(() => {
    if (currentPlayer?.accessoryIndex !== undefined) {
      setAccessoryIndex(currentPlayer.accessoryIndex);
    }
  }, [currentPlayer?.accessoryIndex]);

  const prepareTypingInput = useCallback(() => {
    typingInputRef.current?.focus({ preventScroll: true });
  }, []);

  const updateGuestSession = useCallback(() => {
    setGuestSession((current) => {
      if (!current) {
        return current;
      }

      return touchGuestSession(current);
    });
  }, []);

  useLayoutEffect(() => {
    roomRef.current = room;
    resultRef.current = result;
  }, [result, room]);

  useEffect(() => {
    guestSessionRef.current = guestSession;
  }, [guestSession]);

  useEffect(() => {
    socketModeRef.current = socketMode;
  }, [socketMode]);

  const attachSocketHandlers = useCallback((socket: ClientSocket) => {
    const applyRoomSnapshot = (nextRoom: RoomState, beforeApply?: () => void) => {
      const resolution = resolveRoomSnapshot(roomRef.current, resultRef.current, nextRoom);
      if (!resolution.accepted) {
        return false;
      }
      beforeApply?.();
      roomRef.current = resolution.room;
      resultRef.current = resolution.result;
      setRoom(resolution.room);
      setResult(resolution.result);

      if (nextRoom.status === "finished" || resolution.result) {
        typingInputRef.current?.blur();
      }
      return true;
    };

    socket.on("connect", () => {
      if (socketRef.current !== socket) {
        return;
      }

      setConnected(true);
      const currentRoom = roomRef.current;
      const currentSession = guestSessionRef.current;

      if (socketModeRef.current !== "room") {
        return;
      }

      if (!currentRoom || !currentSession) {
        attemptStoredRoomJoinRef.current(socket);
        return;
      }

      socket.emit(
        "room:join",
        {
          roomCode: currentRoom.roomCode,
          nickname: normalizeNickname(nicknameRef.current),
          guestId: currentSession.guestId,
          sessionId: currentSession.sessionId,
          deviceKind: detectDeviceKind()
        },
        (response) => {
          if (!response.ok) {
            setError(response.error);
            return;
          }

          setPlayerId(response.data.playerId);
          applyRoomSnapshot(response.data.room, resetTyping);
        }
      );
    });
    socket.on("disconnect", () => {
      if (socketRef.current !== socket) {
        return;
      }

      setConnected(fals׍7��$z{-���jםan>ミス傾向</span>
                <small>{mistakeTrendTotal} 件</small>
              </div>
              <small>{mistakeTrendSummary.length > 0 ? "上位 5 件" : "未記録"}</small>
            </div>
            {mistakeTrendSummary.length === 0 ? (
              <p className="mistakeTrendEmpty">まだミスの記録がありません。</p>
            ) : (
              <div className="mistakeTrendList">
                {mistakeTrendSummary.map((item) => {
                  const maxCount = mistakeTrendSummary[0]?.count ?? 1;
                  const barWidth = Math.max((item.count / (maxCount + 1)) * 100, item.count > 0 ? 12 : 0);
                  const dominantWrongInputLabel =
                    item.dominantWrongInput && item.dominantWrongInputCount > 0
                      ? `誤入力 ${formatMistakeTarget(item.dominantWrongInput)} ×${item.dominantWrongInputCount}`
                      : "誤入力なし";

                  return (
                    <div className="mistakeTrendRow" key={item.expectedChar}>
                      <div className="mistakeTrendRowTop">
                        <div className="mistakeTrendLabel">
                          <strong>{formatMistakeTarget(item.expectedChar)}</strong>
                          <small>{dominantWrongInputLabel}</small>
                        </div>
                        <span className="mistakeTrendCount">{item.count}</span>
                      </div>
                      <div className="mistakeTrendBarTrack" aria-hidden="true">
                        <div className="mistakeTrendBarFill" style={{ width: `${barWidth}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
          ) : null}

          {!room && homeMode === "solo" ? (
            <div className="difficultySelector">
              <span>練習モード</span>
              <div className="difficultyButtons">
                {(["short", "standard", "long"] as const).map((category) => (
                  <button
                    key={category}
                    className={practiceCategory === category ? "active" : ""}
                    type="button"
                    onClick={() => setPracticeCategory(category)}
                    disabled={!realtimeConfigured || Boolean(practiceSession && !practiceResult)}
                  >
                    {PROMPT_CATEGORY_LABELS[category]}
                  </button>
                ))}
              </div>
              <button
                className="secondaryButton"
                type="button"
                onClick={startPractice}
                disabled={!realtimeConfigured || Boolean(practiceSession && !practiceResult)}
              >
                <Swords size={18} />
                {practiceSession && !practiceResult
                  ? "練習中"
                  : practiceResult
                    ? "もう一度練習"
                    : "練習を開始"}
              </button>
            </div>
          ) : null}

          <div className="panelLinks">
            <Link className="secondaryButton" href="/feedback">
              不具合を報告
            </Link>
          </div>

          {error ? <p className="errorText">{error}</p> : null}

          {room && room.status !== "waiting" ? (
            <div className="playerList">
              {room.players.map((player) => (
                <div className="playerRow" key={player.id}>
                  <PlayerIdentity
                    nickname={player.nickname}
                    kind={player.isBot ? "com" : player.id === playerId ? "you" : player.id === room.hostPlayerId ? "one" : "two"}
                    slot={player.id === room.hostPlayerId ? "1P" : "2P"}
                    meta={`${getPlayerRoleLabel(player)} / ${getPlayerDeviceLabel(player)}`}
                    compact
                  />
                  <small>{getPlayerConnectionLabel(player)}</small>
                </div>
              ))}
            </div>
          ) : null}

          {room && room.status !== "waiting" ? (
            <p className="infoText">
              端末の組み合わせ: <strong>{getMatchupLabel(room.players)}</strong>
            </p>
          ) : null}

          {room && room.status !== "waiting" ? (
            <div className="difficultySelector">
              <span>対戦ルール</span>
              <div className="matchRuleButtons">
                {(["race", "timeAttack", "hpBattle"] as const).map((rule) => (
                  <button
                    key={rule}
                    className={room.matchRule === rule ? "matchRuleButton active" : "matchRuleButton"}
                    type="button"
                    onClick={() => setMatchRule(rule)}
                    disabled={!currentPlayer?.isHost || (room.status !== "waiting" && room.status !== "finished")}
                  >
                    <span className="matchRuleLabel">{MATCH_RULE_DETAILS[rule].label}</span>
                    <span className="matchRuleDescription">{MATCH_RULE_DETAILS[rule].description}</span>
                  </button>
                ))}
              </div>
            </div>
          ) : null}

        </aside>

        <section
          className="matchSurface"
          aria-label="タイピング対戦"
          onPointerDown={(event) => {
            if (!isEditableTarget(event.target)) {
              prepareTypingInput();
            }
          }}
        >
          {room || practiceSession || practiceResult ? (
            <>
              <div className="matchHeader">
                <StatusPill
                  status={
                    room ? (result ? "result" : room.status) : practiceResult ? "result" : "playing"
                  }
                />
              </div>

              {room?.status === "countdown" ? (
                <div className="countdown">{Math.max(1, Math.ceil(countdownMs / 1000))}</div>
              ) : null}

              {room?.status === "waiting" ? (
                <LobbyPrep
                  room={room}
                  localPlayerId={playerId}
                  accessoryIndex={accessoryIndex}
                  onPreviousAccessory={() => shiftAccessory(-1)}
                  onNextAccessory={() => shiftAccessory(1)}
                  onCopyRoomCode={copyRoomCode}
                  onToggleReady={setReady}
                  onMatchRuleChange={setMatchRule}
                  onPromptCategoryChange={setPromptCategory}
                  onBotDifficultyChange={setBotDifficulty}
                  onReaction={sendReaction}
                  remoteReaction={remoteReaction}
                />
              ) : activeResult ? (
                <ResultPanel
                  result={activeResult}
                  localPlayerId={playerId}
                  isRoomResult={Boolean(room)}
                  onRetry={room ? rematch : retryPractice}
                  practiceMode={activePracticeMode}
                  canRetry={!room || Boolean(currentPlayer?.connected)}
                  retryPending={rematchPending}
                  retryError={rematchError}
                  rematchReady={Boolean(currentPlayer?.ready)}
                  onPracticeNext={!room && activePracticeMode === "practice" ? startPractice : undefined}
                  onPracticeMenu={!room ? returnToPracticeMenu : undefined}
                  {...(room ? {
                    accessoryIndex,
                    onPreviousAccessory: () => shiftAccessory(-1),
                    onNextAccessory: () => shiftAccessory(1),
                    onOpenSettings: () => setMatchSettingsOpen(true),
                    onReaction: sendReaction
                  } : {})}
                  {...(room ? { matchRule: activeResult.matchRule ?? room.matchRule } : {})}
                />
              ) : (
                <>
                  {room ? (
                    <BattleStage
                      room={displayRoom ?? room}
                      result={result}
                      localPlayerId={playerId}
                      timeAttackExpired={isTimeAttackExpired}
                      timeAttackRemainingMs={matchTimerMs}
                      matchRemainingMs={matchTimerMs}
                    />
                  ) : practiceSession ? (
                    <PracticeStage progressPercent={activeProgressPercent} mode={activePracticeMode} />
                  ) : null}

              {activePromptText ? (
                <TypingPrompt
                  displayText={activePromptText}
                  inputText={activeTypingText}
                  progressIndex={activeGuideProgressIndex}
                  inputGuideEnabled={settings.inputGuideEnabled}
                  pendingInput={activeProgress.pendingInput}
                  romajiPlan={activeRomajiTypingPlan}
                />
              ) : (
                <div className="emptyState">
                  <Swords size={42} />
                  <p>{room ? (room.players.length < room.maxPlayers ? "対戦相手を待っています" : "開始できます") : "練習を開始してください"}</p>
                </div>
              )}

              {!result ? (
                <TypingInput
                  inputRef={typingInputRef}
                  deviceKind={activeInputDeviceKind}
                  expectedText={activeTypingText}
                  progressIndex={activeGuideProgressIndex}
                  acceptingInput={acceptingTextInput}
                  loop={isTimeAttackPlaying}
                  inputKey={typingInputKey}
                  onTextInput={handleTypedText}
                />
              ) : null}
              {room?.status === "playing" ? (
                <p className="infoText" role="status" aria-live="polite">
                  {getProgressSyncLabel(progressSyncState)}
                </p>
              ) : null}

              <ProgressBlock progressPercent={activeProgressPercent} />

              {room ? (
                <div className="rivalGrid">
                  {(displayRoom?.players ?? room.players).map((player) => (
                    <RivalBar
                      key={player.id}
                      player={player}
                      promptLength={activePrompt ? Array.from(activePrompt.typing.hiragana).length : activeTypingText.length}
                      isSelf={player.id === playerId}
                    />
                  ))}
                </div>
              ) : null}

              <section className={isRoomPlaying ? "statsGrid battleStatsMinimal" : "statsGrid"} aria-label="補助記録">
                {!isRoomPlaying ? <Stat label="WPM" value={isPracticePlaying ? activeWpm : activeResultPlayer?.wpm ?? 0} /> : null}
                {!isRoomPlaying ? (
                  <Stat
                    label="ACC"
                  value={`${
                    isRoomPlaying || isPracticePlaying
                      ? activeAccuracy
                      : activeResultPlayer?.accuracy ?? 100
                  }%`}
                  />
                ) : null}
                <Stat
                  label="MISS"
                  value={
                    isRoomPlaying
                      ? currentPlayer?.mistakes ?? activeProgress.mistakes
                      : isPracticePlaying
                        ? activeProgress.mistakes
                        : activeResultPlayer?.mistakes ?? 0
                  }
                />
                {isRoomPlaying ? <Stat label="ガード" value={currentPlayer?.mistakeGuards ?? 0} /> : null}
                {isTimeAttackPlaying ? <Stat label="残り" value={`${activeTimeAttackRemainingSeconds}s`} /> : null}
                {((currentPlayer?.maxHp ?? activeResultPlayer?.maxHp) !== undefined) ? (
                  <Stat
                    label="HP"
                    value={`${
                      isRoomPlaying || isPracticePlaying ? currentPlayer?.hp ?? 0 : activeResultPlayer?.hp ?? 0
                    }/${currentPlayer?.maxHp ?? activeResultPlayer?.maxHp ?? 0}`}
                  />
                ) : null}
              </section>

                </>
              )}
            </>
          ) : (
            <div className="emptyState large">
              <Swords size={56} />
              <p>ルームを作成、または参加してください</p>
            </div>
          )}
        </section>
      </section>
      )}

      {settingsOpen ? (
        <PlayerSettingsModal
          settings={settings}
          setSettings={setSettings}
          setNickname={setNickname}
          onClose={() => setSettingsOpen(false)}
        />
      ) : null}
      {exitRequest === "room" ? (
        <ExitConfirmationModal
          title="ルームを退出しますか？"
          description={room?.status === "playing" || room?.status === "countdown" ? "試合を退出すると、現在の試合は棄権扱いになります。" : "現在のルームから退出し、ホームへ戻ります。"}
          confirmLabel="退出する"
          onCancel={cancelExitRequest}
          onConfirm={confirmExit}
        />
      ) : exitRequest === "practice" ? (
        <ExitConfirmationModal
          title="練習をやめますか？"
          description="現在の入力途中の記録は保存されず、ひとり用メニューへ戻ります。"
          confirmLabel="練習をやめる"
          onCancel={cancelExitRequest}
          onConfirm={confirmExit}
        />
      ) : null}
      {matchSettingsOpen && room ? (
        <MatchSettingsModal
          room={room}
          onClose={() => setMatchSettingsOpen(false)}
          onMatchRuleChange={setMatchRule}
          onPromptCategoryChange={setPromptCategory}
          onBotDifficultyChange={setBotDifficulty}
          canEdit={Boolean(currentPlayer?.isHost)}
          onResetOfficial={() => {
            setMatchRule("race");
            setPromptCategory("standard");
            setBotDifficulty("normal");
          }}
        />
      ) : null}
    </main>
  );
}

function isEditableTarget(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && target.matches("input, textarea, select, button, a, [role='button'], [contenteditable='true']");
}

function getMatchupLabel(players: RoomState["players"]): string {
  if (players.length === 0) {
    return "";
  }

  const visiblePlayers = players.filter((player) => !player.forfeited).slice(0, 2);

  if (visiblePlayers.length === 0) {
    return "";
  }

  const labels = visiblePlayers.map((player) => {
    if (player.isBot) {
      return DEVICE_KIND_LABELS.desktop;
    }

    return player.deviceKind ? DEVICE_KIND_LABELS[player.deviceKind] : "未設定";
  });

  if (labels.length === 1) {
    return `${labels[0]}で待機中`;
  }

  return `${labels[0] ?? "未設定"}対${labels[1] ?? "未設定"}`;
}
