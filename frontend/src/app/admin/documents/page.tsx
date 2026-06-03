'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { adminApi } from '@/lib/admin-api'
import {
  AdminEmptyState,
  AdminModal,
  AdminNotice,
  AdminPanel,
  AdminSelect,
  AdminSkeleton,
  AdminTextarea,
  AdminWorkbench,
  AdminResourceSidebar,
  AdminMetricStrip,
} from '../_components/admin-ui'
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
  ArrowRightLeft,
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
  pending: { icon: Clock, label: 'Chờ xử lý', color: '#52627f', bg: '#f1f5f9' },
  processing: { icon: Loader2, label: 'Đang xử lý', color: '#b8891f', bg: '#fef3c7' },
  ready: { icon: CheckCircle2, label: 'Sẵn sàng', color: '#2c8b57', bg: '#d1fae5' },
  error: { icon: AlertCircle, label: 'Lỗi', color: '#c14b4b', bg: '#fee2e2' },
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
  const pendingCount = useMemo(() => documents.filter((doc) => doc.status === 'pending').length, [documents])
  const processingCount = useMemo(() => documents.filter((doc) => doc.status === 'processing').length, [documents])
  const errorCount = useMemo(() => documents.filter((doc) => doc.status === 'error').length, [documents])

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

  const sidebarItems = categoryNodes.map(cat => ({
    id: cat.id,
    title: cat.name,
    subtitle: cat.isUncategorized ? 'Cần phân loại' : `/${cat.slug}`,
    count: cat.document_count,
    color: cat.color,
    icon: cat.isUncategorized ? FolderOpen : Tags,
  }))

  const metrics = [
    { label: 'Trong danh mục', value: total, description: selectedCategory?.name ?? 'Đang chọn' },
    { label: 'Sẵn sàng', value: readyCount, color: '#2c8b57' },
    { label: 'Đang xử lý', value: processingCount + pendingCount, color: '#b8891f' },
    { label: 'Lỗi', value: errorCount, color: '#c14b4b' },
  ]

  return (
    <>
      <div className="flex h-[calc(100vh-8rem)] flex-col gap-4">
        <div className="flex shrink-0 items-center justify-between">
          <h1 className="text-[1.6rem] font-bold tracking-[-0.01em] text-[#10213f]">
            Kho tri thức RAG
          </h1>
        </div>

        {error && <AdminNotice tone="danger">{error}</AdminNotice>}

        <AdminWorkbench
        className="min-h-0 flex-1"
        sidebar={
          <AdminResourceSidebar
            title="Danh mục"
            items={sidebarItems}
            activeId={activeCategoryId}
            onSelect={selectCategory}
            loading={loadingCategories}
            headerActions={
              <Button variant="ghost" size="icon" onClick={openCreateCategory} className="h-7 w-7 rounded-lg">
                <Plus className="h-4 w-4" />
              </Button>
            }
            summary={
              <div className="flex flex-wrap gap-2 text-xs text-[#52627f]">
                <span>{categories.length} danh mục</span>
                <span>·</span>
                <span>{categorizedCount} đã phân loại</span>
                <span>·</span>
                <span>{uncategorizedCount} chưa phân loại</span>
              </div>
            }
          />
        }
        main={
          <AdminPanel className="flex h-full flex-col overflow-hidden">
              <div className="shrink-0 border-b border-[#d7e0f0]/70 bg-white px-5 py-3">
                <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
                  <div className="flex min-w-0 items-center gap-3">
                    <div
                      className="flex size-11 shrink-0 items-center justify-center rounded-xl border"
                      style={{
                        borderColor: `${selectedCategory?.color ?? '#7a96c9'}55`,
                        backgroundColor: `${selectedCategory?.color ?? '#7a96c9'}14`,
                        color: selectedCategory?.color ?? '#053384',
                      }}
                    >
                      {selectedCategory?.isUncategorized ? <FolderOpen className="h-5 w-5" /> : <Tags className="h-5 w-5" />}
                    </div>
                    <div className="min-w-0">
                      <h2 className="truncate text-lg font-bold text-[#10213f]">
                        {selectedCategory?.name ?? 'Danh mục tài liệu'}
                      </h2>
                      <p className="mt-0.5 text-xs text-[#7a96c9]">
                        {total} tài liệu · {readyCount} sẵn sàng cho RAG
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    {selectedCategory && !selectedCategory.isUncategorized && (
                      <DropdownMenu>
                        <DropdownMenuTrigger render={
                          <Button variant="outline" size="sm" className="rounded-xl" />
                        }>
                          <MoreHorizontal className="h-4 w-4" />
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
                    <Button variant="outline" size="sm" onClick={() => void refreshAll()} disabled={loading} className="rounded-xl">
                      <RefreshCw data-icon="inline-start" className={loading ? 'animate-spin' : ''} /> Làm mới
                    </Button>
                    <Button size="sm" onClick={openUpload} className="rounded-xl">
                      <Upload data-icon="inline-start" /> Tải tài liệu
                    </Button>
                  </div>
                </div>

                <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div className="relative max-w-xs">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#7a96c9]" />
                    <Input
                      placeholder="Tìm file trong danh mục..."
                      value={search}
                      onChange={(event) => setSearch(event.target.value)}
                      className="rounded-xl pl-9"
                    />
                  </div>
                  <AdminMetricStrip variant="compact" metrics={metrics} />
                </div>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto divide-y divide-[#d7e0f0]/50">
                {loadingDocuments ? (
                  <div className="p-4 space-y-4">
                    {[1, 2, 3].map(i => (
                      <div key={i} className="flex gap-4">
                        <AdminSkeleton variant="circle" className="size-10 rounded-xl" />
                        <div className="flex-1 space-y-2 py-1">
                          <AdminSkeleton className="h-4 w-1/3" />
                          <AdminSkeleton className="h-3 w-1/4" />
                        </div>
                      </div>
                    ))}
                  </div>
                ) : documents.length === 0 ? (
                  <AdminEmptyState
                    icon={search ? Search : FileText}
                    title={search ? 'Không tìm thấy tài liệu' : `${selectedCategory?.name ?? 'Danh mục'} chưa có tài liệu`}
                    description={search ? 'Thử thay đổi từ khóa tìm kiếm.' : 'Tải tài liệu lên để bắt đầu xây dựng kho học liệu RAG.'}
                    action={!search ? (
                      <Button size="sm" onClick={openUpload} className="rounded-xl">
                        <Upload data-icon="inline-start" /> Tải tài liệu
                      </Button>
                    ) : undefined}
                  />
                ) : (
                  documents.map((doc) => {
                    const config = statusConfig[doc.status]
                    const StatusIcon = config.icon
                    const emoji = fileTypeIcons[doc.file_type?.toLowerCase()] || '📄'
                    const isBusy = doc.status === 'pending' || doc.status === 'processing'

                    return (
                      <div
                        key={doc.id}
                        className="group flex flex-col gap-4 px-5 py-4 transition-colors hover:bg-[#f6f8fb] lg:flex-row lg:items-center"
                      >
                        <div className="flex items-start gap-4 min-w-0 flex-1">
                          <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-[#eef3fb] text-lg">
                            {emoji}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="truncate text-[0.9rem] font-semibold text-[#10213f]">{doc.title}</p>
                              <span
                                className="inline-flex shrink-0 items-center gap-1 rounded-md px-1.5 py-0.5 text-[0.68rem] font-medium"
                                style={{ backgroundColor: config.bg, color: config.color }}
                              >
                                <StatusIcon className={`h-3 w-3 ${isBusy ? 'animate-spin' : ''}`} />
                                {config.label}
                              </span>
                            </div>
                            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[#7a96c9]">
                              <span className="font-mono uppercase text-[#52627f]">{doc.file_type}</span>
                              <span className="flex items-center gap-1.5 before:content-['·'] before:text-[#d7e0f0] before:mr-1.5">{formatBytes(doc.file_size)}</span>
                              <span className="flex items-center gap-1.5 before:content-['·'] before:text-[#d7e0f0] before:mr-1.5 font-medium">{doc.chunk_count} chunks</span>
                              <span className="flex items-center gap-1.5 before:content-['·'] before:text-[#d7e0f0] before:mr-1.5">{doc.created_at ? new Date(doc.created_at).toLocaleDateString('vi-VN') : '—'}</span>
                            </div>
                            {doc.error_message && (
                              <p className="mt-1.5 truncate text-[0.78rem] text-red-600 bg-red-50 px-2 py-1 rounded border border-red-100 inline-block">
                                Lỗi: {doc.error_message}
                              </p>
                            )}
                          </div>
                        </div>

                        <div className="ml-14 flex items-center gap-3 lg:ml-0 lg:self-center">
                          <div className="hidden rounded-xl border border-[#d7e0f0]/70 bg-white px-3 py-2 text-right xl:block">
                            <p className="text-[0.68rem] font-semibold uppercase tracking-wide text-[#7a96c9]">Chunk</p>
                            <p className="text-sm font-bold text-[#10213f]">{doc.chunk_count}</p>
                          </div>
                          <DropdownMenu>
                            <DropdownMenuTrigger render={
                              <Button
                                variant="ghost" size="icon"
                                className="h-8 w-8 rounded-lg text-[#7a96c9] hover:text-[#10213f] hover:bg-white"
                              />
                            }>
                              <MoreHorizontal className="h-4 w-4" />
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-56">
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
                      </div>
                    )
                  })
                )}
              </div>
            </AdminPanel>
        }
      />
      </div>

      {/* ─── Category Modal ─── */}
      {categoryModalOpen && (
        <AdminModal
          title={editingCategory ? `Chỉnh sửa: ${editingCategory.name}` : 'Tạo danh mục học liệu'}
          footer={
            <>
              <Button variant="outline" onClick={closeCategoryModal} className="rounded-xl">Hủy</Button>
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
                className="h-10 rounded-xl px-2 py-1 cursor-pointer"
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
              <Button variant="outline" onClick={() => { setShowUpload(false); setUploadStatus(null) }} className="rounded-xl">Hủy</Button>
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
    </>
  )
}
