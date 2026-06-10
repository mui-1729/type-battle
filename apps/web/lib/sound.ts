type SoundOptions = {
  enabled: boolean;
};

type ToneOptions = {
  frequency: number;
  durationMs: number;
  volume: number;
  type?: OscillatorType;
};

let audioContext: AudioContext | null = null;

export async function primeSoundPlayback(): Promise<void> {
  const context = getAudioContext();

  if (!context) {
    return;
  }

  if (context.state === "suspended") {
    try {
      await context.resume();
    } catch {
      // Browser autoplay policies can still refuse resume; sound calls will no-op.
    }
  }
}

export async function playTypingSound(options: SoundOptions, correct: boolean): Promise<void> {
  if (!options.enabled) {
    return;
  }

  await primeSoundPlayback();
  playTone({
    frequency: correct ? 680 : 220,
    durationMs: correct ? 45 : 70,
    volume: correct ? 0.04 : 0.02,
    type: correct ? "sine" : "triangle"
  });
}

export async function playCountdownSound(options: SoundOptions, remainingSeconds: number): Promise<void> {
  if (!options.enabled) {
    return;
  }

  await primeSoundPlayback();
  playTone({
    frequency: remainingSeconds <= 1 ? 980 : remainingSeconds === 2 ? 880 : 760,
    durationMs: 60,
    volume: 0.035,
    type: "square"
  });
}

function getAudioContext(): AudioContext | null {
  if (typeof window === "undefined") {
    return null;
  }

  const Context = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;

  if (!Context) {
    return null;
  }

  if (!audioContext) {
    audioContext = new Context();
  }

  return audioContext;
}

function playTone(options: ToneOptions): void {
  const context = getAudioContext();

  if (!context) {
    return;
  }

  const oscillator = context.createOscillator();
  const gain = context.createGain();
  const now = context.currentTime;
  const durationSeconds = options.durationMs / 1000;

  oscillator.type = options.type ?? "sine";
  oscillator.frequency.value = options.frequency;
  gain.gain.value = 0;

  oscillator.connect(gain);
  gain.connect(context.destination);

  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(options.volume, now + 0.004);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + durationSeconds);

  oscillator.start(now);
  oscillator.stop(now + durationSeconds + 0.02);

  oscillator.onended = () => {
    oscillator.disconnect();
    gain.disconnect();
  };
}
