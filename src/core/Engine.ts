import { EngineConfig, SimulationState } from './types';

/**
 * Core engine simulation — ported concepts dari markeasting/engine-audio.
 * - Throttle curve: pow(throttle, 1.2)
 * - Idle control: ratio(rpm, idle*0.9, idle)
 * - Limiter: soft + hard dengan delay
 * - Engine braking: pow(1-throttle, 1.2) * braking
 */
export class Engine {
  private config: EngineConfig;
  private state: SimulationState;
  private lastLimiterTime = 0;

  constructor(config: EngineConfig) {
    this.config = config;
    this.state = {
      rpm: 0,
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
        armed: false, running: false, startTime: 0,
        target: 60, elapsed: 0, speed: 0,
      },
    };
  }

  getConfig(): EngineConfig { return this.config; }
  getState(): SimulationState { return this.state; }
  setState(s: SimulationState) { this.state = s; }

  getTorqueAtRPM(rpm: number): number {
    const curve = this.config.torqueCurve;
    if (rpm <= curve[0].rpm) return curve[0].nm;
    if (rpm >= curve[curve.length - 1].rpm) return curve[curve.length - 1].nm;
    for (let i = 0; i < curve.length - 1; i++) {
      const a = curve[i], b = curve[i + 1];
      if (rpm >= a.rpm && rpm <= b.rpm) {
        const t = (rpm - a.rpm) / (b.rpm - a.rpm);
        return a.nm + t * (b.nm - a.nm);
      }
    }
    return 0;
  }

  getMaxTorque(): number {
    return Math.max(...this.config.torqueCurve.map((p) => p.nm));
  }

  /** Engine braking — pow(1-throttle, 1.2) × braking */
  getEngineBraking(rpm: number): number {
    const peakTorque = this.getMaxTorque();
    const rpmRatio = Math.min(1, rpm / this.config.redline);
    return -(peakTorque * 0.35 * rpmRatio);
  }

  /** Ratio function — map value from [min,max] to [0,1] */
  private ratio(value: number, min: number, max: number): number {
    return Math.max(0, Math.min(1, (value - min) / (max - min)));
  }

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

  isAtRevLimiter(): boolean {
    return this.state.rpm >= this.config.redline - 50;
  }

  getCrankFraction(): number {
    return this.state.crankAngle / (2 * Math.PI);
  }

  getCylinderFiringAngle(cylinderIndex: number): number {
    const totalAngle = 2 * Math.PI;
    const cylinderSpacing = totalAngle / this.config.cylinders;
    return (this.state.crankAngle + cylinderIndex * cylinderSpacing) % totalAngle;
  }
}
