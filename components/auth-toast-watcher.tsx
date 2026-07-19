"use client";

import { useUser } from "@clerk/nextjs";
import { useEffect, useRef } from "react";
import { useToast } from "@/components/toast-provider";

const legacyKnownUsersKey = "ebikas-known-users-v1";

function isFreshAccount(createdAt: unknown) {
  const createdTime = createdAt instanceof Date ? createdAt.getTime() : typeof createdAt === "string" || typeof createdAt === "number" ? new Date(createdAt).getTime() : 0;
  if (!Number.isFinite(createdTime) || createdTime <= 0) return false;

  return Date.now() - createdTime < 5 * 60 * 1000;
}

export function AuthToastWatcher() {
  const { isLoaded, isSignedIn, user } = useUser();
  const { showToast } = useToast();
  const previousUserIdRef = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    if (!isLoaded) return;

    // Older builds stored raw Clerk IDs only to choose toast copy. They are no
    // longer needed, so remove that browser-side identifier when this runs.
    try {
      window.localStorage.removeItem(legacyKnownUsersKey);
    } catch {
      // Authentication feedback still works when browser storage is unavailable.
    }

    const currentUserId = isSignedIn ? user?.id || null : null;
    const previousUserId = previousUserIdRef.current;

    if (previousUserId === undefined) {
      previousUserIdRef.current = currentUserId;
      if (currentUserId && isFreshAccount(user?.createdAt)) {
        showToast({
          title: "Account created",
          message: "Your Ebikas Place account is ready.",
          tone: "success"
        });
      }
      return;
    }

    if (!previousUserId && currentUserId) {
      const freshAccount = isFreshAccount(user?.createdAt);
      showToast({
        title: freshAccount ? "Account created" : "Login successful",
        message: freshAccount ? "Your Ebikas Place account is ready." : "Welcome back to Ebikas Place.",
        tone: "success"
      });
    }

    if (previousUserId && !currentUserId) {
      showToast({
        title: "Logout successful",
        message: "You have been signed out.",
        tone: "info"
      });
    }

    previousUserIdRef.current = currentUserId;
  }, [isLoaded, isSignedIn, showToast, user?.createdAt, user?.id]);

  return null;
}
