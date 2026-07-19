/**
 * SynthEngine — Realtime engine sound synthesis.
 * Idle variation + balanced frequency + exhaust popping + turbo flutter + rev limiter.
 */
export class SynthEngine {
  private ctx: AudioContext;
  private output: GainNode;

  // Exhaust
  private exhaustOscs: OscillatorNode[] = [];
  private exhaustGains: GainNode[] = [];
  private exhaustMasterGain: GainNode | null = null;
  private exhaustFilter: BiquadFilterNode | null = null;
  private exhaustResonance: BiquadFilterNode | null = null;

  // Sub-bass
  private subOsc: OscillatorNode | null = null;
  private subGain: GainNode | null = null;

  // Intake
  private intakeNoise: AudioBufferSourceNode | null = null;
  private intakeGain: GainNode | null = null;
  private intakeFilter: BiquadFilterNode | null = null;

  // Mechanical
  private mechNoise: AudioBufferSourceNode | null = null;
  private mechGain: GainNode | null = null;
  private mechFilter: BiquadFilterNode | null = null;

  // Rev limiter
  private limiterLFO: OscillatorNode | null = null;
  private limiterGain: GainNode | null = null;

  // Exhaust popping — triggered on throttle release
  private popNoise: AudioBufferSourceNode | null = null;
  private popGain: GainNode | null = null;
  private popFilter: BiquadFilterNode | null = null;
  private prevThrottle = 0;
  private popCooldown = 0;

  // Turbo flutter — "stututu" when throttle closes with boost
  private flutterOsc: OscillatorNode | null = null;
  private flutterGain: GainNode | null = null;
  private flutterLFO: OscillatorNode | null = null;
  private flutterLFOGain: GainNode | null = null;

  // Idle variation LFOs
  private idleLFO1: OscillatorNode | null = null;
  private idleLFO1Gain: GainNode | null = null;
  private idleLFO2: OscillatorNode | null = null;
  private idleLFO2Gain: GainNode | null = null;

  // Transmission whine
  private trannyOsc: OscillatorNode | null = null;
  private trannyGain: GainNode | null = null;
  private trannyFilter: BiquadFilterNode | null = null;

  private running = false;
  private noiseBuffer: AudioBuffer | null = null;
  private cylinderCount = 10;
  private redline = 9000;
  private gearRatio = 1;

  constructor(ctx: AudioContext, output: GainNode) {
    this.ctx = ctx;
    this.output = output;
    this.createNoiseBuffer();
  }

  setEngineConfig(cylinders: number, redline: number): void {
    this.cylinderCount = cylinders;
    this.redline = redline;
  }

  setGearRatio(ratio: number): void {
    this.gearRatio = ratio;
  }

  private createNoiseBuffer(): void {
    const sr = this.ctx.sampleRate;
    const len = sr * 2;
    this.noiseBuffer = this.ctx.createBuffer(2, len, sr);
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
    for (let ch = 0; ch < 2; ch++) {
      const data = this.noiseBuffer.getChannelData(ch);
      for (let i = 0; i < len; i++) {
        const white = Math.random() * 2 - 1;
        b0 = 0.99886 * b0 + white * 0.0555179;
        b1 = 0.99332 * b1 + white * 0.0750759;
        b2 = 0.96900 * b2 + white * 0.1538520;
        b3 = 0.86650 * b3 + white * 0.3104856;
        b4 = 0.55000 * b4 + white * 0.5329522;
        b5 = -0.7616 * b5 - white * 0.0168980;
        data[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.11;
        b6 = white * 0.115926;
      }
    }
  }

  start(): void {
    if (this.running) return;
    this.running = true;

    // ═══ EXHAUST MASTER ═══
    this.exhaustMasterGain = this.ctx.createGain();
    this.exhaustMasterGain.gain.value = 0;

    this.exhaustFilter = this.ctx.createBiquadFilter();
    this.exhaustFilter.type = 'lowpass';
    this.exhaustFilter.frequency.value = 1200;
    this.exhaustFilter.Q.value = 1.5;

    this.exhaustResonance = this.ctx.createBiquadFilter();
    this.exhaustResonance.type = 'peaking';
    this.exhaustResonance.frequency.value = 150;
    this.exhaustResonance.Q.value = 2.5;
    this.exhaustResonance.gain.value = 5;

    // 5 harmonics — balanced
    const types: OscillatorType[] = ['sawtooth', 'square', 'sawtooth', 'triangle', 'sawtooth'];
    const harmonicMultipliers = [1, 2, 3, 4.5, 6];
    const harmonicGains = [0.3, 0.3, 0.25, 0.15, 0.1];

    for (let i = 0; i < 5; i++) {
      const osc = this.ctx.createOscillator();
      osc.type = types[i];
      osc.frequency.value = 80 * harmonicMultipliers[i];
      const gain = this.ctx.createGain();
      gain.gain.value = harmonicGains[i];
      osc.connect(gain);
      gain.connect(this.exhaustMasterGain);
      osc.start();
      this.exhaustOscs.push(osc);
      this.exhaustGains.push(gain);
    }

    this.exhaustMasterGain.connect(this.exhaustResonance);
    this.exhaustResonance.connect(this.exhaustFilter);
    this.exhaustFilter.connect(this.output);

    // ═══ SUB-BASS ═══
    this.subOsc = this.ctx.createOscillator();
    this.subOsc.type = 'sine';
    this.subOsc.frequency.value = 45;
    this.subGain = this.ctx.createGain();
    this.subGain.gain.value = 0;
    const subFilter = this.ctx.createBiquadFilter();
    subFilter.type = 'lowpass';
    subFilter.frequency.value = 120;
    subFilter.Q.value = 0.8;
    this.subOsc.connect(subFilter);
    subFilter.connect(this.subGain);
    this.subGain.connect(this.output);
    this.subOsc.start();

    // ═══ INTAKE ═══
    this.intakeGain = this.ctx.createGain();
    this.intakeGain.gain.value = 0;
    this.intakeFilter = this.ctx.createBiquadFilter();
    this.intakeFilter.type = 'bandpass';
    this.intakeFilter.frequency.value = 3000;
    this.intakeFilter.Q.value = 1.0;
    this.intakeNoise = this.ctx.createBufferSource();
    this.intakeNoise.buffer = this.noiseBuffer;
    this.intakeNoise.loop = true;
    this.intakeNoise.connect(this.intakeFilter);
    this.intakeFilter.connect(this.intakeGain);
    this.intakeGain.connect(this.output);
    this.intakeNoise.start();

    // ═══ MECHANICAL ═══
    this.mechGain = this.ctx.createGain();
    this.mechGain.gain.value = 0;
    this.mechFilter = this.ctx.createBiquadFilter();
    this.mechFilter.type = 'highpass';
    this.mechFilter.frequency.value = 1800;
    this.mechFilter.Q.value = 0.6;
    this.mechNoise = this.ctx.createBufferSource();
    this.mechNoise.buffer = this.noiseBuffer;
    this.mechNoise.loop = true;
    this.mechNoise.connect(this.mechFilter);
    this.mechFilter.connect(this.mechGain);
    this.mechGain.connect(this.output);
    this.mechNoise.start();

    // ═══ EXHAUST POPPING ═══
    // Noise burst saat throttle release — "pop-pop-pop"
    this.popGain = this.ctx.createGain();
    this.popGain.gain.value = 0;
    this.popFilter = this.ctx.createBiquadFilter();
    this.popFilter.type = 'bandpass';
    this.popFilter.frequency.value = 800;
    this.popFilter.Q.value = 2;
    this.popNoise = this.ctx.createBufferSource();
    this.popNoise.buffer = this.noiseBuffer;
    this.popNoise.loop = false;
    this.popNoise.connect(this.popFilter);
    this.popFilter.connect(this.popGain);
    this.popGain.connect(this.output);

    // ═══ TURBO FLUTTER ═══
    // "Stututu" sound saat throttle close + boost
    this.flutterOsc = this.ctx.createOscillator();
    this.flutterOsc.type = 'sawtooth';
    this.flutterOsc.frequency.value = 200;
    this.flutterGain = this.ctx.createGain();
    this.flutterGain.gain.value = 0;
    const flutterFilter = this.ctx.createBiquadFilter();
    flutterFilter.type = 'bandpass';
    flutterFilter.frequency.value = 1500;
    flutterFilter.Q.value = 3;
    this.flutterLFO = this.ctx.createOscillator();
    this.flutterLFO.type = 'square';
    this.flutterLFO.frequency.value = 8;
    this.flutterLFOGain = this.ctx.createGain();
    this.flutterLFOGain.gain.value = 0;
    this.flutterLFO.connect(this.flutterLFOGain);
    this.flutterLFOGain.connect(this.flutterGain.gain);
    this.flutterOsc.connect(flutterFilter);
    flutterFilter.connect(this.flutterGain);
    this.flutterGain.connect(this.output);
    this.flutterOsc.start();
    this.flutterLFO.start();

    // ═══ REV LIMITER LFO ═══
    this.limiterLFO = this.ctx.createOscillator();
    this.limiterLFO.type = 'square';
    this.limiterLFO.frequency.value = 0;
    this.limiterGain = this.ctx.createGain();
    this.limiterGain.gain.value = 0;
    this.limiterLFO.connect(this.limiterGain);
    this.limiterGain.connect(this.exhaustMasterGain!.gain);
    this.limiterLFO.start();

    // ═══ IDLE VARIATION ═══
    this.idleLFO1 = this.ctx.createOscillator();
    this.idleLFO1.type = 'sine';
    this.idleLFO1.frequency.value = 3.5;
    this.idleLFO1Gain = this.ctx.createGain();
    this.idleLFO1Gain.gain.value = 0;
    this.idleLFO1.connect(this.idleLFO1Gain);
    this.idleLFO1Gain.connect(this.exhaustMasterGain!.gain);
    this.idleLFO1.start();

    this.idleLFO2 = this.ctx.createOscillator();
    this.idleLFO2.type = 'sine';
    this.idleLFO2.frequency.value = 0.8;
    this.idleLFO2Gain = this.ctx.createGain();
    this.idleLFO2Gain.gain.value = 0;
    this.idleLFO2.connect(this.idleLFO2Gain);
    this.idleLFO2Gain.connect(this.exhaustOscs[0].frequency);
    this.idleLFO2.start();

    // ═══ TRANSMISSION WHINE ═══
    this.trannyOsc = this.ctx.createOscillator();
    this.trannyOsc.type = 'sawtooth';
    this.trannyOsc.frequency.value = 100;
    this.trannyGain = this.ctx.createGain();
    this.trannyGain.gain.value = 0;
    this.trannyFilter = this.ctx.createBiquadFilter();
    this.trannyFilter.type = 'bandpass';
    this.trannyFilter.frequency.value = 2000;
    this.trannyFilter.Q.value = 2;
    this.trannyOsc.connect(this.trannyFilter);
    this.trannyFilter.connect(this.trannyGain);
    this.trannyGain.connect(this.output);
    this.trannyOsc.start();
  }

  update(rpm: number, throttle: number, atRevLimiter: boolean): void {
    if (!this.running) return;

    const now = this.ctx.currentTime;
    const rpmNorm = Math.min(1, rpm / this.redline);

    // ═══ EXHAUST ═══
    if (this.exhaustMasterGain && this.exhaustFilter && this.exhaustResonance) {
      const firingFreq = (rpm / 60) * (this.cylinderCount / 2);
      for (let i = 0; i < this.exhaustOscs.length; i++) {
        const harmonicMultipliers = [1, 2, 3, 4.5, 6];
        this.exhaustOscs[i].frequency.setTargetAtTime(
          firingFreq * harmonicMultipliers[i], now, 0.015
        );
      }
      const exhaustVol = (0.15 + rpmNorm * 0.55) * (0.15 + throttle * 0.85);
      this.exhaustMasterGain.gain.setTargetAtTime(exhaustVol, now, 0.02);
      const cutoff = 500 + rpmNorm * 2000 + throttle * 1000;
      this.exhaustFilter.frequency.setTargetAtTime(cutoff, now, 0.02);
      this.exhaustResonance.frequency.setTargetAtTime(firingFreq * 2, now, 0.03);
      this.exhaustResonance.gain.setTargetAtTime(2 + rpmNorm * 10, now, 0.03);
    }

    // ═══ SUB-BASS ═══
    if (this.subOsc && this.subGain) {
      const subFreq = (rpm / 60) * (this.cylinderCount / 4);
      this.subOsc.frequency.setTargetAtTime(subFreq, now, 0.02);
      const subVol = (0.15 + rpmNorm * 0.15) * (0.3 + throttle * 0.7);
      this.subGain.gain.setTargetAtTime(subVol, now, 0.03);
    }

    // ═══ INTAKE ═══
    if (this.intakeGain && this.intakeFilter) {
      const intakeVol = throttle * 0.18 * (0.3 + rpmNorm * 0.7);
      this.intakeGain.gain.setTargetAtTime(intakeVol, now, 0.02);
      const intakeCutoff = 1000 + throttle * 5000 + rpmNorm * 2000;
      this.intakeFilter.frequency.setTargetAtTime(intakeCutoff, now, 0.02);
    }

    // ═══ MECHANICAL ═══
    if (this.mechGain && this.mechFilter) {
      const mechVol = rpmNorm * 0.10 * (0.4 + throttle * 0.6);
      this.mechGain.gain.setTargetAtTime(mechVol, now, 0.03);
      this.mechFilter.frequency.setTargetAtTime(1200 + rpmNorm * 4000, now, 0.03);
    }

    // ═══ EXHAUST POPPING ═══
    // Deteksi throttle release: throttle turun drastis
    if (this.popGain && this.popNoise && this.popFilter) {
      const throttleDrop = this.prevThrottle - throttle;
      this.popCooldown = Math.max(0, this.popCooldown - 0.016);

      if (throttleDrop > 0.3 && this.prevThrottle > 0.5 && this.popCooldown <= 0 && rpm > 2000) {
        // Throttle release signifikan → trigger popping
        try {
          this.popNoise.stop();
        } catch { /* */ }
        this.popNoise = this.ctx.createBufferSource();
        this.popNoise.buffer = this.noiseBuffer;
        this.popNoise.connect(this.popFilter);
        this.popFilter.connect(this.popGain);

        // Random pop timing
        const popFreq = 400 + Math.random() * 600;
        this.popFilter.frequency.setTargetAtTime(popFreq, now, 0.001);
        this.popFilter.Q.setTargetAtTime(3 + Math.random() * 4, now, 0.001);

        // Burst volume — makin keras di RPM tinggi
        const popVol = 0.2 + rpmNorm * 0.4;
        this.popGain.gain.setTargetAtTime(popVol, now, 0.001);
        this.popGain.gain.setTargetAtTime(0, now + 0.05 + Math.random() * 0.08, 0.01);

        this.popNoise.start(now);
        this.popNoise.stop(now + 0.15);
        this.popCooldown = 0.1 + Math.random() * 0.15;
      }
      this.prevThrottle = throttle;
    }

    // ═══ TURBO FLUTTER ═══
    // "Stututu" saat throttle close + RPM tinggi (simulated boost)
    if (this.flutterGain && this.flutterLFO && this.flutterLFOGain && this.flutterOsc) {
      const isFluttering = throttle < 0.1 && this.prevThrottle > 0.5 && rpm > 3000 && rpm < this.redline * 0.85;
      if (isFluttering) {
        // Flutter muncul saat throttle close tiba-tiba
        const flutterIntensity = this.prevThrottle * rpmNorm * 0.3;
        this.flutterGain.gain.setTargetAtTime(flutterIntensity, now, 0.005);
        // LFO rate = "stututu" speed
        this.flutterLFO.frequency.setTargetAtTime(6 + rpmNorm * 10, now, 0.01);
        // Flutter pitch naik sesuai RPM
        this.flutterOsc.frequency.setTargetAtTime(150 + rpmNorm * 300, now, 0.01);
      } else {
        this.flutterGain.gain.setTargetAtTime(0, now, 0.02);
      }
    }

    // ═══ IDLE VARIATION ═══
    if (this.idleLFO1 && this.idleLFO1Gain) {
      const idleIntensity = (1 - rpmNorm) * (1 - throttle * 0.8);
      this.idleLFO1.frequency.setTargetAtTime(3 + rpmNorm * 2, now, 0.05);
      this.idleLFO1Gain.gain.setTargetAtTime(idleIntensity * 0.25, now, 0.05);
    }
    if (this.idleLFO2 && this.idleLFO2Gain) {
      const idleFreqIntensity = (1 - rpmNorm) * (1 - throttle * 0.9);
      this.idleLFO2.frequency.setTargetAtTime(0.6 + rpmNorm * 1.5, now, 0.08);
      this.idleLFO2Gain.gain.setTargetAtTime(idleFreqIntensity * 20, now, 0.08);
    }

    // ═══ REV LIMITER — lebih agresif ═══
    if (this.limiterLFO && this.limiterGain) {
      if (atRevLimiter) {
        this.limiterLFO.frequency.setTargetAtTime(15 + Math.random() * 10, now, 0.003);
        this.limiterGain.gain.setTargetAtTime(0.6, now, 0.003);
        if (this.exhaustMasterGain) {
          const bounceVol = (0.15 + rpmNorm * 0.55) * (0.15 + throttle * 0.85) * 0.5;
          this.exhaustMasterGain.gain.setTargetAtTime(bounceVol, now, 0.003);
        }
      } else {
        this.limiterGain.gain.setTargetAtTime(0, now, 0.02);
      }
    }

    // ═══ TRANSMISSION WHINE ═══
    if (this.trannyOsc && this.trannyGain && this.trannyFilter) {
      const trannyFreq = rpm * this.gearRatio * 0.05;
      this.trannyOsc.frequency.setTargetAtTime(trannyFreq, now, 0.02);
      const trannyVol = throttle * 0.06 * (0.3 + rpmNorm * 0.7);
      this.trannyGain.gain.setTargetAtTime(trannyVol, now, 0.03);
      this.trannyFilter.frequency.setTargetAtTime(1500 + rpmNorm * 2000, now, 0.03);
    }

    // ═══ TRACK PREV THROTTLE ═══
    this.prevThrottle = throttle;
  }

  stop(): void {
    if (!this.running) return;
    this.running = false;

    try {
      this.exhaustOscs.forEach(o => o.stop());
      this.subOsc?.stop();
      this.intakeNoise?.stop();
      this.mechNoise?.stop();
      this.popNoise?.stop();
      this.flutterOsc?.stop();
      this.flutterLFO?.stop();
      this.limiterLFO?.stop();
      this.idleLFO1?.stop();
      this.idleLFO2?.stop();
      this.trannyOsc?.stop();
    } catch { /* already stopped */ }

    this.exhaustOscs = [];
    this.exhaustGains = [];
    this.subOsc = null;
    this.intakeNoise = null;
    this.mechNoise = null;
    this.popNoise = null;
    this.flutterOsc = null;
    this.flutterLFO = null;
    this.limiterLFO = null;
    this.idleLFO1 = null;
    this.idleLFO2 = null;
    this.trannyOsc = null;
  }
}
