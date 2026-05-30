'use client'

import { useEffect, useState, useCallback } from 'react'
import { adminApi } from '@/lib/admin-api'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  AdminEmptyState,
  AdminNotice,
  AdminPageHeader,
  AdminPanel,
  AdminSkeleton,
  AdminTextarea,
} from '../_components/admin-ui'
import { Bot, RefreshCw, Save, Mic, Sparkles, X } from 'lucide-react'

interface MascotItem {
  id: string; name: string; slug: string; model_3d_url: string
  voice_name: string; voice_style: string; personality_prompt: string
  is_default: boolean; updated_at: string | null
}

export default function MascotsPage() {
  const [mascots, setMascots] = useState<MascotItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [editId, setEditId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState<Partial<MascotItem>>({})
  const [saving, setSaving] = useState(false)
  const [saveSuccess, setSaveSuccess] = useState(false)

  const fetchMascots = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const data = await adminApi.get<{ mascots: MascotItem[] }>('/mascots')
      setMascots(data.mascots)
    } catch (err) { setError(err instanceof Error ? err.message : 'Không thể tải') }
    finally { setLoading(false) }
  }, [])

  useEffect(() => {
    void Promise.resolve().then(fetchMascots)
  }, [fetchMascots])

  const startEdit = (m: MascotItem) => {
    setEditId(m.id)
    setEditForm({ name: m.name, voice_name: m.voice_name, voice_style: m.voice_style, personality_prompt: m.personality_prompt })
    setSaveSuccess(false)
  }

  const handleSave = async () => {
    if (!editId) return
    setSaving(true)
    try {
      const formData = new FormData()
      formData.append('name', editForm.name || '')
      formData.append('voice_name', editForm.voice_name || 'Leda')
      formData.append('voice_style', editForm.voice_style || '')
      formData.append('personality_prompt', editForm.personality_prompt || '')
      await adminApi.uploadPut(`/mascots/${editId}`, formData)
      setSaveSuccess(true)
      fetchMascots()
      setTimeout(() => setSaveSuccess(false), 3000)
    } catch (err) { setError(err instanceof Error ? err.message : 'Lỗi lưu') }
    finally { setSaving(false) }
  }

  return (
    <div className="flex flex-col gap-6">
      <AdminPageHeader
        title="Đại sứ ảo"
        description="Quản lý mascot 3D, giọng đọc và personality prompt dùng trong trải nghiệm hỏi đáp tại kiosk."
        actions={
          <Button variant="outline" size="sm" onClick={fetchMascots} disabled={loading} className="rounded-xl">
            <RefreshCw data-icon="inline-start" className={loading ? 'animate-spin' : ''} /> Làm mới
          </Button>
        }
      />

      {error && <AdminNotice tone="danger">{error}</AdminNotice>}
      {saveSuccess && <AdminNotice tone="success">✓ Lưu thành công!</AdminNotice>}

      {loading && mascots.length === 0 ? (
        <div className="space-y-4">
          <AdminSkeleton variant="card" className="h-48" />
        </div>
      ) : (
        <div className="space-y-5">
          {mascots.map(m => (
            <AdminPanel key={m.id} className="overflow-hidden">
              {/* Header */}
              <div className="flex items-center justify-between gap-4 border-b border-[#d7e0f0]/70 px-5 py-4">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-[#053384] to-[#0a4cb8] text-white shadow-sm">
                    <Bot className="h-5 w-5" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      {editId === m.id ? (
                        <Input
                          value={editForm.name || ''}
                          onChange={e => setEditForm({ ...editForm, name: e.target.value })}
                          className="h-8 max-w-xs rounded-lg text-sm font-semibold"
                        />
                      ) : (
                        <h3 className="text-[0.95rem] font-semibold text-[#10213f]">{m.name}</h3>
                      )}
                      {m.is_default && (
                        <Badge className="rounded-lg bg-[#e3b83c] text-xs text-white">Mặc định</Badge>
                      )}
                    </div>
                    <p className="mt-0.5 font-mono text-xs text-[#7a96c9]">
                      {m.slug} • {m.model_3d_url}
                    </p>
                  </div>
                </div>
                {editId !== m.id ? (
                  <Button variant="outline" size="sm" onClick={() => startEdit(m)} className="rounded-xl">
                    Chỉnh sửa
                  </Button>
                ) : (
                  <Button variant="ghost" size="icon" onClick={() => setEditId(null)} className="rounded-xl">
                    <X className="h-4 w-4" />
                  </Button>
                )}
              </div>

              {/* Body */}
              <div className="p-5">
                {editId === m.id ? (
                  <div className="space-y-4">
                    <div className="grid gap-4 md:grid-cols-2">
                      <label className="flex flex-col gap-1.5 rounded-xl border border-[#d7e0f0] p-4">
                        <div className="flex items-center gap-2">
                          <Mic className="h-4 w-4 text-[#7a96c9]" />
                          <span className="text-sm font-medium text-[#10213f]">Voice Name (Google TTS)</span>
                        </div>
                        <Input
                          value={editForm.voice_name || ''}
                          onChange={e => setEditForm({ ...editForm, voice_name: e.target.value })}
                          placeholder="VD: Leda, Puck"
                          className="rounded-xl"
                        />
                      </label>
                      <label className="flex flex-col gap-1.5 rounded-xl border border-[#d7e0f0] p-4">
                        <div className="flex items-center gap-2">
                          <Sparkles className="h-4 w-4 text-[#7a96c9]" />
                          <span className="text-sm font-medium text-[#10213f]">Voice Style</span>
                        </div>
                        <Input
                          value={editForm.voice_style || ''}
                          onChange={e => setEditForm({ ...editForm, voice_style: e.target.value })}
                          placeholder="VD: friendly, formal"
                          className="rounded-xl"
                        />
                      </label>
                    </div>
                    <div className="rounded-xl border border-[#d7e0f0] p-4">
                      <div className="flex items-center gap-2 mb-2">
                        <Bot className="h-4 w-4 text-[#7a96c9]" />
                        <span className="text-sm font-medium text-[#10213f]">Personality Prompt</span>
                      </div>
                      <p className="mb-2 text-xs text-[#52627f]">
                        Mô tả tính cách mascot, được gửi vào system prompt của Gemini khi hội thoại.
                      </p>
                      <AdminTextarea
                        className="min-h-[120px]"
                        value={editForm.personality_prompt || ''}
                        onChange={e => setEditForm({ ...editForm, personality_prompt: e.target.value })}
                        placeholder="Mô tả tính cách của mascot..."
                      />
                    </div>
                    <div className="flex gap-2 pt-1">
                      <Button onClick={handleSave} disabled={saving} className="rounded-xl shadow-sm">
                        <Save className="mr-2 h-4 w-4" /> {saving ? 'Đang lưu...' : 'Lưu thay đổi'}
                      </Button>
                      <Button variant="outline" onClick={() => setEditId(null)} className="rounded-xl">Hủy</Button>
                    </div>
                  </div>
                ) : (
                  <div className="grid gap-3 md:grid-cols-3">
                    <div className="rounded-xl border border-[#d7e0f0] p-3.5">
                      <div className="flex items-center gap-2 mb-1">
                        <Mic className="h-3.5 w-3.5 text-[#7a96c9]" />
                        <p className="text-xs font-medium text-[#52627f]">Giọng đọc</p>
                      </div>
                      <p className="text-sm font-medium text-[#10213f]">{m.voice_name}{m.voice_style ? ` • ${m.voice_style}` : ''}</p>
                    </div>
                    <div className="rounded-xl border border-[#d7e0f0] p-3.5">
                      <div className="flex items-center gap-2 mb-1">
                        <Bot className="h-3.5 w-3.5 text-[#7a96c9]" />
                        <p className="text-xs font-medium text-[#52627f]">Model 3D</p>
                      </div>
                      <p className="truncate text-sm font-medium font-mono text-[#10213f]">{m.slug}</p>
                    </div>
                    <div className="rounded-xl border border-[#d7e0f0] p-3.5">
                      <div className="flex items-center gap-2 mb-1">
                        <Sparkles className="h-3.5 w-3.5 text-[#7a96c9]" />
                        <p className="text-xs font-medium text-[#52627f]">Cập nhật</p>
                      </div>
                      <p className="text-sm font-medium text-[#10213f]">{m.updated_at ? new Date(m.updated_at).toLocaleString('vi-VN') : '—'}</p>
                    </div>
                    {m.personality_prompt && (
                      <div className="rounded-xl border border-[#d7e0f0] p-3.5 md:col-span-3">
                        <p className="mb-1 text-xs font-medium text-[#52627f]">Personality Prompt</p>
                        <p className="whitespace-pre-wrap text-sm leading-relaxed text-[#10213f] line-clamp-4">{m.personality_prompt}</p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </AdminPanel>
          ))}
        </div>
      )}

      {!loading && mascots.length === 0 && (
        <AdminEmptyState
          icon={Bot}
          title="Chưa có đại sứ ảo nào"
          description="Tạo mascot 3D mới để bắt đầu tương tác với sinh viên."
        />
      )}
    </div>
  )
}
