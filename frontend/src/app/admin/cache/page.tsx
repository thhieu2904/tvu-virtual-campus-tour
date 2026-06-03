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
import { cn } from '@/lib/utils'
import {
  Activity,
  AlertTriangle,
  Bot,
  CheckCircle2,
  Database,
  Globe2,
  ListChecks,
  MapPin,
  MoreHorizontal,
  Play,
  RefreshCw,
  Search,
  ShieldAlert,
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

function sidebarKey(scope: CacheScope, targetId?: string | null) {
  return scope === 'global' ? 'global' : `${scope}:${targetId ?? ''}`
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
    } catch (err) {
      setJobError(err instanceof Error ? err.message : 'Không tạo được cache job')
    } finally {
      setJobLoading(false)
    }
  }, [canFetch, focus, loadSummary, scope, targetId])

  const cancelJob = useCallback(async () => {
    if (!jobDetail || !['queued', 'running'].includes(jobDetail.job.status)) return
    setJobLoading(true)
    setJobError(null)
    try {
      const nextJob = await adminApi.post<CacheJobDetail>(`/cache/jobs/${jobDetail.job.id}/cancel`)
      setJobDetail(nextJob)
      await loadSummary()
    } catch (err) {
      setJobError(err instanceof Error ? err.message : 'Không hủy được cache job')
    } finally {
      setJobLoading(false)
    }
  }, [jobDetail, loadSummary])

  const focusedLabel = useMemo(() => {
    const targetName = typeof summary?.target?.name === 'string' ? summary.target.name : null
    if (scope === 'location') return targetName ?? (targetId ? `Địa điểm ${targetId.slice(0, 8)}` : 'Chưa chọn')
    if (scope === 'mascot') return targetName ?? (targetId ? `Đại sứ ảo ${targetId.slice(0, 8)}` : 'Chưa chọn')
    return 'Toàn hệ thống'
  }, [scope, summary?.target, targetId])

  const meta = statusMeta[summary?.status ?? 'missing']
  const StatusIcon = meta.icon

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
      items.push({
        id: 'global',
        title: 'Toàn hệ thống',
        subtitle: 'Tổng quan artifact/job',
        icon: Globe2,
      })
    }

    if (scope === 'location') {
      for (const location of locations) {
        if (query && !matches(`${location.name} ${location.slug}`)) continue
        items.push({
          id: sidebarKey('location', location.id),
          title: location.name,
          subtitle: `/${location.slug}`,
          icon: MapPin,
          count: location.question_count,
          meta: (
            <span className="text-xs text-[#7a96c9]">
              {location.status === 'active' ? 'Đang mở' : 'Tạm đóng'} · {location.question_count ?? 0} câu hỏi
            </span>
          ),
        })
      }
    }

    if (scope === 'mascot') {
      for (const mascot of mascots) {
        if (query && !matches(`${mascot.name} ${mascot.slug} ${mascot.voice_name}`)) continue
        items.push({
          id: sidebarKey('mascot', mascot.id),
          title: mascot.name,
          subtitle: `${mascot.voice_name}${mascot.voice_style ? ` (${mascot.voice_style})` : ''}`,
          icon: Bot,
          count: mascot.location_count,
          meta: (
            <span className="text-xs text-[#7a96c9]">
              {mascot.is_default ? 'Mặc định' : 'Mascot'} · {mascot.location_count} địa điểm
            </span>
          ),
        })
      }
    }

    return items
  }, [locations, mascots, scope, sidebarSearch])

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
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <h2 className="truncate text-base font-bold text-[#10213f]">{focusedLabel}</h2>
                {summary && <AdminStatusPill status={meta.tone} label={meta.label} />}
              </div>
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

      <div className="min-h-0 flex-1 overflow-y-auto divide-y divide-[#d7e0f0]/50">
        <div className="p-5">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-4 text-center">
              <p className="text-xs font-semibold uppercase text-emerald-600">Hợp lệ</p>
              <p className="mt-1 text-2xl font-bold text-emerald-700">
                {summary ? Math.max(summary.total_items - summary.affected_items, 0) : '-'}
              </p>
            </div>
            <div
              className={cn(
                'rounded-xl border p-4 text-center',
                summary && summary.affected_items > 0
                  ? 'border-amber-300 bg-amber-50/50'
                  : 'border-[#d7e0f0] bg-[#f6f8fb]',
              )}
            >
              <p className="text-xs font-semibold uppercase text-amber-600">Cần cập nhật</p>
              <p className="mt-1 text-2xl font-bold text-amber-700">
                {summary?.affected_items ?? '-'}
              </p>
            </div>
            <div className="rounded-xl border border-[#d7e0f0] bg-[#f6f8fb] p-4 text-center">
              <p className="text-xs font-semibold uppercase text-[#52627f]">Runtime</p>
              <p className="mt-1 text-2xl font-bold text-[#10213f]">
                {summary?.runtime_cache.qa_cache_entries ?? '-'} QA
              </p>
              <p className="mt-0.5 text-xs text-[#7a96c9]">
                {summary?.runtime_cache.tts_key_count ?? '-'} TTS keys
              </p>
            </div>
          </div>
        </div>

        {jobDetail && (
          <div className="p-5">
            <button
              type="button"
              onClick={() => setJobExpanded(!jobExpanded)}
              className="flex w-full items-center justify-between gap-3 rounded-xl border border-[#d7e0f0]/80 bg-[#f8fbff] px-4 py-3 text-left transition-colors hover:bg-[#f6f8fb]"
            >
              <span className="text-sm font-semibold text-[#10213f]">
                Tiến độ · {jobDetail.job.processed_items}/{jobDetail.job.total_items} · {jobDetail.job.failed_items} lỗi
              </span>
              <AdminStatusPill status={jobStatusTone[jobDetail.job.status]} label={jobStatusLabel(jobDetail.job.status)} />
            </button>
            {jobExpanded && (
              <div className="mt-4 grid gap-4">
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

        <div className="p-5">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <h3 className="text-sm font-bold text-[#10213f]">
              Chi tiết artifact · {summary?.artifacts.length ?? 0} items
            </h3>
            {summary && <AdminStatusPill status={meta.tone} label={meta.label} />}
          </div>
          {!summary && !loading ? (
            <div className="rounded-xl border border-[#d7e0f0]/70 bg-[#f8fbff] p-5 text-sm text-[#52627f]">
              Chưa có tóm tắt để hiển thị.
            </div>
          ) : !summary?.artifacts.length ? (
            <div className="rounded-xl border border-[#d7e0f0]/70 bg-[#f8fbff] p-5 text-sm text-[#52627f]">
              Không có artifact trong phạm vi này.
            </div>
          ) : (
            <div className="overflow-hidden rounded-xl border border-[#d7e0f0]/80">
              <table className="w-full text-sm">
                <thead className="bg-[#f6f8fb] text-left text-xs font-semibold text-[#52627f]">
                  <tr>
                    <th className="px-3 py-2">Artifact</th>
                    <th className="px-3 py-2">Trạng thái</th>
                    <th className="px-3 py-2 text-right">Cập nhật</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#d7e0f0]/50">
                  {summary.artifacts.map((artifact) => {
                    const itemStatus = statusMeta[artifact.status]
                    return (
                      <tr key={`${artifact.artifact_type}-${artifact.item_key}`}>
                        <td className="px-3 py-2">
                          <p className="font-medium text-[#10213f]">{artifact.label}</p>
                          <p className="text-xs text-[#7a96c9]">{artifactLabels[artifact.artifact_type] ?? artifact.artifact_type}</p>
                        </td>
                        <td className="px-3 py-2">
                          <AdminStatusPill status={itemStatus.tone} label={itemStatus.label} />
                        </td>
                        <td className="px-3 py-2 text-right text-xs text-[#7a96c9]">
                          {formatDate(artifact.updated_at)}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
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
