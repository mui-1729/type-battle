import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RoomTimerCoordinator } from "../src/room-timer-coordinator.js";

describe("RoomTimerCoordinator", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("debounces persistence and runs only the latest callback", () => {
    const timers = new RoomTimerCoordinator();
    const first = vi.fn();
    const latest = vi.fn();

    timers.schedulePersist(first, 1_000);
    vi.advanceTimersByTime(500);
    timers.schedulePersist(latest, 1_000);
    vi.advanceTimersByTime(1_000);

    expect(first).not.toHaveBeenCalled();
    expect(latest).toHaveBeenCalledTimes(1);
  });

  it("replacing a countdown also clears the previous bot interval", () => {
    const timers = new RoomTimerCoordinator();
    const botTick = vi.fn();
    const countdown = vi.fn();

    timers.scheduleBot(botTick, 100);
    vi.advanceTimersByTime(100);
    expect(botTick).toHaveBeenCalledTimes(1);

    timers.scheduleCountdown(countdown, 500);
    vi.advanceTimersByTime(500);

    expect(countdown).toHaveBeenCalledTimes(1);
    expect(botTick).toHaveBeenCalledTimes(1);
  });

  it("replaces a bot interval without leaking the previous round", () => {
    const timers = new RoomTimerCoordinator();
    const previousRound = vi.fn();
    const nextRound = vi.fn();

    timers.scheduleBot(previousRound, 100);
    vi.advanceTimersByTime(100);
    timers.scheduleBot(nextRound, 100);
    vi.advanceTimersByTime(300);

    expect(previousRound).toHaveBeenCalledTimes(1);
    expect(nextRound).toHaveBeenCalledTimes(3);
  });

  it("clearAll cancels match and persistence callbacks", () => {
    const timers = new RoomTimerCoordinator();
    const countdown = vi.fn();
    const bot = vi.fn();
    const persist = vi.fn();

    timers.scheduleCountdown(countdown, 100);
    timers.scheduleBot(bot, 100);
    timers.schedulePersist(persist, 100);
    timers.clearAll();
    vi.advanceTimersByTime(500);

    expect(countdown).not.toHaveBeenCalled();
    expect(bot).not.toHaveBeenCalled();
    expect(persist).not.toHaveBeenCalled();
  });
});
