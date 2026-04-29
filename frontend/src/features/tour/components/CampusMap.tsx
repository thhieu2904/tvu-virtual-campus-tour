/**
 * CampusMap — Core map rendering component.
 *
 * ĐÃ KHÓA: Component này render bản đồ isometric với đường đi chính xác.
 * KHÔNG CHỈNH SỬA trừ khi cần thay đổi nav_graph.json hoặc paths.json.
 *
 * Kỹ thuật render (copy từ map-demo đã chạy đúng):
 * - Container vuông (position:relative)
 * - <img> absolute, 100%x100%, object-fit:cover
 * - <svg> absolute, 100%x100%, viewBox="0 0 100 100", preserveAspectRatio="none"
 * - HTML buttons absolute, positioned with left/top %
 *
 * Props cho phép component cha điều khiển hiển thị mà KHÔNG đụng vào logic render.
 */

"use client";

import { useMemo } from "react";
import navGraph from "@/data/nav_graph.json";
import pathsData from "@/data/paths.json";

// ── Types ──
type Point = { x: number; y: number; node?: string };
type PathsMap = Record<string, Point[]>;

const paths = pathsData as PathsMap;

// ── Destination brand colors ──
const DEST_COLORS: Record<string, string> = {
  "cong-chinh": "#22c55e",
  "thu-vien": "#3b82f6",
  "khoa-cntt": "#f59e0b",
  "d5-giang-duong": "#ec4899",
};

// ── Lookup: slug → {x, y} (built once at module level) ──
const COORDS_BY_SLUG: Record<string, { x: number; y: number }> = {};
for (const node of navGraph.nodes) {
  if ((node as any).slug) {
    COORDS_BY_SLUG[(node as any).slug] = { x: node.x, y: node.y };
  }
}

export function getCoordsBySlug(slug: string) {
  return COORDS_BY_SLUG[slug] || null;
}

export function getDestColor(slug: string) {
  return DEST_COLORS[slug] || "#053384";
}

export function getPathPoints(fromSlug: string, toSlug: string): Point[] | null {
  const key = `${fromSlug}_to_${toSlug}`;
  return paths[key] || null;
}

export function getAllPathsFrom(slug: string): string[] {
  return Object.keys(paths).filter((k) => k.startsWith(`${slug}_to_`));
}

// ── Helpers ──
function toPolyline(pts: Point[]) {
  return pts.map((p) => `${p.x},${p.y}`).join(" ");
}

function getPathLength(pts: Point[]): number {
  let len = 0;
  for (let i = 1; i < pts.length; i++) {
    const dx = pts[i].x - pts[i - 1].x;
    const dy = pts[i].y - pts[i - 1].y;
    len += Math.sqrt(dx * dx + dy * dy);
  }
  return len;
}

function getPathColor(pathKey: string): string {
  const parts = pathKey.split("_to_");
  return DEST_COLORS[parts[1]] || "#053384";
}

// ── Component Props ──
export interface CampusMapProps {
  /** Slug of the current location (shows pulsing marker) */
  currentSlug?: string;
  /** Active navigation path key, e.g. "cong-chinh_to_thu-vien" */
  activePathKey?: string | null;
  /** Animation progress 0→1 for the active path */
  animProgress?: number;
  /** Show faint dashed paths from current location */
  showAvailablePaths?: boolean;
  /** Location nodes to render as interactive buttons */
  nodes?: {
    slug: string;
    name: string;
    status: "active" | "inactive";
  }[];
  /** Slug of the navigation target (for highlight) */
  navTargetSlug?: string | null;
  /** Called when user clicks a node */
  onNodeClick?: (slug: string) => void;
  /** Whether interaction is disabled (during navigation) */
  disabled?: boolean;
  /** Additional CSS class for the outer container */
  className?: string;
}

export default function CampusMap({
  currentSlug,
  activePathKey,
  animProgress = 0,
  showAvailablePaths = true,
  nodes = [],
  navTargetSlug,
  onNodeClick,
  disabled = false,
  className = "",
}: CampusMapProps) {
  // Paths from current location
  const availablePaths = useMemo(() => {
    if (!currentSlug || !showAvailablePaths) return [];
    return getAllPathsFrom(currentSlug);
  }, [currentSlug, showAvailablePaths]);

  return (
    // ╔══════════════════════════════════════════════════════╗
    // ║  LOCKED: Square container — DO NOT change this      ║
    // ║  structure. img + svg must be siblings in the same   ║
    // ║  relative container to guarantee alignment.          ║
    // ╚══════════════════════════════════════════════════════╝
    <div
      className={`relative ${className}`}
      style={{ aspectRatio: "1 / 1" }}
    >
      {/* Layer 1: Map image */}
      <img
        src="/map_v3.png"
        alt="TVU Campus Map"
        draggable={false}
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: "100%",
          height: "100%",
          objectFit: "cover",
          userSelect: "none",
        }}
      />

      {/* Layer 2: SVG paths & markers */}
      <svg
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: "100%",
          height: "100%",
          zIndex: 2,
        }}
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
      >
        {/* Available paths (faint dashed) — only when NOT navigating */}
        {!activePathKey &&
          availablePaths.map((key) => {
            const pts = paths[key];
            if (!pts?.length) return null;
            const color = getPathColor(key);
            return (
              <polyline
                key={key}
                points={toPolyline(pts)}
                fill="none"
                stroke={color}
                strokeWidth="0.5"
                strokeOpacity="0.25"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeDasharray="1.5,1.5"
              />
            );
          })}

        {/* Active navigation path (animated) */}
        {activePathKey &&
          paths[activePathKey] &&
          (() => {
            const pts = paths[activePathKey];
            const totalLen = getPathLength(pts);
            const dashLen = totalLen * animProgress;
            const color = getPathColor(activePathKey);
            return (
              <g>
                {/* Ghost route (full path, faint) */}
                <polyline
                  points={toPolyline(pts)}
                  fill="none"
                  stroke={color}
                  strokeWidth="0.6"
                  strokeOpacity="0.15"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeDasharray="2,2"
                />
                {/* Animated fill */}
                <polyline
                  points={toPolyline(pts)}
                  fill="none"
                  stroke={color}
                  strokeWidth="0.9"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeDasharray={`${dashLen} ${totalLen}`}
                  strokeOpacity="0.9"
                />
                {/* Waypoint dots */}
                {pts.map((p, i) => (
                  <circle key={i} cx={p.x} cy={p.y} r="0.5" fill={color} opacity={0.4} />
                ))}
                {/* Start (green) */}
                <circle cx={pts[0].x} cy={pts[0].y} r="1.3" fill="#22c55e" stroke="#fff" strokeWidth="0.3" />
                {/* End (destination color) */}
                <circle cx={pts[pts.length - 1].x} cy={pts[pts.length - 1].y} r="1.3" fill={color} stroke="#fff" strokeWidth="0.3" />
              </g>
            );
          })()}

        {/* Current location pulsing ring */}
        {currentSlug &&
          !activePathKey &&
          (() => {
            const c = COORDS_BY_SLUG[currentSlug];
            if (!c) return null;
            return (
              <>
                <circle cx={c.x} cy={c.y} r="2" fill="none" stroke="#053384" strokeWidth="0.3">
                  <animate attributeName="r" values="1.8;3.2;1.8" dur="2s" repeatCount="indefinite" />
                  <animate attributeName="stroke-opacity" values="0.6;0;0.6" dur="2s" repeatCount="indefinite" />
                </circle>
                <circle cx={c.x} cy={c.y} r="1.5" fill="#053384" stroke="#fff" strokeWidth="0.4" />
              </>
            );
          })()}
      </svg>

      {/* Layer 3: Interactive node buttons */}
      {nodes.map((node) => {
        const coords = COORDS_BY_SLUG[node.slug];
        if (!coords) return null;

        const isCurrent = node.slug === currentSlug;
        const isTarget = node.slug === navTargetSlug;
        const color = DEST_COLORS[node.slug] || "#f5c518";

        return (
          <button
            key={node.slug}
            disabled={disabled || isCurrent}
            className={`absolute z-[3] ${
              disabled || isCurrent ? "cursor-default" : "cursor-pointer group"
            } ${node.status === "inactive" ? "opacity-50 pointer-events-none" : ""}`}
            style={{
              left: `${coords.x}%`,
              top: `${coords.y}%`,
              transform: "translate(-50%, -50%)",
            }}
            onClick={(e) => {
              e.stopPropagation();
              if (node.status === "active" && onNodeClick && !disabled && !isCurrent) {
                onNodeClick(node.slug);
              }
            }}
          >
            {/* Label — floats above the dot */}
            <span
              className={`absolute left-1/2 -translate-x-1/2 bottom-full mb-1 text-[11px] font-bold px-2.5 py-0.5 rounded-md whitespace-nowrap border transition-all duration-300 ${
                isCurrent
                  ? "bg-[#053384] text-white border-transparent shadow-lg"
                  : isTarget
                    ? "text-white border-transparent shadow-lg animate-pulse"
                    : node.status === "active"
                      ? "bg-white/95 text-[#053384] border-[#053384]/20 shadow-md backdrop-blur-sm"
                      : "bg-gray-200 text-gray-500 border-transparent"
              }`}
              style={isTarget ? { backgroundColor: color } : undefined}
            >
              {node.name}
            </span>
            {/* Dot — exactly on the coordinate point */}
            <div
              className={`w-4 h-4 rounded-full border-2 border-white shadow-md transition-transform ${
                !disabled && !isCurrent ? "group-hover:scale-125" : ""
              }`}
              style={{ backgroundColor: isCurrent ? "#053384" : color }}
            >
              {isCurrent && !activePathKey && (
                <span className="absolute inset-0 rounded-full bg-[#053384] animate-ping opacity-40" />
              )}
              {isTarget && (
                <span
                  className="absolute inset-0 rounded-full animate-ping opacity-40"
                  style={{ backgroundColor: color }}
                />
              )}
            </div>
          </button>
        );
      })}
    </div>
  );
}
