import * as THREE from 'three';

/**
 * EngineRenderer — Three.js scene setup + render loop.
 * Renders procedural 3D engine model (block, pistons, crankshaft, flywheel).
 */
export class EngineRenderer {
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private renderer: THREE.WebGLRenderer;
  private container: HTMLElement;

  // Engine components
  private engineGroup: THREE.Group;
  private pistons: THREE.Mesh[] = [];
  private connectingRods: THREE.Mesh[] = [];
  private crankshaft: THREE.Mesh | null = null;
  private flywheel: THREE.Mesh | null = null;
  private block: THREE.Mesh | null = null;

  // Animation state
  private crankAngle = 0;
  private cylinderCount = 10;
  private bore = 0.087; // 87.5mm
  private stroke = 0.079; // 79mm

  // Camera orbit
  private cameraAngle = 0;
  private cameraHeight = 1.5;
  private cameraDistance = 3;

  constructor(container: HTMLElement) {
    this.container = container;

    // Scene
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x111111);

    // Camera
    const aspect = container.clientWidth / container.clientHeight;
    this.camera = new THREE.PerspectiveCamera(45, aspect, 0.1, 100);
    this.camera.position.set(0, this.cameraHeight, this.cameraDistance);
    this.camera.lookAt(0, 0.3, 0);

    // Renderer
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(container.clientWidth, container.clientHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(this.renderer.domElement);

    // Lighting
    this.setupLights();

    // Engine group
    this.engineGroup = new THREE.Group();
    this.scene.add(this.engineGroup);

    // Build engine model
    this.buildEngine();

    // Resize handler
    window.addEventListener('resize', () => this.onResize());
  }

  private setupLights(): void {
    // Ambient light — soft fill
    const ambient = new THREE.AmbientLight(0x404050, 0.5);
    this.scene.add(ambient);

    // Key light — main illumination
    const keyLight = new THREE.DirectionalLight(0xffffff, 1.2);
    keyLight.position.set(3, 5, 3);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.width = 1024;
    keyLight.shadow.mapSize.height = 1024;
    this.scene.add(keyLight);

    // Fill light — softer, from opposite side
    const fillLight = new THREE.DirectionalLight(0x6688aa, 0.4);
    fillLight.position.set(-2, 3, -1);
    this.scene.add(fillLight);

    // Rim light — back edge highlight
    const rimLight = new THREE.DirectionalLight(0x4466ff, 0.3);
    rimLight.position.set(0, 2, -4);
    this.scene.add(rimLight);
  }

  private buildEngine(): void {
    // Materials
    const blockMat = new THREE.MeshStandardMaterial({
      color: 0x2a2a2a,
      metalness: 0.7,
      roughness: 0.3,
    });

    const metalMat = new THREE.MeshStandardMaterial({
      color: 0x888888,
      metalness: 0.9,
      roughness: 0.2,
    });

    const darkMat = new THREE.MeshStandardMaterial({
      color: 0x1a1a1a,
      metalness: 0.6,
      roughness: 0.4,
    });

    const accentMat = new THREE.MeshStandardMaterial({
      color: 0xcc4400,
      metalness: 0.5,
      roughness: 0.3,
    });

    // ═══ ENGINE BLOCK ═══
    const blockWidth = this.cylinderCount * 0.12;
    const blockGeo = new THREE.BoxGeometry(blockWidth, 0.4, 0.35);
    this.block = new THREE.Mesh(blockGeo, blockMat);
    this.block.position.y = 0.5;
    this.block.castShadow = true;
    this.block.receiveShadow = true;
    this.engineGroup.add(this.block);

    // Cylinder head (top cover)
    const headGeo = new THREE.BoxGeometry(blockWidth + 0.02, 0.08, 0.37);
    const head = new THREE.Mesh(headGeo, darkMat);
    head.position.y = 0.74;
    head.castShadow = true;
    this.engineGroup.add(head);

    // Valve covers (accent color)
    for (let bank = -1; bank <= 1; bank += 2) {
      const coverGeo = new THREE.BoxGeometry(blockWidth * 0.45, 0.06, 0.12);
      const cover = new THREE.Mesh(coverGeo, accentMat);
      cover.position.set(bank * blockWidth * 0.22, 0.8, 0);
      cover.castShadow = true;
      this.engineGroup.add(cover);
    }

    // ═══ CYLINDERS + PISTONS ═══
    this.pistons = [];
    this.connectingRods = [];

    for (let i = 0; i < this.cylinderCount; i++) {
      const x = (i - (this.cylinderCount - 1) / 2) * 0.12;

      // Cylinder bore (dark hole)
      const boreGeo = new THREE.CylinderGeometry(this.bore / 2, this.bore / 2, 0.36, 16);
      const boreMesh = new THREE.Mesh(boreGeo, darkMat);
      boreMesh.position.set(x, 0.5, 0);
      this.engineGroup.add(boreMesh);

      // Piston
      const pistonGeo = new THREE.CylinderGeometry(
        this.bore / 2 - 0.003, this.bore / 2 - 0.003, 0.04, 16
      );
      const piston = new THREE.Mesh(pistonGeo, metalMat);
      piston.position.set(x, 0.5, 0);
      piston.castShadow = true;
      this.engineGroup.add(piston);
      this.pistons.push(piston);

      // Connecting rod
      const rodGeo = new THREE.BoxGeometry(0.015, 0.2, 0.01);
      const rod = new THREE.Mesh(rodGeo, metalMat);
      rod.position.set(x, 0.35, 0);
      rod.castShadow = true;
      this.engineGroup.add(rod);
      this.connectingRods.push(rod);
    }

    // ═══ CRANKSHAFT ═══
    const crankGeo = new THREE.CylinderGeometry(0.025, 0.025, blockWidth + 0.1, 16);
    crankGeo.rotateZ(Math.PI / 2);
    this.crankshaft = new THREE.Mesh(crankGeo, metalMat);
    this.crankshaft.position.y = 0.15;
    this.crankshaft.castShadow = true;
    this.engineGroup.add(this.crankshaft);

    // Crank journals (offset pins)
    for (let i = 0; i < this.cylinderCount; i++) {
      const x = (i - (this.cylinderCount - 1) / 2) * 0.12;
      const pinGeo = new THREE.CylinderGeometry(0.012, 0.012, 0.06, 8);
      pinGeo.rotateZ(Math.PI / 2);
      const pin = new THREE.Mesh(pinGeo, metalMat);
      pin.position.set(x, 0.15, 0.025);
      this.engineGroup.add(pin);
    }

    // ═══ FLYWHEEL ═══
    const flywheelGeo = new THREE.CylinderGeometry(0.12, 0.12, 0.03, 32);
    flywheelGeo.rotateZ(Math.PI / 2);
    this.flywheel = new THREE.Mesh(flywheelGeo, darkMat);
    this.flywheel.position.set(blockWidth / 2 + 0.06, 0.15, 0);
    this.flywheel.castShadow = true;
    this.engineGroup.add(this.flywheel);

    // Flywheel ring gear (teeth indicator)
    const ringGeo = new THREE.TorusGeometry(0.12, 0.005, 8, 48);
    ringGeo.rotateY(Math.PI / 2);
    const ring = new THREE.Mesh(ringGeo, metalMat);
    ring.position.copy(this.flywheel.position);
    this.engineGroup.add(ring);

    // ═══ EXHAUST MANIFOLD ═══
    for (let i = 0; i < this.cylinderCount; i++) {
      const x = (i - (this.cylinderCount - 1) / 2) * 0.12;
      const pipeGeo = new THREE.CylinderGeometry(0.015, 0.015, 0.15, 8);
      pipeGeo.rotateX(Math.PI / 2);
      const pipe = new THREE.Mesh(pipeGeo, accentMat);
      pipe.position.set(x, 0.65, -0.22);
      this.engineGroup.add(pipe);
    }

    // Exhaust collector
    const collectorGeo = new THREE.CylinderGeometry(0.03, 0.03, blockWidth * 0.6, 12);
    collectorGeo.rotateZ(Math.PI / 2);
    const collector = new THREE.Mesh(collectorGeo, accentMat);
    collector.position.set(0, 0.65, -0.35);
    this.engineGroup.add(collector);

    // ═══ INTAKE MANIFOLD ═══
    for (let i = 0; i < this.cylinderCount; i++) {
      const x = (i - (this.cylinderCount - 1) / 2) * 0.12;
      const pipeGeo = new THREE.CylinderGeometry(0.018, 0.018, 0.12, 8);
      pipeGeo.rotateX(-Math.PI / 2);
      const pipe = new THREE.Mesh(pipeGeo, new THREE.MeshStandardMaterial({
        color: 0x555555,
        metalness: 0.6,
        roughness: 0.4,
      }));
      pipe.position.set(x, 0.65, 0.22);
      this.engineGroup.add(pipe);
    }

    // ═══ PISTON HEAD ACCENT ═══
    // Orange ring on piston tops (combustion chamber indicator)
    for (const piston of this.pistons) {
      const ringGeo = new THREE.TorusGeometry(this.bore / 2 - 0.005, 0.003, 8, 24);
      ringGeo.rotateX(Math.PI / 2);
      const ring = new THREE.Mesh(ringGeo, accentMat);
      ring.position.copy(piston.position);
      ring.position.y += 0.02;
      this.engineGroup.add(ring);
    }

    // Center the engine group
    this.engineGroup.position.y = -0.2;
  }

  /**
   * Update engine animation berdasarkan crank angle.
   */
  update(crankAngle: number, _rpm: number): void {
    this.crankAngle = crankAngle;

    // Update piston positions (sinusoidal motion)
    for (let i = 0; i < this.pistons.length; i++) {
      // Firing offset — setiap silinder beda phase
      const phaseOffset = (i / this.cylinderCount) * Math.PI * 2;
      const angle = crankAngle + phaseOffset;

      // Piston position = sin(angle) * stroke/2
      const pistonOffset = Math.sin(angle) * (this.stroke / 2);
      this.pistons[i].position.y = 0.5 + pistonOffset;

      // Connecting rod follows piston + slight angle
      this.connectingRods[i].position.y = 0.35 + pistonOffset * 0.6;
      this.connectingRods[i].rotation.z = Math.sin(angle) * 0.15;
    }

    // Rotate crankshaft
    if (this.crankshaft) {
      this.crankshaft.rotation.x = crankAngle;
    }

    // Rotate flywheel
    if (this.flywheel) {
      this.flywheel.rotation.x = crankAngle;
    }

    // Camera auto-orbit (slow)
    this.cameraAngle += 0.002;
    this.camera.position.x = Math.sin(this.cameraAngle) * this.cameraDistance;
    this.camera.position.z = Math.cos(this.cameraAngle) * this.cameraDistance;
    this.camera.position.y = this.cameraHeight;
    this.camera.lookAt(0, 0.3, 0);
  }

  /** Render satu frame */
  render(): void {
    this.renderer.render(this.scene, this.camera);
  }

  /** Handle window resize */
  private onResize(): void {
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  }

  /** Set cylinder count (untuk ganti engine) */
  setCylinderCount(count: number): void {
    this.cylinderCount = count;
    // Rebuild engine model
    while (this.engineGroup.children.length > 0) {
      const child = this.engineGroup.children[0];
      this.engineGroup.remove(child);
      if (child instanceof THREE.Mesh) {
        child.geometry.dispose();
        if (Array.isArray(child.material)) {
          child.material.forEach(m => m.dispose());
        } else {
          child.material.dispose();
        }
      }
    }
    this.pistons = [];
    this.connectingRods = [];
    this.crankshaft = null;
    this.flywheel = null;
    this.block = null;
    this.buildEngine();
  }

  destroy(): void {
    this.renderer.dispose();
    this.container.removeChild(this.renderer.domElement);
    window.removeEventListener('resize', this.onResize);
  }
}
