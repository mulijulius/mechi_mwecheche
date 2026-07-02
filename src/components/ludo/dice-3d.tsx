import { useEffect, useRef, useCallback, useState, type CSSProperties } from "react";

/**
 * Dice3D
 * ------
 * A single six-sided die rendered with CSS 3D transforms (no WebGL — kept
 * lightweight on purpose, since Three.js was dropped from Checkers for
 * mobile performance reasons). Rolls into a felt-lined tray with a
 * decaying multi-bounce arc, a wall clip, motion blur on the fastest spin,
 * a height-tracking contact shadow, and a final edge-rock before settling
 * on the requested face.
 *
 * Usage:
 *   const [value, setValue] = useState(4);
 *   const [rollId, setRollId] = useState(0);
 *   <Dice3D value={value} rollId={rollId} onRollComplete={() => {}} />
 *   // to trigger a roll: setValue(newServerValue); setRollId(id => id + 1);
 */

export interface Dice3DProps {
  /** Final face (1-6) the die must land on. */
  value: number;
  /** Increment this to trigger a new roll animation toward `value`. */
  rollId: number;
  /** Called once the die has fully settled. */
  onRollComplete?: (value: number) => void;
  /** Cube size in px. Default 72. */
  size?: number;
  /** Subtle handheld camera drift. Off by default for gameplay readability. */
  handheldCamera?: boolean;
  className?: string;
}

interface Segment {
  duration: number; // ms
  peakHeight: number; // px, 0 = no bounce arc this segment
  fromPos: { x: number; y: number };
  toPos: { x: number; y: number };
  spin: { x: number; y: number; z: number }; // rotation delta applied over segment
  blurPeak: number; // max motion blur (px) reached in this segment
  rock?: { amplitude: number; cycles: number; axis: "x" | "y" };
  isFinal?: boolean;
  finalRotation?: { x: number; y: number; z: number };
}

const FACE_ROTATION: Record<number, { x: number; y: number }> = {
  1: { x: 0, y: 0 },
  2: { x: 0, y: -90 },
  3: { x: -90, y: 0 },
  4: { x: 90, y: 0 },
  5: { x: 0, y: 90 },
  6: { x: 180, y: 0 },
};

const PIP_LAYOUTS: Record<number, boolean[]> = {
  // grid cells: a b c / d e f / g h i
  1: [false, false, false, false, true, false, false, false, false],
  2: [true, false, false, false, false, false, false, false, true],
  3: [true, false, false, false, true, false, false, false, true],
  4: [true, false, true, false, false, false, true, false, true],
  5: [true, false, true, false, true, false, true, false, true],
  6: [true, false, true, true, false, true, true, false, true],
};

function easeOutQuad(u: number) {
  return 1 - (1 - u) * (1 - u);
}
function easeInOutQuad(u: number) {
  return u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2;
}
function rand(min: number, max: number) {
  return min + Math.random() * (max - min);
}
function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function buildTimeline(target: number): Segment[] {
  const base = FACE_ROTATION[target] ?? FACE_ROTATION[1];
  const extraZ = pick([0, 90, 180, 270]);

  // Entry toss: die appears above the tray edge and dives in diagonally.
  const entryFrom = { x: rand(-46, 46), y: rand(-40, -26) };
  const impact1 = { x: rand(-18, 18), y: rand(6, 22) };

  // Wall clip: bounce 2 kicks off in a noticeably different direction,
  // as if it caromed off the tray's side wall.
  const wallSign = Math.random() > 0.5 ? 1 : -1;
  const impact2 = { x: impact1.x + wallSign * rand(20, 34), y: impact1.y - rand(10, 20) };
  const impact3 = { x: impact2.x - wallSign * rand(6, 12), y: impact2.y + rand(4, 10) };

  const spinDir = () => ({
    x: pick([-1, 1]) * rand(560, 900),
    y: pick([-1, 1]) * rand(560, 900),
    z: pick([-1, 1]) * rand(360, 640),
  });

  const segments: Segment[] = [
    // Hard toss + first strike (biggest arc, fastest spin, most blur).
    {
      duration: 320,
      peakHeight: 118,
      fromPos: entryFrom,
      toPos: impact1,
      spin: spinDir(),
      blurPeak: 3.2,
    },
    // Bounces up, clips the wall, ricochets — lower and slower.
    {
      duration: 230,
      peakHeight: 52,
      fromPos: impact1,
      toPos: impact2,
      spin: spinDir(),
      blurPeak: 2,
    },
    {
      duration: 160,
      peakHeight: 20,
      fromPos: impact2,
      toPos: impact3,
      spin: { x: pick([-1, 1]) * rand(220, 360), y: pick([-1, 1]) * rand(220, 360), z: pick([-1, 1]) * rand(140, 260) },
      blurPeak: 0.9,
    },
    // Final tiny bounce, spin mostly resolved by now.
    {
      duration: 110,
      peakHeight: 7,
      fromPos: impact3,
      toPos: { x: impact3.x * 0.4, y: impact3.y * 0.4 },
      spin: { x: pick([-1, 1]) * rand(40, 90), y: pick([-1, 1]) * rand(40, 90), z: 0 },
      blurPeak: 0.3,
    },
    // Rock back and forth on an edge, then settle flat on the target face.
    {
      duration: 620,
      peakHeight: 0,
      fromPos: { x: impact3.x * 0.4, y: impact3.y * 0.4 },
      toPos: { x: 0, y: 0 },
      spin: { x: 0, y: 0, z: 0 },
      blurPeak: 0,
      isFinal: true,
      finalRotation: { x: base.x, y: base.y, z: extraZ },
      rock: { amplitude: 9, cycles: 3.5, axis: Math.abs(base.x) === 90 ? "y" : "x" },
    },
  ];

  return segments;
}

export function Dice3D({
  value,
  rollId,
  onRollComplete,
  size = 72,
  handheldCamera = false,
  className,
}: Dice3DProps) {
  const cubeRef = useRef<HTMLDivElement | null>(null);
  const shadowRef = useRef<HTMLDivElement | null>(null);
  const sceneRef = useRef<HTMLDivElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const lastFrameRef = useRef(0);
  const [settledValue, setSettledValue] = useState(value);
  const isFirstRun = useRef(true);

  const animate = useCallback(
    (target: number) => {
      const cube = cubeRef.current;
      const shadow = shadowRef.current;
      if (!cube || !shadow) return;

      if (rafRef.current) cancelAnimationFrame(rafRef.current);

      const segments = buildTimeline(target);
      let segIndex = 0;
      let segStart = performance.now();
      let rotAtSegStart = { x: 0, y: 0, z: 0 };
      // Preserve current on-screen rotation as the starting point so the
      // roll continues smoothly from wherever the die currently sits.
      const currentTransform = cube.style.transform;
      const match = currentTransform.match(
        /rotateX\(([-\d.]+)deg\) rotateY\(([-\d.]+)deg\) rotateZ\(([-\d.]+)deg\)/
      );
      if (match) {
        rotAtSegStart = { x: parseFloat(match[1]), y: parseFloat(match[2]), z: parseFloat(match[3]) };
      }
      let rotAccum = { ...rotAtSegStart };

      lastFrameRef.current = 0;
      const FRAME_MS = 1000 / 30;

      const step = (now: number) => {
        if (now - lastFrameRef.current < FRAME_MS) {
          rafRef.current = requestAnimationFrame(step);
          return;
        }
        lastFrameRef.current = now;

        const seg = segments[segIndex];
        const elapsed = now - segStart;
        const u = Math.min(1, elapsed / seg.duration);
        const easedPos = easeInOutQuad(u);

        const posX = seg.fromPos.x + (seg.toPos.x - seg.fromPos.x) * easedPos;
        const posY = seg.fromPos.y + (seg.toPos.y - seg.fromPos.y) * easedPos;

        let height = 0;
        let rotX: number, rotY: number, rotZ: number;
        let blur = 0;

        if (seg.isFinal && seg.finalRotation) {
          const rockCfg = seg.rock;
          const decay = 1 - u;
          const rockAngle = rockCfg ? rockCfg.amplitude * decay * Math.sin(u * rockCfg.cycles * Math.PI * 2) : 0;
          // one corner lifts slightly off the felt as the die rocks
          height = Math.abs(rockAngle) * 0.35;
          rotX = seg.finalRotation.x + (rockCfg?.axis === "x" ? rockAngle : 0);
          rotY = seg.finalRotation.y + (rockCfg?.axis === "y" ? rockAngle : 0);
          rotZ = seg.finalRotation.z;
          blur = 0;
        } else {
          const easedH = Math.sin(Math.min(1, u) * Math.PI); // smooth rise/fall, gravity-like
          height = seg.peakHeight * easedH;
          const spinEase = easeOutQuad(u);
          rotX = rotAtSegStart.x + seg.spin.x * spinEase;
          rotY = rotAtSegStart.y + seg.spin.y * spinEase;
          rotZ = rotAtSegStart.z + seg.spin.z * spinEase;
          const speed = (Math.abs(seg.spin.x) + Math.abs(seg.spin.y) + Math.abs(seg.spin.z)) / seg.duration;
          blur = Math.min(seg.blurPeak, speed * 1.8) * (1 - Math.abs(u - 0.35));
          blur = Math.max(0, blur);
        }

        rotAccum = { x: rotX, y: rotY, z: rotZ };

        // felt is a flat plane in local 3D space: X/Y are the floor,
        // Z is height straight up off the felt.
        cube.style.transform = `translate3d(${posX}px, ${posY}px, ${height}px) rotateX(${rotX}deg) rotateY(${rotY}deg) rotateZ(${rotZ}deg)`;
        cube.style.filter = blur > 0.05 ? `blur(${blur.toFixed(2)}px)` : "none";

        const maxH = 118;
        const hRatio = Math.min(1, height / maxH);
        const shadowScale = 1 - hRatio * 0.55;
        const shadowOpacity = 0.46 - hRatio * 0.3;
        const shadowBlur = 1.5 + hRatio * 7;
        shadow.style.transform = `translate3d(${posX}px, ${posY}px, 0.5px) scale(${shadowScale})`;
        shadow.style.opacity = shadowOpacity.toFixed(2);
        shadow.style.filter = `blur(${shadowBlur.toFixed(1)}px)`;

        if (u >= 1) {
          if (segIndex < segments.length - 1) {
            segIndex += 1;
            segStart = now;
            rotAtSegStart = { ...rotAccum };
          } else {
            cube.style.filter = "none";
            setSettledValue(target);
            onRollComplete?.(target);
            return;
          }
        }

        rafRef.current = requestAnimationFrame(step);
      };

      rafRef.current = requestAnimationFrame(step);
    },
    [onRollComplete]
  );

  useEffect(() => {
    if (isFirstRun.current) {
      isFirstRun.current = false;
      return;
    }
    animate(value);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rollId]);

  const half = size / 2;
  const base = FACE_ROTATION[settledValue] ?? FACE_ROTATION[1];

  const faceStyle = (transform: string): CSSProperties => ({
    position: "absolute",
    width: size,
    height: size,
    background: "#f5f3ee",
    border: "1px solid #d8d4c8",
    borderRadius: size * 0.14,
    transform,
    display: "grid",
    gridTemplateColumns: "repeat(3, 1fr)",
    gridTemplateRows: "repeat(3, 1fr)",
    padding: size * 0.14,
    boxSizing: "border-box",
    boxShadow: "inset 0 0 6px rgba(0,0,0,0.08)",
  });

  const renderPips = (num: number) => {
    const layout = PIP_LAYOUTS[num] ?? PIP_LAYOUTS[1];
    return layout.map((on, i) => (
      <span
        key={i}
        style={{
          alignSelf: "center",
          justifySelf: "center",
          width: "62%",
          height: "62%",
          borderRadius: "50%",
          background: on ? "#1c1c1c" : "transparent",
          boxShadow: on ? "inset 0 1px 1px rgba(255,255,255,0.15)" : "none",
        }}
      />
    ));
  };

  return (
    <div
      ref={sceneRef}
      className={className}
      style={{
        width: "100%",
        maxWidth: 320,
        aspectRatio: "3 / 2",
        margin: "0 auto",
        perspective: 900,
        perspectiveOrigin: "50% 30%",
      }}
    >
      <div
        style={{
          width: "100%",
          height: "100%",
          position: "relative",
          transformStyle: "preserve-3d",
          transform: "rotateX(60deg)",
          animation: handheldCamera ? "d3-handheld 6s ease-in-out infinite" : "none",
        }}
      >
        {/* wood-trimmed outer border */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            borderRadius: 18,
            background:
              "linear-gradient(135deg, #8a5a34, #6b4023 40%, #7a4c2a 60%, #5c3620)",
            boxShadow: "0 10px 24px rgba(0,0,0,0.35), inset 0 2px 3px rgba(255,255,255,0.15)",
          }}
        />
        {/* teal felt floor */}
        <div
          style={{
            position: "absolute",
            inset: "5%",
            borderRadius: 12,
            background:
              "radial-gradient(ellipse at 40% 30%, #2f7d6e, #1f5e52 70%, #184a41)",
            boxShadow: "inset 0 6px 14px rgba(0,0,0,0.45), inset 0 -2px 6px rgba(0,0,0,0.3)",
            transformStyle: "preserve-3d",
          }}
        >
          {/* contact shadow */}
          <div
            ref={shadowRef}
            style={{
              position: "absolute",
              left: "50%",
              top: "50%",
              width: size * 1.15,
              height: size * 1.15,
              marginLeft: -(size * 1.15) / 2,
              marginTop: -(size * 1.15) / 2,
              borderRadius: "50%",
              background: "radial-gradient(ellipse, rgba(0,0,0,0.55), rgba(0,0,0,0) 70%)",
              opacity: 0.4,
              willChange: "transform, opacity, filter",
            }}
          />

          {/* the die */}
          <div
            ref={cubeRef}
            style={{
              position: "absolute",
              left: "50%",
              top: "50%",
              width: size,
              height: size,
              marginLeft: -half,
              marginTop: -half,
              transformStyle: "preserve-3d",
              transform: `translate3d(0px, 0px, 0px) rotateX(${base.x}deg) rotateY(${base.y}deg) rotateZ(0deg)`,
              willChange: "transform, filter",
            }}
          >
            <div style={faceStyle(`translateZ(${half}px)`)}>{renderPips(1)}</div>
            <div style={faceStyle(`rotateY(180deg) translateZ(${half}px)`)}>{renderPips(6)}</div>
            <div style={faceStyle(`rotateY(90deg) translateZ(${half}px)`)}>{renderPips(2)}</div>
            <div style={faceStyle(`rotateY(-90deg) translateZ(${half}px)`)}>{renderPips(5)}</div>
            <div style={faceStyle(`rotateX(90deg) translateZ(${half}px)`)}>{renderPips(3)}</div>
            <div style={faceStyle(`rotateX(-90deg) translateZ(${half}px)`)}>{renderPips(4)}</div>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes d3-handheld {
          0%   { transform: rotateX(60deg) translate(0px, 0px) rotateZ(0deg); }
          25%  { transform: rotateX(59.6deg) translate(1.5px, -1px) rotateZ(0.2deg); }
          50%  { transform: rotateX(60.3deg) translate(-1px, 1.5px) rotateZ(-0.15deg); }
          75%  { transform: rotateX(59.8deg) translate(1px, 1px) rotateZ(0.1deg); }
          100% { transform: rotateX(60deg) translate(0px, 0px) rotateZ(0deg); }
        }
      `}</style>
    </div>
  );
}

export default Dice3D;
