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
  isStartNode: boolean;
  description: string;
  introMessage: string;
  backgroundUrl: string;
  suggestedQuestions: string[];
  links: { toSlug: string; label: string }[];
}

export interface MediaItem {
  id: string;
  type: "image" | "video" | "gif";
  url: string;
  caption: string;
  keywords: string[];
  is_intro: boolean;
  sort_order: number;
}

interface TourState {
  // === Data ===
  locations: LocationNode[];
  currentLocationSlug: string;
  isLoading: boolean;
  isTransitioning: boolean;
  avatarState: "idle" | "thinking" | "speaking";
  activeOverlay: "none" | "info" | "map";
  mediaItems: MediaItem[];
  navigatedByAgent: boolean; // true when AI Agent triggered the navigation

  // === Computed ===
  currentLocation: () => LocationNode | undefined;

  // === Actions ===
  fetchLocations: () => Promise<void>;
  navigateTo: (slug: string, source?: "agent" | "user") => void;
  setLoading: (loading: boolean) => void;
  setAvatarState: (state: "idle" | "thinking" | "speaking") => void;
  setActiveOverlay: (overlay: "none" | "info" | "map") => void;
  setMediaItems: (items: MediaItem[]) => void;
  clearMediaItems: () => void;
}

// ===== Store =====

export const useTourStore = create<TourState>((set, get) => ({
  locations: [],
  currentLocationSlug: "",
  isLoading: true,
  isTransitioning: false,
  avatarState: "idle",
  activeOverlay: "none",
  mediaItems: [],
  navigatedByAgent: false,

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

  navigateTo: (slug, source = "user") => {
    const { locations, currentLocationSlug } = get();
    if (slug === currentLocationSlug) return;

    const target = locations.find((l) => l.slug === slug);
    if (!target || target.status === "inactive") return;

    // Transition animation: fade out → swap data → fade in
    set({ isTransitioning: true, navigatedByAgent: source === "agent" });

    setTimeout(() => {
      set({
        currentLocationSlug: slug,
        isTransitioning: false,
        // Only clear media on user navigation, NOT on agent navigation
        // (agent will apply pending media after transition)
        ...(source === "user" ? { mediaItems: [] } : {}),
      });
    }, 600); // Match CSS transition duration
  },

  setLoading: (loading) => set({ isLoading: loading }),
  setAvatarState: (state) => set({ avatarState: state }),
  setActiveOverlay: (overlay) => set({ activeOverlay: overlay }),
  setMediaItems: (items) => set({ mediaItems: items }),
  clearMediaItems: () => set({ mediaItems: [] }),
}));
