'use client'

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Settings, Timer, Monitor, Volume2, MapPin } from 'lucide-react'

export default function SettingsPage() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
        <p className="text-muted-foreground mt-1">
          Cấu hình chung cho hệ thống Kiosk.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5 text-muted-foreground" />
            Kiosk Configuration
            <Badge variant="secondary" className="ml-2">Đang phát triển</Badge>
          </CardTitle>
          <CardDescription>
            Tính năng cấu hình Kiosk sẽ được hoàn thiện trong Phase 5.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Các cài đặt sẽ được lưu trong bảng <code className="bg-muted px-1.5 py-0.5 rounded text-xs">kiosk_config</code> (key/value).
            </p>
            <div className="grid gap-3 md:grid-cols-2">
              <div className="flex items-center gap-3 rounded-lg border p-3">
                <Timer className="h-5 w-5 text-muted-foreground" />
                <div>
                  <p className="text-sm font-medium">Idle Timeout</p>
                  <p className="text-xs text-muted-foreground">Thời gian chờ trước khi reset session</p>
                </div>
                <Badge variant="outline" className="ml-auto">10 phút</Badge>
              </div>
              <div className="flex items-center gap-3 rounded-lg border p-3">
                <Timer className="h-5 w-5 text-muted-foreground" />
                <div>
                  <p className="text-sm font-medium">Warning Duration</p>
                  <p className="text-xs text-muted-foreground">Thời gian hiện cảnh báo trước khi reset</p>
                </div>
                <Badge variant="outline" className="ml-auto">60 giây</Badge>
              </div>
              <div className="flex items-center gap-3 rounded-lg border p-3">
                <Monitor className="h-5 w-5 text-muted-foreground" />
                <div>
                  <p className="text-sm font-medium">Kiosk Mode</p>
                  <p className="text-xs text-muted-foreground">Bật/tắt chế độ kiosk (chặn F5, right-click)</p>
                </div>
                <Badge variant="outline" className="ml-auto">Bật</Badge>
              </div>
              <div className="flex items-center gap-3 rounded-lg border p-3">
                <MapPin className="h-5 w-5 text-muted-foreground" />
                <div>
                  <p className="text-sm font-medium">Default Start Location</p>
                  <p className="text-xs text-muted-foreground">Location mặc định khi khởi động</p>
                </div>
                <Badge variant="outline" className="ml-auto">cong-chinh</Badge>
              </div>
              <div className="flex items-center gap-3 rounded-lg border p-3">
                <Volume2 className="h-5 w-5 text-muted-foreground" />
                <div>
                  <p className="text-sm font-medium">TTS Default</p>
                  <p className="text-xs text-muted-foreground">Bật/tắt text-to-speech mặc định</p>
                </div>
                <Badge variant="outline" className="ml-auto">Bật</Badge>
              </div>
            </div>
            <p className="text-sm text-muted-foreground italic">
              Chỉnh sửa sẽ khả dụng khi bảng <code className="bg-muted px-1.5 py-0.5 rounded text-xs">kiosk_config</code> được tạo và backend API hoàn thành (Phase 5).
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
