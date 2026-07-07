// Per-client Studio session storage.
//
// Neku runs from localhost, GitHub Pages, desktop webviews, and static mirrors.
// Plain localStorage keys make every tab/project on the same origin collide, so
// editor state is scoped to a local session id. Legacy keys are read once and
// copied into the active session so existing users keep their work.

const LEGACY_KEYS = new Set([
  'neku-project',
  'cce-project',
  'neku-theme',
  'neku-custom-theme',
  'neku-grid',
  'neku-dock',
  'neku-dock-sizes',
  'neku-windows',
  'neku-recents',
  'neku-plugins',
  'neku-coop-url',
  'neku-coop-name',
]);

const rand = () => {
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
};

function cleanId(id) {
  return String(id || '').trim().replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 32);
}

function ensureGlobal(key, maker) {
  let value = localStorage.getItem(key);
  if (!value) {
    value = maker();
    localStorage.setItem(key, value);
  }
  return value;
}

const params = new URLSearchParams(location.search);
const urlSession = cleanId(params.get('session'));
const clientId = ensureGlobal('neku-client-id', () => 'client-' + rand());
const sessionId = urlSession ||
  cleanId(localStorage.getItem('neku-active-session')) ||
  ensureGlobal('neku-active-session', () => 'studio-' + rand());

localStorage.setItem('neku-active-session', sessionId);

export const SESSION = Object.freeze({
  id: sessionId,
  clientId,
  prefix: `neku:${sessionId}:`,
});

export function storageKey(key) {
  return SESSION.prefix + key;
}

export function getLocal(key, fallback = null) {
  const scoped = localStorage.getItem(storageKey(key));
  if (scoped != null) return scoped;
  if (LEGACY_KEYS.has(key)) {
    const legacy = localStorage.getItem(key);
    if (legacy != null) {
      try { localStorage.setItem(storageKey(key), legacy); } catch { /* best-effort */ }
      return legacy;
    }
  }
  return fallback;
}

export function setLocal(key, value) {
  localStorage.setItem(storageKey(key), String(value));
}

export function removeLocal(key) {
  localStorage.removeItem(storageKey(key));
}

export function getJson(key, fallback) {
  try {
    const raw = getLocal(key);
    return raw == null ? fallback : JSON.parse(raw);
  } catch {
    return fallback;
  }
}

export function setJson(key, value) {
  setLocal(key, JSON.stringify(value));
}

export function newSessionUrl() {
  const next = 'studio-' + rand();
  const url = new URL(location.href);
  url.searchParams.set('session', next);
  return url.href;
}

export function currentSessionUrl() {
  const url = new URL(location.href);
  url.searchParams.set('session', SESSION.id);
  return url.href;
}
