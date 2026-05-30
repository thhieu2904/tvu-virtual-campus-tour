'use client'

import { useCallback, useEffect, useState } from 'react'
import { adminApi } from '@/lib/admin-api'
import { AdminNotice, AdminPageHeader, AdminPanel } from './_components/admin-ui'
import { Bot, FileText, Image as ImageIcon, MapPin, MessageSquare, RefreshCw } from 'lucide-react'
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

const metricCards = [
  { key: 'locations', title: 'Địa điểm đang mở', icon: MapPin },
  { key: 'documents', title: 'Học liệu sẵn sàng', icon: FileText },
  { key: 'media', title: 'Tư liệu media', icon: ImageIcon },
  { key: 'mascots', title: 'Đại sứ ảo', icon: Bot },
] as const

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

  const metricValue = (key: (typeof metricCards)[number]['key']) => {
    if (!stats) return '-'
    if (key === 'locations') return `${stats.locations.active}/${stats.locations.total}`
    if (key === 'documents') return `${stats.documents.ready}/${stats.documents.total}`
    if (key === 'media') return stats.media.total
    return stats.mascots.total
  }

  const totalCategorized = stats?.documents_by_category.reduce((sum, item) => sum + item.count, 0) ?? 0

  return (
    <div className="flex flex-col gap-6">
      <AdminPageHeader
        title="Tổng quan vận hành"
        description="Theo dõi tình trạng dữ liệu, học liệu RAG và hoạt động hội thoại của hệ thống tham quan ảo."
        meta={
          <>
            <Badge variant="outline">{stats?.total_sessions ?? 0} phiên tham quan</Badge>
            <Badge variant="secondary">{stats?.total_messages ?? 0} tin nhắn</Badge>
          </>
        }
        actions={
          <Button variant="outline" size="sm" onClick={fetchStats} disabled={loading}>
            <RefreshCw data-icon="inline-start" className={loading ? 'animate-spin' : ''} />
            Làm mới
          </Button>
        }
      />

      {error && <AdminNotice tone="danger">{error}</AdminNotice>}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {metricCards.map((card) => {
          const Icon = card.icon
          return (
            <AdminPanel key={card.key} className="p-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">{card.title}</p>
                  <p className="mt-2 text-3xl font-semibold tracking-normal">{metricValue(card.key)}</p>
                </div>
                <div className="flex size-10 items-center justify-center rounded-lg bg-primary/8 text-primary">
                  <Icon />
                </div>
              </div>
            </AdminPanel>
          )
        })}
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.05fr_0.95fr]">
        <AdminPanel
          title="Cơ cấu học liệu"
          description="Phân bổ học liệu theo nhóm nội dung đang phục vụ RAG."
        >
          <div className="px-4 py-4">
            <div className="flex flex-col gap-3">
              {(stats?.documents_by_category ?? []).map((item) => {
                const percent = totalCategorized ? Math.round((item.count / totalCategorized) * 100) : 0
                return (
                  <div key={item.category_name} className="grid gap-2 md:grid-cols-[180px_1fr_56px] md:items-center">
                    <div className="flex items-center gap-2 text-sm font-medium">
                      <span className="size-2.5 rounded-full" style={{ backgroundColor: item.color }} />
                      <span className="truncate">{item.category_name}</span>
                    </div>
                    <div className="h-2 rounded-full bg-muted">
                      <div className="h-2 rounded-full" style={{ width: `${percent}%`, backgroundColor: item.color }} />
                    </div>
                    <div className="text-right text-sm text-muted-foreground">{item.count}</div>
                  </div>
                )
              })}
              {stats && stats.documents_by_category.length === 0 && (
                <p className="text-sm text-muted-foreground">Chưa có danh mục học liệu nào.</p>
              )}
            </div>
          </div>
        </AdminPanel>

        <AdminPanel
          title="Phân tích hội thoại"
          description={`Thời gian phản hồi trung bình: ${stats?.avg_response_time_ms ?? 0} ms`}
          action={<MessageSquare className="text-muted-foreground" />}
        >
          <div className="divide-y divide-border/70">
            {(stats?.top_questions ?? []).slice(0, 6).map((item) => (
              <div key={item.question} className="flex items-center justify-between gap-4 px-4 py-3 text-sm">
                <span className="truncate">{item.question}</span>
                <Badge variant="outline">{item.count}</Badge>
              </div>
            ))}
            {stats && stats.top_questions.length === 0 && (
              <p className="px-4 py-5 text-sm text-muted-foreground">Chưa có câu hỏi nào được ghi nhận.</p>
            )}
          </div>
        </AdminPanel>
      </div>

      <AdminPanel title="Địa điểm nổi bật" description="Địa điểm được nhắc tới nhiều trong hội thoại.">
        <div className="grid gap-0 divide-y divide-border/70">
          {(stats?.popular_locations ?? []).map((item) => (
            <div key={item.name} className="grid grid-cols-[1fr_auto] items-center gap-4 px-4 py-3 text-sm">
              <span className="font-medium">{item.name}</span>
              <span className="rounded-md border px-2 py-1 text-muted-foreground">{item.visit_count}</span>
            </div>
          ))}
          {stats && stats.popular_locations.length === 0 && (
            <p className="px-4 py-5 text-sm text-muted-foreground">Chưa có dữ liệu location trong chat.</p>
          )}
        </div>
      </AdminPanel>
    </div>
  )
}
