import { calculateProgress, type RoomState } from "@type-battle/shared";

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
        <strong>{player.nickname}</strong>
        {isForfeited ? (
          <span className="statusTag isForfeited">棄権</span>
        ) : isDisconnected ? (
          <span className="statusTag isDisconnected">再接続中...</span>
        ) : (
          <span>{hpLabel}</span>
        )}
      </div>
      <div className="miniTrack">
        <span style={{ width: `${progress}%` }} className={isForfeited ? "isForfeited" : ""} />
      </div>
    </div>
  );
}
