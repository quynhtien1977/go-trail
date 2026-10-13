// Shared client-safe navigation policy; this does not authorize the destination.
export function getSafeAuthCallback(value: string | null, origin: string): string | null {
  if (!value || value !== value.trim() || /[\\\u0000-\u001f\u007f]/.test(value) || value.startsWith("//")) return null;
  if (!value.startsWith("/") && !/^https?:\/\//.test(value)) return null;
  try {
    const url = new URL(value, origin);
    const path = decodeURIComponent(url.pathname);
    if (url.origin !== new URL(origin).origin || url.username || url.password
      || path.startsWith("//") || path.includes("\\")) return null;
    return url.pathname + url.search + url.hash;
  } catch { return null; }
}
