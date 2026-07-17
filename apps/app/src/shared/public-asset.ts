/** Resolves files from Vite's public directory for both local and subpath hosts. */
export function publicAsset(path: string): string {
  return `${import.meta.env.BASE_URL}${path.replace(/^\/+/, '')}`
}
