'use client'

import { useCallback, useEffect, useState } from 'react'
import { adminApi } from '@/lib/admin-api'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { MapPin, Monitor, RefreshCw, Save, Settings, Timer, Volume2 } from 'lucide-react'

interface KioskConfig {
  idle_timeout_minutes: number
  warning_duration_seconds: number
  kiosk_mode: boolean
  default_start_slug: string
  tts_enabled_default: boolean
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

  useEffect(() => {
    void Promise.resolve().then(fetchConfig)
  }, [fetchConfig])

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

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
          <p className="text-muted-foreground mt-1">Cấu hình chung cho hệ thống Kiosk.</p>
        </div>
        <Button variant="outline" size="sm" onClick={fetchConfig} disabled={loading}>
          <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
        </Button>
      </div>

      {error && <div className="rounded-md bg-red-50 p-3 text-sm text-red-600">{error}</div>}
      {saved && <div className="rounded-md bg-green-50 p-3 text-sm text-green-600">Đã lưu cấu hình.</div>}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5 text-muted-foreground" />
            Kiosk Configuration
          </CardTitle>
          <CardDescription>Các giá trị này được lưu qua Admin API `/config`.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid gap-4 md:grid-cols-2">
            <label className="space-y-2 rounded-lg border p-3">
              <span className="flex items-center gap-2 text-sm font-medium">
                <Timer className="h-4 w-4 text-muted-foreground" />
                Idle Timeout (phút)
              </span>
              <Input
                type="number"
                min={1}
                value={config.idle_timeout_minutes}
                onChange={(event) => setConfig({ ...config, idle_timeout_minutes: Number(event.target.value) })}
              />
            </label>

            <label className="space-y-2 rounded-lg border p-3">
              <span className="flex items-center gap-2 text-sm font-medium">
                <Timer className="h-4 w-4 text-muted-foreground" />
                Warning Duration (giây)
              </span>
              <Input
                type="number"
                min={5}
                value={config.warning_duration_seconds}
                onChange={(event) => setConfig({ ...config, warning_duration_seconds: Number(event.target.value) })}
              />
            </label>

            <label className="space-y-2 rounded-lg border p-3">
              <span className="flex items-center gap-2 text-sm font-medium">
                <MapPin className="h-4 w-4 text-muted-foreground" />
                Default Start Slug
              </span>
              <Input
                value={config.default_start_slug}
                onChange={(event) => setConfig({ ...config, default_start_slug: event.target.value })}
              />
            </label>

            <div className="space-y-3 rounded-lg border p-3">
              <label className="flex items-center justify-between gap-3">
                <span className="flex items-center gap-2 text-sm font-medium">
                  <Monitor className="h-4 w-4 text-muted-foreground" />
                  Kiosk Mode
                </span>
                <input
                  type="checkbox"
                  checked={config.kiosk_mode}
                  onChange={(event) => setConfig({ ...config, kiosk_mode: event.target.checked })}
                />
              </label>
              <label className="flex items-center justify-between gap-3">
                <span className="flex items-center gap-2 text-sm font-medium">
                  <Volume2 className="h-4 w-4 text-muted-foreground" />
                  TTS Default
                </span>
                <input
                  type="checkbox"
                  checked={config.tts_enabled_default}
                  onChange={(event) => setConfig({ ...config, tts_enabled_default: event.target.checked })}
                />
              </label>
            </div>
          </div>

          <div className="flex justify-end border-t pt-4">
            <Button onClick={saveConfig} disabled={saving}>
              <Save className="mr-2 h-4 w-4" /> {saving ? 'Đang lưu...' : 'Lưu cấu hình'}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
