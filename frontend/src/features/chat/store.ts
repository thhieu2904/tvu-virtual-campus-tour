import { create } from "zustand";
import { useTourStore } from "@/features/tour/store";
import { ChatMessage } from "./types";

// ── Constants ──
const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
const IDLE_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes idle → session reset
const MAX_HISTORY_FOR_AI = 20; // Max messages sent to Gemini for context

// ── Types ──
interface ChatState {
  messages: ChatMessage[];
  sessionId: string | null;
  isLoading: boolean;
  error: string | null;

  // === Actions ===
  initSession: () => Promise<void>;
  resetSession: () => void;
  sendMessage: (message: string, locationId?: string) => Promise<void>;
  addMessage: (message: ChatMessage) => void;
  _appendChunk: (messageId: string, chunk: string) => void;
  _setMessages: (messages: ChatMessage[]) => void;
  _touchIdleTimer: () => void;
}

// ── Idle Timer (module-level) ──
let _idleTimer: ReturnType<typeof setTimeout> | null = null;

// ── Tool Call Coordination ──
let _pendingMediaItems: Array<Record<string, unknown>> | null = null;
let _navigatePending = false; // true when navigate_to is queued but hasn't executed yet

/**
 * Execute a tool call received from the AI Agent via SSE.
 * Maps tool names to TourStore actions.
 *
 * Key: navigate_to always arrives BEFORE show_media in the SSE stream.
 * When both are present, show_media defers to navigate_to which applies
 * media AFTER the scene transition completes.
 */
function _executeToolCall(toolCall: { name: string; args: Record<string, unknown> }) {
  const tourStore = useTourStore.getState();

  switch (toolCall.name) {
    case "navigate_to": {
      const slug = toolCall.args.location_slug as string;
      if (slug) {
        _navigatePending = true;
        // Delay so user can read the AI's text before scene transition
        setTimeout(() => {
          tourStore.navigateTo(slug, "agent");
          // After transition (600ms) + buffer → apply pending media
          setTimeout(() => {
            if (_pendingMediaItems) {
              tourStore.setMediaItems(_pendingMediaItems as any);
              tourStore.setActiveOverlay("info");
              _pendingMediaItems = null;
            }
            _navigatePending = false;
          }, 800);
        }, 1500);
      }
      break;
    }

    case "show_media": {
      const mediaItems = (toolCall.args.media_items as Array<Record<string, unknown>>) || [];
      if (mediaItems.length > 0) {
        if (_navigatePending) {
          // Navigate is queued → just store, navigate_to callback will apply
          _pendingMediaItems = mediaItems;
        } else {
          // No navigate → show immediately
          tourStore.setMediaItems(mediaItems as any);
          tourStore.setActiveOverlay("info");
        }
      }
      break;
    }

    case "toggle_map": {
      const state = toolCall.args.state as string;
      tourStore.setActiveOverlay(state === "open" ? "map" : "none");
      break;
    }

    case "search_local":
    case "search_global":
      // Handled server-side — no frontend action needed
      break;
  }
}

// ── Store ──
export const useChatStore = create<ChatState>((set, get) => ({
  messages: [],
  sessionId: null,
  isLoading: false,
  error: null,

  _setMessages: (messages) => set({ messages }),

  /**
   * Add a single message to the conversation (append, never replace).
   * Used for intro messages on location change.
   */
  addMessage: (message) => {
    set((state) => ({
      messages: [...state.messages, message],
    }));
  },

  /**
   * Initialize a new chat session (only once per kiosk lifecycle).
   */
  initSession: async () => {
    if (get().sessionId) return;

    try {
      const res = await fetch(`${API_URL}/api/chat/session`, { method: "POST" });
      if (!res.ok) throw new Error("Failed to init chat session");
      const data = await res.json();
      set({ sessionId: data.session_id });
    } catch (err) {
      console.error(err);
      set({ error: "Could not initialize chat session." });
    }
  },

  /**
   * Reset session after idle timeout. Clears all messages, creates new session.
   * This is the ONLY place where messages are cleared.
   */
  resetSession: () => {
    set({ messages: [], sessionId: null, error: null });
    // Re-init a fresh session
    get().initSession();
    // Show welcome message from current location
    const location = useTourStore.getState().currentLocation();
    if (location) {
      set({
        messages: [
          {
            id: `intro-${location.slug}-${Date.now()}`,
            role: "assistant",
            content: location.introMessage,
          },
        ],
      });
    }
  },

  /**
   * Reset idle timer. Called on every user interaction.
   * After IDLE_TIMEOUT_MS of inactivity → resetSession().
   */
  _touchIdleTimer: () => {
    if (_idleTimer) clearTimeout(_idleTimer);
    _idleTimer = setTimeout(() => {
      console.log("[ChatStore] Idle timeout reached — resetting session");
      get().resetSession();
    }, IDLE_TIMEOUT_MS);
  },

  _appendChunk: (messageId: string, chunk: string) => {
    set((state) => ({
      messages: state.messages.map((msg) =>
        msg.id === messageId ? { ...msg, content: msg.content + chunk } : msg
      ),
    }));
  },

  sendMessage: async (message: string, locationId?: string) => {
    const { sessionId, messages, _touchIdleTimer } = get();

    // Touch idle timer on every send
    _touchIdleTimer();

    // Optimistic UI update
    const userMsg: ChatMessage = { id: Date.now().toString(), role: "user", content: message };
    const botMsgId = (Date.now() + 1).toString();
    const botMsg: ChatMessage = { id: botMsgId, role: "assistant", content: "", isStreaming: true };

    set({ messages: [...messages, userMsg, botMsg], isLoading: true, error: null });

    // Update avatar state via TourStore
    useTourStore.getState().setAvatarState("thinking");

    // Gather history (last N messages for AI context, excluding the current pair)
    const history = messages.slice(-MAX_HISTORY_FOR_AI).map((m) => ({
      role: m.role,
      content: m.content,
    }));

    try {
      const res = await fetch(`${API_URL}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message,
          ...(locationId ? { location_id: locationId } : {}),
          session_id: sessionId,
          stream: true,
          history,
        }),
      });

      if (!res.ok) {
        throw new Error("API responded with an error");
      }

      useTourStore.getState().setAvatarState("speaking");

      const reader = res.body?.getReader();
      if (!reader) throw new Error("No reader available");

      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split(/\r?\n\r?\n/);
        // Keep the last partial block in the buffer
        buffer = lines.pop() || "";

        for (const block of lines) {
          // Skip metadata events explicitly
          if (block.includes("event: sources") || block.includes("event: thought")) {
            continue;
          }

          // Handle tool_call events from AI Agent
          if (block.includes("event: tool_call")) {
            const dataMatch = block.match(/data: (.*)/);
            if (dataMatch) {
              try {
                const payload = JSON.parse(dataMatch[1]);
                const toolCall = JSON.parse(payload.content);
                _executeToolCall(toolCall);
              } catch (e) {
                console.error("Error parsing tool_call:", e);
              }
            }
            continue;
          }

          const dataMatch = block.match(/data: (.*)/);
          if (dataMatch) {
            try {
              const data = JSON.parse(dataMatch[1]);
              if (data.content) {
                get()._appendChunk(botMsgId, data.content);
              }
            } catch (e) {
              console.error("Error parsing SSE data:", e, block);
            }
          }
        }
      }

    } catch (err: any) {
      console.error("Chat error:", err);
      get()._appendChunk(botMsgId, " Xin lỗi, hiện tại mình không thể kết nối tới máy chủ. Vui lòng thử lại sau.");
      set({ error: err.message });
    } finally {
      // Mark streaming as false
      set((state) => ({
        isLoading: false,
        messages: state.messages.map((msg) =>
          msg.id === botMsgId ? { ...msg, isStreaming: false } : msg
        ),
      }));
      useTourStore.getState().setAvatarState("idle");
    }
  },
}));
