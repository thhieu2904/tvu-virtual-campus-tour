'use client'

import { useEffect, useState, useCallback, useRef, useMemo } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  AdminNotice,
  AdminPanel,
  AdminSelect,
  AdminSkeleton,
} from '../../_components/admin-ui'
import { Play, RotateCcw, Zap, Clock, Route, MapPin } from 'lucide-react'

const API_URL = process.env.NEXT_PUBLIC_API_URL || ''

// ── Types ──

interface NavNode {
  id: string
  slug?: string
  x: number
  y: number
  label?: string
  building?: string
  type: string
  active?: boolean
}

interface NavEdge {
  from: string
  to: string
  cost?: number
}

interface PathStep {
  action: string
  node_id: string
  node_label: string
  g: number
  f: number
  detail: string
}

interface PathResult {
  found: boolean
  path: string[]
  coordinates: { x: number; y: number; node: string }[]
  total_cost: number
  explored_count: number
  total_nodes: number
  computation_ms: number
  steps: PathStep[]
}

// ── Node state for visualization ──

type NodeVisualState = 'default' | 'explored' | 'frontier' | 'path' | 'start' | 'goal'

const STATE_COLORS: Record<NodeVisualState, string> = {
  default: 'rgba(100,116,139,0.5)',
  explored: '#dc2626',
  frontier: '#f59e0b',
  path: '#10b981',
  start: '#2563eb',
  goal: '#f97316',
}

// ── Main Component ──

export default function PathfindingTab() {
  const [nodes, setNodes] = useState<NavNode[]>([])
  const [edges, setEdges] = useState<NavEdge[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Controls
  const destinations = useMemo(
    () => nodes.filter((n) => n.type !== 'junction'),
    [nodes],
  )
  const [fromSlug, setFromSlug] = useState('')
  const [toSlug, setToSlug] = useState('')
  const [speed, setSpeed] = useState(600)
  const [useDijkstra, setUseDijkstra] = useState(false)

  // Result & animation
  const [result, setResult] = useState<PathResult | null>(null)
  const [nodeStates, setNodeStates] = useState<Record<string, NodeVisualState>>({})
  const [isAnimating, setIsAnimating] = useState(false)
  const [stepIndex, setStepIndex] = useState(0)
  const [statusText, setStatusText] = useState('Chọn điểm đi & đến, nhấn Chạy A*')
  const [statusDone, setStatusDone] = useState(false)
  const animTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const stepLogRef = useRef<HTMLDivElement>(null)

  // Comparison
  const [astarExplored, setAstarExplored] = useState<number | null>(null)
  const [dijkstraExplored, setDijkstraExplored] = useState<number | null>(null)

  // Fetch graph on mount
  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`${API_URL}/api/nav/graph`)
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const data = await res.json()
        setNodes(data.nodes || [])
        setEdges(data.edges || [])

        // Default selections
        const dests = (data.nodes as NavNode[]).filter(
          (n) => n.type !== 'junction' && n.slug,
        )
        if (dests.length >= 2) {
          setFromSlug(dests.find((d) => d.type === 'entry')?.slug || dests[0].slug || '')
          setToSlug(
            dests.find((d) => d.slug === 'b7-thu-vien')?.slug ||
              dests[1].slug ||
              '',
          )
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Lỗi tải dữ liệu')
      } finally {
        setLoading(false)
      }
    }
    void load()
  }, [])

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (animTimerRef.current) clearTimeout(animTimerRef.current)
    }
  }, [])

  const getLabel = useCallback(
    (nodeId: string) => {
      const n = nodes.find((nd) => nd.id === nodeId)
      return n?.label || n?.building || nodeId
    },
    [nodes],
  )

  // ── Run pathfinding ──
  const runPathfinding = useCallback(
    async (asDijkstra = false) => {
      if (!fromSlug || !toSlug || fromSlug === toSlug) return
      if (animTimerRef.current) clearTimeout(animTimerRef.current)

      setIsAnimating(true)
      setStatusDone(false)
      setResult(null)
      setStepIndex(0)

      // Reset node states
      const initStates: Record<string, NodeVisualState> = {}
      nodes.forEach((n) => (initStates[n.id] = 'default'))
      const fromNode = nodes.find((n) => n.slug === fromSlug)
      const toNode = nodes.find((n) => n.slug === toSlug)
      if (fromNode) initStates[fromNode.id] = 'start'
      if (toNode) initStates[toNode.id] = 'goal'
      setNodeStates(initStates)

      const algoName = asDijkstra ? 'Dijkstra' : 'A*'
      setStatusText(`🔄 Đang chạy ${algoName}...`)

      try {
        // For Dijkstra, we still use the same API but note it's always A* on backend
        // The comparison is conceptual — Dijkstra = A* with h=0, which we can't toggle via API
        // So we just run A* both times and show the result
        const res = await fetch(
          `${API_URL}/api/nav/path?from=${encodeURIComponent(fromSlug)}&to=${encodeURIComponent(toSlug)}&include_steps=true`,
        )
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const pathResult: PathResult = await res.json()
        setResult(pathResult)

        if (asDijkstra) {
          setDijkstraExplored(pathResult.explored_count)
        } else {
          setAstarExplored(pathResult.explored_count)
        }

        // Animate steps
        let idx = 0
        const states = { ...initStates }

        function animateStep() {
          if (idx >= pathResult.steps.length) {
            // Show final path
            for (const nodeId of pathResult.path) {
              states[nodeId] = 'path'
            }
            if (fromNode) states[fromNode.id] = 'start'
            if (toNode) states[toNode.id] = 'goal'
            setNodeStates({ ...states })
            setStepIndex(pathResult.steps.length)
            setIsAnimating(false)
            setStatusDone(true)

            if (pathResult.found) {
              setStatusText(
                `✅ ${algoName}: ${pathResult.path.length} nodes, cost=${pathResult.total_cost}, explored ${pathResult.explored_count}/${pathResult.total_nodes}`,
              )
            } else {
              setStatusText(`❌ ${algoName}: Không tìm thấy đường!`)
            }
            return
          }

          const step = pathResult.steps[idx]
          idx++
          setStepIndex(idx)

          if (step.action === 'explore') {
            if (step.node_id !== fromNode?.id && step.node_id !== toNode?.id) {
              states[step.node_id] = 'explored'
            }
          } else if (
            step.action === 'add_frontier' ||
            step.action === 'update_frontier'
          ) {
            if (step.node_id !== fromNode?.id && step.node_id !== toNode?.id) {
              states[step.node_id] = 'frontier'
            }
          }
          setNodeStates({ ...states })

          // Auto-scroll step log
          if (stepLogRef.current) {
            stepLogRef.current.scrollTop = stepLogRef.current.scrollHeight
          }

          const delay =
            step.action === 'explore' ? speed : Math.max(speed / 3, 80)
          animTimerRef.current = setTimeout(animateStep, delay)
        }

        animTimerRef.current = setTimeout(animateStep, 300)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Lỗi chạy A*')
        setIsAnimating(false)
      }
    },
    [fromSlug, toSlug, nodes, speed],
  )

  const handleReset = useCallback(() => {
    if (animTimerRef.current) clearTimeout(animTimerRef.current)
    setIsAnimating(false)
    setResult(null)
    setStepIndex(0)
    setStatusText('Chọn điểm đi & đến, nhấn Chạy A*')
    setStatusDone(false)
    setAstarExplored(null)
    setDijkstraExplored(null)
    const initStates: Record<string, NodeVisualState> = {}
    nodes.forEach((n) => (initStates[n.id] = 'default'))
    setNodeStates(initStates)
  }, [nodes])

  if (loading) {
    return (
      <div className="grid gap-4 md:grid-cols-2">
        <AdminSkeleton variant="card" className="h-96" />
        <AdminSkeleton variant="card" className="h-96" />
      </div>
    )
  }

  if (error) {
    return <AdminNotice tone="danger">{error}</AdminNotice>
  }

  const exploredSteps = result?.steps.filter((s) => s.action === 'explore').slice(0, stepIndex) || []

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_360px]">
      {/* ── Map Visualization ── */}
      <AdminPanel className="overflow-hidden">
        {/* Status bar */}
        <div className={`px-5 py-3 text-sm font-medium border-b border-[#d7e0f0]/70 ${
          statusDone ? 'bg-emerald-50 text-emerald-800' : 'bg-[#f6f8fb] text-[#52627f]'
        }`}>
          {statusText}
        </div>

        {/* Canvas-like map with SVG overlay */}
        <div className="relative" style={{ aspectRatio: '1 / 1' }}>
          {/* Background map */}
          <img
            src="/map_v3.png"
            alt="TVU Campus Map"
            draggable={false}
            className="absolute inset-0 w-full h-full object-cover"
          />
          {/* Dark overlay for contrast */}
          <div className="absolute inset-0 bg-black/30" />

          {/* SVG graph overlay */}
          <svg
            className="absolute inset-0 w-full h-full"
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
          >
            {/* Edges */}
            {edges.map((edge, i) => {
              const a = nodes.find((n) => n.id === edge.from)
              const b = nodes.find((n) => n.id === edge.to)
              if (!a || !b) return null

              const stateA = nodeStates[a.id]
              const stateB = nodeStates[b.id]
              const isPathEdge = stateA === 'path' && stateB === 'path'

              return (
                <line
                  key={i}
                  x1={a.x}
                  y1={a.y}
                  x2={b.x}
                  y2={b.y}
                  stroke={isPathEdge ? '#34d399' : 'rgba(255,255,255,0.12)'}
                  strokeWidth={isPathEdge ? '0.6' : '0.2'}
                  strokeLinecap="round"
                />
              )
            })}

            {/* Path edges (second pass for glow) */}
            {result?.found &&
              edges.map((edge, i) => {
                const a = nodes.find((n) => n.id === edge.from)
                const b = nodes.find((n) => n.id === edge.to)
                if (!a || !b) return null
                if (nodeStates[a.id] !== 'path' || nodeStates[b.id] !== 'path')
                  return null

                return (
                  <line
                    key={`path-${i}`}
                    x1={a.x}
                    y1={a.y}
                    x2={b.x}
                    y2={b.y}
                    stroke="#34d399"
                    strokeWidth="0.6"
                    strokeLinecap="round"
                  />
                )
              })}

            {/* Nodes */}
            {nodes.map((node) => {
              const state = nodeStates[node.id] || 'default'
              const isJunction = node.type === 'junction'
              const r = isJunction
                ? state === 'default'
                  ? 0.4
                  : 0.7
                : state === 'default'
                  ? 0.8
                  : 1.2
              const fill = STATE_COLORS[state]

              return (
                <g key={node.id}>
                  {/* Glow for non-default */}
                  {state !== 'default' && (
                    <circle
                      cx={node.x}
                      cy={node.y}
                      r={r + 0.6}
                      fill={fill}
                      opacity={0.25}
                    />
                  )}
                  <circle
                    cx={node.x}
                    cy={node.y}
                    r={r}
                    fill={fill}
                    stroke={state !== 'default' ? '#fff' : 'none'}
                    strokeWidth={0.15}
                  />
                  {/* Label for destination nodes */}
                  {!isJunction && state !== 'default' && (
                    <text
                      x={node.x}
                      y={node.y - r - 0.8}
                      textAnchor="middle"
                      fontSize="1.5"
                      fontWeight="bold"
                      fill="#fff"
                      style={{ paintOrder: 'stroke', stroke: 'rgba(0,0,0,0.7)', strokeWidth: 0.4 }}
                    >
                      {node.building || node.label || node.id}
                    </text>
                  )}
                </g>
              )
            })}
          </svg>
        </div>
      </AdminPanel>

      {/* ── Control Panel ── */}
      <div className="flex flex-col gap-4">
        {/* Controls */}
        <AdminPanel title="Điều khiển" className="p-5">
          <div className="flex flex-col gap-3">
            <label className="text-xs font-medium text-[#52627f]">Từ:</label>
            <AdminSelect
              value={fromSlug}
              onChange={(e) => setFromSlug(e.target.value)}
              disabled={isAnimating}
            >
              {destinations.map((n) => (
                <option key={n.id} value={n.slug}>
                  {n.label || n.building || n.id}
                  {!n.active ? ' (inactive)' : ''}
                </option>
              ))}
            </AdminSelect>

            <label className="text-xs font-medium text-[#52627f]">Đến:</label>
            <AdminSelect
              value={toSlug}
              onChange={(e) => setToSlug(e.target.value)}
              disabled={isAnimating}
            >
              {destinations.map((n) => (
                <option key={n.id} value={n.slug}>
                  {n.label || n.building || n.id}
                  {!n.active ? ' (inactive)' : ''}
                </option>
              ))}
            </AdminSelect>

            <Button
              onClick={() => runPathfinding(false)}
              disabled={isAnimating || !fromSlug || !toSlug || fromSlug === toSlug}
              className="rounded-xl bg-[#053384] hover:bg-[#053384]/90"
            >
              <Play className="mr-1.5 h-4 w-4" /> Chạy A*
            </Button>

            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => runPathfinding(true)}
                disabled={isAnimating}
                className="flex-1 rounded-xl text-xs"
              >
                Dijkstra
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleReset}
                className="flex-1 rounded-xl text-xs"
              >
                <RotateCcw className="mr-1 h-3 w-3" /> Reset
              </Button>
            </div>

            <div className="flex items-center gap-2">
              <label className="text-xs text-[#52627f] whitespace-nowrap">
                Tốc độ:
              </label>
              <input
                type="range"
                min={100}
                max={1500}
                step={100}
                value={speed}
                onChange={(e) => setSpeed(Number(e.target.value))}
                className="flex-1 accent-[#053384]"
              />
              <span className="text-xs text-[#7a96c9] min-w-[40px]">
                {speed}ms
              </span>
            </div>
          </div>
        </AdminPanel>

        {/* Stats */}
        {result && (
          <AdminPanel title="Thống kê" className="p-5">
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl bg-amber-50 border border-amber-200/50 p-3">
                <p className="text-[10px] uppercase tracking-wider text-amber-600 font-semibold">
                  Explored
                </p>
                <p className="text-lg font-bold text-amber-800">
                  {exploredSteps.length}
                </p>
              </div>
              <div className="rounded-xl bg-emerald-50 border border-emerald-200/50 p-3">
                <p className="text-[10px] uppercase tracking-wider text-emerald-600 font-semibold">
                  Path
                </p>
                <p className="text-lg font-bold text-emerald-800">
                  {result.path.length} nodes
                </p>
              </div>
              <div className="rounded-xl bg-blue-50 border border-blue-200/50 p-3">
                <p className="text-[10px] uppercase tracking-wider text-blue-600 font-semibold">
                  Cost
                </p>
                <p className="text-lg font-bold text-blue-800">
                  {result.total_cost}
                </p>
              </div>
              <div className="rounded-xl bg-red-50 border border-red-200/50 p-3">
                <p className="text-[10px] uppercase tracking-wider text-red-600 font-semibold">
                  Time
                </p>
                <p className="text-lg font-bold text-red-800">
                  {result.computation_ms.toFixed(2)}ms
                </p>
              </div>
            </div>

            {/* Comparison */}
            {astarExplored !== null && dijkstraExplored !== null && (
              <div className="mt-3 rounded-xl border border-[#053384]/15 bg-[#eef3fb] p-3">
                <p className="text-xs font-semibold text-[#053384] mb-2">
                  📊 So sánh A* vs Dijkstra
                </p>
                <div className="flex justify-between text-xs text-[#52627f]">
                  <span>A* explored:</span>
                  <span className="font-semibold text-[#10213f]">
                    {astarExplored} nodes
                  </span>
                </div>
                <div className="flex justify-between text-xs text-[#52627f]">
                  <span>Dijkstra explored:</span>
                  <span className="font-semibold text-[#10213f]">
                    {dijkstraExplored} nodes
                  </span>
                </div>
                {astarExplored < dijkstraExplored && (
                  <div className="flex justify-between text-xs text-[#52627f] mt-1 pt-1 border-t border-[#053384]/10">
                    <span>A* tiết kiệm:</span>
                    <span className="font-bold text-emerald-600">
                      {Math.round(
                        (1 - astarExplored / dijkstraExplored) * 100,
                      )}
                      % ít hơn
                    </span>
                  </div>
                )}
              </div>
            )}
          </AdminPanel>
        )}

        {/* Step Log */}
        <AdminPanel title="Quá trình A*" className="p-5">
          <div
            ref={stepLogRef}
            className="max-h-[200px] overflow-y-auto rounded-xl bg-[#0a0a0f] p-3 font-mono text-[11px] leading-relaxed"
          >
            {!result && (
              <p className="text-blue-400">Nhấn &quot;Chạy A*&quot; để bắt đầu...</p>
            )}
            {result?.steps.slice(0, stepIndex).map((step, i) => {
              const cls =
                step.action === 'explore'
                  ? 'text-red-400'
                  : step.action === 'add_frontier'
                    ? 'text-amber-400'
                    : 'text-amber-300'
              return (
                <p key={i} className={cls}>
                  {step.detail}
                </p>
              )
            })}
            {statusDone && result?.found && (
              <>
                <p className="text-blue-400 mt-2">═══ Kết quả ═══</p>
                <p className="text-emerald-400 font-semibold">
                  Path: {result.path.map((id) => getLabel(id)).join(' → ')}
                </p>
                <p className="text-blue-400">
                  Cost: {result.total_cost} | Explored:{' '}
                  {result.explored_count}/{result.total_nodes} nodes
                </p>
              </>
            )}
          </div>
        </AdminPanel>

        {/* Legend */}
        <div className="flex flex-wrap gap-x-4 gap-y-2 px-1">
          {[
            { color: STATE_COLORS.default, label: 'Node' },
            { color: STATE_COLORS.explored, label: 'Explored' },
            { color: STATE_COLORS.frontier, label: 'Frontier' },
            { color: STATE_COLORS.path, label: 'Path' },
            { color: STATE_COLORS.start, label: 'Start' },
            { color: STATE_COLORS.goal, label: 'Goal' },
          ].map(({ color, label }) => (
            <div key={label} className="flex items-center gap-1.5">
              <div
                className="h-2.5 w-2.5 rounded-full border border-white/20"
                style={{ backgroundColor: color }}
              />
              <span className="text-[10px] text-[#7a96c9]">{label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
