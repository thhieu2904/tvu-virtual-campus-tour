'use client'

import type { CSSProperties } from 'react'
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
  Database,
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

function getReadableTextColor(color: string) {
  const hex = color.replace('#', '')
  if (hex.length !== 6) return '#ffffff'
  const red = Number.parseInt(hex.slice(0, 2), 16)
  const green = Number.parseInt(hex.slice(2, 4), 16)
  const blue = Number.parseInt(hex.slice(4, 6), 16)
  const luminance = (0.299 * red + 0.587 * green + 0.114 * blue) / 255
  return luminance > 0.58 ? '#10213f' : '#ffffff'
}

function SessionsTrendChart({ data }: { data: DashboardStats['sessions_by_day'] }) {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null)
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null)
  const total = data.reduce((sum, item) => sum + item.count, 0)
  const max = Math.max(...data.map((item) => item.count), 1)
  const width = 760
  const height = 300
  const pad = { left: 42, right: 18, top: 24, bottom: 42 }
  const plotWidth = width - pad.left - pad.right
  const plotHeight = height - pad.top - pad.bottom
  const xFor = (index: number) => pad.left + (data.length <= 1 ? 0 : (index / (data.length - 1)) * plotWidth)
  const yFor = (count: number) => pad.top + plotHeight - (count / max) * plotHeight
  const points = data.map((item, index) => ({ ...item, x: xFor(index), y: yFor(item.count) }))
  const linePath = points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`).join(' ')
  const areaPath = points.length > 0
    ? `${linePath} L ${points[points.length - 1].x} ${pad.top + plotHeight} L ${points[0].x} ${pad.top + plotHeight} Z`
    : ''
  const tickIndexes = data.length <= 10
    ? data.map((_, index) => index)
    : [0, 6, 13, 20, 27, data.length - 1].filter((index, pos, arr) => index < data.length && arr.indexOf(index) === pos)
  const activeIndex = selectedIndex ?? hoverIndex
  const activePoint = activeIndex === null ? null : points[activeIndex]
  const highlightedPoints = points.filter((point) => point.count === max || point.count >= Math.max(2, Math.ceil(max * 0.45)))

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
      <div className="overflow-hidden rounded-xl border border-[#d7e0f0]/70 bg-white">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="h-[300px] w-full"
          onMouseLeave={() => setHoverIndex(null)}
        >
          <defs>
            <linearGradient id="sessionArea" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="#5b8bed" stopOpacity="0.28" />
              <stop offset="100%" stopColor="#5b8bed" stopOpacity="0.03" />
            </linearGradient>
            <linearGradient id="sessionLine" x1="0" x2="1" y1="0" y2="0">
              <stop offset="0%" stopColor="#053384" />
              <stop offset="100%" stopColor="#5b8bed" />
            </linearGradient>
          </defs>
          {[max, Math.ceil(max / 2), 0].map((value) => {
            const y = yFor(value)
            return (
              <g key={value}>
                <line x1={pad.left} x2={width - pad.right} y1={y} y2={y} stroke="#e5ecf6" strokeWidth="1" />
                <text x={pad.left - 12} y={y + 4} textAnchor="end" pointerEvents="none" className="fill-[#7a96c9] text-[11px] font-semibold">
                  {value}
                </text>
              </g>
            )
          })}
          <path d={areaPath} fill="url(#sessionArea)" pointerEvents="none" />
          <path d={linePath} fill="none" stroke="url(#sessionLine)" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" pointerEvents="none" />
          {points.map((point, index) => (
            <rect
              key={`hit-${point.date}`}
              x={point.x - Math.max(16, plotWidth / Math.max(data.length - 1, 1) / 2)}
              y={pad.top}
              width={Math.max(32, plotWidth / Math.max(data.length - 1, 1))}
              height={plotHeight + pad.bottom - 6}
              fill="transparent"
              pointerEvents="all"
              className="cursor-pointer"
              onMouseEnter={() => setHoverIndex(index)}
              onClick={() => setSelectedIndex(selectedIndex === index ? null : index)}
            >
              <title>{`${formatShortDate(point.date)}: ${point.count} phiên`}</title>
            </rect>
          ))}
          {points.map((point) => (
            <circle
              key={point.date}
              cx={point.x}
              cy={point.y}
              r={point.count > 0 ? 4.5 : 3}
              fill={point.count > 0 ? '#053384' : '#dce6f5'}
              stroke="#ffffff"
              strokeWidth="2"
              pointerEvents="none"
            >
              <title>{`${formatShortDate(point.date)}: ${point.count} phiên`}</title>
            </circle>
          ))}
          {highlightedPoints.map((point) => (
            <text
              key={`label-${point.date}`}
              x={point.x}
              y={Math.max(point.y - 12, 14)}
              textAnchor="middle"
              pointerEvents="none"
              className="fill-[#10213f] text-[11px] font-bold"
            >
              {point.count}
            </text>
          ))}
          {activePoint && (
            <g pointerEvents="none">
              <line x1={activePoint.x} x2={activePoint.x} y1={pad.top} y2={pad.top + plotHeight} stroke="#7a96c9" strokeDasharray="4 4" strokeWidth="1.5" />
              <circle cx={activePoint.x} cy={activePoint.y} r="7" fill="#ffffff" stroke="#053384" strokeWidth="3" />
              <g transform={`translate(${Math.min(Math.max(activePoint.x - 58, 54), width - 126)} ${Math.max(activePoint.y - 58, 14)})`}>
                <rect width="116" height="44" rx="10" fill="#10213f" />
                <text x="12" y="18" pointerEvents="none" className="fill-white text-[11px] font-semibold">
                  {formatShortDate(activePoint.date)}
                </text>
                <text x="12" y="34" pointerEvents="none" className="fill-white text-[13px] font-bold">
                  {activePoint.count} phiên có hỏi
                </text>
              </g>
            </g>
          )}
          {tickIndexes.map((index) => {
            const point = points[index]
            return (
              <text key={`tick-${point.date}`} x={point.x} y={height - 14} textAnchor="middle" pointerEvents="none" className="fill-[#52627f] text-[11px] font-semibold">
                {formatShortDate(point.date)}
              </text>
            )
          })}
        </svg>
      </div>
    </div>
  )
}

function CategoryDistribution({ data }: { data: DashboardStats['documents_by_category'] }) {
  const [activeCategory, setActiveCategory] = useState<string | null>(null)
  const total = data.reduce((sum, item) => sum + item.count, 0)
  const sortedData = [...data].filter((item) => item.count > 0).sort((a, b) => b.count - a.count)
  const primaryItems = sortedData.slice(0, 7)
  const overflowCount = sortedData.slice(7).reduce((sum, item) => sum + item.count, 0)
  const segments = (overflowCount > 0
    ? [...primaryItems, { category_name: 'Khác', color: '#94a3b8', count: overflowCount }]
    : primaryItems
  ).map((item) => ({
    categoryName: item.category_name,
    color: item.color,
    count: item.count,
    percent: total > 0 ? Math.round((item.count / total) * 100) : 0,
  }))

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
    <div className="space-y-3 p-5">
      <div className="rounded-xl border border-[#d7e0f0]/70 bg-white p-3">
        <div className="mb-3 flex items-center justify-between gap-3">
          <span className="text-xs font-semibold uppercase tracking-wide text-[#7a96c9]">Tổng học liệu</span>
          <span className="text-xl font-bold tabular-nums text-[#053384]">{total}</span>
        </div>
        <div className="flex h-7 overflow-hidden rounded-full bg-[#e8eef8]">
          {segments.map((item) => {
            const selected = activeCategory === item.categoryName
            return (
              <button
                key={item.categoryName}
                type="button"
                aria-label={`${item.categoryName}: ${item.count} học liệu (${item.percent}%)`}
                className={`flex min-w-[32px] items-center justify-center border-r border-white/80 px-1 text-[0.68rem] font-bold tabular-nums transition-all last:border-r-0 hover:brightness-105 focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#053384] ${
                  selected ? 'scale-y-125 shadow-sm' : activeCategory ? 'opacity-40' : 'opacity-90'
                }`}
                style={{ flexGrow: item.count, backgroundColor: item.color, color: getReadableTextColor(item.color) }}
                onClick={() => setActiveCategory(selected ? null : item.categoryName)}
              >
                {item.percent}%
                <title>{`${item.categoryName}: ${item.count} học liệu (${item.percent}%)`}</title>
              </button>
            )
          })}
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-[#d7e0f0]/70 bg-white">
        {segments.map((item) => {
          const selected = activeCategory === item.categoryName
          return (
            <button
              key={`legend-${item.categoryName}`}
              type="button"
              onClick={() => setActiveCategory(selected ? null : item.categoryName)}
              className={`grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-b border-[#d7e0f0]/60 px-3 py-2 text-left transition-all last:border-b-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#053384] ${
                selected
                  ? 'bg-[#f8fbff] shadow-[inset_3px_0_0_var(--category-color)]'
                  : activeCategory
                    ? 'opacity-55'
                    : 'hover:bg-[#f8fbff]'
              }`}
              style={{ '--category-color': item.color } as CSSProperties}
            >
              <div className="flex min-w-0 items-center gap-2">
                <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: item.color }} />
                <span className="truncate text-sm font-semibold text-[#10213f]">{item.categoryName}</span>
              </div>
              <span className="shrink-0 text-sm font-bold tabular-nums text-[#52627f]">
                {item.count}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

export default function AdminDashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [cacheJobsCount, setCacheJobsCount] = useState(0)
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
      const [statsData, cacheData] = await Promise.all([
        adminApi.get<DashboardStats>(`/stats?${params.toString()}`),
        adminApi.get<{ total: number }>('/cache/jobs?limit=1').catch(() => ({ total: 0 })),
      ])
      setStats(statsData)
      setCacheJobsCount(cacheData.total)
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
  const displayedPeriod = stats?.stats_period.period ?? period
  const periodLabel = displayedPeriod === 'week' ? 'Tuần' : 'Tháng'

  useEffect(() => {
    if (!stats || autoCursorAdjusted || chartTotal > 0 || !stats.latest_engaged_session_date) return
    if (stats.engaged_sessions > 0 && stats.latest_engaged_session_date !== cursor) {
      const nextCursor = stats.latest_engaged_session_date
      queueMicrotask(() => {
        setAutoCursorAdjusted(true)
        setCursor(nextCursor)
      })
    }
  }, [autoCursorAdjusted, chartTotal, cursor, stats])

  const shiftRange = (direction: -1 | 1) => {
    const next = period === 'week'
      ? addDays(currentCursor, direction * 7)
      : addMonths(currentCursor, direction)
    setCursor(toIsoDate(next))
  }

  const setToday = () => setCursor(toIsoDate(new Date()))
  const changePeriod = (nextPeriod: StatsPeriod) => {
    setAutoCursorAdjusted(false)
    setPeriod(nextPeriod)
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1.5 pb-1">
        <div className="flex items-center gap-4">
          <h1 className="text-[1.6rem] font-bold tracking-tight text-[#10213f] md:text-[1.85rem]">
            Tổng quan vận hành
          </h1>
          <Button variant="outline" size="sm" onClick={fetchStats} disabled={loading} className="h-8 rounded-lg px-2.5 text-xs text-[#52627f] mt-1">
            <RefreshCw className={loading ? 'mr-1.5 h-3.5 w-3.5 animate-spin' : 'mr-1.5 h-3.5 w-3.5'} />
            Làm mới
          </Button>
        </div>
        <p className="text-sm text-[#52627f]">
          Theo dõi dữ liệu thật của kiosk: chỉ tính phiên tham quan khi người dùng đã đặt ít nhất một câu hỏi.
        </p>
      </div>

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
        <div className="grid gap-4 md:grid-cols-3 xl:grid-cols-5">
          {[1, 2, 3, 4, 5].map((i) => (
            <AdminSkeleton key={i} variant="card" className="h-28" />
          ))}
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-3 xl:grid-cols-5">
          <AdminStatCard
            icon={MapPin}
            title="Địa điểm đang mở"
            value={`${stats?.locations.active ?? 0}/${stats?.locations.total ?? 0}`}
            color="#053384"
            href="/admin/locations"
          />
          <AdminStatCard
            icon={FileText}
            title="Học liệu sẵn sàng"
            value={`${stats?.documents.ready ?? 0}/${stats?.documents.total ?? 0}`}
            color="#2c8b57"
            href="/admin/documents"
          />
          <AdminStatCard
            icon={ImageIcon}
            title="Tư liệu media"
            value={stats?.media.total ?? 0}
            color="#b8891f"
            href="/admin/media"
          />
          <AdminStatCard
            icon={Bot}
            title="Đại sứ ảo"
            value={stats?.mascots.total ?? 0}
            color="#6f7f9c"
            href="/admin/mascots"
          />
          <AdminStatCard
            icon={Database}
            title="Tiến trình Cache"
            value={cacheJobsCount}
            color="#8b5cf6"
            href="/admin/cache"
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
                    onClick={() => changePeriod(item)}
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
                {period === 'week' ? 'Tuần hiện tại' : 'Tháng hiện tại'}
              </Button>
              <Button variant="outline" size="icon" onClick={() => shiftRange(1)} className="size-8 rounded-xl">
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          }
        >
          <SessionsTrendChart data={chartData} />
        </AdminPanel>

        <AdminPanel
          title="Cơ cấu học liệu"
          description="Tỷ trọng tài liệu theo nhóm nội dung phục vụ RAG."
        >
          <CategoryDistribution data={stats?.documents_by_category ?? []} />
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
