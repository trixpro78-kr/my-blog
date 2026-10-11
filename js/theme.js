const STORAGE_KEY = 'theme';
const media = window.matchMedia('(prefers-color-scheme: dark)');

function getStoredTheme() {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return value === 'light' || value === 'dark' ? value : null;
  } catch (e) {
    return null;
  }
}

function storeTheme(theme) {
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch (e) {
    // 저장소를 쓸 수 없으면 이번 세션에만 적용합니다.
  }
}

function applyTheme(theme, button) {
  document.documentElement.setAttribute('data-theme', theme);
  const next = theme === 'dark' ? '라이트' : '다크';
  button.setAttribute('aria-label', `${next} 모드로 전환`);
}

export function initThemeToggle(button) {
  applyTheme(document.documentElement.getAttribute('data-theme') || 'light', button);

  button.addEventListener('click', () => {
    const current = document.documentElement.getAttribute('data-theme');
    const theme = current === 'dark' ? 'light' : 'dark';
    storeTheme(theme);
    applyTheme(theme, button);
  });

  // 사용자가 직접 고른 적이 없으면 시스템 설정을 따라갑니다.
  media.addEventListener('change', (event) => {
    if (getStoredTheme()) return;
    applyTheme(event.matches ? 'dark' : 'light', button);
  });
}
