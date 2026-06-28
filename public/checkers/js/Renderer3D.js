// ============================================================
// Renderer3D.js — Three.js 3D board + pieces
// ============================================================
'use strict';

export class Renderer3D {
  constructor(canvas, theme) {
    this.canvas   = canvas;
    this.theme    = theme;
    this.THREE    = window.THREE;
    this.size     = 8;
    this.tileSize = 1.0;

    this._pieces   = {};    // key: "r_c" → THREE.Mesh
    this._tiles    = [];    // all tile meshes for raycasting
    this._selected = null;
    this._hints    = [];    // hint dot meshes
    this._animQ    = [];    // animation queue

    this._init();
  }

  // ── Bootstrap ─────────────────────────────────────────────

  _init() {
    const T = this.THREE;

    // Renderer
    this.renderer = new T.WebGLRenderer({ canvas: this.canvas, antialias: true, alpha: false });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type    = T.PCFSoftShadowMap;
    this.renderer.outputEncoding    = T.sRGBEncoding;
    this._resize();

    // Scene
    this.scene  = new T.Scene();
    // Use a safe placeholder aspect (1) here — the real value is set
    // right after by _resize(), which measures getBoundingClientRect()
    // safely and guards against a momentary 0-height container.
    this.camera = new T.PerspectiveCamera(45, 1, 0.1, 100);
    this.camera.position.set(0, 9, 8);
    this.camera.lookAt(0, 0, 0);

    // Fog
    this.scene.fog = new T.FogExp2(0x1a3d10, 0.06);

    // Lighting
    this._buildLights();

    // Board group
    this.boardGroup = new T.Group();
    this.scene.add(this.boardGroup);

    this._buildBoard();
    this._buildFrame();

    // Raycaster
    this.raycaster = new T.Raycaster();
    this.mouse     = new T.Vector2();

    // Now that the camera exists, force one more resize pass so its
    // aspect ratio reflects the canvas's real size (the call at the top
    // of _init() only had the renderer to size, since the camera didn't
    // exist yet).
    this._lastW = undefined;
    this._lastH = undefined;
    this._resize();

    // Keep the canvas/camera in sync with its real on-screen size going
    // forward. A single _resize() call at construction time isn't
    // reliable on its own — flex/grid containers often report 0 or a
    // stale size on first paint, which is what caused the squashed,
    // zoomed-in board. ResizeObserver fixes this for layout changes;
    // window 'resize' covers the popup window itself.
    this._ro = new ResizeObserver(() => this._resize());
    this._ro.observe(this.canvas);
    this._onWindowResize = () => this._resize();
    window.addEventListener('resize', this._onWindowResize);

    this._loop();
  }

  _buildLights() {
    const T = this.THREE;
    const th = this.theme;

    this.ambientLight = new T.AmbientLight(0xffffff, th.ambientIntensity);
    this.scene.add(this.ambientLight);

    this.dirLight = new T.DirectionalLight(th.lightColor || 0xffffff, 0.9);
    this.dirLight.position.set(5, 12, 7);
    this.dirLight.castShadow = true;
    this.dirLight.shadow.mapSize.width  = 2048;
    this.dirLight.shadow.mapSize.height = 2048;
    this.dirLight.shadow.camera.near    = 0.5;
    this.dirLight.shadow.camera.far     = 30;
    this.dirLight.shadow.camera.left    = -6;
    this.dirLight.shadow.camera.right   =  6;
    this.dirLight.shadow.camera.top     =  6;
    this.dirLight.shadow.camera.bottom  = -6;
    this.scene.add(this.dirLight);

    // Rim light
    const rim = new T.DirectionalLight(0x8888ff, 0.3);
    rim.position.set(-5, 6, -5);
    this.scene.add(rim);

    // Point light above center
    this.pointLight = new T.PointLight(0xffeedd, 0.6, 12);
    this.pointLight.position.set(0, 6, 0);
    this.scene.add(this.pointLight);
  }

  _buildBoard() {
    const T = this.THREE;
    const th = this.theme;
    const half = (this.size / 2) - 0.5;

    this._tiles = [];

    for (let r = 0; r < this.size; r++) {
      for (let c = 0; c < this.size; c++) {
        const isLight = (r + c) % 2 === 0;
        const geo     = new T.BoxGeometry(this.tileSize, 0.12, this.tileSize);
        const mat     = new T.MeshStandardMaterial({
          color:     isLight ? th.lightTile : th.darkTile,
          roughness: 0.75,
          metalness: 0.05
        });
        const mesh = new T.Mesh(geo, mat);
        mesh.receiveShadow = true;
        mesh.position.set(c - half, 0, r - half);
        mesh.userData = { type: 'tile', row: r, col: c, isLight };

        this.boardGroup.add(mesh);
        if (!isLight) this._tiles.push(mesh); // only dark squares are valid
      }
    }
  }

  _buildFrame() {
    const T  = this.THREE;
    const th = this.theme;
    const h  = this.size / 2;

    const frameMat = new T.MeshStandardMaterial({ color: th.border, roughness: 0.6, metalness: 0.2 });
    const pieces = [
      [h + 0.3, 0.15, h * 2 + 0.6, 2 * h + 0.6, 0],     // top
      [-(h + 0.3), 0.15, h * 2 + 0.6, 2 * h + 0.6, 0],   // bottom… wait, recompute
    ];
    // Simpler: 4 border bars
    const bars = [
      { pos: [0,  -0.08,  h + 0.3], size: [h*2+0.6, 0.3, 0.6] },
      { pos: [0,  -0.08, -h - 0.3], size: [h*2+0.6, 0.3, 0.6] },
      { pos: [ h + 0.3, -0.08, 0],  size: [0.6, 0.3, h*2+0.6] },
      { pos: [-h - 0.3, -0.08, 0],  size: [0.6, 0.3, h*2+0.6] },
    ];
    for (const b of bars) {
      const geo  = new T.BoxGeometry(...b.size);
      const mesh = new T.Mesh(geo, frameMat);
      mesh.position.set(...b.pos);
      mesh.receiveShadow = true;
      this.boardGroup.add(mesh);
    }

    // Thin top label bar (gold strip at top)
    const topGeo = new T.BoxGeometry(h*2+0.6, 0.04, 0.3);
    const topMat = new T.MeshStandardMaterial({ color: 0xFFD700, roughness: 0.4, metalness: 0.7 });
    const topBar = new T.Mesh(topGeo, topMat);
    topBar.position.set(0, 0.04, -h - 0.3);
    this.boardGroup.add(topBar);
  }

  // ── Piece Management ──────────────────────────────────────

  syncPieces(board) {
    const T    = this.THREE;
    const th   = this.theme;
    const half = (this.size / 2) - 0.5;
    const existing = new Set(Object.keys(this._pieces));

    for (let r = 0; r < board.length; r++) {
      for (let c = 0; c < board[r].length; c++) {
        const cell = board[r][c];
        const key  = `${r}_${c}`;
        if (cell) {
          existing.delete(key);
          if (!this._pieces[key]) {
            this._pieces[key] = this._createPiece(cell, r, c, half, th);
            this.boardGroup.add(this._pieces[key]);
          } else {
            // Update king status
            const mesh = this._pieces[key];
            if (cell.king && !mesh.userData.king) {
              this._markKing(mesh, cell.color, th);
            }
          }
        }
      }
    }

    // Remove captured pieces
    for (const key of existing) {
      const mesh = this._pieces[key];
      if (mesh) {
        this.boardGroup.remove(mesh);
        mesh.geometry.dispose();
        delete this._pieces[key];
      }
    }
  }

  _createPiece(cell, r, c, half, th) {
    const T       = this.THREE;
    const isWhite = cell.color === 'white';

    // Body cylinder
    const geo  = new T.CylinderGeometry(0.38, 0.41, 0.18, 32);
    const mat  = new T.MeshStandardMaterial({
      color:     isWhite ? th.whitePiece : th.blackPiece,
      roughness: 0.35,
      metalness: 0.18,
      emissive:  isWhite ? th.emissiveW : th.emissiveB,
      emissiveIntensity: 0.12
    });
    const mesh = new T.Mesh(geo, mat);
    mesh.castShadow    = true;
    mesh.receiveShadow = true;

    // Concentric ring detail on top
    for (let i = 1; i <= 3; i++) {
      const rGeo  = new T.TorusGeometry(0.38 - i * 0.08, 0.012, 8, 32);
      const rMat  = new T.MeshStandardMaterial({
        color:     isWhite ? 0xD4C09A : 0x1A1A1A,
        roughness: 0.5
      });
      const ring  = new T.Mesh(rGeo, rMat);
      ring.rotation.x = Math.PI / 2;
      ring.position.y = 0.09;
      mesh.add(ring);
    }

    mesh.position.set(c - half, 0.21, r - half);
    mesh.userData = { type: 'piece', row: r, col: c, color: cell.color, king: cell.king };

    if (cell.king) this._markKing(mesh, cell.color, th);

    return mesh;
  }

  _markKing(mesh, color, th) {
    const T    = this.THREE;
    const isW  = color === 'white';

    // Gold crown disc on top
    const crownGeo = new T.CylinderGeometry(0.22, 0.28, 0.08, 6);
    const crownMat = new T.MeshStandardMaterial({
      color:     isW ? th.whiteKing : th.blackKing,
      roughness: 0.2,
      metalness: 0.85,
      emissive:  isW ? th.whiteKing : th.blackKing,
      emissiveIntensity: 0.4
    });
    const crown = new T.Mesh(crownGeo, crownMat);
    crown.position.y = 0.14;
    mesh.add(crown);
    mesh.userData.king = true;
  }

  // ── Move Animation ────────────────────────────────────────

  animateMove(fromPos, toPos, capturedPositions, onComplete) {
    const T    = this.THREE;
    const half = (this.size / 2) - 0.5;
    const key  = `${fromPos.row}_${fromPos.col}`;
    const mesh = this._pieces[key];
    if (!mesh) { onComplete && onComplete(); return; }

    const startX = fromPos.col - half;
    const startZ = fromPos.row - half;
    const endX   = toPos.col   - half;
    const endZ   = toPos.row   - half;
    const arcH   = 1.2;
    let   t      = 0;
    const dur    = 30; // frames

    // Remove from old key, reassign after
    delete this._pieces[key];

    const animate = () => {
      t++;
      const p   = t / dur;
      const ep  = this._easeInOut(p);
      mesh.position.x = startX + (endX - startX) * ep;
      mesh.position.z = startZ + (endZ - startZ) * ep;
      // Arc
      mesh.position.y = 0.21 + Math.sin(p * Math.PI) * arcH;

      if (t < dur) {
        this._animQ.push(animate);
      } else {
        mesh.position.set(endX, 0.21, endZ);
        mesh.userData.row = toPos.row;
        mesh.userData.col = toPos.col;
        this._pieces[`${toPos.row}_${toPos.col}`] = mesh;

        // Remove captured
        for (const cap of capturedPositions) {
          this._removePiece(cap.row, cap.col);
        }
        onComplete && onComplete();
      }
    };
    this._animQ.push(animate);
  }

  _removePiece(r, c) {
    const key  = `${r}_${c}`;
    const mesh = this._pieces[key];
    if (!mesh) return;
    this.boardGroup.remove(mesh);
    mesh.geometry.dispose();
    delete this._pieces[key];
  }

  _easeInOut(t) {
    return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
  }

  // ── Highlights ───────────────────────────────────────────

  selectPiece(row, col) {
    this._clearSelection();
    const key  = `${row}_${col}`;
    const mesh = this._pieces[key];
    if (!mesh) return;

    this._selected = { row, col, mesh };
    // Glow: boost emissive
    const mat = mesh.material;
    this._origEmissive = mat.emissive.clone();
    mat.emissive.setHex(0x44aaff);
    mat.emissiveIntensity = 0.6;
  }

  showHints(moves) {
    this._clearHints();
    const T    = this.THREE;
    const half = (this.size / 2) - 0.5;

    for (const m of moves) {
      const geo  = new T.CylinderGeometry(0.18, 0.18, 0.04, 24);
      const mat  = new T.MeshStandardMaterial({
        color:   0x00ff88,
        emissive: 0x00ff88,
        emissiveIntensity: 0.8,
        transparent: true,
        opacity: 0.8
      });
      const dot  = new T.Mesh(geo, mat);
      dot.position.set(m.to.col - half, 0.1, m.to.row - half);
      dot.userData = { type: 'hint', row: m.to.row, col: m.to.col };
      this.boardGroup.add(dot);
      this._hints.push(dot);
    }
  }

  _clearHints() {
    for (const h of this._hints) {
      this.boardGroup.remove(h);
      h.geometry.dispose();
    }
    this._hints = [];
  }

  _clearSelection() {
    if (this._selected) {
      const mat = this._selected.mesh.material;
      if (this._origEmissive) {
        mat.emissive.copy(this._origEmissive);
      }
      mat.emissiveIntensity = 0.12;
    }
    this._selected = null;
    this._origEmissive = null;
    this._clearHints();
  }

  clearSelection() { this._clearSelection(); }

  // ── Theme Hot-swap ────────────────────────────────────────

  applyTheme(theme) {
    this.theme = theme;
    this.scene.fog.color.setStyle(theme.fogColor || '#1a3d10');
    this.ambientLight.intensity = theme.ambientIntensity;

    // Re-color tiles
    for (const tile of this._tiles) {
      tile.material.color.setHex(theme.darkTile);
    }
    // Re-color light tiles
    this.boardGroup.children.forEach(ch => {
      if (ch.userData.type === 'tile' && ch.userData.isLight) {
        ch.material.color.setHex(theme.lightTile);
      }
    });
    // Re-color pieces
    for (const [key, mesh] of Object.entries(this._pieces)) {
      const isWhite = mesh.userData.color === 'white';
      mesh.material.color.setHex(isWhite ? theme.whitePiece : theme.blackPiece);
      mesh.material.emissive.setHex(isWhite ? theme.emissiveW : theme.emissiveB);
    }
  }

  // ── Camera ───────────────────────────────────────────────

  setCameraAngle(angle) {
    // angle: 'top' | 'side' | 'default'
    const T = this.THREE;
    const positions = {
      default: [0, 9, 8],
      top:     [0, 13, 0.01],
      side:    [0, 5, 11]
    };
    const [x, y, z] = positions[angle] || positions.default;
    this.camera.position.set(x, y, z);
    this.camera.lookAt(0, 0, 0);
  }

  // ── Raycasting ───────────────────────────────────────────

  pick(clientX, clientY) {
    const rect = this.canvas.getBoundingClientRect();
    this.mouse.x =  ((clientX - rect.left)  / rect.width)  * 2 - 1;
    this.mouse.y = -((clientY - rect.top)   / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(this.mouse, this.camera);

    // Check hints first
    const hintHits = this.raycaster.intersectObjects(this._hints);
    if (hintHits.length) {
      const { row, col } = hintHits[0].object.userData;
      return { type: 'hint', row, col };
    }

    // Check pieces
    const pieceMeshes = Object.values(this._pieces);
    const pieceHits   = this.raycaster.intersectObjects(pieceMeshes, true);
    if (pieceHits.length) {
      let obj = pieceHits[0].object;
      while (obj.parent && obj.userData.type !== 'piece') obj = obj.parent;
      if (obj.userData.type === 'piece') {
        return { type: 'piece', row: obj.userData.row, col: obj.userData.col, color: obj.userData.color };
      }
    }

    // Check tiles
    const tileHits = this.raycaster.intersectObjects(this._tiles);
    if (tileHits.length) {
      const { row, col } = tileHits[0].object.userData;
      return { type: 'tile', row, col };
    }

    return null;
  }

  // ── Render Loop ───────────────────────────────────────────

  _loop() {
    this._rafId = requestAnimationFrame(() => this._loop());

    // Pulse hints
    const t = Date.now() * 0.003;
    for (const h of this._hints) {
      h.material.emissiveIntensity = 0.6 + 0.4 * Math.sin(t);
      h.position.y = 0.1 + 0.03 * Math.sin(t * 1.5);
    }

    // Animate pieces
    if (this._animQ.length) {
      const fn = this._animQ.shift();
      fn();
    }

    this.renderer.render(this.scene, this.camera);
  }

  _resize() {
    const rect = this.canvas.getBoundingClientRect();
    const w = Math.max(1, Math.round(rect.width));
    const h = Math.max(1, Math.round(rect.height));
    if (w === this._lastW && h === this._lastH) return;
    this._lastW = w;
    this._lastH = h;

    this.renderer.setSize(w, h, false);
    if (this.camera) {
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
    }
  }

  onResize() { this._resize(); }

  destroy() {
    cancelAnimationFrame(this._rafId);
    if (this._ro) this._ro.disconnect();
    if (this._onWindowResize) window.removeEventListener('resize', this._onWindowResize);
    this.renderer.dispose();
  }
}
