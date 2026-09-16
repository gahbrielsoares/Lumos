const STORAGE_KEY = "lumos_theme";

function applyTheme(theme) {
  document.documentElement.classList.toggle("dark", theme === "dark");
  const label = document.getElementById("theme-toggle-label");
  const icon = document.getElementById("theme-toggle-icon");
  if (label) label.textContent = theme === "dark" ? "Modo claro" : "Modo escuro";
  if (icon) {
    icon.innerHTML =
      theme === "dark"
        ? '<circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M1 12h2M21 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4"/>'
        : '<path d="M21 12.8A9 9 0 1 1 11.2 3 7 7 0 0 0 21 12.8z"/>';
  }
}

function getSavedTheme() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved) return saved;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

applyTheme(getSavedTheme());

export function initThemeToggle() {
  const btn = document.getElementById("theme-toggle-btn");
  if (!btn) return;
  applyTheme(getSavedTheme());
  btn.addEventListener("click", () => {
    const current = document.documentElement.classList.contains("dark") ? "dark" : "light";
    const next = current === "dark" ? "light" : "dark";
    localStorage.setItem(STORAGE_KEY, next);
    applyTheme(next);
  });
}
