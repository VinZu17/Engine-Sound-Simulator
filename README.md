<div align="center">

# 🔧 Engine Sound Simulator

### Realistic engine sound synthesis meets browser physics

![TypeScript](https://img.shields.io/badge/TypeScript-5.7-blue?logo=typescript&logoColor=white)
![Three.js](https://img.shields.io/badge/Three.js-0.170-black?logo=threedotjs&logoColor=white)
![Vite](https://img.shields.io/badge/Vite-6.0-646CFF?logo=vite&logoColor=white)
![WebAudio](https://img.shields.io/badge/WebAudio-API-4ade80?logo=webaudio&logoColor=white)
![License](https://img.shields.io/badge/License-MIT-yellow)

A browser-based engine simulator featuring real-time audio synthesis, procedural 3D engine rendering, and realistic vehicle physics. Built entirely in TypeScript with zero external audio dependencies.

[**Live Demo**](https://vinzu17.github.io/Engine-Sound-Simulator/) · [**Report Bug**](https://github.com/VinZu17/Engine-Sound-Simulator/issues)

---

## 🎯 What This Project Does

Engine Sound Simulator combines a custom vehicle physics model with procedural engine audio and a real-time 3D dashboard. Change throttle, gears, and engine presets to hear and see how RPM-driven simulation affects the engine.

<div align="left">

## ✨ Features

### 🎵 Audio System
- **SynthEngine** — Realtime oscillator-based synthesis with 5 exhaust harmonics, sub-bass, intake noise, mechanical clatter
- **EngineSound** — Sample-based playback with equal-power crossfade and pitch shifting
- **Convolution IR** — Exhaust resonance via impulse response
- **Idle variation** — Dual LFO system for realistic idle "lope" effect
- **Exhaust popping** — Backfire sound on throttle release
- **Turbo flutter** — "Stututu" sound on boost pressure release
- **Rev limiter** — Aggressive stutter effect at redline

### 🚗 Physics Engine
- **Torque curves** — Per-engine interpolated torque maps
- **Drivetrain** — 6-speed gearbox with clutch coupling and gear ratios
- **Vehicle dynamics** — Aerodynamic drag, rolling resistance, brake torque, wheel inertia
- **Rev limiter** — Soft fade (95% redline) + hard fuel cut with delay
- **Idle control** — Automatic RPM recovery with ratio-based blending
- **Engine braking** — `pow(throttle, 1.2)` torque curve with deceleration

### 🎮 Controls

| Key          | Action                         |
|--------------|--------------------------------|
| `R`          | Toggle ignition on/off         |
| `E` (hold)   | Starter motor (crank engine)   |
| `Space`      | Throttle                       |
| `B`          | Brake                          |
| `C` (hold)   | Clutch (disengage)             |
| `Arrow Up`   | Shift up                       |
| `Arrow Down` | Shift down                     |

---

## 🏎️ Engine Presets

| Engine               | Type            | Cylinders | Redline   | Sound Character              |
|----------------------|-----------------|-----------|---------  |------------------------------|
| **Lexus LFA V10**    | V10             | 10        | 9,000 RPM | High-pitch scream            |
| **Subaru EJ25**      | Boxer-4         | 4         | 7,000 RPM | Unequal-length header rumble |
| **Toyota 2JZ-GTE**   | Inline-6        | 6         | 7,800 RPM | Smooth & clean               |
| **Honda F20C**       | Inline-4        | 4         | 9,000 RPM | VTEC crossover character     |
| **BMW M52B28**       | Inline-6        | 6         | 6,500 RPM | Smooth & refined             |
| **Ferrari F136 V8**  | Crossplane V8   | 8         | 9,000 RPM | Aggressive crossplane        |

---

## 🛠️ Tech Stack

| Layer     | Technology        | Purpose                     |
|-----------|-------------------|-----------------------------|
| Build     | Vite 6            | Dev server + bundler        |
| Language  | TypeScript 5.7    | Type-safe development       |
| 3D Render | Three.js          | Procedural engine model     |
| Audio     | WebAudio API      | Realtime synthesis          |
| Physics   | Custom TypeScript | Vehicle dynamics simulation |
| UI        | Vanilla HTML/CSS  | Dark theme racing UI        |

---

## 🚀 Getting Started

```bash
# Clone
git clone https://github.com/VinZu17/Engine-Sound-Simulator.git
cd Engine-Sound-Simulator

# Install
npm install

# Run
npm run dev
```

Open **http://localhost:3000** in your browser.

---

## 📁 Project Structure

```
src/
├── main.ts                 # Entry point + game loop
├── core/
│   ├── Engine.ts           # Engine torque, RPM, rev limiter
│   ├── Drivetrain.ts       # 6-speed gearbox, clutch
│   └── Vehicle.ts          # Vehicle dynamics orchestrator
├── audio/
│   ├── SynthEngine.ts      # Oscillator synthesis (idle, exhaust, intake)
│   ├── EngineSound.ts      # Sample-based playback + crossfade
│   └── AudioManager.ts     # Audio routing + convolution IR
├── render/
│   ├── EngineRenderer.ts   # Three.js 3D engine model
│   └── DashboardGauges.ts  # Canvas RPM + Speed gauges
├── ui/
│   └── UIManager.ts        # Layout + state management
├── input/
│   └── KeyboardInput.ts    # Keyboard controls
└── config/
    └── engines.ts          # Engine preset definitions
```

---

## 🏗️ Architecture

```
┌─────────────┐       ┌──────────────┐       ┌───────────────┐
│   Input     │────▶ │  Physics     │────▶  │     Audio     │
│  (Keyboard) │       │  (Vehicle)   │       │  (SynthEngine)│
└─────────────┘       └──────┬───────┘       └──────┬────────┘
                             │                      │
                      ┌──────▼───────┐       ┌──────▼───────┐
                      │   3D Render  │       │  Convolver   │
                      │  (Three.js)  │       │  (IR Reverb) │
                      └──────┬───────┘       └──────┬───────┘
                             │                      │
                      ┌──────▼──────────────────────▼────────┐
                      │          Canvas Dashboard            │
                      │     (RPM Gauge + Speed Gauge)        │
                      └──────────────────────────────────────┘
```

---

## 🔊 Audio Pipeline

```
RPM + Throttle
    ├── SynthEngine (5 harmonics + sub-bass + intake + mechanical)
    │   ├── Exhaust: firing frequency × harmonic multipliers
    │   ├── Idle LFO: volume + frequency modulation
    │   ├── Intake: bandpass noise (throttle-proportional)
    │   ├── Mechanical: highpass clatter (RPM-proportional)
    │   └── Rev limiter: square wave stutter modulation
    │
    └── EngineSound (sample-based)
        ├── 4 simultaneous looping samples
        ├── Equal-power crossfade: cos((1-x)π/2)
        └── Pitch shift: detune = (rpm - baseRPM) × 0.2 cents
              │
         MasterGain ──▶ ConvolverNode (IR) ──▶ Destination
         (mute when engine OFF)
```

---

## ⚙️ Physics Model

| Formula                                             | Description                             |
|-----------------------------------------------------|-----------------------------------------|
| `torque = getTorqueAtRPM(rpm) × pow(throttle, 1.2)` | Engine torque with power curve          |
| `braking = -peakTorque × 0.35 × rpmRatio`           | Engine braking (off-throttle)           |
| `F_drag = 0.5 × ρ × Cd × A × v²`                    | Aerodynamic drag                        |
| `F_rolling = μ × m × g`                             | Rolling resistance                      |
| `a = F_net / (m + I_wheel/r²)`                      | Vehicle acceleration with wheel inertia |
| `RPM = wheelRPM × gearRatio × finalDrive`           | Engine-wheel coupling                   |

---

## 📚 Documentation

| Document | Contents |
|----------|----------|
| [Controls Reference](docs/CONTROLS.md) | Keyboard controls, startup sequence, basic operating tips |
| [Engine Presets Reference](docs/ENGINE_PRESETS.md) | The six built-in engine presets, cylinder layouts, redlines, sound character |
| [Architecture Notes](docs/ARCHITECTURE.md) | How input, physics, drivetrain, rendering, and audio fit together |
| [Development Commands](docs/DEVELOPMENT_COMMANDS.md) | npm commands for local development and production builds |
| [Troubleshooting](TROUBLESHOOTING.md) | Startup, audio, engine-control, build, and keyboard-focus problems |
| [Contributing](CONTRIBUTING.md) | How to propose and submit changes |

---

## 📋 Roadmap

- [x] Core physics simulation
- [x] 3D engine rendering (Three.js)
- [x] Audio synthesis (SynthEngine + samples)
- [x] 6 engine presets
- [x] Rev limiter, exhaust popping, turbo flutter
- [ ] GLTF engine model loading
- [ ] Real recorded engine sound samples
- [ ] Exhaust particle effects
- [ ] Gamepad input support
- [ ] Electron/Tauri desktop wrapper
- [ ] Dyno mode (power/torque curves)

---

## 🙏 Acknowledgments

- [ange-yaghi/engine-sim](https://github.com/ange-yaghi/engine-sim) — Physics and gas dynamics reference
- [markeasting/engine-audio](https://github.com/markeasting/engine-audio) — Audio sample blending approach
- [Three.js](https://threejs.org/) — 3D rendering
- [Web Audio API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API) — Realtime audio

---

## 📄 License

MIT © [VinZu17](https://github.com/VinZu17)
