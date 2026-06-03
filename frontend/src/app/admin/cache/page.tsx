'use client'

import { Suspense, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import {
  AdminMetricStrip,
  AdminNotice,
  AdminResourceSidebar,
  AdminStatusPill,
  AdminWorkbench,
} from '../_components/admin-ui'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { adminApi } from '@/lib/admin-api'
import {
  Activity,
  AlertTriangle,
  Bot,
  CheckCircle2,
  Clock3,
  Database,
  FileQuestion,
  Globe2,
  HardDrive,
  ListChecks,
  MapPin,
  Mic,
  MoreHorizontal,
  Play,
  RefreshCw,
  Search,
  ShieldAlert,
  Sparkles,
  XCircle,
} from 'lucide-react'

type CacheScope = 'location' | 'mascot' | 'global'
type CacheFocus = 'voice' | 'questions' | 'prompt' | 'all' | 'overview'
type CacheStatus = 'valid' | 'stale' | 'missing' | 'running' | 'failed'
type ArtifactStatus = 'valid' | 'stale' | 'missing'
type CacheJobStatus = 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled'

type LocationItem = {
  id: string
  name: string
  slug: string
  status: 'active' | 'inactive'
  question_count?: number
  mascot_name?: string | null
}

type MascotItem = {
  id: string
  name: string
  slug: string
  voice_name: string
  voice_style: string
  is_default: boolean
  location_count: number
}

type CacheSummary = {
  scope: CacheScope
  target_id: string | null
  focus: CacheFocus
  status: CacheStatus
  current_fingerprint: string | null
  cached_fingerprint: string | null
  affected_items: number
  total_items: number
  estimated_cost: {
    tts_requests: number
    rag_requests: number
  }
  latest_job: {
    id: string
    job_type: string
    status: string
    focus: string | null
    created_at: string | null
    updated_at: string | null
  } | null
  artifacts: {
    artifact_type: 'intro_audio' | 'location_intro_audio' | 'qa_answer' | 'qa_audio'
    item_key: string
    label: string
    status: ArtifactStatus
    current_fingerprint: string
    cached_fingerprint: string | null
    storage_url: string | null
    cache_key: string | null
    updated_at: string | null
    metadata: Record<string, unknown>
  }[]
  runtime_cache: {
    qa_cache_entries: number
    tts_key_cache_loaded: boolean
    tts_key_count: number
    tts_key_load_attempts: number
    tts_key_loaded_at: string | null
    tts_key_last_error: string | null
  }
  target: Record<string, unknown> | null
  dependent_locations: {
    id: string
    name: string
    slug: string
    question_count: number
    dependency: string
  }[]
}

type CacheJobDetail = {
  job: {
    id: string
    job_type: string
    scope: CacheScope
    target_id: string | null
    focus: string | null
    status: CacheJobStatus
    params: Record<string, unknown>
    detected_changes: Record<string, unknown>
    total_items: number
    processed_items: number
    failed_items: number
    error_message: string | null
    started_at: string | null
    finished_at: string | null
    created_at: string | null
    updated_at: string | null
  }
  progress: number
  logs: {
    id: string
    level: 'info' | 'warning' | 'error'
    message: string
    item_key: string | null
    payload: Record<string, unknown>
    created_at: string | null
  }[]
  artifacts: CacheSummary['artifacts']
}

type SidebarSummary = Pick<CacheSummary, 'status' | 'affected_items' | 'total_items'>

const statusMeta: Record<CacheStatus, { label: string; tone: 'success' | 'warning' | 'danger' | 'muted' | 'info'; icon: typeof CheckCircle2 }> = {
  valid: { label: 'Hợp lệ', tone: 'success', icon: CheckCircle2 },
  stale: { label: 'Cần cập nhật', tone: 'warning', icon: AlertTriangle },
  missing: { label: 'Chưa có', tone: 'warning', icon: ShieldAlert },
  running: { label: 'Đang chạy', tone: 'info', icon: Activity },
  failed: { label: 'Thất bại', tone: 'danger', icon: XCircle },
}

const artifactLabels: Record<string, string> = {
  intro_audio: 'Audio giới thiệu đại sứ ảo',
  location_intro_audio: 'Audio giới thiệu/quay lại địa điểm',
  qa_answer: 'Câu trả lời gợi ý',
  qa_audio: 'Audio câu trả lời',
}

const logLevelLabels: Record<string, string> = {
  info: 'Thông tin',
  warning: 'Cảnh báo',
  error: 'Lỗi',
}

const jobTypeLabels: Record<string, string> = {
  cache_observability: 'Kiểm tra cache',
  location_intro_audio: 'Audio địa điểm',
  location_qa_audio: 'Audio hỏi đáp địa điểm',
  location_suggested_qa: 'Hỏi đáp địa điểm',
  mascot_intro_audio: 'Audio đại sứ ảo',
  mascot_dependent_cache: 'Cache phụ thuộc đại sứ',
}

const focusOptionsByScope: Record<CacheScope, { id: CacheFocus; label: string }[]> = {
  global: [
    { id: 'overview', label: 'Tổng quan' },
    { id: 'all', label: 'Tất cả' },
  ],
  location: [
    { id: 'overview', label: 'Tổng quan' },
    { id: 'questions', label: 'Hỏi đáp' },
    { id: 'all', label: 'Tất cả' },
  ],
  mascot: [
    { id: 'overview', label: 'Tổng quan' },
    { id: 'voice', label: 'Giọng đọc & intro' },
    { id: 'all', label: 'Tất cả' },
  ],
}

function jobStatusLabel(status: string): string {
  const map: Record<string, string> = {
    queued: 'Chờ xử lý',
    running: 'Đang chạy',
    succeeded: 'Hoàn thành',
    failed: 'Thất bại',
    cancelled: 'Đã hủy',
  }
  return map[status] ?? status
}

const jobStatusTone: Record<CacheJobStatus, 'success' | 'warning' | 'danger' | 'muted' | 'info'> = {
  queued: 'info',
  running: 'info',
  succeeded: 'success',
  failed: 'danger',
  cancelled: 'muted',
}

function normalizeScope(value: string | null): CacheScope {
  if (value === 'location' || value === 'mascot') return value
  return 'global'
}

function normalizeFocus(value: string | null): CacheFocus {
  if (value === 'voice' || value === 'questions' || value === 'prompt' || value === 'all') return value
  return 'overview'
}

function normalizeFocusForScope(scope: CacheScope, focus: CacheFocus): CacheFocus {
  return focusOptionsByScope[scope].some((item) => item.id === focus) ? focus : 'overview'
}

function formatDate(value: string | null) {
  if (!value) return 'Chưa có'
  return new Intl.DateTimeFormat('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))
}

function shortHash(value: string | null) {
  return value ? value.slice(0, 12) : 'Chưa có'
}

function artifactStatusCounts(summary: CacheSummary | null) {
  const counts = { valid: 0, stale: 0, missing: 0 }
  for (const item of summary?.artifacts ?? []) {
    counts[item.status] += 1
  }
  return counts
}

function sidebarKey(scope: CacheScope, targetId?: string | null) {
  return scope === 'global' ? 'global' : `${scope}:${targetId ?? ''}`
}

function summaryTone(summary: SidebarSummary | undefined): 'success' | 'warning' | 'danger' | 'muted' | 'info' {
  if (!summary) return 'muted'
  return statusMeta[summary.status].tone
}

async function fetchSidebarSummaries(locations: LocationItem[], mascots: MascotItem[]) {
  const jobs = [
    { key: 'global', endpoint: '/cache/summary?scope=global&focus=overview' },
    ...locations.map((location) => ({
      key: sidebarKey('location', location.id),
      endpoint: `/cache/summary?scope=location&target_id=${location.id}&focus=overview`,
    })),
    ...mascots.map((mascot) => ({
      key: sidebarKey('mascot', mascot.id),
      endpoint: `/cache/summary?scope=mascot&target_id=${mascot.id}&focus=overview`,
    })),
  ]
  const results = await Promise.allSettled(jobs.map((job) => adminApi.get<CacheSummary>(job.endpoint)))
  const summaries: Record<string, SidebarSummary> = {}
  results.forEach((result, index) => {
    if (result.status !== 'fulfilled') return
    summaries[jobs[index].key] = {
      status: result.value.status,
      affected_items: result.value.affected_items,
      total_items: result.value.total_items,
    }
  })
  return summaries
}

function AdminCacheContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const scope = normalizeScope(searchParams.get('scope'))
  const rawFocus = normalizeFocus(searchParams.get('focus'))
  const focus = normalizeFocusForScope(scope, rawFocus)
  const locationId = searchParams.get('target_id') || searchParams.get('locationId')
  const mascotId = searchParams.get('target_id') || searchParams.get('mascotId')
  const targetId = scope === 'location' ? locationId : scope === 'mascot' ? mascotId : null

  const [summary, setSummary] = useState<CacheSummary | null>(null)
  const [jobDetail, setJobDetail] = useState<CacheJobDetail | null>(null)
  const [jobExpanded, setJobExpanded] = useState(true)
  const [locations, setLocations] = useState<LocationItem[]>([])
  const [mascots, setMascots] = useState<MascotItem[]>([])
  const [sidebarSummaries, setSidebarSummaries] = useState<Record<string, SidebarSummary>>({})
  const [sidebarSearch, setSidebarSearch] = useState('')
  const [resourcesLoading, setResourcesLoading] = useState(true)
  const [loading, setLoading] = useState(false)
  const [jobLoading, setJobLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [jobError, setJobError] = useState<string | null>(null)

  const canFetch = scope === 'global' || Boolean(targetId)

  const pushCacheRoute = useCallback((nextScope: CacheScope, nextTargetId: string | null, nextFocus: CacheFocus = 'overview') => {
    const safeFocus = normalizeFocusForScope(nextScope, nextFocus)
    const params = new URLSearchParams({ scope: nextScope, focus: safeFocus })
    if (nextScope !== 'global' && nextTargetId) params.set('target_id', nextTargetId)
    router.push(`/admin/cache?${params.toString()}`)
  }, [router])

  const loadResources = useCallback(async () => {
    setResourcesLoading(true)
    try {
      const [locationData, mascotData] = await Promise.all([
        adminApi.get<{ locations: LocationItem[] }>('/locations'),
        adminApi.get<{ mascots: MascotItem[] }>('/mascots'),
      ])
      setLocations(locationData.locations)
      setMascots(mascotData.mascots)
      const nextSummaries = await fetchSidebarSummaries(locationData.locations, mascotData.mascots)
      setSidebarSummaries(nextSummaries)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không tải được danh sách cache target')
    } finally {
      setResourcesLoading(false)
    }
  }, [])

  useEffect(() => {
    void Promise.resolve().then(loadResources)
  }, [loadResources])

  const loadSummary = useCallback(async () => {
    if (!canFetch) {
      setSummary(null)
      setError(null)
      return
    }

    const params = new URLSearchParams({ scope, focus })
    if (targetId) params.set('target_id', targetId)

    setLoading(true)
    setError(null)
    try {
      const data = await adminApi.get<CacheSummary>(`/cache/summary?${params.toString()}`)
      setSummary(data)
    } catch (err) {
      setSummary(null)
      setError(err instanceof Error ? err.message : 'Không đọc được cache summary')
    } finally {
      setLoading(false)
    }
  }, [canFetch, focus, scope, targetId])

  useEffect(() => {
    void Promise.resolve().then(loadSummary)
  }, [loadSummary])

  useEffect(() => {
    if (!jobDetail || !['queued', 'running'].includes(jobDetail.job.status)) return

    const timer = window.setInterval(async () => {
      try {
        const nextJob = await adminApi.get<CacheJobDetail>(`/cache/jobs/${jobDetail.job.id}`)
        setJobDetail(nextJob)
        if (!['queued', 'running'].includes(nextJob.job.status)) {
          void loadSummary()
          void loadResources()
        }
      } catch (err) {
        setJobError(err instanceof Error ? err.message : 'Không đọc được tiến độ job')
      }
    }, 1800)

    return () => window.clearInterval(timer)
  }, [jobDetail, loadResources, loadSummary])

  const createJob = useCallback(async (dryRun: boolean, force = false) => {
    if (!canFetch || (scope !== 'global' && !targetId)) return
    if (!dryRun) {
      const ok = window.confirm(
        force
          ? 'Tạo lại tất cả sẽ gọi lại RAG/TTS cho cả artifact đang hợp lệ. Tiếp tục?'
          : 'Tạo lại cache sẽ gọi RAG/TTS/R2 cho cache cần cập nhật hoặc chưa có. Tiếp tục?',
      )
      if (!ok) return
    }

    setJobLoading(true)
    setJobError(null)
    try {
      const nextJob = await adminApi.post<CacheJobDetail>('/cache/jobs', {
        scope,
        target_id: targetId,
        focus,
        dry_run: dryRun,
        force,
      })
      setJobDetail(nextJob)
      await loadSummary()
      await loadResources()
    } catch (err) {
      setJobError(err instanceof Error ? err.message : 'Không tạo được cache job')
    } finally {
      setJobLoading(false)
    }
  }, [canFetch, focus, loadResources, loadSummary, scope, targetId])

  const cancelJob = useCallback(async () => {
    if (!jobDetail || !['queued', 'running'].includes(jobDetail.job.status)) return
    setJobLoading(true)
    setJobError(null)
    try {
      const nextJob = await adminApi.post<CacheJobDetail>(`/cache/jobs/${jobDetail.job.id}/cancel`)
      setJobDetail(nextJob)
      await loadSummary()
      await loadResources()
    } catch (err) {
      setJobError(err instanceof Error ? err.message : 'Không hủy được cache job')
    } finally {
      setJobLoading(false)
    }
  }, [jobDetail, loadResources, loadSummary])

  const focusedLabel = useMemo(() => {
    const targetName = typeof summary?.target?.name === 'string' ? summary.target.name : null
    if (scope === 'location') return targetName ?? (targetId ? `Địa điểm ${targetId.slice(0, 8)}` : 'Chưa chọn')
    if (scope === 'mascot') return targetName ?? (targetId ? `Đại sứ ảo ${targetId.slice(0, 8)}` : 'Chưa chọn')
    return 'Toàn hệ thống'
  }, [scope, summary?.target, targetId])

  const counts = useMemo(() => artifactStatusCounts(summary), [summary])
  const meta = statusMeta[summary?.status ?? 'missing']
  const StatusIcon = meta.icon

  const groupedArtifacts = useMemo(() => {
    const groups = new Map<string, CacheSummary['artifacts']>()
    for (const artifact of summary?.artifacts ?? []) {
      const existing = groups.get(artifact.artifact_type) ?? []
      existing.push(artifact)
      groups.set(artifact.artifact_type, existing)
    }
    return Array.from(groups.entries())
  }, [summary?.artifacts])

  const selectScope = useCallback((nextScope: CacheScope) => {
    setSidebarSearch('')
    if (nextScope === 'global') {
      pushCacheRoute('global', null, 'overview')
      return
    }

    const currentTargetId = scope === nextScope ? targetId : null
    const fallbackTargetId = nextScope === 'location' ? locations[0]?.id : mascots[0]?.id
    pushCacheRoute(nextScope, currentTargetId ?? fallbackTargetId ?? null, 'overview')
  }, [locations, mascots, pushCacheRoute, scope, targetId])

  const resourceItems = useMemo(() => {
    const query = sidebarSearch.trim().toLowerCase()
    const matches = (value: string) => value.toLowerCase().includes(query)
    const items: {
      id: string
      title: string
      subtitle?: string
      count?: number
      icon?: typeof Database
      meta?: ReactNode
    }[] = []

    if (scope === 'global' && (!query || matches('toàn hệ thống global'))) {
      const globalSummary = sidebarSummaries.global
      items.push({
        id: 'global',
        title: 'Toàn hệ thống',
        subtitle: 'Tổng quan artifact/job',
        icon: Globe2,
        count: globalSummary?.total_items,
        meta: <AdminStatusPill status={summaryTone(globalSummary)} label={globalSummary ? statusMeta[globalSummary.status].label : 'Chưa tải'} />,
      })
    }

    if (scope === 'location') {
      for (const location of locations) {
        if (query && !matches(`${location.name} ${location.slug}`)) continue
        const itemSummary = sidebarSummaries[sidebarKey('location', location.id)]
        items.push({
          id: sidebarKey('location', location.id),
          title: location.name,
          subtitle: `/${location.slug}`,
          icon: MapPin,
          count: itemSummary?.total_items ?? location.question_count,
          meta: <AdminStatusPill status={summaryTone(itemSummary)} label={itemSummary ? statusMeta[itemSummary.status].label : location.status === 'active' ? 'Đang mở' : 'Tạm đóng'} />,
        })
      }
    }

    if (scope === 'mascot') {
      for (const mascot of mascots) {
        if (query && !matches(`${mascot.name} ${mascot.slug} ${mascot.voice_name}`)) continue
        const itemSummary = sidebarSummaries[sidebarKey('mascot', mascot.id)]
        items.push({
          id: sidebarKey('mascot', mascot.id),
          title: mascot.name,
          subtitle: `${mascot.voice_name}${mascot.voice_style ? ` (${mascot.voice_style})` : ''}`,
          icon: Bot,
          count: itemSummary?.total_items ?? mascot.location_count,
          meta: <AdminStatusPill status={summaryTone(itemSummary)} label={itemSummary ? statusMeta[itemSummary.status].label : mascot.is_default ? 'Mặc định' : 'Mascot'} />,
        })
      }
    }

    return items
  }, [locations, mascots, scope, sidebarSearch, sidebarSummaries])

  const activeResourceId = sidebarKey(scope, targetId)
  const sidebarSearchPlaceholder = scope === 'mascot' ? 'Tìm mascot hoặc voice...' : 'Tìm tên hoặc slug...'
  const canStartJob = Boolean(summary && canFetch && scope !== 'global' && (summary.affected_items > 0 || jobDetail?.job.params.dry_run))
  const canForceJob = Boolean(summary && canFetch && scope !== 'global' && summary.total_items > 0 && summary.affected_items === 0)
  const activeJobRunning = Boolean(jobDetail && ['queued', 'running'].includes(jobDetail.job.status))

  const sidebar = (
    <AdminResourceSidebar
      title="Cache target"
      items={resourceItems}
      activeId={activeResourceId}
      loading={resourcesLoading}
      emptyText="Không có target phù hợp"
      onSelect={(id) => {
        if (id === 'global') {
          pushCacheRoute('global', null, 'overview')
          return
        }
        const [nextScope, nextTargetId] = id.split(':') as [CacheScope, string]
        pushCacheRoute(nextScope, nextTargetId, 'overview')
      }}
      summary={
        <div className="grid gap-3">
          <div className="grid grid-cols-3 gap-1 rounded-xl border border-[#d7e0f0] bg-[#f8fbff] p-1">
            {([
              ['global', 'Hệ thống'],
              ['location', 'Địa điểm'],
              ['mascot', 'Mascot'],
            ] as const).map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => selectScope(value)}
                className={`rounded-lg px-2 py-1.5 text-[0.72rem] font-semibold transition-colors ${
                  scope === value
                    ? 'bg-[#053384] text-white shadow-sm'
                    : 'text-[#52627f] hover:bg-white hover:text-[#10213f]'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          {scope !== 'global' && (
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#7a96c9]" />
              <Input
                value={sidebarSearch}
                onChange={(event) => setSidebarSearch(event.target.value)}
                placeholder={sidebarSearchPlaceholder}
                className="h-9 rounded-xl pl-9 text-sm"
              />
            </div>
          )}
        </div>
      }
    />
  )

  const main = (
    <div className="flex h-full flex-col overflow-hidden rounded-2xl border border-[#d7e0f0]/80 bg-white shadow-sm shadow-[#053384]/[0.03]">
      <div className="shrink-0 border-b border-[#d7e0f0]/70 px-5 py-3">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-xl bg-[#eef3fb] text-[#053384]">
              <Database className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <h2 className="truncate text-base font-bold text-[#10213f]">{focusedLabel}</h2>
              <p className="text-xs text-[#7a96c9]">Phase 2B job runner</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="hidden rounded-xl border border-[#d7e0f0] bg-[#f8fbff] p-1 md:flex">
              {focusOptionsByScope[scope].map((option) => (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => pushCacheRoute(scope, targetId, option.id)}
                  className={`rounded-lg px-2.5 py-1 text-[0.72rem] font-semibold transition-colors ${
                    focus === option.id
                      ? 'bg-[#053384] text-white shadow-sm'
                      : 'text-[#52627f] hover:bg-white hover:text-[#10213f]'
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>

            <Button size="sm" className="rounded-xl" onClick={() => createJob(false)} disabled={jobLoading || activeJobRunning || !canStartJob}>
              <Play data-icon="inline-start" />
              Tạo lại cache
            </Button>

            <DropdownMenu>
              <DropdownMenuTrigger render={
                <Button variant="outline" size="icon" className="rounded-xl" />
              }>
                <MoreHorizontal className="h-4 w-4" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuItem onClick={() => { void loadSummary(); void loadResources() }} disabled={loading || resourcesLoading || !canFetch}>
                  <RefreshCw className="mr-2 h-4 w-4" />
                  Làm mới
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => createJob(true)} disabled={jobLoading || !canFetch}>
                  <ListChecks className="mr-2 h-4 w-4" />
                  Kiểm tra trước
                </DropdownMenuItem>
                {canForceJob && (
                  <DropdownMenuItem onClick={() => createJob(false, true)} disabled={jobLoading || activeJobRunning}>
                    <ShieldAlert className="mr-2 h-4 w-4" />
                    Tạo lại tất cả
                  </DropdownMenuItem>
                )}
                {activeJobRunning && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={cancelJob} disabled={jobLoading} className="text-red-600 focus:text-red-600">
                      <XCircle className="mr-2 h-4 w-4" />
                      Hủy job
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        <div className="mt-2">
          <AdminMetricStrip
            variant="compact"
            metrics={[
              { label: 'Phạm vi', value: scope === 'location' ? 'Địa điểm' : scope === 'mascot' ? 'Đại sứ ảo' : 'Hệ thống' },
              { label: 'Ảnh hưởng', value: summary?.affected_items ?? '-' },
              { label: 'Ước tính', value: summary ? `${summary.estimated_cost.rag_requests} RAG / ${summary.estimated_cost.tts_requests} TTS` : '-' },
            ]}
          />
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="grid gap-4 p-5 2xl:grid-cols-[minmax(0,1fr)_280px]">
          <div className="grid gap-3">
            <div className="grid gap-2 sm:grid-cols-2">
              <div className="rounded-xl border border-[#d7e0f0]/70 bg-[#f8fbff] p-3">
                <p className="text-[0.7rem] font-semibold uppercase tracking-wide text-[#7a96c9]">Fingerprint hiện tại</p>
                <p className="mt-1 font-mono text-xs font-semibold text-[#10213f]">{shortHash(summary?.current_fingerprint ?? null)}</p>
              </div>
              <div className="rounded-xl border border-[#d7e0f0]/70 bg-[#f8fbff] p-3">
                <p className="text-[0.7rem] font-semibold uppercase tracking-wide text-[#7a96c9]">Fingerprint đã cache</p>
                <p className="mt-1 font-mono text-xs font-semibold text-[#10213f]">{shortHash(summary?.cached_fingerprint ?? null)}</p>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div className="flex flex-col rounded-xl border border-emerald-200 bg-emerald-50 p-2 text-center text-emerald-800">
                <p className="flex flex-1 items-center justify-center text-[0.65rem] font-semibold uppercase leading-tight">Hợp lệ</p>
                <p className="mt-1 text-lg font-bold leading-none">{counts.valid}</p>
              </div>
              <div className="flex flex-col rounded-xl border border-amber-200 bg-amber-50 p-2 text-center text-amber-800">
                <p className="flex flex-1 items-center justify-center text-[0.65rem] font-semibold uppercase leading-tight">Cần cập nhật</p>
                <p className="mt-1 text-lg font-bold leading-none">{counts.stale}</p>
              </div>
              <div className="flex flex-col rounded-xl border border-slate-200 bg-slate-50 p-2 text-center text-slate-700">
                <p className="flex flex-1 items-center justify-center text-[0.65rem] font-semibold uppercase leading-tight">Chưa có</p>
                <p className="mt-1 text-lg font-bold leading-none">{counts.missing}</p>
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-[#d7e0f0]/80 bg-white">
            <div className="border-b border-[#d7e0f0]/70 px-4 py-3">
              <h3 className="text-sm font-bold text-[#10213f]">Runtime cache</h3>
            </div>
            <div className="grid gap-3 p-4 text-sm text-[#52627f]">
              <div className="flex items-center justify-between gap-3">
                <span className="inline-flex items-center gap-2"><FileQuestion className="h-4 w-4 text-[#053384]" /> QA entries</span>
                <strong className="text-[#10213f]">{summary?.runtime_cache.qa_cache_entries ?? '-'}</strong>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="inline-flex items-center gap-2"><HardDrive className="h-4 w-4 text-[#053384]" /> TTS keys</span>
                <strong className="text-[#10213f]">{summary?.runtime_cache.tts_key_count ?? '-'}</strong>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="inline-flex items-center gap-2"><ListChecks className="h-4 w-4 text-[#053384]" /> R2 index</span>
                <AdminStatusPill
                  status={summary?.runtime_cache.tts_key_cache_loaded ? 'success' : 'warning'}
                  label={summary?.runtime_cache.tts_key_cache_loaded ? 'Loaded' : 'Fallback'}
                />
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="inline-flex items-center gap-2"><Clock3 className="h-4 w-4 text-[#053384]" /> Loaded at</span>
                <strong className="text-right text-xs text-[#10213f]">{formatDate(summary?.runtime_cache.tts_key_loaded_at ?? null)}</strong>
              </div>
              {summary?.runtime_cache.tts_key_last_error && (
                <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
                  {summary.runtime_cache.tts_key_last_error}
                </p>
              )}
            </div>
          </div>
        </div>

        {jobDetail && (
          <div className="border-t border-[#d7e0f0]/70">
            <button
              type="button"
              onClick={() => setJobExpanded(!jobExpanded)}
              className="flex w-full items-center justify-between gap-3 px-5 py-3 text-left transition-colors hover:bg-[#f6f8fb]"
            >
              <span className="text-sm font-semibold text-[#10213f]">
                Tiến độ · {jobDetail.job.processed_items}/{jobDetail.job.total_items} · {jobDetail.job.failed_items} lỗi
              </span>
              <AdminStatusPill status={jobStatusTone[jobDetail.job.status]} label={jobStatusLabel(jobDetail.job.status)} />
            </button>
            {jobExpanded && (
              <div className="grid gap-4 px-5 pb-5">
                <div className="h-3 overflow-hidden rounded-full bg-[#eef3fb]">
                  <div
                    className="h-full bg-[#053384] transition-all"
                    style={{ width: `${Math.round(jobDetail.progress * 100)}%` }}
                  />
                </div>
                {jobDetail.job.error_message && (
                  <p className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                    {jobDetail.job.error_message}
                  </p>
                )}
                <div className="max-h-56 overflow-y-auto rounded-xl border border-[#d7e0f0]/80">
                  {jobDetail.logs.length === 0 ? (
                    <div className="p-4 text-sm text-[#52627f]">Chưa có log.</div>
                  ) : (
                    <div className="divide-y divide-[#d7e0f0]/60">
                      {jobDetail.logs.map((log) => (
                        <div key={log.id} className="grid gap-1 p-3 text-sm">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <AdminStatusPill
                              status={log.level === 'error' ? 'danger' : log.level === 'warning' ? 'warning' : 'info'}
                              label={logLevelLabels[log.level] ?? log.level}
                            />
                            <span className="text-xs text-[#7a96c9]">{formatDate(log.created_at)}</span>
                          </div>
                          <p className="text-[#10213f]">{log.message}</p>
                          {log.item_key && <p className="font-mono text-[0.68rem] text-[#7a96c9]">{log.item_key}</p>}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        <div className="border-t border-[#d7e0f0]/70 p-5">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-bold text-[#10213f]">Trạng thái artifact</h3>
              <p className="mt-0.5 text-xs text-[#7a96c9]">
                {loading ? 'Đang tải tóm tắt...' : `${summary?.total_items ?? 0} artifact đang được theo dõi`}
              </p>
            </div>
            {summary && <AdminStatusPill status={meta.tone} label={meta.label} />}
          </div>
          <div className="grid gap-4">
            {!summary && !loading ? (
              <div className="rounded-xl border border-[#d7e0f0]/70 bg-[#f8fbff] p-5 text-sm text-[#52627f]">
                Chưa có tóm tắt để hiển thị.
              </div>
            ) : groupedArtifacts.length === 0 ? (
              <div className="rounded-xl border border-[#d7e0f0]/70 bg-[#f8fbff] p-5 text-sm text-[#52627f]">
                Không có artifact trong phạm vi này.
              </div>
            ) : (
              groupedArtifacts.map(([artifactType, artifacts]) => (
                <div key={artifactType} className="rounded-xl border border-[#d7e0f0]/80 bg-white">
                  <div className="flex items-center justify-between gap-3 border-b border-[#d7e0f0]/70 px-4 py-3">
                    <div className="flex items-center gap-2">
                      {artifactType === 'intro_audio' || artifactType === 'location_intro_audio' ? <Mic className="h-4 w-4 text-[#053384]" /> : <Sparkles className="h-4 w-4 text-[#053384]" />}
                      <h3 className="text-sm font-bold text-[#10213f]">{artifactLabels[artifactType] ?? artifactType}</h3>
                    </div>
                    <span className="text-xs font-semibold text-[#7a96c9]">{artifacts.length} mục</span>
                  </div>
                  <div className="divide-y divide-[#d7e0f0]/60">
                    {artifacts.map((artifact) => {
                      const itemStatus = statusMeta[artifact.status]
                      return (
                        <div key={`${artifact.artifact_type}:${artifact.item_key}`} className="grid gap-3 px-4 py-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="truncate text-sm font-semibold text-[#10213f]">{artifact.label}</p>
                              <AdminStatusPill status={itemStatus.tone} label={itemStatus.label} />
                            </div>
                            <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-[0.72rem] text-[#7a96c9]">
                              <span className="font-mono">hiện tại {shortHash(artifact.current_fingerprint)}</span>
                              <span className="font-mono">đã cache {shortHash(artifact.cached_fingerprint)}</span>
                              {artifact.cache_key && <span className="font-mono">key {artifact.cache_key.slice(0, 10)}</span>}
                            </div>
                          </div>
                          <div className="text-left text-[0.72rem] text-[#52627f] md:text-right">
                            <p>{formatDate(artifact.updated_at)}</p>
                            {artifact.storage_url && (
                              <a className="font-semibold text-[#053384] hover:underline" href={artifact.storage_url} target="_blank" rel="noreferrer">
                                Mở artifact
                              </a>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {summary?.dependent_locations.length ? (
          <div className="border-t border-[#d7e0f0]/70 p-5">
            <div className="mb-3">
              <h3 className="text-sm font-bold text-[#10213f]">Địa điểm phụ thuộc</h3>
              <p className="mt-0.5 text-xs text-[#7a96c9]">Đại sứ ảo đang được gán trực tiếp vào các địa điểm này.</p>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              {summary.dependent_locations.map((loc) => (
                <div key={loc.id} className="rounded-xl border border-[#d7e0f0]/80 bg-[#f8fbff] p-3">
                  <p className="truncate text-sm font-semibold text-[#10213f]">{loc.name}</p>
                  <p className="mt-1 text-xs text-[#7a96c9]">{loc.slug} · {loc.question_count} câu hỏi</p>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        <div className="border-t border-[#d7e0f0]/70 p-5">
          <div className="mb-3">
            <h3 className="text-sm font-bold text-[#10213f]">Job gần nhất</h3>
            <p className="mt-0.5 text-xs text-[#7a96c9]">Trạng thái job được lưu trong database và worker cập nhật tiến độ/log.</p>
          </div>
          {summary?.latest_job ? (
            <div className="grid gap-3 rounded-xl border border-[#d7e0f0]/80 bg-[#f8fbff] p-4 text-sm text-[#52627f] md:grid-cols-4">
              <div>
                <p className="text-[0.68rem] font-semibold uppercase tracking-wide text-[#7a96c9]">Job</p>
                <p className="mt-1 font-mono text-xs text-[#10213f]">{summary.latest_job.id.slice(0, 12)}</p>
              </div>
              <div>
                <p className="text-[0.68rem] font-semibold uppercase tracking-wide text-[#7a96c9]">Loại</p>
                <p className="mt-1 font-semibold text-[#10213f]">{jobTypeLabels[summary.latest_job.job_type] ?? summary.latest_job.job_type}</p>
              </div>
              <div>
                <p className="text-[0.68rem] font-semibold uppercase tracking-wide text-[#7a96c9]">Trạng thái</p>
                <p className="mt-1 font-semibold text-[#10213f]">{jobStatusLabel(summary.latest_job.status)}</p>
              </div>
              <div>
                <p className="text-[0.68rem] font-semibold uppercase tracking-wide text-[#7a96c9]">Cập nhật</p>
                <p className="mt-1 font-semibold text-[#10213f]">{formatDate(summary.latest_job.updated_at)}</p>
              </div>
            </div>
          ) : (
            <div className="rounded-xl border border-[#d7e0f0]/70 bg-[#f8fbff] p-5 text-sm text-[#52627f]">
              Chưa có cache job trong phạm vi này.
            </div>
          )}
        </div>
      </div>
    </div>
  )

  return (
    <div className="flex h-[calc(100vh-8rem)] flex-col gap-4">
      <div className="flex shrink-0 items-center justify-between gap-4">
        <h1 className="text-[1.6rem] font-bold tracking-[-0.01em] text-[#10213f]">
          Cache Console
        </h1>
        {summary && (
          <AdminStatusPill
            status={meta.tone}
            label={<><StatusIcon className="mr-1 h-3 w-3" /> {meta.label}</>}
          />
        )}
      </div>

      {!canFetch && (
        <AdminNotice tone="info">
          Chọn địa điểm hoặc đại sứ ảo trong sidebar để xem cache theo mục tiêu.
        </AdminNotice>
      )}

      {error && (
        <AdminNotice tone="danger">
          {error}
        </AdminNotice>
      )}

      {jobError && (
        <AdminNotice tone="danger">
          {jobError}
        </AdminNotice>
      )}

      <AdminWorkbench
        className="min-h-0 flex-1 xl:grid-cols-[300px_minmax(0,1fr)]"
        sidebar={sidebar}
        main={main}
      />
    </div>
  )
}

export default function AdminCachePage() {
  return (
    <Suspense fallback={<div className="flex flex-col gap-6"><div className="h-20 animate-pulse rounded-xl bg-[#eef3fb]" /><div className="h-40 animate-pulse rounded-xl bg-[#eef3fb]" /></div>}>
      <AdminCacheContent />
    </Suspense>
  )
}
