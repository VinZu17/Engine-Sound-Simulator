import { EngineConfig, SimulationState } from './types';

/**
 * Core engine simulation — ported dari engine-sim + markeasting.
 * - Crank angle torque modulation (individual cylinder firings)
 * - Volumetric efficiency curve (torque peaks at mid-RPM)
 * - Throttle curve: pow(throttle, 1.2)
 * - Ignition-cut rev limiter
 * - Engine braking: RPM-dependent compression model
 */
export class Engine {
  private config: EngineConfig;
  private state: SimulationState;
  private firingAngle: number;

  constructor(config: EngineConfig) {
    this.config = config;
    this.firingAngle = (4 * Math.PI) / config.cylinders;
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

  /**
   * Crank angle torque modulation — simulasi individual cylinder combustion pulses.
   * Setiap cylinder menghasilkan Gaussian pulse saat power stroke.
   * Total torque = baseTorque × (0.7 + 0.3 × normalizedModulation)
   */
  getCrankTorqueModulation(baseTorque: number): number {
    const crankAngle = this.state.crankAngle;
    const cylinders = this.config.cylinders;
    let modTorque = 0;
    for (let i = 0; i < cylinders; i++) {
      const phase = crankAngle - (i * this.firingAngle);
      const normalizedPhase = ((phase % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
      const pulse = Math.exp(-Math.pow((normalizedPhase - 0.3) * 4, 2));
      modTorque += pulse;
    }
    modTorque /= cylinders;
    return baseTorque * (0.7 + 0.3 * modTorque);
  }

  /**
   * Simplified volumetric efficiency — peaks di 60% redline.
   * Drops di very low RPM (poor intake filling) dan high RPM (restrictions).
   */
  getVolumetricEfficiency(rpm: number): number {
    if (rpm < 100) return 0.5;
    const norm = rpm / this.config.redline;
    return 0.82 + 0.18 * Math.exp(-Math.pow((norm - 0.6) * 2.8, 2));
  }

  /**
   * Engine braking — peaks di mid-RPM (compression + pumping losses).
   */
  getEngineBraking(rpm: number): number {
    const peakTorque = this.getMaxTorque();
    const norm = rpm / this.config.redline;
    const brakingFactor = 0.28 * Math.sin(norm * Math.PI * 0.85) + 0.07;
    return -(peakTorque * brakingFactor);
  }

  /**
   * Complete torque pipeline: lookup × VE × crankMod × throttle^1.2 + braking
   */
  calculateNetTorque(throttle: number, isRevLimited: boolean): number {
    if (!this.state.isRunning || isRevLimited) return 0;
    const baseTorque = this.getTorqueAtRPM(this.state.rpm);
    const ve = this.getVolumetricEfficiency(this.state.rpm);
    const crankMod = this.getCrankTorqueModulation(baseTorque);
    const throttleFactor = Math.pow(Math.max(0, throttle), 1.2);
    const braking = throttle < 0.01 ? this.getEngineBraking(this.state.rpm) : 0;
    return crankMod * ve * throttleFactor + braking;
  }

  /** Starter motor — spring-damper ke target RPM (dari engine-sim starter_motor.cpp) */
  applyStarter(dt: number): void {
    if (this.state.isStarterEngaged && this.state.ignitionOn) {
      const targetRPM = 1500;
      const starterTorque = 80;
      const rpmError = targetRPM - this.state.rpm;
      const torque = Math.sign(rpmError) * Math.min(Math.abs(rpmError * 0.3), starterTorque);
      const alpha = torque / this.config.flywheelInertia;
      this.state.rpm += alpha * dt * (30 / Math.PI);
      if (this.state.rpm >= 800) {
        this.state.isRunning = true;
        this.state.isStarterEngaged = false;
      }
    }
  }

  step(dt: number, _loadTorque: number, _throttleInput: number): void {
    if (!this.state.isRunning) {
      this.applyStarter(dt);
      if (this.state.rpm > 0) {
        const radsPerSecond = (this.state.rpm * 2 * Math.PI) / 60;
        this.state.crankAngle += radsPerSecond * dt;
        this.state.crankAngle %= (4 * Math.PI);
      }
      return;
    }
    const radsPerSecond = (this.state.rpm * 2 * Math.PI) / 60;
    this.state.crankAngle += radsPerSecond * dt;
    this.state.crankAngle %= (4 * Math.PI);
  }

  isAtRevLimiter(): boolean {
    return this.state.rpm >= this.config.redline - 50;
  }

  getCrankFraction(): number {
    return (this.state.crankAngle % (2 * Math.PI)) / (2 * Math.PI);
  }

  getCylinderFiringAngle(cylinderIndex: number): number {
    const totalAngle = 4 * Math.PI;
    const cylinderSpacing = totalAngle / this.config.cylinders;
    return (this.state.crankAngle + cylinderIndex * cylinderSpacing) % totalAngle;
  }
}
