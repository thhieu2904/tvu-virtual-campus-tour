'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { adminApi } from '@/lib/admin-api'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  AdminEmptyState,
  AdminModal,
  AdminNotice,
  AdminPageHeader,
  AdminPanel,
  AdminSelect,
  AdminSkeleton,
} from '../_components/admin-ui'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Image as ImageIcon,
  RefreshCw,
  Upload,
  Trash2,
  Film,
  FileImage,
  MapPin,
  Star,
  Play,
  MoreVertical,
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

const typeIcons: Record<string, typeof FileImage> = { image: FileImage, video: Film, gif: ImageIcon }
const typeLabels: Record<string, string> = { image: 'Hình ảnh', video: 'Video', gif: 'GIF' }

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
      setMedia([]); setTotal(0); setLoadingMedia(false); return
    }
    setLoadingMedia(true); setError(null)
    try {
      let url = '/media?limit=100'
      if (activeLocationId !== ALL_LOCATIONS_ID) url += `&location_id=${activeLocationId}`
      if (filterType) url += `&type=${filterType}`
      const data = await adminApi.get<{ total: number; media: MediaItem[] }>(url)
      setMedia(data.media); setTotal(data.total)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không thể tải')
    } finally { setLoadingMedia(false) }
  }, [activeLocationId, filterType])

  const fetchLocations = useCallback(async () => {
    setLoadingLocations(true)
    try {
      const data = await adminApi.get<{ locations: LocationOption[] }>('/locations')
      setLocations(data.locations)
    } catch { setLocations([]) }
    finally { setLoadingLocations(false) }
  }, [])

  useEffect(() => { void Promise.resolve().then(fetchLocations) }, [fetchLocations])
  useEffect(() => { void Promise.resolve().then(fetchMedia) }, [fetchMedia])

  const selectLocation = (locationId: string) => {
    setMedia([]); setTotal(0); setSelectedLocationId(locationId)
  }

  const refreshAll = async () => { await Promise.all([fetchLocations(), fetchMedia()]) }

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
        meta={<Badge variant="outline" className="rounded-lg">{locationNodes[0]?.media_count ?? 0} files</Badge>}
        actions={
          <>
            <Button variant="outline" size="sm" onClick={() => void refreshAll()} disabled={loadingMedia || loadingLocations} className="rounded-xl">
              <RefreshCw data-icon="inline-start" className={loadingMedia || loadingLocations ? 'animate-spin' : ''} /> Làm mới
            </Button>
            <Button size="sm" onClick={openUpload} className="rounded-xl">
              <Upload data-icon="inline-start" /> Upload Media
            </Button>
          </>
        }
      />

      {error && <AdminNotice tone="danger">{error}</AdminNotice>}

      {/* ─── Upload Modal ─── */}
      {showUpload && (
        <AdminModal
          title="Upload Media"
          footer={
            <>
              <Button variant="outline" onClick={() => setShowUpload(false)} className="rounded-xl">Hủy</Button>
              <Button onClick={handleUpload} disabled={uploading || !uploadFile || !uploadLocationId} className="rounded-xl">
                {uploading ? 'Đang upload...' : 'Upload'}
              </Button>
            </>
          }
        >
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium text-[#10213f]">File *</label>
              <label className="mt-1.5 flex cursor-pointer items-center gap-3 rounded-xl border-2 border-dashed border-[#d7e0f0] p-4 transition-colors hover:border-[#7a96c9] hover:bg-[#f6f8fb]">
                <Upload className="h-5 w-5 text-[#7a96c9]" />
                <span className="text-sm text-[#52627f]">{uploadFile ? uploadFile.name : 'Chọn hình/video/GIF'}</span>
                <input type="file" accept="image/*,video/*,.gif" className="hidden" onChange={e => setUploadFile(e.target.files?.[0] || null)} />
              </label>
            </div>
            <label className="flex flex-col gap-1.5 text-sm font-medium text-[#10213f]">
              Location *
              <AdminSelect value={uploadLocationId} onChange={e => setUploadLocationId(e.target.value)}>
                <option value="">Chọn location</option>
                {locations.map(loc => <option key={loc.id} value={loc.id}>{loc.name}</option>)}
              </AdminSelect>
            </label>
            <label className="flex flex-col gap-1.5 text-sm font-medium text-[#10213f]">
              Caption
              <Input value={uploadCaption} onChange={e => setUploadCaption(e.target.value)} placeholder="Mô tả hình ảnh" className="rounded-xl" />
            </label>
            <label className="flex flex-col gap-1.5 text-sm font-medium text-[#10213f]">
              Keywords (cách nhau bởi dấu phẩy)
              <Input value={uploadKeywords} onChange={e => setUploadKeywords(e.target.value)} placeholder="VD: thư viện, sách, sinh viên" className="rounded-xl" />
            </label>
            <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-[#d7e0f0] p-3.5 transition-colors hover:bg-[#f6f8fb]">
              <input type="checkbox" checked={uploadIsIntro} onChange={e => setUploadIsIntro(e.target.checked)} className="rounded accent-[#053384]" />
              <div>
                <p className="text-sm font-medium text-[#10213f]">Ảnh giới thiệu (Intro)</p>
                <p className="text-xs text-[#52627f]">Đặt làm ảnh đại diện của location trong giao diện kiosk</p>
              </div>
            </label>
          </div>
        </AdminModal>
      )}

      <AdminPanel className="overflow-hidden !rounded-2xl">
        <div className="grid min-h-[560px] lg:grid-cols-[280px_minmax(0,1fr)]">
          {/* ─── Sidebar: Locations ─── */}
          <aside className="border-b border-[#d7e0f0]/70 bg-[#f6f8fb] lg:border-b-0 lg:border-r">
            <div className="flex items-center justify-between gap-3 border-b border-[#d7e0f0]/70 px-4 py-3.5">
              <h2 className="text-sm font-semibold text-[#10213f]">Địa điểm</h2>
            </div>

            <div className="max-h-[620px] overflow-y-auto p-2">
              {locationNodes.map((location) => {
                const isSelected = selectedLocation?.id === location.id
                return (
                  <button
                    key={location.id}
                    type="button"
                    onClick={() => selectLocation(location.id)}
                    className={`group mb-0.5 flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left outline-none transition-all focus-visible:ring-2 focus-visible:ring-[#7a96c9]/30 ${
                      isSelected
                        ? 'bg-[#053384] text-white shadow-sm shadow-[#053384]/20'
                        : 'text-[#10213f] hover:bg-white'
                    }`}
                  >
                    <span className={`flex size-8 shrink-0 items-center justify-center rounded-lg ${
                      isSelected ? 'bg-white/15' : 'bg-white border border-[#d7e0f0]/80'
                    }`}>
                      {location.isAll
                        ? <ImageIcon className="h-4 w-4" />
                        : <MapPin className="h-4 w-4" />
                      }
                    </span>
                    <span className="min-w-0 flex-1 truncate text-[0.82rem] font-medium">{location.name}</span>
                    <span className={`shrink-0 rounded-md px-1.5 py-0.5 text-[0.7rem] font-semibold tabular-nums ${
                      isSelected ? 'bg-white/20 text-white' : 'bg-[#eef3fb] text-[#52627f]'
                    }`}>
                      {location.media_count}
                    </span>
                  </button>
                )
              })}

              {!loadingLocations && locationNodes.length <= 1 && (
                <div className="px-3 py-8 text-center text-sm text-[#52627f]">
                  Chưa có địa điểm nào.
                </div>
              )}
            </div>
          </aside>

          {/* ─── Main: Media Gallery ─── */}
          <section className="min-w-0 bg-white">
            {selectedLocation ? (
              <>
                {/* Header */}
                <div className="border-b border-[#d7e0f0]/70 px-5 py-4">
                  <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
                    <div className="flex min-w-0 items-center gap-3">
                      <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-[#eef3fb]">
                        {selectedLocation.isAll ? <ImageIcon className="h-5 w-5 text-[#053384]" /> : <MapPin className="h-5 w-5 text-[#053384]" />}
                      </div>
                      <div className="min-w-0">
                        <h2 className="text-lg font-bold text-[#10213f]">{selectedLocation.name}</h2>
                        <p className="text-xs text-[#7a96c9]">
                          {total} media
                          {selectedLocation.description && <> · {selectedLocation.description}</>}
                        </p>
                      </div>
                    </div>

                    <div className="flex shrink-0 items-center gap-2">
                      <AdminSelect value={filterType} onChange={e => setFilterType(e.target.value)}>
                        <option value="">Tất cả loại</option>
                        <option value="image">Hình ảnh</option>
                        <option value="video">Video</option>
                        <option value="gif">GIF</option>
                      </AdminSelect>
                      <Button size="sm" onClick={openUpload} className="rounded-xl">
                        <Upload data-icon="inline-start" />
                        Upload
                      </Button>
                    </div>
                  </div>
                </div>

                {/* Media Grid */}
                {loadingMedia && media.length === 0 ? (
                  <div className="grid gap-4 px-5 py-6 grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
                    {[1, 2, 3, 4].map(i => (
                      <AdminSkeleton key={i} variant="card" className="h-56 rounded-xl" />
                    ))}
                  </div>
                ) : (
                  <div className="grid gap-4 px-5 py-6 grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
                    {media.map(item => {
                      const TypeIcon = typeIcons[item.type] || ImageIcon
                      const typeLabel = typeLabels[item.type] || item.type

                      return (
                        <div key={item.id} className="group overflow-hidden rounded-xl border border-[#d7e0f0]/80 bg-white shadow-sm transition-all hover:shadow-md hover:border-[#7a96c9]/40">
                          {/* Thumbnail */}
                          <div className="relative aspect-[4/3] overflow-hidden bg-[#eef3fb]">
                            {item.type === 'video' ? (
                              <div className="flex h-full items-center justify-center bg-gradient-to-br from-[#10213f] to-[#1e3a5f]">
                                <div className="flex size-12 items-center justify-center rounded-full bg-white/15 backdrop-blur-sm">
                                  <Play className="h-6 w-6 text-white" />
                                </div>
                              </div>
                            ) : (
                              /* eslint-disable-next-line @next/next/no-img-element */
                              <img
                                src={item.url}
                                alt={item.caption || 'Media'}
                                className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                              />
                            )}

                            {/* Persistent badges (always visible) */}
                            <div className="absolute left-2 top-2 flex gap-1.5">
                              {item.is_intro && (
                                <span className="flex items-center gap-1 rounded-md bg-amber-500 px-1.5 py-0.5 text-[0.6rem] font-bold uppercase text-white shadow-sm">
                                  <Star className="h-2.5 w-2.5" /> Intro
                                </span>
                              )}
                            </div>

                            {/* Hover overlay — delete only */}
                            <div className="absolute inset-0 flex items-start justify-end bg-gradient-to-b from-black/40 via-transparent to-transparent p-2 opacity-0 transition-opacity group-hover:opacity-100">
                              <DropdownMenu>
                                <DropdownMenuTrigger render={
                                  <Button variant="ghost" size="icon" className="h-7 w-7 rounded-lg bg-black/30 text-white hover:bg-black/50 backdrop-blur-sm" />
                                }>
                                  <MoreVertical className="h-3.5 w-3.5" />
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                  <DropdownMenuItem
                                    onClick={() => handleDelete(item.id)}
                                    disabled={deletingId === item.id}
                                    className="text-red-600 focus:text-red-600"
                                  >
                                    <Trash2 className="mr-2 h-4 w-4" />
                                    Xóa media
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </div>
                          </div>

                          {/* Info — always visible below card */}
                          <div className="px-3 py-2.5">
                            <div className="flex items-center gap-1.5">
                              <TypeIcon className="h-3.5 w-3.5 shrink-0 text-[#7a96c9]" />
                              <span className="truncate text-[0.78rem] font-medium text-[#10213f]">
                                {item.caption || typeLabel}
                              </span>
                            </div>
                            <p className="mt-0.5 truncate text-[0.7rem] text-[#7a96c9]">
                              {getLocationName(item)}
                            </p>
                            {item.keywords && item.keywords.length > 0 && (
                              <div className="mt-1.5 flex flex-wrap gap-1">
                                {item.keywords.slice(0, 3).map((kw) => (
                                  <span key={kw} className="rounded-md bg-[#eef3fb] px-1.5 py-0.5 text-[0.6rem] font-medium text-[#52627f]">
                                    {kw}
                                  </span>
                                ))}
                                {item.keywords.length > 3 && (
                                  <span className="rounded-md bg-[#eef3fb] px-1.5 py-0.5 text-[0.6rem] font-medium text-[#7a96c9]">
                                    +{item.keywords.length - 3}
                                  </span>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}

                {/* Empty state */}
                {!loadingMedia && media.length === 0 && (
                  <AdminEmptyState
                    icon={ImageIcon}
                    title="Chưa có media nào"
                    description="Upload hình ảnh, video hoặc GIF để bổ sung vào trải nghiệm tham quan."
                    action={
                      <Button size="sm" onClick={openUpload} className="rounded-xl">
                        <Upload data-icon="inline-start" /> Upload Media
                      </Button>
                    }
                  />
                )}
              </>
            ) : (
              <AdminEmptyState
                icon={MapPin}
                title="Chọn một địa điểm"
                description="Chọn địa điểm từ danh sách bên trái để quản lý thư viện media."
              />
            )}
          </section>
        </div>
      </AdminPanel>
    </div>
  )
}
