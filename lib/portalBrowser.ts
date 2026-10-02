export function isPortalBrowser() {
  return typeof document !== 'undefined' && document.documentElement.dataset.portal === 'true';
}
