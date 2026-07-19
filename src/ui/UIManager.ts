import { Vehicle } from '../core/Vehicle';
import { SimulationState, InputState } from '../core/types';

/**
 * UI Manager — renders the dark-themed engine simulator interface.
 * Layout mirip Engine Sim reference: sidebar, top bar, shift lights,
 * left panel (gear + pedals), center (3D), right (gauges + launch).
 */
export class UIManager {
  private vehicle: Vehicle;
  private cachedElements: Map<string, HTMLElement> = new Map();
  private shiftLightEls: HTMLElement[] = [];

  constructor(vehicle: Vehicle) {
    this.vehicle = vehicle;
    this.cachedElements.clear();
    this.shiftLightEls = [];
    this.buildLayout();
  }

  private el(id: string): HTMLElement | null {
    if (this.cachedElements.has(id)) return this.cachedElements.get(id)!;
    const elem = document.getElementById(id);
    if (elem) this.cachedElements.set(id, elem);
    return elem;
  }

  private buildLayout(): void {
    const app = document.getElementById('app')!;
    app.innerHTML = `
      <!-- ═══ SIDEBAR ═══ -->
      <aside class="sidebar" id="sidebar">
        <div class="sidebar-header">
          <span class="logo-icon">⚙</span>
          <span class="logo">ENGINE SIM</span>
        </div>
        <nav class="sidebar-nav">
          <div class="nav-item" data-view="cockpit">
            <span class="nav-dot"></span>Cockpit
          </div>
          <div class="nav-item" data-view="tuner">
            <span class="nav-dot"></span>Tuner
          </div>
          <div class="nav-item active" data-view="track">
            <span class="nav-dot"></span>Track
          </div>
          <div class="nav-item" data-view="diagnostic">
            <span class="nav-dot"></span>Diagnostic
          </div>
          <div class="nav-item" data-view="leaderboard">
            <span class="nav-dot"></span>Leaderboard
          </div>
          <div class="nav-item" data-view="community">
            <span class="nav-dot"></span>Community
          </div>
        </nav>
        <div class="engine-section">
          <div class="section-title">ENGINES</div>
          <button class="build-engine-btn" id="build-engine-btn">
            <span class="btn-icon">+ Build New Engine</span>
          </button>
          <div class="engine-list" id="engine-list"></div>
        </div>
      </aside>

      <!-- ═══ MAIN CONTENT ═══ -->
      <main class="viewport">
        <!-- Top bar -->
        <div class="top-bar" id="top-bar">
          <div class="top-left">
            <span class="shift-light-label">SHIFT LIGHT</span>
          </div>
          <div class="status-center">
            <span class="status-label">RPM</span>
            <span class="status-value rpm-val" id="rpm-readout">0</span>
            <span class="status-label">OPTIMAL</span>
            <span class="status-value optimal-val" id="optimal-rpm">0</span>
            <span class="status-label">GEAR</span>
            <span class="status-value gear-val" id="gear-readout">N</span>
          </div>
          <div class="top-right">
            <div class="status-icons">
              <div class="status-icon" id="icon-ignition"><span class="icon-box">IGN</span></div>
              <div class="status-icon" id="icon-crank"><span class="icon-box">CRANK</span></div>
              <div class="status-icon" id="icon-clutch"><span class="icon-box">CLUTCH</span></div>
              <div class="status-icon"><span class="icon-box">DYNO</span></div>
              <div class="status-icon"><span class="icon-box">HOLD</span></div>
              <div class="status-icon"><span class="icon-box">CHECK</span></div>
              <div class="status-icon"><span class="icon-box">OIL</span></div>
              <div class="status-icon"><span class="icon-box">TEMP</span></div>
            </div>
          </div>
        </div>

        <!-- Shift light bar -->
        <div class="shift-light-bar" id="shift-light-bar"></div>

        <!-- Content area: left + center + right -->
        <div class="content-area">
          <!-- Left panel: gear + pedals -->
          <div class="left-panel">
            <div class="gear-section">
              <div class="h-pattern">
                <div class="h-pattern-grid">
                  <div class="gear-pos" data-gear="1">1</div>
                  <div class="gear-pos" data-gear="2">2</div>
                  <div class="gear-pos" data-gear="3">3</div>
                  <div class="gear-pos" data-gear="4">4</div>
                  <div class="gear-pos" data-gear="5">5</div>
                  <div class="gear-pos" data-gear="6">6</div>
                </div>
              </div>
              <div class="gear-display-row">
                <span class="gear-number" id="current-gear">N</span>
                <div class="gear-info">
                  <span class="gear-count">6-SPEED</span>
                </div>
              </div>
              <div class="gear-buttons">
                <button class="gear-btn minus" id="gear-down-btn">−</button>
                <button class="gear-btn plus" id="gear-up-btn">+</button>
              </div>
            </div>
            <div class="brake-pressure">
              <span class="bp-label">BRAKE PRESSURE</span>
              <span class="bp-value" id="brake-value">0%</span>
            </div>
            <div class="pedal-section">
              <div class="pedal-row">
                <span class="pedal-label">BRAKE</span>
                <div class="pedal-bar-container">
                  <div class="pedal-bar brake" id="brake-bar"></div>
                </div>
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

          <!-- Center: 3D engine -->
          <div class="center-panel" id="center-panel">
            <canvas id="engine-3d-canvas"></canvas>
          </div>

          <!-- Right panel: gauges + launch -->
          <div class="right-panel">
            <div class="gauge-container">
              <div class="gauge speed-gauge" id="speed-gauge">
                <div id="speed-gauge-canvas" style="width:100%;height:100%"></div>
              </div>
              <div class="gauge rpm-gauge" id="rpm-gauge">
                <div id="rpm-gauge-canvas" style="width:100%;height:100%"></div>
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

  populateEngineList(): void {
    const list = this.el('engine-list');
    if (!list) return;

    const currentId = this.vehicle.getEngine().getConfig().id;

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
        <span class="engine-dot ${e.id === currentId ? 'active' : ''}"></span>
        <div class="engine-info-block">
          <div class="engine-name">${e.name}</div>
          <div class="engine-spec">${e.info}</div>
        </div>
      </div>
    `).join('');
  }

  private bindEvents(): void {
    // Engine selection
    const list = this.el('engine-list');
    if (list) {
      list.addEventListener('click', (e) => {
        const item = (e.target as HTMLElement).closest('.engine-item') as HTMLElement;
        if (!item) return;
        list.querySelectorAll('.engine-item').forEach(el => el.classList.remove('selected'));
        list.querySelectorAll('.engine-dot').forEach(el => el.classList.remove('active'));
        item.classList.add('selected');
        item.querySelector('.engine-dot')?.classList.add('active');
        window.dispatchEvent(new CustomEvent('engine-change', {
          detail: { engineId: item.dataset.engineId }
        }));
      });
    }

    // Gear +/- buttons
    const gearUpBtn = this.el('gear-up-btn');
    const gearDownBtn = this.el('gear-down-btn');
    if (gearUpBtn) gearUpBtn.addEventListener('click', () => {
      window.dispatchEvent(new CustomEvent('gear-shift', { detail: { direction: 'up' } }));
    });
    if (gearDownBtn) gearDownBtn.addEventListener('click', () => {
      window.dispatchEvent(new CustomEvent('gear-shift', { detail: { direction: 'down' } }));
    });

    // Launch timer targets
    document.querySelectorAll('.launch-target').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.launch-target').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
      });
    });

    const armBtn = this.el('arm-btn');
    if (armBtn) {
      armBtn.addEventListener('click', () => {
        const activeTarget = document.querySelector('.launch-target.active') as HTMLElement;
        const target = parseInt(activeTarget?.dataset.target || '60');
        this.vehicle.armLaunchTimer(target);
      });
    }

    const resetBtn = this.el('reset-btn');
    if (resetBtn) {
      resetBtn.addEventListener('click', () => this.vehicle.resetLaunchTimer());
    }
  }

  update(state: SimulationState, inputState: InputState): void {
    const config = this.vehicle.getEngine().getConfig();
    const speedMPH = this.vehicle.getSpeedMPH();
    const drivetrain = this.vehicle.getDrivetrain();

    // Status bar values
    const rpmEl = this.el('rpm-readout');
    if (rpmEl) rpmEl.textContent = Math.round(state.rpm).toString();

    const optimalEl = this.el('optimal-rpm');
    if (optimalEl) {
      const peakTorqueRPM = config.torqueCurve.reduce((a, b) => a.nm > b.nm ? a : b).rpm;
      optimalEl.textContent = peakTorqueRPM.toString();
    }

    const gearEl = this.el('gear-readout');
    if (gearEl) gearEl.textContent = drivetrain.getGearDisplay();

    // Status icons
    const ignIcon = this.el('icon-ignition');
    if (ignIcon) ignIcon.classList.toggle('active', state.ignitionOn);

    const crankIcon = this.el('icon-crank');
    if (crankIcon) crankIcon.classList.toggle('active', state.isRunning);

    const clutchIcon = this.el('icon-clutch');
    if (clutchIcon) clutchIcon.classList.toggle('active', drivetrain.getClutchPosition() < 0.5);

    // Standby / running
    const standbyEl = this.el('standby-text');
    if (standbyEl) {
      standbyEl.textContent = state.isRunning ? 'RUNNING' : 'STANDBY';
      standbyEl.classList.toggle('running', state.isRunning);
    }

    // Shift lights
    this.updateShiftLights(state.rpm, config.redline);

    // Gear indicator
    this.updateGearIndicator(drivetrain.getGear());

    // Pedals
    this.updatePedals(state.throttle, state.brake, inputState.clutch);

    // Gauges — di-handle oleh DashboardGauges di main.ts

    // Launch timer
    this.updateLaunchTimer(state);
  }

  private updateShiftLights(rpm: number, redline: number): void {
    const ratio = rpm / redline;
    const total = this.shiftLightEls.length;
    for (let i = 0; i < total; i++) {
      const el = this.shiftLightEls[i];
      const threshold = i / total;
      el.classList.remove('green', 'yellow', 'red');
      if (ratio >= threshold) {
        if (ratio > 0.9) el.classList.add('red');
        else if (ratio > 0.7) el.classList.add('yellow');
        else el.classList.add('green');
      }
    }
  }

  private updateGearIndicator(gear: number): void {
    const gearNum = this.el('current-gear');
    if (gearNum) gearNum.textContent = gear === 0 ? 'N' : gear.toString();

    document.querySelectorAll('.gear-pos').forEach(pos => {
      const el = pos as HTMLElement;
      const posGear = parseInt(el.dataset.gear || '0');
      el.classList.toggle('active', posGear === gear);
    });
  }

  private updatePedals(throttle: number, brake: number, clutch: number): void {
    const throttleBar = this.el('throttle-bar');
    const throttleValue = this.el('throttle-value');
    if (throttleBar) throttleBar.style.width = `${throttle * 100}%`;
    if (throttleValue) throttleValue.textContent = `${Math.round(throttle * 100)}%`;

    const brakeBar = this.el('brake-bar');
    const brakeValue = this.el('brake-value');
    if (brakeBar) brakeBar.style.width = `${brake * 100}%`;
    if (brakeValue) brakeValue.textContent = `${Math.round(brake * 100)}%`;

    const clutchBar = this.el('clutch-bar');
    const clutchValue = this.el('clutch-value');
    if (clutchBar) clutchBar.style.width = `${clutch * 100}%`;
    if (clutchValue) clutchValue.textContent = `${Math.round(clutch * 100)}%`;
  }

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
