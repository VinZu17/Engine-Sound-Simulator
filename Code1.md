**src/audio/AudioManager.ts**
```typescript
/**
 * AudioManager — WebAudio API wrapper for engine sound synthesis.
 * Uses sample-based mixing with RPM-dependent gain and detune.
 */
export class AudioManager {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;

  // Current engine sound nodes
  private sources: AudioBufferSourceNode[] = [];
  private gains: GainNode[] = [];
  private buffers: AudioBuffer[] = [];

  private loaded = false;
  private currentConfigId = '';
  private volume = 0.8;

  async init(): Promise<void> {
    if (this.ctx) return;
    this.ctx = new AudioContext();
    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.value = this.volume;
    this.masterGain.connect(this.ctx.destination);
  }

  /**
   * Load engine sound samples from configuration.
   * Falls back to synthesized sound if samples aren't available.
   */
  async loadEngineSounds(
    configId: string,
    samples: Record<string, string>
  ): Promise<void> {
    if (!this.ctx || !this.masterGain) await this.init();
    if (!this.ctx || !this.masterGain) return;

    // Cleanup previous sources
    this.stopAll();

    this.currentConfigId = configId;
    this.buffers = [];

    const sampleKeys = ['onThrottleLow', 'onThrottleHigh', 'offThrottleLow', 'offThrottleHigh'];

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
        } catch {
          // File not found — will use synth fallback
        }
      }

      if (!buffer) {
        // Generate a synthetic engine tone as placeholder
        buffer = this.generateSynthBuffer(key);
      }

      this.buffers.push(buffer);

      // Create looping source
      const source = this.ctx.createBufferSource();
      source.buffer = buffer;
      source.loop = true;

      const gain = this.ctx.createGain();
      gain.gain.value = 0;

      source.connect(gain);
      gain.connect(this.masterGain);
      source.start(0);

      this.sources.push(source);
      this.gains.push(gain);
    }

    this.loaded = true;
  }

  /**
   * Generate a synthetic engine tone buffer as a placeholder.
   */
  private generateSynthBuffer(type: string): AudioBuffer {
    const sampleRate = this.ctx!.sampleRate;
    const duration = 2; // seconds
    const length = sampleRate * duration;
    const buffer = this.ctx!.createBuffer(1, length, sampleRate);
    const data = buffer.getChannelData(0);

    // Base frequencies for different engine types
    const baseFreq = type.includes('High') ? 220 : 110;
    const isOnThrottle = type.includes('onThrottle');
    const isLimiter = type.includes('limiter');

    for (let i = 0; i < length; i++) {
      const t = i / sampleRate;

      // Fundamental + harmonics for engine-like sound
      let sample = 0;

      // Fundamental
      sample += Math.sin(2 * Math.PI * baseFreq * t) * 0.4;

      // 2nd harmonic (exhaust pulse)
      sample += Math.sin(2 * Math.PI * baseFreq * 2 * t) * 0.3;

      // 3rd harmonic
      sample += Math.sin(2 * Math.PI * baseFreq * 3 * t) * 0.15;

      // Slight noise for intake
      sample += (Math.random() * 2 - 1) * (isOnThrottle ? 0.1 : 0.05);

      // Rev limiter stutter
      if (isLimiter) {
        const stutter = Math.sin(2 * Math.PI * 15 * t) > 0 ? 1 : 0.2;
        sample *= stutter;
      }

      // Apply envelope
      const env = isOnThrottle ? 0.8 : 0.5;
      data[i] = sample * env;
    }

    return buffer;
  }

  /**
   * Update sound parameters based on engine state.
   * Called every frame with RPM, throttle, and rev limiter status.
   */
  update(rpm: number, throttle: number, atRevLimiter: boolean, crossfadeRPM: number): void {
    if (!this.loaded || this.gains.length < 4) return;

    // Normalize RPM for crossfade
    const rpmNorm = Math.min(1, Math.max(0, (rpm - 800) / (9000 - 800)));
    const crossfadePoint = crossfadeRPM / 9000;

    // Crossfade factor: 0 = low samples, 1 = high samples
    const crossfade = Math.min(1, Math.max(0,
      (rpmNorm - (crossfadePoint - 0.15)) / 0.3
    ));

    // Determine which samples are active based on throttle
    const onThrottleGain = throttle > 0.05 ? 1 : 0;
    const offThrottleGain = throttle <= 0.05 ? 1 : 0;

    // Apply gains: [onThrottleLow, onThrottleHigh, offThrottleLow, offThrottleHigh]
    const gains = this.gains;

    // On-throttle low: active when on throttle, low RPM
    this.setGain(gains[0], onThrottleGain * (1 - crossfade));

    // On-throttle high: active when on throttle, high RPM
    this.setGain(gains[1], onThrottleGain * crossfade);

    // Off-throttle low: active when off throttle, low RPM
    this.setGain(gains[2], offThrottleGain * (1 - crossfade));

    // Off-throttle high: active when off throttle, high RPM
    this.setGain(gains[3], offThrottleGain * crossfade);

    // Rev limiter modulation
    if (atRevLimiter && gains.length > 4) {
      this.setGain(gains[4], 0.7);
    } else if (gains.length > 4) {
      this.setGain(gains[4], 0);
    }

    // Pitch shift via detune (map RPM to cents offset)
    for (const source of this.sources) {
      // Calculate detune based on RPM ratio
      const rpmRatio = rpm / 3000; // Reference RPM
      const detune = Math.log2(rpmRatio) * 1200; // Convert ratio to cents
      source.detune.setValueAtTime(detune, this.ctx!.currentTime);
    }
  }

  private setGain(gainNode: GainNode, value: number): void {
    if (!this.ctx) return;
    gainNode.gain.setTargetAtTime(
      Math.max(0, Math.min(1, value)),
      this.ctx.currentTime,
      0.02 // Smooth transition
    );
  }

  stopAll(): void {
    for (const source of this.sources) {
      try { source.stop(); } catch { /* already stopped */ }
    }
    this.sources = [];
    this.gains = [];
    this.buffers = [];
    this.loaded = false;
  }

  setVolume(v: number): void {
    this.volume = v;
    if (this.masterGain) {
      this.masterGain.gain.setTargetAtTime(v, this.ctx!.currentTime, 0.01);
    }
  }

  resume(): void {
    if (this.ctx?.state === 'suspended') {
      this.ctx.resume();
    }
  }

  destroy(): void {
    this.stopAll();
    this.ctx?.close();
    this.ctx = null;
  }
}
```

**src/config/engines.ts**
```typescript
import { EngineConfig } from '../core/types';

export const ENGINE_PRESETS: EngineConfig[] = [
  {
    id: 'lexus-lfa-v10',
    name: 'Lexus LFA V10',
    cylinders: 10,
    displacement: 4.8,
    bore: 87.5,
    stroke: 79.0,
    redline: 9000,
    idleRPM: 800,
    torqueCurve: [
      { rpm: 800, nm: 280 },
      { rpm: 2000, nm: 320 },
      { rpm: 3000, nm: 360 },
      { rpm: 4000, nm: 400 },
      { rpm: 5000, nm: 440 },
      { rpm: 6000, nm: 470 },
      { rpm: 7000, nm: 490 },
      { rpm: 8000, nm: 480 },
      { rpm: 8700, nm: 450 },
      { rpm: 9000, nm: 420 },
    ],
    compressionRatio: 12.0,
    firingOrder: [1, 6, 2, 7, 3, 8, 4, 9, 5, 10],
    intakeRunnerLength: 300,
    exhaustHeaderLength: 450,
    flywheelInertia: 0.15,
    drivetrain: {
      gears: [3.827, 2.360, 1.685, 1.312, 1.000, 0.793],
      finalDrive: 4.100,
      shiftTime: 0.15,
      clutchEngagement: 0.85,
    },
    sounds: {
      samples: {
        onThrottleLow: '/sounds/lexus-lfa-v10/on_throttle_low.wav',
        onThrottleHigh: '/sounds/lexus-lfa-v10/on_throttle_high.wav',
        offThrottleLow: '/sounds/lexus-lfa-v10/off_throttle_low.wav',
        offThrottleHigh: '/sounds/lexus-lfa-v10/off_throttle_high.wav',
        limiter: '/sounds/lexus-lfa-v10/limiter.wav',
      },
      crossfadeRPM: 6500,
      volume: 0.8,
    },
  },
  {
    id: 'subaru-ej25',
    name: 'Subaru EJ25 (Boxer Rumble)',
    cylinders: 4,
    displacement: 2.5,
    bore: 99.5,
    stroke: 79.0,
    redline: 7000,
    idleRPM: 750,
    torqueCurve: [
      { rpm: 750, nm: 200 },
      { rpm: 2000, nm: 250 },
      { rpm: 3000, nm: 280 },
      { rpm: 4000, nm: 300 },
      { rpm: 5000, nm: 310 },
      { rpm: 5500, nm: 315 },
      { rpm: 6000, nm: 300 },
      { rpm: 6500, nm: 280 },
      { rpm: 7000, nm: 250 },
    ],
    compressionRatio: 8.2,
    firingOrder: [1, 3, 2, 4],
    intakeRunnerLength: 350,
    exhaustHeaderLength: 500,
    flywheelInertia: 0.12,
    drivetrain: {
      gears: [3.454, 1.947, 1.296, 0.972, 0.738, 0.604],
      finalDrive: 3.900,
      shiftTime: 0.2,
      clutchEngagement: 0.8,
    },
    sounds: {
      samples: {
        onThrottleLow: '/sounds/subaru-ej25/on_throttle_low.wav',
        onThrottleHigh: '/sounds/subaru-ej25/on_throttle_high.wav',
        offThrottleLow: '/sounds/subaru-ej25/off_throttle_low.wav',
        offThrottleHigh: '/sounds/subaru-ej25/off_throttle_high.wav',
      },
      crossfadeRPM: 4500,
      volume: 0.85,
    },
  },
  {
    id: 'toyota-2jz',
    name: 'Toyota 2JZ-GTE',
    cylinders: 6,
    displacement: 3.0,
    bore: 86.0,
    stroke: 86.0,
    redline: 7800,
    idleRPM: 800,
    torqueCurve: [
      { rpm: 800, nm: 280 },
      { rpm: 2000, nm: 320 },
      { rpm: 3000, nm: 380 },
      { rpm: 4000, nm: 430 },
      { rpm: 5000, nm: 470 },
      { rpm: 5500, nm: 490 },
      { rpm: 6000, nm: 500 },
      { rpm: 6500, nm: 490 },
      { rpm: 7000, nm: 460 },
      { rpm: 7800, nm: 420 },
    ],
    compressionRatio: 8.5,
    firingOrder: [1, 5, 3, 6, 2, 4],
    intakeRunnerLength: 320,
    exhaustHeaderLength: 480,
    flywheelInertia: 0.14,
    drivetrain: {
      gears: [3.827, 2.360, 1.685, 1.312, 1.000, 0.793],
      finalDrive: 3.700,
      shiftTime: 0.18,
      clutchEngagement: 0.82,
    },
    sounds: {
      samples: {
        onThrottleLow: '/sounds/toyota-2jz/on_throttle_low.wav',
        onThrottleHigh: '/sounds/toyota-2jz/on_throttle_high.wav',
        offThrottleLow: '/sounds/toyota-2jz/off_throttle_low.wav',
        offThrottleHigh: '/sounds/toyota-2jz/off_throttle_high.wav',
      },
      crossfadeRPM: 5000,
      volume: 0.8,
    },
  },
  {
    id: 'honda-f20c',
    name: 'Honda F20C (VTEC)',
    cylinders: 4,
    displacement: 2.0,
    bore: 87.0,
    stroke: 84.0,
    redline: 9000,
    idleRPM: 850,
    torqueCurve: [
      { rpm: 850, nm: 160 },
      { rpm: 2000, nm: 180 },
      { rpm: 3000, nm: 195 },
      { rpm: 4000, nm: 205 },
      { rpm: 5000, nm: 215 },
      { rpm: 5500, nm: 225 }, // VTEC crossover
      { rpm: 6000, nm: 235 },
      { rpm: 7000, nm: 240 },
      { rpm: 8000, nm: 230 },
      { rpm: 9000, nm: 200 },
    ],
    compressionRatio: 11.5,
    firingOrder: [1, 3, 4, 2],
    intakeRunnerLength: 280,
    exhaustHeaderLength: 420,
    flywheelInertia: 0.08,
    drivetrain: {
      gears: [3.250, 1.900, 1.333, 1.053, 0.875, 0.733],
      finalDrive: 4.350,
      shiftTime: 0.12,
      clutchEngagement: 0.9,
    },
    sounds: {
      samples: {
        onThrottleLow: '/sounds/honda-f20c/on_throttle_low.wav',
        onThrottleHigh: '/sounds/honda-f20c/on_throttle_high.wav',
        offThrottleLow: '/sounds/honda-f20c/off_throttle_low.wav',
        offThrottleHigh: '/sounds/honda-f20c/off_throttle_high.wav',
      },
      crossfadeRPM: 5800,
      volume: 0.75,
    },
  },
  {
    id: 'bmw-m52b28',
    name: 'BMW M52B28',
    cylinders: 6,
    displacement: 2.8,
    bore: 84.0,
    stroke: 84.0,
    redline: 6500,
    idleRPM: 750,
    torqueCurve: [
      { rpm: 750, nm: 250 },
      { rpm: 1500, nm: 270 },
      { rpm: 2500, nm: 290 },
      { rpm: 3500, nm: 305 },
      { rpm: 4000, nm: 310 },
      { rpm: 4500, nm: 305 },
      { rpm: 5000, nm: 295 },
      { rpm: 5500, nm: 280 },
      { rpm: 6000, nm: 260 },
      { rpm: 6500, nm: 230 },
    ],
    compressionRatio: 10.5,
    firingOrder: [1, 5, 3, 6, 2, 4],
    intakeRunnerLength: 340,
    exhaustHeaderLength: 500,
    flywheelInertia: 0.13,
    drivetrain: {
      gears: [3.910, 2.340, 1.520, 1.140, 0.870, 0.690],
      finalDrive: 3.460,
      shiftTime: 0.2,
      clutchEngagement: 0.8,
    },
    sounds: {
      samples: {
        onThrottleLow: '/sounds/bmw-m52b28/on_throttle_low.wav',
        onThrottleHigh: '/sounds/bmw-m52b28/on_throttle_high.wav',
        offThrottleLow: '/sounds/bmw-m52b28/off_throttle_low.wav',
        offThrottleHigh: '/sounds/bmw-m52b28/off_throttle_high.wav',
      },
      crossfadeRPM: 4000,
      volume: 0.8,
    },
  },
  {
    id: 'ferrari-f136-v8',
    name: 'Ferrari F136 V8',
    cylinders: 8,
    displacement: 4.5,
    bore: 94.0,
    stroke: 81.0,
    redline: 9000,
    idleRPM: 1100,
    torqueCurve: [
      { rpm: 1100, nm: 340 },
      { rpm: 2000, nm: 380 },
      { rpm: 3000, nm: 420 },
      { rpm: 4000, nm: 460 },
      { rpm: 5000, nm: 490 },
      { rpm: 6000, nm: 510 },
      { rpm: 7000, nm: 520 },
      { rpm: 8000, nm: 500 },
      { rpm: 8700, nm: 470 },
      { rpm: 9000, nm: 440 },
    ],
    compressionRatio: 12.5,
    firingOrder: [1, 5, 3, 7, 4, 8, 2, 6],
    intakeRunnerLength: 300,
    exhaustHeaderLength: 400,
    flywheelInertia: 0.1,
    drivetrain: {
      gears: [3.620, 2.180, 1.540, 1.170, 0.920, 0.750],
      finalDrive: 4.200,
      shiftTime: 0.1,
      clutchEngagement: 0.9,
    },
    sounds: {
      samples: {
        onThrottleLow: '/sounds/ferrari-f136-v8/on_throttle_low.wav',
        onThrottleHigh: '/sounds/ferrari-f136-v8/on_throttle_high.wav',
        offThrottleLow: '/sounds/ferrari-f136-v8/off_throttle_low.wav',
        offThrottleHigh: '/sounds/ferrari-f136-v8/off_throttle_high.wav',
      },
      crossfadeRPM: 6000,
      volume: 0.9,
    },
  },
];
```
**src/core/Drivetrain.ts**
```typescript
import { DrivetrainConfig } from './types';

/**
 * Drivetrain simulation — 6-speed gearbox, clutch, final drive ratio.
 * Handles gear changes, clutch engagement, and load transfer to engine.
 */
export class Drivetrain {
  private config: DrivetrainConfig;
  private currentGear = 0; // 0 = neutral
  private clutchPosition = 1; // 1 = fully engaged
  private shiftProgress = 0;
  private isShifting = false;

  constructor(config: DrivetrainConfig) {
    this.config = config;
  }

  getConfig(): DrivetrainConfig {
    return this.config;
  }

  getGear(): number {
    return this.currentGear;
  }

  getClutchPosition(): number {
    return this.clutchPosition;
  }

  /** Get total gear ratio (gear ratio * final drive) */
  getTotalRatio(): number {
    if (this.currentGear === 0) return 0;
    return this.config.gears[this.currentGear - 1] * this.config.finalDrive;
  }

  /** Get current gear ratio (without final drive) */
  getGearRatio(): number {
    if (this.currentGear === 0) return 0;
    return this.config.gears[this.currentGear - 1];
  }

  /**
   * Calculate the load torque the drivetrain puts on the engine.
   * Returns negative torque (resistance) when engine is driving wheels.
   */
  getLoadTorque(engineRPM: number, wheelSpeed: number, brakeTorque: number): number {
    const ratio = this.getTotalRatio();
    if (ratio === 0) return -brakeTorque * 0.1;

    // Convert wheel speed to engine speed through gear ratio
    const wheelRPM = wheelSpeed / (2 * Math.PI) * 60;
    const theoreticalEngineRPM = wheelRPM * ratio;

    // Clutch slip factor (0 = fully open, 1 = fully engaged)
    const clutchFactor = this.clutchPosition;

    // Spring-damper model for clutch coupling
    const rpmDiff = engineRPM - theoreticalEngineRPM;
    const couplingTorque = rpmDiff * 50 * clutchFactor; // spring constant

    // Apply brake load
    const brakeLoad = -brakeTorque * clutchFactor;

    return -couplingTorque + brakeLoad;
  }

  /**
   * Convert engine RPM to wheel speed (m/s)
   */
  engineRPMToWheelSpeed(engineRPM: number): number {
    const ratio = this.getTotalRatio();
    if (ratio === 0) return 0;
    const wheelRPM = engineRPM / ratio;
    // Assume tire circumference ~2m (205/55R16 tire)
    return (wheelRPM * 2) / 60;
  }

  /**
   * Shift up one gear
   */
  shiftUp(): boolean {
    if (this.currentGear >= this.config.gears.length) return false;
    if (this.isShifting) return false;

    this.currentGear++;
    this.isShifting = true;
    this.shiftProgress = 0;
    return true;
  }

  /**
   * Shift down one gear
   */
  shiftDown(): boolean {
    if (this.currentGear <= 0) return false;
    if (this.isShifting) return false;

    this.currentGear--;
    this.isShifting = true;
    this.shiftProgress = 0;
    return true;
  }

  /**
   * Set clutch position (0 = fully disengaged, 1 = fully engaged)
   * Ignore user input saat shift animation jalan — biarin drivetrain yang handle.
   */
  setClutch(position: number): void {
    // Saat shift, jangan override clutch — shift animation yang control
    if (this.isShifting) return;
    this.clutchPosition = Math.max(0, Math.min(1, position));
  }

  /**
   * Step the drivetrain simulation
   */
  step(dt: number): void {
    // Handle shift timing
    if (this.isShifting) {
      this.shiftProgress += dt / this.config.shiftTime;
      if (this.shiftProgress >= 1) {
        this.shiftProgress = 1;
        this.isShifting = false;
        this.clutchPosition = this.config.clutchEngagement;
      } else {
        // During shift: clutch disengages then re-engages
        if (this.shiftProgress < 0.5) {
          this.clutchPosition = 1 - this.shiftProgress * 2;
        } else {
          this.clutchPosition = (this.shiftProgress - 0.5) * 2 * this.config.clutchEngagement;
        }
      }
    }
  }

  /** Get display name for current gear */
  getGearDisplay(): string {
    if (this.currentGear === 0) return 'N';
    return this.currentGear.toString();
  }

  /** Get max gears count */
  getMaxGears(): number {
    return this.config.gears.length;
  }
}
```
**src/core/Engine.ts**
```typescript
import { EngineConfig, SimulationState } from './types';

/**
 * Core engine simulation — handles RPM, torque curves, rev limiter,
 * crank angle rotation, and basic combustion modeling.
 */
export class Engine {
  private config: EngineConfig;
  private state: SimulationState;

  constructor(config: EngineConfig) {
    this.config = config;
    this.state = {
      rpm: config.idleRPM,
      throttle: 0,
      brake: 0,
      clutch: 0,
      gear: 1,
      crankAngle: 0,
      vehicleSpeed: 0,
      wheelRPM: 0,
      isRunning: false,
      isStarterEngaged: false,
      ignitionOn: false,
      launchTimer: {
        armed: false,
        running: false,
        startTime: 0,
        target: 60,
        elapsed: 0,
        speed: 0,
      },
    };
  }

  getConfig(): EngineConfig {
    return this.config;
  }

  /** Return mutable reference ke simulation state */
  getState(): SimulationState {
    return this.state;
  }

  setState(s: SimulationState) {
    this.state = s;
  }

  /** Get torque at a given RPM by interpolating the torque curve */
  getTorqueAtRPM(rpm: number): number {
    const curve = this.config.torqueCurve;
    if (rpm <= curve[0].rpm) return curve[0].nm;
    if (rpm >= curve[curve.length - 1].rpm) return curve[curve.length - 1].nm;

    for (let i = 0; i < curve.length - 1; i++) {
      const a = curve[i];
      const b = curve[i + 1];
      if (rpm >= a.rpm && rpm <= b.rpm) {
        const t = (rpm - a.rpm) / (b.rpm - a.rpm);
        return a.nm + t * (b.nm - a.nm);
      }
    }
    return 0;
  }

  /** Get max torque across entire RPM range */
  getMaxTorque(): number {
    return Math.max(...this.config.torqueCurve.map((p) => p.nm));
  }

  /** Calculate engine braking torque (negative torque when throttle is closed) */
  getEngineBraking(rpm: number): number {
    const base = this.config.displacement * 0.15;
    return -(base * (rpm / this.config.redline)) * 100;
  }

  /**
   * Main simulation step — call this every frame.
   * NOTE: RPM di-update dari Vehicle.step() berdasarkan wheel speed.
   * Engine.step() cuma handle starter logic, crank angle, dan idle control.
   */
  step(dt: number, _loadTorque: number, _throttleInput: number): void {
    // Starter motor logic
    if (!this.state.isRunning) {
      if (this.state.isStarterEngaged && this.state.ignitionOn) {
        this.state.rpm += (1500 - this.state.rpm) * dt * 3;
        if (this.state.rpm >= 800) {
          this.state.isRunning = true;
          this.state.isStarterEngaged = false;
        }
      }
      return;
    }

    // Crank angle update
    const radsPerSecond = (this.state.rpm * 2 * Math.PI) / 60;
    this.state.crankAngle += radsPerSecond * dt;
    this.state.crankAngle %= 2 * Math.PI;
  }

  /** Check if engine just hit the rev limiter */
  isAtRevLimiter(): boolean {
    return this.state.rpm >= this.config.redline - 50;
  }

  /** Get crank angle normalized 0-1 for one revolution */
  getCrankFraction(): number {
    return this.state.crankAngle / (2 * Math.PI);
  }

  /** Get firing position of a specific cylinder (0-based index) */
  getCylinderFiringAngle(cylinderIndex: number): number {
    const totalAngle = 2 * Math.PI;
    const cylinderSpacing = totalAngle / this.config.cylinders;
    return (this.state.crankAngle + cylinderIndex * cylinderSpacing) % totalAngle;
  }
}
```
**src/core/types.ts**
```typescript
// ── Engine Configuration Types ──

export interface TorquePoint {
  rpm: number;
  nm: number;
}

export interface DrivetrainConfig {
  gears: number[];
  finalDrive: number;
  shiftTime: number;
  clutchEngagement: number;
}

export interface SoundConfig {
  samples: {
    onThrottleLow: string;
    onThrottleHigh: string;
    offThrottleLow: string;
    offThrottleHigh: string;
    limiter?: string;
  };
  crossfadeRPM: number;
  volume: number;
}

export interface EngineConfig {
  id: string;
  name: string;
  cylinders: number;
  displacement: number;
  bore: number;
  stroke: number;
  redline: number;
  idleRPM: number;
  torqueCurve: TorquePoint[];
  compressionRatio: number;
  firingOrder: number[];
  intakeRunnerLength: number;
  exhaustHeaderLength: number;
  flywheelInertia: number;
  drivetrain: DrivetrainConfig;
  sounds: SoundConfig;
}

// ── Runtime Simulation State ──

export interface SimulationState {
  rpm: number;
  throttle: number;
  brake: number;
  clutch: number;
  gear: number;
  crankAngle: number;
  vehicleSpeed: number;
  wheelRPM: number;
  isRunning: boolean;
  isStarterEngaged: boolean;
  ignitionOn: boolean;
  launchTimer: LaunchTimerState;
}

export interface LaunchTimerState {
  armed: boolean;
  running: boolean;
  startTime: number;
  target: number;
  elapsed: number;
  speed: number;
}

// ── Derived / Computed ──

export interface ComputedForces {
  engineTorque: number;
  wheelTorque: number;
  brakingForce: number;
  dragForce: number;
  netForce: number;
  acceleration: number;
}

// ── Input State ──

export interface InputState {
  throttle: number;
  brake: number;
  clutch: number;
  gearUp: boolean;
  gearDown: boolean;
  ignition: boolean;
  starter: boolean;
}
```
**src/core/Vehicle.ts**
```typescript
import { Engine } from './Engine';
import { Drivetrain } from './Drivetrain';
import { EngineConfig, SimulationState } from './types';

/**
 * Vehicle orchestrator — combines Engine + Drivetrain.
 * Runs the simulation loop and handles vehicle dynamics.
 */
export class Vehicle {
  private engine: Engine;
  private drivetrain: Drivetrain;
  private wheelAngularVelocity = 0; // rad/s
  private vehicleMass = 1500; // kg
  private wheelRadius = 0.33; // meters (~205/55R16 tire)
  private dragCoefficient = 0.35;
  private frontalArea = 2.2; // m²
  private airDensity = 1.225; // kg/m³
  private rollingResistance = 0.013;

  constructor(config: EngineConfig) {
    this.engine = new Engine(config);
    this.drivetrain = new Drivetrain(config.drivetrain);
  }

  getEngine(): Engine {
    return this.engine;
  }

  getDrivetrain(): Drivetrain {
    return this.drivetrain;
  }

  /** Return mutable reference ke simulation state */
  getState(): SimulationState {
    return this.engine.getState();
  }

  setState(s: SimulationState) {
    this.engine.setState(s);
  }

  /** Initialize engine (turn on ignition + starter) */
  startEngine(): void {
    const state = this.engine.getState();
    state.ignitionOn = true;
    state.isStarterEngaged = true;
    state.isRunning = false;
  }

  /** Stop engine completely */
  stopEngine(): void {
    const state = this.engine.getState();
    state.isRunning = false;
    state.ignitionOn = false;
    state.isStarterEngaged = false;
    state.rpm = 0;
  }

  /**
   * Main simulation step — call every frame.
   * @param dt Delta time in seconds
   * @param throttleInput 0-1
   * @param brakeInput 0-1
   */
  step(dt: number, throttleInput: number, brakeInput: number): void {
    const state = this.engine.getState();

    // Update input state
    state.throttle = throttleInput;
    state.brake = brakeInput;

    // Step drivetrain (shift timing)
    this.drivetrain.step(dt);

    // Hitung brake torque
    const brakeTorque = brakeInput * 3000; // Nm max braking

    // ═══ MODEL FISIKA BARU ═══
    // Engine apply torque ke wheels through drivetrain,
    // bukan spring-damper yang couple RPM.

    const gear = this.drivetrain.getGear();
    const totalRatio = this.drivetrain.getTotalRatio();
    const clutchFactor = this.drivetrain.getClutchPosition();

    // Engine torque dari torque curve
    let engineTorque = this.engine.getTorqueAtRPM(state.rpm);

    // Scale by throttle
    if (throttleInput < 0.01) {
      // Off-throttle: engine braking
      engineTorque = this.engine.getEngineBraking(state.rpm);
    } else {
      engineTorque *= throttleInput;
    }

    // Wheel torque = engine torque * gear ratio * final drive * clutch
    // Gear ratio naikkan torque, turunkan RPM
    const wheelTorque = (gear > 0)
      ? engineTorque * totalRatio * clutchFactor
      : 0;

    // Resistive forces
    const wheelSpeed = this.wheelAngularVelocity * this.wheelRadius; // m/s
    const dragForce = 0.5 * this.airDensity * this.dragCoefficient *
      this.frontalArea * wheelSpeed * Math.abs(wheelSpeed);
    const rollingForce = this.rollingResistance * this.vehicleMass * 9.81;

    // Net force on wheels
    const netWheelForce = (wheelTorque / this.wheelRadius) - dragForce - rollingForce - brakeTorque;

    // Wheel angular acceleration: alpha = torque / (mass * radius²)
    // Simplified: F = ma → a = F/m, then alpha = a / radius
    const wheelAcceleration = netWheelForce / (this.vehicleMass * this.wheelRadius);

    // Update wheel angular velocity
    this.wheelAngularVelocity += wheelAcceleration * dt;
    this.wheelAngularVelocity = Math.max(0, this.wheelAngularVelocity);

    // Update vehicle speed
    const vehicleSpeed = this.wheelAngularVelocity * this.wheelRadius; // m/s
    state.vehicleSpeed = vehicleSpeed * 3.6; // km/h
    state.wheelRPM = (this.wheelAngularVelocity * 60) / (2 * Math.PI);

    // Engine RPM dari wheel speed through gear ratio
    // (ini bikin RPM naik/turun sesuai kecepatan mobil)
    if (gear > 0 && clutchFactor > 0.5) {
      const targetEngineRPM = state.wheelRPM * totalRatio;
      // Blend RPM: clutch fully engaged = follow wheel, slipping = follow throttle
      const blend = clutchFactor;
      state.rpm = state.rpm * (1 - blend * 0.1) + targetEngineRPM * (blend * 0.1);
    }

    // Step engine physics (update RPM dari torque)
    this.engine.step(dt, 0, throttleInput); // loadTorque = 0, engine handle sendiri

    // Clamp RPM
    state.rpm = Math.max(0, Math.min(state.rpm, this.engine.getConfig().redline + 200));

    // Idle control
    if (state.rpm < this.engine.getConfig().idleRPM && state.isRunning) {
      state.rpm += (this.engine.getConfig().idleRPM - state.rpm) * dt * 5;
    }

    // Update crank angle
    const radsPerSecond = (state.rpm * 2 * Math.PI) / 60;
    state.crankAngle += radsPerSecond * dt;
    state.crankAngle %= 2 * Math.PI;

    // Launch timer logic
    this.updateLaunchTimer(state);
  }

  private updateLaunchTimer(state: SimulationState): void {
    const lt = state.launchTimer;
    if (lt.armed && !lt.running) {
      if (state.vehicleSpeed > 1) {
        lt.running = true;
        lt.startTime = performance.now();
      }
    }
    if (lt.running) {
      lt.elapsed = (performance.now() - lt.startTime) / 1000;
      lt.speed = state.vehicleSpeed;
      const targetSpeed = lt.target * 1.60934; // mph to km/h
      if (state.vehicleSpeed >= targetSpeed) {
        lt.running = false;
      }
    }
  }

  /** Arm the launch timer */
  armLaunchTimer(target: number): void {
    const state = this.engine.getState();
    state.launchTimer.armed = true;
    state.launchTimer.target = target;
    state.launchTimer.running = false;
    state.launchTimer.elapsed = 0;
  }

  /** Reset launch timer */
  resetLaunchTimer(): void {
    const state = this.engine.getState();
    state.launchTimer.armed = false;
    state.launchTimer.running = false;
    state.launchTimer.elapsed = 0;
  }

  /** Get speed in mph for display */
  getSpeedMPH(): number {
    return this.engine.getState().vehicleSpeed / 1.60934;
  }
}
```
**vite.config.ts**
```
import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    port: 3000,
    open: true,
  },
  build: {
    target: 'es2022',
  },
});
```
**tsconfig.json**
```
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "noUnusedLocals": false,
    "noUnusedParameters": false,
    "isolatedModules": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "sourceMap": true,
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src/**/*"]
}

```