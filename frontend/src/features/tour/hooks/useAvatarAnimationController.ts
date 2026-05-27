"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { AvatarAnimation } from "@/features/tour/components/Avatar3D";
import { useChatStore } from "@/features/chat/store";

type RawAvatarState = "idle" | "thinking" | "speaking";

interface UseAvatarAnimationControllerArgs {
  hasStarted: boolean;
  avatarState: RawAvatarState;
  isResetting?: boolean;
  locationSlug?: string | null;
}

const THINKING_DELAY_MS = 600;
const MIN_THINKING_VISIBLE_MS = 900;
const ONE_SHOT_FALLBACK_MS: Partial<Record<AvatarAnimation, number>> = {
  Greeting: 5000,
  Thankful: 4500,
};

export function useAvatarAnimationController({
  hasStarted,
  avatarState,
  isResetting = false,
  locationSlug = null,
}: UseAvatarAnimationControllerArgs) {
  const [animation, setAnimation] = useState<AvatarAnimation>("Idle");

  const animationRef = useRef<AvatarAnimation>("Idle");
  const activeOneShotRef = useRef<AvatarAnimation | null>(null);
  const thinkingVisibleAtRef = useRef<number | null>(null);
  const prevHasStartedRef = useRef(hasStarted);
  const prevLocationSlugRef = useRef<string | null>(null);
  const pendingThinkingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const pendingTransitionTimerRef =
    useRef<ReturnType<typeof setTimeout> | null>(null);
  const oneShotFallbackTimerRef =
    useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearPendingThinking = useCallback(() => {
    if (pendingThinkingTimerRef.current) {
      clearTimeout(pendingThinkingTimerRef.current);
      pendingThinkingTimerRef.current = null;
    }
  }, []);

  const clearPendingTransition = useCallback(() => {
    if (pendingTransitionTimerRef.current) {
      clearTimeout(pendingTransitionTimerRef.current);
      pendingTransitionTimerRef.current = null;
    }
  }, []);

  const clearOneShotFallback = useCallback(() => {
    if (oneShotFallbackTimerRef.current) {
      clearTimeout(oneShotFallbackTimerRef.current);
      oneShotFallbackTimerRef.current = null;
    }
  }, []);

  const commitAnimation = useCallback(
    (next: AvatarAnimation, oneShot = false) => {
      clearPendingTransition();
      clearOneShotFallback();

      animationRef.current = next;
      setAnimation(next);

      if (next === "Thinking") {
        thinkingVisibleAtRef.current = Date.now();
      } else {
        thinkingVisibleAtRef.current = null;
      }

      activeOneShotRef.current = oneShot ? next : null;

      const fallbackMs = oneShot ? ONE_SHOT_FALLBACK_MS[next] : undefined;
      if (fallbackMs) {
        oneShotFallbackTimerRef.current = setTimeout(() => {
          if (activeOneShotRef.current === next) {
            activeOneShotRef.current = null;
            animationRef.current = "Idle";
            thinkingVisibleAtRef.current = null;
            setAnimation("Idle");
          }
        }, fallbackMs);
      }
    },
    [clearOneShotFallback, clearPendingTransition],
  );

  const requestAnimation = useCallback(
    (
      next: AvatarAnimation,
      options: { force?: boolean; oneShot?: boolean } = {},
    ) => {
      clearPendingTransition();

      const current = animationRef.current;
      if (current === next) return;

      const thinkingVisibleAt = thinkingVisibleAtRef.current;
      const shouldRespectThinkingMinimum = Boolean(
        current === "Thinking" &&
        next !== "Thinking" &&
        thinkingVisibleAt &&
        (!options.force || next === "Talking"),
      );

      if (shouldRespectThinkingMinimum) {
        const elapsed = Date.now() - thinkingVisibleAt!;
        const remaining = MIN_THINKING_VISIBLE_MS - elapsed;

        if (remaining > 0) {
          pendingTransitionTimerRef.current = setTimeout(() => {
            commitAnimation(next, options.oneShot);
          }, remaining);
          return;
        }
      }

      commitAnimation(next, options.oneShot);
    },
    [clearPendingTransition, commitAnimation],
  );

  // Trigger Greeting on first start
  useEffect(() => {
    if (isResetting || !hasStarted) {
      clearPendingThinking();
      clearPendingTransition();
      activeOneShotRef.current = null;
      prevHasStartedRef.current = hasStarted;
      requestAnimation("Idle", { force: true });
      return;
    }

    if (!prevHasStartedRef.current && hasStarted) {
      requestAnimation("Greeting", { force: true, oneShot: true });
    }

    prevHasStartedRef.current = hasStarted;
  }, [
    clearPendingThinking,
    clearPendingTransition,
    hasStarted,
    isResetting,
    requestAnimation,
  ]);

  // Trigger Greeting when changing locations
  useEffect(() => {
    if (!hasStarted || isResetting) {
      prevLocationSlugRef.current = locationSlug;
      return;
    }

    if (
      locationSlug &&
      prevLocationSlugRef.current &&
      prevLocationSlugRef.current !== locationSlug
    ) {
      requestAnimation("Greeting", { force: true, oneShot: true });
    }

    prevLocationSlugRef.current = locationSlug;
  }, [locationSlug, hasStarted, isResetting, requestAnimation]);

  // Watch avatarState
  useEffect(() => {
    clearPendingThinking();

    if (!hasStarted || isResetting) return;

    if (avatarState === "thinking") {
      pendingThinkingTimerRef.current = setTimeout(() => {
        requestAnimation("Thinking");
        pendingThinkingTimerRef.current = null;
      }, THINKING_DELAY_MS);
      return;
    }

    if (avatarState === "speaking") {
      if (activeOneShotRef.current) return;

      // Check if last AI message contains thank you / goodbye keywords to trigger "Thankful" bow
      const messages = useChatStore.getState().messages;
      const lastMsg = messages[messages.length - 1];
      if (lastMsg && lastMsg.role === "assistant") {
        const text = lastMsg.content.toLowerCase();
        const hasThankfulKeywords = [
          "cảm ơn",
          "cam on",
          "tạm biệt",
          "tam biet",
          "hẹn gặp lại",
          "hen gap lai",
          "chào tạm biệt",
          "chúc bạn một ngày",
          "chuc ban mot ngay",
          "dẫn bạn",
          "dan ban",
          "đưa bạn",
          "dua ban",
          "đi thôi",
          "di thoi",
          "di chuyển",
          "di chuyen"
        ].some(keyword => text.includes(keyword));

        if (hasThankfulKeywords) {
          requestAnimation("Thankful", { force: true, oneShot: true });
          return;
        }
      }

      requestAnimation("Talking");
      return;
    }

    if (activeOneShotRef.current) return;
    requestAnimation("Idle");
  }, [
    avatarState,
    clearPendingThinking,
    hasStarted,
    isResetting,
    requestAnimation,
  ]);

  useEffect(() => {
    return () => {
      clearPendingThinking();
      clearPendingTransition();
      clearOneShotFallback();
    };
  }, [clearOneShotFallback, clearPendingThinking, clearPendingTransition]);

  const handleAnimationComplete = useCallback(
    (completedAnimation: AvatarAnimation) => {
      if (
        activeOneShotRef.current !== completedAnimation &&
        animationRef.current !== completedAnimation
      ) {
        return;
      }

      activeOneShotRef.current = null;
      
      if (completedAnimation === "Talking") {
        requestAnimation("Idle", { force: true });
        return;
      }

      if (avatarState === "speaking") {
        requestAnimation("Talking", { force: true });
      } else if (avatarState === "thinking") {
        // Keep the clamped thinking pose, do not reset to Idle!
        return;
      } else {
        requestAnimation("Idle", { force: true });
      }
    },
    [avatarState, requestAnimation],
  );

  return {
    animation,
    handleAnimationComplete,
  };
}
