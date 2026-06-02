'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { adminApi } from '@/lib/admin-api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  AdminEmptyState,
  AdminMetricStrip,
  AdminModal,
  AdminNotice,
  AdminPageHeader,
  AdminPanel,
  AdminSelect,
  AdminSkeleton,
  AdminSwitch,
  AdminTextarea,
  AdminStatusPill,
} from '../_components/admin-ui'
import MascotPreview3D, { type MascotPreviewAnimation } from '../_components/MascotPreview3D'
import {
  Bot,
  RefreshCw,
  Save,
  Mic,
  Sparkles,
  X,
  MapPin,
  Crown,
  Box,
  ChevronDown,
  ChevronUp,
  Clock,
  Pencil,
  Volume2,
  Eye,
  AlertTriangle,
} from 'lucide-react'

/* ─── Types ─── */

interface MascotItem {
  id: string
  name: string
  slug: string
  model_3d_url: string
  voice_name: string
  voice_style: string
  personality_prompt: string
  is_default: boolean
  location_count: number
  location_names: string[]
  updated_at: string | null
}

interface VoicePreviewResponse {
  audio_url: string
  provider: string
  cached: boolean
  content_type: string
  storage_key: string | null
}

/* ─── Gemini TTS Voices (matches backend VALID_GEMINI_VOICES) ─── */

const GEMINI_VOICES = [
  'Achernar', 'Achird', 'Algenib', 'Algieba', 'Alnilam', 'Aoede',
  'Autonoe', 'Callirrhoe', 'Charon', 'Despina', 'Enceladus', 'Erinome',
  'Fenrir', 'Gacrux', 'Iapetus', 'Kore', 'Laomedeia', 'Leda', 'Orus',
  'Puck', 'Pulcherrima', 'Rasalgethi', 'Sadachbia', 'Sadaltager',
  'Schedar', 'Sulafat', 'Umbriel', 'Vindemiatrix', 'Zephyr',
  'Zubenelgenubi',
] as const

const MASCOT_ACTIONS: Array<{
  id: MascotPreviewAnimation
  label: string
  description: string
  clips: string[]
}> = [
  { id: 'Idle', label: 'Idle', description: 'Tư thế chờ tự nhiên', clips: ['Idle', 'HeadNod'] },
  { id: 'Greeting', label: 'Chào hỏi', description: 'Dùng khi bắt đầu tour', clips: ['Greeting', 'StandingUp'] },
  { id: 'Talking', label: 'Trả lời', description: 'Loop khi phát TTS', clips: ['Talking', 'HeadNod', 'Texting'] },
  { id: 'Thinking', label: 'Suy nghĩ', description: 'Khi đang xử lý câu hỏi', clips: ['Thinking', 'Texting'] },
  { id: 'Thankful', label: 'Tạm biệt', description: 'Kết thúc lượt tương tác', clips: ['Thankful'] },
]

/* ─── Main Page ─── */

export default function MascotsPage() {
  const [mascots, setMascots] = useState<MascotItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [editId, setEditId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState<Partial<MascotItem>>({})
  const [saving, setSaving] = useState(false)
  const [saveSuccess, setSaveSuccess] = useState(false)
  const [expandedPrompt, setExpandedPrompt] = useState<string | null>(null)
  const [previewMascot, setPreviewMascot] = useState<MascotItem | null>(null)
  const [previewAnimation, setPreviewAnimation] = useState<MascotPreviewAnimation>('Idle')
  const [previewClipNames, setPreviewClipNames] = useState<string[]>([])
  const [previewClipsLoaded, setPreviewClipsLoaded] = useState(false)
  const [pendingSaveId, setPendingSaveId] = useState<string | null>(null)
  const [voicePreviewingId, setVoicePreviewingId] = useState<string | null>(null)
  const [voicePreviewError, setVoicePreviewError] = useState<string | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const voicePreviewCacheRef = useRef<Map<string, VoicePreviewResponse>>(new Map())

  const fetchMascots = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await adminApi.get<{ mascots: MascotItem[] }>('/mascots')
      setMascots(data.mascots)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không thể tải')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void Promise.resolve().then(fetchMascots)
  }, [fetchMascots])

  useEffect(() => {
    return () => {
      audioRef.current?.pause()
    }
  }, [])

  const startEdit = (m: MascotItem) => {
    setEditId(m.id)
    setEditForm({
      name: m.name,
      voice_name: m.voice_name,
      voice_style: m.voice_style,
      personality_prompt: m.personality_prompt,
      is_default: m.is_default,
    })
    setSaveSuccess(false)
  }

  const openPreview = (m: MascotItem) => {
    setPreviewMascot(m)
    setPreviewAnimation('Idle')
    setPreviewClipNames([])
    setPreviewClipsLoaded(false)
  }

  const closePreview = () => {
    setPreviewMascot(null)
    setPreviewAnimation('Idle')
    setPreviewClipNames([])
    setPreviewClipsLoaded(false)
  }

  const playVoicePreview = async (m: MascotItem, useDraft = false) => {
    const payload = useDraft && editId === m.id
      ? {
          name: editForm.name || m.name,
          voice_name: editForm.voice_name || m.voice_name,
          voice_style: editForm.voice_style || '',
          personality_prompt: editForm.personality_prompt || '',
        }
      : {
          name: m.name,
          voice_name: m.voice_name,
          voice_style: m.voice_style,
          personality_prompt: m.personality_prompt,
        }

    setVoicePreviewError(null)
    try {
      audioRef.current?.pause()
      const cacheKey = JSON.stringify(payload)
      let preview = voicePreviewCacheRef.current.get(cacheKey)
      if (!preview) {
        setVoicePreviewingId(m.id)
        preview = await adminApi.post<VoicePreviewResponse>('/mascots/voice-preview', payload)
        voicePreviewCacheRef.current.set(cacheKey, preview)
      }
      const audio = new Audio(preview.audio_url)
      audioRef.current = audio
      await audio.play()
    } catch (err) {
      setVoicePreviewError(err instanceof Error ? err.message : 'Không thể tạo giọng đọc mẫu')
    } finally {
      setVoicePreviewingId(null)
    }
  }

  const changedFields = (m: MascotItem | undefined) => {
    if (!m) return []
    const changes: string[] = []
    if ((editForm.name || '') !== m.name) changes.push('Tên hiển thị')
    if ((editForm.voice_name || 'Leda') !== m.voice_name) changes.push('Giọng đọc')
    if ((editForm.voice_style || '') !== (m.voice_style || '')) changes.push('Giọng điệu')
    if ((editForm.personality_prompt || '') !== (m.personality_prompt || '')) changes.push('Personality prompt')
    if ((editForm.is_default ?? false) !== m.is_default) changes.push('Đại sứ mặc định')
    return changes
  }

  const requestSave = () => {
    if (!editId) return
    setPendingSaveId(editId)
  }

  const handleSave = async () => {
    if (!editId) return
    setSaving(true)
    try {
      await adminApi.put(`/mascots/${editId}`, {
        name: editForm.name || '',
        voice_name: editForm.voice_name || 'Leda',
        voice_style: editForm.voice_style || '',
        personality_prompt: editForm.personality_prompt || '',
        is_default: editForm.is_default ?? false,
      })
      setSaveSuccess(true)
      setEditId(null)
      setPendingSaveId(null)
      fetchMascots()
      setTimeout(() => setSaveSuccess(false), 3000)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Lỗi lưu')
    } finally {
      setSaving(false)
    }
  }

  const defaultMascot = mascots.find((m) => m.is_default)
  const assignedLocationCount = mascots.reduce((sum, mascot) => sum + mascot.location_count, 0)
  const pendingSaveMascot = mascots.find((m) => m.id === pendingSaveId)
  const pendingChanges = changedFields(pendingSaveMascot)

  return (
    <div className="flex flex-col gap-6">
      <AdminPageHeader
        title="Đại sứ ảo"
        description="Quản lý mascot 3D, giọng đọc và personality prompt dùng trong trải nghiệm hỏi đáp tại kiosk."
        actions={
          <Button
            variant="outline"
            size="sm"
            onClick={fetchMascots}
            disabled={loading}
            className="rounded-xl"
          >
            <RefreshCw
              data-icon="inline-start"
              className={loading ? 'animate-spin' : ''}
            />{' '}
            Làm mới
          </Button>
        }
      />

      {error && <AdminNotice tone="danger">{error}</AdminNotice>}
      {saveSuccess && (
        <AdminNotice tone="success">✓ Cập nhật hồ sơ AI thành công!</AdminNotice>
      )}
      {voicePreviewError && <AdminNotice tone="danger">{voicePreviewError}</AdminNotice>}

      {!loading && mascots.length > 0 && (
        <AdminMetricStrip
          metrics={[
            { label: 'Mascot', value: mascots.length, description: 'Hồ sơ đại sứ ảo' },
            { label: 'Mặc định', value: defaultMascot?.name ?? 'Chưa chọn', color: '#b8891f' },
            { label: 'Địa điểm gán', value: assignedLocationCount, color: '#053384' },
            { label: 'Giọng TTS', value: new Set(mascots.map((m) => m.voice_name)).size, description: 'Voice đang dùng' },
          ]}
        />
      )}

      {loading && mascots.length === 0 ? (
        <div className="space-y-4">
          <AdminSkeleton variant="card" className="h-72" />
          <AdminSkeleton variant="card" className="h-72" />
        </div>
      ) : (
        <div className="grid gap-5">
          {mascots.map((m) => (
            <AdminPanel key={m.id} className="overflow-hidden !rounded-2xl">
              <div className="grid divide-y divide-[#d7e0f0]/70 lg:grid-cols-[250px_minmax(0,1fr)] lg:divide-x lg:divide-y-0">
                {/* ─── LEFT: 3D Preview Frame ─── */}
                <div className="flex flex-col bg-[#f8fbff]">
                  <div className="flex items-start justify-between gap-3 p-4">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-[#053384] to-[#0a4cb8] text-white shadow-sm">
                        <Bot className="h-5 w-5" />
                      </div>
                      <div className="min-w-0">
                        <h3 className="text-base font-bold text-[#10213f] truncate">
                          {m.name}
                        </h3>
                        <p className="mt-0.5 font-mono text-[0.7rem] text-[#7a96c9] truncate">
                          /{m.slug}
                        </p>
                      </div>
                    </div>
                    {m.is_default && (
                      <AdminStatusPill
                        status="warning"
                        label={<><Crown className="mr-1 inline h-3 w-3" /> Mặc định</>}
                        className="shrink-0 bg-gradient-to-r from-[#e3b83c] to-[#d4a22e] text-white border-none shadow-sm"
                      />
                    )}
                  </div>

                  <div className="relative h-[220px] w-full overflow-hidden border-y border-[#d7e0f0]/70 bg-gradient-to-b from-white to-[#eef3fb]">
                    <MascotPreview3D modelUrl={m.model_3d_url} />
                  </div>

                  <div className="flex flex-col gap-2 bg-white p-3 text-xs text-[#52627f]">
                    <div className="flex items-center justify-between">
                      <span className="flex items-center gap-1.5"><Box className="h-3.5 w-3.5 text-[#7a96c9]" /> File Model 3D:</span>
                      <span className="font-mono text-[#10213f] truncate max-w-[140px]" title={m.model_3d_url}>{m.model_3d_url.split('/').pop()}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="flex items-center gap-1.5"><Clock className="h-3.5 w-3.5 text-[#7a96c9]" /> Cập nhật lần cuối:</span>
                      <span className="text-[#10213f]">{m.updated_at ? new Date(m.updated_at).toLocaleDateString('vi-VN') : '—'}</span>
                    </div>
                    <div className="grid grid-cols-2 gap-2 pt-1">
                      <Button variant="outline" size="sm" onClick={() => openPreview(m)} className="h-8 rounded-xl text-xs">
                        <Eye className="mr-1.5 h-3.5 w-3.5" />
                        Động tác
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => playVoicePreview(m, editId === m.id)}
                        disabled={voicePreviewingId === m.id}
                        className="h-8 rounded-xl text-xs"
                      >
                        <Volume2 className="mr-1.5 h-3.5 w-3.5" />
                        {voicePreviewingId === m.id ? 'Đang tạo' : 'Nghe'}
                      </Button>
                    </div>
                  </div>
                </div>

                {/* ─── RIGHT: Configuration ─── */}
                <div className="flex flex-col bg-white">
                  {/* Toolbar */}
                  <div className="flex items-center justify-between border-b border-[#d7e0f0]/70 bg-white px-5 py-3">
                    <h3 className="text-sm font-semibold text-[#10213f]">Hồ sơ hội thoại</h3>
                    {editId !== m.id ? (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => startEdit(m)}
                        className="rounded-xl h-8 px-3 text-xs shadow-sm bg-white"
                      >
                        <Pencil className="mr-1.5 h-3.5 w-3.5" />
                        Chỉnh sửa
                      </Button>
                    ) : (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setEditId(null)}
                        className="rounded-xl h-8 px-3 text-xs text-[#52627f]"
                      >
                        <X className="mr-1.5 h-3.5 w-3.5" /> Đóng
                      </Button>
                    )}
                  </div>

                  {/* Body */}
                  <div className="flex-1 bg-[#fbfdff] p-4">
                    {editId === m.id ? (
                      /* EDIT MODE */
                      <div className="grid gap-4 2xl:grid-cols-[minmax(0,1fr)_300px]">
                        <div className="grid gap-4">
                          <label className="flex flex-col gap-1.5">
                            <span className="text-sm font-semibold text-[#10213f]">Tên hiển thị</span>
                            <Input
                              value={editForm.name || ''}
                              onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                              placeholder="VD: Kaito, ViVy"
                              className="rounded-xl bg-white shadow-sm"
                            />
                          </label>

                          <div className="grid gap-4 md:grid-cols-2">
                            <label className="flex flex-col gap-1.5">
                              <span className="flex items-center gap-2 text-sm font-semibold text-[#10213f]">
                                <Mic className="h-4 w-4 text-[#053384]" /> Giọng đọc TTS
                              </span>
                              <AdminSelect
                                value={editForm.voice_name || 'Leda'}
                                onChange={(e) => setEditForm({ ...editForm, voice_name: e.target.value })}
                                className="bg-white shadow-sm"
                              >
                                {GEMINI_VOICES.map((voice) => (
                                  <option key={voice} value={voice}>{voice}</option>
                                ))}
                              </AdminSelect>
                            </label>
                            <label className="flex flex-col gap-1.5">
                              <span className="flex items-center gap-2 text-sm font-semibold text-[#10213f]">
                                <Sparkles className="h-4 w-4 text-[#053384]" /> Giọng điệu
                              </span>
                              <Input
                                value={editForm.voice_style || ''}
                                onChange={(e) => setEditForm({ ...editForm, voice_style: e.target.value })}
                                placeholder="friendly, warm, enthusiastic"
                                className="rounded-xl bg-white shadow-sm"
                              />
                            </label>
                          </div>

                          <label className="flex flex-col gap-1.5">
                            <div className="flex items-center justify-between">
                              <span className="text-sm font-semibold text-[#10213f]">Personality Prompt</span>
                              <span className="text-[0.72rem] font-medium text-[#7a96c9]">Gemini system prompt</span>
                            </div>
                            <AdminTextarea
                              className="min-h-[150px] font-mono text-[0.82rem] leading-relaxed bg-white shadow-sm"
                              value={editForm.personality_prompt || ''}
                              onChange={(e) => setEditForm({ ...editForm, personality_prompt: e.target.value })}
                              placeholder="Đóng vai một đại sứ thân thiện, luôn xưng 'mình'..."
                            />
                          </label>
                        </div>

                        <aside className="grid content-start gap-3">
                          <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-3 text-xs leading-relaxed text-amber-900">
                            <div className="flex items-start gap-2">
                              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                              <p>
                                Đổi tên, giọng hoặc prompt có thể làm intro audio và QA cache cũ không còn khớp.
                              </p>
                            </div>
                          </div>

                          <div className="rounded-xl border border-[#d7e0f0] bg-white p-2 shadow-sm">
                            <AdminSwitch
                              checked={editForm.is_default ?? false}
                              onChange={(checked) => setEditForm({ ...editForm, is_default: checked })}
                              label="Đại sứ mặc định"
                              description="Áp dụng cho địa điểm chưa chọn mascot riêng."
                            />
                          </div>

                          <div className="grid gap-2 rounded-xl border border-[#d7e0f0] bg-white p-3 shadow-sm">
                            <Button onClick={requestSave} disabled={saving} className="h-9 rounded-xl shadow-sm">
                              <Save className="mr-2 h-4 w-4" /> {saving ? 'Đang lưu...' : 'Lưu hồ sơ'}
                            </Button>
                            <div className="grid grid-cols-2 gap-2">
                              <Button
                                variant="outline"
                                onClick={() => playVoicePreview(m, true)}
                                disabled={voicePreviewingId === m.id}
                                className="h-9 rounded-xl"
                              >
                                <Volume2 className="mr-2 h-4 w-4" />
                                {voicePreviewingId === m.id ? 'Đang tạo' : 'Nghe'}
                              </Button>
                              <Button variant="outline" onClick={() => setEditId(null)} className="h-9 rounded-xl">
                                Hủy
                              </Button>
                            </div>
                          </div>
                        </aside>
                      </div>
                    ) : (
                      /* VIEW MODE */
                      <div className="flex flex-col gap-4">
                        <div className="grid gap-4 sm:grid-cols-2">
                          <div className="rounded-xl border border-[#d7e0f0]/80 bg-white p-4 shadow-sm shadow-[#053384]/[0.02]">
                            <div className="flex items-center gap-2 mb-2">
                              <div className="flex size-7 items-center justify-center rounded-md bg-[#eef3fb] text-[#053384]">
                                <Mic className="h-4 w-4" />
                              </div>
                              <p className="text-sm font-bold text-[#10213f]">Giọng đọc</p>
                            </div>
                            <p className="text-lg font-bold text-[#053384]">{m.voice_name}</p>
                          </div>
                          <div className="rounded-xl border border-[#d7e0f0]/80 bg-white p-4 shadow-sm shadow-[#053384]/[0.02]">
                            <div className="flex items-center gap-2 mb-2">
                              <div className="flex size-7 items-center justify-center rounded-md bg-[#eef3fb] text-[#053384]">
                                <Sparkles className="h-4 w-4" />
                              </div>
                              <p className="text-sm font-bold text-[#10213f]">Giọng điệu</p>
                            </div>
                            <p className="text-[0.9rem] font-medium text-[#10213f]">{m.voice_style || 'Mặc định'}</p>
                          </div>
                        </div>

                        <div className="overflow-hidden rounded-xl border border-[#d7e0f0]/80 bg-white shadow-sm shadow-[#053384]/[0.02]">
                          <div className="flex items-center justify-between border-b border-[#d7e0f0]/70 bg-[#f6f8fb] px-4 py-3">
                            <h4 className="text-sm font-bold text-[#10213f]">Personality Prompt</h4>
                            {m.personality_prompt && m.personality_prompt.length > 150 && (
                              <button
                                type="button"
                                onClick={() => setExpandedPrompt(expandedPrompt === m.id ? null : m.id)}
                                className="flex items-center gap-1 text-[0.78rem] font-medium text-[#053384] hover:text-[#0a4cb8] transition-colors"
                              >
                                {expandedPrompt === m.id ? (
                                  <><ChevronUp className="h-3 w-3" /> Thu gọn</>
                                ) : (
                                  <><ChevronDown className="h-3 w-3" /> Mở rộng</>
                                )}
                              </button>
                            )}
                          </div>
                          <div className="bg-white p-4">
                            <p className={`whitespace-pre-wrap text-[0.82rem] leading-relaxed text-[#10213f] ${
                              expandedPrompt === m.id ? '' : 'line-clamp-4'
                            }`}>
                              {m.personality_prompt || 'Chưa thiết lập prompt tính cách.'}
                            </p>
                          </div>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <a
                            href={`/admin/cache?scope=mascot&mascotId=${m.id}&focus=voice`}
                            className="rounded-xl border border-[#d7e0f0] bg-white px-3 py-2 text-xs font-semibold text-[#053384] transition-colors hover:bg-[#eef3fb]"
                          >
                            Mở Cache Console
                          </a>
                          <button
                            type="button"
                            onClick={() => playVoicePreview(m)}
                            disabled={voicePreviewingId === m.id}
                            className="rounded-xl border border-[#d7e0f0] bg-white px-3 py-2 text-xs font-semibold text-[#52627f] transition-colors hover:bg-[#eef3fb] disabled:opacity-50"
                          >
                            {voicePreviewingId === m.id ? 'Đang tạo giọng...' : 'Nghe thử giọng'}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Usage Strip */}
                  <div className="border-t border-[#d7e0f0]/70 bg-white px-5 py-4">
                    <div className="flex flex-col gap-2">
                      <div className="flex items-center justify-between">
                        <span className="flex items-center gap-1.5 text-sm font-semibold text-[#10213f]">
                          <MapPin className="h-4 w-4 text-[#7a96c9]" /> Phân công tại {m.location_count} địa điểm
                        </span>
                      </div>
                      {m.location_names.length > 0 ? (
                        <div className="flex flex-wrap gap-2 mt-1">
                          {m.location_names.map((name) => (
                            <span
                              key={name}
                              className="inline-flex items-center rounded-lg border border-[#d7e0f0]/70 bg-[#f6f8fb] px-2.5 py-1.5 text-[0.78rem] font-medium text-[#52627f]"
                            >
                              {name}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <p className="text-[0.8rem] text-[#7a96c9] mt-1">
                          Đại sứ này chưa được gán cho địa điểm cụ thể nào.
                        </p>
                      )}
                    </div>
                  </div>
                </div>
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

      {previewMascot && (
        <AdminModal
          title={`Xem trước tương tác: ${previewMascot.name}`}
          className="h-[calc(100vh-2rem)] max-h-[calc(100vh-2rem)] max-w-6xl"
          bodyClassName="flex-1 p-0"
          footer={
            <>
              <Button variant="outline" onClick={() => playVoicePreview(previewMascot)} disabled={voicePreviewingId === previewMascot.id} className="rounded-xl">
                <Volume2 className="mr-2 h-4 w-4" />
                {voicePreviewingId === previewMascot.id ? 'Đang tạo giọng...' : 'Nghe thử'}
              </Button>
              <Button onClick={closePreview} className="rounded-xl">Đóng</Button>
            </>
          }
        >
          <div className="grid h-full min-h-0 bg-[#f8fbff] lg:grid-cols-[minmax(0,1fr)_330px]">
            <div className="relative min-h-[360px] border-b border-[#d7e0f0]/70 bg-gradient-to-b from-white to-[#eef3fb] lg:min-h-0 lg:border-b-0 lg:border-r">
              <MascotPreview3D
                modelUrl={previewMascot.model_3d_url}
                animation={previewAnimation}
                controls
                cameraPosition={[0.1, 0.85, 3.15]}
                cameraTarget={[0, 0.55, 0]}
                modelPosition={[0, -0.2, 0]}
                onAnimationsLoaded={(names) => {
                  setPreviewClipNames(names)
                  setPreviewClipsLoaded(true)
                }}
                onAnimationComplete={(animation) => {
                  if (animation !== 'Idle' && animation !== 'Talking') {
                    setPreviewAnimation('Idle')
                  }
                }}
              />
              <div className="pointer-events-none absolute left-4 top-4 rounded-xl border border-white/70 bg-white/90 px-3 py-2 text-xs font-semibold text-[#52627f] shadow-sm backdrop-blur">
                Kéo để xoay · Scroll để zoom
              </div>
              <div className="pointer-events-none absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full border border-white/70 bg-white/90 px-4 py-2 text-xs font-semibold text-[#053384] shadow-sm backdrop-blur">
                Animation: {MASCOT_ACTIONS.find((action) => action.id === previewAnimation)?.label ?? previewAnimation}
              </div>
            </div>
            <aside className="min-h-0 space-y-3 overflow-y-auto bg-white p-4">
              <div>
                <p className="text-[0.7rem] font-semibold uppercase tracking-wide text-[#7a96c9]">Mascot</p>
                <h3 className="mt-1 text-lg font-bold text-[#10213f]">{previewMascot.name}</h3>
                <p className="mt-1 font-mono text-xs text-[#7a96c9]">/{previewMascot.slug}</p>
              </div>

              <div className="rounded-xl border border-[#d7e0f0]/70 bg-[#f8fbff] p-3">
                <p className="text-[0.7rem] font-semibold uppercase tracking-wide text-[#7a96c9]">Thử hành động</p>
                <div className="mt-3 grid gap-2">
                  {MASCOT_ACTIONS.map((action) => {
                    const available = action.clips.some((clip) => previewClipNames.includes(clip))
                    const loadingClips = !previewClipsLoaded
                    const active = previewAnimation === action.id
                    return (
                      <button
                        key={action.id}
                        type="button"
                        onClick={() => setPreviewAnimation(action.id)}
                        disabled={loadingClips || !available}
                        className={`rounded-xl border px-3 py-2 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-45 ${
                          active
                            ? 'border-[#053384] bg-[#053384] text-white shadow-sm'
                            : 'border-[#d7e0f0] bg-white text-[#10213f] hover:border-[#7a96c9] hover:bg-[#eef3fb]'
                        }`}
                      >
                        <span className="block text-sm font-bold">{action.label}</span>
                        <span className={`mt-0.5 block text-[0.72rem] ${active ? 'text-white/75' : 'text-[#7a96c9]'}`}>
                          {loadingClips ? 'Đang đọc clip...' : available ? action.description : 'Không có clip trong model'}
                        </span>
                      </button>
                    )
                  })}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-xl border border-[#d7e0f0]/70 bg-[#f8fbff] p-3">
                  <p className="text-[0.7rem] font-semibold uppercase tracking-wide text-[#7a96c9]">Voice</p>
                  <p className="mt-1 font-bold text-[#053384]">{previewMascot.voice_name}</p>
                </div>
                <div className="rounded-xl border border-[#d7e0f0]/70 bg-[#f8fbff] p-3">
                  <p className="text-[0.7rem] font-semibold uppercase tracking-wide text-[#7a96c9]">Địa điểm gán</p>
                  <p className="mt-1 font-bold text-[#10213f]">{previewMascot.location_count}</p>
                </div>
              </div>
              <a
                href={`/admin/cache?scope=mascot&mascotId=${previewMascot.id}&focus=voice`}
                className="block rounded-xl border border-[#d7e0f0] bg-white px-3 py-2 text-center text-xs font-semibold text-[#053384] transition-colors hover:bg-[#eef3fb]"
              >
                Mở Cache Console
              </a>
            </aside>
          </div>
        </AdminModal>
      )}

      {pendingSaveId && pendingSaveMascot && (
        <AdminModal
          title="Xác nhận lưu cấu hình mascot"
          footer={
            <>
              <Button variant="outline" onClick={() => setPendingSaveId(null)} className="rounded-xl">Quay lại</Button>
              <Button variant="outline" onClick={() => playVoicePreview(pendingSaveMascot, true)} disabled={voicePreviewingId === pendingSaveMascot.id} className="rounded-xl">
                <Volume2 className="mr-2 h-4 w-4" />
                {voicePreviewingId === pendingSaveMascot.id ? 'Đang tạo...' : 'Nghe trước'}
              </Button>
              <Button onClick={handleSave} disabled={saving} className="rounded-xl">
                {saving ? 'Đang lưu...' : 'Lưu cấu hình'}
              </Button>
            </>
          }
        >
          <div className="space-y-4">
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
              <div className="flex items-start gap-2">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <div>
                  <p className="font-semibold">Thay đổi này có thể ảnh hưởng cache runtime.</p>
                  <p className="mt-1 leading-relaxed">
                    Lưu cấu hình không tự tạo lại intro audio, QA audio hay xóa qa_cache.json. Các cache liên quan cần xử lý riêng qua Cache Console hoặc script phase 2.
                  </p>
                </div>
              </div>
            </div>
            <div>
              <p className="text-sm font-semibold text-[#10213f]">Trường thay đổi</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {(pendingChanges.length > 0 ? pendingChanges : ['Không phát hiện thay đổi nội dung']).map((field) => (
                  <span key={field} className="rounded-lg border border-[#d7e0f0] bg-[#f8fbff] px-2.5 py-1.5 text-xs font-semibold text-[#52627f]">
                    {field}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </AdminModal>
      )}
    </div>
  )
}
