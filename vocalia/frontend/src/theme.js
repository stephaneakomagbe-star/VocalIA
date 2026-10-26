export const CLE_THEME = "vocalia_theme";

export function lireTheme() {
  try {
    return localStorage.getItem(CLE_THEME) === "sombre" ? "sombre" : "clair";
  } catch {
    return "clair";
  }
}

export function appliquerTheme(theme) {
  const t = theme === "sombre" ? "sombre" : "clair";
  document.documentElement.dataset.theme = t;
  document.documentElement.style.colorScheme = t === "sombre" ? "dark" : "light";
  try {
    localStorage.setItem(CLE_THEME, t);
  } catch {
    /* stockage indisponible */
  }
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", t === "sombre" ? "#000000" : "#ffffff");
}
