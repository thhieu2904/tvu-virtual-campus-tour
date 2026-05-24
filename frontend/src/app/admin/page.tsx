'use client'

import { useCallback, useEffect, useState } from 'react'
import { adminApi } from '@/lib/admin-api'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Bot, FileText, Image as ImageIcon, MapPin, MessageSquare, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'

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

  const cards = [
    {
      title: 'Locations',
      value: stats ? `${stats.locations.active}/${stats.locations.total}` : '-',
      caption: 'Địa điểm active',
      icon: MapPin,
    },
    {
      title: 'Knowledge Base',
      value: stats ? `${stats.documents.ready}/${stats.documents.total}` : '-',
      caption: 'Tài liệu sẵn sàng',
      icon: FileText,
    },
    {
      title: 'Media Assets',
      value: stats?.media.total ?? '-',
      caption: 'Hình ảnh và video',
      icon: ImageIcon,
    },
    {
      title: 'Mascots',
      value: stats?.mascots.total ?? '-',
      caption: 'Nhân vật AI',
      icon: Bot,
    },
  ]

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-muted-foreground mt-2">
            Tổng quan nội dung và hoạt động của TVU Virtual Campus Tour.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={fetchStats} disabled={loading}>
          <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
        </Button>
      </div>

      {error && <div className="rounded-md bg-red-50 p-3 text-sm text-red-600">{error}</div>}

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {cards.map((card) => {
          const Icon = card.icon
          return (
            <Card key={card.title}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">{card.title}</CardTitle>
                <Icon className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{card.value}</div>
                <p className="text-xs text-muted-foreground">{card.caption}</p>
              </CardContent>
            </Card>
          )
        })}
      </div>

      <div className="grid gap-4 lg:grid-cols-7">
        <Card className="lg:col-span-4">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MessageSquare className="h-5 w-5 text-muted-foreground" />
              Chat Analytics
            </CardTitle>
            <CardDescription>
              {stats ? `${stats.total_sessions} sessions, ${stats.total_messages} messages` : 'Đang tải dữ liệu'}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="rounded-md border p-3">
              <p className="text-xs text-muted-foreground">Thời gian phản hồi trung bình</p>
              <p className="text-xl font-semibold">{stats?.avg_response_time_ms ?? 0} ms</p>
            </div>
            <div className="space-y-2">
              {(stats?.top_questions ?? []).slice(0, 5).map((item) => (
                <div key={item.question} className="flex items-center justify-between rounded-md border px-3 py-2 text-sm">
                  <span className="truncate">{item.question}</span>
                  <span className="font-medium">{item.count}</span>
                </div>
              ))}
              {stats && stats.top_questions.length === 0 && (
                <p className="text-sm text-muted-foreground">Chưa có câu hỏi nào được ghi nhận.</p>
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle>Popular Locations</CardTitle>
            <CardDescription>Địa điểm được nhắc tới nhiều trong hội thoại.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {(stats?.popular_locations ?? []).map((item) => (
              <div key={item.name} className="flex items-center justify-between rounded-md border px-3 py-2 text-sm">
                <span>{item.name}</span>
                <span className="font-medium">{item.visit_count}</span>
              </div>
            ))}
            {stats && stats.popular_locations.length === 0 && (
              <p className="text-sm text-muted-foreground">Chưa có dữ liệu location trong chat.</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
