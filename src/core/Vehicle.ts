import { Engine } from './Engine';
import { Drivetrain } from './Drivetrain';
import { EngineConfig, SimulationState } from './types';

/**
 * Vehicle orchestrator — ported concepts dari markeasting/engine-audio.
 * - 20x sub-stepping per frame
 * - Throttle: pow(throttle, 1.2) + pow(1-throttle, 1.2) * braking
 * - Idle: ratio(rpm, idle*0.9, idle) blend
 * - Limiter: soft (gradual cut) + hard (delay + feed-back)
 */
export class Vehicle {
  private engine: Engine;
  private drivetrain: Drivetrain;
  private wheelAngularVelocity = 0;
  private vehicleMass = 1500;
  private wheelRadius = 0.33;
  private dragCoefficient = 0.35;
  private frontalArea = 2.2;
  private airDensity = 1.225;
  private rollingResistance = 0.015;
  private wheelInertia = 1.5;

  // Limiter state
  private lastLimiterTime = 0;
  private limiterDelay = 100; // ms throttle feed-back delay

  private logFrame = 0;

  constructor(config: EngineConfig) {
    this.engine = new Engine(config);
    this.drivetrain = new Drivetrain(config.drivetrain);
  }

  getEngine(): Engine { return this.engine; }
  getDrivetrain(): Drivetrain { return this.drivetrain; }
  getState(): SimulationState { return this.engine.getState(); }
  setState(s: SimulationState) { this.engine.setState(s); }

  startEngine(): void {
    const state = this.engine.getState();
    state.ignitionOn = true;
    state.isStarterEngaged = false; // Jangan langsung start — tunggu E
    state.isRunning = false;
  }

  stopEngine(): void {
    const state = this.engine.getState();
    state.isRunning = false;
    state.ignitionOn = false;
    state.isStarterEngaged = false;
    state.rpm = 0;
  }

  /** Ratio function — map value [min,max] ke [0,1] */
  private ratio(value: number, min: number, max: number): number {
    return Math.max(0, Math.min(1, (value - min) / (max - min)));
  }

  step(dt: number, throttleInput: number, brakeInput: number): void {
    // ═══ SUB-STEPPING: 10x per frame buat stability ═══
    const subSteps = 10;
    const subDt = dt / subSteps;

    for (let s = 0; s < subSteps; s++) {
      this.subStep(subDt, throttleInput, brakeInput);
    }
  }

  private subStep(dt: number, throttleInput: number, brakeInput: number): void {
    const state = this.engine.getState();
    const config = this.engine.getConfig();

    state.throttle = throttleInput;
    state.brake = brakeInput;

    this.drivetrain.step(dt);

    const brakeTorque = brakeInput * 2000;
    const gear = this.drivetrain.getGear();
    const totalRatio = this.drivetrain.getTotalRatio();
    const clutchFactor = this.drivetrain.getClutchPosition();

    // ═══ REV LIMITER — Soft + Hard ═══
    let effectiveThrottle = throttleInput;
    const softLimiter = config.redline * 0.95;
    const now = performance.now();

    if (state.rpm >= softLimiter && throttleInput > 0) {
      // Soft limiter: gradual throttle cut
      const softRatio = this.ratio(state.rpm, softLimiter, config.redline);
      effectiveThrottle *= Math.pow(1 - softRatio, 0.05);
    }

    if (state.rpm >= config.redline) {
      // Hard limiter: fuel cut untuk limiterDelay ms
      effectiveThrottle = 0;
      if (now - this.lastLimiterTime > this.limiterDelay) {
        // Feed throttle back
        const feedBack = this.ratio(now - this.lastLimiterTime - this.limiterDelay, 0, 100);
        effectiveThrottle = throttleInput * feedBack;
      }
    } else if (this.lastLimiterTime > 0 && now - this.lastLimiterTime < this.limiterDelay) {
      // Masih dalam delay period
      effectiveThrottle = 0;
    } else {
      this.lastLimiterTime = 0;
    }

    if (state.rpm >= config.redline && this.lastLimiterTime === 0) {
      this.lastLimiterTime = now;
    }

    // ═══ TORSI MESIN ═══
    let engineTorque = 0;
    if (state.isRunning) {
      const peakTorque = this.engine.getMaxTorque();

      if (effectiveThrottle < 0.01) {
        // Off-throttle: engine braking
        const braking = peakTorque * 0.35 * Math.min(1, state.rpm / config.redline);
        engineTorque = -braking;
      } else {
        // On-throttle: pow(throttle, 1.2) — reference formula
        engineTorque = this.engine.getTorqueAtRPM(state.rpm) * Math.pow(effectiveThrottle, 1.2);
      }
    } else {
      state.throttle = 0;
      engineTorque = 0;
      // Jangan reset RPM kalau starter lagi engaged
      if (state.rpm < 50 && !state.isStarterEngaged) {
        state.rpm = 0;
      }
    }

    // ═══ CLUTCH / DRIVETRAIN ═══
    const rawTarget = (gear > 0) ? state.wheelRPM * totalRatio : 0;
    const effectiveTarget = Math.max(rawTarget, config.idleRPM);
    let clutchTorque = 0;

    if (gear > 0 && clutchFactor > 0 && state.isRunning) {
      const rpmDiff = state.rpm - effectiveTarget;
      const springK = 0.5;
      const maxClutchCapacity = 500 * clutchFactor;
      clutchTorque = rpmDiff * springK * clutchFactor;
      clutchTorque = Math.max(-maxClutchCapacity, Math.min(maxClutchCapacity, clutchTorque));
    }

    // ═══ INERSIA MESIN ═══
    const netEngineTorque = engineTorque - clutchTorque;
    const engineAlpha = netEngineTorque / config.flywheelInertia;
    const rpmChange = engineAlpha * dt * (30 / Math.PI);
    state.rpm += rpmChange;

    // Hard-lock blend
    if (gear > 0 && clutchFactor >= 0.99 && Math.abs(state.rpm - effectiveTarget) < 100 && state.isRunning) {
      state.rpm = state.rpm * 0.9 + effectiveTarget * 0.1;
    }

    // ═══ IDLE CONTROL — ratio blend ═══
    if (state.isRunning) {
      const idleBlend = this.ratio(state.rpm, config.idleRPM * 0.9, config.idleRPM);
      if (state.rpm < config.idleRPM) {
        // Snap kalau terlalu rendah
        if (state.rpm < config.idleRPM * 0.5) {
          state.rpm = config.idleRPM;
        } else {
          state.rpm += (config.idleRPM - state.rpm) * dt * 10 * idleBlend;
        }
      }
    }

    // Clamp RPM
    state.rpm = Math.max(state.isRunning ? config.idleRPM * 0.5 : 0, Math.min(state.rpm, config.redline + 200));

    // ═══ FISIKA RODA ═══
    const wheelTorque = (gear > 0 && state.isRunning) ? clutchTorque * totalRatio : 0;
    const wheelSpeed = this.wheelAngularVelocity * this.wheelRadius;

    const dragForce = 0.5 * this.airDensity * this.dragCoefficient * this.frontalArea * wheelSpeed * Math.abs(wheelSpeed);

    let rollingForce = 0;
    let brakingForce = 0;
    if (Math.abs(wheelSpeed) > 0.1) {
      rollingForce = Math.sign(wheelSpeed) * this.rollingResistance * this.vehicleMass * 9.81;
      brakingForce = Math.sign(wheelSpeed) * (brakeTorque / this.wheelRadius);
    }

    const netWheelForce = (wheelTorque / this.wheelRadius) - dragForce - rollingForce - brakingForce;
    const effectiveMass = this.vehicleMass + this.wheelInertia / (this.wheelRadius * this.wheelRadius);
    const linearAcceleration = netWheelForce / effectiveMass;
    const wheelAcceleration = linearAcceleration / this.wheelRadius;

    this.wheelAngularVelocity += wheelAcceleration * dt;

    if (Math.abs(this.wheelAngularVelocity) < 0.1 && brakeTorque > 0) {
      this.wheelAngularVelocity = 0;
    } else {
      this.wheelAngularVelocity = Math.max(0, this.wheelAngularVelocity);
    }

    const vehicleSpeed = this.wheelAngularVelocity * this.wheelRadius;
    state.vehicleSpeed = vehicleSpeed * 3.6;
    state.wheelRPM = (this.wheelAngularVelocity * 60) / (2 * Math.PI);

    // Engine step
    this.engine.step(dt, 0, throttleInput);

    // Debug log
    this.logFrame++;
    if (this.logFrame % 30 === 0) {
      console.log(
        `[Vehicle] RPM=${Math.round(state.rpm)} | Gear=${gear} | ` +
        `Throttle=${throttleInput.toFixed(2)} | EffThrottle=${effectiveThrottle.toFixed(2)} | ` +
        `Speed=${(state.vehicleSpeed).toFixed(1)}km/h` +
        (state.rpm >= config.redline ? ' | [REV LIMITED]' : '')
      );
    }

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
      const targetSpeed = lt.target * 1.60934;
      if (state.vehicleSpeed >= targetSpeed) lt.running = false;
    }
  }

  armLaunchTimer(target: number): void {
    const state = this.engine.getState();
    state.launchTimer.armed = true;
    state.launchTimer.target = target;
    state.launchTimer.running = false;
    state.launchTimer.elapsed = 0;
  }

  resetLaunchTimer(): void {
    const state = this.engine.getState();
    state.launchTimer.armed = false;
    state.launchTimer.running = false;
    state.launchTimer.elapsed = 0;
  }

  getSpeedMPH(): number {
    return this.engine.getState().vehicleSpeed / 1.60934;
  }
}
