import { describe, expect, it } from "vitest";
import { buildPlayerReportHref, buildPlayerReportIssueUrl } from "../lib/player-safety";

describe("player safety report links", () => {
  it("passes room and opponent context to the feedback page", () => {
    const href = buildPlayerReportHref({
      roomCode: "ABC234",
      playerId: "guest_rival",
      nickname: "相手 Player"
    });
    const url = new URL(href, "https://type-battle.example");

    expect(url.pathname).toBe("/feedback");
    expect(url.searchParams.get("kind")).toBe("player-report");
    expect(url.searchParams.get("roomCode")).toBe("ABC234");
    expect(url.searchParams.get("opponentId")).toBe("guest_rival");
    expect(url.searchParams.get("opponentNickname")).toBe("相手 Player");
  });

  it("prepares a GitHub issue draft without submitting it", () => {
    const issueUrl = buildPlayerReportIssueUrl({
      roomCode: "ABC234",
      opponentId: "guest_rival",
      opponentNickname: "Rival",
      occurredAt: "2026-08-20T00:00:00.000Z",
      reason: "不適切なニックネーム"
    });
    const url = new URL(issueUrl);
    const body = url.searchParams.get("body") ?? "";

    expect(url.origin).toBe("https://github.com");
    expect(url.pathname).toBe("/mui-1729/type-battle/issues/new");
    expect(url.searchParams.get("title")).toContain("不適切なニックネーム");
    expect(body).toContain("room: ABC234");
    expect(body).toContain("opponent id: guest_rival");
    expect(body).toContain("occurred at: 2026-08-20T00:00:00.000Z");
  });
});
