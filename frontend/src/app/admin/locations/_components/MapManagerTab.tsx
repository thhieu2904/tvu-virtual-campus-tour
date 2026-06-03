'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Building2,
  Image as ImageIcon,
  Loader2,
  Pencil,
  ToggleLeft,
  ToggleRight,
  X,
} from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { adminApi } from '@/lib/admin-api'
import { useTourStore } from '@/features/tour/store'
import {
  AdminModal,
  AdminNotice,
  AdminSkeleton,
} from '../../_components/admin-ui'

const API_URL = process.env.NEXT_PUBLIC_API_URL || ''

type LocationStatus = 'active' | 'inactive'

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
  bidirectional?: boolean
  enabled?: boolean
}

interface LocationItem {
  id: string
  name: string
  slug: string
  description: string
  intro_message?: string
  status: LocationStatus
  is_start_node?: boolean
  intro_audio_url?: string | null
  revisit_audio_url?: string | null
  background_url: string
  mascot_id?: string | null
  sort_order?: number
  media_count: number
  updated_at: string | null
}

interface GraphResponse {
  nodes: NavNode[]
  edges: NavEdge[]
  active_destinations?: string[]
}

interface RegeneratePathsResult {
  success: boolean
  active_count: number
  paths_computed: number
  paths_failed: number
  total_ms: number
  backup_file: string | null
}

interface MapManagerTabProps {
  onEditLocation?: (locationId: string) => void
  onLocationStatusChange?: (locationId: string, status: LocationStatus) => void
}

function getNodeTitle(node: NavNode) {
  return node.label || node.building || node.slug || node.id
}

function getNodeShortLabel(node: NavNode, location?: LocationItem) {
  if (node.building) return node.building
  if (node.id === 'welcome') return 'Cổng'
  return node.label || location?.name || node.id
}

function formatDate(value: string | null) {
  if (!value) return 'Chưa cập nhật'
  return new Date(value).toLocaleDateString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
  })
}

function getBubblePlacement(node: NavNode) {
  const showBelow = node.y < 45
  return {
    left: `clamp(10rem, ${node.x}%, calc(100% - 10rem))`,
    top: `${node.y}%`,
    transform: showBelow ? 'translate(-50%, 1rem)' : 'translate(-50%, calc(-100% - 1rem))',
  }
}

export default function MapManagerTab({
  onEditLocation,
  onLocationStatusChange,
}: MapManagerTabProps) {
  const [nodes, setNodes] = useState<NavNode[]>([])
  const [edges, setEdges] = useState<NavEdge[]>([])
  const [dbLocations, setDbLocations] = useState<LocationItem[]>([])
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [togglingId, setTogglingId] = useState<string | null>(null)
  const [regenPrompt, setRegenPrompt] = useState<{ name: string; status: LocationStatus } | null>(null)
  const [regenResult, setRegenResult] = useState<RegeneratePathsResult | null>(null)
  const [regenError, setRegenError] = useState<string | null>(null)
  const [regenerating, setRegenerating] = useState(false)

  useEffect(() => {
    let cancelled = false

    async function load() {
      setLoading(true)
      setError(null)
      try {
        const [graphRes, locationsData] = await Promise.all([
          fetch(`${API_URL}/api/nav/graph`),
          adminApi.get<{ locations: LocationItem[] }>('/locations'),
        ])

        if (!graphRes.ok) throw new Error(`Không thể tải bản đồ: HTTP ${graphRes.status}`)
        const graphData = (await graphRes.json()) as GraphResponse

        if (cancelled) return
        setNodes(graphData.nodes || [])
        setEdges(graphData.edges || [])
        setDbLocations(locationsData.locations || [])

        setSelectedNodeId((current) =>
          current && (graphData.nodes || []).some((node) => node.id === current) ? current : null,
        )
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Không thể tải dữ liệu bản đồ')
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [])

  const dbBySlug = useMemo(() => {
    const map = new Map<string, LocationItem>()
    for (const loc of dbLocations) map.set(loc.slug, loc)
    return map
  }, [dbLocations])

  const nodeById = useMemo(() => {
    const map = new Map<string, NavNode>()
    for (const node of nodes) map.set(node.id, node)
    return map
  }, [nodes])

  const displayNodes = useMemo(
    () => nodes.filter((node) => node.type !== 'junction'),
    [nodes],
  )

  const selectedNode = useMemo(
    () => nodes.find((node) => node.id === selectedNodeId) || null,
    [nodes, selectedNodeId],
  )

  const selectedLocation = selectedNode?.slug ? dbBySlug.get(selectedNode.slug) : undefined
  const activeCount = dbLocations.filter((loc) => loc.status === 'active').length
  const setupCount = displayNodes.filter((node) => node.slug && dbBySlug.has(node.slug)).length

  const getNodeState = useCallback(
    (node: NavNode) => {
      const dbLocation = node.slug ? dbBySlug.get(node.slug) : undefined
      if (!dbLocation) {
        return {
          fill: '#475569',
          labelClass: 'bg-[#08142b]/55 text-white/60 font-medium',
          title: 'Chưa thiết lập',
        }
      }

      if (dbLocation.status === 'active') {
        return {
          fill: '#22c55e',
          labelClass: 'bg-[#08142b]/85 text-white font-semibold',
          title: 'Đang mở',
        }
      }

      return {
        fill: '#94a3b8',
        labelClass: 'bg-[#08142b]/60 text-white font-medium',
        title: 'Tạm đóng',
      }
    },
    [dbBySlug],
  )

  const handleToggle = async (locationId: string) => {
    const currentLocation = dbLocations.find((loc) => loc.id === locationId)
    setTogglingId(locationId)
    setError(null)
    setNotice(null)
    try {
      const result = await adminApi.patch<{ id: string; status: LocationStatus }>(
        `/locations/${locationId}/status`,
      )
      setDbLocations((prev) =>
        prev.map((loc) =>
          loc.id === locationId ? { ...loc, status: result.status } : loc,
        ),
      )
      onLocationStatusChange?.(locationId, result.status)
      setNotice(result.status === 'active' ? 'Đã bật địa điểm trên bản đồ.' : 'Đã tắt địa điểm trên bản đồ.')
      setRegenResult(null)
      setRegenError(null)
      setRegenPrompt({
        name: currentLocation?.name || 'Địa điểm',
        status: result.status,
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không thể đổi trạng thái địa điểm')
    } finally {
      setTogglingId(null)
    }
  }

  const handleRegeneratePaths = async () => {
    setRegenerating(true)
    setRegenError(null)
    try {
      const result = await adminApi.post<RegeneratePathsResult>('/nav/regenerate-paths')
      useTourStore.getState().clearNavigationCache()
      setRegenResult(result)
    } catch (err) {
      setRegenError(err instanceof Error ? err.message : 'Không thể cập nhật đường đi')
    } finally {
      setRegenerating(false)
    }
  }

  const closeRegenModal = () => {
    setRegenPrompt(null)
    setRegenResult(null)
    setRegenError(null)
  }

  if (loading) {
    return (
      <div className="grid gap-5 lg:grid-cols-[1fr_420px]">
        <AdminSkeleton variant="card" className="h-[560px]" />
        <AdminSkeleton variant="card" className="h-[560px]" />
      </div>
    )
  }

  if (error && nodes.length === 0) {
    return <AdminNotice tone="danger">{error}</AdminNotice>
  }

  return (
    <div className="flex flex-col gap-4">
      {regenPrompt && (
        <AdminModal
          title={regenResult ? 'Cập nhật đường đi hoàn tất' : 'Cập nhật đường đi cho bản đồ?'}
          footer={
            regenResult ? (
              <Button onClick={closeRegenModal} className="rounded-xl bg-[#053384] hover:bg-[#053384]/90">
                Đóng
              </Button>
            ) : (
              <>
                <Button variant="outline" onClick={closeRegenModal} disabled={regenerating} className="rounded-xl">
                  Để sau
                </Button>
                <Button
                  onClick={handleRegeneratePaths}
                  disabled={regenerating}
                  className="rounded-xl bg-[#053384] hover:bg-[#053384]/90"
                >
                  {regenerating && <Loader2 data-icon="inline-start" className="animate-spin" />}
                  {regenerating ? 'Đang cập nhật...' : 'Cập nhật ngay'}
                </Button>
              </>
            )
          }
        >
          <div className="flex flex-col gap-4">
            {!regenResult ? (
              <>
                <p className="text-sm leading-6 text-[#52627f]">
                  Bạn vừa đổi trạng thái <span className="font-semibold text-[#10213f]">{regenPrompt.name}</span> sang{' '}
                  <span className="font-semibold text-[#10213f]">
                    {regenPrompt.status === 'active' ? 'đang mở' : 'tạm đóng'}
                  </span>
                  . Cần tính lại đường đi để bản đồ frontend dùng dữ liệu mới.
                </p>
                <div className="rounded-xl border border-[#d7e0f0] bg-[#f6f8fb] p-4 text-sm text-[#52627f]">
                  Hệ thống sẽ đọc các địa điểm đang mở, chạy A* cho tất cả cặp điểm, backup file cũ và ghi lại file paths mới.
                </div>
              </>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Active</p>
                  <p className="mt-1 text-2xl font-bold text-emerald-900">{regenResult.active_count}</p>
                </div>
                <div className="rounded-xl border border-[#d7e0f0] bg-[#f6f8fb] p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-[#52627f]">Paths</p>
                  <p className="mt-1 text-2xl font-bold text-[#10213f]">{regenResult.paths_computed}</p>
                </div>
                <div className="rounded-xl border border-[#d7e0f0] bg-[#f6f8fb] p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-[#52627f]">Failed</p>
                  <p className="mt-1 text-2xl font-bold text-[#10213f]">{regenResult.paths_failed}</p>
                </div>
                <div className="rounded-xl border border-[#d7e0f0] bg-[#f6f8fb] p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-[#52627f]">Time</p>
                  <p className="mt-1 text-2xl font-bold text-[#10213f]">{regenResult.total_ms}ms</p>
                </div>
              </div>
            )}
            {regenResult?.backup_file && (
              <p className="truncate rounded-xl bg-[#eef3fb] px-3 py-2 font-mono text-xs text-[#52627f]">
                Backup: {regenResult.backup_file}
              </p>
            )}
            {regenError && <AdminNotice tone="danger">{regenError}</AdminNotice>}
          </div>
        </AdminModal>
      )}

      {error && <AdminNotice tone="danger">{error}</AdminNotice>}
      {notice && <AdminNotice tone="success">{notice}</AdminNotice>}

      <section className="flex justify-center rounded-2xl bg-[#eef3fb]/55 px-3 py-3 sm:px-4">
          <div className="relative aspect-square w-full max-w-[min(100%,820px)] overflow-hidden rounded-xl bg-[#08142b] shadow-md ring-1 ring-black/5">
            <div className="pointer-events-none absolute left-3 top-3 z-20 rounded-xl border border-white/60 bg-white/90 px-3 py-2 text-xs text-[#52627f] shadow-sm backdrop-blur-md">
              <span className="font-semibold text-[#10213f]">{setupCount}/{displayNodes.length}</span> node,{' '}
              <span className="font-semibold text-emerald-700">{activeCount}</span> đang mở
            </div>
              <img
                src="/map_v3.png"
                alt="Bản đồ khuôn viên TVU"
                draggable={false}
                className="absolute inset-0 size-full object-cover"
              />
              <div className="absolute inset-0 bg-black/20" />

              <svg
                className="absolute inset-0 size-full"
                viewBox="0 0 100 100"
                preserveAspectRatio="none"
                aria-hidden="true"
              >
                {edges.map((edge, index) => {
                  const from = nodeById.get(edge.from)
                  const to = nodeById.get(edge.to)
                  if (!from || !to) return null

                  return (
                    <line
                      key={`${edge.from}-${edge.to}-${index}`}
                      x1={from.x}
                      y1={from.y}
                      x2={to.x}
                      y2={to.y}
                      stroke="rgba(255,255,255,0.14)"
                      strokeLinecap="round"
                      strokeWidth="0.2"
                    />
                  )
                })}
              </svg>

              {displayNodes.map((node) => {
                const state = getNodeState(node)
                const selected = selectedNodeId === node.id
                const dbLocation = node.slug ? dbBySlug.get(node.slug) : undefined
                const isActive = dbLocation?.status === 'active'
                const labelVisible = selected || isActive
                const shortLabel = getNodeShortLabel(node, dbLocation)
                const fullLabel = dbLocation?.name || node.label || node.building || node.id
                const canExpandLabel = fullLabel !== shortLabel

                return (
                  <button
                    key={node.id}
                    type="button"
                    aria-pressed={selected}
                    title={`${getNodeTitle(node)} - ${state.title}`}
                    onClick={() => {
                      setSelectedNodeId(node.id)
                      setNotice(null)
                    }}
                    className="group absolute z-10 flex size-9 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full outline-none transition-transform hover:z-20 hover:scale-110 focus-visible:ring-3 focus-visible:ring-white/70"
                    style={{ left: `${node.x}%`, top: `${node.y}%` }}
                  >
                    <span
                      className={cn(
                        'pointer-events-none absolute left-1/2 top-0 min-w-8 max-w-36 -translate-x-1/2 -translate-y-[calc(100%-2px)] whitespace-nowrap rounded-full border px-2 py-1 text-[10px] font-semibold leading-none shadow-lg backdrop-blur-md transition-opacity',
                        selected
                          ? 'border-white/70 bg-[#053384] text-white'
                          : dbLocation?.status === 'active'
                            ? 'border-white/80 bg-white/95 text-[#10213f]'
                            : 'border-white/25 bg-[#08142b]/75 text-white',
                        labelVisible ? 'opacity-100' : 'opacity-0 group-hover:opacity-100',
                      )}
                    >
                      <span className={cn(canExpandLabel && 'group-hover:hidden')}>{shortLabel}</span>
                      {canExpandLabel && <span className="hidden group-hover:inline">{fullLabel}</span>}
                      <span className="absolute left-1/2 top-full size-2 -translate-x-1/2 -translate-y-1/2 rotate-45 border-b border-r border-inherit bg-inherit" />
                    </span>
                    {isActive && !selected && (
                      <span className="absolute size-6 rounded-full border border-emerald-200/70 bg-emerald-400/20 shadow-[0_0_18px_rgba(34,197,94,0.55)]" />
                    )}
                    {selected && (
                      <span
                        className="absolute inset-1 animate-ping rounded-full opacity-50"
                        style={{ backgroundColor: state.fill }}
                      />
                    )}
                    <span
                      className={cn(
                        'relative rounded-full border border-white/80 shadow-lg shadow-black/30',
                        isActive ? 'size-4' : 'size-3.5',
                        selected && 'ring-4 ring-white/50',
                      )}
                      style={{ backgroundColor: state.fill }}
                    />
                  </button>
                )
              })}

              {selectedNode && (
                <div
                  className="pointer-events-none absolute z-30 w-96 max-w-[calc(100%-1.5rem)]"
                  style={getBubblePlacement(selectedNode)}
                >
                  <div className="pointer-events-auto relative overflow-hidden rounded-2xl border border-white/70 bg-white/95 text-left shadow-2xl shadow-[#08142b]/30 backdrop-blur-md">
                    <span
                      className={cn(
                        'absolute left-1/2 size-3 -translate-x-1/2 rotate-45 border-white/70 bg-white',
                        selectedNode.y < 45 ? '-top-1.5 border-l border-t' : '-bottom-1.5 border-b border-r',
                      )}
                    />

                    {selectedLocation ? (
                      <>
                        <div className="relative aspect-[16/8.5] overflow-hidden bg-[#eef3fb]">
                          {selectedLocation.background_url ? (
                            <img
                              src={selectedLocation.background_url}
                              alt={selectedLocation.name}
                              className="size-full object-cover"
                            />
                          ) : (
                            <div className="flex size-full flex-col items-center justify-center text-[#7a96c9]">
                              <ImageIcon className="h-8 w-8" />
                              <span className="mt-2 text-xs">Chưa có ảnh 360°</span>
                            </div>
                          )}
                          <div className="absolute inset-0 bg-gradient-to-t from-black/35 via-transparent to-black/10" />
                          <Badge
                            className={cn(
                              'absolute bottom-3 left-3 rounded-lg border-white/20 px-2.5 py-1 text-white shadow-md',
                              selectedLocation.status === 'active' ? 'bg-emerald-500' : 'bg-slate-500',
                            )}
                          >
                            {selectedLocation.status === 'active' ? '● Đang mở' : '○ Tạm đóng'}
                          </Badge>
                          <button
                            type="button"
                            onClick={() => setSelectedNodeId(null)}
                            className="absolute right-3 top-3 rounded-full bg-white/90 p-1.5 text-[#52627f] shadow-sm transition-colors hover:bg-white hover:text-[#10213f]"
                            aria-label="Đóng chi tiết node"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </div>

                        <div className="flex flex-col gap-3 p-4">
                          <div className="flex items-start gap-3">
                            <div
                              className="mt-1 size-3 shrink-0 rounded-full border border-white shadow-sm ring-4 ring-[#eef3fb]"
                              style={{ backgroundColor: getNodeState(selectedNode).fill }}
                            />
                            <div className="min-w-0">
                              <p className="truncate text-base font-bold text-[#10213f]">{selectedLocation.name}</p>
                              <p className="mt-0.5 font-mono text-[0.72rem] text-[#7a96c9]">/{selectedLocation.slug}</p>
                            </div>
                          </div>

                          <p className="line-clamp-2 text-[0.82rem] leading-5 text-[#52627f]">
                            {selectedLocation.description || 'Chưa có mô tả cho địa điểm này.'}
                          </p>

                          <div className="flex flex-wrap items-center gap-3 text-[0.72rem] text-[#7a96c9]">
                            <span className="inline-flex items-center gap-1">
                              <ImageIcon className="h-3.5 w-3.5" />
                              {selectedLocation.media_count} media
                            </span>
                            <span>Cập nhật: {formatDate(selectedLocation.updated_at)}</span>
                          </div>

                          <div className="flex flex-wrap gap-2 border-t border-[#d7e0f0]/70 pt-3">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleToggle(selectedLocation.id)}
                              disabled={togglingId === selectedLocation.id}
                              className={cn(
                                'h-8 rounded-xl px-3 text-xs',
                                selectedLocation.status === 'active'
                                  ? 'text-emerald-700 hover:text-emerald-800'
                                  : 'text-[#52627f]',
                              )}
                            >
                              {togglingId === selectedLocation.id ? (
                                <Loader2 data-icon="inline-start" className="animate-spin" />
                              ) : selectedLocation.status === 'active' ? (
                                <ToggleRight data-icon="inline-start" />
                              ) : (
                                <ToggleLeft data-icon="inline-start" />
                              )}
                              {selectedLocation.status === 'active' ? 'Tắt' : 'Bật'}
                            </Button>
                            <Button
                              size="sm"
                              onClick={() => onEditLocation?.(selectedLocation.id)}
                              className="h-8 rounded-xl bg-[#053384] px-3 text-xs hover:bg-[#053384]/90"
                            >
                              <Pencil data-icon="inline-start" />
                              Chỉnh sửa
                            </Button>
                          </div>
                        </div>
                      </>
                    ) : (
                      <div className="flex flex-col gap-3 p-4 pr-10">
                        <button
                          type="button"
                          onClick={() => setSelectedNodeId(null)}
                          className="absolute right-2.5 top-2.5 rounded-full p-1 text-[#7a96c9] transition-colors hover:bg-[#eef3fb] hover:text-[#10213f]"
                          aria-label="Đóng chi tiết node"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                        <div className="flex items-start gap-3">
                          <div className="mt-0.5 rounded-xl bg-[#eef3fb] p-2 text-[#7a96c9]">
                            <Building2 className="h-4 w-4" />
                          </div>
                          <div className="min-w-0">
                            <p className="truncate text-base font-bold text-[#10213f]">
                              {selectedNode.building || selectedNode.label || selectedNode.id}
                            </p>
                            <p className="mt-0.5 text-[0.78rem] font-medium text-[#7a96c9]">Chưa thiết lập</p>
                          </div>
                        </div>
                        <p className="text-[0.82rem] leading-5 text-[#52627f]">
                          Node này đã có trên bản đồ nhưng chưa có location tương ứng trong hệ thống.
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
        </section>
    </div>
  )
}
