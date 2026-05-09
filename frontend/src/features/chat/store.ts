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
  isTTSEnabled: boolean;

  // === Actions ===
  toggleTTS: () => void;
  initSession: () => Promise<void>;
  resetSession: () => void;
  sendMessage: (message: string, locationId?: string) => Promise<void>;
  addMessage: (message: ChatMessage) => void;
  _appendChunk: (messageId: string, chunk: string) => void;
  _setMessages: (messages: ChatMessage[]) => void;
  _touchIdleTimer: () => void;
}

// ── Global Audio Manager ──
let _currentAudio: HTMLAudioElement | null = null;
let _currentAudioUrl: string | null = null;

export function _stopCurrentAudio() {
  if (_currentAudio) {
    _currentAudio.pause();
    _currentAudio.currentTime = 0;
    _currentAudio = null;
  }
  if (_currentAudioUrl) {
    // Only revoke if it's a blob URL
    if (_currentAudioUrl.startsWith("blob:")) {
      URL.revokeObjectURL(_currentAudioUrl);
    }
    _currentAudioUrl = null;
  }
  useTourStore.getState().setAvatarState("idle");
}

export function playPrecachedAudio(url: string) {
  _stopCurrentAudio();
  const audio = new Audio(url);
  _currentAudioUrl = url;
  _currentAudio = audio;
  
  useTourStore.getState().setAvatarState("speaking");
  
  audio.onended = () => {
    _stopCurrentAudio();
  };
  audio.play().catch(e => {
    console.error("Failed to play precached audio:", e);
    useTourStore.getState().setAvatarState("idle");
  });
}

// ── Idle Timer (module-level) ──
let _idleTimer: ReturnType<typeof setTimeout> | null = null;

// ── Tool Call Queue ──
let _pendingToolCalls: { name: string; args: Record<string, unknown> }[] = [];

/**
 * Queue a tool call to be executed after AI finishes speaking.
 * This ensures sequential flow: AI speaks → map opens → navigate.
 */
function _queueToolCall(toolCall: { name: string; args: Record<string, unknown> }) {
  _pendingToolCalls.push(toolCall);
}

/**
 * Flush all queued tool calls AFTER AI finishes streaming.
 * Executes in order: navigate_to first, then show_media (deferred).
 */
function _flushToolCalls() {
  const tourStore = useTourStore.getState();
  const calls = [..._pendingToolCalls];
  _pendingToolCalls = [];

  let hasNavigation = false;

  for (const toolCall of calls) {
    switch (toolCall.name) {
      case "navigate_to": {
        const slug = toolCall.args.location_slug as string;
        if (slug && slug !== tourStore.currentLocationSlug) {
          hasNavigation = true;
          // Set pendingNavigation → Minimap picks this up and runs map animation
          tourStore.setPendingNavigation(slug);
        }
        break;
      }

      case "show_media": {
        const preferredTab = (toolCall.args.media_type as string) === "image" ? "info" as const : "video" as const;
        const focusMediaId = (toolCall.args.focus_media_id as string) || null;

        if (hasNavigation) {
          // Defer media focus until after navigation completes
          tourStore.setPendingMediaFocus({ mediaId: focusMediaId, tab: preferredTab });
        } else {
          // Show immediately at current location
          tourStore.setFocusedMedia(focusMediaId, preferredTab);
          tourStore.setActiveOverlay("info");
        }
        break;
      }

      case "toggle_map": {
        const state = toolCall.args.state as string;
        if (!hasNavigation) {
          // Only toggle map if we're not already about to navigate
          tourStore.setActiveOverlay(state === "open" ? "map" : "none");
        }
        break;
      }

    }
  }
}

// ── Store ──
export const useChatStore = create<ChatState>((set, get) => ({
  messages: [],
  sessionId: null,
  isLoading: false,
  error: null,
  isTTSEnabled: true,

  toggleTTS: () => set((state) => {
    const newState = !state.isTTSEnabled;
    if (!newState) {
      _stopCurrentAudio();
    }
    return { isTTSEnabled: newState };
  }),

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
      messages: state.messages.map((msg) => {
        if (msg.id === messageId) {
          const currentContent = msg.content === "Đang kiểm tra dữ liệu, bạn đợi xíu nhé... 🤔" ? "" : msg.content;
          return { ...msg, content: currentContent + chunk };
        }
        return msg;
      }),
    }));
  },

  sendMessage: async (message: string, locationId?: string) => {
    const { sessionId, messages, _touchIdleTimer, isTTSEnabled } = get();

    // Touch idle timer on every send
    _touchIdleTimer();

    // Dừng âm thanh cũ ngay khi có request mới
    _stopCurrentAudio();

    // Optimistic UI update
    const userMsg: ChatMessage = { id: Date.now().toString(), role: "user", content: message };
    const botMsgId = (Date.now() + 1).toString();
    const botMsg: ChatMessage = { id: botMsgId, role: "assistant", content: "Đang kiểm tra dữ liệu, bạn đợi xíu nhé... 🤔", isStreaming: true };

    set({ messages: [...messages, userMsg, botMsg], isLoading: true, error: null });

    // Avatar: thinking while waiting for response
    useTourStore.getState().setAvatarState("thinking");

    // Gather history (last N messages for AI context)
    const history = messages.slice(-MAX_HISTORY_FOR_AI).map((m) => ({
      role: m.role,
      content: m.content,
    }));

    // ── Audio-First Mode (TTS enabled) ──
    if (isTTSEnabled) {
      try {
        const res = await fetch(`${API_URL}/api/chat`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message,
            ...(locationId ? { location_id: locationId } : {}),
            session_id: sessionId,
            tts: true,
            history,
          }),
        });

        if (!res.ok) throw new Error("API responded with an error");

        const data = await res.json();

        // Update bot message with full text at once
        set((state) => ({
          isLoading: false,
          messages: state.messages.map((msg) =>
            msg.id === botMsgId
              ? { ...msg, content: data.answer || "", isStreaming: false }
              : msg
          ),
        }));

        // Queue tool calls from response
        if (data.tool_actions) {
          for (const tc of data.tool_actions) {
            _queueToolCall(tc);
          }
        }

        // Chạy logic Tool Call sau khi phát xong audio
        const handleAudioEnded = () => {
          _stopCurrentAudio();
          if (data.tool_actions && data.tool_actions.length > 0) {
            _flushToolCalls();
          }
        };

        // Play audio if available
        if (data.audio_url) {
          _currentAudioUrl = data.audio_url;
          _currentAudio = new Audio(data.audio_url);
          useTourStore.getState().setAvatarState("speaking");
          _currentAudio.onended = handleAudioEnded;
          _currentAudio.play().catch(e => {
            console.error("Audio playback error:", e);
            handleAudioEnded();
          });
        }
        else if (data.audio_base64) {
          const audioBytes = Uint8Array.from(atob(data.audio_base64), c => c.charCodeAt(0));
          const blob = new Blob([audioBytes], { type: data.audio_content_type || "audio/wav" });
          const url = URL.createObjectURL(blob);
          const audio = new Audio(url);
          _currentAudioUrl = url;
          _currentAudio = audio;

          useTourStore.getState().setAvatarState("speaking");

          audio.onended = handleAudioEnded;
          audio.play();
        } else {
          // No audio (TTS failed) → go idle and flush tools immediately
          useTourStore.getState().setAvatarState("idle");
          setTimeout(() => {
            if (data.tool_actions && data.tool_actions.length > 0) {
              _flushToolCalls();
            }
          }, 500);
        }

      } catch (err: any) {
        console.error("Chat error:", err);
        get()._appendChunk(botMsgId, " Xin lỗi, hiện tại mình không thể kết nối tới máy chủ. Vui lòng thử lại sau.");
        set((state) => ({
          isLoading: false,
          error: err.message,
          messages: state.messages.map((msg) =>
            msg.id === botMsgId ? { ...msg, isStreaming: false } : msg
          ),
        }));
        useTourStore.getState().setAvatarState("idle");
      }
      return;
    }

    // ── SSE Streaming Mode (TTS disabled / Muted) ──
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
        buffer = lines.pop() || "";

        for (const block of lines) {
          if (block.includes("event: sources") || block.includes("event: thought")) {
            continue;
          }

          if (block.includes("event: tool_call")) {
            const dataMatch = block.match(/data: (.*)/);
            if (dataMatch) {
              try {
                const payload = JSON.parse(dataMatch[1]);
                const toolCall = JSON.parse(payload.content);
                _queueToolCall(toolCall);
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
      set((state) => ({
        isLoading: false,
        messages: state.messages.map((msg) =>
          msg.id === botMsgId ? { ...msg, isStreaming: false } : msg
        ),
      }));
      useTourStore.getState().setAvatarState("idle");
      setTimeout(() => _flushToolCalls(), 500);
    }
  },
}));
