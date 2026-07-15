import { calculateProgress, type RoomState } from "@type-battle/shared";
import { PlayerIdentity } from "./player-identity";

type RivalBarProps = {
  player: RoomState["players"][number];
  promptLength: number;
  isSelf: boolean;
};

export function RivalBar({ player, promptLength, isSelf }: RivalBarProps) {
  const progress = calculateProgress(player.progressIndex, promptLength);
  const isForfeited = player.forfeited;
  const isDisconnected = !player.connected && !player.isBot;
  const hpLabel =
    player.maxHp !== undefined ? `HP ${player.hp ?? 0}/${player.maxHp}` : `${progress}%`;

  return (
    <div className={isSelf ? "rivalBar isSelf" : "rivalBar"}>
      <div className="rivalInfo">
        <PlayerIdentity nickname={player.nickname} kind={player.isBot ? "com" : isSelf ? "you" : player.isHost ? "one" : "two"} slot={player.isHost ? "1P" : "2P"} compact />
        {isForfeited ? (
          <span className="statusTag isForfeited">棄権</span>
        ) : isDisconnected ? (
          <span className="statusTag isDisconnected">再接続中...</span>
        ) : (
          <span>{hpLabel}</span>
        )}
      </div>
      <div className="miniTrack" role="progressbar" aria-label={`${player.nickname}'s progress`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress}>
        <span style={{ width: `${progress}%` }} className={isForfeited ? "isForfeited" : ""} />
      </div>
    </div>
  );
}
