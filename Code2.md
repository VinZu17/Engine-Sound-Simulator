**src/input/KeyboardInput.ts**
```typescript
import { InputState } from '../core/types';

/**
 * Keyboard input handler — maps keyboard ke simulation controls.
 */
export class KeyboardInput {
  private keys: Set<string> = new Set();
  private prevKeys: Set<string> = new Set();
  private inputState: InputState = {
    throttle: 0,
    brake: 0,
    clutch: 1,
    gearUp: false,
    gearDown: false,
    ignition: false,
    starter: false,
  };

  private ignitionPressed = false;
  _directGear = 0;

  constructor() {
    this.setupListeners();
  }

  private setupListeners(): void {
    window.addEventListener('keydown', (e) => {
      this.keys.add(e.code);
      if (['Space', 'KeyB', 'KeyC', 'ShiftLeft', 'ShiftRight',
           'KeyR', 'KeyE', 'ArrowUp', 'ArrowDown'].includes(e.code)) {
        e.preventDefault();
      }
    });

    window.addEventListener('keyup', (e) => {
      this.keys.delete(e.code);
    });

    window.addEventListener('blur', () => {
      this.keys.clear();
    });
  }

  /**
   * Update input state — call tiap frame.
   * EDGE DETECTION: prevKeys harus di-save SEBELUM dibaca.
   */
  update(): InputState {
    // SIMPAN state sebelumnya DULU — sebelum kita baca keys yang baru
    const oldKeys = this.prevKeys;

    // Sekarang prevKeys jadi "state frame sebelumnya"
    // Dan kita update prevKeys ke state SEKARANG buat frame berikutnya
    this.prevKeys = new Set(this.keys);

    // Throttle: Space bar
    this.inputState.throttle = this.keys.has('Space') ? 1 : 0;

    // Brake: B key
    this.inputState.brake = this.keys.has('KeyB') ? 1 : 0;

    // Clutch: C key — tekan = disengage (0), lepas = engage (1)
    this.inputState.clutch = this.keys.has('KeyC') ? 0 : 1;

    // Gear shift up: Arrow Up — edge detection
    const gearUpNow = this.keys.has('ArrowUp');
    const gearUpPrev = oldKeys.has('ArrowUp');
    this.inputState.gearUp = gearUpNow && !gearUpPrev;

    // Gear shift down: Arrow Down — edge detection
    const gearDownNow = this.keys.has('ArrowDown');
    const gearDownPrev = oldKeys.has('ArrowDown');
    this.inputState.gearDown = gearDownNow && !gearDownPrev;

    // Ignition: R key — toggle
    const ignitionNow = this.keys.has('KeyR');
    this.inputState.ignition = ignitionNow && !this.ignitionPressed;
    this.ignitionPressed = ignitionNow;

    // Starter: E key — hold
    this.inputState.starter = this.keys.has('KeyE');

    // Direct gear selection: gak ada — cuma Arrow Up/Down
    this._directGear = -1;

    return this.inputState;
  }

  getDirectGear(): number {
    return this._directGear;
  }

  getState(): Readonly<InputState> {
    return this.inputState;
  }

  destroy(): void {
    this.keys.clear();
    this.prevKeys.clear();
  }
}
```
**src/ui/UIManager.ts**
```typescript
import { Vehicle } from '../core/Vehicle';
import { SimulationState, InputState } from '../core/types';

/**
 * UI Manager — renders the dark-themed engine simulator interface.
 * Handles sidebar, gauges, gear display, pedals, shift lights, and launch timer.
 */
export class UIManager {
  private vehicle: Vehicle;

  // Cache DOM elements biar gak query berulang tiap frame
  private cachedElements: Map<string, HTMLElement> = new Map();
  private shiftLightEls: HTMLElement[] = [];

  constructor(vehicle: Vehicle) {
    this.vehicle = vehicle;
    this.cachedElements.clear();
    this.shiftLightEls = [];
    this.buildLayout();
  }

  /** Helper: ambil element dari cache atau query baru */
  private el(id: string): HTMLElement | null {
    if (this.cachedElements.has(id)) {
      return this.cachedElements.get(id)!;
    }
    const elem = document.getElementById(id);
    if (elem) this.cachedElements.set(id, elem);
    return elem;
  }

  private buildLayout(): void {
    const app = document.getElementById('app')!;
    app.innerHTML = `
      <aside class="sidebar" id="sidebar">
        <div class="sidebar-header">
          <span class="logo">ENGINE SIM</span>
        </div>
        <nav class="sidebar-nav">
          <div class="nav-item active" data-view="track">Track</div>
          <div class="nav-item" data-view="tuner">Tuner</div>
          <div class="nav-item" data-view="diagnostic">Diagnostic</div>
        </nav>
        <div class="engine-section">
          <div class="section-title">ENGINES</div>
          <button class="build-engine-btn" id="build-engine-btn">Build New Engine</button>
          <div class="engine-list" id="engine-list"></div>
        </div>
      </aside>
      <main class="viewport">
        <div class="top-bar" id="top-bar">
          <div class="status-icons">
            <div class="status-icon" id="icon-ignition">IGN</div>
            <div class="status-icon" id="icon-crank">CRANK</div>
            <div class="status-icon" id="icon-clutch">CLUTCH</div>
          </div>
          <div class="center-info">
            <span class="label">RPM</span>
            <span class="value rpm-value" id="rpm-readout">0</span>
            <span class="label">OPTIMAL</span>
            <span class="value optimal-rpm" id="optimal-rpm">0</span>
            <span class="label">GEAR</span>
            <span class="value gear-value" id="gear-readout">N</span>
          </div>
          <div class="right-info">
            <span class="standby-text">STANDBY</span>
          </div>
        </div>
        <div class="shift-light-bar" id="shift-light-bar"></div>
        <div class="content-area">
          <div class="left-panel">
            <div class="gear-indicator" id="gear-indicator">
              <div class="h-pattern">
                <div class="h-pattern-grid">
                  <div class="gear-pos" data-gear="1">1</div>
                  <div class="gear-pos" data-gear="2">2</div>
                  <div class="gear-pos" data-gear="3">3</div>
                  <div class="gear-pos" data-gear="4">4</div>
                  <div class="gear-pos" data-gear="5">5</div>
                  <div class="gear-pos" data-gear="6">6</div>
                </div>
                <div class="gear-number" id="current-gear">N</div>
                <div class="gear-label">6-SPEED</div>
              </div>
            </div>
            <div class="pedal-section">
              <div class="pedal-row">
                <span class="pedal-label">BRAKE</span>
                <div class="pedal-bar-container">
                  <div class="pedal-bar brake" id="brake-bar"></div>
                </div>
                <span class="pedal-value" id="brake-value">0%</span>
              </div>
              <div class="pedal-row">
                <span class="pedal-label">CLUTCH PEDAL</span>
                <div class="pedal-bar-container">
                  <div class="pedal-bar clutch" id="clutch-bar"></div>
                </div>
                <span class="pedal-value" id="clutch-value">100%</span>
              </div>
              <div class="pedal-row">
                <span class="pedal-label">THROTTLE INPUT</span>
                <div class="pedal-bar-container">
                  <div class="pedal-bar throttle" id="throttle-bar"></div>
                </div>
                <span class="pedal-value" id="throttle-value">0%</span>
              </div>
            </div>
          </div>
          <div class="center-panel" id="center-panel">
            <canvas id="engine-3d-canvas"></canvas>
          </div>
          <div class="right-panel">
            <div class="gauge-container">
              <div class="gauge speed-gauge" id="speed-gauge">
                <svg viewBox="0 0 200 200">
                  <circle cx="100" cy="100" r="85" class="gauge-bg" />
                  <circle cx="100" cy="100" r="85" class="gauge-arc speed-arc" />
                  <text x="100" y="90" class="gauge-value" id="speed-text">0</text>
                  <text x="100" y="115" class="gauge-unit">mph</text>
                  <text x="100" y="140" class="gauge-label">VEHICLE SPEED</text>
                  <line x1="100" y1="100" x2="100" y2="25" class="gauge-needle" id="speed-needle" />
                </svg>
              </div>
              <div class="gauge rpm-gauge" id="rpm-gauge">
                <svg viewBox="0 0 200 200">
                  <circle cx="100" cy="100" r="85" class="gauge-bg" />
                  <circle cx="100" cy="100" r="85" class="gauge-arc rpm-arc" />
                  <text x="100" y="90" class="gauge-value" id="rpm-gauge-text">0</text>
                  <text x="100" y="115" class="gauge-unit">rpm</text>
                  <text x="100" y="140" class="gauge-label">ENGINE SPEED</text>
                  <line x1="100" y1="100" x2="100" y2="25" class="gauge-needle rpm-needle" id="rpm-needle" />
                </svg>
              </div>
            </div>
            <div class="launch-timer-section" id="launch-timer-section">
              <div class="launch-header">
                <span class="launch-label">LAUNCH TIMER</span>
                <span class="launch-status" id="launch-status">READY</span>
              </div>
              <div class="launch-targets">
                <button class="launch-target active" data-target="60">0 &rarr; 60</button>
                <button class="launch-target" data-target="100">0 &rarr; 100</button>
                <button class="launch-target" data-target="130">60 &rarr; 130</button>
              </div>
              <div class="launch-display">
                <span class="launch-time" id="launch-time">0.00</span>
                <span class="launch-time-unit">s</span>
                <span class="launch-speed" id="launch-speed">0</span>
                <span class="launch-speed-unit">mph</span>
              </div>
              <div class="launch-hint">Pick a target, then ARM.</div>
              <div class="launch-buttons">
                <button class="launch-btn arm-btn" id="arm-btn">ARM</button>
                <button class="launch-btn reset-btn" id="reset-btn">RESET</button>
              </div>
            </div>
          </div>
        </div>
      </main>
    `;

    this.initShiftLights();
    this.populateEngineList();
    this.bindEvents();
  }

  /** Inisialisasi shift light bar — cache element references */
  private initShiftLights(): void {
    const bar = this.el('shift-light-bar');
    if (!bar) return;
    this.shiftLightEls = [];
    for (let i = 0; i < 30; i++) {
      const light = document.createElement('div');
      light.className = 'shift-light';
      bar.appendChild(light);
      this.shiftLightEls.push(light);
    }
  }

  /** Populate sidebar engine list berdasarkan config yang aktif */
  populateEngineList(): void {
    const list = this.el('engine-list');
    if (!list) return;

    const currentId = this.vehicle.getEngine().getConfig().id;

    // Pre-built engines
    const engines = [
      { name: 'Lexus LFA V10', info: '4.8L · 10 cyl', id: 'lexus-lfa-v10' },
      { name: 'Subaru EJ25', info: '2.5L · 4 cyl', id: 'subaru-ej25' },
      { name: 'Toyota 2JZ-GTE', info: '3.0L · 6 cyl', id: 'toyota-2jz' },
      { name: 'Honda F20C (VTEC)', info: '2.0L · 4 cyl', id: 'honda-f20c' },
      { name: 'BMW M52B28', info: '2.8L · 6 cyl', id: 'bmw-m52b28' },
      { name: 'Ferrari F136 V8', info: '4.5L · 8 cyl', id: 'ferrari-f136-v8' },
    ];

    list.innerHTML = engines.map(e => `
      <div class="engine-item ${e.id === currentId ? 'selected' : ''}" data-engine-id="${e.id}">
        <div class="engine-name">${e.name}</div>
        <div class="engine-info">${e.info}</div>
      </div>
    `).join('');
  }

  private bindEvents(): void {
    // Engine selection — event delegation
    const list = this.el('engine-list');
    if (list) {
      list.addEventListener('click', (e) => {
        const item = (e.target as HTMLElement).closest('.engine-item') as HTMLElement;
        if (!item) return;
        list.querySelectorAll('.engine-item').forEach(el => el.classList.remove('selected'));
        item.classList.add('selected');
        window.dispatchEvent(new CustomEvent('engine-change', {
          detail: { engineId: item.dataset.engineId }
        }));
      });
    }

    // Launch timer target selection
    document.querySelectorAll('.launch-target').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.launch-target').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
      });
    });

    // Arm launch timer
    const armBtn = this.el('arm-btn');
    if (armBtn) {
      armBtn.addEventListener('click', () => {
        const activeTarget = document.querySelector('.launch-target.active') as HTMLElement;
        const target = parseInt(activeTarget?.dataset.target || '60');
        this.vehicle.armLaunchTimer(target);
      });
    }

    // Reset launch timer
    const resetBtn = this.el('reset-btn');
    if (resetBtn) {
      resetBtn.addEventListener('click', () => {
        this.vehicle.resetLaunchTimer();
      });
    }
  }

  /** Update semua UI elements dengan simulation state terkini */
  update(state: SimulationState, inputState: InputState): void {
    const config = this.vehicle.getEngine().getConfig();
    const speedMPH = this.vehicle.getSpeedMPH();
    const drivetrain = this.vehicle.getDrivetrain();

    // RPM readout
    const rpmEl = this.el('rpm-readout');
    if (rpmEl) rpmEl.textContent = Math.round(state.rpm).toString();

    // Optimal RPM (peak torque RPM)
    const optimalEl = this.el('optimal-rpm');
    if (optimalEl) {
      const peakTorqueRPM = config.torqueCurve.reduce((a, b) => a.nm > b.nm ? a : b).rpm;
      optimalEl.textContent = peakTorqueRPM.toString();
    }

    // Gear readout
    const gearEl = this.el('gear-readout');
    if (gearEl) gearEl.textContent = drivetrain.getGearDisplay();

    // Status icons
    const ignIcon = this.el('icon-ignition');
    if (ignIcon) ignIcon.classList.toggle('active', state.ignitionOn);

    const crankIcon = this.el('icon-crank');
    if (crankIcon) crankIcon.classList.toggle('active', state.isRunning);

    const clutchIcon = this.el('icon-clutch');
    if (clutchIcon) clutchIcon.classList.toggle('active', drivetrain.getClutchPosition() < 0.5);

    // Standby / running text
    const standbyEl = document.querySelector('.standby-text');
    if (standbyEl) {
      standbyEl.textContent = state.isRunning ? 'RUNNING' : 'STANDBY';
      standbyEl.classList.toggle('running', state.isRunning);
    }

    // Shift lights — pakai cached elements
    this.updateShiftLights(state.rpm, config.redline);

    // Gear indicator (H-pattern)
    this.updateGearIndicator(drivetrain.getGear());

    // Pedal bars (throttle, brake, clutch) — pakai input user, bukan drivetrain internal
    this.updatePedals(state.throttle, state.brake, inputState.clutch);

    // Gauges
    this.updateGauges(state.rpm, speedMPH, config.redline);

    // Launch timer
    this.updateLaunchTimer(state);
  }

  /** Update shift lights — pakai cached elements, warna berubah sesuai RPM */
  private updateShiftLights(rpm: number, redline: number): void {
    const ratio = rpm / redline;
    const total = this.shiftLightEls.length;

    for (let i = 0; i < total; i++) {
      const el = this.shiftLightEls[i];
      const threshold = i / total;

      // Reset classes dulu
      el.classList.remove('green', 'yellow', 'red');

      if (ratio >= threshold) {
        // RPM cukup buat nyalain light ini
        if (ratio > 0.9) {
          el.classList.add('red');
        } else if (ratio > 0.7) {
          el.classList.add('yellow');
        } else {
          el.classList.add('green');
        }
      }
      // Kalau ratio < threshold, light tetap mati (default bg-tertiary)
    }
  }

  /** Update gear indicator H-pattern + gear number */
  private updateGearIndicator(gear: number): void {
    const gearNum = this.el('current-gear');
    if (gearNum) gearNum.textContent = gear === 0 ? 'N' : gear.toString();

    document.querySelectorAll('.gear-pos').forEach(pos => {
      const el = pos as HTMLElement;
      const posGear = parseInt(el.dataset.gear || '0');
      el.classList.toggle('active', posGear === gear);
    });
  }

  /** Update pedal bars: throttle, brake, clutch */
  private updatePedals(throttle: number, brake: number, clutch: number): void {
    // Throttle bar
    const throttleBar = this.el('throttle-bar');
    const throttleValue = this.el('throttle-value');
    if (throttleBar) throttleBar.style.width = `${throttle * 100}%`;
    if (throttleValue) throttleValue.textContent = `${Math.round(throttle * 100)}%`;

    // Brake bar
    const brakeBar = this.el('brake-bar');
    const brakeValue = this.el('brake-value');
    if (brakeBar) brakeBar.style.width = `${brake * 100}%`;
    if (brakeValue) brakeValue.textContent = `${Math.round(brake * 100)}%`;

    // Clutch bar (inverted: clutch position 1 = fully engaged = full bar)
    const clutchBar = this.el('clutch-bar');
    const clutchValue = this.el('clutch-value');
    if (clutchBar) clutchBar.style.width = `${clutch * 100}%`;
    if (clutchValue) clutchValue.textContent = `${Math.round(clutch * 100)}%`;
  }

  /** Update gauge needles dan text values */
  private updateGauges(rpm: number, speedMPH: number, redline: number): void {
    // RPM gauge needle rotation (-135 to +135 degrees = 270 degree range)
    const rpmRatio = Math.min(1, rpm / redline);
    const rpmAngle = -135 + rpmRatio * 270;
    const rpmNeedle = this.el('rpm-needle');
    if (rpmNeedle) rpmNeedle.setAttribute('transform', `rotate(${rpmAngle} 100 100)`);

    const rpmText = this.el('rpm-gauge-text');
    if (rpmText) rpmText.textContent = Math.round(rpm).toString();

    // Speed gauge needle rotation
    const speedRatio = Math.min(1, speedMPH / 200);
    const speedAngle = -135 + speedRatio * 270;
    const speedNeedle = this.el('speed-needle');
    if (speedNeedle) speedNeedle.setAttribute('transform', `rotate(${speedAngle} 100 100)`);

    const speedText = this.el('speed-text');
    if (speedText) speedText.textContent = Math.round(speedMPH).toString();
  }

  /** Update launch timer display */
  private updateLaunchTimer(state: SimulationState): void {
    const lt = state.launchTimer;
    const timeEl = this.el('launch-time');
    const speedEl = this.el('launch-speed');
    const statusEl = this.el('launch-status');

    if (timeEl) timeEl.textContent = lt.elapsed.toFixed(2);
    if (speedEl) speedEl.textContent = Math.round(this.vehicle.getSpeedMPH()).toString();
    if (statusEl) {
      if (lt.running) statusEl.textContent = 'RUNNING';
      else if (lt.armed) statusEl.textContent = 'ARMED';
      else statusEl.textContent = 'READY';
    }
  }
}
```
**src/main.ts**
```typescript
import { Vehicle } from './core/Vehicle';
import { UIManager } from './ui/UIManager';
import { KeyboardInput } from './input/KeyboardInput';
import { AudioManager } from './audio/AudioManager';
import { ENGINE_PRESETS } from './config/engines';
import './style.css';

/**
 * Main application — orchestrates simulation, rendering, audio, and UI.
 */
class EngineSimApp {
  private vehicle: Vehicle;
  private ui: UIManager;
  private input: KeyboardInput;
  private audio: AudioManager;
  private lastTime = 0;
  private running = true;

  constructor() {
    // Mulai dengan engine preset pertama
    this.vehicle = new Vehicle(ENGINE_PRESETS[0]);
    this.ui = new UIManager(this.vehicle);
    this.input = new KeyboardInput();
    this.audio = new AudioManager();

    this.setupEventListeners();
    this.start();
  }

  private setupEventListeners(): void {
    // Engine change dari sidebar — rebuild UI + audio
    window.addEventListener('engine-change', ((e: CustomEvent) => {
      const engineId = e.detail.engineId;
      const preset = ENGINE_PRESETS.find(p => p.id === engineId);
      if (!preset) return;

      try {
        // Buat vehicle baru — jangan auto-start engine baru
        this.vehicle = new Vehicle(preset);

        // Rebuild UI
        this.ui = new UIManager(this.vehicle);

        // Reload audio sounds
        this.audio.loadEngineSounds(preset.id, preset.sounds.samples);
      } catch (error) {
        console.error('[EngineSimApp] Gagal ganti engine:', error);
      }
    }) as EventListener);

    // Audio context harus di-init setelah user gesture (browser policy)
    const initAudio = async () => {
      try {
        await this.audio.init();
        const config = this.vehicle.getEngine().getConfig();
        await this.audio.loadEngineSounds(config.id, config.sounds.samples);
        // Hapus listener setelah berhasil init
        document.removeEventListener('click', initAudio);
        document.removeEventListener('keydown', initAudio);
      } catch (error) {
        console.error('[EngineSimApp] Gagal init audio:', error);
      }
    };
    document.addEventListener('click', initAudio, { once: false });
    document.addEventListener('keydown', initAudio, { once: false });
  }

  private start(): void {
    this.lastTime = performance.now();
    requestAnimationFrame((t) => this.loop(t));
  }

  private loop(timestamp: number): void {
    if (!this.running) return;

    const dt = Math.min((timestamp - this.lastTime) / 1000, 0.05); // Cap di 50ms
    this.lastTime = timestamp;

    // Proses input
    const inputState = this.input.update();

    // Handle ignition toggle (R key — edge trigger)
    if (inputState.ignition) {
      if (this.vehicle.getState().ignitionOn) {
        this.vehicle.stopEngine();
      } else {
        this.vehicle.startEngine();
      }
    }

    // Handle starter (E key — hold)
    if (inputState.starter && this.vehicle.getState().ignitionOn) {
      const state = this.vehicle.getState();
      state.isStarterEngaged = true;
    }

    // Handle clutch — PENTING: update drivetrain clutch position dari input
    const drivetrain = this.vehicle.getDrivetrain();
    drivetrain.setClutch(inputState.clutch);

    // Handle gear shifts via arrow keys (edge trigger)
    if (inputState.gearUp) {
      drivetrain.shiftUp();
    }
    if (inputState.gearDown) {
      drivetrain.shiftDown();
    }

    // Step vehicle simulation
    this.vehicle.step(dt, inputState.throttle, inputState.brake);

    // Update audio
    const state = this.vehicle.getState();
    const config = this.vehicle.getEngine().getConfig();
    this.audio.update(
      state.rpm,
      state.throttle,
      this.vehicle.getEngine().isAtRevLimiter(),
      config.sounds.crossfadeRPM
    );

    // Update UI
    this.ui.update(state, inputState);

    // Continue loop
    requestAnimationFrame((t) => this.loop(t));
  }

  destroy(): void {
    this.running = false;
    this.input.destroy();
    this.audio.destroy();
  }
}

// ── Bootstrap ──
document.addEventListener('DOMContentLoaded', () => {
  new EngineSimApp();
});
```
**src/style.css**
```typescript
/* ── Reset & Base ── */
*, *::before, *::after {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

:root {
  --bg-primary: #1a1a1a;
  --bg-secondary: #222222;
  --bg-tertiary: #2a2a2a;
  --bg-hover: #333333;
  --text-primary: #e0e0e0;
  --text-secondary: #888888;
  --text-muted: #555555;
  --accent-blue: #4a9eff;
  --accent-green: #4ade80;
  --accent-yellow: #fbbf24;
  --accent-red: #ef4444;
  --accent-orange: #f97316;
  --border-color: #333333;
  --font-mono: 'JetBrains Mono', monospace;
  --font-sans: 'Inter', -apple-system, sans-serif;
}

html, body {
  width: 100%;
  height: 100%;
  overflow: hidden;
  background: var(--bg-primary);
  color: var(--text-primary);
  font-family: var(--font-sans);
  font-size: 13px;
}

#app {
  display: flex;
  width: 100%;
  height: 100vh;
}

/* ── Sidebar ── */
.sidebar {
  width: 260px;
  min-width: 260px;
  background: var(--bg-secondary);
  border-right: 1px solid var(--border-color);
  display: flex;
  flex-direction: column;
  overflow-y: auto;
}

.sidebar-header {
  padding: 16px 20px;
  border-bottom: 1px solid var(--border-color);
}

.logo {
  font-family: var(--font-mono);
  font-size: 16px;
  font-weight: 700;
  color: var(--accent-orange);
  letter-spacing: 2px;
}

.sidebar-nav {
  padding: 8px 0;
  border-bottom: 1px solid var(--border-color);
}

.nav-item {
  padding: 10px 20px;
  cursor: pointer;
  color: var(--text-secondary);
  transition: all 0.15s;
  font-size: 13px;
}

.nav-item:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}

.nav-item.active {
  color: var(--accent-blue);
  background: rgba(74, 158, 255, 0.08);
  border-left: 3px solid var(--accent-blue);
  padding-left: 17px;
}

.engine-section {
  padding: 16px 0;
  flex: 1;
  overflow-y: auto;
}

.section-title {
  padding: 0 20px 8px;
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 1.5px;
  color: var(--text-muted);
  text-transform: uppercase;
}

.build-engine-btn {
  display: block;
  width: calc(100% - 32px);
  margin: 0 16px 12px;
  padding: 10px 16px;
  background: var(--accent-blue);
  color: white;
  border: none;
  border-radius: 6px;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: background 0.15s;
}

.build-engine-btn:hover {
  background: #3a8ae8;
}

.engine-list {
  display: flex;
  flex-direction: column;
}

.engine-item {
  padding: 10px 20px;
  cursor: pointer;
  transition: all 0.15s;
  border-left: 3px solid transparent;
}

.engine-item:hover {
  background: var(--bg-hover);
}

.engine-item.selected {
  background: rgba(74, 158, 255, 0.08);
  border-left-color: var(--accent-blue);
}

.engine-name {
  font-size: 13px;
  font-weight: 500;
  color: var(--text-primary);
  margin-bottom: 2px;
}

.engine-info {
  font-size: 11px;
  color: var(--text-secondary);
  font-family: var(--font-mono);
}

/* ── Main Viewport ── */
.viewport {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.top-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 20px;
  background: var(--bg-secondary);
  border-bottom: 1px solid var(--border-color);
  min-height: 48px;
}

.status-icons {
  display: flex;
  gap: 8px;
}

.status-icon {
  width: 40px;
  height: 40px;
  border-radius: 8px;
  background: var(--bg-tertiary);
  border: 1px solid var(--border-color);
  display: flex;
  align-items: center;
  justify-content: center;
  font-family: var(--font-mono);
  font-size: 9px;
  font-weight: 600;
  color: var(--text-muted);
  letter-spacing: 0.5px;
  transition: all 0.2s;
}

.status-icon.active {
  border-color: var(--accent-green);
  color: var(--accent-green);
  background: rgba(74, 222, 128, 0.08);
}

.center-info {
  display: flex;
  align-items: center;
  gap: 12px;
  font-family: var(--font-mono);
}

.center-info .label {
  font-size: 10px;
  color: var(--text-muted);
  letter-spacing: 1px;
}

.center-info .value {
  font-size: 16px;
  font-weight: 700;
  color: var(--text-primary);
}

.rpm-value {
  color: var(--accent-blue) !important;
  font-size: 18px !important;
}

.optimal-rpm {
  color: var(--accent-green) !important;
}

.gear-value {
  color: var(--accent-blue) !important;
}

.right-info {
  min-width: 100px;
  text-align: right;
}

.standby-text {
  font-family: var(--font-mono);
  font-size: 12px;
  color: var(--text-muted);
  letter-spacing: 2px;
}

.standby-text.running {
  color: var(--accent-green);
}

/* ── Shift Light Bar ── */
.shift-light-bar {
  display: flex;
  gap: 3px;
  padding: 8px 20px;
  background: var(--bg-secondary);
  border-bottom: 1px solid var(--border-color);
}

.shift-light {
  flex: 1;
  height: 8px;
  background: var(--bg-tertiary);
  border-radius: 2px;
  transition: background 0.05s;
}

.shift-light.green {
  background: var(--accent-green);
  box-shadow: 0 0 6px rgba(74, 222, 128, 0.4);
}

.shift-light.yellow {
  background: var(--accent-yellow);
  box-shadow: 0 0 6px rgba(251, 191, 36, 0.4);
}

.shift-light.red {
  background: var(--accent-red);
  box-shadow: 0 0 8px rgba(239, 68, 68, 0.5);
  animation: limiter-flash 0.1s infinite;
}

@keyframes limiter-flash {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.3; }
}

/* ── Content Area ── */
.content-area {
  flex: 1;
  display: flex;
  overflow: hidden;
}

/* ── Left Panel ── */
.left-panel {
  width: 300px;
  min-width: 300px;
  background: var(--bg-secondary);
  border-right: 1px solid var(--border-color);
  display: flex;
  flex-direction: column;
  padding: 16px;
  gap: 16px;
}

.gear-indicator {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
}

.h-pattern {
  text-align: center;
}

.h-pattern-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  grid-template-rows: repeat(2, 1fr);
  gap: 8px;
  width: 180px;
  margin: 0 auto 16px;
}

.gear-pos {
  width: 50px;
  height: 50px;
  background: var(--bg-tertiary);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-family: var(--font-mono);
  font-size: 14px;
  font-weight: 600;
  color: var(--text-muted);
  transition: all 0.15s;
  cursor: pointer;
}

.gear-pos.active {
  background: var(--accent-blue);
  color: white;
  border-color: var(--accent-blue);
  box-shadow: 0 0 12px rgba(74, 158, 255, 0.3);
}

.gear-number {
  font-family: var(--font-mono);
  font-size: 48px;
  font-weight: 700;
  color: var(--accent-blue);
  margin: 8px 0;
}

.gear-label {
  font-family: var(--font-mono);
  font-size: 10px;
  color: var(--text-muted);
  letter-spacing: 2px;
}

/* ── Pedal Section ── */
.pedal-section {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.pedal-row {
  display: flex;
  align-items: center;
  gap: 10px;
}

.pedal-label {
  font-family: var(--font-mono);
  font-size: 10px;
  color: var(--text-muted);
  letter-spacing: 1px;
  min-width: 120px;
}

.pedal-bar-container {
  flex: 1;
  height: 12px;
  background: var(--bg-tertiary);
  border-radius: 3px;
  overflow: hidden;
}

.pedal-bar {
  height: 100%;
  background: var(--accent-blue);
  border-radius: 3px;
  transition: width 0.05s;
  width: 0%;
}

.pedal-bar.throttle {
  background: var(--accent-blue);
}

.pedal-bar.clutch {
  background: var(--accent-green);
}

.pedal-bar.brake {
  background: var(--accent-red);
}

.pedal-value {
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--text-secondary);
  min-width: 35px;
  text-align: right;
}

/* ── Center Panel (3D View) ── */
.center-panel {
  flex: 1;
  background: #111111;
  position: relative;
  overflow: hidden;
}

#engine-3d-canvas {
  width: 100%;
  height: 100%;
  display: block;
}

/* ── Right Panel (Gauges) ── */
.right-panel {
  width: 260px;
  min-width: 260px;
  background: var(--bg-secondary);
  border-left: 1px solid var(--border-color);
  display: flex;
  flex-direction: column;
  padding: 16px;
  gap: 16px;
}

.gauge-container {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.gauge {
  width: 100%;
  aspect-ratio: 1;
}

.gauge svg {
  width: 100%;
  height: 100%;
}

.gauge-bg {
  fill: none;
  stroke: var(--bg-tertiary);
  stroke-width: 6;
}

.gauge-arc {
  fill: none;
  stroke-width: 6;
  stroke-linecap: round;
  stroke-dasharray: 400 534;
  stroke-dashoffset: 134;
  transform: rotate(135deg);
  transform-origin: center;
}

.speed-arc {
  stroke: var(--accent-blue);
}

.rpm-arc {
  stroke: var(--accent-green);
}

.gauge-value {
  fill: var(--text-primary);
  font-family: var(--font-mono);
  font-size: 28px;
  font-weight: 700;
  text-anchor: middle;
}

.gauge-unit {
  fill: var(--text-secondary);
  font-family: var(--font-mono);
  font-size: 11px;
  text-anchor: middle;
}

.gauge-label {
  fill: var(--text-muted);
  font-family: var(--font-mono);
  font-size: 8px;
  text-anchor: middle;
  letter-spacing: 1px;
}

.gauge-needle {
  stroke: var(--accent-red);
  stroke-width: 2;
  stroke-linecap: round;
}

.rpm-needle {
  stroke: var(--accent-green);
}

/* ── Launch Timer ── */
.launch-timer-section {
  background: var(--bg-tertiary);
  border-radius: 8px;
  padding: 14px;
  margin-top: auto;
}

.launch-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 10px;
}

.launch-label {
  font-family: var(--font-mono);
  font-size: 10px;
  color: var(--text-muted);
  letter-spacing: 1px;
}

.launch-status {
  font-family: var(--font-mono);
  font-size: 10px;
  color: var(--accent-green);
  letter-spacing: 1px;
}

.launch-targets {
  display: flex;
  gap: 6px;
  margin-bottom: 12px;
}

.launch-target {
  flex: 1;
  padding: 6px 8px;
  background: var(--bg-primary);
  border: 1px solid var(--border-color);
  border-radius: 4px;
  color: var(--text-secondary);
  font-family: var(--font-mono);
  font-size: 10px;
  cursor: pointer;
  transition: all 0.15s;
}

.launch-target.active {
  background: var(--accent-blue);
  color: white;
  border-color: var(--accent-blue);
}

.launch-target:hover:not(.active) {
  border-color: var(--text-muted);
}

.launch-display {
  display: flex;
  align-items: baseline;
  gap: 4px;
  margin-bottom: 6px;
}

.launch-time {
  font-family: var(--font-mono);
  font-size: 36px;
  font-weight: 700;
  color: var(--text-primary);
}

.launch-time-unit {
  font-family: var(--font-mono);
  font-size: 12px;
  color: var(--text-secondary);
  margin-right: 12px;
}

.launch-speed {
  font-family: var(--font-mono);
  font-size: 20px;
  font-weight: 600;
  color: var(--text-primary);
}

.launch-speed-unit {
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--text-secondary);
}

.launch-hint {
  font-size: 11px;
  color: var(--text-muted);
  margin-bottom: 10px;
}

.launch-buttons {
  display: flex;
  gap: 8px;
}

.launch-btn {
  flex: 1;
  padding: 8px 16px;
  border: none;
  border-radius: 4px;
  font-family: var(--font-mono);
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 1px;
  cursor: pointer;
  transition: all 0.15s;
}

.arm-btn {
  background: var(--accent-blue);
  color: white;
}

.arm-btn:hover {
  background: #3a8ae8;
}

.reset-btn {
  background: var(--bg-primary);
  color: var(--text-secondary);
  border: 1px solid var(--border-color);
}

.reset-btn:hover {
  border-color: var(--text-muted);
  color: var(--text-primary);
}

/* ── Scrollbar ── */
::-webkit-scrollbar {
  width: 6px;
}

::-webkit-scrollbar-track {
  background: transparent;
}

::-webkit-scrollbar-thumb {
  background: var(--border-color);
  border-radius: 3px;
}

::-webkit-scrollbar-thumb:hover {
  background: var(--text-muted);
}
```