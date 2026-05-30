'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { adminApi } from '@/lib/admin-api'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { AdminNotice, AdminPageHeader, AdminPanel, AdminSelect } from '../_components/admin-ui'
import {
  Image as ImageIcon,
  RefreshCw,
  Upload,
  Trash2,
  X,
  Film,
  FileImage,
  MapPin,
} from 'lucide-react'

interface MediaItem {
  id: string; location_id: string; type: 'image' | 'video' | 'gif'
  url: string; caption: string; keywords: string[]; is_intro: boolean
  sort_order: number; created_at: string | null; location_name?: string | null
}

interface LocationOption {
  id: string; name: string; slug: string; description?: string | null
  media_count: number
}

interface LocationNode extends LocationOption {
  isAll?: boolean
}

const ALL_LOCATIONS_ID = '__all__'

const typeIcons = { image: FileImage, video: Film, gif: ImageIcon }

export default function MediaPage() {
  const [media, setMedia] = useState<MediaItem[]>([])
  const [total, setTotal] = useState(0)
  const [loadingMedia, setLoadingMedia] = useState(true)
  const [loadingLocations, setLoadingLocations] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedLocationId, setSelectedLocationId] = useState<string | null>(null)
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

  const locationNodes = useMemo<LocationNode[]>(() => {
    const totalMedia = locations.reduce((sum, loc) => sum + (loc.media_count || 0), 0)
    return [
      {
        id: ALL_LOCATIONS_ID,
        name: 'Tất cả địa điểm',
        slug: 'all',
        description: 'Tổng hợp media từ tất cả địa điểm trong campus tour.',
        media_count: totalMedia,
        isAll: true,
      },
      ...locations,
    ]
  }, [locations])

  const activeLocationId = useMemo(() => {
    if (selectedLocationId && locationNodes.some((loc) => loc.id === selectedLocationId)) {
      return selectedLocationId
    }
    return locationNodes[0]?.id ?? null
  }, [locationNodes, selectedLocationId])

  const selectedLocation = useMemo(
    () => locationNodes.find((loc) => loc.id === activeLocationId) ?? null,
    [activeLocationId, locationNodes],
  )

  const fetchMedia = useCallback(async () => {
    if (!activeLocationId) {
      setMedia([])
      setTotal(0)
      setLoadingMedia(false)
      return
    }

    setLoadingMedia(true)
    setError(null)
    try {
      let url = '/media?limit=100'
      if (activeLocationId !== ALL_LOCATIONS_ID) url += `&location_id=${activeLocationId}`
      if (filterType) url += `&type=${filterType}`
      const data = await adminApi.get<{ total: number; media: MediaItem[] }>(url)
      setMedia(data.media)
      setTotal(data.total)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không thể tải')
    } finally {
      setLoadingMedia(false)
    }
  }, [activeLocationId, filterType])

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
    void Promise.resolve().then(fetchLocations)
  }, [fetchLocations])

  useEffect(() => {
    void Promise.resolve().then(fetchMedia)
  }, [fetchMedia])

  const selectLocation = (locationId: string) => {
    setMedia([])
    setTotal(0)
    setSelectedLocationId(locationId)
  }

  const refreshAll = async () => {
    await Promise.all([fetchLocations(), fetchMedia()])
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Xóa media này? Thao tác không thể hoàn tác.')) return
    setDeletingId(id)
    try {
      const target = media.find(item => item.id === id)
      await adminApi.delete(`/media/${id}`)
      setMedia(prev => prev.filter(m => m.id !== id))
      setTotal(prev => prev - 1)
      if (target) {
        setLocations(prev => prev.map(loc =>
          loc.id === target.location_id
            ? { ...loc, media_count: Math.max((loc.media_count || 0) - 1, 0) }
            : loc
        ))
      }
    } catch (err) { setError(err instanceof Error ? err.message : 'Không thể xóa') }
    finally { setDeletingId(null) }
  }

  const openUpload = () => {
    if (selectedLocation && !selectedLocation.isAll) {
      setUploadLocationId(selectedLocation.id)
    } else {
      setUploadLocationId('')
    }
    setShowUpload(true)
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
      await Promise.all([fetchLocations(), fetchMedia()])
    } catch (err) { setError(err instanceof Error ? err.message : 'Upload lỗi') }
    finally { setUploading(false) }
  }

  const getLocationName = (item: MediaItem) => item.location_name
    || locations.find(l => l.id === item.location_id)?.name
    || item.location_id

  return (
    <div className="flex flex-col gap-6">
      <AdminPageHeader
        title="Thư viện media"
        description="Quản lý hình ảnh, video và GIF gắn với từng địa điểm trong trải nghiệm tham quan."
        meta={<Badge variant="outline">{locationNodes[0]?.media_count ?? 0} files</Badge>}
        actions={
          <>
            <Button variant="outline" size="sm" onClick={() => void refreshAll()} disabled={loadingMedia || loadingLocations}>
              <RefreshCw data-icon="inline-start" className={loadingMedia || loadingLocations ? 'animate-spin' : ''} /> Refresh
            </Button>
            <Button size="sm" onClick={openUpload}>
              <Upload data-icon="inline-start" /> Upload Media
            </Button>
          </>
        }
      />

      {error && <AdminNotice tone="danger">{error}</AdminNotice>}

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

      <AdminPanel className="overflow-hidden">
        <div className="grid min-h-[560px] lg:grid-cols-[320px_minmax(0,1fr)]">
          <aside className="border-b border-border/70 bg-muted/20 lg:border-b-0 lg:border-r">
            <div className="flex items-center justify-between gap-3 border-b border-border/70 px-4 py-4">
              <div>
                <h2 className="text-base font-semibold">Địa điểm</h2>
                <p className="mt-1 text-xs text-muted-foreground">Chọn một địa điểm để quản lý media.</p>
              </div>
            </div>

            <div className="max-h-[620px] overflow-y-auto p-2">
              {locationNodes.map((location) => {
                const isSelected = selectedLocation?.id === location.id
                return (
                  <button
                    key={location.id}
                    type="button"
                    onClick={() => selectLocation(location.id)}
                    className={`mb-1 w-full rounded-lg border px-3 py-3 text-left transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/20 ${
                      isSelected
                        ? 'border-primary/30 bg-primary/8 text-primary'
                        : 'border-transparent bg-transparent text-foreground hover:border-border hover:bg-background'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span className="flex size-8 items-center justify-center rounded-lg border bg-background/80">
                        {location.isAll ? <ImageIcon className="h-4 w-4" /> : <MapPin className="h-4 w-4" />}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-sm font-medium">{location.name}</span>
                      <Badge variant="outline" className="shrink-0">
                        {location.media_count}
                      </Badge>
                    </div>
                    <p className="mt-1 truncate font-mono text-xs text-muted-foreground">
                      {location.isAll ? 'media/all/' : `locations/${location.slug}/media/`}
                    </p>
                  </button>
                )
              })}

              {!loadingLocations && locationNodes.length <= 1 && (
                <div className="px-3 py-8 text-center text-sm text-muted-foreground">
                  Chưa có địa điểm nào để hiển thị.
                </div>
              )}
            </div>
          </aside>

          <section className="min-w-0 bg-card">
            {selectedLocation ? (
              <>
                <div className="border-b border-border/70 px-5 py-5">
                  <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                    <div className="flex min-w-0 items-start gap-3">
                      <div className="flex size-11 shrink-0 items-center justify-center rounded-lg border bg-muted/30">
                        {selectedLocation.isAll ? <ImageIcon /> : <MapPin />}
                      </div>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <h2 className="text-xl font-semibold leading-tight">{selectedLocation.name}</h2>
                          <Badge variant="outline">{selectedLocation.media_count} media</Badge>
                          <Badge variant="secondary">{total} kết quả</Badge>
                        </div>
                        <p className="mt-1 font-mono text-xs text-muted-foreground">
                          {selectedLocation.isAll ? 'media/all/' : `locations/${selectedLocation.slug}/media/`}
                        </p>
                        {selectedLocation.description && (
                          <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
                            {selectedLocation.description}
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="flex shrink-0 flex-wrap items-center gap-2">
                      <AdminSelect value={filterType} onChange={e => setFilterType(e.target.value)}>
                        <option value="">Tất cả loại</option>
                        <option value="image">Hình ảnh</option>
                        <option value="video">Video</option>
                        <option value="gif">GIF</option>
                      </AdminSelect>
                      <Button size="sm" onClick={openUpload}>
                        <Upload data-icon="inline-start" />
                        Tải media
                      </Button>
                    </div>
                  </div>
                </div>

                {/* Media Grid */}
                {loadingMedia && media.length === 0 ? (
                  <div className="grid gap-4 px-5 py-6 grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
                    {[1, 2, 3, 4].map(i => (
                      <Card key={i} className="animate-pulse">
                        <CardContent className="p-0"><div className="h-40 rounded bg-muted" /></CardContent>
                      </Card>
                    ))}
                  </div>
                ) : (
                  <div className="grid gap-4 px-5 py-6 grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
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
                                <p className="text-white/60 text-xs">{getLocationName(item)}</p>
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      )
                    })}
                  </div>
                )}

                {!loadingMedia && media.length === 0 && (
                  <div className="text-center py-12 text-muted-foreground">
                    Chưa có media nào. Hãy upload media đầu tiên!
                  </div>
                )}
              </>
            ) : (
              <div className="flex min-h-[480px] items-center justify-center px-6 text-center text-sm text-muted-foreground">
                Chọn một địa điểm để bắt đầu quản lý thư viện media.
              </div>
            )}
          </section>
        </div>
      </AdminPanel>
    </div>
  )
}
