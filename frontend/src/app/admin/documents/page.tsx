'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { adminApi } from '@/lib/admin-api'
import {
  AdminEmptyState,
  AdminModal,
  AdminNotice,
  AdminPageHeader,
  AdminPanel,
  AdminSelect,
  AdminSkeleton,
  AdminTextarea,
  categoryStyle,
} from '../_components/admin-ui'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  FileText,
  FolderOpen,
  Loader2,
  MoreHorizontal,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Tags,
  Trash2,
  Upload,
  X,
  ArrowRightLeft,
  FileType2,
} from 'lucide-react'

const UNCATEGORIZED_ID = '__uncategorized__'

interface DocumentItem {
  id: string
  title: string
  file_url: string
  file_type: string
  file_size: number
  location_id: string | null
  category_id: string | null
  category_name: string | null
  category_color: string | null
  chunk_count: number
  status: 'pending' | 'processing' | 'ready' | 'error'
  error_message: string | null
  created_at: string | null
}

interface CategoryItem {
  id: string
  name: string
  slug: string
  description: string
  color: string
  sort_order: number
  document_count: number
  created_at: string | null
}

type CategoryNode = CategoryItem & {
  isUncategorized?: boolean
}

type CategoryForm = {
  name: string
  slug: string
  description: string
  color: string
  sort_order: number
}

const defaultCategoryForm: CategoryForm = {
  name: '',
  slug: '',
  description: '',
  color: '#3b82f6',
  sort_order: 0,
}

const statusConfig = {
  pending: { icon: Clock, label: 'Chờ xử lý', variant: 'secondary' as const, color: '#52627f' },
  processing: { icon: Loader2, label: 'Đang xử lý', variant: 'outline' as const, color: '#b8891f' },
  ready: { icon: CheckCircle2, label: 'Sẵn sàng', variant: 'default' as const, color: '#2c8b57' },
  error: { icon: AlertCircle, label: 'Lỗi', variant: 'destructive' as const, color: '#c14b4b' },
}

const fileTypeIcons: Record<string, string> = {
  pdf: '📄',
  docx: '📝',
  doc: '📝',
  md: '📋',
  txt: '📃',
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`
}

function slugify(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'd')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

export default function DocumentsPage() {
  const [documents, setDocuments] = useState<DocumentItem[]>([])
  const [categories, setCategories] = useState<CategoryItem[]>([])
  const [uncategorizedCount, setUncategorizedCount] = useState(0)
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null)
  const [total, setTotal] = useState(0)
  const [loadingCategories, setLoadingCategories] = useState(true)
  const [loadingDocuments, setLoadingDocuments] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [assigningId, setAssigningId] = useState<string | null>(null)
  const [categoryModalOpen, setCategoryModalOpen] = useState(false)
  const [editingCategory, setEditingCategory] = useState<CategoryItem | null>(null)
  const [categoryForm, setCategoryForm] = useState<CategoryForm>(defaultCategoryForm)
  const [savingCategory, setSavingCategory] = useState(false)
  const [deletingCategoryId, setDeletingCategoryId] = useState<string | null>(null)

  const [showUpload, setShowUpload] = useState(false)
  const [uploadFile, setUploadFile] = useState<File | null>(null)
  const [uploadTitle, setUploadTitle] = useState('')
  const [uploadCategoryId, setUploadCategoryId] = useState('')
  const [uploading, setUploading] = useState(false)
  const [uploadStatus, setUploadStatus] = useState<string | null>(null)

  const categoryNodes = useMemo<CategoryNode[]>(() => {
    return [
      ...categories,
      {
        id: UNCATEGORIZED_ID,
        name: 'Chưa phân loại',
        slug: 'uncategorized',
        description: 'Các file chưa được gán vào danh mục học liệu chính thức.',
        color: '#64748b',
        sort_order: categories.length + 1,
        document_count: uncategorizedCount,
        created_at: null,
        isUncategorized: true,
      },
    ]
  }, [categories, uncategorizedCount])

  const activeCategoryId = useMemo(() => {
    if (selectedCategoryId && categoryNodes.some((category) => category.id === selectedCategoryId)) {
      return selectedCategoryId
    }
    return categoryNodes[0]?.id ?? null
  }, [categoryNodes, selectedCategoryId])

  const selectedCategory = useMemo(
    () => categoryNodes.find((category) => category.id === activeCategoryId) ?? null,
    [activeCategoryId, categoryNodes],
  )

  const readyCount = useMemo(() => documents.filter((doc) => doc.status === 'ready').length, [documents])
  const categorizedCount = useMemo(
    () => categories.reduce((sum, category) => sum + category.document_count, 0),
    [categories],
  )
  const loading = loadingCategories || loadingDocuments

  const fetchCategories = useCallback(async () => {
    setLoadingCategories(true)
    setError(null)
    try {
      const [categoryData, uncategorizedData] = await Promise.all([
        adminApi.get<{ categories: CategoryItem[] }>('/categories'),
        adminApi.get<{ total: number; documents: DocumentItem[] }>('/documents?uncategorized=true&limit=1'),
      ])
      setCategories(categoryData.categories)
      setUncategorizedCount(uncategorizedData.total)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không thể tải danh mục')
    } finally {
      setLoadingCategories(false)
    }
  }, [])

  const fetchDocuments = useCallback(async () => {
    if (!activeCategoryId) {
      setDocuments([])
      setTotal(0)
      return
    }

    setLoadingDocuments(true)
    setError(null)
    try {
      const params = new URLSearchParams({ limit: '50' })
      if (search) params.set('search', search)
      if (activeCategoryId === UNCATEGORIZED_ID) {
        params.set('uncategorized', 'true')
      } else {
        params.set('category_id', activeCategoryId)
      }

      const data = await adminApi.get<{ total: number; documents: DocumentItem[] }>(
        `/documents?${params.toString()}`,
      )
      setDocuments(data.documents)
      setTotal(data.total)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không thể tải tài liệu')
    } finally {
      setLoadingDocuments(false)
    }
  }, [activeCategoryId, search])

  useEffect(() => {
    void Promise.resolve().then(fetchCategories)
  }, [fetchCategories])

  useEffect(() => {
    const timer = setTimeout(() => fetchDocuments(), search ? 300 : 0)
    return () => clearTimeout(timer)
  }, [fetchDocuments, search])

  useEffect(() => {
    const processing = documents.filter((doc) => doc.status === 'pending' || doc.status === 'processing')
    if (processing.length === 0) return

    const interval = setInterval(async () => {
      let changed = false
      for (const doc of processing) {
        try {
          const result = await adminApi.get<{ status: string; chunk_count: number }>(`/documents/${doc.id}/status`)
          if (result.status !== doc.status) changed = true
        } catch {}
      }
      if (changed) fetchDocuments()
    }, 3000)

    return () => clearInterval(interval)
  }, [documents, fetchDocuments])

  const selectCategory = (categoryId: string) => {
    setSearch('')
    setDocuments([])
    setTotal(0)
    setSelectedCategoryId(categoryId)
  }

  const refreshAll = async () => {
    await Promise.all([fetchCategories(), fetchDocuments()])
  }

  const openUpload = () => {
    setUploadCategoryId(selectedCategory?.isUncategorized ? '' : selectedCategory?.id ?? '')
    setShowUpload(true)
  }

  const openCreateCategory = () => {
    setEditingCategory(null)
    setCategoryForm({ ...defaultCategoryForm, sort_order: categories.length + 1 })
    setCategoryModalOpen(true)
  }

  const openEditCategory = (category: CategoryItem) => {
    setEditingCategory(category)
    setCategoryForm({
      name: category.name,
      slug: category.slug,
      description: category.description,
      color: category.color,
      sort_order: category.sort_order,
    })
    setCategoryModalOpen(true)
  }

  const closeCategoryModal = () => {
    setEditingCategory(null)
    setCategoryForm(defaultCategoryForm)
    setCategoryModalOpen(false)
  }

  const handleCategoryNameChange = (value: string) => {
    setCategoryForm((current) => ({
      ...current,
      name: value,
      slug: current.slug && editingCategory ? current.slug : slugify(value),
    }))
  }

  const saveCategory = async () => {
    if (!categoryForm.name.trim() || !categoryForm.slug.trim()) return

    setSavingCategory(true)
    setError(null)
    try {
      const payload = {
        name: categoryForm.name.trim(),
        slug: categoryForm.slug.trim(),
        description: categoryForm.description.trim(),
        color: categoryForm.color,
        sort_order: Number(categoryForm.sort_order) || 0,
      }

      if (editingCategory) {
        await adminApi.put(`/categories/${editingCategory.id}`, payload)
      } else {
        await adminApi.post('/categories', payload)
      }

      closeCategoryModal()
      await refreshAll()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không thể lưu danh mục')
    } finally {
      setSavingCategory(false)
    }
  }

  const deleteCategory = async (category: CategoryNode) => {
    if (category.isUncategorized) return
    if (!confirm(`Xóa danh mục "${category.name}"? Tài liệu trong nhóm này sẽ chuyển về Chưa phân loại.`)) return

    setDeletingCategoryId(category.id)
    setError(null)
    try {
      await adminApi.delete(`/categories/${category.id}`)
      if (selectedCategoryId === category.id) {
        setSelectedCategoryId(null)
        setDocuments([])
        setTotal(0)
      }
      await fetchCategories()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không thể xóa danh mục')
    } finally {
      setDeletingCategoryId(null)
    }
  }

  const updateDocumentCategory = async (doc: DocumentItem, categoryId: string) => {
    setAssigningId(doc.id)
    setError(null)
    try {
      await adminApi.patch(`/documents/${doc.id}/category`, {
        category_id: categoryId || null,
      })
      await refreshAll()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không thể cập nhật danh mục')
    } finally {
      setAssigningId(null)
    }
  }

  const handleDelete = async (id: string, title: string) => {
    if (!confirm(`Xóa "${title}"? Thao tác không thể hoàn tác.`)) return
    setDeletingId(id)
    setError(null)
    try {
      await adminApi.delete(`/documents/${id}`)
      setDocuments((prev) => prev.filter((doc) => doc.id !== id))
      setTotal((prev) => Math.max(prev - 1, 0))
      await fetchCategories()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không thể xóa tài liệu')
    } finally {
      setDeletingId(null)
    }
  }

  const handleUpload = async () => {
    if (!uploadFile || !uploadTitle.trim()) return
    setUploading(true)
    setUploadStatus('Đang upload...')
    try {
      const formData = new FormData()
      formData.append('file', uploadFile)
      formData.append('title', uploadTitle.trim())
      if (uploadCategoryId) formData.append('category_id', uploadCategoryId)

      const result = await adminApi.upload<{ document_id: string; status: string }>('/ingest', formData)
      setUploadStatus(`Upload thành công. ID: ${result.document_id}. Đang xử lý embedding...`)

      setTimeout(() => {
        setShowUpload(false)
        setUploadFile(null)
        setUploadTitle('')
        setUploadCategoryId('')
        setUploadStatus(null)
        void refreshAll()
      }, 1800)
    } catch (err) {
      setUploadStatus(`Lỗi: ${err instanceof Error ? err.message : 'Upload thất bại'}`)
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <AdminPageHeader
        title="Danh mục tài liệu"
        description="Quản lý học liệu RAG theo cấu trúc danh mục cha và file tài liệu con."
        meta={
          <>
            <Badge variant="outline" className="rounded-lg">{categories.length} danh mục</Badge>
            <Badge variant="secondary" className="rounded-lg">{categorizedCount} đã phân loại</Badge>
            {uncategorizedCount > 0 && <Badge variant="outline" className="rounded-lg">{uncategorizedCount} chưa phân loại</Badge>}
          </>
        }
        actions={
          <>
            <Button variant="outline" size="sm" onClick={() => void refreshAll()} disabled={loading} className="rounded-xl">
              <RefreshCw data-icon="inline-start" className={loading ? 'animate-spin' : ''} />
              Làm mới
            </Button>
            <Button size="sm" onClick={openUpload} className="rounded-xl">
              <Upload data-icon="inline-start" />
              Tải tài liệu
            </Button>
          </>
        }
      />

      {error && <AdminNotice tone="danger">{error}</AdminNotice>}

      <AdminPanel className="overflow-hidden !rounded-2xl">
        <div className="grid min-h-[560px] lg:grid-cols-[280px_minmax(0,1fr)]">
          {/* ─── Sidebar: Categories ─── */}
          <aside className="border-b border-[#d7e0f0]/70 bg-[#f6f8fb] lg:border-b-0 lg:border-r">
            <div className="flex items-center justify-between gap-3 border-b border-[#d7e0f0]/70 px-4 py-3.5">
              <h2 className="text-sm font-semibold text-[#10213f]">Danh mục</h2>
              <Button size="icon-sm" onClick={openCreateCategory} aria-label="Tạo danh mục" className="rounded-xl">
                <Plus />
              </Button>
            </div>

            <div className="max-h-[620px] overflow-y-auto p-2">
              {categoryNodes.map((category) => {
                const isSelected = selectedCategory?.id === category.id
                return (
                  <button
                    key={category.id}
                    type="button"
                    onClick={() => selectCategory(category.id)}
                    className={`group mb-0.5 flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left outline-none transition-all focus-visible:ring-2 focus-visible:ring-[#7a96c9]/30 ${
                      isSelected
                        ? 'bg-[#053384] text-white shadow-sm shadow-[#053384]/20'
                        : 'text-[#10213f] hover:bg-white'
                    }`}
                  >
                    {/* Color bar */}
                    <span
                      className={`h-8 w-1 shrink-0 rounded-full transition-colors ${isSelected ? 'bg-white/40' : ''}`}
                      style={!isSelected ? { backgroundColor: category.color } : undefined}
                    />
                    <div className="min-w-0 flex-1">
                      <span className="block truncate text-[0.82rem] font-medium">{category.name}</span>
                    </div>
                    <span className={`shrink-0 rounded-md px-1.5 py-0.5 text-[0.7rem] font-semibold tabular-nums ${
                      isSelected ? 'bg-white/20 text-white' : 'bg-[#eef3fb] text-[#52627f]'
                    }`}>
                      {category.document_count}
                    </span>
                  </button>
                )
              })}

              {!loadingCategories && categoryNodes.length === 0 && (
                <div className="px-3 py-8 text-center text-sm text-[#52627f]">
                  Chưa có danh mục tài liệu.
                </div>
              )}
            </div>
          </aside>

          {/* ─── Main: Documents ─── */}
          <section className="min-w-0 bg-white">
            {selectedCategory ? (
              <>
                {/* Category Header */}
                <div className="border-b border-[#d7e0f0]/70 px-5 py-4">
                  <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
                    <div className="flex min-w-0 items-center gap-3">
                      <div
                        className="flex size-10 shrink-0 items-center justify-center rounded-xl"
                        style={categoryStyle(selectedCategory.color)}
                      >
                        {selectedCategory.isUncategorized ? <FolderOpen className="h-5 w-5" /> : <Tags className="h-5 w-5" />}
                      </div>
                      <div className="min-w-0">
                        <h2 className="text-lg font-bold text-[#10213f]">{selectedCategory.name}</h2>
                        <p className="text-xs text-[#7a96c9]">
                          {total} tài liệu · {readyCount} sẵn sàng
                        </p>
                      </div>
                    </div>

                    <div className="flex shrink-0 items-center gap-2">
                      {!selectedCategory.isUncategorized && (
                        <DropdownMenu>
                          <DropdownMenuTrigger render={
                            <Button variant="outline" size="sm" className="rounded-xl" />
                          }>
                            <MoreHorizontal className="h-4 w-4" />
                            <span className="sr-only">Tùy chọn danh mục</span>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => openEditCategory(selectedCategory)}>
                              <Pencil className="mr-2 h-4 w-4" />
                              Sửa danh mục
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              onClick={() => deleteCategory(selectedCategory)}
                              disabled={deletingCategoryId === selectedCategory.id}
                              className="text-red-600 focus:text-red-600"
                            >
                              <Trash2 className="mr-2 h-4 w-4" />
                              Xóa danh mục
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                      <Button size="sm" onClick={openUpload} className="rounded-xl">
                        <Upload data-icon="inline-start" />
                        Tải tài liệu
                      </Button>
                    </div>
                  </div>

                  {/* Search */}
                  <div className="mt-4 relative max-w-md">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#7a96c9]" />
                    <Input
                      placeholder="Tìm file trong danh mục..."
                      value={search}
                      onChange={(event) => setSearch(event.target.value)}
                      className="rounded-xl pl-9"
                    />
                  </div>
                </div>

                {/* Document List */}
                <div className="divide-y divide-[#d7e0f0]/50">
                  {documents.map((doc) => {
                    const config = statusConfig[doc.status]
                    const StatusIcon = config.icon
                    const emoji = fileTypeIcons[doc.file_type?.toLowerCase()] || '📄'

                    return (
                      <div
                        key={doc.id}
                        className="group flex items-center gap-4 px-5 py-3.5 transition-colors hover:bg-[#f6f8fb]"
                      >
                        {/* File type icon */}
                        <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-[#eef3fb] text-lg">
                          {emoji}
                        </div>

                        {/* Info */}
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <p className="truncate text-[0.88rem] font-semibold text-[#10213f]">{doc.title}</p>
                            <span
                              className="inline-flex shrink-0 items-center gap-1 rounded-md px-1.5 py-0.5 text-[0.68rem] font-medium"
                              style={{ backgroundColor: `${config.color}14`, color: config.color }}
                            >
                              <StatusIcon className={`h-3 w-3 ${doc.status === 'processing' ? 'animate-spin' : ''}`} />
                              {config.label}
                            </span>
                          </div>
                          <p className="mt-0.5 text-xs text-[#7a96c9]">
                            <span className="font-mono uppercase">{doc.file_type}</span>
                            <span className="mx-1.5 text-[#d7e0f0]">·</span>
                            {formatBytes(doc.file_size)}
                            <span className="mx-1.5 text-[#d7e0f0]">·</span>
                            {doc.chunk_count} chunks
                            <span className="mx-1.5 text-[#d7e0f0]">·</span>
                            {doc.created_at ? new Date(doc.created_at).toLocaleDateString('vi-VN') : '—'}
                          </p>
                          {doc.error_message && (
                            <p className="mt-1 truncate text-xs text-red-600">{doc.error_message}</p>
                          )}
                        </div>

                        {/* Actions — context menu */}
                        <DropdownMenu>
                          <DropdownMenuTrigger render={
                            <Button
                              variant="ghost" size="icon-sm"
                              className="shrink-0 rounded-lg opacity-0 transition-opacity group-hover:opacity-100 focus:opacity-100"
                            />
                          }>
                            <MoreHorizontal className="h-4 w-4" />
                            <span className="sr-only">Tùy chọn</span>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-56">
                            {/* Reassign category sub-items */}
                            {categories.filter(c => c.id !== doc.category_id).map((cat) => (
                              <DropdownMenuItem
                                key={cat.id}
                                onClick={() => updateDocumentCategory(doc, cat.id)}
                                disabled={assigningId === doc.id}
                              >
                                <ArrowRightLeft className="mr-2 h-4 w-4" />
                                Chuyển sang: {cat.name}
                              </DropdownMenuItem>
                            ))}
                            {doc.category_id && (
                              <DropdownMenuItem
                                onClick={() => updateDocumentCategory(doc, '')}
                                disabled={assigningId === doc.id}
                              >
                                <ArrowRightLeft className="mr-2 h-4 w-4" />
                                Bỏ phân loại
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              onClick={() => handleDelete(doc.id, doc.title)}
                              disabled={deletingId === doc.id}
                              className="text-red-600 focus:text-red-600"
                            >
                              <Trash2 className="mr-2 h-4 w-4" />
                              Xóa tài liệu
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    )
                  })}

                  {/* Loading skeleton */}
                  {loadingDocuments && (
                    <div className="space-y-1 p-5">
                      {[1, 2, 3].map((i) => (
                        <div key={i} className="flex items-center gap-4 rounded-xl p-3">
                          <AdminSkeleton variant="circle" className="size-10 rounded-xl" />
                          <div className="flex-1 space-y-2">
                            <AdminSkeleton className="h-4 w-3/4" />
                            <AdminSkeleton className="h-3 w-1/2" />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Empty state */}
                  {!loadingDocuments && documents.length === 0 && (
                    <AdminEmptyState
                      icon={search ? Search : FileText}
                      title={search ? 'Không tìm thấy tài liệu' : 'Danh mục trống'}
                      description={search
                        ? 'Thử thay đổi từ khóa tìm kiếm.'
                        : 'Tải tài liệu lên để bắt đầu xây dựng kho học liệu RAG.'
                      }
                      action={!search ? (
                        <Button size="sm" onClick={openUpload} className="rounded-xl">
                          <Upload data-icon="inline-start" /> Tải tài liệu
                        </Button>
                      ) : undefined}
                    />
                  )}
                </div>
              </>
            ) : (
              <AdminEmptyState
                icon={FolderOpen}
                title="Chọn một danh mục"
                description="Chọn hoặc tạo danh mục tài liệu để bắt đầu quản lý học liệu RAG."
                action={
                  <Button size="sm" onClick={openCreateCategory} className="rounded-xl">
                    <Plus data-icon="inline-start" /> Tạo danh mục
                  </Button>
                }
              />
            )}
          </section>
        </div>
      </AdminPanel>

      {/* ─── Category Modal ─── */}
      {categoryModalOpen && (
        <AdminModal
          title={editingCategory ? `Chỉnh sửa: ${editingCategory.name}` : 'Tạo danh mục học liệu'}
          footer={
            <>
              <Button variant="outline" onClick={closeCategoryModal} className="rounded-xl">
                Hủy
              </Button>
              <Button
                onClick={saveCategory}
                disabled={savingCategory || !categoryForm.name.trim() || !categoryForm.slug.trim()}
                className="rounded-xl"
              >
                {savingCategory ? 'Đang lưu...' : 'Lưu danh mục'}
              </Button>
            </>
          }
        >
          <div className="grid gap-4 md:grid-cols-[1fr_160px]">
            <label className="flex flex-col gap-1.5 text-sm font-medium text-[#10213f]">
              Tên danh mục
              <Input value={categoryForm.name} onChange={(event) => handleCategoryNameChange(event.target.value)} className="rounded-xl" />
            </label>
            <label className="flex flex-col gap-1.5 text-sm font-medium text-[#10213f]">
              Màu nhận diện
              <Input
                type="color"
                value={categoryForm.color}
                onChange={(event) => setCategoryForm({ ...categoryForm, color: event.target.value })}
                className="h-10 rounded-xl"
              />
            </label>
            <label className="flex flex-col gap-1.5 text-sm font-medium text-[#10213f]">
              Slug R2
              <Input
                value={categoryForm.slug}
                onChange={(event) => setCategoryForm({ ...categoryForm, slug: event.target.value })}
                className="rounded-xl font-mono"
              />
            </label>
            <label className="flex flex-col gap-1.5 text-sm font-medium text-[#10213f]">
              Thứ tự
              <Input
                type="number"
                value={categoryForm.sort_order}
                onChange={(event) => setCategoryForm({ ...categoryForm, sort_order: Number(event.target.value) })}
                className="rounded-xl"
              />
            </label>
            <label className="flex flex-col gap-1.5 text-sm font-medium text-[#10213f] md:col-span-2">
              Mô tả
              <AdminTextarea
                className="min-h-24"
                value={categoryForm.description}
                onChange={(event) => setCategoryForm({ ...categoryForm, description: event.target.value })}
              />
            </label>
          </div>
        </AdminModal>
      )}

      {/* ─── Upload Modal ─── */}
      {showUpload && (
        <AdminModal
          title="Upload tài liệu RAG"
          footer={
            <>
              <Button variant="outline" onClick={() => { setShowUpload(false); setUploadStatus(null) }} className="rounded-xl">
                Hủy
              </Button>
              <Button onClick={handleUpload} disabled={uploading || !uploadFile || !uploadTitle.trim()} className="rounded-xl">
                {uploading ? 'Đang upload...' : 'Upload & Ingest'}
              </Button>
            </>
          }
        >
          <div className="grid gap-4">
            <label className="flex flex-col gap-1.5 text-sm font-medium text-[#10213f]">
              Tiêu đề
              <Input value={uploadTitle} onChange={(event) => setUploadTitle(event.target.value)} placeholder="VD: Quy chế đào tạo 2026" className="rounded-xl" />
            </label>
            <label className="flex flex-col gap-1.5 text-sm font-medium text-[#10213f]">
              Danh mục
              <AdminSelect value={uploadCategoryId} onChange={(event) => setUploadCategoryId(event.target.value)}>
                <option value="">Chưa phân loại</option>
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </AdminSelect>
            </label>
            <div>
              <p className="text-sm font-medium text-[#10213f]">File PDF/DOCX</p>
              <label className="mt-1.5 flex cursor-pointer items-center gap-3 rounded-xl border-2 border-dashed border-[#d7e0f0] p-4 text-sm transition-colors hover:border-[#7a96c9] hover:bg-[#f6f8fb]">
                <Upload className="h-5 w-5 text-[#7a96c9]" />
                <span className="text-[#52627f]">{uploadFile ? `${uploadFile.name} (${formatBytes(uploadFile.size)})` : 'Chọn file, tối đa 10MB'}</span>
                <input type="file" accept=".pdf,.docx" className="hidden" onChange={(event) => setUploadFile(event.target.files?.[0] || null)} />
              </label>
            </div>
            {uploadStatus && (
              <AdminNotice tone={uploadStatus.startsWith('Lỗi') ? 'danger' : 'success'}>
                {uploadStatus}
              </AdminNotice>
            )}
          </div>
        </AdminModal>
      )}
    </div>
  )
}
