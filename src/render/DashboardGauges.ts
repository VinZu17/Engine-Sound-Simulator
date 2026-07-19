/**
 * DashboardGauges — Canvas-based RPM + Speed gauges.
 * Jarum mutar searah jarum jam dari 7:30 ke 4:30.
 */
export class DashboardGauges {
  private rpmCanvas: HTMLCanvasElement;
  private speedCanvas: HTMLCanvasElement;
  private rpmCtx: CanvasRenderingContext2D;
  private speedCtx: CanvasRenderingContext2D;

  // EMA smoothing — biar jarum gak jitter
  private smoothRPM = 0;
  private smoothSpeed = 0;
  private readonly SMOOTH_FACTOR = 0.15;

  constructor(rpmContainer: HTMLElement, speedContainer: HTMLElement) {
    // RPM gauge
    this.rpmCanvas = document.createElement('canvas');
    this.rpmCanvas.width = 240;
    this.rpmCanvas.height = 240;
    this.rpmCanvas.style.width = '100%';
    this.rpmCanvas.style.height = '100%';
    rpmContainer.appendChild(this.rpmCanvas);
    this.rpmCtx = this.rpmCanvas.getContext('2d')!;

    // Speed gauge
    this.speedCanvas = document.createElement('canvas');
    this.speedCanvas.width = 240;
    this.speedCanvas.height = 240;
    this.speedCanvas.style.width = '100%';
    this.speedCanvas.style.height = '100%';
    speedContainer.appendChild(this.speedCanvas);
    this.speedCtx = this.speedCanvas.getContext('2d')!;
  }

  update(rpm: number, speedMPH: number, redline: number): void {
    // Gak ada smoothing — pakai raw RPM biar sync dengan shift lights
    this.drawGauge(this.rpmCtx, rpm, 0, redline, 'rpm', '#4ade80', redline - 500, rpm);
    this.drawGauge(this.speedCtx, speedMPH, 0, 200, 'mph', '#4a9eff', 999, speedMPH);
  }

  private drawGauge(
    ctx: CanvasRenderingContext2D,
    value: number,
    min: number,
    max: number,
    unit: string,
    color: string,
    warningStart: number,
    rawValue: number = value
  ): void {
    const w = ctx.canvas.width;
    const h = ctx.canvas.height;
    const cx = w / 2;
    const cy = h / 2;
    const r = Math.min(w, h) * 0.42;

    ctx.clearRect(0, 0, w, h);

    // ═══ ARAH JARUM JAM ═══
    // Start: 135° (7:30, bawah kiri) → End: 405° (4:30, bawah kanan)
    // Canvas arc pakai false = counterclockwise VISUAL tapi INCREASING ANGLE
    // Karena canvas Y axis dibalik, increasing angle = clockwise visual
    const startAngle = (135 * Math.PI) / 180;   // 7:30 position
    const endAngle = (405 * Math.PI) / 180;      // 4:30 position (= -135° + 360°)
    const range = (270 * Math.PI) / 180;          // 270 derajat total

    // ═══ BACKGROUND ARC ═══ — full gauge arc
    ctx.beginPath();
    ctx.arc(cx, cy, r, startAngle, endAngle, false);
    ctx.strokeStyle = '#2a2a2a';
    ctx.lineWidth = 12;
    ctx.lineCap = 'round';
    ctx.stroke();

    // ═══ WARNING ZONE ARC ═══ — dari warning ke end
    const warningRatio = (warningStart - min) / (max - min);
    const warningAngle = startAngle + warningRatio * range;
    ctx.beginPath();
    ctx.arc(cx, cy, r, warningAngle, endAngle, false);
    ctx.strokeStyle = 'rgba(239, 68, 68, 0.3)';
    ctx.lineWidth = 12;
    ctx.lineCap = 'round';
    ctx.stroke();

    // ═══ ACTIVE ARC ═══ — dari start ke needle position
    const ratio = Math.min(1, Math.max(0, (value - min) / (max - min)));
    const activeAngle = startAngle + ratio * range;
    ctx.beginPath();
    ctx.arc(cx, cy, r, startAngle, activeAngle, false);
    ctx.strokeStyle = ratio > warningRatio ? '#ef4444' : color;
    ctx.lineWidth = 12;
    ctx.lineCap = 'round';
    ctx.stroke();

    // ═══ TICK MARKS ═══ — searah jarum jam
    const tickCount = unit === 'rpm' ? 18 : 12;
    for (let i = 0; i <= tickCount; i++) {
      const tickRatio = i / tickCount;
      const tickAngle = startAngle + tickRatio * range;
      const isMajor = i % 3 === 0;
      const innerR = r - (isMajor ? 22 : 18);
      const outerR = r - 14;

      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(tickAngle) * innerR, cy + Math.sin(tickAngle) * innerR);
      ctx.lineTo(cx + Math.cos(tickAngle) * outerR, cy + Math.sin(tickAngle) * outerR);
      ctx.strokeStyle = tickRatio * max > warningStart ? '#ef4444' : '#666666';
      ctx.lineWidth = isMajor ? 2 : 1;
      ctx.stroke();

      // Tick labels (major ticks only)
      if (isMajor) {
        const labelR = r - 32;
        const tickValue = Math.round(min + tickRatio * (max - min));
        ctx.fillStyle = '#888888';
        ctx.font = '10px "JetBrains Mono", monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(
          tickValue.toString(),
          cx + Math.cos(tickAngle) * labelR,
          cy + Math.sin(tickAngle) * labelR
        );
      }
    }

    // ═══ NEEDLE — searah jarum jam + vibration ═══
    let needleAngle = startAngle + ratio * range;

    // Needle vibration: getar saat rev limiter atau idle
    if (unit === 'rpm') {
      const rpmRatio = rawValue / max;
      if (rpmRatio > 0.95) {
        // Rev limiter: vibration kuat
        needleAngle += (Math.random() - 0.5) * 0.04;
      } else if (rpmRatio < 0.1) {
        // Idle: vibration halus (cam lope)
        needleAngle += (Math.random() - 0.5) * 0.008;
      }
    }

    const needleLen = r - 8;

    // Needle shadow
    ctx.beginPath();
    ctx.moveTo(cx + 2, cy + 2);
    ctx.lineTo(
      cx + Math.cos(needleAngle) * needleLen + 2,
      cy + Math.sin(needleAngle) * needleLen + 2
    );
    ctx.strokeStyle = 'rgba(0,0,0,0.3)';
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.stroke();

    // Needle body
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(
      cx + Math.cos(needleAngle) * needleLen,
      cy + Math.sin(needleAngle) * needleLen
    );
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.stroke();

    // Needle tip (red)
    ctx.beginPath();
    ctx.arc(
      cx + Math.cos(needleAngle) * needleLen,
      cy + Math.sin(needleAngle) * needleLen,
      3, 0, Math.PI * 2
    );
    ctx.fillStyle = '#ef4444';
    ctx.fill();

    // Center hub
    ctx.beginPath();
    ctx.arc(cx, cy, 6, 0, Math.PI * 2);
    ctx.fillStyle = '#333333';
    ctx.fill();
    ctx.strokeStyle = '#555555';
    ctx.lineWidth = 1;
    ctx.stroke();

    // ═══ VALUE TEXT ═══
    ctx.fillStyle = '#e0e0e0';
    ctx.font = 'bold 36px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(Math.round(value).toString(), cx, cy + 20);

    // Unit label
    ctx.fillStyle = '#888888';
    ctx.font = '12px "JetBrains Mono", monospace';
    ctx.fillText(unit, cx, cy + 42);
  }

  destroy(): void {
    this.rpmCanvas.remove();
    this.speedCanvas.remove();
  }
}
