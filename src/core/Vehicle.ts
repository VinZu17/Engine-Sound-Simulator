import { Engine } from './Engine';
import { Drivetrain } from './Drivetrain';
import { EngineConfig, SimulationState } from './types';

/**
 * Vehicle orchestrator — ported dari engine-sim + markeasting.
 * - 10x sub-stepping per frame (stability)
 * - Crank angle torque modulation + volumetric efficiency (engine-sim)
 * - Ignition-cut rev limiter (engine-sim)
 * - Clutch inertia coupling (engine-sim transmission.cpp)
 * - PD controller idle (engine-sim governor)
 * - RPM-dependent engine braking (engine-sim)
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

  // Ignition-cut rev limiter (dari engine-sim: cut ignition 0.5s)
  private ignitionCutTimer = 0;

  // Idle PD controller (dari engine-sim governor: PD on speed-squared)
  private idleVelocity = 0;

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

    // ═══ IGNITION-CUT REV LIMITER (dari engine-sim ignition_module.cpp) ═══
    let isRevLimited = false;
    if (state.rpm >= config.redline) {
      this.ignitionCutTimer = 0.5;
    }
    if (this.ignitionCutTimer > 0) {
      this.ignitionCutTimer -= dt;
      this.ignitionCutTimer = Math.max(0, this.ignitionCutTimer);
      isRevLimited = true;
    }

    // ═══ TORSI MESIN — Complete pipeline ═══
    const engineTorque = this.engine.calculateNetTorque(throttleInput, isRevLimited);

    // ═══ CLUTCH INERTIA COUPLING (dari engine-sim transmission.cpp) ═══
    let clutchTorque = 0;
    if (gear > 0 && clutchFactor > 0 && state.isRunning) {
      const maxClutchCapacity = 500 * clutchFactor;
      const targetEngineRPM = state.wheelRPM * totalRatio;
      const rpmDiff = state.rpm - Math.max(targetEngineRPM, config.idleRPM);
      clutchTorque = rpmDiff * 0.5 * clutchFactor;
      clutchTorque = Math.max(-maxClutchCapacity, Math.min(maxClutchCapacity, clutchTorque));

      // Energy conservation during hard-lock
      if (clutchFactor >= 0.99 && Math.abs(rpmDiff) < 50) {
        const f = this.wheelRadius / totalRatio;
        const I_total = config.flywheelInertia + this.vehicleMass * f * f;
        const E_rot = 0.5 * I_total * Math.pow(state.rpm * Math.PI / 30, 2);
        const targetOmega = targetEngineRPM * Math.PI / 30;
        const newOmega = Math.sign(targetOmega) * Math.sqrt(Math.abs(2 * E_rot / I_total));
        state.rpm = newOmega * 30 / Math.PI;
        clutchTorque = 0;
      }
    }

    // ═══ RPM UPDATE ═══
    const netEngineTorque = engineTorque - clutchTorque;
    if (state.isRunning) {
      const inertia = (gear > 0 && clutchFactor > 0.1)
        ? config.flywheelInertia + this.vehicleMass * Math.pow(this.wheelRadius / totalRatio, 2) * clutchFactor
        : config.flywheelInertia;
      const alpha = netEngineTorque / inertia;
      state.rpm += alpha * dt * (30 / Math.PI);
    } else {
      state.throttle = 0;
    }

    // ═══ IDLE PD CONTROLLER (dari engine-sim governor.cpp) ═══
    if (state.isRunning && !isRevLimited) {
      if (state.rpm < config.idleRPM * 1.1) {
        const ds = config.idleRPM * config.idleRPM - state.rpm * state.rpm;
        // ds > 0 when below idle → need positive torque to pull up
        this.idleVelocity += dt * (ds * 0.0001) - this.idleVelocity * dt * 0.5;
        this.idleVelocity = Math.max(-0.3, Math.min(0.3, this.idleVelocity));
        const idleTorque = this.idleVelocity * config.flywheelInertia * 100;
        state.rpm += (idleTorque / config.flywheelInertia) * dt * (30 / Math.PI);
      }
      if (state.rpm < config.idleRPM * 0.5) {
        state.rpm += (config.idleRPM - state.rpm) * dt * 8;
      }
    }

    // Clamp RPM
    if (!state.isRunning && !state.isStarterEngaged) {
      state.rpm = Math.max(0, state.rpm);
    } else if (state.isRunning) {
      state.rpm = Math.max(config.idleRPM * 0.4, Math.min(state.rpm, config.redline + 300));
    }

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
        `Throttle=${throttleInput.toFixed(2)} | ` +
        `Speed=${(state.vehicleSpeed).toFixed(1)}km/h` +
        (isRevLimited ? ' | [IGNITION CUT]' : '')
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
