"use client";

import { ShieldCheck, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { loadBlockedPlayers, unblockPlayer, type BlockedPlayer } from "../../lib/blocked-players";
import styles from "./safety-controls.module.css";

export function BlockedPlayersSettings() {
  const [players, setPlayers] = useState<BlockedPlayer[]>([]);

  useEffect(() => {
    setPlayers(loadBlockedPlayers(window.localStorage));
  }, []);

  return (
    <div className="fieldGroup settingsGridWide">
      <label><ShieldCheck size={16} aria-hidden="true" /> ブロックしたプレイヤー</label>
      {players.length === 0 ? (
        <p className="modalCopy">ブロックしているプレイヤーはいません。</p>
      ) : (
        <div className={styles.blockedList}>
          {players.map((player) => (
            <div className={styles.blockedRow} key={player.id}>
              <span className={styles.blockedIdentity}>
                <strong>{player.nickname}</strong>
                <small>{player.id}</small>
              </span>
              <button
                className={`secondaryButton ${styles.unblockButton}`}
                type="button"
                onClick={() => setPlayers(unblockPlayer(window.localStorage, player.id))}
              >
                <Trash2 size={15} aria-hidden="true" />
                解除
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
