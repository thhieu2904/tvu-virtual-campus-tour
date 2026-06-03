/* eslint-disable react-hooks/set-state-in-effect */
"use client";

import { useState, useEffect } from "react";
import styles from "./page.module.css";

import pathsData from "./paths.json";

type Point = { x: number; y: number; node?: string };
type PathsMap = Record<string, Point[]>;

const paths = pathsData as PathsMap;

// Semi-auto correction for the B corridor in isometric view.
// You only tune a few anchors; intermediate points are interpolated by y.
const B_LANE_ANCHORS = [
  { y: 95, x: 69 },
  { y: 87, x: 68.8 },
  { y: 78, x: 68.5 },
  { y: 70, x: 68.2 },
  { y: 61.5, x: 67.7 },
  { y: 47, x: 67.2 },
  { y: 30, x: 66.5 },
  { y: 18.1, x: 66 },
] as const;

const B_LANE_NODES = new Set([
  "welcome",
  "b1_front",
  "b2_front",
  "b3_front",
  "b4_front",
  "b5_front",
  "b6_front",
  "b7_front",
  "j_right_d3",
  "j_right_c3",
]);

function interpolateXByY(y: number, anchors: readonly { y: number; x: number }[]) {
  const sorted = [...anchors].sort((a, b) => a.y - b.y);

  if (y <= sorted[0].y) return sorted[0].x;
  if (y >= sorted[sorted.length - 1].y) return sorted[sorted.length - 1].x;

  for (let i = 1; i < sorted.length; i++) {
    const a = sorted[i - 1];
    const b = sorted[i];
    if (y <= b.y) {
      const t = (y - a.y) / (b.y - a.y);
      return a.x + t * (b.x - a.x);
    }
  }

  return sorted[sorted.length - 1].x;
}

const bLaneX = (y: number) => interpolateXByY(y, B_LANE_ANCHORS);

const projectPoint = (p: Point): Point => {
  if (!p.node || !B_LANE_NODES.has(p.node)) return p;
  return { ...p, x: bLaneX(p.y) };
};

// Coordinates from campus_navigation_graph_v4_remeasured_1254.json (axis-snapped)
const locations: Record<
  string,
  { x: number; y: number; label: string; color: string }
> = {
  "cong-chinh": { x: bLaneX(95), y: 95, label: "Cổng chính", color: "#22c55e" },
  "thu-vien": { x: bLaneX(18.1), y: 18.1, label: "Thư viện (B7)", color: "#3b82f6" },
  "khoa-cntt": { x: 21.5, y: 57.34, label: "Khoa CNTT (C7)", color: "#f59e0b" },
  "d5-nha-hoc": { x: 40.64, y: 27.03, label: "Nhà học D5", color: "#ec4899" },
};

const allDestinations = [
  { id: "d6", x: 27, y: 18, active: false },
  { id: "d5", x: 40.2, y: 27, active: true },
  { id: "d3", x: 27, y: 36, active: false },
  { id: "c9", x: 16.5, y: 45.99, active: false },
  { id: "c6", x: 15.5, y: 55.31, active: false },
  { id: "c8", x: 32, y: 57.5, active: false },
  { id: "c5", x: 14.7, y: 64.26, active: false },
  { id: "c4", x: 14, y: 72.61, active: false },
  { id: "c3", x: 20, y: 74.48, active: false },
  { id: "c2", x: 31, y: 74.48, active: false },
  { id: "c1", x: 38.5, y: 90.62, active: false },
  { id: "a1", x: 62.24, y: 91.97, active: false },
  { id: "b6", x: bLaneX(30), y: 30, active: false },
  { id: "b5", x: bLaneX(47), y: 47, active: false },
  { id: "b4", x: bLaneX(61.5), y: 61.5, active: false },
  { id: "b3", x: bLaneX(70), y: 70, active: false },
  { id: "b2", x: bLaneX(78), y: 78, active: false },
  { id: "b1", x: bLaneX(87), y: 87, active: false },
];
 
const ROUTE_COLORS = [
  "#ff3b3b",
  "#3b82f6",
  "#10b981",
  "#f59e0b",
  "#8b5cf6",
  "#ec4899",
];

export default function MapDemoPage() {
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [showInactive, setShowInactive] = useState(true);
  const [animProgress, setAnimProgress] = useState(1);

  useEffect(() => {
    if (!selectedPath) return;
    setAnimProgress(0);
    const start = performance.now();
    const duration = 1200;
    const tick = (now: number) => {
      const progress = Math.min((now - start) / duration, 1);
      setAnimProgress(progress);
      if (progress < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }, [selectedPath]);

  const pathKeys = Object.keys(paths);
  const toPolyline = (pts: Point[]) =>
    pts.map(projectPoint).map((p) => `${p.x},${p.y}`).join(" ");

  const getPathLength = (pts: Point[]): number => {
    const projected = pts.map(projectPoint);
    let len = 0;
    for (let i = 1; i < projected.length; i++) {
      const dx = projected[i].x - projected[i - 1].x;
      const dy = projected[i].y - projected[i - 1].y;
      len += Math.sqrt(dx * dx + dy * dy);
    }
    return len;
  };

  return (
    <div className={styles.container}>
      <h1 className={styles.title}>🗺️ TVU Campus — Navigation Graph Demo</h1>
      <p className={styles.subtitle}>
        A* on centerline graph • v4 axis-snapped
      </p>

      <div className={styles.controls}>
        <button
          className={`${styles.btn} ${showAll ? styles.btnActive : ""}`}
          onClick={() => {
            setShowAll(!showAll);
            setSelectedPath(null);
          }}
        >
          {showAll ? "Ẩn tất cả" : "🔗 Hiện tất cả"}
        </button>

        <button
          className={`${styles.btn} ${styles.btnGhost} ${showInactive ? styles.btnActive : ""}`}
          onClick={() => setShowInactive(!showInactive)}
        >
          {showInactive ? "Ẩn inactive" : "👁️ Hiện inactive"}
        </button>

        {pathKeys.map((key, i) => {
          const [from, , to] = key.split("_");
          const fromLabel = locations[from]?.label || from;
          const toLabel = locations[to]?.label || to;
          const pts = paths[key];
          return (
            <button
              key={key}
              className={`${styles.btn} ${selectedPath === key ? styles.btnActive : ""}`}
              style={{
                borderColor: ROUTE_COLORS[i % ROUTE_COLORS.length],
                color:
                  selectedPath === key
                    ? "#fff"
                    : ROUTE_COLORS[i % ROUTE_COLORS.length],
                backgroundColor:
                  selectedPath === key
                    ? ROUTE_COLORS[i % ROUTE_COLORS.length]
                    : "transparent",
              }}
              onClick={() => {
                setShowAll(false);
                setSelectedPath(selectedPath === key ? null : key);
              }}
            >
              {fromLabel} → {toLabel} ({pts.length} nodes)
            </button>
          );
        })}
      </div>

      <div className={styles.mapWrapper}>
        <img
          src="/map_v3.png"
          alt="TVU Campus Map"
          className={styles.mapImage}
          draggable={false}
        />

        <svg
          className={styles.svgOverlay}
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
        >
          {showAll &&
            pathKeys.map((key, i) => {
              const pts = paths[key];
              if (!pts.length) return null;
              return (
                <polyline
                  key={key}
                  points={toPolyline(pts)}
                  fill="none"
                  stroke={ROUTE_COLORS[i % ROUTE_COLORS.length]}
                  strokeWidth="0.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  opacity={0.85}
                />
              );
            })}

          {selectedPath &&
            paths[selectedPath]?.length > 0 &&
            (() => {
              const pts = paths[selectedPath];
              const projectedPts = pts.map(projectPoint);
              const totalLen = getPathLength(pts);
              const dashLen = totalLen * animProgress;
              const idx = pathKeys.indexOf(selectedPath);
              const color = ROUTE_COLORS[idx % ROUTE_COLORS.length];
              return (
                <>
                  <polyline
                    points={toPolyline(projectedPts)}
                    fill="none"
                    stroke="rgba(0,0,0,0.25)"
                    strokeWidth="1"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <polyline
                    points={toPolyline(projectedPts)}
                    fill="none"
                    stroke={color}
                    strokeWidth="0.7"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeDasharray={`${dashLen} ${totalLen}`}
                  />
                  {projectedPts.map((p, i) => (
                    <circle
                      key={i}
                      cx={p.x}
                      cy={p.y}
                      r="0.6"
                      fill={color}
                      opacity={0.5}
                    />
                  ))}
                  <circle
                    cx={projectedPts[0].x}
                    cy={projectedPts[0].y}
                    r="1.2"
                    fill="#22c55e"
                    stroke="#fff"
                    strokeWidth="0.3"
                  />
                  <circle
                    cx={projectedPts[projectedPts.length - 1].x}
                    cy={projectedPts[projectedPts.length - 1].y}
                    r="1.2"
                    fill="#ef4444"
                    stroke="#fff"
                    strokeWidth="0.3"
                  />
                </>
              );
            })()}

          {showInactive &&
            allDestinations
              .filter((d) => !d.active)
              .map((d) => (
                <g key={d.id}>
                  <circle
                    cx={d.x}
                    cy={d.y}
                    r="1"
                    fill="none"
                    stroke="rgba(255,100,100,0.5)"
                    strokeWidth="0.3"
                    strokeDasharray="0.5 0.5"
                  />
                  <text
                    x={d.x}
                    y={d.y - 1.8}
                    textAnchor="middle"
                    fontSize="1.8"
                    fill="rgba(255,100,100,0.5)"
                    fontWeight="500"
                  >
                    {d.id.toUpperCase()}
                  </text>
                </g>
              ))}

          {Object.entries(locations).map(([slug, loc]) => (
            <g key={slug}>
              <circle
                cx={loc.x}
                cy={loc.y}
                r="1.5"
                fill={loc.color}
                stroke="#fff"
                strokeWidth="0.4"
                opacity={0.95}
              />
              <text
                x={loc.x}
                y={loc.y - 2.5}
                textAnchor="middle"
                fontSize="2.2"
                fill="#fff"
                stroke="#000"
                strokeWidth="0.25"
                paintOrder="stroke"
                fontWeight="bold"
              >
                {loc.label}
              </text>
            </g>
          ))}
        </svg>
      </div>
    </div>
  );
}
