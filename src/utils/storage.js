const KEY = "vakantieplanner_v14";

export function loadState() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function saveState(state) {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
    return true;
  } catch (e) {
    // QuotaExceededError or blocked storage, etc.
    return false;
  }
}

export function resetState() {
  localStorage.removeItem(KEY);
}
