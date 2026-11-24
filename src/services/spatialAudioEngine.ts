/**
 * MindAtlas 3D — Spatial Procedural Web Audio Synthesizer
 * 
 * Synthesizes 100% mathematical, zero-asset cybernetic audio telemetry
 * using the browser's native Web Audio API (OscillatorNode, GainNode, BiquadFilterNode).
 * 
 * Strict TypeScript with zero 'any' and zero external audio asset dependencies.
 */

interface WebkitWindow extends Window {
  webkitAudioContext?: typeof AudioContext;
}

class SpatialAudioEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private ambientGain: GainNode | null = null;
  private ambientOscillators: OscillatorNode[] = [];
  private ambientFilter: BiquadFilterNode | null = null;
  private muted: boolean = false;
  private ambientActive: boolean = false;

  // -28 dB target level: 10^(-28 / 20) ≈ 0.0398
  private readonly AMBIENT_TARGET_GAIN = 0.0398;

  /**
   * Lazily initializes and safely resumes AudioContext on user interaction.
   * Handles autoplay policies across modern desktop and mobile browsers.
   */
  public initAudioContext(): AudioContext | null {
    if (typeof window === 'undefined') {
      return null;
    }

    if (!this.ctx || this.ctx.state === 'closed') {
      const AudioCtxConstructor =
        window.AudioContext ||
        (window as unknown as WebkitWindow).webkitAudioContext;

      if (!AudioCtxConstructor) {
        console.warn('[SpatialAudioEngine] Web Audio API is not supported in this environment.');
        return null;
      }

      this.ctx = new AudioCtxConstructor();

      // Master output bus
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.setValueAtTime(this.muted ? 0.0001 : 1.0, this.ctx.currentTime);
      this.masterGain.connect(this.ctx.destination);
    }

    if (this.ctx.state === 'suspended') {
      this.ctx.resume().catch((err: unknown) => {
        console.debug('[SpatialAudioEngine] AudioContext resume waiting for user interaction:', err);
      });
    }

    return this.ctx;
  }

  /**
   * High-tech sine/triangle blip with pitch dynamically scaled by region & elevation.
   * Requirement 4.1: Region-mapped harmonic frequency scaling.
   * 
   * @param elevation - Y-axis spatial altitude or normalized height value
   * @param region - Region name to anchor fundamental acoustic tuning
   */
  public playHoverBlip(elevation?: number, region?: string): void {
    if (this.muted) return;
    const ctx = this.initAudioContext();
    if (!ctx || !this.masterGain) return;

    const now = ctx.currentTime;

    // Region-specific fundamental root tuning (Requirement 4.1)
    let regionRoot = 523.25; // C5 default
    if (region) {
      const lower = region.toLowerCase();
      if (lower.includes('frontend')) {
        regionRoot = 523.25; // C5 - bright, crisp cyan tone
      } else if (lower.includes('backend')) {
        regionRoot = 440.0; // A4 - grounded, architectural emerald tone
      } else if (lower.includes('ai') || lower.includes('neural')) {
        regionRoot = 659.25; // E5 - ethereal, synaptic violet tone
      } else if (lower.includes('cyber') || lower.includes('security')) {
        regionRoot = 392.0; // G4 - fortified, resonant crimson tone
      }
    }

    // Pitch mapping formula: elevation offset around region root (+- 150Hz)
    let elevOffset = 0;
    if (elevation !== undefined) {
      if (elevation >= 0 && elevation <= 1) {
        elevOffset = (elevation - 0.5) * 200;
      } else {
        elevOffset = Math.max(-100, Math.min(200, (elevation - 1.5) * 25));
      }
    }
    const targetFreq = Math.max(280, Math.min(1100, regionRoot + elevOffset));

    // Dual-stage synthesis: crisp sine with subtle triangle transient
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const filter = ctx.createBiquadFilter();

    osc.type = 'triangle';
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(2200, now);

    // Subtle pitch drop at transient start creates tactile tactile pop
    osc.frequency.setValueAtTime(targetFreq * 1.08, now);
    osc.frequency.exponentialRampToValueAtTime(targetFreq, now + 0.015);

    // Fast envelope: 3ms attack, 50ms exponential decay
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(0.14, now + 0.003);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.055);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);

    osc.start(now);
    osc.stop(now + 0.06);

    // Garbage collection cleanup
    setTimeout(() => {
      osc.disconnect();
      filter.disconnect();
      gain.disconnect();
    }, 80);
  }

  /**
   * Clean 2-note futuristic confirmation chime.
   * Note 1: E5 (659.25 Hz) -> Note 2: A5 (880.00 Hz)
   */
  public playSelectTone(): void {
    if (this.muted) return;
    const ctx = this.initAudioContext();
    if (!ctx || !this.masterGain) return;

    const now = ctx.currentTime;

    const notes: Array<{ freq: number; start: number; dur: number; peak: number }> = [
      { freq: 659.25, start: 0.0, dur: 0.09, peak: 0.16 }, // E5
      { freq: 880.0, start: 0.065, dur: 0.22, peak: 0.20 },  // A5
    ];

    notes.forEach((note) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const filter = ctx.createBiquadFilter();

      osc.type = 'sine';
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(3200, now + note.start);

      osc.frequency.setValueAtTime(note.freq, now + note.start);

      const noteStart = now + note.start;
      const noteEnd = noteStart + note.dur;

      gain.gain.setValueAtTime(0.0001, noteStart);
      gain.gain.linearRampToValueAtTime(note.peak, noteStart + 0.004);
      gain.gain.exponentialRampToValueAtTime(0.0001, noteEnd);

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(this.masterGain!);

      osc.start(noteStart);
      osc.stop(noteEnd + 0.01);

      setTimeout(() => {
        osc.disconnect();
        filter.disconnect();
        gain.disconnect();
      }, (note.start + note.dur + 0.05) * 1000);
    });
  }

  /**
   * Rich ascending arpeggio chord fanfare with warm gain envelope.
   * Chords: C5 (523.25) -> E5 (659.25) -> G5 (783.99) -> B5 (987.77) -> D6 (1174.66)
   * With optional higher shimmer note for multi-node unlocking streaks.
   * 
   * @param unlockedCount - Optional number of newly unlocked nodes to enrich harmonics
   */
  public playCompleteFanfare(unlockedCount?: number): void {
    if (this.muted) return;
    const ctx = this.initAudioContext();
    if (!ctx || !this.masterGain) return;

    const now = ctx.currentTime;

    const arpeggio = [
      { freq: 523.25, offset: 0.00, dur: 0.70, gain: 0.18 }, // C5
      { freq: 659.25, offset: 0.08, dur: 0.75, gain: 0.19 }, // E5
      { freq: 783.99, offset: 0.16, dur: 0.85, gain: 0.21 }, // G5
      { freq: 987.77, offset: 0.24, dur: 0.95, gain: 0.22 }, // B5
      { freq: 1174.66, offset: 0.32, dur: 1.15, gain: 0.24 }, // D6
    ];

    if (unlockedCount !== undefined && unlockedCount > 1) {
      // Extra celestial overtone shimmer note for major milestones
      arpeggio.push({ freq: 1567.98, offset: 0.40, dur: 1.35, gain: 0.20 }); // G6
    }

    arpeggio.forEach((step) => {
      const noteStart = now + step.offset;
      const noteEnd = noteStart + step.dur;

      // Primary warm body oscillator
      const oscPrimary = ctx.createOscillator();
      oscPrimary.type = 'sine';
      oscPrimary.frequency.setValueAtTime(step.freq, noteStart);

      // Subtle warm detuned triangle overtone (+4 cents)
      const oscWarmth = ctx.createOscillator();
      oscWarmth.type = 'triangle';
      oscWarmth.frequency.setValueAtTime(step.freq * Math.pow(2, 4 / 1200), noteStart);

      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(2600, noteStart);
      filter.frequency.exponentialRampToValueAtTime(1400, noteEnd);

      const noteGain = ctx.createGain();
      noteGain.gain.setValueAtTime(0.0001, noteStart);
      noteGain.gain.linearRampToValueAtTime(step.gain, noteStart + 0.015);
      noteGain.gain.exponentialRampToValueAtTime(0.0001, noteEnd);

      oscPrimary.connect(filter);
      oscWarmth.connect(filter);
      filter.connect(noteGain);
      noteGain.connect(this.masterGain!);

      oscPrimary.start(noteStart);
      oscPrimary.stop(noteEnd + 0.02);
      oscWarmth.start(noteStart);
      oscWarmth.stop(noteEnd + 0.02);

      setTimeout(() => {
        oscPrimary.disconnect();
        oscWarmth.disconnect();
        filter.disconnect();
        noteGain.disconnect();
      }, (step.offset + step.dur + 0.1) * 1000);
    });
  }

  /**
   * Low-frequency damped buzz indicating prerequisites are missing.
   * 120Hz damped buzz with lowpass filter resonance.
   */
  public playLockedDenialTone(): void {
    if (this.muted) return;
    const ctx = this.initAudioContext();
    if (!ctx || !this.masterGain) return;

    const now = ctx.currentTime;

    // Dual micro-pulses (120Hz -> 85Hz) with sharp damped decay
    const pulses = [
      { start: 0.00, dur: 0.09, startFreq: 125, endFreq: 90, peak: 0.26 },
      { start: 0.10, dur: 0.12, startFreq: 110, endFreq: 75, peak: 0.24 },
    ];

    pulses.forEach((pulse) => {
      const pStart = now + pulse.start;
      const pEnd = pStart + pulse.dur;

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const filter = ctx.createBiquadFilter();

      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(pulse.startFreq, pStart);
      osc.frequency.exponentialRampToValueAtTime(pulse.endFreq, pEnd);

      // Lowpass filter damps harsh harmonics into an authoritative hollow buzz
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(420, pStart);
      filter.Q.setValueAtTime(2.5, pStart);

      gain.gain.setValueAtTime(0.0001, pStart);
      gain.gain.linearRampToValueAtTime(pulse.peak, pStart + 0.005);
      gain.gain.exponentialRampToValueAtTime(0.0001, pEnd);

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(this.masterGain!);

      osc.start(pStart);
      osc.stop(pEnd + 0.01);

      setTimeout(() => {
        osc.disconnect();
        filter.disconnect();
        gain.disconnect();
      }, (pulse.start + pulse.dur + 0.05) * 1000);
    });
  }

  /**
   * Swept resonant bandpass white noise filter sweep representing fog clearing.
   * Procedurally generates a noise buffer and dynamically sweeps a bandpass filter
   * across 250Hz -> 2800Hz -> 800Hz with high resonance.
   */
  public playUnlockWhoosh(): void {
    if (this.muted) return;
    const ctx = this.initAudioContext();
    if (!ctx || !this.masterGain) return;

    const now = ctx.currentTime;
    const duration = 0.95;

    // Generate procedural white noise buffer in memory (zero audio asset files)
    const sampleRate = ctx.sampleRate;
    const bufferSize = Math.floor(sampleRate * duration);
    const noiseBuffer = ctx.createBuffer(1, bufferSize, sampleRate);
    const outputChannel = noiseBuffer.getChannelData(0);

    for (let i = 0; i < bufferSize; i++) {
      outputChannel[i] = Math.random() * 2 - 1;
    }

    const noiseSource = ctx.createBufferSource();
    noiseSource.buffer = noiseBuffer;

    // Resonant bandpass filter sweeping from low to high then descending
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.Q.setValueAtTime(4.2, now);
    filter.frequency.setValueAtTime(240, now);
    filter.frequency.exponentialRampToValueAtTime(2800, now + 0.38);
    filter.frequency.exponentialRampToValueAtTime(750, now + duration);

    // Ethereal gain envelope
    const whooshGain = ctx.createGain();
    whooshGain.gain.setValueAtTime(0.0001, now);
    whooshGain.gain.linearRampToValueAtTime(0.32, now + 0.30);
    whooshGain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

    // Deep sub-bass energy undercurrent (70Hz -> 180Hz -> 50Hz)
    const subOsc = ctx.createOscillator();
    const subGain = ctx.createGain();
    subOsc.type = 'sine';
    subOsc.frequency.setValueAtTime(70, now);
    subOsc.frequency.exponentialRampToValueAtTime(180, now + 0.35);
    subOsc.frequency.exponentialRampToValueAtTime(50, now + duration);

    subGain.gain.setValueAtTime(0.0001, now);
    subGain.gain.linearRampToValueAtTime(0.20, now + 0.32);
    subGain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

    subOsc.connect(subGain);
    subGain.connect(this.masterGain);

    noiseSource.connect(filter);
    filter.connect(whooshGain);
    whooshGain.connect(this.masterGain);

    subOsc.start(now);
    subOsc.stop(now + duration);
    noiseSource.start(now);
    noiseSource.stop(now + duration);

    setTimeout(() => {
      noiseSource.disconnect();
      filter.disconnect();
      whooshGain.disconnect();
      subOsc.disconnect();
      subGain.disconnect();
    }, (duration + 0.1) * 1000);
  }

  /**
   * Gentle, ethereal ambient spatial drone (detuned 55Hz/110Hz sub-oscillators at -28dB).
   * Safe to call multiple times; will not spawn duplicate background oscillators.
   */
  public startAmbientHum(): void {
    if (this.ambientActive) return;

    const ctx = this.initAudioContext();
    if (!ctx || !this.masterGain) return;

    this.ambientActive = true;
    const now = ctx.currentTime;

    // Ambient gain bus (-28 dB target level)
    this.ambientGain = ctx.createGain();
    this.ambientGain.gain.setValueAtTime(0.0001, now);
    this.ambientGain.gain.exponentialRampToValueAtTime(
      this.muted ? 0.0001 : this.AMBIENT_TARGET_GAIN,
      now + 2.0
    );

    // Warm spatial lowpass filter
    this.ambientFilter = ctx.createBiquadFilter();
    this.ambientFilter.type = 'lowpass';
    this.ambientFilter.frequency.setValueAtTime(260, now);

    // Sub-oscillator 1: 55Hz (A1) sine
    const sub1 = ctx.createOscillator();
    sub1.type = 'sine';
    sub1.frequency.setValueAtTime(55.0, now);

    // Sub-oscillator 2: 55.42Hz sine (slight binaural detune for organic acoustic phasing)
    const sub2 = ctx.createOscillator();
    sub2.type = 'sine';
    sub2.frequency.setValueAtTime(55.42, now);

    // Harmonic oscillator 3: 110Hz (A2) gentle triangle overtone
    const harm = ctx.createOscillator();
    harm.type = 'triangle';
    harm.frequency.setValueAtTime(110.0, now);

    const harmGain = ctx.createGain();
    harmGain.gain.setValueAtTime(0.4, now);

    sub1.connect(this.ambientFilter);
    sub2.connect(this.ambientFilter);
    harm.connect(harmGain);
    harmGain.connect(this.ambientFilter);

    this.ambientFilter.connect(this.ambientGain);
    this.ambientGain.connect(this.masterGain);

    sub1.start();
    sub2.start();
    harm.start();

    this.ambientOscillators = [sub1, sub2, harm];
  }

  /**
   * Smoothly fades out and stops the ambient spatial drone.
   */
  public stopAmbientHum(): void {
    if (!this.ambientActive || !this.ctx || !this.ambientGain) {
      this.ambientActive = false;
      return;
    }

    const now = this.ctx.currentTime;
    const fadeOutDuration = 1.0;

    this.ambientActive = false;

    // Smooth exponential ramp down to avoid clicks
    this.ambientGain.gain.setValueAtTime(
      Math.max(0.0001, this.ambientGain.gain.value),
      now
    );
    this.ambientGain.gain.exponentialRampToValueAtTime(0.0001, now + fadeOutDuration);

    const oscsToStop = [...this.ambientOscillators];
    const gainToClean = this.ambientGain;
    const filterToClean = this.ambientFilter;

    this.ambientOscillators = [];
    this.ambientGain = null;
    this.ambientFilter = null;

    setTimeout(() => {
      oscsToStop.forEach((osc) => {
        try {
          osc.stop();
          osc.disconnect();
        } catch {
          // Already stopped
        }
      });
      gainToClean?.disconnect();
      filterToClean?.disconnect();
    }, (fadeOutDuration + 0.1) * 1000);
  }

  /**
   * Sets the global audio mute state.
   * Smoothly attenuates the master gain to prevent speaker pop.
   */
  public setMuted(muted: boolean): void {
    this.muted = muted;

    if (!this.ctx || !this.masterGain) return;

    const now = this.ctx.currentTime;
    if (muted) {
      this.masterGain.gain.setValueAtTime(
        Math.max(0.0001, this.masterGain.gain.value),
        now
      );
      this.masterGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.04);
    } else {
      this.initAudioContext();
      this.masterGain.gain.setValueAtTime(
        Math.max(0.0001, this.masterGain.gain.value),
        now
      );
      this.masterGain.gain.exponentialRampToValueAtTime(1.0, now + 0.04);
    }
  }

  /**
   * Returns current mute state.
   */
  public isMuted(): boolean {
    return this.muted;
  }
}

// Export singleton instance
export const spatialAudioEngine = new SpatialAudioEngine();

// Export individual functional methods for direct imports
export const initAudioContext = (): AudioContext | null =>
  spatialAudioEngine.initAudioContext();

export const playHoverBlip = (elevation?: number, region?: string): void =>
  spatialAudioEngine.playHoverBlip(elevation, region);

export const playSelectTone = (): void =>
  spatialAudioEngine.playSelectTone();

export const playCompleteFanfare = (unlockedCount?: number): void =>
  spatialAudioEngine.playCompleteFanfare(unlockedCount);

export const playLockedDenialTone = (): void =>
  spatialAudioEngine.playLockedDenialTone();

export const playUnlockWhoosh = (): void =>
  spatialAudioEngine.playUnlockWhoosh();

export const startAmbientHum = (): void =>
  spatialAudioEngine.startAmbientHum();

export const stopAmbientHum = (): void =>
  spatialAudioEngine.stopAmbientHum();

export const setMuted = (muted: boolean): void =>
  spatialAudioEngine.setMuted(muted);

export const isMuted = (): boolean =>
  spatialAudioEngine.isMuted();

export default spatialAudioEngine;
