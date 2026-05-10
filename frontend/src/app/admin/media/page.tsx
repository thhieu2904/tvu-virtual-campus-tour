'use client'

import { useEffect, useState, useCallback } from 'react'
import { adminApi } from '@/lib/admin-api'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Image as ImageIcon, RefreshCw, Upload, Trash2, X, Film, FileImage,
} from 'lucide-react'

interface MediaItem {
  id: string; location_id: string; type: 'image' | 'video' | 'gif'
  url: string; caption: string; keywords: string[]; is_intro: boolean
  sort_order: number; created_at: string | null
}
interface LocationOption { id: string; name: string; slug: string }

const typeIcons = { image: FileImage, video: Film, gif: ImageIcon }

export default function MediaPage() {
  const [media, setMedia] = useState<MediaItem[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filterLocation, setFilterLocation] = useState('')
  const [filterType, setFilterType] = useState('')
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [locations, setLocations] = useState<LocationOption[]>([])

  // Upload
  const [showUpload, setShowUpload] = useState(false)
  const [uploadFile, setUploadFile] = useState<File | null>(null)
  const [uploadCaption, setUploadCaption] = useState('')
  const [uploadKeywords, setUploadKeywords] = useState('')
  const [uploadLocationId, setUploadLocationId] = useState('')
  const [uploadIsIntro, setUploadIsIntro] = useState(false)
  const [uploading, setUploading] = useState(false)

  const fetchMedia = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      let url = '/media?limit=100'
      if (filterLocation) url += `&location_id=${filterLocation}`
      if (filterType) url += `&type=${filterType}`
      const data = await adminApi.get<{ total: number; media: MediaItem[] }>(url)
      setMedia(data.media); setTotal(data.total)
    } catch (err) { setError(err instanceof Error ? err.message : 'Không thể tải') }
    finally { setLoading(false) }
  }, [filterLocation, filterType])

  useEffect(() => { fetchMedia() }, [fetchMedia])

  useEffect(() => {
    adminApi.get<{ locations: LocationOption[] }>('/locations')
      .then(data => setLocations(data.locations)).catch(() => {})
  }, [])

  const handleDelete = async (id: string) => {
    if (!confirm('Xóa media này? Thao tác không thể hoàn tác.')) return
    setDeletingId(id)
    try {
      await adminApi.delete(`/media/${id}`)
      setMedia(prev => prev.filter(m => m.id !== id))
      setTotal(prev => prev - 1)
    } catch (err) { setError(err instanceof Error ? err.message : 'Không thể xóa') }
    finally { setDeletingId(null) }
  }

  const handleUpload = async () => {
    if (!uploadFile || !uploadLocationId) return
    setUploading(true)
    try {
      const formData = new FormData()
      formData.append('file', uploadFile)
      formData.append('caption', uploadCaption)
      formData.append('keywords', JSON.stringify(uploadKeywords.split(',').map(k => k.trim()).filter(Boolean)))
      formData.append('location_id', uploadLocationId)
      formData.append('is_intro', String(uploadIsIntro))
      await adminApi.upload('/media', formData)
      setShowUpload(false); setUploadFile(null); setUploadCaption('')
      setUploadKeywords(''); setUploadLocationId(''); setUploadIsIntro(false)
      fetchMedia()
    } catch (err) { setError(err instanceof Error ? err.message : 'Upload lỗi') }
    finally { setUploading(false) }
  }

  const getLocationName = (id: string) => locations.find(l => l.id === id)?.name || id

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Media Gallery</h1>
          <p className="text-muted-foreground mt-1">Quản lý hình ảnh, video, GIF — {total} files</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={fetchMedia} disabled={loading}>
            <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </Button>
          <Button size="sm" onClick={() => setShowUpload(true)}>
            <Upload className="mr-2 h-4 w-4" /> Upload Media
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-3">
        <select className="rounded-md border bg-transparent px-3 py-2 text-sm"
          value={filterLocation} onChange={e => setFilterLocation(e.target.value)}>
          <option value="">Tất cả locations</option>
          {locations.map(loc => <option key={loc.id} value={loc.id}>{loc.name}</option>)}
        </select>
        <select className="rounded-md border bg-transparent px-3 py-2 text-sm"
          value={filterType} onChange={e => setFilterType(e.target.value)}>
          <option value="">Tất cả loại</option>
          <option value="image">Hình ảnh</option>
          <option value="video">Video</option>
          <option value="gif">GIF</option>
        </select>
      </div>

      {error && <div className="rounded-md bg-red-50 p-3 text-sm text-red-600">{error}</div>}

      {/* Upload Dialog */}
      {showUpload && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-background border rounded-xl shadow-2xl w-full max-w-md p-6 mx-4">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold">Upload Media</h2>
              <Button variant="ghost" size="icon" onClick={() => setShowUpload(false)}><X className="h-5 w-5" /></Button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium">File *</label>
                <label className="flex items-center gap-2 cursor-pointer rounded-md border border-dashed p-3 hover:bg-muted/50 mt-1">
                  <Upload className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm">{uploadFile ? uploadFile.name : 'Chọn hình/video/GIF'}</span>
                  <input type="file" accept="image/*,video/*,.gif" className="hidden" onChange={e => setUploadFile(e.target.files?.[0] || null)} />
                </label>
              </div>
              <div>
                <label className="text-sm font-medium">Location *</label>
                <select className="w-full rounded-md border bg-transparent px-3 py-2 text-sm mt-1"
                  value={uploadLocationId} onChange={e => setUploadLocationId(e.target.value)}>
                  <option value="">Chọn location</option>
                  {locations.map(loc => <option key={loc.id} value={loc.id}>{loc.name}</option>)}
                </select>
              </div>
              <div>
                <label className="text-sm font-medium">Caption</label>
                <Input value={uploadCaption} onChange={e => setUploadCaption(e.target.value)} placeholder="Mô tả hình ảnh" />
              </div>
              <div>
                <label className="text-sm font-medium">Keywords (cách nhau bởi dấu phẩy)</label>
                <Input value={uploadKeywords} onChange={e => setUploadKeywords(e.target.value)} placeholder="VD: thư viện, sách, sinh viên" />
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={uploadIsIntro} onChange={e => setUploadIsIntro(e.target.checked)} className="rounded" />
                Đặt làm ảnh giới thiệu (intro) của location
              </label>
            </div>
            <div className="flex justify-end gap-2 mt-6 pt-4 border-t">
              <Button variant="outline" onClick={() => setShowUpload(false)}>Hủy</Button>
              <Button onClick={handleUpload} disabled={uploading || !uploadFile || !uploadLocationId}>
                {uploading ? 'Đang upload...' : 'Upload'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Media Grid */}
      {loading && media.length === 0 ? (
        <div className="grid gap-4 grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
          {[1, 2, 3, 4].map(i => <Card key={i} className="animate-pulse"><CardContent className="p-0"><div className="h-40 rounded bg-muted" /></CardContent></Card>)}
        </div>
      ) : (
        <div className="grid gap-4 grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
          {media.map(item => {
            const TypeIcon = typeIcons[item.type] || ImageIcon
            return (
              <Card key={item.id} className="overflow-hidden group">
                <CardContent className="p-0 relative">
                  {item.type === 'video' ? (
                    <div className="h-40 bg-muted flex items-center justify-center">
                      <Film className="h-12 w-12 text-muted-foreground" />
                    </div>
                  ) : (
                    <div className="h-40 bg-muted relative">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={item.url} alt={item.caption} className="w-full h-full object-cover" />
                    </div>
                  )}

                  {/* Overlay */}
                  <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-between p-3">
                    <div className="flex justify-between items-start">
                      <div className="flex gap-1">
                        <Badge variant="outline" className="text-white border-white/30 text-xs">
                          <TypeIcon className="mr-1 h-3 w-3" />{item.type}
                        </Badge>
                        {item.is_intro && <Badge className="text-xs">Intro</Badge>}
                      </div>
                      <Button variant="ghost" size="icon" onClick={() => handleDelete(item.id)}
                        disabled={deletingId === item.id} className="text-white hover:text-red-400 h-8 w-8">
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                    <div>
                      {item.caption && <p className="text-white text-xs truncate">{item.caption}</p>}
                      <p className="text-white/60 text-xs">{getLocationName(item.location_id)}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      {!loading && media.length === 0 && (
        <div className="text-center py-12 text-muted-foreground">
          Chưa có media nào. Hãy upload media đầu tiên!
        </div>
      )}
    </div>
  )
}
