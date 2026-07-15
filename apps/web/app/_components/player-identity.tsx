import type { ReactNode } from "react";

export type PlayerIdentityKind = "you" | "one" | "two" | "com";

type PlayerIdentityProps = {
  nickname: string;
  kind: PlayerIdentityKind;
  slot: "1P" | "2P";
  meta?: ReactNode;
  compact?: boolean;
};

const KIND_LABELS: Record<PlayerIdentityKind, string> = {
  you: "YOU",
  one: "1P",
  two: "2P",
  com: "COM"
};

export function PlayerIdentity({ nickname, kind, slot, meta, compact = false }: PlayerIdentityProps) {
  return (
    <div className={`playerIdentity playerIdentity-${kind}${compact ? " isCompact" : ""}`} data-player-role={kind}>
      <span className="playerIdentityMark" aria-hidden="true">
        {kind === "com" ? "✦" : kind === "you" ? "●" : kind === "one" ? "▲" : "◆"}
      </span>
      <span className="playerIdentityCopy">
        <span className="playerIdentityRole">
          {KIND_LABELS[kind]}
          <span className="playerIdentitySlot">{slot}</span>
        </span>
        <strong title={nickname}>{nickname}</strong>
        {meta ? <span className="playerIdentityMeta">{meta}</span> : null}
      </span>
    </div>
  );
}
