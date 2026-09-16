"use client";

import { useEffect, useState } from "react";

export type Theme = "dark" | "light" | "pony";
const THEMES: { id: Theme; label: string }[] = [
  { id: "dark", label: "Dark" },
  { id: "light", label: "Light" },
  { id: "pony", label: "🦄 Pony" },
];

const STORAGE_KEY = "classpilot.theme";

/**
 * Inline, run-before-paint script so the saved theme applies immediately -
 * without this, the page would flash the default dark theme before React
 * hydrates and applies the stored preference.
 */
export const themeInitScript = `
(function () {
  try {
    var t = localStorage.getItem("${STORAGE_KEY}");
    if (t === "light" || t === "pony") {
      document.documentElement.setAttribute("data-theme", t);
    }
  } catch (e) {}
})();
`;

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>("dark");

  useEffect(() => {
    const current = document.documentElement.getAttribute("data-theme");
    setTheme(current === "light" || current === "pony" ? current : "dark");
  }, []);

  function applyTheme(next: Theme) {
    setTheme(next);
    if (next === "dark") {
      document.documentElement.removeAttribute("data-theme");
    } else {
      document.documentElement.setAttribute("data-theme", next);
    }
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // ignore (private browsing, storage disabled, etc.)
    }
  }

  return (
    <div className="theme-toggle" role="group" aria-label="Theme">
      {THEMES.map((t) => (
        <button
          key={t.id}
          type="button"
          className={theme === t.id ? "active" : ""}
          onClick={() => applyTheme(t.id)}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

export function PonyMascot() {
  return (
    <div className="pony-mascot" aria-hidden="true">
      🦄
    </div>
  );
}
