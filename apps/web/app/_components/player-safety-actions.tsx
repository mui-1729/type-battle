"use client";

import Link from "next/link";
import { Flag, ShieldBan, ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";
import {
  blockPlayer,
  canBlockPlayer,
  isPlayerBlocked,
  unblockPlayer
} from "../../lib/blocked-players";
import { buildPlayerReportHref } from "../../lib/player-safety";
import styles from "./safety-controls.module.css";

type PlayerSafetyActionsProps = {
  playerId: string;
  nickname: string;
  ownPlayerId: string;
  roomCode: string;
  isBot?: boolean;
};

export function PlayerSafetyActions({
  playerId,
  nickname,
  ownPlayerId,
  roomCode,
  isBot = false
}: PlayerSafetyActionsProps) {
  const [blocked, setBlocked] = useState(false);
  const canBlock = !isBot && canBlockPlayer(playerId, ownPlayerId);

  useEffect(() => {
    if (!canBlock) {
      setBlocked(false);
      return;
    }

    setBlocked(isPlayerBlocked(window.localStorage, playerId));
  }, [canBlock, playerId]);

  if (!canBlock) {
    return null;
  }

  const reportHref = buildPlayerReportHref({ roomCode, playerId, nickname });

  return (
    <div className={styles.actions} aria-label={`${nickname}の安全メニュー`}>
      <Link className={`secondaryButton ${styles.action}`} href={reportHref}>
        <Flag size={15} aria-hidden="true" />
        報告する
      </Link>
      <button
        className={`secondaryButton ${styles.action}`}
        type="button"
        aria-pressed={blocked}
        onClick={() => {
          if (blocked) {
            unblockPlayer(window.localStorage, playerId);
            setBlocked(false);
            return;
          }

          blockPlayer(window.localStorage, { id: playerId, nickname });
          setBlocked(true);
        }}
      >
        {blocked ? <ShieldCheck size={15} aria-hidden="true" /> : <ShieldBan size={15} aria-hidden="true" />}
        {blocked ? "ブロック解除" : "ブロック"}
      </button>
    </div>
  );
}
