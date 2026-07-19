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
