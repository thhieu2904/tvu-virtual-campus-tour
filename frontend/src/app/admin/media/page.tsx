"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { adminApi } from "@/lib/admin-api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  AdminEmptyState,
  AdminModal,
  AdminNotice,
  AdminPanel,
  AdminSelect,
  AdminSkeleton,
  AdminWorkbench,
  AdminResourceSidebar,
  AdminMetricStrip,
  AdminPreviewFrame,
  AdminStatusPill,
} from "../_components/admin-ui";
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
  Search,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";

interface MediaItem {
  id: string;
  location_id: string;
  type: "image" | "video" | "gif";
  url: string;
  caption: string;
  keywords: string[];
  is_intro: boolean;
  sort_order: number;
  created_at: string | null;
  location_name?: string | null;
}

interface LocationOption {
  id: string;
  name: string;
  slug: string;
  description?: string | null;
  media_count: number;
}

interface LocationNode extends LocationOption {
  isAll?: boolean;
}

const ALL_LOCATIONS_ID = "__all__";

const typeIcons: Record<string, typeof FileImage> = {
  image: FileImage,
  video: Film,
  gif: ImageIcon,
};
const typeLabels: Record<string, string> = {
  image: "Hình ảnh",
  video: "Video",
  gif: "GIF",
};

export default function MediaPage() {
  const [media, setMedia] = useState<MediaItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loadingMedia, setLoadingMedia] = useState(true);
  const [loadingLocations, setLoadingLocations] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedLocationId, setSelectedLocationId] = useState<string | null>(
    null,
  );
  const [filterType, setFilterType] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<"created_at" | "caption">("created_at");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [locations, setLocations] = useState<LocationOption[]>([]);
  const [selectedMediaId, setSelectedMediaId] = useState<string | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);

  // Upload
  const [showUpload, setShowUpload] = useState(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadCaption, setUploadCaption] = useState("");
  const [uploadKeywords, setUploadKeywords] = useState("");
  const [uploadLocationId, setUploadLocationId] = useState("");
  const [uploadIsIntro, setUploadIsIntro] = useState(false);
  const [uploading, setUploading] = useState(false);

  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [confirmDialog, setConfirmDialog] = useState<{ title: string; message: string; action: () => void } | null>(null);

  const locationNodes = useMemo<LocationNode[]>(() => {
    const totalMedia = locations.reduce(
      (sum, loc) => sum + (loc.media_count || 0),
      0,
    );
    return [
      {
        id: ALL_LOCATIONS_ID,
        name: "Tất cả địa điểm",
        slug: "all",
        description: "Tổng hợp media từ tất cả địa điểm trong campus tour.",
        media_count: totalMedia,
        isAll: true,
      },
      ...locations,
    ];
  }, [locations]);

  const activeLocationId = useMemo(() => {
    if (loadingLocations && locations.length === 0) {
      return null;
    }
    if (
      selectedLocationId &&
      locationNodes.some((loc) => loc.id === selectedLocationId)
    ) {
      return selectedLocationId;
    }
    const firstWithMedia = locationNodes.find(
      (loc) => !loc.isAll && loc.media_count > 0,
    );
    return firstWithMedia?.id ?? locationNodes[0]?.id ?? null;
  }, [loadingLocations, locationNodes, locations.length, selectedLocationId]);

  const selectedLocation = useMemo(
    () => locationNodes.find((loc) => loc.id === activeLocationId) ?? null,
    [activeLocationId, locationNodes],
  );

  const fetchMedia = useCallback(async () => {
    if (!activeLocationId) {
      setMedia([]);
      setTotal(0);
      setLoadingMedia(false);
      setSelectedMediaId(null);
      return;
    }
    setLoadingMedia(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        limit: "100",
        sort_by: sortBy,
        sort_order: sortOrder,
      });
      if (activeLocationId !== ALL_LOCATIONS_ID)
        params.set("location_id", activeLocationId);
      if (filterType) params.set("type", filterType);
      if (searchQuery.trim()) params.set("search", searchQuery.trim());
      const data = await adminApi.get<{ total: number; media: MediaItem[] }>(
        `/media?${params.toString()}`,
      );
      setMedia(data.media);
      setTotal(data.total);
      if (data.media.length > 0) {
        setSelectedMediaId(data.media[0].id);
      } else {
        setSelectedMediaId(null);
      }
      setPreviewOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không thể tải");
    } finally {
      setLoadingMedia(false);
    }
  }, [activeLocationId, filterType, searchQuery, sortBy, sortOrder]);

  const fetchLocations = useCallback(async () => {
    setLoadingLocations(true);
    try {
      const data = await adminApi.get<{ locations: LocationOption[] }>(
        "/locations",
      );
      setLocations(data.locations);
    } catch {
      setLocations([]);
    } finally {
      setLoadingLocations(false);
    }
  }, []);

  useEffect(() => {
    void Promise.resolve().then(fetchLocations);
  }, [fetchLocations]);
  useEffect(() => {
    void Promise.resolve().then(fetchMedia);
  }, [fetchMedia]);
  useEffect(() => {
    const timeout = window.setTimeout(() => setSearchQuery(searchInput), 300);
    return () => window.clearTimeout(timeout);
  }, [searchInput]);

  const selectLocation = (locationId: string) => {
    setMedia([]);
    setTotal(0);
    setSelectedLocationId(locationId);
    setSelectedMediaId(null);
  };

  const refreshAll = async () => {
    await Promise.all([fetchLocations(), fetchMedia()]);
  };

  const handleDelete = async (id: string) => {
    setConfirmDialog({
      title: 'Xác nhận xóa media',
      message: 'Bạn có chắc chắn muốn xóa media này? Thao tác này không thể hoàn tác.',
      action: async () => {
        setDeletingId(id);
        try {
          const target = media.find((item) => item.id === id);
          await adminApi.delete(`/media/${id}`);
          const newMedia = media.filter((m) => m.id !== id);
          setMedia(newMedia);
          setTotal((prev) => prev - 1);
          if (selectedMediaId === id) {
            setSelectedMediaId(newMedia.length > 0 ? newMedia[0].id : null);
            setPreviewOpen(false);
          }
          if (target) {
            setLocations((prev) =>
              prev.map((loc) =>
                loc.id === target.location_id
                  ? { ...loc, media_count: Math.max((loc.media_count || 0) - 1, 0) }
                  : loc,
              ),
            );
          }
          setToast({ message: 'Xóa media thành công', type: 'success' })
        } catch (err) {
          setError(err instanceof Error ? err.message : "Không thể xóa");
        } finally {
          setDeletingId(null);
        }
      }
    });
  };

  const openUpload = () => {
    if (selectedLocation && !selectedLocation.isAll) {
      setUploadLocationId(selectedLocation.id);
    } else {
      setUploadLocationId("");
    }
    setShowUpload(true);
  };

  const handleUpload = async () => {
    if (!uploadFile || !uploadLocationId) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", uploadFile);
      formData.append("caption", uploadCaption);
      formData.append(
        "keywords",
        JSON.stringify(
          uploadKeywords
            .split(",")
            .map((k) => k.trim())
            .filter(Boolean),
        ),
      );
      formData.append("location_id", uploadLocationId);
      formData.append("is_intro", String(uploadIsIntro));
      await adminApi.upload("/media", formData);
      setShowUpload(false);
      setUploadFile(null);
      setUploadCaption("");
      setUploadKeywords("");
      setUploadLocationId("");
      setUploadIsIntro(false);
      setToast({ message: 'Tải lên media thành công!', type: 'success' });
      setTimeout(() => setToast(null), 3500);
      await Promise.all([fetchLocations(), fetchMedia()]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload lỗi");
    } finally {
      setUploading(false);
    }
  };

  const getLocationName = (item: MediaItem) =>
    item.location_name ||
    locations.find((l) => l.id === item.location_id)?.name ||
    item.location_id;

  const sidebarItems = locationNodes.map((loc) => ({
    id: loc.id,
    title: loc.name,
    subtitle: loc.slug !== "all" ? `/${loc.slug}` : "Toàn bộ thư viện",
    count: loc.media_count,
    icon: loc.isAll ? ImageIcon : MapPin,
  }));

  const visibleImages = media.filter((m) => m.type === "image").length;
  const visibleVideos = media.filter((m) => m.type === "video").length;
  const visibleGifs = media.filter((m) => m.type === "gif").length;
  const visibleIntro = media.filter((m) => m.is_intro).length;

  const metrics = [
    {
      label: "Đang hiển thị",
      value: media.length,
      description:
        total > media.length
          ? `${total} file trong API`
          : "Theo bộ lọc hiện tại",
    },
    { label: "Hình ảnh", value: visibleImages, color: "#053384" },
    {
      label: "Video/GIF",
      value: visibleVideos + visibleGifs,
      color: "#52627f",
    },
    { label: "Intro media", value: visibleIntro, color: "#b8891f" },
  ];

  const selectedMediaItem = media.find((m) => m.id === selectedMediaId);
  const selectedLocationTotal = selectedLocation?.media_count ?? 0;
  const sortValue =
    sortBy === "created_at" && sortOrder === "desc"
      ? "newest"
      : sortBy === "created_at" && sortOrder === "asc"
        ? "oldest"
        : "name";

  return (
    <>
      <div className="flex h-[calc(100vh-8rem)] flex-col gap-4">
        <div className="flex shrink-0 items-center justify-between">
          <h1 className="text-[1.6rem] font-bold tracking-[-0.01em] text-[#10213f]">
            Thư viện media
          </h1>
        </div>

        {error && <AdminNotice tone="danger">{error}</AdminNotice>}

        <AdminWorkbench
          className="min-h-0 flex-1"
          sidebar={
            <AdminResourceSidebar
              title="Địa điểm"
              items={sidebarItems}
              activeId={activeLocationId}
              onSelect={selectLocation}
              loading={loadingLocations}
              collapsibleLimit={8}
              summary={
                <div className="flex flex-wrap gap-2 text-xs text-[#52627f]">
                  <span>{locations.length} địa điểm</span>
                  <span>·</span>
                  <span>{locationNodes[0]?.media_count ?? 0} media</span>
                </div>
              }
            />
          }
          main={
            <AdminPanel className="flex h-full flex-col overflow-hidden">
              <div className="shrink-0 border-b border-[#d7e0f0]/70 bg-white px-5 py-3">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-[#eef3fb] text-[#053384]">
                      {selectedLocation?.isAll ? (
                        <ImageIcon className="h-5 w-5" />
                      ) : (
                        <MapPin className="h-5 w-5" />
                      )}
                    </div>
                    <div className="min-w-0">
                      <h2 className="truncate text-lg font-bold text-[#10213f]">
                        {selectedLocation?.name ?? "Thư viện media"}
                      </h2>
                      <p className="mt-0.5 text-xs text-[#7a96c9]">
                        {selectedLocationTotal} file trong địa điểm này
                        {filterType && (
                          <> · đang lọc {typeLabels[filterType]}</>
                        )}
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#7a96c9]" />
                      <Input
                        placeholder="Tìm theo caption..."
                        value={searchInput}
                        onChange={(event) => setSearchInput(event.target.value)}
                        className="h-8 w-48 rounded-xl pl-9 text-sm"
                      />
                    </div>
                    <AdminSelect
                      value={filterType}
                      onChange={(e) => setFilterType(e.target.value)}
                      className="w-40"
                    >
                      <option value="">Tất cả loại</option>
                      <option value="image">Hình ảnh</option>
                      <option value="video">Video</option>
                      <option value="gif">GIF</option>
                    </AdminSelect>
                    <AdminSelect
                      value={sortValue}
                      onChange={(event) => {
                        if (event.target.value === "newest") {
                          setSortBy("created_at");
                          setSortOrder("desc");
                        } else if (event.target.value === "oldest") {
                          setSortBy("created_at");
                          setSortOrder("asc");
                        } else {
                          setSortBy("caption");
                          setSortOrder("asc");
                        }
                      }}
                      className="w-36"
                    >
                      <option value="newest">Mới nhất</option>
                      <option value="oldest">Cũ nhất</option>
                      <option value="name">Theo tên</option>
                    </AdminSelect>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => void refreshAll()}
                      disabled={loadingMedia || loadingLocations}
                      className="rounded-xl"
                    >
                      <RefreshCw
                        data-icon="inline-start"
                        className={
                          loadingMedia || loadingLocations ? "animate-spin" : ""
                        }
                      />{" "}
                      Làm mới
                    </Button>
                    <Button
                      size="sm"
                      onClick={openUpload}
                      className="rounded-xl"
                    >
                      <Upload data-icon="inline-start" /> Upload
                    </Button>
                  </div>
                </div>

                <div className="mt-3">
                  <AdminMetricStrip variant="compact" metrics={metrics} />
                </div>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto p-5">
                {loadingMedia ? (
                  <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-4">
                    {[1, 2, 3, 4, 5, 6].map((i) => (
                      <AdminSkeleton
                        key={i}
                        variant="card"
                        className="h-44 rounded-xl"
                      />
                    ))}
                  </div>
                ) : media.length === 0 ? (
                  <AdminEmptyState
                    icon={ImageIcon}
                    title={
                      selectedLocation?.isAll
                        ? "Thư viện chưa có media"
                        : `${selectedLocation?.name ?? "Địa điểm"} chưa có media`
                    }
                    description={
                      filterType || searchQuery
                        ? "Không có file phù hợp với bộ lọc hiện tại."
                        : "Upload hình ảnh, video hoặc GIF để hoàn thiện trải nghiệm tham quan."
                    }
                    action={
                      <Button
                        size="sm"
                        onClick={openUpload}
                        className="rounded-xl"
                      >
                        <Upload data-icon="inline-start" /> Upload media
                      </Button>
                    }
                  />
                ) : (
                  <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-4">
                    {media.map((item) => {
                      const TypeIcon = typeIcons[item.type] || ImageIcon;
                      const isSelected = selectedMediaId === item.id;

                      return (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => {
                            setSelectedMediaId(item.id);
                            setPreviewOpen(true);
                          }}
                          className={`group overflow-hidden rounded-xl border bg-white text-left outline-none transition-all focus-visible:ring-2 focus-visible:ring-[#7a96c9]/30 ${
                            isSelected
                              ? "border-[#053384] shadow-md shadow-[#053384]/10"
                              : "border-[#d7e0f0]/80 hover:border-[#7a96c9]/50 hover:shadow-md"
                          }`}
                        >
                          <div className="relative aspect-[4/3] overflow-hidden bg-[#eef3fb]">
                            {item.type === "video" ? (
                              <div className="flex h-full items-center justify-center bg-[#10213f]">
                                <div className="flex size-11 items-center justify-center rounded-full bg-white/15 text-white backdrop-blur-sm">
                                  <Play className="h-5 w-5" />
                                </div>
                              </div>
                            ) : (
                              /* eslint-disable-next-line @next/next/no-img-element */
                              <img
                                src={item.url}
                                alt={item.caption || "Media"}
                                className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
                              />
                            )}
                            <div className="absolute left-2 top-2 flex flex-wrap gap-1.5">
                              <AdminStatusPill
                                status="info"
                                label={
                                  <>
                                    <TypeIcon className="mr-1 h-3 w-3" />{" "}
                                    {typeLabels[item.type] || item.type}
                                  </>
                                }
                                className="border-white/50 bg-white/90 text-[#053384] backdrop-blur"
                              />
                              {item.is_intro && (
                                <AdminStatusPill
                                  status="warning"
                                  label={
                                    <>
                                      <Star className="mr-1 h-3 w-3" /> Intro
                                    </>
                                  }
                                  className="border-0 bg-[#e3b83c] text-white"
                                />
                              )}
                            </div>
                          </div>
                          <div className="flex flex-col gap-1.5 px-3 py-2.5">
                            <p
                              className="line-clamp-2 text-[0.82rem] font-semibold leading-snug text-[#10213f]"
                              title={item.caption}
                            >
                              {item.caption || "Chưa có mô tả"}
                            </p>

                            {selectedLocation?.isAll && (
                              <p className="truncate text-[0.72rem] text-[#053384] font-medium flex items-center gap-1">
                                <MapPin className="h-3 w-3" />{" "}
                                {getLocationName(item)}
                              </p>
                            )}

                            {item.keywords && item.keywords.length > 0 && (
                              <div className="flex flex-wrap gap-1 mt-0.5">
                                {item.keywords.slice(0, 3).map((kw, i) => (
                                  <span
                                    key={i}
                                    className="inline-flex items-center rounded bg-[#f6f8fb] px-1.5 py-0.5 text-[0.65rem] font-medium text-[#52627f] border border-[#d7e0f0]/50"
                                  >
                                    {kw}
                                  </span>
                                ))}
                                {item.keywords.length > 3 && (
                                  <span className="inline-flex items-center rounded bg-[#f6f8fb] px-1.5 py-0.5 text-[0.65rem] font-medium text-[#52627f] border border-[#d7e0f0]/50">
                                    +{item.keywords.length - 3}
                                  </span>
                                )}
                              </div>
                            )}

                            <div className="flex items-center justify-between mt-1 pt-2 border-t border-[#d7e0f0]/40">
                              <p className="truncate text-[0.68rem] text-[#7a96c9]">
                                {item.created_at
                                  ? new Date(
                                      item.created_at,
                                    ).toLocaleString("vi-VN")
                                  : "Không rõ ngày"}
                              </p>

                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </AdminPanel>
          }
        />
      </div>

      {/* ─── Upload Modal ─── */}
      {showUpload && (
        <AdminModal
          title="Upload Media"
          footer={
            <>
              <Button
                variant="outline"
                onClick={() => setShowUpload(false)}
                className="rounded-xl"
              >
                Hủy
              </Button>
              <Button
                onClick={handleUpload}
                disabled={uploading || !uploadFile || !uploadLocationId}
                className="rounded-xl bg-[#053384] hover:bg-[#053384]/90 text-white"
              >
                {uploading ? "Đang upload..." : "Upload"}
              </Button>
            </>
          }
        >
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium text-[#10213f]">
                File *
              </label>
              <label className="mt-1.5 flex cursor-pointer items-center gap-3 rounded-xl border-2 border-dashed border-[#d7e0f0] p-4 transition-colors hover:border-[#7a96c9] hover:bg-[#f6f8fb]">
                <Upload className="h-5 w-5 text-[#7a96c9]" />
                <span className="text-sm text-[#52627f]">
                  {uploadFile ? uploadFile.name : "Chọn hình/video/GIF"}
                </span>
                <input
                  type="file"
                  accept="image/*,video/*,.gif"
                  className="hidden"
                  onChange={(e) => setUploadFile(e.target.files?.[0] || null)}
                />
              </label>
            </div>
            <label className="flex flex-col gap-1.5 text-sm font-medium text-[#10213f]">
              Location *
              <AdminSelect
                value={uploadLocationId}
                onChange={(e) => setUploadLocationId(e.target.value)}
              >
                <option value="">Chọn location</option>
                {locations.map((loc) => (
                  <option key={loc.id} value={loc.id}>
                    {loc.name}
                  </option>
                ))}
              </AdminSelect>
            </label>
            <label className="flex flex-col gap-1.5 text-sm font-medium text-[#10213f]">
              Caption
              <Input
                value={uploadCaption}
                onChange={(e) => setUploadCaption(e.target.value)}
                placeholder="Mô tả hình ảnh"
                className="rounded-xl"
              />
            </label>
            <label className="flex flex-col gap-1.5 text-sm font-medium text-[#10213f]">
              <div className="flex items-center gap-1.5">
                Keywords <span className="text-xs font-normal text-[#52627f]">(Không bắt buộc)</span>
              </div>
              <Input
                value={uploadKeywords}
                onChange={(e) => setUploadKeywords(e.target.value)}
                placeholder="VD: thư viện, sách, sinh viên"
                className="rounded-xl"
              />
              <p className="text-[0.75rem] font-normal leading-relaxed text-[#7a96c9]">
                Từ khóa giúp AI và Đại sứ ảo dễ dàng phân loại, tìm kiếm và lấy hình ảnh này ra để giới thiệu cho người dùng khi trả lời câu hỏi.
              </p>
            </label>
            <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-[#d7e0f0] p-3.5 transition-colors hover:bg-[#f6f8fb]">
              <input
                type="checkbox"
                checked={uploadIsIntro}
                onChange={(e) => setUploadIsIntro(e.target.checked)}
                className="rounded accent-[#053384]"
              />
              <div>
                <p className="text-sm font-medium text-[#10213f]">
                  Ảnh giới thiệu (Intro)
                </p>
                <p className="text-xs text-[#52627f]">
                  Đặt làm ảnh đại diện của location trong giao diện kiosk
                </p>
              </div>
            </label>
          </div>
        </AdminModal>
      )}

      {previewOpen && selectedMediaItem && (
        <AdminModal
          title="Xem trước media"
          className="max-w-4xl"
          footer={
            <>
              <Button
                variant="outline"
                onClick={() => setPreviewOpen(false)}
                className="rounded-xl"
              >
                Đóng
              </Button>
              <Button
                variant="outline"
                className="rounded-xl text-red-600 hover:bg-red-50 hover:text-red-700"
                onClick={() => handleDelete(selectedMediaItem.id)}
                disabled={deletingId === selectedMediaItem.id}
              >
                <Trash2 className="mr-2 h-4 w-4" />
                {deletingId === selectedMediaItem.id
                  ? "Đang xóa..."
                  : "Xóa media"}
              </Button>
            </>
          }
        >
          <div className="grid gap-5 lg:grid-cols-[minmax(0,1.4fr)_minmax(260px,0.6fr)]">
            <AdminPreviewFrame
              src={selectedMediaItem.url}
              type={selectedMediaItem.type === "video" ? "video" : "image"}
            />
            <div className="space-y-4 text-sm">
              <div>
                <p className="text-[0.7rem] font-semibold uppercase tracking-wide text-[#7a96c9]">
                  Mô tả
                </p>
                <p className="mt-1 font-medium text-[#10213f]">
                  {selectedMediaItem.caption || "Chưa có mô tả"}
                </p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-lg bg-[#f6f8fb] p-3">
                  <p className="text-[0.68rem] font-semibold uppercase text-[#7a96c9]">
                    Loại
                  </p>
                  <p className="mt-1 text-[#10213f]">
                    {typeLabels[selectedMediaItem.type] ||
                      selectedMediaItem.type}
                  </p>
                </div>
                <div className="rounded-lg bg-[#f6f8fb] p-3">
                  <p className="text-[0.68rem] font-semibold uppercase text-[#7a96c9]">
                    Intro
                  </p>
                  <p className="mt-1 text-[#10213f]">
                    {selectedMediaItem.is_intro ? "Có" : "Không"}
                  </p>
                </div>
              </div>
              <div>
                <p className="text-[0.7rem] font-semibold uppercase tracking-wide text-[#7a96c9]">
                  Địa điểm
                </p>
                <p className="mt-1 text-[#10213f]">
                  {getLocationName(selectedMediaItem)}
                </p>
              </div>
              {selectedMediaItem.keywords &&
                selectedMediaItem.keywords.length > 0 && (
                  <div>
                    <p className="text-[0.7rem] font-semibold uppercase tracking-wide text-[#7a96c9]">
                      Từ khóa
                    </p>
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      {selectedMediaItem.keywords.map((kw) => (
                        <span
                          key={kw}
                          className="rounded-md bg-[#eef3fb] px-2 py-1 text-[0.7rem] font-medium text-[#053384]"
                        >
                          {kw}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
            </div>
          </div>
        </AdminModal>
      )}

      {/* ─── Confirm Dialog Modal ─── */}
      {confirmDialog && (
        <AdminModal
          title={confirmDialog.title}
          footer={
            <>
              <Button variant="outline" onClick={() => setConfirmDialog(null)} className="rounded-xl">Hủy</Button>
              <Button 
                onClick={() => {
                  confirmDialog.action()
                  setConfirmDialog(null)
                }} 
                className="rounded-xl bg-red-600 hover:bg-red-700 text-white"
              >
                Xác nhận xóa
              </Button>
            </>
          }
        >
          <div className="text-[0.92rem] text-[#52627f] leading-relaxed">
            {confirmDialog.message}
          </div>
        </AdminModal>
      )}

      {/* ─── Floating Toast Notification ─── */}
      {toast && (
        <div className="fixed bottom-6 right-6 z-50 flex items-center gap-3 rounded-xl bg-white p-4 py-3.5 shadow-xl border border-[#d7e0f0] animate-in slide-in-from-bottom-5 fade-in duration-300">
          <div className={`flex size-8 shrink-0 items-center justify-center rounded-full ${toast.type === 'success' ? 'bg-[#d1fae5] text-[#2c8b57]' : 'bg-[#fee2e2] text-[#c14b4b]'}`}>
            {toast.type === 'success' ? <CheckCircle2 className="size-5" /> : <AlertCircle className="size-5" />}
          </div>
          <p className="text-[0.92rem] font-medium text-[#10213f]">{toast.message}</p>
        </div>
      )}
    </>
  );
}
