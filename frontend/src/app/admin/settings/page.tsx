'use client'

import { useCallback, useEffect, useState } from 'react'
import { adminApi } from '@/lib/admin-api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { AdminMetricStrip, AdminNotice, AdminPageHeader, AdminPanel, AdminSelect, AdminSwitch } from '../_components/admin-ui'
import { MapPin, RefreshCw, Save, Timer } from 'lucide-react'

interface KioskConfig {
  idle_timeout_minutes: number
  warning_duration_seconds: number
  kiosk_mode: boolean
  default_start_slug: string
  tts_enabled_default: boolean
}

interface LocationOption {
  id: string
  name: string
  slug: string
}

const DEFAULT_CONFIG: KioskConfig = {
  idle_timeout_minutes: 10,
  warning_duration_seconds: 60,
  kiosk_mode: true,
  default_start_slug: 'cong-chinh',
  tts_enabled_default: true,
}

export default function SettingsPage() {
  const [config, setConfig] = useState<KioskConfig>(DEFAULT_CONFIG)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [locations, setLocations] = useState<LocationOption[]>([])
  const [loadingLocations, setLoadingLocations] = useState(true)

  const fetchConfig = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setConfig(await adminApi.get<KioskConfig>('/config'))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không thể tải cấu hình')
    } finally {
      setLoading(false)
    }
  }, [])

  const fetchLocations = useCallback(async () => {
    setLoadingLocations(true)
    try {
      const data = await adminApi.get<{ locations: LocationOption[] }>('/locations')
      setLocations(data.locations)
    } catch {
      setLocations([])
    } finally {
      setLoadingLocations(false)
    }
  }, [])

  useEffect(() => {
    void Promise.resolve().then(() => Promise.all([fetchConfig(), fetchLocations()]))
  }, [fetchConfig, fetchLocations])

  const saveConfig = async () => {
    setSaving(true)
    setSaved(false)
    setError(null)
    try {
      setConfig(await adminApi.put<KioskConfig>('/config', config))
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không thể lưu cấu hình')
    } finally {
      setSaving(false)
    }
  }

  const startLocation = locations.find((location) => location.slug === config.default_start_slug)
  const canSelectStartLocation = locations.length > 0

  return (
    <div className="flex flex-col gap-6">
      <AdminPageHeader
        title="Cấu hình Kiosk"
        description="Thiết lập timeout, màn hình bắt đầu và mặc định âm thanh cho môi trường kiosk tham quan."
        actions={
          <Button variant="outline" size="sm" onClick={fetchConfig} disabled={loading} className="rounded-xl">
            <RefreshCw data-icon="inline-start" className={loading ? 'animate-spin' : ''} /> Làm mới
          </Button>
        }
      />

      {error && <AdminNotice tone="danger">{error}</AdminNotice>}
      {saved && <AdminNotice tone="success">✓ Đã lưu cấu hình thành công.</AdminNotice>}

      <AdminMetricStrip
        metrics={[
          { label: 'Điểm bắt đầu', value: startLocation?.name ?? config.default_start_slug, description: canSelectStartLocation ? 'Theo danh sách location' : 'Nhập slug thủ công' },
          { label: 'Idle timeout', value: `${config.idle_timeout_minutes} phút`, color: '#053384' },
          { label: 'Cảnh báo', value: `${config.warning_duration_seconds} giây`, color: '#b8891f' },
          { label: 'Âm thanh', value: config.tts_enabled_default ? 'Bật' : 'Tắt', color: config.tts_enabled_default ? '#2c8b57' : '#52627f' },
        ]}
      />

      <div className="grid gap-5 lg:grid-cols-2">
        {/* Timing Settings */}
        <AdminPanel title="Thời gian & Timeout" description="Cấu hình idle timeout và cảnh báo trước khi reset phiên.">
          <div className="space-y-4 p-5">
            <label className="flex flex-col gap-2 rounded-xl border border-[#d7e0f0] p-4">
              <div className="flex items-center gap-2">
                <Timer className="h-4 w-4 text-[#7a96c9]" />
                <span className="text-sm font-medium text-[#10213f]">Idle Timeout</span>
              </div>
              <p className="text-xs text-[#52627f]">
                Thời gian không tương tác trước khi hiện cảnh báo. Sau cảnh báo, phiên sẽ tự reset.
              </p>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  min={1}
                  value={config.idle_timeout_minutes}
                  onChange={(event) => setConfig({ ...config, idle_timeout_minutes: Number(event.target.value) })}
                  className="w-24 rounded-xl text-center"
                />
                <span className="text-sm text-[#52627f]">phút</span>
              </div>
            </label>

            <label className="flex flex-col gap-2 rounded-xl border border-[#d7e0f0] p-4">
              <div className="flex items-center gap-2">
                <Timer className="h-4 w-4 text-[#7a96c9]" />
                <span className="text-sm font-medium text-[#10213f]">Warning Duration</span>
              </div>
              <p className="text-xs text-[#52627f]">
                Thời gian hiển thị cảnh báo đếm ngược trước khi tự động reset phiên tham quan.
              </p>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  min={5}
                  value={config.warning_duration_seconds}
                  onChange={(event) => setConfig({ ...config, warning_duration_seconds: Number(event.target.value) })}
                  className="w-24 rounded-xl text-center"
                />
                <span className="text-sm text-[#52627f]">giây</span>
              </div>
            </label>
          </div>
        </AdminPanel>

        {/* Display Settings */}
        <AdminPanel title="Hiển thị & Mặc định" description="Cấu hình điểm bắt đầu mặc định và các tùy chọn kiosk.">
          <div className="space-y-4 p-5">
            <label className="flex flex-col gap-2 rounded-xl border border-[#d7e0f0] p-4">
              <div className="flex items-center gap-2">
                <MapPin className="h-4 w-4 text-[#7a96c9]" />
                <span className="text-sm font-medium text-[#10213f]">Điểm bắt đầu mặc định</span>
              </div>
              <p className="text-xs text-[#52627f]">
                Slug của location sẽ hiển thị đầu tiên khi kiosk khởi động hoặc sau khi reset phiên.
              </p>
              {canSelectStartLocation ? (
                <AdminSelect
                  value={startLocation ? config.default_start_slug : '__custom__'}
                  onChange={(event) => {
                    if (event.target.value === '__custom__') return
                    setConfig({ ...config, default_start_slug: event.target.value })
                  }}
                  disabled={loadingLocations}
                >
                  {!startLocation && (
                    <option value="__custom__">Slug hiện tại: {config.default_start_slug}</option>
                  )}
                  {locations.map((location) => (
                    <option key={location.id} value={location.slug}>
                      {location.name} / {location.slug}
                    </option>
                  ))}
                </AdminSelect>
              ) : (
                <Input
                  value={config.default_start_slug}
                  onChange={(event) => setConfig({ ...config, default_start_slug: event.target.value })}
                  placeholder="VD: cong-chinh"
                  className="rounded-xl font-mono"
                />
              )}
            </label>

            <AdminSwitch
              checked={config.kiosk_mode}
              onChange={(checked) => setConfig({ ...config, kiosk_mode: checked })}
              label="Chế độ Kiosk"
              description="Bật để ẩn thanh điều hướng browser, chặn right-click và các thao tác không phải kiosk."
            />

            <AdminSwitch
              checked={config.tts_enabled_default}
              onChange={(checked) => setConfig({ ...config, tts_enabled_default: checked })}
              label="Text-to-Speech mặc định"
              description="Bật để tự động đọc phản hồi từ đại sứ ảo khi sinh viên hỏi."
            />
          </div>
        </AdminPanel>
      </div>

      {/* Save button */}
      <div className="sticky bottom-4 z-10 flex justify-end rounded-2xl border border-[#d7e0f0]/80 bg-white/95 p-5 shadow-lg shadow-[#053384]/[0.06] backdrop-blur">
        <Button onClick={saveConfig} disabled={saving} className="rounded-xl px-6 shadow-sm">
          <Save className="mr-2 h-4 w-4" /> {saving ? 'Đang lưu...' : 'Lưu cấu hình'}
        </Button>
      </div>
    </div>
  )
}
