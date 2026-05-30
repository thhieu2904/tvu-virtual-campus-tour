'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { adminApi } from '@/lib/admin-api'
import {
  AdminModal,
  AdminNotice,
  AdminPageHeader,
  AdminPanel,
  AdminSelect,
  AdminTextarea,
  categoryStyle,
} from '../_components/admin-ui'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  FileText,
  FolderOpen,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Tags,
  Trash2,
  Upload,
  X,
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
  pending: { icon: Clock, label: 'Chờ xử lý', variant: 'secondary' as const },
  processing: { icon: Loader2, label: 'Đang xử lý', variant: 'outline' as const },
  ready: { icon: CheckCircle2, label: 'Sẵn sàng', variant: 'default' as const },
  error: { icon: AlertCircle, label: 'Lỗi', variant: 'destructive' as const },
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
            <Badge variant="outline">{categories.length} danh mục</Badge>
            <Badge variant="secondary">{categorizedCount} tài liệu đã phân loại</Badge>
            {uncategorizedCount > 0 && <Badge variant="outline">{uncategorizedCount} chưa phân loại</Badge>}
          </>
        }
        actions={
          <>
            <Button variant="outline" size="sm" onClick={() => void refreshAll()} disabled={loading}>
              <RefreshCw data-icon="inline-start" className={loading ? 'animate-spin' : ''} />
              Làm mới
            </Button>
            <Button size="sm" onClick={openUpload}>
              <Upload data-icon="inline-start" />
              Tải tài liệu
            </Button>
          </>
        }
      />

      {error && <AdminNotice tone="danger">{error}</AdminNotice>}

      <AdminPanel className="overflow-hidden">
        <div className="grid min-h-[560px] lg:grid-cols-[330px_minmax(0,1fr)]">
          <aside className="border-b border-border/70 bg-muted/20 lg:border-b-0 lg:border-r">
            <div className="flex items-center justify-between gap-3 border-b border-border/70 px-4 py-4">
              <div>
                <h2 className="text-base font-semibold">Danh mục</h2>
                <p className="mt-1 text-xs text-muted-foreground">Chọn một danh mục để xem file bên phải.</p>
              </div>
              <Button size="icon-sm" onClick={openCreateCategory} aria-label="Tạo danh mục">
                <Plus />
              </Button>
            </div>

            <div className="max-h-[620px] overflow-y-auto p-2">
              {categoryNodes.map((category) => {
                const isSelected = selectedCategory?.id === category.id
                return (
                  <div
                    key={category.id}
                    className={`group mb-1 grid grid-cols-[1fr_auto] items-center gap-1 rounded-lg border transition-colors ${
                      isSelected
                        ? 'border-primary/30 bg-primary/8 text-primary'
                        : 'border-transparent bg-transparent text-foreground hover:border-border hover:bg-background'
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => selectCategory(category.id)}
                      className="min-w-0 rounded-lg px-3 py-3 text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/20"
                    >
                      <div className="flex min-w-0 items-center gap-2">
                        <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: category.color }} />
                        <span className="truncate text-sm font-medium">{category.name}</span>
                        <Badge variant="outline" className="ml-auto shrink-0">
                          {category.document_count}
                        </Badge>
                      </div>
                      <p className="mt-1 truncate font-mono text-xs text-muted-foreground">
                        {category.isUncategorized ? 'documents/uncategorized/' : `documents/${category.slug}/`}
                      </p>
                    </button>

                    {!category.isUncategorized && (
                      <div className="flex pr-2 opacity-100 lg:opacity-0 lg:transition-opacity lg:group-hover:opacity-100">
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => openEditCategory(category)}
                          aria-label={`Sửa ${category.name}`}
                        >
                          <Pencil />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => deleteCategory(category)}
                          disabled={deletingCategoryId === category.id}
                          className="text-muted-foreground hover:text-destructive"
                          aria-label={`Xóa ${category.name}`}
                        >
                          <Trash2 />
                        </Button>
                      </div>
                    )}
                  </div>
                )
              })}

              {!loadingCategories && categoryNodes.length === 0 && (
                <div className="px-3 py-8 text-center text-sm text-muted-foreground">
                  Chưa có danh mục tài liệu.
                </div>
              )}
            </div>
          </aside>

          <section className="min-w-0 bg-card">
            {selectedCategory ? (
              <>
                <div className="border-b border-border/70 px-5 py-5">
                  <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                    <div className="flex min-w-0 items-start gap-3">
                      <div className="flex size-11 shrink-0 items-center justify-center rounded-lg border" style={categoryStyle(selectedCategory.color)}>
                        {selectedCategory.isUncategorized ? <FolderOpen /> : <Tags />}
                      </div>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <h2 className="text-xl font-semibold leading-tight">{selectedCategory.name}</h2>
                          <Badge variant="outline">{selectedCategory.document_count} tài liệu</Badge>
                          <Badge variant="secondary">{readyCount} sẵn sàng trong trang hiện tại</Badge>
                        </div>
                        <p className="mt-1 font-mono text-xs text-muted-foreground">
                          documents/{selectedCategory.slug}/
                        </p>
                        {selectedCategory.description && (
                          <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
                            {selectedCategory.description}
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="flex shrink-0 flex-wrap items-center gap-2">
                      {!selectedCategory.isUncategorized && (
                        <>
                          <Button variant="outline" size="sm" onClick={() => openEditCategory(selectedCategory)}>
                            <Pencil data-icon="inline-start" />
                            Sửa danh mục
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => deleteCategory(selectedCategory)}
                            disabled={deletingCategoryId === selectedCategory.id}
                            className="text-muted-foreground hover:text-destructive"
                          >
                            <Trash2 data-icon="inline-start" />
                            Xóa
                          </Button>
                        </>
                      )}
                      <Button size="sm" onClick={openUpload}>
                        <Upload data-icon="inline-start" />
                        Tải vào danh mục
                      </Button>
                    </div>
                  </div>

                  <div className="mt-5 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                    <div className="relative w-full max-w-md">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        placeholder="Tìm file trong danh mục này..."
                        value={search}
                        onChange={(event) => setSearch(event.target.value)}
                        className="pl-9"
                      />
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Hiển thị {total} file trong danh mục đang chọn.
                    </p>
                  </div>
                </div>

                <div className="divide-y divide-border/70">
                  {documents.map((doc) => {
                    const config = statusConfig[doc.status]
                    const StatusIcon = config.icon

                    return (
                      <div
                        key={doc.id}
                        className="grid gap-4 px-5 py-4 transition-colors hover:bg-muted/35 xl:grid-cols-[minmax(0,1fr)_280px] xl:items-center"
                      >
                        <div className="flex min-w-0 items-start gap-3">
                          <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/8 text-primary">
                            <FileText />
                          </div>
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="max-w-xl truncate font-medium">{doc.title}</p>
                              <Badge variant={config.variant}>
                                <StatusIcon data-icon="inline-start" className={doc.status === 'processing' ? 'animate-spin' : ''} />
                                {config.label}
                              </Badge>
                            </div>
                            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                              <span className="font-mono uppercase">{doc.file_type}</span>
                              <span>{formatBytes(doc.file_size)}</span>
                              <span>{doc.chunk_count} chunks</span>
                              <span>{doc.created_at ? new Date(doc.created_at).toLocaleDateString('vi-VN') : 'Chưa có ngày'}</span>
                            </div>
                            <p className="mt-1 max-w-2xl truncate font-mono text-xs text-muted-foreground">{doc.file_url}</p>
                            {doc.error_message && (
                              <p className="mt-1 max-w-2xl truncate text-xs text-destructive">{doc.error_message}</p>
                            )}
                          </div>
                        </div>

                        <div className="flex flex-col gap-2 sm:flex-row sm:items-center xl:justify-end">
                          <AdminSelect
                            value={doc.category_id || ''}
                            disabled={assigningId === doc.id}
                            onChange={(event) => updateDocumentCategory(doc, event.target.value)}
                            className="w-full sm:w-52"
                          >
                            <option value="">Chưa phân loại</option>
                            {categories.map((category) => (
                              <option key={category.id} value={category.id}>
                                {category.name}
                              </option>
                            ))}
                          </AdminSelect>
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            onClick={() => handleDelete(doc.id, doc.title)}
                            disabled={deletingId === doc.id}
                            className="text-muted-foreground hover:text-destructive"
                            aria-label={`Xóa ${doc.title}`}
                          >
                            <Trash2 />
                          </Button>
                        </div>
                      </div>
                    )
                  })}
                  {loadingDocuments && (
                    <div className="px-5 py-12 text-center text-muted-foreground">
                      Đang tải tài liệu...
                    </div>
                  )}
                  {!loadingDocuments && documents.length === 0 && (
                    <div className="px-5 py-12 text-center text-muted-foreground">
                      {search ? 'Không tìm thấy tài liệu phù hợp trong danh mục này.' : 'Danh mục này chưa có tài liệu.'}
                    </div>
                  )}
                </div>
              </>
            ) : (
              <div className="flex min-h-[480px] items-center justify-center px-6 text-center text-sm text-muted-foreground">
                Chọn hoặc tạo một danh mục tài liệu để bắt đầu quản lý học liệu RAG.
              </div>
            )}
          </section>
        </div>
      </AdminPanel>

      {categoryModalOpen && (
        <AdminModal
          title={editingCategory ? `Chỉnh sửa: ${editingCategory.name}` : 'Tạo danh mục học liệu'}
          footer={
            <>
              <Button variant="outline" onClick={closeCategoryModal}>
                <X data-icon="inline-start" />
                Hủy
              </Button>
              <Button
                onClick={saveCategory}
                disabled={savingCategory || !categoryForm.name.trim() || !categoryForm.slug.trim()}
              >
                {savingCategory ? 'Đang lưu...' : 'Lưu danh mục'}
              </Button>
            </>
          }
        >
          <div className="grid gap-4 md:grid-cols-[1fr_160px]">
            <label className="flex flex-col gap-1 text-sm font-medium">
              Tên danh mục
              <Input value={categoryForm.name} onChange={(event) => handleCategoryNameChange(event.target.value)} />
            </label>
            <label className="flex flex-col gap-1 text-sm font-medium">
              Màu nhận diện
              <Input
                type="color"
                value={categoryForm.color}
                onChange={(event) => setCategoryForm({ ...categoryForm, color: event.target.value })}
              />
            </label>
            <label className="flex flex-col gap-1 text-sm font-medium">
              Slug R2
              <Input
                value={categoryForm.slug}
                onChange={(event) => setCategoryForm({ ...categoryForm, slug: event.target.value })}
              />
            </label>
            <label className="flex flex-col gap-1 text-sm font-medium">
              Thứ tự
              <Input
                type="number"
                value={categoryForm.sort_order}
                onChange={(event) => setCategoryForm({ ...categoryForm, sort_order: Number(event.target.value) })}
              />
            </label>
            <label className="flex flex-col gap-1 text-sm font-medium md:col-span-2">
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

      {showUpload && (
        <AdminModal
          title="Upload tài liệu RAG"
          footer={
            <>
              <Button variant="outline" onClick={() => { setShowUpload(false); setUploadStatus(null) }}>
                <X data-icon="inline-start" />
                Hủy
              </Button>
              <Button onClick={handleUpload} disabled={uploading || !uploadFile || !uploadTitle.trim()}>
                {uploading ? 'Đang upload...' : 'Upload & Ingest'}
              </Button>
            </>
          }
        >
          <div className="grid gap-4">
            <label className="flex flex-col gap-1 text-sm font-medium">
              Tiêu đề
              <Input value={uploadTitle} onChange={(event) => setUploadTitle(event.target.value)} placeholder="VD: Quy chế đào tạo 2026" />
            </label>
            <label className="flex flex-col gap-1 text-sm font-medium">
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
              <p className="text-sm font-medium">File PDF/DOCX</p>
              <label className="mt-1 flex cursor-pointer items-center gap-3 rounded-lg border border-dashed border-input bg-muted/40 p-4 text-sm hover:bg-muted">
                <Upload className="text-muted-foreground" />
                <span>{uploadFile ? `${uploadFile.name} (${formatBytes(uploadFile.size)})` : 'Chọn file, tối đa 10MB'}</span>
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
