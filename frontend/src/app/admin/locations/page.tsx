'use client'

import { useEffect, useState, useCallback } from 'react'
import { adminApi } from '@/lib/admin-api'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { AdminNotice, AdminPageHeader } from '../_components/admin-ui'
import {
  MapPin, Image as ImageIcon, ToggleLeft, ToggleRight,
  RefreshCw, Search, Star, Pencil, X, Plus, Trash2, Upload, Volume2,
} from 'lucide-react'

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
            <Badge variant="outline">{activeCount} active</Badge>
            <Badge variant="secondary">{inactiveCount} inactive</Badge>
          </>
        }
        actions={
          <Button variant="outline" size="sm" onClick={fetchLocations} disabled={loading}>
            <RefreshCw data-icon="inline-start" className={loading ? 'animate-spin' : ''} /> Refresh
          </Button>
        }
      />

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input placeholder="Tìm kiếm..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
      </div>

      {error && <AdminNotice tone="danger">{error}</AdminNotice>}

      {/* Edit Dialog */}
      {editingId && editData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-background border rounded-xl shadow-2xl w-full max-w-2xl max-h-[85vh] overflow-y-auto p-6 mx-4">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold">Chỉnh sửa: {editData.name}</h2>
              <Button variant="ghost" size="icon" onClick={() => setEditingId(null)}><X className="h-5 w-5" /></Button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium">Tên location</label>
                <Input value={editData.name} onChange={e => setEditData({ ...editData, name: e.target.value })} />
              </div>
              <div>
                <label className="text-sm font-medium">Mô tả</label>
                <textarea className="w-full min-h-[80px] rounded-md border bg-transparent px-3 py-2 text-sm"
                  value={editData.description} onChange={e => setEditData({ ...editData, description: e.target.value })} />
              </div>
              <div>
                <label className="text-sm font-medium">Intro Message (mascot nói khi vào location)</label>
                <textarea className="w-full min-h-[80px] rounded-md border bg-transparent px-3 py-2 text-sm"
                  value={editData.intro_message} onChange={e => setEditData({ ...editData, intro_message: e.target.value })} />
                <div className="mt-2 flex items-center gap-2">
                  <Button variant="outline" size="sm" onClick={handleRegenerateAudio} disabled={regeneratingAudio || !editData.intro_message.trim()}>
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
                <label className="text-sm font-medium">Câu hỏi gợi ý</label>
                <div className="space-y-2 mt-2">
                  {editQuestions.map((q, idx) => (
                    <div key={idx} className="flex gap-2">
                      <Input value={q} onChange={e => {
                        const updated = [...editQuestions]; updated[idx] = e.target.value; setEditQuestions(updated)
                      }} placeholder={`Câu hỏi ${idx + 1}`} />
                      <Button variant="ghost" size="icon" onClick={() => setEditQuestions(editQuestions.filter((_, i) => i !== idx))}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  ))}
                  <Button variant="outline" size="sm" onClick={() => setEditQuestions([...editQuestions, ''])}>
                    <Plus className="mr-1 h-4 w-4" /> Thêm câu hỏi
                  </Button>
                </div>
              </div>

              {/* Background Upload */}
              <div>
                <label className="text-sm font-medium">Ảnh nền 360°</label>
                {editData.background_url && (
                  <p className="text-xs text-muted-foreground mt-1 truncate">Hiện tại: {editData.background_url}</p>
                )}
                <div className="mt-2">
                  <label className="flex items-center gap-2 cursor-pointer rounded-md border border-dashed p-3 hover:bg-muted/50 transition-colors">
                    <Upload className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm">{bgFile ? bgFile.name : 'Chọn ảnh mới (tùy chọn)'}</span>
                    <input type="file" accept="image/*" className="hidden" onChange={e => setBgFile(e.target.files?.[0] || null)} />
                  </label>
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 mt-6 pt-4 border-t">
              <Button variant="outline" onClick={() => setEditingId(null)}>Hủy</Button>
              <Button onClick={handleSave} disabled={saving || uploadingBg}>
                {saving ? 'Đang lưu...' : uploadingBg ? 'Đang upload ảnh...' : 'Lưu thay đổi'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Location Cards */}
      {loading && locations.length === 0 ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map(i => (
            <Card key={i} className="animate-pulse">
              <CardHeader><div className="h-5 w-32 rounded bg-muted" /></CardHeader>
              <CardContent><div className="h-16 rounded bg-muted" /></CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filtered.map(loc => (
            <Card key={loc.id} className={`transition-all ${loc.status === 'inactive' ? 'opacity-60' : ''}`}>
              <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-3">
                <div className="space-y-1 min-w-0 flex-1">
                  <CardTitle className="text-base flex items-center gap-2">
                    <MapPin className="h-4 w-4 text-primary shrink-0" />
                    <span className="truncate">{loc.name}</span>
                    {loc.is_start_node && <Star className="h-3.5 w-3.5 text-amber-500 shrink-0" />}
                  </CardTitle>
                  <p className="text-xs text-muted-foreground font-mono">/{loc.slug}</p>
                </div>
                <Badge variant={loc.status === 'active' ? 'default' : 'secondary'}>{loc.status}</Badge>
              </CardHeader>
              <CardContent className="space-y-3">
                {loc.description && <p className="text-sm text-muted-foreground line-clamp-2">{loc.description}</p>}
                <div className="flex items-center gap-4 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1"><ImageIcon className="h-3.5 w-3.5" /> {loc.media_count} media</span>
                </div>
                <div className="flex items-center justify-between pt-2 border-t">
                  <Button variant="ghost" size="sm" onClick={() => openEdit(loc.id)}>
                    <Pencil className="mr-1.5 h-4 w-4" /> Edit
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => handleToggleStatus(loc.id)} disabled={togglingId === loc.id}
                    className={loc.status === 'active' ? 'text-green-600' : 'text-muted-foreground'}>
                    {loc.status === 'active' ? <ToggleRight className="mr-1.5 h-4 w-4" /> : <ToggleLeft className="mr-1.5 h-4 w-4" />}
                    {togglingId === loc.id ? '...' : loc.status}
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {!loading && filtered.length === 0 && (
        <div className="text-center py-12 text-muted-foreground">
          {search ? 'Không tìm thấy.' : 'Chưa có location nào.'}
        </div>
      )}
    </div>
  )
}
