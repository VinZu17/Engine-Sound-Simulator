# Engine Simulator

A browser-based engine simulator with realistic physics simulation, 3D engine rendering, and real-time audio synthesis. Built with TypeScript, Three.js, and WebAudio API.

![Engine Simulator](https://img.shields.io/badge/TypeScript-5.7-blue?logo=typescript)
![Three.js](https://img.shields.io/badge/Three.js-0.170-black?logo=three.js)
![Vite](https://img.shields.io/badge/Vite-6.0-646CFF?logo=vite)

## Features

### Physics Simulation
- **Engine Physics**: Torque curves, RPM calculation, flywheel inertia, engine braking
- **Drivetrain**: 6-speed gearbox with clutch animation, final drive ratio
- **Vehicle Dynamics**: Aerodynamic drag, rolling resistance, brake torque, wheel inertia
- **Rev Limiter**: Soft fade approach + hard fuel cut at redline
- **Idle Control**: Automatic RPM recovery when engine is running

### 3D Engine Rendering
- Procedural 3D engine model (block, pistons, crankshaft, flywheel, exhaust manifold)
- Piston animation synced to crank angle + firing order
- Auto-orbit camera around the engine
- Dynamic cylinder count based on selected engine

### Audio System (3-Layer Architecture)
- **AudioWorklet** (Primary): Per-cylinder combustion pulse simulation, soft clipping, valve train noise, engine-type-specific firing orders
- **SynthEngine** (Fallback): Oscillator-based synthesis with 5 harmonics, sub-bass, exhaust resonance, intake noise
- **EngineSound** (Samples): WAV sample-based playback with equal-power crossfade and pitch shifting

### Dashboard & UI
- Canvas-based RPM + Speed gauges with clockwise rotation, warning zones, tick marks
- LED-style shift light bar (green → yellow → red)
- H-pattern gear indicator
- Clutch, Brake, Throttle pedal bars
- Launch timer (0-60, 0-100, 60-130 mph)
- Dark theme UI inspired by professional racing simulators

## Engine Presets

| Engine | Type | Cylinders | Redline | Character |
|--------|------|-----------|---------|-----------|
| Lexus LFA V10 | V10 | 10 | 9,000 RPM | High-pitch scream |
| Subaru EJ25 | Boxer | 4 | 7,000 RPM | Unequal-length header rumble |
| Toyota 2JZ-GTE | Inline-6 | 6 | 7,800 RPM | Smooth & clean |
| Honda F20C (VTEC) | Inline-4 | 4 | 9,000 RPM | VTEC crossover |
| BMW M52B28 | Inline-6 | 6 | 6,500 RPM | Smooth & refined |
| Ferrari F136 V8 | Crossplane V8 | 8 | 9,000 RPM | Aggressive crossplane |

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Build | Vite 6 |
| Language | TypeScript 5.7 |
| 3D Rendering | Three.js 0.170 |
| Audio | WebAudio API + AudioWorklet |
| Physics | Custom simulation (TypeScript) |
| UI | Vanilla HTML/CSS/TypeScript |

## Project Structure

```
engine-simulator-app/
├── index.html                    # Entry HTML
├── package.json                  # Dependencies
├── tsconfig.json                 # TypeScript config
├── vite.config.ts                # Vite config
├── public/
│   ├── models/                   # GLTF engine models (future)
│   └── sounds/                   # Engine sound samples (.wav)
│       ├── lexus-lfa-v10/
│       ├── subaru-ej25/
│       ├── toyota-2jz/
│       ├── honda-f20c/
│       ├── bmw-m52b28/
│       └── ferrari-f136-v8/
└── src/
    ├── main.ts                   # App entry point + game loop
    ├── style.css                 # Dark theme styles
    ├── core/
    │   ├── types.ts              # TypeScript interfaces
    │   ├── Engine.ts             # Engine physics (torque, RPM, rev limiter)
    │   ├── Drivetrain.ts         # Gearbox, clutch, gear ratios
    │   └── Vehicle.ts            # Vehicle dynamics orchestrator
    ├── audio/
    │   ├── AudioManager.ts       # Audio orchestrator (Worklet + Synth + Samples)
    │   ├── EngineNode.ts         # AudioWorklet main thread wrapper
    │   ├── EngineSound.ts        # WAV sample-based playback
    │   ├── SynthEngine.ts        # Oscillator-based fallback synthesis
    │   └── worklets/
    │       └── engine-processor.ts  # AudioWorklet processor (background thread)
    ├── render/
    │   ├── EngineRenderer.ts     # Three.js 3D engine model
    │   └── DashboardGauges.ts    # Canvas-based RPM + Speed gauges
    ├── ui/
    │   └── UIManager.ts         # UI layout + state updates
    ├── input/
    │   └── KeyboardInput.ts     # Keyboard controls
    └── config/
        └── engines.ts           # Engine preset configurations
```

## Getting Started

### Prerequisites
- Node.js 18+
- npm or yarn

### Installation

```bash
# Clone the repository
git clone <repository-url>
cd engine-simulator-app

# Install dependencies
npm install

# Start development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### Build for Production

```bash
npm run build
npm run preview
```

## Controls

| Key | Action |
|-----|--------|
| `R` | Toggle ignition on/off |
| `E` (hold) | Starter motor (crank engine) |
| `Space` | Throttle (100%) |
| `B` | Brake (hold) |
| `C` | Clutch (hold to disengage) |
| `Arrow Up` | Shift up |
| `Arrow Down` | Shift down |
| `1-6` | Direct gear selection |

## Architecture

### Physics Pipeline
```
Input (keyboard) → Vehicle.step(dt) → Engine torque + Drivetrain coupling
                                    → Wheel dynamics (drag, rolling, brake)
                                    → RPM update (inertia + idle control)
                                    → Rev limiter check
```

### Audio Pipeline
```
RPM + Throttle → AudioManager.update()
                    ├── EngineNode (AudioWorklet) → Per-cylinder combustion
                    ├── SynthEngine (fallback) → Oscillator harmonics
                    └── EngineSound (samples) → WAV crossfade + pitch
                              ↓
                         MasterGain → AudioContext.destination
                         (muted when engine OFF)
```

### Rendering Pipeline
```
Crank angle → EngineRenderer.update() → Three.js scene render
RPM + Speed → DashboardGauges.update() → Canvas gauge redraw
```

## Physics Formulas

### Torque Interpolation
```
torque = lerp(torqueCurve[a], torqueCurve[b], t)
where t = (rpm - a.rpm) / (b.rpm - a.rpm)
```

### Engine Braking
```
brakingTorque = -(peakTorque × 0.35 × rpmRatio)
```

### Vehicle Acceleration
```
F_net = F_engine - F_drag - F_rolling - F_brake
F_drag = 0.5 × ρ × Cd × A × v²
F_rolling = μ × m × g
a = F_net / (m + I_wheel / r²)
```

### Wheel Speed
```
wheelRPM = engineRPM / (gearRatio × finalDrive)
wheelSpeed = wheelRPM × tireCircumference / 60
```

### Audio Firing Frequency
```
f_firing = (RPM / 60) × (cylinders / 2)  // 4-stroke engine
```

## Engine Sound Types (AudioWorklet)

| Type | Firing Offsets | Character |
|------|---------------|-----------|
| `INLINE_4` | 0°, 360°, 180°, 540° | VTEC character |
| `BOXER_4` | Uneven offsets | Rumble (unequal headers) |
| `INLINE_6` | 120° spacing | Smooth & clean |
| `V8_CROSSPLANE` | Uneven crossplane | Aggressive |
| `V10` | 72° even spacing | High-pitch scream |

## Browser Support

| Browser | Status |
|---------|--------|
| Chrome 66+ | Full support |
| Firefox 76+ | Full support |
| Safari 14.1+ | Full support |
| Edge 79+ | Full support |

> **Note**: AudioWorklet requires a secure context (HTTPS or localhost).

## Roadmap

- [ ] GLTF engine model loading (Blender export)
- [ ] Real engine sound samples (recorded from actual cars)
- [ ] Exhaust particle effects
- [ ] Gearbox sound effects
- [ ] Tire screech sounds
- [ ] Wind noise at high speed
- [ ] Dashboard HUD redesign
- [ ] Gamepad input support
- [ ] Electron/Tauri desktop wrapper
- [ ] Multiple camera angles
- [ ] Dyno mode (power/torque curves)
- [ ] Engine builder (custom configurations)

## License

MIT

## Acknowledgments

- [ange-yaghi/engine-sim](https://github.com/ange-yaghi/engine-sim) — Physics concepts and engine simulation reference
- [markeasting/engine-audio](https://github.com/markeasting/engine-audio) — Audio synthesis concepts and sample blending approach
- [Three.js](https://threejs.org/) — 3D rendering library
- [Web Audio API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API) — Real-time audio processing
