import { NativeModule, requireOptionalNativeModule } from 'expo'

// Android-only (see android/…/DeltaRedditModule.kt); null elsewhere.
export interface NativeResponse {
  status: number
  url?: string
  contentType?: string
  body?: string
  error?: string
  remaining?: string | null
  reset?: string | null
  used?: string | null
}

declare class DeltaRedditModule extends NativeModule<{ onShare(e: { text: string }): void }> {
  getCookies(url: string): string
  clearCookies(): Promise<boolean>
  request(url: string, method: string, headers: Record<string, string>, body: string | null): Promise<NativeResponse>
  takeSharedText(): string | null
  openLinkSettings(): boolean
  /** Puts the video track of one MP4 and the audio track of another into one MP4 (file paths). */
  muxVideo(videoPath: string, audioPath: string, outPath: string): Promise<string>
}

export default requireOptionalNativeModule<DeltaRedditModule>('DeltaReddit')
