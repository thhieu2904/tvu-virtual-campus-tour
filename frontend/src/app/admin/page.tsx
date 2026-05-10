import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { MapPin, FileText, Image as ImageIcon, Bot } from 'lucide-react'

export default function AdminDashboardPage() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground mt-2">
          Chào mừng bạn đến với hệ thống quản trị TVU Virtual Campus Tour.
        </p>
      </div>
      
      {/* Stats cards — will show real data after Phase 6 (Stats API) */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Locations</CardTitle>
            <MapPin className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-muted-foreground">—</div>
            <p className="text-xs text-muted-foreground">
              Địa điểm trên bản đồ
            </p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Knowledge Base</CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-muted-foreground">—</div>
            <p className="text-xs text-muted-foreground">
              Tài liệu RAG đã ingest
            </p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Media Assets</CardTitle>
            <ImageIcon className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-muted-foreground">—</div>
            <p className="text-xs text-muted-foreground">
              Hình ảnh & video
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Mascots</CardTitle>
            <Bot className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-muted-foreground">—</div>
            <p className="text-xs text-muted-foreground">
              Nhân vật AI hỗ trợ
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7 mt-4">
        <Card className="col-span-4">
          <CardHeader>
            <CardTitle>Tổng quan hệ thống</CardTitle>
            <CardDescription>
              Trạng thái các thành phần hệ thống Kiosk.
            </CardDescription>
          </CardHeader>
          <CardContent className="pl-2">
            <div className="h-[200px] flex items-center justify-center text-muted-foreground border-2 border-dashed rounded-md mx-4">
              Biểu đồ thống kê — Sẽ hiển thị sau khi Stats API hoàn thành (Phase 6)
            </div>
          </CardContent>
        </Card>
        <Card className="col-span-3">
          <CardHeader>
            <CardTitle>Hoạt động gần đây</CardTitle>
            <CardDescription>
              Các thay đổi mới nhất trong hệ thống.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[200px] flex items-center justify-center text-muted-foreground border-2 border-dashed rounded-md">
              Chưa có dữ liệu — Sẽ hiển thị sau khi tích hợp Activity Feed (Phase 6)
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
