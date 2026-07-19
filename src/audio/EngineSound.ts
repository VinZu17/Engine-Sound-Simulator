/**
 * EngineSound — Sample-based engine sound playback.
 * Ported EXACT dari markeasting/engine-audio:
 * - 5 simultaneous looping samples (always playing, gain-controlled)
 * - Equal-power crossfade: cos((1-x)*π/2) + cos(x*π/2)
 * - Pitch shifting via detune cents: (rpm - sampleRPM) × 0.2
 * - 2D matrix: throttle ON/OFF × RPM low/high
 */

export interface SoundSample {
  key: string;
  buffer: AudioBuffer | null;
  source: AudioBufferSourceNode | null;
  gain: GainNode | null;
  baseRPM: number;
  volume: number;
}

export class EngineSound {
  private ctx: AudioContext;
  private output: GainNode;
  private samples: Map<string, SoundSample> = new Map();
  private loaded = false;

  // RPM ranges for crossfade
  private crossfadeLowRPM = 3000;
  private crossfadeHighRPM = 6500;
  private rpmPitchFactor = 0.2; // cents per RPM offset

  constructor(ctx: AudioContext, output: GainNode) {
    this.ctx = ctx;
    this.output = output;
  }

  async loadSamples(
    samples: Record<string, string>,
    crossfadeRPM?: number
  ): Promise<void> {
    this.stopAll();
    this.loaded = false;

    if (crossfadeRPM) {
      this.crossfadeLowRPM = crossfadeRPM - 3500;
      this.crossfadeHighRPM = crossfadeRPM + 500;
    }

    const sampleKeys = ['onThrottleLow', 'onThrottleHigh', 'offThrottleLow', 'offThrottleHigh'];

    // Base RPM per sample type
    const baseRPMs: Record<string, number> = {
      onThrottleLow: 2000,
      onThrottleHigh: 6500,
      offThrottleLow: 2000,
      offThrottleHigh: 6500,
    };

    const volumes: Record<string, number> = {
      onThrottleLow: 2.0,
      onThrottleHigh: 2.5,
      offThrottleLow: 1.5,
      offThrottleHigh: 2.0,
    };

    for (const key of sampleKeys) {
      const path = samples[key];
      let buffer: AudioBuffer | null = null;

      if (path) {
        try {
          const response = await fetch(path);
          if (response.ok) {
            const arrayBuffer = await response.arrayBuffer();
            buffer = await this.ctx.decodeAudioData(arrayBuffer);
          }
        } catch { /* file gak ada */ }
      }

      if (!buffer) {
        buffer = this.generateSynthBuffer(key);
      }

      // Create looping source + gain — SEMUA selalu play, gain=0
      const source = this.ctx.createBufferSource();
      source.buffer = buffer;
      source.loop = true;
      source.playbackRate.value = 1.0;

      const gain = this.ctx.createGain();
      gain.gain.value = 0; // Start silent

      source.connect(gain);
      gain.connect(this.output);
      source.start(0);

      this.samples.set(key, {
        key,
        buffer,
        source,
        gain,
        baseRPM: baseRPMs[key] || 3000,
        volume: volumes[key] || 1.0,
      });
    }

    this.loaded = true;
  }

  private generateSynthBuffer(type: string): AudioBuffer {
    const sr = this.ctx.sampleRate;
    const duration = 3;
    const length = sr * duration;
    const buffer = this.ctx.createBuffer(2, length, sr);

    const isHigh = type.includes('High');
    const isOnThrottle = type.includes('onThrottle');
    const baseFreq = isHigh ? 180 : 90;

    for (let ch = 0; ch < 2; ch++) {
      const data = buffer.getChannelData(ch);
      for (let i = 0; i < length; i++) {
        const t = i / sr;
        let sample = 0;
        sample += Math.sin(2 * Math.PI * baseFreq * t) * 0.3;
        sample += Math.sin(2 * Math.PI * baseFreq * 2 * t) * 0.2;
        sample += Math.sin(2 * Math.PI * baseFreq * 3 * t) * 0.1;
        sample += Math.sin(2 * Math.PI * baseFreq * 0.5 * t) * 0.15;
        sample += (Math.random() * 2 - 1) * (isOnThrottle ? 0.08 : 0.03);
        const offset = ch === 0 ? 0.003 : -0.003;
        sample += Math.sin(2 * Math.PI * baseFreq * (t + offset)) * 0.05;
        const vol = isOnThrottle ? 0.6 : 0.3;
        data[i] = sample * vol;
      }
    }
    return buffer;
  }

  /**
   * Update semua samples setiap frame.
   * EXACT MATCH ke reference: crossFade + detune + 2D matrix.
   */
  update(rpm: number, throttle: number): void {
    if (!this.loaded || this.samples.size < 4) return;

    const now = this.ctx.currentTime;

    // ═══ CROSSFADE A: Throttle ON vs OFF ═══
    const onGain = this.crossFade(throttle, 0, 1).gain1;
    const offGain = this.crossFade(throttle, 0, 1).gain2;

    // ═══ CROSSFADE B: RPM Low vs High ═══
    const rpmCrossfade = this.crossFade(rpm, this.crossfadeLowRPM, this.crossfadeHighRPM);
    const lowGain = rpmCrossfade.gain1;
    const highGain = rpmCrossfade.gain2;

    // ═══ APPLY GAIN — 2D matrix ═══
    const onLow = this.samples.get('onThrottleLow');
    const onHigh = this.samples.get('onThrottleHigh');
    const offLow = this.samples.get('offThrottleLow');
    const offHigh = this.samples.get('offThrottleHigh');

    if (onLow) this.setSampleGain(onLow, onGain * lowGain, now);
    if (onHigh) this.setSampleGain(onHigh, onGain * highGain, now);
    if (offLow) this.setSampleGain(offLow, offGain * lowGain, now);
    if (offHigh) this.setSampleGain(offHigh, offGain * highGain, now);

    // ═══ PITCH SHIFTING — EXACT REFERENCE ═══
    for (const [, sample] of this.samples) {
      if (sample.source) {
        const detune = (rpm - sample.baseRPM) * this.rpmPitchFactor;
        sample.source.detune.setTargetAtTime(detune, now, 0.02);
      }
    }
  }

  /**
   * Equal-power crossfade — EXACT REFERENCE MATH
   * cos((1-x)*π/2) + cos(x*π/2) = constant perceived volume
   */
  private crossFade(value: number, start: number, end: number) {
    const x = Math.max(0, Math.min(1, (value - start) / (end - start)));
    return {
      gain1: Math.cos((1.0 - x) * 0.5 * Math.PI),
      gain2: Math.cos(x * 0.5 * Math.PI),
    };
  }

  private setSampleGain(sample: SoundSample, value: number, now: number): void {
    if (sample.gain) {
      const clampedValue = Math.max(0, Math.min(1, value * sample.volume));
      sample.gain.gain.setTargetAtTime(clampedValue, now, 0.02);
    }
  }

  isLoaded(): boolean {
    return this.loaded;
  }

  stopAll(): void {
    for (const [, sample] of this.samples) {
      try { sample.source?.stop(); } catch { /* already stopped */ }
    }
    this.samples.clear();
    this.loaded = false;
  }
}
