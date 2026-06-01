'use client'

import { useEffect, useState, useCallback, lazy, Suspense } from 'react'
import { adminApi } from '@/lib/admin-api'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  AdminEmptyState,
  AdminModal,
  AdminNotice,
  AdminPageHeader,
  AdminPanel,
  AdminSkeleton,
  AdminTextarea,
} from '../_components/admin-ui'
import {
  MapPin, Image as ImageIcon, ToggleLeft, ToggleRight,
  RefreshCw, Search, Star, Pencil, Plus, Trash2, Upload, Volume2, Eye,
  Route,
} from 'lucide-react'

const PathfindingTab = lazy(() => import('./_components/PathfindingTab'))

interface LocationItem {
  id: string; name: string; slug: string; description: string
  intro_message: string; status: 'active' | 'inactive'; is_start_node: boolean
  intro_audio_url?: string | null; background_url: string; mascot_id: string | null
  sort_order: number; media_count: number; updated_at: string | null
}

interface LocationDetail extends LocationItem {
  suggested_questions: { id: string; question: string; sort_order: number }[]
}

export default function LocationsPage() {
  const [locations, setLocations] = useState<LocationItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [togglingId, setTogglingId] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'list' | 'pathfinding'>('list')

  // Edit dialog state
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editData, setEditData] = useState<LocationDetail | null>(null)
  const [editQuestions, setEditQuestions] = useState<string[]>([])
  const [saving, setSaving] = useState(false)
  const [bgFile, setBgFile] = useState<File | null>(null)
  const [uploadingBg, setUploadingBg] = useState(false)
  const [regeneratingAudio, setRegeneratingAudio] = useState(false)

  const fetchLocations = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const data = await adminApi.get<{ locations: LocationItem[] }>('/locations')
      setLocations(data.locations)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không thể tải danh sách')
    } finally { setLoading(false) }
  }, [])

  useEffect(() => { void Promise.resolve().then(fetchLocations) }, [fetchLocations])

  const handleToggleStatus = async (id: string) => {
    setTogglingId(id)
    try {
      const result = await adminApi.patch<{ id: string; status: string }>(`/locations/${id}/status`)
      setLocations(prev => prev.map(loc =>
        loc.id === id ? { ...loc, status: result.status as 'active' | 'inactive' } : loc
      ))
    } catch (err) { setError(err instanceof Error ? err.message : 'Lỗi toggle') }
    finally { setTogglingId(null) }
  }

  const openEdit = async (id: string) => {
    try {
      const detail = await adminApi.get<LocationDetail>(`/locations/${id}`)
      setEditData(detail)
      setEditQuestions(detail.suggested_questions.map(q => q.question))
      setEditingId(id)
      setBgFile(null)
    } catch (err) { setError(err instanceof Error ? err.message : 'Lỗi tải chi tiết') }
  }

  const handleSave = async () => {
    if (!editData || !editingId) return
    setSaving(true)
    try {
      await adminApi.put(`/locations/${editingId}`, {
        name: editData.name,
        description: editData.description,
        intro_message: editData.intro_message,
      })
      await adminApi.put(`/locations/${editingId}/questions`, {
        questions: editQuestions
          .map((question, sort_order) => ({ question: question.trim(), sort_order }))
          .filter(item => item.question),
      })

      // Upload background if selected
      if (bgFile) {
        setUploadingBg(true)
        const bgForm = new FormData()
        bgForm.append('file', bgFile)
        await adminApi.uploadPut(`/locations/${editingId}/background`, bgForm)
        setUploadingBg(false)
      }

      setEditingId(null)
      setEditData(null)
      fetchLocations()
    } catch (err) { setError(err instanceof Error ? err.message : 'Lỗi lưu') }
    finally { setSaving(false) }
  }

  const handleRegenerateAudio = async () => {
    if (!editingId || !editData) return
    setRegeneratingAudio(true)
    try {
      await adminApi.put(`/locations/${editingId}`, {
        name: editData.name,
        description: editData.description,
        intro_message: editData.intro_message,
      })
      const result = await adminApi.post<{ intro_audio_url: string }>(`/locations/${editingId}/regenerate-audio`)
      setEditData({ ...editData, intro_audio_url: result.intro_audio_url })
    } catch (err) { setError(err instanceof Error ? err.message : 'Không thể tạo lại audio') }
    finally { setRegeneratingAudio(false) }
  }

  const filtered = locations.filter(loc =>
    loc.name.toLowerCase().includes(search.toLowerCase()) ||
    loc.slug.toLowerCase().includes(search.toLowerCase())
  )
  const activeCount = locations.filter(l => l.status === 'active').length
  const inactiveCount = locations.filter(l => l.status === 'inactive').length

  return (
    <div className="flex flex-col gap-6">
      <AdminPageHeader
        title="Địa điểm tham quan"
        description="Quản lý nội dung giới thiệu, ảnh 360°, câu hỏi gợi ý và trạng thái hiển thị trên bản đồ khuôn viên."
        meta={
          <>
            <Badge variant="outline" className="rounded-lg">{activeCount} đang mở</Badge>
            <Badge variant="secondary" className="rounded-lg">{inactiveCount} tạm đóng</Badge>
          </>
        }
        actions={
          <Button variant="outline" size="sm" onClick={fetchLocations} disabled={loading} className="rounded-xl">
            <RefreshCw data-icon="inline-start" className={loading ? 'animate-spin' : ''} /> Làm mới
          </Button>
        }
      />

      {/* Tab Navigation */}
      <div className="flex gap-1 rounded-xl bg-[#f6f8fb] p-1 w-fit">
        <button
          onClick={() => setActiveTab('list')}
          className={`flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium transition-all ${
            activeTab === 'list'
              ? 'bg-white text-[#10213f] shadow-sm'
              : 'text-[#52627f] hover:text-[#10213f]'
          }`}
        >
          <MapPin className="h-3.5 w-3.5" /> Danh sách
        </button>
        <button
          onClick={() => setActiveTab('pathfinding')}
          className={`flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium transition-all ${
            activeTab === 'pathfinding'
              ? 'bg-white text-[#10213f] shadow-sm'
              : 'text-[#52627f] hover:text-[#10213f]'
          }`}
        >
          <Route className="h-3.5 w-3.5" /> Pathfinding
        </button>
      </div>

      {/* Pathfinding Tab */}
      {activeTab === 'pathfinding' && (
        <Suspense fallback={
          <div className="grid gap-4 md:grid-cols-2">
            <AdminSkeleton variant="card" className="h-96" />
            <AdminSkeleton variant="card" className="h-96" />
          </div>
        }>
          <PathfindingTab />
        </Suspense>
      )}

      {/* List Tab (existing content) */}
      {activeTab === 'list' && (<>

      <div className="relative max-w-sm">
        <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#7a96c9]" />
        <Input placeholder="Tìm theo tên hoặc slug..." value={search} onChange={e => setSearch(e.target.value)} className="rounded-xl pl-10" />
      </div>

      {error && <AdminNotice tone="danger">{error}</AdminNotice>}

      {/* Edit Dialog — using AdminModal */}
      {editingId && editData && (
        <AdminModal
          title={`Chỉnh sửa: ${editData.name}`}
          footer={
            <>
              <Button variant="outline" onClick={() => setEditingId(null)} className="rounded-xl">Hủy</Button>
              <Button onClick={handleSave} disabled={saving || uploadingBg} className="rounded-xl">
                {saving ? 'Đang lưu...' : uploadingBg ? 'Đang upload ảnh...' : 'Lưu thay đổi'}
              </Button>
            </>
          }
        >
          <div className="space-y-5">
            <label className="flex flex-col gap-1.5 text-sm font-medium text-[#10213f]">
              Tên location
              <Input value={editData.name} onChange={e => setEditData({ ...editData, name: e.target.value })} className="rounded-xl" />
            </label>
            <label className="flex flex-col gap-1.5 text-sm font-medium text-[#10213f]">
              Mô tả
              <AdminTextarea className="min-h-[80px]"
                value={editData.description} onChange={e => setEditData({ ...editData, description: e.target.value })} />
            </label>
            <div>
              <label className="text-sm font-medium text-[#10213f]">Intro Message (mascot nói khi vào location)</label>
              <AdminTextarea className="mt-1.5 min-h-[80px]"
                value={editData.intro_message} onChange={e => setEditData({ ...editData, intro_message: e.target.value })} />
              <div className="mt-2.5 flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={handleRegenerateAudio} disabled={regeneratingAudio || !editData.intro_message.trim()} className="rounded-xl">
                  <Volume2 className="mr-1.5 h-4 w-4" />
                  {regeneratingAudio ? 'Đang tạo audio...' : 'Tạo lại audio'}
                </Button>
                {editData.intro_audio_url && (
                  <audio controls src={editData.intro_audio_url} className="h-9 max-w-[260px]" />
                )}
              </div>
            </div>

            {/* Suggested Questions */}
            <div>
              <label className="text-sm font-medium text-[#10213f]">Câu hỏi gợi ý</label>
              <div className="mt-2 space-y-2">
                {editQuestions.map((q, idx) => (
                  <div key={idx} className="flex gap-2">
                    <Input value={q} onChange={e => {
                      const updated = [...editQuestions]; updated[idx] = e.target.value; setEditQuestions(updated)
                    }} placeholder={`Câu hỏi ${idx + 1}`} className="rounded-xl" />
                    <Button variant="ghost" size="icon" onClick={() => setEditQuestions(editQuestions.filter((_, i) => i !== idx))}>
                      <Trash2 className="h-4 w-4 text-red-500" />
                    </Button>
                  </div>
                ))}
                <Button variant="outline" size="sm" onClick={() => setEditQuestions([...editQuestions, ''])} className="rounded-xl">
                  <Plus className="mr-1 h-4 w-4" /> Thêm câu hỏi
                </Button>
              </div>
            </div>

            {/* Background Upload */}
            <div>
              <label className="text-sm font-medium text-[#10213f]">Ảnh nền 360°</label>
              {editData.background_url && (
                <p className="mt-1 truncate text-xs text-[#52627f]">Hiện tại: {editData.background_url}</p>
              )}
              <div className="mt-2">
                <label className="flex cursor-pointer items-center gap-3 rounded-xl border-2 border-dashed border-[#d7e0f0] p-4 transition-colors hover:border-[#7a96c9] hover:bg-[#f6f8fb]">
                  <Upload className="h-5 w-5 text-[#7a96c9]" />
                  <span className="text-sm text-[#52627f]">{bgFile ? bgFile.name : 'Chọn ảnh mới (tùy chọn)'}</span>
                  <input type="file" accept="image/*" className="hidden" onChange={e => setBgFile(e.target.files?.[0] || null)} />
                </label>
              </div>
            </div>
          </div>
        </AdminModal>
      )}

      {/* Location Cards */}
      {loading && locations.length === 0 ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {[1, 2, 3].map(i => (
            <AdminSkeleton key={i} variant="card" className="h-52" />
          ))}
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map(loc => (
            <AdminPanel key={loc.id} className={`overflow-hidden transition-all ${loc.status === 'inactive' ? 'opacity-60 grayscale-[30%]' : ''}`}>
              {/* Thumbnail */}
              {loc.background_url && (
                <div className="relative h-36 overflow-hidden bg-[#eef3fb]">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={loc.background_url}
                    alt={loc.name}
                    className="h-full w-full object-cover transition-transform hover:scale-105"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent" />
                  <div className="absolute bottom-3 left-3 right-3 flex items-end justify-between">
                    <Badge
                      className={`rounded-lg text-xs ${loc.status === 'active'
                        ? 'border-emerald-400/30 bg-emerald-500 text-white'
                        : 'border-white/30 bg-white/80 text-[#52627f]'
                      }`}
                    >
                      {loc.status === 'active' ? '● Đang mở' : '○ Tạm đóng'}
                    </Badge>
                    {loc.is_start_node && (
                      <Badge className="rounded-lg border-amber-400/30 bg-amber-500 text-white text-xs">
                        <Star className="mr-1 h-3 w-3" /> Điểm bắt đầu
                      </Badge>
                    )}
                  </div>
                </div>
              )}

              <div className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="flex items-center gap-2 text-[0.95rem] font-semibold text-[#10213f]">
                      <MapPin className="h-4 w-4 shrink-0 text-[#053384]" />
                      <span className="truncate">{loc.name}</span>
                    </h3>
                    <p className="mt-0.5 font-mono text-xs text-[#7a96c9]">/{loc.slug}</p>
                  </div>
                </div>

                {loc.description && (
                  <p className="mt-2.5 line-clamp-2 text-[0.82rem] leading-relaxed text-[#52627f]">{loc.description}</p>
                )}

                <div className="mt-3 flex items-center gap-3 text-xs text-[#7a96c9]">
                  <span className="flex items-center gap-1">
                    <ImageIcon className="h-3.5 w-3.5" /> {loc.media_count} media
                  </span>
                  {loc.updated_at && (
                    <span>Cập nhật: {new Date(loc.updated_at).toLocaleDateString('vi-VN')}</span>
                  )}
                </div>

                <div className="mt-4 flex items-center justify-between gap-2 border-t border-[#d7e0f0]/70 pt-3">
                  <Button variant="outline" size="sm" onClick={() => openEdit(loc.id)} className="rounded-xl text-xs">
                    <Pencil className="mr-1.5 h-3.5 w-3.5" /> Chỉnh sửa
                  </Button>
                  <Button
                    variant="ghost" size="sm"
                    onClick={() => handleToggleStatus(loc.id)}
                    disabled={togglingId === loc.id}
                    className={`rounded-xl text-xs ${loc.status === 'active' ? 'text-emerald-600 hover:text-emerald-700' : 'text-[#52627f]'}`}
                  >
                    {loc.status === 'active'
                      ? <><ToggleRight className="mr-1.5 h-3.5 w-3.5" /> Tắt</>
                      : <><ToggleLeft className="mr-1.5 h-3.5 w-3.5" /> Bật</>
                    }
                  </Button>
                </div>
              </div>
            </AdminPanel>
          ))}
        </div>
      )}

      {!loading && filtered.length === 0 && (
        <AdminEmptyState
          icon={search ? Search : MapPin}
          title={search ? 'Không tìm thấy kết quả' : 'Chưa có địa điểm nào'}
          description={search ? 'Thử thay đổi từ khóa tìm kiếm.' : 'Thêm địa điểm mới để bắt đầu.'}
        />
      )}
      </>)}
    </div>
  )
}
