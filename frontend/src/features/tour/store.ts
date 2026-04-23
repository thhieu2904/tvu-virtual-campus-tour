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
  fetchLocations: () => Promise<void>;
  navigateTo: (slug: string) => void;
  setLoading: (loading: boolean) => void;
}

// ===== Store =====

export const useTourStore = create<TourState>((set, get) => ({
  locations: [],
  currentLocationSlug: "",
  isLoading: true,
  isTransitioning: false,

  currentLocation: () => {
    const { locations, currentLocationSlug } = get();
    return locations.find((l) => l.slug === currentLocationSlug);
  },

  fetchLocations: async () => {
    set({ isLoading: true });
    try {
      const response = await fetch("http://127.0.0.1:8000/api/locations");
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      
      const data = await response.json();
      const locations = data.locations || [];
      
      // Determine starting node
      const startNode = locations.find((l: LocationNode) => l.isStartNode) || locations[0];
      
      set({ 
        locations, 
        currentLocationSlug: startNode ? startNode.slug : "",
        isLoading: false 
      });
    } catch (error) {
      console.error("Failed to fetch locations from backend API:", error);
      set({ isLoading: false });
    }
  },

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
