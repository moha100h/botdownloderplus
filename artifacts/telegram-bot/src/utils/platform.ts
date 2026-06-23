export type Platform = "youtube" | "spotify" | "instagram" | "radiojavan" | "unknown";

const PATTERNS: Record<Platform, RegExp[]> = {
  youtube: [
    /(?:https?:\/\/)?(?:www\.)?youtube\.com\/watch\?v=/,
    /(?:https?:\/\/)?(?:www\.)?youtu\.be\//,
    /(?:https?:\/\/)?(?:www\.)?youtube\.com\/shorts\//,
    /(?:https?:\/\/)?(?:www\.)?youtube\.com\/playlist\?list=/,
    /(?:https?:\/\/)?(?:music\.)?youtube\.com\//,
  ],
  spotify: [
    /(?:https?:\/\/)?open\.spotify\.com\/(track|album|playlist|episode)\//,
    /(?:https?:\/\/)?spotify\.link\//,
  ],
  instagram: [
    /(?:https?:\/\/)?(?:www\.)?instagram\.com\/(?:p|reel|tv)\//,
    /(?:https?:\/\/)?(?:www\.)?instagram\.com\/stories\//,
  ],
  radiojavan: [
    /(?:https?:\/\/)?(?:www\.)?radiojavan\.com\/mp3s\/mp3\//,
    /(?:https?:\/\/)?(?:www\.)?radiojavan\.com\/videos\/video\//,
    /(?:https?:\/\/)?(?:www\.)?radiojavan\.com\/podcasts\/podcast\//,
  ],
  unknown: [],
};

export function detectPlatform(url: string): Platform {
  for (const [platform, patterns] of Object.entries(PATTERNS) as [Platform, RegExp[]][]) {
    if (platform === "unknown") continue;
    if (patterns.some((p) => p.test(url))) return platform;
  }
  return "unknown";
}

export function extractUrls(text: string): string[] {
  const urlRegex = /https?:\/\/[^\s\u200B-\u200D\uFEFF\u202C\u202D]+/gi;
  return [...new Set(text.match(urlRegex) ?? [])];
}

export function isRadioJavanVideo(url: string): boolean {
  return /radiojavan\.com\/videos\/video\//.test(url);
}
