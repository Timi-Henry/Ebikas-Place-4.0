"use client";

import { useUser } from "@clerk/nextjs";
import { useEffect, useRef } from "react";
import { useToast } from "@/components/toast-provider";

const knownUsersKey = "ebikas-known-users-v1";

function getKnownUsers() {
  try {
    const value = window.localStorage.getItem(knownUsersKey);
    const parsed = value ? JSON.parse(value) : [];
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

function rememberUser(userId: string) {
  const knownUsers = getKnownUsers();
  if (knownUsers.includes(userId)) return true;

  window.localStorage.setItem(knownUsersKey, JSON.stringify([...knownUsers, userId]));
  return false;
}

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

    const currentUserId = isSignedIn ? user?.id || null : null;
    const previousUserId = previousUserIdRef.current;

    if (previousUserId === undefined) {
      previousUserIdRef.current = currentUserId;
      if (currentUserId) {
        const isReturningUser = rememberUser(currentUserId);
        if (!isReturningUser && isFreshAccount(user?.createdAt)) {
          showToast({
            title: "Account created",
            message: "Your Ebikas Place account is ready.",
            tone: "success"
          });
        }
      }
      return;
    }

    if (!previousUserId && currentUserId) {
      const isReturningUser = rememberUser(currentUserId);
      showToast({
        title: isReturningUser ? "Login successful" : "Account created",
        message: isReturningUser ? "Welcome back to Ebikas Place." : "Your Ebikas Place account is ready.",
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
  }, [isLoaded, isSignedIn, showToast, user?.id]);

  return null;
}
