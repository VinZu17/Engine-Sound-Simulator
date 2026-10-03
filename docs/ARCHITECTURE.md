# Architecture Notes

This document explains how the simulator moves input through physics, drivetrain, rendering, and audio.

## Runtime Flow

```
KeyboardInput
    │
    ▼
UI / Simulation State
    │
    ▼
Vehicle.step()
    │
    ├── Drivetrain.step()
    ├── Engine.calculateNetTorque()
    │      ├── Torque curve lookup
    │      ├── Volumetric efficiency
    │      ├── Crank-angle modulation
    │      ├── Throttle response
    │      └── Engine braking
    ├── Clutch + drivetrain coupling
    ├── RPM / idle controller
    ├── Wheel force calculation
    │      ├── Drive torque
    │      ├── Aerodynamic drag
    │      ├── Rolling resistance
    │      └── Brake force
    └── Engine.step() / state update
             │
             ├──────────────► Dashboard / 3D rendering
             │
             └──────────────► Audio systems
```

## Physics Update

`Vehicle.step()` divides each frame into **10 sub-steps**. Each sub-step updates the drivetrain, engine torque, clutch coupling, RPM, wheel forces, and engine state.

Sub-stepping keeps the simulation more stable when frame time changes.

## Engine Torque Pipeline

The engine starts with an interpolated torque-curve value for the current RPM. That value is then modified by:

1. Volumetric-efficiency approximation.
2. Crank-angle combustion modulation.
3. Non-linear throttle response using `throttle^1.2`.
4. RPM-dependent engine braking when the throttle is released.
5. Rev-limiter ignition cut when the redline is reached.

The resulting net torque is used to update engine RPM and, through the clutch, wheel torque.

## Drivetrain Coupling

The drivetrain provides the selected gear ratio, total ratio, and clutch position. When the clutch is engaged, engine RPM is coupled to wheel RPM through the transmission ratio.

The vehicle also accounts for the effective inertia contributed by the wheels and vehicle mass. This makes RPM changes depend on both engine inertia and drivetrain load.

## Wheel Forces

The wheel model converts drivetrain torque into longitudinal force and subtracts:

- aerodynamic drag
- rolling resistance
- brake force

The resulting net force is divided by effective vehicle mass to obtain linear acceleration.

Vehicle speed and wheel RPM are then written back into the shared simulation state.

## State Ownership

`Engine` owns the shared `SimulationState` object. `Vehicle` coordinates the engine and drivetrain and updates vehicle-level motion.

This separation keeps engine behavior, transmission behavior, and vehicle orchestration independent enough to extend without moving all simulation logic into one class.

## Extending the Simulator

When adding a new system, prefer keeping its responsibilities local:

- **Engine behavior:** `src/core/Engine.ts`
- **Transmission behavior:** `src/core/Drivetrain.ts`
- **Vehicle orchestration:** `src/core/Vehicle.ts`
- **Engine configurations:** `src/config/engines.ts`
- **Audio behavior:** `src/audio/`
- **Rendering:** `src/render/`
- **Input:** `src/input/`

For changes that affect multiple systems, update the state/types first and keep the data flow explicit between systems.