// ============================================================
// Dice3D.js — a real 3D CSS-cube die tumbling in a felt-lined tray
// ============================================================
// Pure DOM/CSS (no canvas, no WebGL — same reasoning as the checkers
// board dropping Three.js: keep it light for mobile). Ports the segment
// timeline design (toss → floor strike → wall-clip bounce → small bounce
// → tiny settle-hop → edge-rock → stop) so this vanilla page and the
// project's React Dice3D component share one visual language, even
// though only this file is actually wired into the live game — the
// Ludo board itself is a static HTML/canvas page, not React.
'use strict';

// Cube rotation (applied to the whole die) that brings each value's face
// to point at the viewer. Faces: front=1, back=6, right=2, left=5, top=3,
// bottom=4 — opposite faces sum to 7, like a real die.
const FACE_ROTATION = {
  1: { x: 0,   y: 0   },
  2: { x: 0,   y: -90 },
  3: { x: -90, y: 0   },
  4: { x: 90,  y: 0   },
  5: { x: 0,   y: 90  },
  6: { x: 180, y: 0   },
};

// Grid cells: a b c / d e f / g h i
const PIP_LAYOUTS = {
  1: [false, false, false, false, true, false, false, false, false],
  2: [true, false, false, false, false, false, false, false, true],
  3: [true, false, false, false, true, false, false, false, true],
  4: [true, false, true, false, false, false, true, false, true],
  5: [true, false, true, false, true, false, true, false, true],
  6: [true, false, true, true, false, true, true, false, true],
};

function easeOutQuad(u) { return 1 - (1 - u) * (1 - u); }
function easeInOutQuad(u) { return u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2; }
function rand(min, max) { return min + Math.random() * (max - min); }
function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

function buildTimeline(target) {
  const base = FACE_ROTATION[target] || FACE_ROTATION[1];
  const extraZ = pick([0, 90, 180, 270]);

  // Entry toss: die appears above the tray edge and dives in diagonally.
  const entryFrom = { x: rand(-46, 46), y: rand(-40, -26) };
  const impact1 = { x: rand(-18, 18), y: rand(6, 22) };

  // Wall clip: bounce 2 kicks off in a noticeably different direction, as
  // if it caromed off the tray's side wall.
  const wallSign = Math.random() > 0.5 ? 1 : -1;
  const impact2 = { x: impact1.x + wallSign * rand(20, 34), y: impact1.y - rand(10, 20) };
  const impact3 = { x: impact2.x - wallSign * rand(6, 12), y: impact2.y + rand(4, 10) };

  const spinDir = () => ({
    x: pick([-1, 1]) * rand(560, 900),
    y: pick([-1, 1]) * rand(560, 900),
    z: pick([-1, 1]) * rand(360, 640),
  });

  return [
    // Hard toss + first strike: biggest arc, fastest spin, most blur.
    { duration: 320, peakHeight: 118, fromPos: entryFrom, toPos: impact1, spin: spinDir(), blurPeak: 3.2 },
    // Bounces up, clips the wall, ricochets — lower and slower.
    { duration: 230, peakHeight: 52, fromPos: impact1, toPos: impact2, spin: spinDir(), blurPeak: 2 },
    {
      duration: 160, peakHeight: 20, fromPos: impact2, toPos: impact3,
      spin: { x: pick([-1, 1]) * rand(220, 360), y: pick([-1, 1]) * rand(220, 360), z: pick([-1, 1]) * rand(140, 260) },
      blurPeak: 0.9,
    },
    // Final tiny bounce, spin mostly resolved by now.
    {
      duration: 110, peakHeight: 7, fromPos: impact3, toPos: { x: impact3.x * 0.4, y: impact3.y * 0.4 },
      spin: { x: pick([-1, 1]) * rand(40, 90), y: pick([-1, 1]) * rand(40, 90), z: 0 },
      blurPeak: 0.3,
    },
    // Rock back and forth on an edge, then settle flat on the target face.
    {
      duration: 620, peakHeight: 0,
      fromPos: { x: impact3.x * 0.4, y: impact3.y * 0.4 }, toPos: { x: 0, y: 0 },
      spin: { x: 0, y: 0, z: 0 }, blurPeak: 0,
      isFinal: true,
      finalRotation: { x: base.x, y: base.y, z: extraZ },
      rock: { amplitude: 9, cycles: 3.5, axis: Math.abs(base.x) === 90 ? 'y' : 'x' },
    },
  ];
}

function buildFace(className, pipCount) {
  const face = document.createElement('div');
  face.className = `d3-face ${className}`;
  const layout = PIP_LAYOUTS[pipCount] || PIP_LAYOUTS[1];
  for (let i = 0; i < 9; i++) {
    const pip = document.createElement('span');
    pip.className = 'd3-pip' + (layout[i] ? '' : ' d3-pip-hidden');
    face.appendChild(pip);
  }
  return face;
}

export class Dice3D {
  constructor(mountEl) {
    this.mountEl = mountEl;
    this.mountEl.innerHTML = '';
    this.mountEl.classList.add('d3-scene');

    const stage = document.createElement('div');
    stage.className = 'd3-stage';
    this.mountEl.appendChild(stage);

    const trayBorder = document.createElement('div');
    trayBorder.className = 'd3-tray-border';
    stage.appendChild(trayBorder);

    const felt = document.createElement('div');
    felt.className = 'd3-felt';
    stage.appendChild(felt);

    this.shadow = document.createElement('div');
    this.shadow.className = 'd3-shadow';
    felt.appendChild(this.shadow);

    this.cube = document.createElement('div');
    this.cube.className = 'd3-cube';
    this.cube.appendChild(buildFace('d3-front', 1));
    this.cube.appendChild(buildFace('d3-back', 6));
    this.cube.appendChild(buildFace('d3-right', 2));
    this.cube.appendChild(buildFace('d3-left', 5));
    this.cube.appendChild(buildFace('d3-top', 3));
    this.cube.appendChild(buildFace('d3-bottom', 4));
    felt.appendChild(this.cube);

    this._rafId = null;
    this._lastFrameT = 0;
    this._value = 1;
    this.showStatic(1);
  }

  get value() { return this._value; }

  setDisabled(disabled) {
    this.mountEl.classList.toggle('d3-disabled', !!disabled);
  }

  /** Instantly shows a face, no animation — used when syncing state that
   *  wasn't the result of a fresh roll on this client. */
  showStatic(value) {
    this._cancelAnim();
    const rot = FACE_ROTATION[value] || FACE_ROTATION[1];
    this._value = value;
    this.cube.style.transform = `translate3d(0px, 0px, 0px) rotateX(${rot.x}deg) rotateY(${rot.y}deg) rotateZ(0deg)`;
    this.cube.style.filter = 'none';
    this.shadow.style.transform = 'translate3d(0px, 0px, 0.5px) scale(1)';
    this.shadow.style.opacity = '0.4';
    this.shadow.style.filter = 'blur(1.5px)';
  }

  _cancelAnim() {
    if (this._rafId) cancelAnimationFrame(this._rafId);
    this._rafId = null;
  }

  /**
   * Plays the full toss → chaotic tumble → floor impact → wall-clip
   * bounce → small bounce → tiny settle-hop → edge-rock → hard stop
   * animation, landing on `value`, then calls onDone.
   */
  roll(value, { onDone } = {}) {
    this._cancelAnim();
    const segments = buildTimeline(value);
    let segIndex = 0;
    let segStart = performance.now();
    let rotAtSegStart = { x: 0, y: 0, z: 0 };

    // Preserve current on-screen rotation as the starting point so the
    // roll continues smoothly from wherever the die currently sits.
    const match = (this.cube.style.transform || '').match(
      /rotateX\(([-\d.]+)deg\) rotateY\(([-\d.]+)deg\) rotateZ\(([-\d.]+)deg\)/
    );
    if (match) rotAtSegStart = { x: parseFloat(match[1]), y: parseFloat(match[2]), z: parseFloat(match[3]) };
    let rotAccum = { ...rotAtSegStart };

    this._lastFrameT = 0;
    const FRAME_MS = 1000 / 30; // smooth 30fps handheld-mobile-game cadence

    const step = (now) => {
      if (now - this._lastFrameT < FRAME_MS) {
        this._rafId = requestAnimationFrame(step);
        return;
      }
      this._lastFrameT = now;

      const seg = segments[segIndex];
      const elapsed = now - segStart;
      const u = Math.min(1, elapsed / seg.duration);
      const easedPos = easeInOutQuad(u);

      const posX = seg.fromPos.x + (seg.toPos.x - seg.fromPos.x) * easedPos;
      const posY = seg.fromPos.y + (seg.toPos.y - seg.fromPos.y) * easedPos;

      let height = 0, rotX, rotY, rotZ, blur = 0;

      if (seg.isFinal && seg.finalRotation) {
        const rockCfg = seg.rock;
        const decay = 1 - u;
        const rockAngle = rockCfg ? rockCfg.amplitude * decay * Math.sin(u * rockCfg.cycles * Math.PI * 2) : 0;
        height = Math.abs(rockAngle) * 0.35; // one corner lifts slightly as it rocks
        rotX = seg.finalRotation.x + (rockCfg && rockCfg.axis === 'x' ? rockAngle : 0);
        rotY = seg.finalRotation.y + (rockCfg && rockCfg.axis === 'y' ? rockAngle : 0);
        rotZ = seg.finalRotation.z;
      } else {
        const easedH = Math.sin(Math.min(1, u) * Math.PI); // smooth rise/fall, gravity-like
        height = seg.peakHeight * easedH;
        const spinEase = easeOutQuad(u);
        rotX = rotAtSegStart.x + seg.spin.x * spinEase;
        rotY = rotAtSegStart.y + seg.spin.y * spinEase;
        rotZ = rotAtSegStart.z + seg.spin.z * spinEase;
        const speed = (Math.abs(seg.spin.x) + Math.abs(seg.spin.y) + Math.abs(seg.spin.z)) / seg.duration;
        blur = Math.max(0, Math.min(seg.blurPeak, speed * 1.8) * (1 - Math.abs(u - 0.35)));
      }

      rotAccum = { x: rotX, y: rotY, z: rotZ };

      this.cube.style.transform = `translate3d(${posX}px, ${posY}px, ${height}px) rotateX(${rotX}deg) rotateY(${rotY}deg) rotateZ(${rotZ}deg)`;
      this.cube.style.filter = blur > 0.05 ? `blur(${blur.toFixed(2)}px)` : 'none';

      const maxH = 118;
      const hRatio = Math.min(1, height / maxH);
      this.shadow.style.transform = `translate3d(${posX}px, ${posY}px, 0.5px) scale(${1 - hRatio * 0.55})`;
      this.shadow.style.opacity = (0.46 - hRatio * 0.3).toFixed(2);
      this.shadow.style.filter = `blur(${(1.5 + hRatio * 7).toFixed(1)}px)`;

      if (u >= 1) {
        if (segIndex < segments.length - 1) {
          segIndex += 1;
          segStart = now;
          rotAtSegStart = { ...rotAccum };
        } else {
          this.cube.style.filter = 'none';
          this._value = value;
          this._rafId = null;
          if (onDone) onDone();
          return;
        }
      }

      this._rafId = requestAnimationFrame(step);
    };

    this._rafId = requestAnimationFrame(step);
  }
}
