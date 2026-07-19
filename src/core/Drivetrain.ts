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
