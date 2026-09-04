import { useCallback, useRef } from 'react';
import { useGame } from '@/app/GameProvider';

/**
 * Tiny Web Audio synth. All sound is generated in the browser - RogueDay ships
 * no audio files and contacts no external service. Muted by default and fully
 * controlled by the sound setting.
 */

export type SoundName =
  | 'click'
  | 'accept'
  | 'complete'
  | 'levelup'
  | 'loot'
  | 'boss'
  | 'defeat'
  | 'error';

interface Tone {
  freq: number;
  duration: number;
  type: OscillatorType;
  delay: number;
  gain: number;
}

const PATTERNS: Record<SoundName, Tone[]> = {
  click: [{ freq: 660, duration: 0.05, type: 'square', delay: 0, gain: 0.05 }],
  accept: [
    { freq: 523, duration: 0.08, type: 'triangle', delay: 0, gain: 0.08 },
    { freq: 784, duration: 0.11, type: 'triangle', delay: 0.07, gain: 0.08 },
  ],
  complete: [
    { freq: 523, duration: 0.1, type: 'triangle', delay: 0, gain: 0.09 },
    { freq: 659, duration: 0.1, type: 'triangle', delay: 0.09, gain: 0.09 },
    { freq: 784, duration: 0.16, type: 'triangle', delay: 0.18, gain: 0.09 },
  ],
  levelup: [
    { freq: 523, duration: 0.11, type: 'sawtooth', delay: 0, gain: 0.07 },
    { freq: 659, duration: 0.11, type: 'sawtooth', delay: 0.1, gain: 0.07 },
    { freq: 784, duration: 0.11, type: 'sawtooth', delay: 0.2, gain: 0.07 },
    { freq: 1047, duration: 0.3, type: 'sawtooth', delay: 0.3, gain: 0.08 },
  ],
  loot: [
    { freq: 880, duration: 0.07, type: 'sine', delay: 0, gain: 0.07 },
    { freq: 1319, duration: 0.14, type: 'sine', delay: 0.06, gain: 0.07 },
  ],
  boss: [
    { freq: 160, duration: 0.14, type: 'sawtooth', delay: 0, gain: 0.09 },
    { freq: 110, duration: 0.22, type: 'sawtooth', delay: 0.1, gain: 0.09 },
  ],
  defeat: [
    { freq: 262, duration: 0.14, type: 'square', delay: 0, gain: 0.08 },
    { freq: 349, duration: 0.14, type: 'square', delay: 0.13, gain: 0.08 },
    { freq: 523, duration: 0.14, type: 'square', delay: 0.26, gain: 0.08 },
    { freq: 698, duration: 0.4, type: 'square', delay: 0.39, gain: 0.09 },
  ],
  error: [{ freq: 180, duration: 0.16, type: 'square', delay: 0, gain: 0.06 }],
};

export function useSound(): (name: SoundName) => void {
  const { state } = useGame();
  const soundOn = state.save.settings.sound;
  const contextRef = useRef<AudioContext | null>(null);

  return useCallback(
    (name: SoundName) => {
      if (!soundOn) return;
      if (typeof window === 'undefined') return;

      const AudioCtor =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtor) return;

      try {
        if (!contextRef.current) contextRef.current = new AudioCtor();
        const ctx = contextRef.current;
        if (ctx.state === 'suspended') void ctx.resume();

        for (const tone of PATTERNS[name]) {
          const oscillator = ctx.createOscillator();
          const gain = ctx.createGain();
          const start = ctx.currentTime + tone.delay;

          oscillator.type = tone.type;
          oscillator.frequency.setValueAtTime(tone.freq, start);

          gain.gain.setValueAtTime(0, start);
          gain.gain.linearRampToValueAtTime(tone.gain, start + 0.012);
          gain.gain.exponentialRampToValueAtTime(0.0001, start + tone.duration);

          oscillator.connect(gain);
          gain.connect(ctx.destination);
          oscillator.start(start);
          oscillator.stop(start + tone.duration + 0.02);
        }
      } catch {
        // Audio is a nice-to-have; never let it break gameplay.
      }
    },
    [soundOn],
  );
}
