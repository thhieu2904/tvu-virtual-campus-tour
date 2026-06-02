'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { adminApi } from '@/lib/admin-api'
import {
  AdminEmptyState,
  AdminPageHeader,
  AdminPanel,
  AdminSkeleton,
  AdminStatCard,
  AdminMetricStrip,
} from './_components/admin-ui'
import {
  Bot,
  FileText,
  Image as ImageIcon,
  MapPin,
  MessageSquare,
  RefreshCw,
  BarChart3,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  PieChart,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'

type StatsPeriod = 'week' | 'month'

interface DashboardStats {
  locations: { total: number; active: number }
  documents: { total: number; ready: number }
  media: { total: number }
  mascots: { total: number }
  total_sessions: number
  engaged_sessions: number
  started_sessions: number
  empty_sessions: number
  total_messages: number
  user_messages: number
  avg_response_time_ms: number
  stats_period: { period: StatsPeriod; start: string; end: string; cursor: string }
  latest_engaged_session_date: string | null
  sessions_by_day: { date: string; count: number }[]
  top_questions: { question: string; count: number }[]
  popular_locations: { name: string; visit_count: number }[]
  documents_by_category: { category_name: string; color: string; count: number }[]
}

function addDays(date: Date, days: number) {
  const next = new Date(date)
  next.setDate(next.getDate() + days)
  return next
}

function addMonths(date: Date, months: number) {
  const next = new Date(date)
  next.setMonth(next.getMonth() + months)
  return next
}

function toIsoDate(date: Date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function formatShortDate(value: string) {
  return new Date(value).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' })
}

function formatRange(stats: DashboardStats | null) {
  if (!stats) return 'Đang tải'
  const start = new Date(stats.stats_period.start).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' })
  const end = new Date(stats.stats_period.end).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' })
  return `${start} - ${end}`
}

function SessionsBarChart({ data }: { data: DashboardStats['sessions_by_day'] }) {
  const total = data.reduce((sum, item) => sum + item.count, 0)
  const max = Math.max(...data.map((item) => item.count), 1)

  if (data.length === 0 || total === 0) {
    return (
      <div className="flex min-h-[280px] items-center justify-center px-5 py-8">
        <AdminEmptyState
          icon={BarChart3}
          title="Kỳ này chưa có phiên có hỏi"
          description="Dùng nút lui kỳ hoặc chọn Tháng để xem dữ liệu cũ hơn."
        />
      </div>
    )
  }

  return (
    <div className="px-5 pb-5 pt-4">
      <div className="mb-4 flex items-center justify-between rounded-xl border border-[#d7e0f0]/70 bg-[#f8fbff] px-4 py-3">
        <span className="text-xs font-semibold uppercase tracking-wide text-[#7a96c9]">Tổng trong kỳ</span>
        <span className="text-lg font-bold tabular-nums text-[#053384]">{total} phiên</span>
      </div>
      <div className="grid min-h-[260px] grid-cols-[36px_minmax(0,1fr)] gap-3">
        <div className="flex flex-col justify-between pb-8 text-right text-[0.7rem] font-semibold text-[#7a96c9]">
          <span>{max}</span>
          <span>{Math.ceil(max / 2)}</span>
          <span>0</span>
        </div>
        <div className="relative">
          <div className="absolute inset-x-0 top-0 h-px bg-[#e5ecf6]" />
          <div className="absolute inset-x-0 top-1/2 h-px bg-[#e5ecf6]" />
          <div className="absolute inset-x-0 bottom-8 h-px bg-[#d7e0f0]" />
          <div className="relative flex h-full items-end gap-1.5 pb-8 md:gap-2.5">
            {data.map((day) => {
              const height = Math.max((day.count / max) * 100, 10)
              return (
                <div key={day.date} className="group flex min-w-0 flex-1 flex-col items-center gap-2">
                  <div className="pointer-events-none rounded-lg bg-[#10213f] px-2 py-1 text-[0.68rem] font-semibold text-white opacity-0 shadow-md transition-opacity group-hover:opacity-100">
                    {day.count} phiên
                  </div>
                  <div className="flex h-[190px] w-full items-end justify-center">
                    <div
                      className={`w-full max-w-[42px] rounded-t-xl transition-all duration-300 ${
                        day.count > 0
                          ? 'bg-gradient-to-t from-[#053384] to-[#5b8bed] shadow-sm shadow-[#053384]/20'
                          : 'bg-[#dce6f5]'
                      }`}
                      style={{ height: day.count > 0 ? `${height}%` : '8px' }}
                    />
                  </div>
                  <span className="w-full truncate text-center text-[0.66rem] font-medium text-[#52627f]">
                    {formatShortDate(day.date)}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}

function CategoryDonut({ data }: { data: DashboardStats['documents_by_category'] }) {
  const total = data.reduce((sum, item) => sum + item.count, 0)
  const radius = 44
  const circumference = 2 * Math.PI * radius
  const segments = data.reduce<{
    offset: number
    items: {
      categoryName: string
      color: string
      strokeDasharray: string
      strokeDashoffset: number
    }[]
  }>(
    (acc, item) => {
      const length = total > 0 ? (item.count / total) * circumference : 0
      return {
        offset: acc.offset + length,
        items: [
          ...acc.items,
          {
            categoryName: item.category_name,
            color: item.color,
            strokeDasharray: `${length} ${circumference - length}`,
            strokeDashoffset: -acc.offset,
          },
        ],
      }
    },
    { offset: 0, items: [] },
  ).items

  if (total === 0) {
    return (
      <AdminEmptyState
        icon={FileText}
        title="Chưa có danh mục"
        description="Tạo danh mục học liệu để bắt đầu phân loại tài liệu."
      />
    )
  }

  return (
    <div className="grid gap-5 p-5 md:grid-cols-[180px_minmax(0,1fr)] md:items-center">
      <div className="relative mx-auto size-44">
        <svg viewBox="0 0 120 120" className="size-full -rotate-90">
          <circle cx="60" cy="60" r={radius} fill="none" stroke="#eef3fb" strokeWidth="16" />
          {segments.map((item) => {
            return (
              <circle
                key={item.categoryName}
                cx="60"
                cy="60"
                r={radius}
                fill="none"
                stroke={item.color}
                strokeWidth="16"
                strokeDasharray={item.strokeDasharray}
                strokeDashoffset={item.strokeDashoffset}
              />
            )
          })}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
          <span className="text-2xl font-bold text-[#10213f]">{total}</span>
          <span className="text-[0.68rem] font-semibold uppercase tracking-wide text-[#7a96c9]">học liệu</span>
        </div>
      </div>

      <div className="grid gap-3">
        {data.map((item) => {
          const percent = Math.round((item.count / total) * 100)
          return (
            <div key={item.category_name} className="flex items-center justify-between gap-3 rounded-xl border border-[#d7e0f0]/70 bg-[#f8fbff] px-3 py-2.5">
              <div className="flex min-w-0 items-center gap-2">
                <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: item.color }} />
                <span className="truncate text-sm font-semibold text-[#10213f]">{item.category_name}</span>
              </div>
              <span className="shrink-0 text-sm font-bold tabular-nums text-[#52627f]">
                {item.count} <span className="font-medium text-[#7a96c9]">({percent}%)</span>
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default function AdminDashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [period, setPeriod] = useState<StatsPeriod>('week')
  const [cursor, setCursor] = useState(() => toIsoDate(new Date()))
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [autoCursorAdjusted, setAutoCursorAdjusted] = useState(false)

  const fetchStats = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams({ period, cursor })
      setStats(await adminApi.get<DashboardStats>(`/stats?${params.toString()}`))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không thể tải thống kê')
    } finally {
      setLoading(false)
    }
  }, [cursor, period])

  useEffect(() => {
    void Promise.resolve().then(fetchStats)
  }, [fetchStats])

  const chartData = stats?.sessions_by_day ?? []
  const chartTotal = chartData.reduce((sum, item) => sum + item.count, 0)
  const currentCursor = useMemo(() => new Date(cursor), [cursor])
  const periodLabel = period === 'week' ? 'Tuần' : 'Tháng'

  useEffect(() => {
    if (!stats || autoCursorAdjusted || chartTotal > 0 || !stats.latest_engaged_session_date) return
    if (stats.engaged_sessions > 0 && stats.latest_engaged_session_date !== cursor) {
      setAutoCursorAdjusted(true)
      setCursor(stats.latest_engaged_session_date)
    }
  }, [autoCursorAdjusted, chartTotal, cursor, stats])

  const shiftRange = (direction: -1 | 1) => {
    const next = period === 'week'
      ? addDays(currentCursor, direction * 7)
      : addMonths(currentCursor, direction)
    setCursor(toIsoDate(next))
  }

  const setToday = () => setCursor(toIsoDate(new Date()))

  return (
    <div className="flex flex-col gap-6">
      <AdminPageHeader
        title="Tổng quan vận hành"
        description="Theo dõi dữ liệu thật của kiosk: chỉ tính phiên tham quan khi người dùng đã đặt ít nhất một câu hỏi."
        actions={
          <Button variant="outline" size="sm" onClick={fetchStats} disabled={loading} className="rounded-xl">
            <RefreshCw data-icon="inline-start" className={loading ? 'animate-spin' : ''} />
            Làm mới
          </Button>
        }
      />

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
          {error}
        </div>
      )}

      <AdminPanel
        title="Nhịp vận hành kiosk"
        description="Các chỉ số này ưu tiên phiên có câu hỏi thật, không tính lượt mở màn hình chưa tương tác."
      >
        <div className="p-5">
          <AdminMetricStrip
            metrics={[
              { label: 'Phiên có hỏi', value: stats?.engaged_sessions ?? 0, color: '#053384' },
              { label: 'Lượt bắt đầu', value: stats?.started_sessions ?? 0, color: '#52627f' },
              { label: 'Tin nhắn người dùng', value: stats?.user_messages ?? 0, color: '#2c8b57' },
              { label: 'Phản hồi TB', value: `${stats?.avg_response_time_ms ?? 0} ms`, color: '#b8891f' },
            ]}
          />
          <div className="mt-4 rounded-xl border border-[#d7e0f0]/70 bg-[#f8fbff] px-4 py-3 text-sm text-[#52627f]">
            <span className="font-semibold text-[#10213f]">{stats?.empty_sessions ?? 0}</span> lượt bắt đầu rỗng đang được loại khỏi analytics chính.
          </div>
        </div>
      </AdminPanel>

      {loading && !stats ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <AdminSkeleton key={i} variant="card" className="h-28" />
          ))}
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <AdminStatCard
            icon={MapPin}
            title="Địa điểm đang mở"
            value={`${stats?.locations.active ?? 0}/${stats?.locations.total ?? 0}`}
            color="#053384"
          />
          <AdminStatCard
            icon={FileText}
            title="Học liệu sẵn sàng"
            value={`${stats?.documents.ready ?? 0}/${stats?.documents.total ?? 0}`}
            color="#2c8b57"
          />
          <AdminStatCard
            icon={ImageIcon}
            title="Tư liệu media"
            value={stats?.media.total ?? 0}
            color="#b8891f"
          />
          <AdminStatCard
            icon={Bot}
            title="Đại sứ ảo"
            value={stats?.mascots.total ?? 0}
            color="#6f7f9c"
          />
        </div>
      )}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.25fr)_minmax(360px,0.75fr)]">
        <AdminPanel
          title="Phiên có hỏi theo thời gian"
          description={`${periodLabel} đang xem: ${formatRange(stats)}`}
          action={
            <div className="flex flex-wrap items-center gap-2">
              <div className="inline-flex rounded-xl border border-[#d7e0f0] bg-white p-1">
                {(['week', 'month'] as const).map((item) => (
                  <button
                    key={item}
                    type="button"
                    onClick={() => setPeriod(item)}
                    className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                      period === item ? 'bg-[#053384] text-white' : 'text-[#52627f] hover:bg-[#eef3fb]'
                    }`}
                  >
                    {item === 'week' ? 'Tuần' : 'Tháng'}
                  </button>
                ))}
              </div>
              <Button variant="outline" size="icon" onClick={() => shiftRange(-1)} className="size-8 rounded-xl">
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button variant="outline" size="sm" onClick={setToday} className="h-8 rounded-xl">
                <CalendarDays className="mr-1.5 h-4 w-4" />
                Hôm nay
              </Button>
              <Button variant="outline" size="icon" onClick={() => shiftRange(1)} className="size-8 rounded-xl">
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          }
        >
          <SessionsBarChart data={chartData} />
        </AdminPanel>

        <AdminPanel
          title="Cơ cấu học liệu"
          description="Tỷ trọng tài liệu theo nhóm nội dung phục vụ RAG."
          action={<PieChart className="h-5 w-5 text-[#7a96c9]" />}
        >
          <CategoryDonut data={stats?.documents_by_category ?? []} />
        </AdminPanel>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <AdminPanel
          title="Câu hỏi thường gặp"
          description="Top câu hỏi người dùng đã gửi tới đại sứ ảo."
          action={<MessageSquare className="h-5 w-5 text-[#7a96c9]" />}
        >
          {(stats?.top_questions ?? []).length > 0 ? (
            <div className="divide-y divide-[#d7e0f0]/70">
              {(stats?.top_questions ?? []).slice(0, 6).map((item, idx) => (
                <div key={item.question} className="flex items-center gap-3 px-5 py-3.5 text-sm transition-colors hover:bg-[#f6f8fb]">
                  <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-[#eef3fb] text-xs font-bold text-[#053384]">
                    {idx + 1}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[#10213f]">{item.question}</span>
                  <Badge variant="outline" className="shrink-0">{item.count}</Badge>
                </div>
              ))}
            </div>
          ) : (
            <AdminEmptyState
              icon={MessageSquare}
              title="Chưa có câu hỏi nào"
              description="Câu hỏi sẽ xuất hiện khi người dùng tương tác với đại sứ ảo."
            />
          )}
        </AdminPanel>

        <AdminPanel
          title="Địa điểm được hỏi nhiều"
          description="Các địa điểm có nhiều câu hỏi người dùng nhất."
          action={<MapPin className="h-5 w-5 text-[#7a96c9]" />}
        >
          {(stats?.popular_locations ?? []).length > 0 ? (
            <div className="divide-y divide-[#d7e0f0]/70">
              {(stats?.popular_locations ?? []).slice(0, 6).map((item, idx) => (
                <div key={item.name} className="flex items-center gap-3 px-5 py-3.5 text-sm transition-colors hover:bg-[#f6f8fb]">
                  <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-[#eef3fb] text-xs font-bold text-[#053384]">
                    {idx + 1}
                  </span>
                  <span className="min-w-0 flex-1 truncate font-medium text-[#10213f]">{item.name}</span>
                  <Badge variant="outline" className="shrink-0">{item.visit_count}</Badge>
                </div>
              ))}
            </div>
          ) : (
            <AdminEmptyState
              icon={MapPin}
              title="Chưa có dữ liệu địa điểm"
              description="Dữ liệu sẽ xuất hiện khi câu hỏi được gắn với địa điểm tham quan."
            />
          )}
        </AdminPanel>
      </div>
    </div>
  )
}
