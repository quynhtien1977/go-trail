import legacyMediaManifest from "../../data/reference/gotrail/legacy-media.json";

export interface LegacyMediaItem {
  key: string;
  original_path: string;
  original_url: string;
  storage_path: string;
  url: string;
  sha256: string;
  bytes: number;
  width: number;
  height: number;
  has_alpha: boolean;
  format: string;
}

const mediaMap = new Map<string, LegacyMediaItem>();
for (const entry of legacyMediaManifest.entries as LegacyMediaItem[]) {
  mediaMap.set(entry.key, entry);
}

/**
 * Lấy đối tượng metadata của ảnh legacy đã tối ưu WebP
 */
export function getLegacyMedia(key: string): LegacyMediaItem | undefined {
  return mediaMap.get(key);
}

/**
 * Lấy URL công khai đã tối ưu của ảnh legacy
 */
export function getLegacyMediaUrl(key: string, fallback = ""): string {
  return mediaMap.get(key)?.url || fallback;
}
