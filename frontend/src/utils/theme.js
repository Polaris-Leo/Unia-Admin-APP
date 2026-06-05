const STORAGE_KEY = 'unia-theme';

function getSystemTheme() {
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function initTheme() {
  const saved = localStorage.getItem(STORAGE_KEY);
  const theme = saved || getSystemTheme();
  document.documentElement.setAttribute('data-theme', theme);
}

export function getCurrentTheme() {
  return document.documentElement.getAttribute('data-theme') || getSystemTheme();
}

export function toggleTheme() {
  const next = getCurrentTheme() === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  localStorage.setItem(STORAGE_KEY, next);
  return next;
}
