'use client'

import { useCallback, useEffect, useState } from 'react'
import { adminApi } from '@/lib/admin-api'
import {
  AdminEmptyState,
  AdminPageHeader,
  AdminPanel,
  AdminSkeleton,
  AdminStatCard,
} from './_components/admin-ui'
import {
  Bot,
  FileText,
  Image as ImageIcon,
  MapPin,
  MessageSquare,
  RefreshCw,
  TrendingUp,
  BarChart3,
  Trophy,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'

interface DashboardStats {
  locations: { total: number; active: number }
  documents: { total: number; ready: number }
  media: { total: number }
  mascots: { total: number }
  total_sessions: number
  total_messages: number
  avg_response_time_ms: number
  sessions_by_day: { date: string | null; count: number }[]
  top_questions: { question: string; count: number }[]
  popular_locations: { name: string; visit_count: number }[]
  documents_by_category: { category_name: string; color: string; count: number }[]
}

export default function AdminDashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchStats = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setStats(await adminApi.get<DashboardStats>('/stats'))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không thể tải thống kê')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void Promise.resolve().then(fetchStats)
  }, [fetchStats])

  const totalCategorized = stats?.documents_by_category.reduce((sum, item) => sum + item.count, 0) ?? 0

  // Sessions chart helpers
  const sessionsData = stats?.sessions_by_day ?? []
  const maxSessions = Math.max(...sessionsData.map((d) => d.count), 1)

  return (
    <div className="flex flex-col gap-6">
      <AdminPageHeader
        title="Tổng quan vận hành"
        description="Theo dõi tình trạng dữ liệu, học liệu RAG và hoạt động hội thoại của hệ thống tham quan ảo."
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

      {/* ─── Quick Stats ─── */}
      <div className="grid gap-3 rounded-2xl bg-gradient-to-r from-[#053384] to-[#0a4cb8] p-5 text-white shadow-lg shadow-[#053384]/15 sm:grid-cols-2 lg:grid-cols-4">
        <div className="flex items-center gap-3 rounded-xl bg-white/10 p-4 backdrop-blur-sm">
          <div className="flex size-10 items-center justify-center rounded-lg bg-white/15">
            <MessageSquare className="h-5 w-5" />
          </div>
          <div>
            <p className="text-[0.7rem] font-medium uppercase tracking-wide text-white/60">Phiên tham quan</p>
            <p className="text-xl font-bold">{stats?.total_sessions ?? 0}</p>
          </div>
        </div>
        <div className="flex items-center gap-3 rounded-xl bg-white/10 p-4 backdrop-blur-sm">
          <div className="flex size-10 items-center justify-center rounded-lg bg-white/15">
            <TrendingUp className="h-5 w-5" />
          </div>
          <div>
            <p className="text-[0.7rem] font-medium uppercase tracking-wide text-white/60">Tin nhắn</p>
            <p className="text-xl font-bold">{stats?.total_messages ?? 0}</p>
          </div>
        </div>
        <div className="flex items-center gap-3 rounded-xl bg-white/10 p-4 backdrop-blur-sm">
          <div className="flex size-10 items-center justify-center rounded-lg bg-white/15">
            <BarChart3 className="h-5 w-5" />
          </div>
          <div>
            <p className="text-[0.7rem] font-medium uppercase tracking-wide text-white/60">Phản hồi TB</p>
            <p className="text-xl font-bold">{stats?.avg_response_time_ms ?? 0}<span className="text-sm font-normal text-white/50"> ms</span></p>
          </div>
        </div>
        <div className="flex items-center gap-3 rounded-xl bg-white/10 p-4 backdrop-blur-sm">
          <div className="flex size-10 items-center justify-center rounded-lg bg-[#e3b83c]/25">
            <Trophy className="h-5 w-5 text-[#e3b83c]" />
          </div>
          <div>
            <p className="text-[0.7rem] font-medium uppercase tracking-wide text-white/60">Câu hỏi phổ biến</p>
            <p className="text-xl font-bold">{stats?.top_questions?.length ?? 0}</p>
          </div>
        </div>
      </div>

      {/* ─── Metric Cards ─── */}
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

      {/* ─── Sessions Chart + Category Breakdown ─── */}
      <div className="grid gap-4 xl:grid-cols-[1.05fr_0.95fr]">
        {/* Sessions by Day */}
        <AdminPanel
          title="Lượng truy cập theo ngày"
          description="Số phiên tham quan được ghi nhận trong 7 ngày gần nhất."
        >
          <div className="px-5 pb-5 pt-3">
            {sessionsData.length > 0 ? (
              <div className="flex items-end gap-2" style={{ height: 180 }}>
                {sessionsData.slice(-14).map((day, idx) => {
                  const height = maxSessions > 0 ? Math.max((day.count / maxSessions) * 100, 4) : 4
                  const dateStr = day.date ? new Date(day.date).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' }) : '—'
                  return (
                    <div key={idx} className="group flex flex-1 flex-col items-center gap-1.5">
                      {/* Tooltip */}
                      <div className="pointer-events-none rounded-lg bg-[#10213f] px-2 py-1 text-[0.65rem] font-medium text-white opacity-0 shadow-md transition-opacity group-hover:opacity-100">
                        {day.count}
                      </div>
                      {/* Bar */}
                      <div
                        className="w-full max-w-[38px] rounded-t-lg bg-gradient-to-t from-[#053384] to-[#4a7ee0] transition-all group-hover:from-[#0a4cb8] group-hover:to-[#6b9df5]"
                        style={{ height: `${height}%` }}
                      />
                      {/* Label */}
                      <span className="text-[0.6rem] text-[#52627f]">{dateStr}</span>
                    </div>
                  )
                })}
              </div>
            ) : (
              <AdminEmptyState
                icon={BarChart3}
                title="Chưa có dữ liệu"
                description="Hệ thống sẽ bắt đầu ghi nhận khi có phiên tham quan."
              />
            )}
          </div>
        </AdminPanel>

        {/* Category breakdown */}
        <AdminPanel
          title="Cơ cấu học liệu"
          description="Phân bổ học liệu theo nhóm nội dung đang phục vụ RAG."
        >
          <div className="px-5 pb-5 pt-3">
            <div className="flex flex-col gap-3.5">
              {(stats?.documents_by_category ?? []).map((item) => {
                const percent = totalCategorized ? Math.round((item.count / totalCategorized) * 100) : 0
                return (
                  <div key={item.category_name} className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 text-[0.82rem] font-medium text-[#10213f]">
                        <span className="size-2.5 rounded-full" style={{ backgroundColor: item.color }} />
                        <span className="truncate">{item.category_name}</span>
                      </div>
                      <span className="text-[0.78rem] font-semibold tabular-nums text-[#52627f]">
                        {item.count} <span className="font-normal text-[#7a96c9]">({percent}%)</span>
                      </span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-[#eef3fb]">
                      <div
                        className="h-2 rounded-full transition-all duration-500"
                        style={{ width: `${percent}%`, backgroundColor: item.color }}
                      />
                    </div>
                  </div>
                )
              })}
              {stats && stats.documents_by_category.length === 0 && (
                <AdminEmptyState
                  icon={FileText}
                  title="Chưa có danh mục"
                  description="Tạo danh mục học liệu để bắt đầu phân loại tài liệu."
                />
              )}
            </div>
          </div>
        </AdminPanel>
      </div>

      {/* ─── Top Questions + Popular Locations ─── */}
      <div className="grid gap-4 xl:grid-cols-2">
        <AdminPanel
          title="Câu hỏi thường gặp"
          description="Top câu hỏi được sinh viên hỏi nhiều nhất."
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
              description="Câu hỏi sẽ xuất hiện khi sinh viên tương tác với đại sứ ảo."
            />
          )}
        </AdminPanel>

        <AdminPanel
          title="Địa điểm nổi bật"
          description="Địa điểm được nhắc tới nhiều trong hội thoại."
          action={<MapPin className="h-5 w-5 text-[#7a96c9]" />}
        >
          {(stats?.popular_locations ?? []).length > 0 ? (
            <div className="divide-y divide-[#d7e0f0]/70">
              {(stats?.popular_locations ?? []).map((item, idx) => {
                const maxVisit = Math.max(...(stats?.popular_locations ?? []).map((l) => l.visit_count), 1)
                const barWidth = Math.max((item.visit_count / maxVisit) * 100, 8)
                return (
                  <div key={item.name} className="group px-5 py-3.5 transition-colors hover:bg-[#f6f8fb]">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-[#eef3fb] text-xs font-bold text-[#053384]">
                          {idx + 1}
                        </span>
                        <span className="truncate text-sm font-medium text-[#10213f]">{item.name}</span>
                      </div>
                      <span className="shrink-0 rounded-lg border border-[#d7e0f0] px-2.5 py-1 text-xs font-semibold tabular-nums text-[#52627f]">
                        {item.visit_count}
                      </span>
                    </div>
                    <div className="ml-10 mt-2 h-1.5 overflow-hidden rounded-full bg-[#eef3fb]">
                      <div
                        className="h-1.5 rounded-full bg-gradient-to-r from-[#053384] to-[#4a7ee0] transition-all duration-500"
                        style={{ width: `${barWidth}%` }}
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          ) : (
            <AdminEmptyState
              icon={MapPin}
              title="Chưa có dữ liệu"
              description="Dữ liệu sẽ xuất hiện khi có hội thoại liên quan đến địa điểm."
            />
          )}
        </AdminPanel>
      </div>
    </div>
  )
}
