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
  AdminPanel,
  AdminSkeleton,
  AdminTextarea,
} from '../_components/admin-ui'
import MascotPreview3D from '../_components/MascotPreview3D'
import {
  MapPin, Image as ImageIcon, ToggleLeft, ToggleRight,
  RefreshCw, Search, Star, Pencil, Plus, Trash2, Upload, Volume2,
  Map, Bot, Crown, Check,
} from 'lucide-react'

const MapManagerTab = lazy(() => import('./_components/MapManagerTab'))

interface MascotOption {
  id: string
  name: string
  slug: string
  model_3d_url: string
  is_default: boolean
}

interface LocationItem {
  id: string; name: string; slug: string; description: string
  intro_message: string; status: 'active' | 'inactive'; is_start_node: boolean
  intro_audio_url?: string | null; revisit_audio_url?: string | null; background_url: string; mascot_id: string | null
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
  const [activeTab, setActiveTab] = useState<'list' | 'map'>('map')

  // Edit dialog state
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editData, setEditData] = useState<LocationDetail | null>(null)
  const [editQuestions, setEditQuestions] = useState<string[]>([])
  const [saving, setSaving] = useState(false)
  const [bgFile, setBgFile] = useState<File | null>(null)
  const [uploadingBg, setUploadingBg] = useState(false)
  const [regeneratingAudio, setRegeneratingAudio] = useState(false)
  const [mascots, setMascots] = useState<MascotOption[]>([])
  const [selectedMascotId, setSelectedMascotId] = useState<string | null>(null)

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

  const handleLocationStatusChange = useCallback((id: string, status: 'active' | 'inactive') => {
    setLocations(prev => prev.map(loc =>
      loc.id === id ? { ...loc, status } : loc
    ))
  }, [])

  const openEdit = async (id: string) => {
    try {
      const [detail, mascotData] = await Promise.all([
        adminApi.get<LocationDetail>(`/locations/${id}`),
        mascots.length === 0
          ? adminApi.get<{ mascots: MascotOption[] }>('/mascots')
          : Promise.resolve(null),
      ])
      setEditData(detail)
      setEditQuestions(detail.suggested_questions.map(q => q.question))
      setSelectedMascotId(detail.mascot_id)
      setEditingId(id)
      setBgFile(null)
      if (mascotData) setMascots(mascotData.mascots)
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
        mascot_id: selectedMascotId || null,
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
      const result = await adminApi.post<{ intro_audio_url: string; revisit_audio_url: string }>(`/locations/${editingId}/regenerate-audio`)
      setEditData({
        ...editData,
        intro_audio_url: result.intro_audio_url,
        revisit_audio_url: result.revisit_audio_url,
      })
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
    <div className="grid gap-5 xl:grid-cols-[280px_minmax(0,1fr)]">
      <aside className="xl:sticky xl:top-20 xl:self-start">
        <div className="rounded-2xl border border-[#d7e0f0]/80 bg-white p-4 shadow-sm shadow-[#053384]/[0.03]">
          <div>
            <p className="text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-[#7a96c9]">
              Quản lý địa điểm
            </p>
            <h1 className="mt-2 text-[1.45rem] font-bold leading-tight tracking-[-0.01em] text-[#10213f]">
              Địa điểm tham quan
            </h1>
            <p className="mt-2 text-[0.82rem] leading-5 text-[#52627f]">
              Quản lý nội dung giới thiệu, ảnh 360°, câu hỏi gợi ý và trạng thái hiển thị.
            </p>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-2">
            <Badge variant="outline" className="justify-center rounded-xl py-1.5">{activeCount} đang mở</Badge>
            <Badge variant="secondary" className="justify-center rounded-xl py-1.5">{inactiveCount} tạm đóng</Badge>
          </div>

          <nav className="mt-5 flex gap-2 xl:flex-col" aria-label="Chế độ xem địa điểm">
            <button
              onClick={() => setActiveTab('map')}
              className={`flex min-w-0 flex-1 items-start gap-3 rounded-xl px-3 py-3 text-left transition-all xl:flex-none ${
                activeTab === 'map'
                  ? 'bg-[#053384] text-white shadow-sm shadow-[#053384]/20'
                  : 'bg-[#f6f8fb] text-[#52627f] hover:bg-[#eef3fb] hover:text-[#10213f]'
              }`}
            >
              <Map className="mt-0.5 h-4 w-4 shrink-0" />
              <span className="min-w-0">
                <span className="block text-sm font-semibold">Bản đồ</span>
                <span className={`mt-0.5 hidden text-[0.72rem] leading-4 xl:block ${activeTab === 'map' ? 'text-white/70' : 'text-[#7a96c9]'}`}>
                  Xem node trực quan theo khuôn viên.
                </span>
              </span>
            </button>
            <button
              onClick={() => setActiveTab('list')}
              className={`flex min-w-0 flex-1 items-start gap-3 rounded-xl px-3 py-3 text-left transition-all xl:flex-none ${
                activeTab === 'list'
                  ? 'bg-[#053384] text-white shadow-sm shadow-[#053384]/20'
                  : 'bg-[#f6f8fb] text-[#52627f] hover:bg-[#eef3fb] hover:text-[#10213f]'
              }`}
            >
              <MapPin className="mt-0.5 h-4 w-4 shrink-0" />
              <span className="min-w-0">
                <span className="block text-sm font-semibold">Danh sách</span>
                <span className={`mt-0.5 hidden text-[0.72rem] leading-4 xl:block ${activeTab === 'list' ? 'text-white/70' : 'text-[#7a96c9]'}`}>
                  Tìm kiếm và thao tác hàng loạt.
                </span>
              </span>
            </button>
          </nav>

          <div className="mt-5 rounded-xl border border-[#d7e0f0]/70 bg-[#f6f8fb] p-3">
            <p className="text-[0.72rem] font-semibold uppercase tracking-wide text-[#7a96c9]">Chú giải</p>
            <div className="mt-2 grid gap-2 text-[0.78rem] text-[#52627f]">
              <span className="inline-flex items-center gap-2">
                <span className="size-2.5 rounded-full bg-[#22c55e]" /> Đang mở
              </span>
              <span className="inline-flex items-center gap-2">
                <span className="size-2.5 rounded-full bg-[#94a3b8]" /> Tạm đóng
              </span>
              <span className="inline-flex items-center gap-2">
                <span className="size-2.5 rounded-full bg-[#475569]" /> Chưa thiết lập
              </span>
            </div>
          </div>

          <Button variant="outline" size="sm" onClick={fetchLocations} disabled={loading} className="mt-4 w-full rounded-xl">
            <RefreshCw data-icon="inline-start" className={loading ? 'animate-spin' : ''} /> Làm mới
          </Button>
        </div>
      </aside>

      <div className="min-w-0">
        {error && <AdminNotice tone="danger">{error}</AdminNotice>}

        {/* Map Tab */}
        {activeTab === 'map' && (
          <Suspense fallback={
            <AdminSkeleton variant="card" className="h-[620px]" />
          }>
            <MapManagerTab
              onEditLocation={(id) => void openEdit(id)}
              onLocationStatusChange={handleLocationStatusChange}
            />
          </Suspense>
        )}

      {/* Edit Dialog — shared by list and map tabs */}
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
          <div className="flex flex-col gap-5">
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

            {/* Mascot Selector */}
            <div>
              <div className="flex items-center gap-2 mb-2">
                <Bot className="h-4 w-4 text-[#7a96c9]" />
                <label className="text-sm font-medium text-[#10213f]">Đại sứ ảo (Mascot)</label>
              </div>
              <p className="mb-3 text-xs text-[#52627f]">Chọn mascot sẽ xuất hiện khi người dùng tham quan địa điểm này.</p>
              {mascots.length === 0 ? (
                <div className="flex items-center justify-center rounded-xl border border-dashed border-[#d7e0f0] p-8">
                  <p className="text-sm text-[#7a96c9]">Đang tải mascot...</p>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  {mascots.map((m) => {
                    const isSelected = selectedMascotId === m.id
                    return (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => setSelectedMascotId(isSelected ? null : m.id)}
                        className={`group relative flex flex-col overflow-hidden rounded-xl border-2 transition-all duration-200 text-left ${
                          isSelected
                            ? 'border-[#053384] shadow-[0_0_0_3px_rgba(5,51,132,0.12)] ring-1 ring-[#053384]/30'
                            : 'border-[#d7e0f0] hover:border-[#7a96c9] hover:shadow-md'
                        }`}
                      >
                        {/* 3D Preview */}
                        <div className="relative h-48 w-full">
                          <MascotPreview3D modelUrl={m.model_3d_url} />
                          {/* Selection indicator */}
                          {isSelected && (
                            <div className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-full bg-[#053384] text-white shadow-lg">
                              <Check className="h-3.5 w-3.5" />
                            </div>
                          )}
                          {m.is_default && (
                            <div className="absolute left-2 top-2">
                              <Badge className="flex items-center gap-1 rounded-lg bg-gradient-to-r from-[#e3b83c] to-[#d4a22e] px-2 py-0.5 text-[10px] text-white shadow-sm">
                                <Crown className="h-2.5 w-2.5" />
                                Mặc định
                              </Badge>
                            </div>
                          )}
                        </div>
                        {/* Info */}
                        <div className={`flex items-center gap-2 px-3 py-2.5 transition-colors ${
                          isSelected ? 'bg-[#053384]/5' : 'bg-white group-hover:bg-[#f6f8fb]'
                        }`}>
                          <div className={`flex size-7 shrink-0 items-center justify-center rounded-lg ${
                            isSelected
                              ? 'bg-[#053384] text-white'
                              : 'bg-[#eef3fb] text-[#7a96c9] group-hover:bg-[#dce6f5]'
                          }`}>
                            <Bot className="h-3.5 w-3.5" />
                          </div>
                          <div className="min-w-0">
                            <p className={`truncate text-sm font-semibold ${
                              isSelected ? 'text-[#053384]' : 'text-[#10213f]'
                            }`}>{m.name}</p>
                            <p className="truncate text-[10px] font-mono text-[#7a96c9]">{m.slug}</p>
                          </div>
                        </div>
                      </button>
                    )
                  })}
                </div>
              )}
              {selectedMascotId && (
                <button
                  type="button"
                  onClick={() => setSelectedMascotId(null)}
                  className="mt-2 text-xs font-medium text-[#7a96c9] hover:text-[#053384] transition-colors"
                >
                  ✕ Bỏ chọn mascot (sẽ dùng mặc định)
                </button>
              )}
            </div>

            {/* Suggested Questions */}
            <div>
              <label className="text-sm font-medium text-[#10213f]">Câu hỏi gợi ý</label>
              <p className="mt-1 text-xs leading-relaxed text-[#52627f]">
                Câu hỏi mới vẫn chạy được, nhưng cần cache console để kiểm tra và pre-cache nếu muốn phản hồi nhanh theo ms.
              </p>
              <div className="mt-2 flex flex-col gap-2">
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
                <Button variant="outline" size="sm" onClick={() => setEditQuestions([...editQuestions, ''])} className="w-fit rounded-xl">
                  <Plus className="mr-1 h-4 w-4" /> Thêm câu hỏi
                </Button>
                <a
                  href={`/admin/cache?scope=location&target_id=${editingId}&focus=questions`}
                  className="w-fit rounded-xl border border-[#d7e0f0] bg-white px-3 py-2 text-xs font-semibold text-[#053384] transition-colors hover:bg-[#eef3fb]"
                >
                  Mở Cache Console cho câu hỏi này
                </a>
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

        {/* List Tab (existing content) */}
        {activeTab === 'list' && (<>

      <div className="relative max-w-sm">
        <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#7a96c9]" />
        <Input placeholder="Tìm theo tên hoặc slug..." value={search} onChange={e => setSearch(e.target.value)} className="rounded-xl pl-10" />
      </div>

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
    </div>
  )
}
