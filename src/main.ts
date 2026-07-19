import { Vehicle } from './core/Vehicle';
import { UIManager } from './ui/UIManager';
import { KeyboardInput } from './input/KeyboardInput';
import { AudioManager } from './audio/AudioManager';
import { EngineRenderer } from './render/EngineRenderer';
import { DashboardGauges } from './render/DashboardGauges';
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
  private engineRenderer: EngineRenderer | null = null;
  private dashboard: DashboardGauges | null = null;
  private lastTime = 0;
  private running = true;

  constructor() {
    // Mulai dengan engine preset pertama
    this.vehicle = new Vehicle(ENGINE_PRESETS[0]);
    this.ui = new UIManager(this.vehicle);
    this.input = new KeyboardInput();
    this.audio = new AudioManager();
    this.setupRenderers();
    this.setupEventListeners();

    // Set initial engine config untuk audio
    const initConfig = this.vehicle.getEngine().getConfig();
    this.audio.setEngineConfig(initConfig.cylinders, initConfig.redline);

    this.start();
  }

  private setupRenderers(): void {
    // Init 3D engine renderer
    const centerPanel = document.getElementById('center-panel');
    if (centerPanel) {
      try {
        this.engineRenderer = new EngineRenderer(centerPanel);
        // Set cylinder count sesuai engine aktif
        const cylinders = this.vehicle.getEngine().getConfig().cylinders;
        this.engineRenderer.setCylinderCount(cylinders);
      } catch (error) {
        console.error('[EngineSimApp] Gagal init 3D renderer:', error);
      }
    }

    // Init canvas-based dashboard gauges
    const rpmContainer = document.getElementById('rpm-gauge-canvas');
    const speedContainer = document.getElementById('speed-gauge-canvas');
    if (rpmContainer && speedContainer) {
      try {
        this.dashboard = new DashboardGauges(rpmContainer, speedContainer);
      } catch (error) {
        console.error('[EngineSimApp] Gagal init dashboard:', error);
      }
    }
  }

  private setupEventListeners(): void {
    // Engine change dari sidebar — rebuild UI + audio + renderer
    window.addEventListener('engine-change', ((e: CustomEvent) => {
      const engineId = e.detail.engineId;
      const preset = ENGINE_PRESETS.find(p => p.id === engineId);
      if (!preset) return;

      try {
        // Buat vehicle baru
        this.vehicle = new Vehicle(preset);

        // Rebuild UI
        this.ui = new UIManager(this.vehicle);

        // Re-setup renderer setelah UI rebuild
        this.setupRenderers();

        // Update cylinder count di 3D model
        if (this.engineRenderer) {
          this.engineRenderer.setCylinderCount(preset.cylinders);
        }

        // Reload audio sounds + update engine config
        this.audio.setEngineConfig(preset.cylinders, preset.redline);
        this.audio.loadEngineSounds(preset.id, preset.sounds.samples);

        console.log(`[EngineSimApp] Engine changed ke: ${preset.name} (${preset.cylinders} cyl, ${preset.redline} RPM)`);
      } catch (error) {
        console.error('[EngineSimApp] Gagal ganti engine:', error);
      }
    }) as EventListener);

    // Gear +/- buttons
    window.addEventListener('gear-shift', ((e: CustomEvent) => {
      const dt = this.vehicle.getDrivetrain();
      if (e.detail.direction === 'up') dt.shiftUp();
      else dt.shiftDown();
    }) as EventListener);

    // Audio init setelah user gesture
    const initAudio = async () => {
      try {
        await this.audio.init();
        const config = this.vehicle.getEngine().getConfig();
        await this.audio.loadEngineSounds(config.id, config.sounds.samples);
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

    const dt = Math.min((timestamp - this.lastTime) / 1000, 0.05);
    this.lastTime = timestamp;

    // Proses input
    const inputState = this.input.update();

    // Handle ignition toggle (R key)
    if (inputState.ignition) {
      if (this.vehicle.getState().ignitionOn) {
        this.vehicle.stopEngine();
      } else {
        this.vehicle.startEngine();
      }
    }

    // Handle starter (E key)
    if (inputState.starter && this.vehicle.getState().ignitionOn) {
      const state = this.vehicle.getState();
      state.isStarterEngaged = true;
    }

    // Handle clutch
    const drivetrain = this.vehicle.getDrivetrain();
    drivetrain.setClutch(inputState.clutch);

    // Handle gear shifts (Arrow Up/Down)
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
    const gearRatio = this.vehicle.getDrivetrain().getTotalRatio();
    this.audio.setGearRatio(gearRatio);
    this.audio.update(
      state.rpm,
      state.throttle,
      this.vehicle.getEngine().isAtRevLimiter(),
      config.sounds.crossfadeRPM,
      state.isRunning
    );

    // Update 3D engine renderer
    if (this.engineRenderer) {
      this.engineRenderer.update(state.crankAngle, state.rpm);
      this.engineRenderer.render();
    }

    // Update dashboard gauges
    if (this.dashboard) {
      this.dashboard.update(state.rpm, state.vehicleSpeed / 1.60934, config.redline);
    }

    // Update UI
    this.ui.update(state, inputState);

    // Continue loop
    requestAnimationFrame((t) => this.loop(t));
  }

  destroy(): void {
    this.running = false;
    this.input.destroy();
    this.audio.destroy();
    this.engineRenderer?.destroy();
    this.dashboard?.destroy();
  }
}

// ── Bootstrap ──
document.addEventListener('DOMContentLoaded', () => {
  new EngineSimApp();
});
