// Centralized app constants
// Update this to your repository slug (owner/repo)
const REPO_SLUG_ENV =
  (typeof process !== 'undefined' && (process as any)?.env?.REPO_SLUG) ||
  (typeof import.meta !== 'undefined' && (import.meta as any)?.env?.VITE_REPO_SLUG)

export const REPO_SLUG: string = (REPO_SLUG_ENV as string) || 'youtonghy/TJXT'

// Allow custom tag prefix e.g. 'v' or 'Ver'
const TAG_PREFIX_ENV =
  (typeof process !== 'undefined' && (process as any)?.env?.TAG_PREFIX) ||
  (typeof import.meta !== 'undefined' && (import.meta as any)?.env?.VITE_TAG_PREFIX)

export const TAG_PREFIX: string = (TAG_PREFIX_ENV as string) || 'Ver'

export const RELEASES_BASE_URL = `https://github.com/${REPO_SLUG}/releases`

export function tagName(version: string): string {
  return `${TAG_PREFIX}${version}`
}

export function releasePage(version: string): string {
  return `${RELEASES_BASE_URL}/tag/${tagName(version)}`
}

export function latestYmlUrl(): string {
  return `${RELEASES_BASE_URL}/latest/download/latest.yml`
}

export function downloadBase(version: string): string {
  return `${RELEASES_BASE_URL}/download/${tagName(version)}/`
}
