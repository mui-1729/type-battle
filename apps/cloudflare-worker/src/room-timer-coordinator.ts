export class RoomTimerCoordinator {
  private countdown: ReturnType<typeof setTimeout> | undefined;
  private bot: ReturnType<typeof setInterval> | undefined;
  private persist: ReturnType<typeof setTimeout> | undefined;

  schedulePersist(callback: () => void, delayMs: number): void {
    this.clearPersist();
    this.persist = setTimeout(() => {
      this.persist = undefined;
      callback();
    }, delayMs);
  }

  scheduleCountdown(callback: () => void, delayMs: number): void {
    this.clearMatch();
    this.countdown = setTimeout(() => {
      this.countdown = undefined;
      callback();
    }, delayMs);
  }

  scheduleBot(callback: () => void, intervalMs: number): void {
    this.clearBot();
    this.bot = setInterval(callback, intervalMs);
  }

  clearMatch(): void {
    this.clearCountdown();
    this.clearBot();
  }

  clearPersist(): void {
    if (this.persist !== undefined) {
      clearTimeout(this.persist);
      this.persist = undefined;
    }
  }

  clearAll(): void {
    this.clearMatch();
    this.clearPersist();
  }

  private clearCountdown(): void {
    if (this.countdown !== undefined) {
      clearTimeout(this.countdown);
      this.countdown = undefined;
    }
  }

  private clearBot(): void {
    if (this.bot !== undefined) {
      clearInterval(this.bot);
      this.bot = undefined;
    }
  }
}
