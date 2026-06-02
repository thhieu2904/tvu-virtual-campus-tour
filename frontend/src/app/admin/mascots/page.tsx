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
  AdminSelect,
  AdminSkeleton,
  AdminSwitch,
  AdminTextarea,
} from '../_components/admin-ui'
import MascotPreview3D from '../_components/MascotPreview3D'
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

/* ─── Gemini TTS Voices (matches backend VALID_GEMINI_VOICES) ─── */

const GEMINI_VOICES = [
  'Achernar', 'Achird', 'Algenib', 'Algieba', 'Alnilam', 'Aoede',
  'Autonoe', 'Callirrhoe', 'Charon', 'Despina', 'Enceladus', 'Erinome',
  'Fenrir', 'Gacrux', 'Iapetus', 'Kore', 'Laomedeia', 'Leda', 'Orus',
  'Puck', 'Pulcherrima', 'Rasalgethi', 'Sadachbia', 'Sadaltager',
  'Schedar', 'Sulafat', 'Umbriel', 'Vindemiatrix', 'Zephyr',
  'Zubenelgenubi',
] as const

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
      fetchMascots()
      setTimeout(() => setSaveSuccess(false), 3000)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Lỗi lưu')
    } finally {
      setSaving(false)
    }
  }

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
        <AdminNotice tone="success">✓ Lưu thành công!</AdminNotice>
      )}

      {loading && mascots.length === 0 ? (
        <div className="space-y-4">
          <AdminSkeleton variant="card" className="h-64" />
          <AdminSkeleton variant="card" className="h-64" />
        </div>
      ) : (
        <div className="space-y-5">
          {mascots.map((m) => (
            <AdminPanel key={m.id} className="overflow-hidden">
              {/* ─── Header ─── */}
              <div className="flex items-center justify-between gap-4 border-b border-[#d7e0f0]/70 px-5 py-4">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-[#053384] to-[#0a4cb8] text-white shadow-sm">
                    <Bot className="h-5 w-5" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="text-[0.95rem] font-semibold text-[#10213f]">
                        {m.name}
                      </h3>
                      {m.is_default && (
                        <Badge className="flex items-center gap-1 rounded-lg bg-gradient-to-r from-[#e3b83c] to-[#d4a22e] text-xs text-white shadow-sm">
                          <Crown className="h-3 w-3" />
                          Mặc định
                        </Badge>
                      )}
                      {m.location_count > 0 && (
                        <Badge
                          variant="outline"
                          className="flex items-center gap-1 rounded-lg border-[#c8d5ea] text-xs text-[#52627f]"
                        >
                          <MapPin className="h-3 w-3" />
                          {m.location_count} địa điểm
                        </Badge>
                      )}
                    </div>
                    <p className="mt-0.5 font-mono text-xs text-[#7a96c9]">
                      {m.slug} • {m.model_3d_url}
                    </p>
                  </div>
                </div>
                {editId !== m.id ? (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => startEdit(m)}
                    className="shrink-0 rounded-xl"
                  >
                    Chỉnh sửa
                  </Button>
                ) : (
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setEditId(null)}
                    className="shrink-0 rounded-xl"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                )}
              </div>

              {/* ─── Body ─── */}
              <div className="p-5">
                {editId === m.id ? (
                  /* ═══ EDIT MODE ═══ */
                  <div className="grid gap-5 lg:grid-cols-[1fr_220px]">
                    {/* Left: Form */}
                    <div className="space-y-4">
                      {/* Name */}
                      <label className="flex flex-col gap-1.5 rounded-xl border border-[#d7e0f0] p-4">
                        <div className="flex items-center gap-2">
                          <Bot className="h-4 w-4 text-[#7a96c9]" />
                          <span className="text-sm font-medium text-[#10213f]">
                            Tên mascot
                          </span>
                        </div>
                        <Input
                          value={editForm.name || ''}
                          onChange={(e) =>
                            setEditForm({ ...editForm, name: e.target.value })
                          }
                          placeholder="VD: Kaito, ViVy"
                          className="rounded-xl"
                        />
                      </label>

                      {/* Voice Settings */}
                      <div className="grid gap-4 md:grid-cols-2">
                        <label className="flex flex-col gap-1.5 rounded-xl border border-[#d7e0f0] p-4">
                          <div className="flex items-center gap-2">
                            <Mic className="h-4 w-4 text-[#7a96c9]" />
                            <span className="text-sm font-medium text-[#10213f]">
                              Giọng đọc (Gemini TTS)
                            </span>
                          </div>
                          <AdminSelect
                            value={editForm.voice_name || 'Leda'}
                            onChange={(e) =>
                              setEditForm({
                                ...editForm,
                                voice_name: e.target.value,
                              })
                            }
                          >
                            {GEMINI_VOICES.map((voice) => (
                              <option key={voice} value={voice}>
                                {voice}
                              </option>
                            ))}
                          </AdminSelect>
                        </label>
                        <label className="flex flex-col gap-1.5 rounded-xl border border-[#d7e0f0] p-4">
                          <div className="flex items-center gap-2">
                            <Sparkles className="h-4 w-4 text-[#7a96c9]" />
                            <span className="text-sm font-medium text-[#10213f]">
                              Voice Style
                            </span>
                          </div>
                          <Input
                            value={editForm.voice_style || ''}
                            onChange={(e) =>
                              setEditForm({
                                ...editForm,
                                voice_style: e.target.value,
                              })
                            }
                            placeholder="VD: friendly, warm, and enthusiastic"
                            className="rounded-xl"
                          />
                        </label>
                      </div>

                      {/* Personality Prompt */}
                      <div className="rounded-xl border border-[#d7e0f0] p-4">
                        <div className="flex items-center gap-2 mb-2">
                          <Bot className="h-4 w-4 text-[#7a96c9]" />
                          <span className="text-sm font-medium text-[#10213f]">
                            Personality Prompt
                          </span>
                        </div>
                        <p className="mb-2 text-xs text-[#52627f]">
                          Mô tả tính cách mascot, được gửi vào system prompt
                          của Gemini khi hội thoại.
                        </p>
                        <AdminTextarea
                          className="min-h-[120px]"
                          value={editForm.personality_prompt || ''}
                          onChange={(e) =>
                            setEditForm({
                              ...editForm,
                              personality_prompt: e.target.value,
                            })
                          }
                          placeholder="Mô tả tính cách của mascot..."
                        />
                      </div>

                      {/* Default Toggle */}
                      <AdminSwitch
                        checked={editForm.is_default ?? false}
                        onChange={(checked) =>
                          setEditForm({ ...editForm, is_default: checked })
                        }
                        label="Đặt làm mascot mặc định"
                        description="Mascot mặc định sẽ được dùng tại các địa điểm không chỉ định mascot riêng. Chỉ có 1 mascot mặc định."
                      />

                      {/* Actions */}
                      <div className="flex gap-2 pt-1">
                        <Button
                          onClick={handleSave}
                          disabled={saving}
                          className="rounded-xl shadow-sm"
                        >
                          <Save className="mr-2 h-4 w-4" />{' '}
                          {saving ? 'Đang lưu...' : 'Lưu thay đổi'}
                        </Button>
                        <Button
                          variant="outline"
                          onClick={() => setEditId(null)}
                          className="rounded-xl"
                        >
                          Hủy
                        </Button>
                      </div>
                    </div>

                    {/* Right: 3D Preview */}
                    <div className="hidden lg:block">
                      <div className="sticky top-4 h-[320px] w-full">
                        <MascotPreview3D modelUrl={m.model_3d_url} />
                      </div>
                    </div>
                  </div>
                ) : (
                  /* ═══ VIEW MODE ═══ */
                  <div className="grid gap-5 lg:grid-cols-[1fr_200px]">
                    {/* Left: Info Cards */}
                    <div className="space-y-3">
                      {/* Quick info row */}
                      <div className="grid gap-3 sm:grid-cols-3">
                        <div className="rounded-xl border border-[#d7e0f0] p-3.5">
                          <div className="flex items-center gap-2 mb-1.5">
                            <Mic className="h-3.5 w-3.5 text-[#7a96c9]" />
                            <p className="text-xs font-medium text-[#52627f]">
                              Giọng đọc
                            </p>
                          </div>
                          <p className="text-sm font-semibold text-[#10213f]">
                            {m.voice_name}
                          </p>
                          {m.voice_style && (
                            <p className="mt-0.5 text-xs text-[#7a96c9] line-clamp-1">
                              {m.voice_style}
                            </p>
                          )}
                        </div>

                        <div className="rounded-xl border border-[#d7e0f0] p-3.5">
                          <div className="flex items-center gap-2 mb-1.5">
                            <Box className="h-3.5 w-3.5 text-[#7a96c9]" />
                            <p className="text-xs font-medium text-[#52627f]">
                              Model 3D
                            </p>
                          </div>
                          <p className="truncate text-sm font-semibold font-mono text-[#10213f]">
                            {m.slug}
                          </p>
                          <p className="mt-0.5 truncate text-xs text-[#7a96c9]">
                            {m.model_3d_url}
                          </p>
                        </div>

                        <div className="rounded-xl border border-[#d7e0f0] p-3.5">
                          <div className="flex items-center gap-2 mb-1.5">
                            <Clock className="h-3.5 w-3.5 text-[#7a96c9]" />
                            <p className="text-xs font-medium text-[#52627f]">
                              Cập nhật
                            </p>
                          </div>
                          <p className="text-sm font-semibold text-[#10213f]">
                            {m.updated_at
                              ? new Date(m.updated_at).toLocaleString('vi-VN')
                              : '—'}
                          </p>
                        </div>
                      </div>

                      {/* Location list */}
                      {m.location_names.length > 0 && (
                        <div className="rounded-xl border border-[#d7e0f0] p-3.5">
                          <div className="flex items-center gap-2 mb-2">
                            <MapPin className="h-3.5 w-3.5 text-[#7a96c9]" />
                            <p className="text-xs font-medium text-[#52627f]">
                              Địa điểm sử dụng ({m.location_count})
                            </p>
                          </div>
                          <div className="flex flex-wrap gap-1.5">
                            {m.location_names.map((name) => (
                              <span
                                key={name}
                                className="inline-flex items-center rounded-lg border border-[#d7e0f0] bg-[#f6f8fb] px-2.5 py-1 text-xs font-medium text-[#10213f]"
                              >
                                <MapPin className="mr-1 h-3 w-3 text-[#7a96c9]" />
                                {name}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Personality prompt */}
                      {m.personality_prompt && (
                        <div className="rounded-xl border border-[#d7e0f0] p-3.5">
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2">
                              <Sparkles className="h-3.5 w-3.5 text-[#7a96c9]" />
                              <p className="text-xs font-medium text-[#52627f]">
                                Personality Prompt
                              </p>
                            </div>
                            {m.personality_prompt.length > 200 && (
                              <button
                                type="button"
                                onClick={() =>
                                  setExpandedPrompt(
                                    expandedPrompt === m.id ? null : m.id
                                  )
                                }
                                className="flex items-center gap-1 text-xs font-medium text-[#053384] hover:text-[#0a4cb8] transition-colors"
                              >
                                {expandedPrompt === m.id ? (
                                  <>
                                    Thu gọn{' '}
                                    <ChevronUp className="h-3 w-3" />
                                  </>
                                ) : (
                                  <>
                                    Xem thêm{' '}
                                    <ChevronDown className="h-3 w-3" />
                                  </>
                                )}
                              </button>
                            )}
                          </div>
                          <p
                            className={`whitespace-pre-wrap text-sm leading-relaxed text-[#10213f] ${
                              expandedPrompt === m.id
                                ? ''
                                : 'line-clamp-3'
                            }`}
                          >
                            {m.personality_prompt}
                          </p>
                        </div>
                      )}
                    </div>

                    {/* Right: 3D Preview */}
                    <div className="hidden lg:block">
                      <div className="h-[280px] w-full">
                        <MascotPreview3D modelUrl={m.model_3d_url} />
                      </div>
                    </div>
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
