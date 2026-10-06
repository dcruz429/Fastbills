export function staticCacheControl(filePath: string): string {
  // Only content-hashed build outputs are safe to reuse across publishes.
  if (/(?:^|[/\\])assets[/\\][^/\\]+-[A-Za-z0-9_-]{8}\.[^.]+$/.test(filePath)) {
    return "public, max-age=31536000, immutable";
  }
  // Revalidate HTML and unversioned files so users get new chunk URLs.
  return "no-cache";
}
