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

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

// ===== Types =====

export interface LocationNode {
  id: string;
  name: string;
  slug: string;
  status: "active" | "inactive";
  isStartNode: boolean;
  description: string;
  introMessage: string;
  intro_audio_url?: string;
  mascotName?: string | null;
  mascotModelUrl?: string | null;
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
  isAppReady: boolean;              // Gates UI display after initial 3D/panorama load
  isPanoramaReady: boolean;          // Panorama 360° has actually rendered (event-based)
  isTransitioning: boolean;
  hasStarted: boolean;               // True when user clicks 'Start' on the overlay
  avatarState: "idle" | "thinking" | "speaking";
  activeOverlay: "none" | "info" | "map";
  navigatedByAgent: boolean;

  // === Sequential Navigation (AI Agent) ===
  pendingNavigation: string | null;                                       // Slug AI wants to navigate to
  pendingMediaFocus: { mediaId: string | null; tab: "video" | "info" } | null; // Deferred media focus
  pendingMapAnimationSlug: string | null;

  // === Network Recovery ===
  networkRetryCount: number;
  isNetworkError: boolean;
  isFatalError: boolean;

  // === Media (InfoPanel) ===
  locationMedia: MediaItem[];       // ALL media for current location (auto-fetched)
  isMediaLoading: boolean;          // Loading state for media fetch
  focusedMediaId: string | null;    // AI Agent points to this specific item
  preferredMediaTab: "video" | "info";

  // === Computed ===
  currentLocation: () => LocationNode | undefined;

  // === Actions ===
  fetchLocations: () => Promise<void>;
  fetchLocationMedia: (slug: string) => Promise<void>;
  navigateTo: (slug: string, source?: "agent" | "user") => void;
  setLoading: (loading: boolean) => void;
  setAppReady: (ready: boolean) => void;
  setPanoramaReady: (ready: boolean) => void;
  setHasStarted: (started: boolean) => void;
  setAvatarState: (state: "idle" | "thinking" | "speaking") => void;
  setActiveOverlay: (overlay: "none" | "info" | "map") => void;
  setFocusedMedia: (mediaId: string | null, preferredTab?: "video" | "info") => void;
  setPendingNavigation: (slug: string | null) => void;
  setPendingMediaFocus: (focus: { mediaId: string | null; tab: "video" | "info" } | null) => void;
  clearPendingNavigation: () => void;
  setPendingMapAnimationSlug: (slug: string | null) => void;
  resetNetworkRetry: () => void;
}

// ===== Store =====

export const useTourStore = create<TourState>((set, get) => ({
  locations: [],
  currentLocationSlug: "",
  isLoading: false,
  isAppReady: false,
  isPanoramaReady: false,
  isTransitioning: false,
  hasStarted: false,
  avatarState: "idle",
  activeOverlay: "none",
  navigatedByAgent: false,

  // Sequential navigation
  pendingNavigation: null,
  pendingMediaFocus: null,
  pendingMapAnimationSlug: null,

  // Network Recovery
  networkRetryCount: 0,
  isNetworkError: false,
  isFatalError: false,

  // Media
  locationMedia: [],
  isMediaLoading: false,
  focusedMediaId: null,
  preferredMediaTab: "video",

  currentLocation: () => {
    const { locations, currentLocationSlug } = get();
    return locations.find((l) => l.slug === currentLocationSlug);
  },

  fetchLocations: async () => {
    const state = get();
    if (state.isLoading) return; // Prevent race conditions during auto-retry
    if (state.networkRetryCount >= 6) {
      set({ isFatalError: true, isLoading: false, isNetworkError: false });
      return;
    }

    set({ isLoading: true });
    try {
      const response = await fetch(`${API_URL}/api/locations`);
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      
      const data = await response.json();
      const locations = data.locations || [];
      
      // Determine starting node
      const startNode = locations.find((l: LocationNode) => l.isStartNode) || locations[0];
      const startSlug = startNode ? startNode.slug : "";
      
      set({ 
        locations, 
        currentLocationSlug: startSlug,
        isLoading: false,
        isNetworkError: false,
        isFatalError: false,
        networkRetryCount: 0
      });

      // Auto-fetch media for starting location
      if (startSlug) {
        get().fetchLocationMedia(startSlug);
      }
    } catch (error) {
      // Use console.warn instead of console.error to prevent Next.js dev overlay from showing a red error dot
      console.warn("Failed to fetch locations. Retrying in 10s...", error);
      
      const nextCount = get().networkRetryCount + 1;
      set({ 
        isLoading: false,
        isNetworkError: nextCount < 6, 
        isFatalError: nextCount >= 6,
        networkRetryCount: nextCount
      });
      
      if (nextCount < 6) {
        // Retry after 10s
        setTimeout(() => {
          get().fetchLocations();
        }, 10000);
      }
    }
  },

  resetNetworkRetry: () => {
    set({ networkRetryCount: 0, isFatalError: false, isNetworkError: false });
    get().fetchLocations();
  },

  /**
   * Fetch ALL media for a location from the API.
   * Called automatically when location changes.
   */
  fetchLocationMedia: async (slug: string) => {
    set({ isMediaLoading: true, locationMedia: [], focusedMediaId: null });
    try {
      const res = await fetch(`${API_URL}/api/locations/${slug}/assets`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      set({ locationMedia: data.assets || [], isMediaLoading: false });
    } catch (err) {
      console.error("Failed to fetch media:", err);
      set({ isMediaLoading: false });
    }
  },

  navigateTo: (slug, source = "user") => {
    const { locations, currentLocationSlug } = get();
    if (slug === currentLocationSlug) return;

    const target = locations.find((l) => l.slug === slug);
    if (!target || target.status === "inactive") return;

    // Transition animation: fade out → swap data → fade in
    set({ isTransitioning: true, isPanoramaReady: false, navigatedByAgent: source === "agent" });

    setTimeout(() => {
      set({
        currentLocationSlug: slug,
        isTransitioning: false,
      });
      // Auto-fetch media for new location
      get().fetchLocationMedia(slug);
    }, 600); // Match CSS transition duration
  },

  setLoading: (loading) => set({ isLoading: loading }),
  setAppReady: (ready) => set({ isAppReady: ready }),
  setPanoramaReady: (ready) => set({ isPanoramaReady: ready }),
  setHasStarted: (started) => set({ hasStarted: started }),
  setAvatarState: (state) => set({ avatarState: state }),
  setActiveOverlay: (overlay) => set({ activeOverlay: overlay }),
  setPendingNavigation: (slug) => set({ pendingNavigation: slug }),
  setPendingMediaFocus: (focus) => set({ pendingMediaFocus: focus }),
  clearPendingNavigation: () => set({ pendingNavigation: null, pendingMediaFocus: null }),
  setPendingMapAnimationSlug: (slug) => set({ pendingMapAnimationSlug: slug }),

  /**
   * AI Agent calls this to focus a specific media item + expand panel.
   * Does NOT provide data — data is already in locationMedia.
   */
  setFocusedMedia: (mediaId, preferredTab) => set({
    focusedMediaId: mediaId,
    ...(preferredTab ? { preferredMediaTab: preferredTab } : {}),
  }),
}));
