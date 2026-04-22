/**
 * Tour Store — Zustand state management for SPA navigation.
 *
 * Tất cả locations dùng CHUNG 1 trang → chỉ thay đổi DATA trong store.
 * Khi currentLocationSlug thay đổi → toàn bộ UI re-render với data mới:
 *   - Ảnh 360° mới
 *   - Intro message mới
 *   - Suggested questions mới
 *   - Navigation links mới
 */

import { create } from "zustand";

// ===== Types =====

export interface LocationNode {
  id: string;
  name: string;
  slug: string;
  status: "active" | "inactive";
  mapX: number;
  mapY: number;
  isStartNode: boolean;
  description: string;
  introMessage: string;
  backgroundUrl: string;
  suggestedQuestions: string[];
  links: { toSlug: string; label: string }[];
}

interface TourState {
  // === Data ===
  locations: LocationNode[];
  currentLocationSlug: string;
  isLoading: boolean;
  isTransitioning: boolean;

  // === Computed ===
  currentLocation: () => LocationNode | undefined;

  // === Actions ===
  setLocations: (locations: LocationNode[]) => void;
  navigateTo: (slug: string) => void;
  setLoading: (loading: boolean) => void;
}

// ===== Demo Data (sẽ thay bằng API call sau) =====

const DEMO_LOCATIONS: LocationNode[] = [
  {
    id: "1",
    name: "Cổng chính TVU",
    slug: "cong-chinh",
    status: "active",
    mapX: 50,
    mapY: 85,
    isStartNode: true,
    description: "Cổng chính Đại học Trà Vinh - Khu 1",
    introMessage:
      "Chào mừng bạn đến với Đại học Trà Vinh! Mình là Trợ lý ảo TVU. Bạn muốn tham quan khu vực nào?",
    backgroundUrl: "/demo/gate_giua_cong.jpg",
    suggestedQuestions: [
      "Giới thiệu về trường TVU",
      "Đưa mình tới Thư viện",
      "Có ngành CNTT không?",
    ],
    links: [
      { toSlug: "thu-vien", label: "Đi tới Thư viện" },
      { toSlug: "khoa-cntt", label: "Đi tới Khoa CNTT" },
    ],
  },
  {
    id: "2",
    name: "Thư viện TVU",
    slug: "thu-vien",
    status: "active",
    mapX: 70,
    mapY: 10,
    isStartNode: false,
    description: "Thư viện trung tâm Đại học Trà Vinh",
    introMessage:
      "Đây là Thư viện trung tâm TVU! Nơi đây phục vụ hơn 20,000 sinh viên với hàng ngàn đầu sách và tài liệu điện tử.",
    backgroundUrl: "/demo/c7_middle.jpg",
    suggestedQuestions: [
      "Giờ mở cửa thư viện?",
      "Có WiFi không?",
      "Đưa mình tới Khoa CNTT",
    ],
    links: [
      { toSlug: "cong-chinh", label: "Quay lại Cổng chính" },
      { toSlug: "khoa-cntt", label: "Đi tới Khoa CNTT" },
    ],
  },
  {
    id: "3",
    name: "Khoa CNTT",
    slug: "khoa-cntt",
    status: "active",
    mapX: 30,
    mapY: 50,
    isStartNode: false,
    description: "Khoa Công nghệ Thông tin - Tòa C7",
    introMessage:
      "Chào mừng bạn đến Khoa Công nghệ Thông tin! Khoa CNTT là một trong những khoa mạnh nhất của TVU.",
    backgroundUrl: "/demo/c7_them.jpg",
    suggestedQuestions: [
      "Ngành CNTT học gì?",
      "Học phí bao nhiêu?",
      "Cơ hội việc làm sau tốt nghiệp?",
    ],
    links: [
      { toSlug: "cong-chinh", label: "Quay lại Cổng chính" },
      { toSlug: "thu-vien", label: "Đi tới Thư viện" },
    ],
  },
];

// ===== Store =====

export const useTourStore = create<TourState>((set, get) => ({
  locations: DEMO_LOCATIONS,
  currentLocationSlug: "cong-chinh",
  isLoading: false,
  isTransitioning: false,

  currentLocation: () => {
    const { locations, currentLocationSlug } = get();
    return locations.find((l) => l.slug === currentLocationSlug);
  },

  setLocations: (locations) => set({ locations }),

  navigateTo: (slug) => {
    const { locations, currentLocationSlug } = get();
    if (slug === currentLocationSlug) return;

    const target = locations.find((l) => l.slug === slug);
    if (!target || target.status === "inactive") return;

    // Transition animation: fade out → swap data → fade in
    set({ isTransitioning: true });

    setTimeout(() => {
      set({
        currentLocationSlug: slug,
        isTransitioning: false,
      });
    }, 600); // Match CSS transition duration
  },

  setLoading: (loading) => set({ isLoading: loading }),
}));
