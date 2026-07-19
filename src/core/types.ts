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
