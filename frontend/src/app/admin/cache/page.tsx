'use client'

import { useMemo, useState } from 'react'
import {
  AdminMetricStrip,
  AdminNotice,
  AdminPageHeader,
  AdminPanel,
  AdminStatusPill,
} from '../_components/admin-ui'
import { Button } from '@/components/ui/button'
import {
  AlertTriangle,
  Database,
  FileQuestion,
  MapPin,
  Mic,
  RefreshCw,
  ShieldAlert,
  Sparkles,
} from 'lucide-react'

type CacheScope = 'location' | 'mascot' | 'global'

function normalizeScope(value: string | null): CacheScope {
  if (value === 'location' || value === 'mascot') return value
  return 'global'
}

function readInitialParams() {
  if (typeof window === 'undefined') {
    return {
      scope: 'global' as CacheScope,
      locationId: null as string | null,
      mascotId: null as string | null,
      focus: null as string | null,
    }
  }
  const params = new URLSearchParams(window.location.search)
  return {
    scope: normalizeScope(params.get('scope')),
    locationId: params.get('locationId'),
    mascotId: params.get('mascotId'),
    focus: params.get('focus'),
  }
}

export default function AdminCachePage() {
  const [initialParams] = useState(readInitialParams)
  const { scope, locationId, mascotId, focus } = initialParams

  const focusedLabel = useMemo(() => {
    if (scope === 'location') return locationId ? `Location ${locationId.slice(0, 8)}` : 'Location chưa xác định'
    if (scope === 'mascot') return mascotId ? `Mascot ${mascotId.slice(0, 8)}` : 'Mascot chưa xác định'
    return 'Toàn hệ thống'
  }, [locationId, mascotId, scope])

  const sections = [
    {
      id: 'intro',
      icon: Mic,
      title: 'Intro audio',
      description: 'Kiểm tra audio mở đầu của location sau khi đổi intro message hoặc mascot voice.',
      status: focus === 'voice' ? 'Đang focus từ Mascot' : 'Chờ backend status',
    },
    {
      id: 'questions',
      icon: FileQuestion,
      title: 'QA cache',
      description: 'Theo dõi câu hỏi gợi ý đã có trong qa_cache.json, chưa cache hoặc có thể stale.',
      status: focus === 'questions' ? 'Đang focus từ Location' : 'Chờ backend status',
    },
    {
      id: 'mascot-impact',
      icon: Sparkles,
      title: 'Mascot impact',
      description: 'Ước lượng vùng cache bị ảnh hưởng khi đổi tên, voice, voice style hoặc personality prompt.',
      status: scope === 'mascot' ? 'Đang focus từ Mascot' : 'Chờ backend status',
    },
  ]

  return (
    <div className="flex flex-col gap-6">
      <AdminPageHeader
        title="Cache Console"
        description="Khung điều phối cache cho intro audio, câu hỏi gợi ý và cấu hình mascot. Phase 1 chỉ dựng shell và đường dẫn focus; worker backend sẽ làm ở phase 2."
        actions={
          <Button variant="outline" size="sm" disabled className="rounded-xl">
            <RefreshCw data-icon="inline-start" />
            Cần backend status
          </Button>
        }
      />

      <AdminNotice tone="info">
        Trang này chưa chạy rebuild cache thật. Các nút sinh cache đang khóa để tránh phát sinh quota TTS/RAG ngoài ý muốn.
      </AdminNotice>

      <AdminMetricStrip
        metrics={[
          { label: 'Phạm vi', value: scope === 'location' ? 'Location' : scope === 'mascot' ? 'Mascot' : 'Global', color: '#053384' },
          { label: 'Đang focus', value: focusedLabel, color: '#52627f' },
          { label: 'Worker', value: 'Phase 2', color: '#b8891f' },
          { label: 'Hành động', value: 'Read-only', color: '#2c8b57' },
        ]}
      />

      <div className="grid gap-5 xl:grid-cols-[280px_minmax(0,1fr)]">
        <aside className="xl:sticky xl:top-20 xl:self-start">
          <AdminPanel>
            <div className="p-4">
              <div className="flex items-center gap-3">
                <div className="flex size-10 items-center justify-center rounded-xl bg-[#eef3fb] text-[#053384]">
                  <Database className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-[#10213f]">Runtime cache</h2>
                  <p className="text-xs text-[#7a96c9]">Điểm đến từ admin edit</p>
                </div>
              </div>
              <div className="mt-4 grid gap-2 text-sm text-[#52627f]">
                <div className="rounded-xl border border-[#d7e0f0]/70 bg-[#f8fbff] p-3">
                  <p className="text-[0.7rem] font-semibold uppercase tracking-wide text-[#7a96c9]">Scope</p>
                  <p className="mt-1 font-semibold text-[#10213f]">{scope}</p>
                </div>
                <div className="rounded-xl border border-[#d7e0f0]/70 bg-[#f8fbff] p-3">
                  <p className="text-[0.7rem] font-semibold uppercase tracking-wide text-[#7a96c9]">Focus</p>
                  <p className="mt-1 font-semibold text-[#10213f]">{focus ?? 'overview'}</p>
                </div>
              </div>
            </div>
          </AdminPanel>
        </aside>

        <main className="grid gap-4">
          <AdminPanel
            title="Trạng thái phase 1"
            description="Shell này cố tình không tự chạy pre-cache. Backend status/job queue sẽ được nối vào phase 2."
            action={<AdminStatusPill status="warning" label="Read-only shell" />}
          >
            <div className="grid gap-4 p-5 lg:grid-cols-3">
              {sections.map((section) => {
                const Icon = section.icon
                return (
                  <div
                    key={section.id}
                    className={`rounded-2xl border p-4 ${
                      focus === section.id || (focus === 'voice' && section.id === 'intro')
                        ? 'border-[#053384]/40 bg-[#eef3fb]'
                        : 'border-[#d7e0f0]/80 bg-white'
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-white text-[#053384] shadow-sm">
                        <Icon className="h-5 w-5" />
                      </div>
                      <div className="min-w-0">
                        <h3 className="font-bold text-[#10213f]">{section.title}</h3>
                        <p className="mt-1 text-xs leading-relaxed text-[#52627f]">{section.description}</p>
                      </div>
                    </div>
                    <div className="mt-4 flex items-center justify-between gap-3">
                      <AdminStatusPill status="muted" label={section.status} />
                      <Button size="sm" variant="outline" disabled className="rounded-xl text-xs">
                        Chạy job
                      </Button>
                    </div>
                  </div>
                )
              })}
            </div>
          </AdminPanel>

          <AdminPanel
            title="Backend cần nối ở phase 2"
            description="Các contract này là đề xuất để biến shell thành công cụ cache thật."
          >
            <div className="grid gap-3 p-5 text-sm text-[#52627f]">
              <div className="flex gap-3 rounded-xl border border-[#d7e0f0]/70 bg-[#f8fbff] p-3">
                <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-[#053384]" />
                <span><strong className="text-[#10213f]">GET /api/admin/cache/status</strong> để đọc DB + qa_cache.json và phân loại cached/missing/stale.</span>
              </div>
              <div className="flex gap-3 rounded-xl border border-[#d7e0f0]/70 bg-[#f8fbff] p-3">
                <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-[#b8891f]" />
                <span><strong className="text-[#10213f]">POST /api/admin/cache/jobs</strong> để tạo job có xác nhận chi phí trước khi chạy RAG/TTS.</span>
              </div>
              <div className="flex gap-3 rounded-xl border border-[#d7e0f0]/70 bg-[#f8fbff] p-3">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[#c14b4b]" />
                <span>QA cache cần metadata/fingerprint để phát hiện stale khi đổi mascot prompt hoặc voice.</span>
              </div>
            </div>
          </AdminPanel>
        </main>
      </div>
    </div>
  )
}
