'use client'

import { useEffect, useState, useCallback } from 'react'
import { adminApi } from '@/lib/admin-api'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { AdminNotice, AdminPageHeader } from '../_components/admin-ui'
import { Bot, RefreshCw, Save } from 'lucide-react'

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
        description="Quản lý mascot 3D, giọng đọc và personality prompt dùng trong trải nghiệm hỏi đáp."
        actions={
          <Button variant="outline" size="sm" onClick={fetchMascots} disabled={loading}>
            <RefreshCw data-icon="inline-start" className={loading ? 'animate-spin' : ''} /> Refresh
          </Button>
        }
      />

      {error && <AdminNotice tone="danger">{error}</AdminNotice>}
      {saveSuccess && <AdminNotice tone="success">Lưu thành công!</AdminNotice>}

      {loading && mascots.length === 0 ? (
        <Card className="animate-pulse"><CardContent className="p-6"><div className="h-32 rounded bg-muted" /></CardContent></Card>
      ) : (
        <div className="space-y-4">
          {mascots.map(m => (
            <Card key={m.id}>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center gap-2">
                    <Bot className="h-5 w-5 text-primary" />
                    {editId === m.id ? (
                      <Input value={editForm.name || ''} onChange={e => setEditForm({ ...editForm, name: e.target.value })}
                        className="max-w-xs" />
                    ) : m.name}
                    {m.is_default && <Badge>Mặc định</Badge>}
                  </CardTitle>
                  {editId !== m.id && (
                    <Button variant="outline" size="sm" onClick={() => startEdit(m)}>Chỉnh sửa</Button>
                  )}
                </div>
                <CardDescription className="font-mono text-xs">Slug: {m.slug} • Model: {m.model_3d_url}</CardDescription>
              </CardHeader>
              <CardContent>
                {editId === m.id ? (
                  <div className="space-y-4">
                    <div className="grid gap-4 md:grid-cols-2">
                      <div>
                        <label className="text-sm font-medium">Voice Name (Google TTS)</label>
                        <Input value={editForm.voice_name || ''} onChange={e => setEditForm({ ...editForm, voice_name: e.target.value })}
                          placeholder="VD: Leda, Puck" />
                      </div>
                      <div>
                        <label className="text-sm font-medium">Voice Style</label>
                        <Input value={editForm.voice_style || ''} onChange={e => setEditForm({ ...editForm, voice_style: e.target.value })}
                          placeholder="VD: friendly, formal" />
                      </div>
                    </div>
                    <div>
                      <label className="text-sm font-medium">Personality Prompt</label>
                      <textarea className="w-full min-h-[120px] rounded-md border bg-transparent px-3 py-2 text-sm mt-1"
                        value={editForm.personality_prompt || ''}
                        onChange={e => setEditForm({ ...editForm, personality_prompt: e.target.value })}
                        placeholder="Mô tả tính cách của mascot, sẽ được gửi vào system prompt của Gemini..." />
                    </div>
                    <div className="flex gap-2">
                      <Button onClick={handleSave} disabled={saving}>
                        <Save className="mr-2 h-4 w-4" /> {saving ? 'Đang lưu...' : 'Lưu thay đổi'}
                      </Button>
                      <Button variant="outline" onClick={() => setEditId(null)}>Hủy</Button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="rounded-lg border p-3">
                        <p className="text-xs text-muted-foreground font-medium mb-1">Voice</p>
                        <p className="text-sm">{m.voice_name}{m.voice_style ? ` • ${m.voice_style}` : ''}</p>
                      </div>
                      <div className="rounded-lg border p-3">
                        <p className="text-xs text-muted-foreground font-medium mb-1">Cập nhật</p>
                        <p className="text-sm">{m.updated_at ? new Date(m.updated_at).toLocaleString('vi-VN') : '—'}</p>
                      </div>
                    </div>
                    {m.personality_prompt && (
                      <div className="rounded-lg border p-3">
                        <p className="text-xs text-muted-foreground font-medium mb-1">Personality Prompt</p>
                        <p className="text-sm whitespace-pre-wrap line-clamp-4">{m.personality_prompt}</p>
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {!loading && mascots.length === 0 && (
        <div className="text-center py-12 text-muted-foreground">Chưa có mascot nào trong database.</div>
      )}
    </div>
  )
}
