import type { AccountInfo, RedditRequest, RedditResponse } from '../storage'
import type { Transport } from './transport'

// Phones: filled in with the Android app (a WebView sign-in whose cookies the app's own requests
// share). Until then, signing in is desktop-only.

const unsupported = async (): Promise<never> => {
  throw new Error('Signing in to Reddit works in the desktop app for now.')
}

export const mobileTransport: Transport = {
  accounts: async (): Promise<AccountInfo[]> => [],
  signIn: unsupported,
  signOut: async () => {},
  refresh: async () => null,
  reorder: async () => {},
  request: async (_id: string | null, _req: RedditRequest): Promise<RedditResponse> => ({ status: 0, error: 'not available here yet' }),
  upload: unsupported
}
