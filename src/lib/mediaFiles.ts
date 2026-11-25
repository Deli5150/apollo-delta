import { cacheDirectory, deleteAsync, downloadAsync } from 'expo-file-system/legacy'
import DeltaReddit from '../../modules/delta-reddit/src/DeltaRedditModule'

// Phones: a post's picture or video as a file, for Share Picture/Video and Save (issue #8).
//
// Reddit's own videos (v.redd.it) keep the picture and the sound in separate files: the MP4 the
// post points at has no sound. So for those the sound file is fetched too, and the two are put
// together into one MP4 (modules/delta-reddit, Android's MediaMuxer: no re-encoding). A video
// that has no sound file (a GIF-style one) is kept as it is.

export interface MediaFile {
  uri: string
  mimeType: string
  /** Temporary files to delete once done with it. */
  cleanup: () => Promise<void>
}

const MIME: Record<string, string> = { '.mp4': 'video/mp4', '.png': 'image/png', '.webp': 'image/webp', '.gif': 'image/gif', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg' }

/** The candidate sound files for a v.redd.it video, newest naming first. */
export function redditAudioUrls(videoUrl: string): string[] {
  const m = /^https:\/\/v\.redd\.it\/(\w+)\//.exec(videoUrl)
  if (!m) return []
  const base = `https://v.redd.it/${m[1]}/`
  return ['CMAF_AUDIO_128.mp4', 'CMAF_AUDIO_64.mp4', 'DASH_AUDIO_128.mp4', 'DASH_AUDIO_64.mp4', 'DASH_audio.mp4', 'audio'].map((f) => base + f)
}

const remove = (...uris: string[]) => Promise.all(uris.map((u) => deleteAsync(u, { idempotent: true }).catch(() => undefined))).then(() => undefined)

/** Downloads `url` into the cache, as a picture or a video with its sound. Throws if it can't be fetched as a file. */
export async function fetchMedia(url: string, kind: 'image' | 'video'): Promise<MediaFile> {
  if (/\.m3u8/i.test(url)) throw new Error('This video only streams, so it can’t be saved as a file.')
  const name = url.split('?')[0].split('/').pop() || 'media'
  const ext = (/\.(jpe?g|png|webp|gif|mp4)$/i.exec(name)?.[0] ?? (kind === 'video' ? '.mp4' : '.jpg')).toLowerCase()
  const stamp = Date.now()
  const file = `${cacheDirectory}delta-${stamp}${ext}`
  const res = await downloadAsync(url, file)
  if (res.status !== 200) {
    await remove(file)
    throw new Error(`Couldn’t download it (${res.status}).`)
  }
  const done = { uri: res.uri, mimeType: MIME[ext] ?? 'application/octet-stream', cleanup: () => remove(file) }
  if (kind !== 'video' || !DeltaReddit) return done

  for (const audioUrl of redditAudioUrls(url)) {
    const audio = `${cacheDirectory}delta-${stamp}-audio.mp4`
    const a = await downloadAsync(audioUrl, audio).catch(() => null)
    if (!a || a.status !== 200) {
      await remove(audio)
      continue
    }
    const out = `${cacheDirectory}delta-${stamp}-sound.mp4`
    try {
      await DeltaReddit.muxVideo(res.uri.replace(/^file:\/\//, ''), a.uri.replace(/^file:\/\//, ''), out.replace(/^file:\/\//, ''))
      await remove(file, audio)
      return { uri: out, mimeType: 'video/mp4', cleanup: () => remove(out) }
    } catch {
      // Couldn't put them together: keep the silent video rather than nothing.
      await remove(audio, out)
      return done
    }
  }
  return done
}
