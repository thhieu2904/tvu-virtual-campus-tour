/**
 * API fetch wrapper — central point for all backend calls.
 * Uses NEXT_PUBLIC_API_URL from environment.
 */

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "";

interface FetchOptions extends RequestInit {
  adminKey?: string;
}

/**
 * Generic fetch wrapper with error handling.
 */
async function apiFetch<T>(
  endpoint: string,
  options: FetchOptions = {},
): Promise<T> {
  const { adminKey, ...fetchOptions } = options;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(fetchOptions.headers as Record<string, string>),
  };

  if (adminKey) {
    headers["X-Admin-Key"] = adminKey;
  }

  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...fetchOptions,
    headers,
  });

  if (!response.ok) {
    const error = await response
      .json()
      .catch(() => ({ detail: "Unknown error" }));
    throw new Error(error.detail || `API Error: ${response.status}`);
  }

  return response.json();
}

// ===== Public API =====

export const api = {
  // Locations
  getLocations: () => apiFetch<{ locations: Location[] }>("/api/locations"),

  getLocation: (slug: string) =>
    apiFetch<LocationDetail>(`/api/locations/${slug}`),

  getAssets: (slug: string) =>
    apiFetch<{ assets: MediaAsset[] }>(`/api/locations/${slug}/assets`),

  getQuestions: (slug: string) =>
    apiFetch<{ questions: SuggestedQuestion[] }>(
      `/api/locations/${slug}/questions`,
    ),

  // Chat
  createSession: () =>
    apiFetch<{ session_id: string }>("/api/chat/session", { method: "POST" }),

  // SSE Chat stream (special handling)
  chatStream: (message: string, locationId: string, sessionId: string) => {
    return fetch(`${API_BASE}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message,
        location_id: locationId,
        session_id: sessionId,
        input_type: "text",
      }),
    });
  },
};

// ===== Types =====

export interface Location {
  id: string;
  name: string;
  slug: string;
  status: "active" | "inactive";
  map_x: number;
  map_y: number;
  is_start_node: boolean;
  background_url: string | null;
}

export interface LocationDetail extends Location {
  description: string;
  intro_message: string;
  intro_audio_url: string | null;
  suggested_questions: string[];
  links: { to_slug: string; label: string }[];
}

export interface MediaAsset {
  id: string;
  type: "image" | "video" | "gif";
  url: string;
  caption: string;
  keywords: string[];
  is_intro: boolean;
}

export interface SuggestedQuestion {
  id: string;
  question: string;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
  tool_action?: {
    tool: string;
    [key: string]: unknown;
  };
}
