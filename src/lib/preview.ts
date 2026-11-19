import { desktop, type LinkPreview } from './storage'

// A web page's title, description, picture and site name from its Open Graph tags, for link
// cards. The desktop app fetches pages in its main process; phones fetch them directly.

const UA = 'Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Mobile Safari/537.36'

const decode = (s?: string) => s?.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>')

/** Reads the preview out of a page's HTML. */
export function parsePreview(html: string, pageUrl: string): LinkPreview | null {
  const tag = (prop: string) => {
    const m = html.match(new RegExp(`<meta[^>]+(?:property|name)=["']${prop}["'][^>]*>`, 'i'))
    return m ? m[0].match(/content=["']([^"']*)["']/i)?.[1] : undefined
  }
  const title = decode(tag('og:title') ?? tag('twitter:title') ?? html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1]?.trim())
  if (!title) return null
  let image = decode(tag('og:image') ?? tag('twitter:image'))
  if (image?.startsWith('/')) image = new URL(image, pageUrl).toString()
  return { url: pageUrl, title, description: decode(tag('og:description') ?? tag('description')), image, site: decode(tag('og:site_name')) ?? new URL(pageUrl).hostname.replace(/^www\./, '') }
}

export async function linkPreview(url: string): Promise<LinkPreview | null> {
  if (desktop) return desktop.web.preview(url)
  try {
    const ctrl = new AbortController()
    const t = setTimeout(() => ctrl.abort(), 8000)
    const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'text/html' }, signal: ctrl.signal })
    clearTimeout(t)
    if (!res.ok || !(res.headers.get('content-type') ?? '').includes('html')) return null
    return parsePreview((await res.text()).slice(0, 400_000), res.url || url)
  } catch {
    return null
  }
}
