/* eslint-disable react-hooks/set-state-in-effect */
/* eslint-disable react-hooks/immutability */
"use client";

import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useTourStore } from "@/features/tour/store";
import { X, Play, RotateCcw, ChevronRight, Sparkles } from "lucide-react";
import MapImage from "./MapImage";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "";

interface PathStep {
  action: string;
  node_id: string;
  node_label: string;
  g: number;
  f: number;
  detail: string;
}

interface PathResult {
  found: boolean;
  path: string[];
  coordinates: { x: number; y: number; node: string }[];
  total_cost: number;
  explored_count: number;
  total_nodes: number;
  computation_ms: number;
  steps: PathStep[];
}

type NodeVisualState = "default" | "explored" | "frontier" | "path" | "start" | "goal";

const STATE_COLORS: Record<NodeVisualState, string> = {
  default: "rgba(255,255,255,0.15)",
  explored: "#ef4444",
  frontier: "#f59e0b",
  path: "#22c55e",
  start: "#3b82f6",
  goal: "#f97316",
};

export default function AStarExplainer({
  onClose,
}: {
  onClose: () => void;
}) {
  const currentSlug = useTourStore((s) => s.currentLocationSlug);
  const navNodes = useTourStore((s) => s.navNodes);
  const navEdges = useTourStore((s) => s.navEdges);
  const navActiveDestinations = useTourStore((s) => s.navActiveDestinations);

  // Active destination nodes (for selection)
  const destinations = useMemo(
    () => navNodes.filter((n) => n.slug && n.type !== "junction"),
    [navNodes],
  );

  // State
  const [fromSlug, setFromSlug] = useState(currentSlug || "");
  const [toSlug, setToSlug] = useState("");
  const [result, setResult] = useState<PathResult | null>(null);
  const [nodeStates, setNodeStates] = useState<Record<string, NodeVisualState>>({});
  const [isAnimating, setIsAnimating] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const [phase, setPhase] = useState<"idle" | "running" | "done">("idle");
  const animTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stepLogRef = useRef<HTMLDivElement>(null);

  // Default to: pick a random active destination that's not current
  useEffect(() => {
    const others = destinations.filter(
      (d) => d.slug !== currentSlug && d.active,
    );
    if (others.length > 0 && !toSlug) {
      const random = others[Math.floor(Math.random() * others.length)];
      setToSlug(random.slug || "");
    }
  }, [destinations, currentSlug, toSlug]);

  // Cleanup
  useEffect(() => {
    return () => {
      if (animTimerRef.current) clearTimeout(animTimerRef.current);
    };
  }, []);

  const getLabel = useCallback(
    (nodeId: string) => {
      const n = navNodes.find((nd) => nd.id === nodeId);
      return n?.label || n?.building || nodeId;
    },
    [navNodes],
  );

  // ── Auto-run when component mounts ──
  useEffect(() => {
    if (fromSlug && toSlug && fromSlug !== toSlug && phase === "idle") {
      runPathfinding();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fromSlug, toSlug]);

  async function runPathfinding() {
    if (!fromSlug || !toSlug || fromSlug === toSlug) return;
    if (animTimerRef.current) clearTimeout(animTimerRef.current);

    setIsAnimating(true);
    setIsLoading(true);
    setPhase("running");
    setResult(null);
    setStepIndex(0);

    // Init node states
    const initStates: Record<string, NodeVisualState> = {};
    navNodes.forEach((n) => (initStates[n.id] = "default"));
    const fromNode = navNodes.find((n) => n.slug === fromSlug);
    const toNode = navNodes.find((n) => n.slug === toSlug);
    if (fromNode) initStates[fromNode.id] = "start";
    if (toNode) initStates[toNode.id] = "goal";
    setNodeStates(initStates);

    try {
      const res = await fetch(
        `${API_URL}/api/nav/path?from=${encodeURIComponent(fromSlug)}&to=${encodeURIComponent(toSlug)}&include_steps=true`,
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const pathResult: PathResult = await res.json();
      setResult(pathResult);
      setIsLoading(false);

      // Animate steps
      let idx = 0;
      const states = { ...initStates };
      const speed = 400;

      function animateStep() {
        if (idx >= pathResult.steps.length) {
          // Show path
          for (const nodeId of pathResult.path) {
            states[nodeId] = "path";
          }
          if (fromNode) states[fromNode.id] = "start";
          if (toNode) states[toNode.id] = "goal";
          setNodeStates({ ...states });
          setStepIndex(pathResult.steps.length);
          setIsAnimating(false);
          setPhase("done");
          return;
        }

        const step = pathResult.steps[idx];
        idx++;
        setStepIndex(idx);

        if (step.action === "explore") {
          if (step.node_id !== fromNode?.id && step.node_id !== toNode?.id) {
            states[step.node_id] = "explored";
          }
        } else if (step.action === "add_frontier" || step.action === "update_frontier") {
          if (step.node_id !== fromNode?.id && step.node_id !== toNode?.id) {
            states[step.node_id] = "frontier";
          }
        }
        setNodeStates({ ...states });

        if (stepLogRef.current) {
          stepLogRef.current.scrollTop = stepLogRef.current.scrollHeight;
        }

        const delay = step.action === "explore" ? speed : Math.max(speed / 3, 100);
        animTimerRef.current = setTimeout(animateStep, delay);
      }

      animTimerRef.current = setTimeout(animateStep, 500);
    } catch {
      setIsLoading(false);
      setIsAnimating(false);
      setPhase("idle");
    }
  }

  function handleReplay() {
    if (animTimerRef.current) clearTimeout(animTimerRef.current);
    // Pick new random destination
    const others = destinations.filter(
      (d) => d.slug !== currentSlug && d.active && d.slug !== toSlug,
    );
    if (others.length > 0) {
      const random = others[Math.floor(Math.random() * others.length)];
      setToSlug(random.slug || "");
    }
    setPhase("idle");
    setResult(null);
    setStepIndex(0);
  }

  const fromLabel = navNodes.find((n) => n.slug === fromSlug)?.label || fromSlug;
  const toLabel = navNodes.find((n) => n.slug === toSlug)?.label || toSlug;
  const exploredSteps = result?.steps.filter((s) => s.action === "explore").slice(0, stepIndex) || [];

  return (
    <motion.div
      className="fixed inset-0 z-[200] flex flex-col bg-[#0a0e1a]"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 bg-[#0d1321]">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-9 h-9 rounded-xl bg-[#053384]/30">
            <Sparkles className="w-5 h-5 text-blue-400" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-white">
              Thuật toán A* — Tìm đường thông minh
            </h2>
            <p className="text-xs text-white/50">
              Xem cách hệ thống tìm đường ngắn nhất giữa các tòa nhà
            </p>
          </div>
        </div>
        <button
          onClick={onClose}
          className="p-2 rounded-xl text-white/60 hover:text-white hover:bg-white/10 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
        {/* Map */}
        <div className="flex-1 relative min-h-0">
          <div className="absolute inset-0 flex items-center justify-center p-4">
            <div className="relative w-full max-w-[600px]" style={{ aspectRatio: "1 / 1" }}>
              <MapImage
                alt="TVU Campus Map"
                draggable={false}
                className="absolute inset-0 w-full h-full object-cover rounded-2xl"
                fallbackClassName="rounded-2xl"
              />
              <div className="absolute inset-0 bg-black/40 rounded-2xl" />

              <svg
                className="absolute inset-0 w-full h-full"
                viewBox="0 0 100 100"
                preserveAspectRatio="none"
              >
                {/* Edges */}
                {navEdges.map((edge, i) => {
                  const a = navNodes.find((n) => n.id === edge.from);
                  const b = navNodes.find((n) => n.id === edge.to);
                  if (!a || !b) return null;

                  const stateA = nodeStates[a.id];
                  const stateB = nodeStates[b.id];
                  const bothOnPath =
                    (stateA === "path" || stateA === "start" || stateA === "goal") &&
                    (stateB === "path" || stateB === "start" || stateB === "goal");

                  return (
                    <line
                      key={i}
                      x1={a.x}
                      y1={a.y}
                      x2={b.x}
                      y2={b.y}
                      stroke={bothOnPath ? "#22c55e" : "rgba(255,255,255,0.1)"}
                      strokeWidth={bothOnPath ? "0.7" : "0.2"}
                      strokeLinecap="round"
                    />
                  );
                })}

                {/* Nodes */}
                {navNodes.map((node) => {
                  const state = nodeStates[node.id] || "default";
                  const isJunction = node.type === "junction";
                  const r = isJunction
                    ? state === "default" ? 0.3 : 0.6
                    : state === "default" ? 0.7 : 1.3;
                  const fill = STATE_COLORS[state];

                  return (
                    <g key={node.id}>
                      {state !== "default" && (
                        <circle
                          cx={node.x}
                          cy={node.y}
                          r={r + 0.8}
                          fill={fill}
                          opacity={0.2}
                        >
                          {(state === "start" || state === "goal") && (
                            <animate
                              attributeName="r"
                              values={`${r + 0.5};${r + 1.5};${r + 0.5}`}
                              dur="2s"
                              repeatCount="indefinite"
                            />
                          )}
                        </circle>
                      )}
                      <circle
                        cx={node.x}
                        cy={node.y}
                        r={r}
                        fill={fill}
                        stroke={state !== "default" ? "#fff" : "none"}
                        strokeWidth={0.15}
                      />
                      {!isJunction && state !== "default" && (
                        <text
                          x={node.x}
                          y={node.y - r - 1}
                          textAnchor="middle"
                          fontSize="1.6"
                          fontWeight="bold"
                          fill="#fff"
                          style={{
                            paintOrder: "stroke",
                            stroke: "rgba(0,0,0,0.8)",
                            strokeWidth: 0.5,
                          }}
                        >
                          {node.label || node.building || node.id}
                        </text>
                      )}
                    </g>
                  );
                })}
              </svg>

              {/* Route info overlay */}
              <div className="absolute top-3 left-3 right-3 flex items-center justify-between">
                <div className="flex items-center gap-2 rounded-xl bg-black/60 backdrop-blur-sm px-3 py-2 text-xs text-white">
                  <span className="inline-block w-2 h-2 rounded-full bg-blue-500" />
                  <span className="font-medium">{fromLabel}</span>
                  <ChevronRight className="w-3 h-3 text-white/40" />
                  <span className="inline-block w-2 h-2 rounded-full bg-orange-500" />
                  <span className="font-medium">{toLabel}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Side Panel */}
        <div className="w-full lg:w-[340px] flex flex-col border-t lg:border-t-0 lg:border-l border-white/10 bg-[#0d1321] overflow-y-auto">
          {/* Explanation */}
          <div className="px-5 py-4 border-b border-white/10">
            <h3 className="text-sm font-bold text-white mb-2">
              Thuật toán A* là gì?
            </h3>
            <p className="text-xs text-white/60 leading-relaxed">
              A* (A-star) là thuật toán tìm đường thông minh, kết hợp chi phí
              thực tế (g) và ước lượng khoảng cách đến đích (h) để luôn ưu
              tiên mở rộng node có khả năng dẫn đến đường ngắn nhất.
            </p>
            <div className="mt-3 p-2.5 rounded-lg bg-blue-500/10 border border-blue-500/20">
              <p className="text-xs text-blue-300 font-mono">
                f(n) = g(n) + h(n)
              </p>
              <p className="text-[10px] text-white/40 mt-1">
                g = chi phí từ start → n &nbsp;|&nbsp; h = ước lượng n → goal
              </p>
            </div>
          </div>

          {/* Stats */}
          {result && (
            <div className="px-5 py-3 border-b border-white/10">
              <div className="grid grid-cols-3 gap-2">
                <div className="rounded-lg bg-white/5 p-2.5 text-center">
                  <p className="text-[9px] uppercase tracking-wider text-white/40 font-semibold">
                    Explored
                  </p>
                  <p className="text-base font-bold text-red-400">
                    {exploredSteps.length}
                  </p>
                </div>
                <div className="rounded-lg bg-white/5 p-2.5 text-center">
                  <p className="text-[9px] uppercase tracking-wider text-white/40 font-semibold">
                    Path
                  </p>
                  <p className="text-base font-bold text-green-400">
                    {result.path.length}
                  </p>
                </div>
                <div className="rounded-lg bg-white/5 p-2.5 text-center">
                  <p className="text-[9px] uppercase tracking-wider text-white/40 font-semibold">
                    Cost
                  </p>
                  <p className="text-base font-bold text-blue-400">
                    {result.total_cost}
                  </p>
                </div>
              </div>
              {phase === "done" && result.found && (
                <div className="mt-2 text-[10px] text-white/40 text-center">
                  A* chỉ duyệt {result.explored_count}/{result.total_nodes} nodes
                  {result.explored_count < result.total_nodes && (
                    <span className="text-green-400 font-semibold">
                      {" "}— tiết kiệm{" "}
                      {Math.round(
                        (1 - result.explored_count / result.total_nodes) * 100,
                      )}
                      %
                    </span>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Step Log */}
          <div className="flex-1 min-h-0 px-5 py-3">
            <h4 className="text-[10px] uppercase tracking-wider text-white/30 font-semibold mb-2">
              Quá trình
            </h4>
            <div
              ref={stepLogRef}
              className="h-[180px] lg:h-auto lg:max-h-[calc(100vh-500px)] overflow-y-auto rounded-lg bg-black/40 p-3 font-mono text-[10px] leading-relaxed"
            >
              {isLoading && (
                <p className="text-blue-400 animate-pulse">
                  Đang gọi API...
                </p>
              )}
              {result?.steps.slice(0, stepIndex).map((step, i) => {
                const cls =
                  step.action === "explore"
                    ? "text-red-400"
                    : step.action === "add_frontier"
                      ? "text-amber-400"
                      : "text-amber-300";
                return (
                  <p key={i} className={cls}>
                    {step.detail}
                  </p>
                );
              })}
              {phase === "done" && result?.found && (
                <>
                  <p className="text-blue-400 mt-2">═══ Kết quả ═══</p>
                  <p className="text-green-400 font-semibold">
                    Path: {result.path.map((id) => getLabel(id)).join(" → ")}
                  </p>
                </>
              )}
            </div>
          </div>

          {/* Actions */}
          <div className="px-5 py-4 border-t border-white/10 flex gap-2">
            <button
              onClick={handleReplay}
              disabled={isAnimating}
              className="flex-1 flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl bg-[#053384] hover:bg-[#053384]/80 text-white text-sm font-medium transition-all disabled:opacity-50"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Xem route khác
            </button>
          </div>

          {/* Legend */}
          <div className="px-5 pb-4 flex flex-wrap gap-x-3 gap-y-1">
            {[
              { color: STATE_COLORS.start, label: "Điểm đi" },
              { color: STATE_COLORS.goal, label: "Điểm đến" },
              { color: STATE_COLORS.explored, label: "Đã duyệt" },
              { color: STATE_COLORS.frontier, label: "Biên" },
              { color: STATE_COLORS.path, label: "Đường đi" },
            ].map(({ color, label }) => (
              <div key={label} className="flex items-center gap-1">
                <div
                  className="w-2 h-2 rounded-full"
                  style={{ backgroundColor: color }}
                />
                <span className="text-[9px] text-white/40">{label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </motion.div>
  );
}
