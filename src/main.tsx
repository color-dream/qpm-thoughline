import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./styles/tokens.css";

const THEME_KEY = "qpm-thoughtline-theme-v1";
const LEGACY_THEME_KEY = "qp-theme";

function readTheme(): string | null {
  try {
    const current = localStorage.getItem(THEME_KEY);
    if (current) return current;
    const legacy = localStorage.getItem(LEGACY_THEME_KEY);
    if (legacy) {
      localStorage.setItem(THEME_KEY, legacy);
      return legacy;
    }
  } catch {
    /* ignore */
  }
  return null;
}

function applyTheme(t: string) {
  document.documentElement.setAttribute("data-theme", t);
  try {
    localStorage.setItem(THEME_KEY, t);
  } catch {
    /* ignore */
  }
}

const saved = readTheme();
const prefersDark =
  typeof window !== "undefined" &&
  window.matchMedia &&
  window.matchMedia("(prefers-color-scheme: dark)").matches;
applyTheme(saved || (prefersDark ? "dark" : "light"));

export { applyTheme };

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
