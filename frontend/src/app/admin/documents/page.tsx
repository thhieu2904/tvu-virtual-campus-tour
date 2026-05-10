'use client'

import { useEffect, useState, useCallback } from 'react'
import { adminApi } from '@/lib/admin-api'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  FileText, RefreshCw, Search, Trash2, Upload, X,
  AlertCircle, CheckCircle2, Clock, Loader2,
} from 'lucide-react'

interface DocumentItem {
  id: string; title: string; file_url: string; file_type: string
  file_size: number; location_id: string | null; chunk_count: number
  status: 'pending' | 'processing' | 'ready' | 'error'
  error_message: string | null; created_at: string | null
}

interface LocationOption { id: string; name: string; slug: string }

const statusConfig = {
  pending: { icon: Clock, label: 'Chờ xử lý', variant: 'secondary' as const },
  processing: { icon: Loader2, label: 'Đang xử lý', variant: 'outline' as const },
  ready: { icon: CheckCircle2, label: 'Sẵn sàng', variant: 'default' as const },
  error: { icon: AlertCircle, label: 'Lỗi', variant: 'destructive' as const },
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024; const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i]
}

export default function DocumentsPage() {
  const [documents, setDocuments] = useState<DocumentItem[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [deletingId, setDeletingId] = useState<string | null>(null)

  // Upload dialog
  const [showUpload, setShowUpload] = useState(false)
  const [uploadFile, setUploadFile] = useState<File | null>(null)
  const [uploadTitle, setUploadTitle] = useState('')
  const [uploadLocationId, setUploadLocationId] = useState('')
  const [uploading, setUploading] = useState(false)
  const [uploadStatus, setUploadStatus] = useState<string | null>(null)
  const [locations, setLocations] = useState<LocationOption[]>([])

  const fetchDocuments = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const data = await adminApi.get<{ total: number; documents: DocumentItem[] }>(
        `/documents?limit=50${search ? `&search=${encodeURIComponent(search)}` : ''}`
      )
      setDocuments(data.documents); setTotal(data.total)
    } catch (err) { setError(err instanceof Error ? err.message : 'Không thể tải') }
    finally { setLoading(false) }
  }, [search])

  useEffect(() => {
    const timer = setTimeout(() => fetchDocuments(), search ? 300 : 0)
    return () => clearTimeout(timer)
  }, [fetchDocuments])

  // Fetch locations for dropdown
  useEffect(() => {
    adminApi.get<{ locations: LocationOption[] }>('/locations')
      .then(data => setLocations(data.locations))
      .catch(() => {})
  }, [])

  // Poll processing documents
  useEffect(() => {
    const processing = documents.filter(d => d.status === 'pending' || d.status === 'processing')
    if (processing.length === 0) return

    const interval = setInterval(async () => {
      let changed = false
      for (const doc of processing) {
        try {
          const result = await adminApi.get<{ status: string; chunk_count: number }>(`/documents/${doc.id}/status`)
          if (result.status !== doc.status) {
            changed = true
          }
        } catch {}
      }
      if (changed) fetchDocuments()
    }, 3000)
    return () => clearInterval(interval)
  }, [documents, fetchDocuments])

  const handleDelete = async (id: string, title: string) => {
    if (!confirm(`Xóa "${title}"? Thao tác không thể hoàn tác.`)) return
    setDeletingId(id)
    try {
      await adminApi.delete(`/documents/${id}`)
      setDocuments(prev => prev.filter(d => d.id !== id))
      setTotal(prev => prev - 1)
    } catch (err) { setError(err instanceof Error ? err.message : 'Không thể xóa') }
    finally { setDeletingId(null) }
  }

  const handleUpload = async () => {
    if (!uploadFile || !uploadTitle.trim()) return
    setUploading(true); setUploadStatus('Đang upload...')
    try {
      const formData = new FormData()
      formData.append('file', uploadFile)
      formData.append('title', uploadTitle.trim())
      if (uploadLocationId) formData.append('location_id', uploadLocationId)

      const result = await adminApi.upload<{ document_id: string; status: string }>('/ingest', formData)
      setUploadStatus(`Upload thành công! ID: ${result.document_id}. Đang xử lý...`)

      // Reset form
      setTimeout(() => {
        setShowUpload(false); setUploadFile(null); setUploadTitle('')
        setUploadLocationId(''); setUploadStatus(null)
        fetchDocuments()
      }, 2000)
    } catch (err) {
      setUploadStatus(`Lỗi: ${err instanceof Error ? err.message : 'Upload thất bại'}`)
    } finally { setUploading(false) }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Knowledge Base</h1>
          <p className="text-muted-foreground mt-1">Quản lý tài liệu RAG — {total} tài liệu</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={fetchDocuments} disabled={loading}>
            <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </Button>
          <Button size="sm" onClick={() => setShowUpload(true)}>
            <Upload className="mr-2 h-4 w-4" /> Upload
          </Button>
        </div>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input placeholder="Tìm kiếm tài liệu..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
      </div>

      {error && <div className="rounded-md bg-red-50 p-3 text-sm text-red-600">{error}</div>}

      {/* Upload Dialog */}
      {showUpload && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-background border rounded-xl shadow-2xl w-full max-w-md p-6 mx-4">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold">Upload tài liệu RAG</h2>
              <Button variant="ghost" size="icon" onClick={() => { setShowUpload(false); setUploadStatus(null) }}>
                <X className="h-5 w-5" />
              </Button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium">Tiêu đề *</label>
                <Input value={uploadTitle} onChange={e => setUploadTitle(e.target.value)} placeholder="VD: Quy chế đào tạo 2026" />
              </div>
              <div>
                <label className="text-sm font-medium">File (PDF/DOCX, max 10MB) *</label>
                <label className="flex items-center gap-2 cursor-pointer rounded-md border border-dashed p-3 hover:bg-muted/50 mt-1">
                  <Upload className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm">{uploadFile ? `${uploadFile.name} (${formatBytes(uploadFile.size)})` : 'Chọn file'}</span>
                  <input type="file" accept=".pdf,.docx" className="hidden" onChange={e => setUploadFile(e.target.files?.[0] || null)} />
                </label>
              </div>
              <div>
                <label className="text-sm font-medium">Gán vào Location (tùy chọn)</label>
                <select className="w-full rounded-md border bg-transparent px-3 py-2 text-sm mt-1"
                  value={uploadLocationId} onChange={e => setUploadLocationId(e.target.value)}>
                  <option value="">— Toàn hệ thống (global) —</option>
                  {locations.map(loc => <option key={loc.id} value={loc.id}>{loc.name}</option>)}
                </select>
              </div>

              {uploadStatus && (
                <div className={`rounded-md p-3 text-sm ${uploadStatus.includes('Lỗi') ? 'bg-red-50 text-red-600' : 'bg-green-50 text-green-600'}`}>
                  {uploadStatus}
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2 mt-6 pt-4 border-t">
              <Button variant="outline" onClick={() => { setShowUpload(false); setUploadStatus(null) }}>Hủy</Button>
              <Button onClick={handleUpload} disabled={uploading || !uploadFile || !uploadTitle.trim()}>
                {uploading ? 'Đang upload...' : 'Upload & Ingest'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Document List */}
      {loading && documents.length === 0 ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => <Card key={i} className="animate-pulse"><CardContent className="p-4"><div className="h-10 rounded bg-muted" /></CardContent></Card>)}
        </div>
      ) : (
        <div className="space-y-3">
          {documents.map(doc => {
            const config = statusConfig[doc.status]
            const StatusIcon = config.icon
            return (
              <Card key={doc.id}>
                <CardContent className="flex items-center gap-4 p-4">
                  <FileText className="h-8 w-8 text-muted-foreground shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{doc.title}</p>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1">
                      <span className="uppercase font-mono">{doc.file_type}</span>
                      <span>{formatBytes(doc.file_size)}</span>
                      <span>{doc.chunk_count} chunks</span>
                      {doc.created_at && <span>{new Date(doc.created_at).toLocaleDateString('vi-VN')}</span>}
                    </div>
                    {doc.error_message && <p className="text-xs text-red-500 mt-1 truncate">{doc.error_message}</p>}
                  </div>
                  <Badge variant={config.variant} className="shrink-0">
                    <StatusIcon className={`mr-1 h-3 w-3 ${doc.status === 'processing' ? 'animate-spin' : ''}`} />
                    {config.label}
                  </Badge>
                  <Button variant="ghost" size="icon" onClick={() => handleDelete(doc.id, doc.title)}
                    disabled={deletingId === doc.id} className="text-muted-foreground hover:text-destructive shrink-0">
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      {!loading && documents.length === 0 && (
        <div className="text-center py-12 text-muted-foreground">
          {search ? 'Không tìm thấy.' : 'Chưa có tài liệu nào. Hãy upload tài liệu đầu tiên!'}
        </div>
      )}
    </div>
  )
}
