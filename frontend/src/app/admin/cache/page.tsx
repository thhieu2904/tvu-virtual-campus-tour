'use client'

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import {
  AdminMetricStrip,
  AdminNotice,
  AdminPageHeader,
  AdminPanel,
  AdminStatusPill,
} from '../_components/admin-ui'
import { Button } from '@/components/ui/button'
import { adminApi } from '@/lib/admin-api'
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Clock3,
  Database,
  FileQuestion,
  HardDrive,
  ListChecks,
  Mic,
  Play,
  RefreshCw,
  ShieldAlert,
  Sparkles,
  XCircle,
} from 'lucide-react'

type CacheScope = 'location' | 'mascot' | 'global'
type CacheFocus = 'voice' | 'questions' | 'prompt' | 'all' | 'overview'
type CacheStatus = 'valid' | 'stale' | 'missing' | 'running' | 'failed'
type ArtifactStatus = 'valid' | 'stale' | 'missing'
type CacheJobStatus = 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled'

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
  valid: { label: 'Valid', tone: 'success', icon: CheckCircle2 },
  stale: { label: 'Stale', tone: 'warning', icon: AlertTriangle },
  missing: { label: 'Missing', tone: 'warning', icon: ShieldAlert },
  running: { label: 'Running', tone: 'info', icon: Activity },
  failed: { label: 'Failed', tone: 'danger', icon: XCircle },
}

const artifactLabels: Record<string, string> = {
  intro_audio: 'Intro audio',
  location_intro_audio: 'Location intro/revisit audio',
  qa_answer: 'QA answer',
  qa_audio: 'QA audio',
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

function formatDate(value: string | null) {
  if (!value) return 'Chua co'
  return new Intl.DateTimeFormat('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))
}

function shortHash(value: string | null) {
  return value ? value.slice(0, 12) : 'None'
}

function artifactStatusCounts(summary: CacheSummary | null) {
  const counts = { valid: 0, stale: 0, missing: 0 }
  for (const item of summary?.artifacts ?? []) {
    counts[item.status] += 1
  }
  return counts
}

function AdminCacheContent() {
  const searchParams = useSearchParams()
  const scope = normalizeScope(searchParams.get('scope'))
  const focus = normalizeFocus(searchParams.get('focus'))
  const locationId = searchParams.get('locationId') || searchParams.get('target_id')
  const mascotId = searchParams.get('mascotId') || searchParams.get('target_id')
  const targetId = scope === 'location' ? locationId : scope === 'mascot' ? mascotId : null

  const [summary, setSummary] = useState<CacheSummary | null>(null)
  const [jobDetail, setJobDetail] = useState<CacheJobDetail | null>(null)
  const [loading, setLoading] = useState(false)
  const [jobLoading, setJobLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [jobError, setJobError] = useState<string | null>(null)

  const canFetch = scope === 'global' || Boolean(targetId)

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
      setError(err instanceof Error ? err.message : 'Khong doc duoc cache summary')
    } finally {
      setLoading(false)
    }
  }, [canFetch, focus, scope, targetId])

  useEffect(() => {
    void loadSummary()
  }, [loadSummary])

  useEffect(() => {
    if (!jobDetail || !['queued', 'running'].includes(jobDetail.job.status)) return

    const timer = window.setInterval(async () => {
      try {
        const nextJob = await adminApi.get<CacheJobDetail>(`/cache/jobs/${jobDetail.job.id}`)
        setJobDetail(nextJob)
        if (!['queued', 'running'].includes(nextJob.job.status)) {
          void loadSummary()
        }
      } catch (err) {
        setJobError(err instanceof Error ? err.message : 'Khong doc duoc job progress')
      }
    }, 1800)

    return () => window.clearInterval(timer)
  }, [jobDetail, loadSummary])

  const createJob = useCallback(async (dryRun: boolean, force = false) => {
    if (!canFetch || (scope !== 'global' && !targetId)) return
    if (!dryRun) {
      const ok = window.confirm(
        force
          ? 'Force rebuild se goi lai RAG/TTS cho ca artifact dang valid. Tiep tuc?'
          : 'Start rebuild se goi RAG/TTS/R2 cho cache stale hoặc missing. Tiep tuc?',
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
      setJobError(err instanceof Error ? err.message : 'Khong tao duoc cache job')
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
      setJobError(err instanceof Error ? err.message : 'Khong cancel duoc cache job')
    } finally {
      setJobLoading(false)
    }
  }, [jobDetail, loadSummary])

  const focusedLabel = useMemo(() => {
    const targetName = typeof summary?.target?.name === 'string' ? summary.target.name : null
    if (scope === 'location') return targetName ?? (targetId ? `Location ${targetId.slice(0, 8)}` : 'Chua chon')
    if (scope === 'mascot') return targetName ?? (targetId ? `Mascot ${targetId.slice(0, 8)}` : 'Chua chon')
    return 'Toan he thong'
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

  const canStartJob = Boolean(summary && canFetch && scope !== 'global' && (summary.affected_items > 0 || jobDetail?.job.params.dry_run))
  const canForceJob = Boolean(summary && canFetch && scope !== 'global' && summary.total_items > 0 && summary.affected_items === 0)
  const activeJobRunning = Boolean(jobDetail && ['queued', 'running'].includes(jobDetail.job.status))

  return (
    <div className="flex flex-col gap-6">
      <AdminPageHeader
        title="Cache Console"
        description="Theo doi fingerprint, stale state va runtime cache cho intro audio va suggested QA."
        meta={summary && <AdminStatusPill status={meta.tone} label={<><StatusIcon className="mr-1 h-3 w-3" /> {meta.label}</>} />}
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" className="rounded-xl" onClick={loadSummary} disabled={loading || !canFetch}>
              <RefreshCw data-icon="inline-start" className={loading ? 'animate-spin' : ''} />
              Refresh
            </Button>
            <Button variant="outline" size="sm" className="rounded-xl" onClick={() => createJob(true)} disabled={jobLoading || !canFetch}>
              <ListChecks data-icon="inline-start" />
              Dry-run
            </Button>
            <Button size="sm" className="rounded-xl" onClick={() => createJob(false)} disabled={jobLoading || activeJobRunning || !canStartJob}>
              <Play data-icon="inline-start" />
              Start rebuild
            </Button>
            {canForceJob && (
              <Button variant="outline" size="sm" className="rounded-xl" onClick={() => createJob(false, true)} disabled={jobLoading || activeJobRunning}>
                <ShieldAlert data-icon="inline-start" />
                Force
              </Button>
            )}
            {activeJobRunning && (
              <Button variant="outline" size="sm" className="rounded-xl" onClick={cancelJob} disabled={jobLoading}>
                <XCircle data-icon="inline-start" />
                Cancel
              </Button>
            )}
          </div>
        }
      />

      {!canFetch && (
        <AdminNotice tone="info">
          Chon location hoac mascot tu trang admin de xem cache theo target.
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

      <AdminMetricStrip
        metrics={[
          { label: 'Scope', value: scope === 'location' ? 'Location' : scope === 'mascot' ? 'Mascot' : 'Global', color: '#053384' },
          { label: 'Focus', value: focus, color: '#52627f' },
          { label: 'Affected', value: summary ? summary.affected_items : '-', color: summary?.affected_items ? '#b8891f' : '#2c8b57' },
          { label: 'Estimate', value: summary ? `${summary.estimated_cost.rag_requests} RAG / ${summary.estimated_cost.tts_requests} TTS` : '-', color: '#7a3f98' },
        ]}
      />

      <div className="grid gap-5 xl:grid-cols-[300px_minmax(0,1fr)]">
        <aside className="xl:sticky xl:top-20 xl:self-start">
          <AdminPanel>
            <div className="p-4">
              <div className="flex items-center gap-3">
                <div className="flex size-10 items-center justify-center rounded-xl bg-[#eef3fb] text-[#053384]">
                  <Database className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <h2 className="truncate text-base font-bold text-[#10213f]">{focusedLabel}</h2>
                  <p className="text-xs text-[#7a96c9]">Phase 2B job runner</p>
                </div>
              </div>

              <div className="mt-4 grid gap-2 text-sm text-[#52627f]">
                <div className="rounded-xl border border-[#d7e0f0]/70 bg-[#f8fbff] p-3">
                  <p className="text-[0.7rem] font-semibold uppercase tracking-wide text-[#7a96c9]">Current fingerprint</p>
                  <p className="mt-1 font-mono text-xs font-semibold text-[#10213f]">{shortHash(summary?.current_fingerprint ?? null)}</p>
                </div>
                <div className="rounded-xl border border-[#d7e0f0]/70 bg-[#f8fbff] p-3">
                  <p className="text-[0.7rem] font-semibold uppercase tracking-wide text-[#7a96c9]">Cached fingerprint</p>
                  <p className="mt-1 font-mono text-xs font-semibold text-[#10213f]">{shortHash(summary?.cached_fingerprint ?? null)}</p>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-2 text-center text-emerald-800">
                    <p className="text-[0.65rem] font-semibold uppercase">Valid</p>
                    <p className="text-lg font-bold">{counts.valid}</p>
                  </div>
                  <div className="rounded-xl border border-amber-200 bg-amber-50 p-2 text-center text-amber-800">
                    <p className="text-[0.65rem] font-semibold uppercase">Stale</p>
                    <p className="text-lg font-bold">{counts.stale}</p>
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-2 text-center text-slate-700">
                    <p className="text-[0.65rem] font-semibold uppercase">Missing</p>
                    <p className="text-lg font-bold">{counts.missing}</p>
                  </div>
                </div>
              </div>
            </div>
          </AdminPanel>

          <AdminPanel title="Runtime cache" className="mt-5">
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
          </AdminPanel>
        </aside>

        <main className="grid gap-5">
          {jobDetail && (
            <AdminPanel
              title="Job progress"
              description={`${jobDetail.job.processed_items}/${jobDetail.job.total_items} processed · ${jobDetail.job.failed_items} failed`}
              action={<AdminStatusPill status={jobStatusTone[jobDetail.job.status]} label={jobDetail.job.status} />}
            >
              <div className="grid gap-4 p-5">
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
                    <div className="p-4 text-sm text-[#52627f]">Chua co log.</div>
                  ) : (
                    <div className="divide-y divide-[#d7e0f0]/60">
                      {jobDetail.logs.map((log) => (
                        <div key={log.id} className="grid gap-1 p-3 text-sm">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <AdminStatusPill
                              status={log.level === 'error' ? 'danger' : log.level === 'warning' ? 'warning' : 'info'}
                              label={log.level}
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
            </AdminPanel>
          )}

          <AdminPanel
            title="Artifact status"
            description={loading ? 'Dang tai summary...' : `${summary?.total_items ?? 0} artifact dang duoc theo doi`}
            action={summary && <AdminStatusPill status={meta.tone} label={meta.label} />}
          >
            <div className="grid gap-4 p-5">
              {!summary && !loading ? (
                <div className="rounded-xl border border-[#d7e0f0]/70 bg-[#f8fbff] p-5 text-sm text-[#52627f]">
                  Chua co summary de hien thi.
                </div>
              ) : groupedArtifacts.length === 0 ? (
                <div className="rounded-xl border border-[#d7e0f0]/70 bg-[#f8fbff] p-5 text-sm text-[#52627f]">
                  Khong co artifact item trong pham vi nay.
                </div>
              ) : (
                groupedArtifacts.map(([artifactType, artifacts]) => (
                  <div key={artifactType} className="rounded-xl border border-[#d7e0f0]/80 bg-white">
                    <div className="flex items-center justify-between gap-3 border-b border-[#d7e0f0]/70 px-4 py-3">
                      <div className="flex items-center gap-2">
                        {artifactType === 'intro_audio' || artifactType === 'location_intro_audio' ? <Mic className="h-4 w-4 text-[#053384]" /> : <Sparkles className="h-4 w-4 text-[#053384]" />}
                        <h3 className="text-sm font-bold text-[#10213f]">{artifactLabels[artifactType] ?? artifactType}</h3>
                      </div>
                      <span className="text-xs font-semibold text-[#7a96c9]">{artifacts.length} items</span>
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
                                <span className="font-mono">current {shortHash(artifact.current_fingerprint)}</span>
                                <span className="font-mono">cached {shortHash(artifact.cached_fingerprint)}</span>
                                {artifact.cache_key && <span className="font-mono">key {artifact.cache_key.slice(0, 10)}</span>}
                              </div>
                            </div>
                            <div className="text-left text-[0.72rem] text-[#52627f] md:text-right">
                              <p>{formatDate(artifact.updated_at)}</p>
                              {artifact.storage_url && (
                                <a className="font-semibold text-[#053384] hover:underline" href={artifact.storage_url} target="_blank" rel="noreferrer">
                                  Open artifact
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
          </AdminPanel>

          {summary?.dependent_locations.length ? (
            <AdminPanel title="Dependent locations" description="Mascot dang duoc gan truc tiep vao cac location nay.">
              <div className="grid gap-3 p-5 md:grid-cols-2">
                {summary.dependent_locations.map((loc) => (
                  <div key={loc.id} className="rounded-xl border border-[#d7e0f0]/80 bg-[#f8fbff] p-3">
                    <p className="truncate text-sm font-semibold text-[#10213f]">{loc.name}</p>
                    <p className="mt-1 text-xs text-[#7a96c9]">{loc.slug} · {loc.question_count} questions</p>
                  </div>
                ))}
              </div>
            </AdminPanel>
          ) : null}

          <AdminPanel title="Latest job" description="Job state duoc luu trong database va worker cap nhat progress/log.">
            <div className="p-5">
              {summary?.latest_job ? (
                <div className="grid gap-3 rounded-xl border border-[#d7e0f0]/80 bg-[#f8fbff] p-4 text-sm text-[#52627f] md:grid-cols-4">
                  <div>
                    <p className="text-[0.68rem] font-semibold uppercase tracking-wide text-[#7a96c9]">Job</p>
                    <p className="mt-1 font-mono text-xs text-[#10213f]">{summary.latest_job.id.slice(0, 12)}</p>
                  </div>
                  <div>
                    <p className="text-[0.68rem] font-semibold uppercase tracking-wide text-[#7a96c9]">Type</p>
                    <p className="mt-1 font-semibold text-[#10213f]">{summary.latest_job.job_type}</p>
                  </div>
                  <div>
                    <p className="text-[0.68rem] font-semibold uppercase tracking-wide text-[#7a96c9]">Status</p>
                    <p className="mt-1 font-semibold text-[#10213f]">{summary.latest_job.status}</p>
                  </div>
                  <div>
                    <p className="text-[0.68rem] font-semibold uppercase tracking-wide text-[#7a96c9]">Updated</p>
                    <p className="mt-1 font-semibold text-[#10213f]">{formatDate(summary.latest_job.updated_at)}</p>
                  </div>
                </div>
              ) : (
                <div className="rounded-xl border border-[#d7e0f0]/70 bg-[#f8fbff] p-5 text-sm text-[#52627f]">
                  Chua co cache job cho pham vi nay.
                </div>
              )}
            </div>
          </AdminPanel>
        </main>
      </div>
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
