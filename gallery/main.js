import { applyTheme } from './theme.js';
import { GalleryManager } from './gallery/gallery-manager.js';

document.addEventListener('DOMContentLoaded', () => {
  window.app = new GalleryManager();
  applyTheme('light');

  const t = document.getElementById('themeToggle');
  if (t) {
    t.checked = true;
    t.addEventListener('change', () => applyTheme(t.checked ? 'light' : 'dark'));
  }
});