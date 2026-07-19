import { SynthEngine } from './SynthEngine';
import { EngineSound } from './EngineSound';

/**
 * AudioManager — orchestrator audio.
 * Primary: SynthEngine (oscillator-based, realtime)
 * Plus: EngineSound (sample-based) + Convolution IR (exhaust resonance)
 */
export class AudioManager {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;

  // Convolution — exhaust resonance via impulse response
  private convolver: ConvolverNode | null = null;
  private convGain: GainNode | null = null;

  // Primary: SynthEngine
  private synthEngine: SynthEngine | null = null;

  // Sample-based
  private engineSound: EngineSound | null = null;

  private volume = 0.7;
  private initialized = false;
  private engineRunning = false;

  async init(): Promise<void> {
    if (this.initialized) return;

    try {
      this.ctx = new AudioContext();

      // Master gain
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = 0;
      this.masterGain.connect(this.ctx.destination);

      // Convolver untuk exhaust resonance
      this.convolver = this.ctx.createConvolver();
      this.convGain = this.ctx.createGain();
      this.convGain.gain.value = 0.3;
      this.convolver.connect(this.convGain);
      this.convGain.connect(this.masterGain);

      // Load impulse response
      await this.loadDefaultIR();

      // SynthEngine — primary audio
      this.synthEngine = new SynthEngine(this.ctx, this.masterGain);
      this.synthEngine.start();

      // Sample-based engine sound
      this.engineSound = new EngineSound(this.ctx, this.masterGain);

      this.initialized = true;
      console.log('[AudioManager] Init OK');
    } catch (error) {
      console.error('[AudioManager] Init gagal:', error);
    }
  }

  /**
   * Load atau generate impulse response untuk exhaust resonance.
   */
  private async loadDefaultIR(): Promise<void> {
    if (!this.ctx || !this.convolver) return;

    try {
      const response = await fetch('/sounds/impulse_responses/exhaust_mild.wav');
      if (response.ok) {
        const arrayBuffer = await response.arrayBuffer();
        this.convolver.buffer = await this.ctx.decodeAudioData(arrayBuffer);
        console.log('[AudioManager] IR loaded');
        return;
      }
    } catch { /* file gak ada */ }

    // Generate sintetis IR — simple room reverb
    const sr = this.ctx.sampleRate;
    const length = Math.floor(sr * 0.5);
    const ir = this.ctx.createBuffer(2, length, sr);

    for (let ch = 0; ch < 2; ch++) {
      const data = ir.getChannelData(ch);
      for (let i = 0; i < length; i++) {
        const t = i / sr;
        let sample = 0;
        if (t < 0.05) {
          sample = Math.sin(2 * Math.PI * 200 * t) * Math.exp(-t * 30) * 0.5;
        }
        sample += (Math.random() * 2 - 1) * Math.exp(-t * 8) * 0.3;
        data[i] = sample;
      }
    }

    this.convolver.buffer = ir;
    console.log('[AudioManager] IR generated');
  }

  setEngineConfig(cylinders: number, redline: number): void {
    this.synthEngine?.setEngineConfig(cylinders, redline);
  }

  setGearRatio(ratio: number): void {
    this.synthEngine?.setGearRatio(ratio);
  }

  async loadEngineSounds(configId: string, samples: Record<string, string>): Promise<void> {
    if (!this.ctx || !this.masterGain) await this.init();
    if (!this.ctx || !this.masterGain) return;

    try {
      await this.engineSound?.loadSamples(samples);
    } catch (error) {
      console.error(`[AudioManager] Load sound gagal: ${configId}`, error);
    }
  }

  update(
    rpm: number,
    throttle: number,
    atRevLimiter: boolean,
    crossfadeRPM: number,
    isRunning: boolean
  ): void {
    if (!this.initialized || !this.masterGain || !this.ctx) return;

    // Master gate: mute saat engine mati
    if (isRunning !== this.engineRunning) {
      this.engineRunning = isRunning;
      this.masterGain.gain.setTargetAtTime(
        isRunning ? this.volume : 0,
        this.ctx.currentTime,
        0.05
      );
    }

    // Update SynthEngine (primary)
    this.synthEngine?.update(rpm, throttle, atRevLimiter);

    // Update sample-based
    this.engineSound?.update(rpm, throttle);
  }

  setVolume(v: number): void {
    this.volume = Math.max(0, Math.min(1, v));
    if (this.masterGain && this.ctx && this.engineRunning) {
      this.masterGain.gain.setTargetAtTime(this.volume, this.ctx.currentTime, 0.01);
    }
  }

  resume(): void {
    if (this.ctx?.state === 'suspended') this.ctx.resume();
  }

  destroy(): void {
    this.synthEngine?.stop();
    this.engineSound?.stopAll();
    this.ctx?.close();
    this.ctx = null;
    this.initialized = false;
  }
}
