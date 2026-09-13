"use client";

import { Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";
import type { ReactNode } from "react";

type Theme = "light" | "dark";

function resolveInitialTheme(): Theme {
  if (typeof window === "undefined") return "light";
  const stored = window.localStorage.getItem("ebikas-theme");
  if (stored === "light" || stored === "dark") return stored;
  return "light";
}

function applyTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
  window.localStorage.setItem("ebikas-theme", theme);
}

export function ThemeToggle({
  className = "icon-button",
  children
}: {
  className?: string;
  children?: ReactNode;
}) {
  const [theme, setTheme] = useState<Theme>("light");

  useEffect(() => {
    const initialTheme = resolveInitialTheme();
    setTheme(initialTheme);
    applyTheme(initialTheme);
  }, []);

  function toggleTheme() {
    setTheme((current) => {
      const next = current === "dark" ? "light" : "dark";
      applyTheme(next);
      return next;
    });
  }

  return (
    <button
      className={`${className} theme-toggle`}
      type="button"
      onClick={toggleTheme}
      aria-label={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
      title={theme === "dark" ? "Light theme" : "Dark theme"}
    >
      {children ? (
        <span className="theme-toggle-icon" aria-hidden="true">
          {theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
        </span>
      ) : (
        theme === "dark" ? <Sun size={18} /> : <Moon size={18} />
      )}
      {children}
    </button>
  );
}
