import { Ionicons } from '@expo/vector-icons'
import { useEffect, useState } from 'react'
import { ActivityIndicator, Pressable, Text, View } from 'react-native'
import { create } from 'zustand'
import { signIn, transport } from '../lib/reddit/transport'
import { fail } from './actions'
import { Button } from './kit'
import { BottomCard } from './overlays'
import { colors, fs } from './theme'
import { toast } from './toast'

// Signing in: in the app's own window (Reddit username and password), or "Sign in with Google",
// which opens Reddit's sign-in in your Chrome, Edge or Brave (Google won't sign in inside apps).

const useBrowserSignIn = create<{ waiting: string | null }>(() => ({ waiting: null }))

let browserName: Promise<string | null> | null = null
const findBrowser = () => (browserName ??= transport.browser?.() ?? Promise.resolve(null))

export function useSignInBrowser(): string | null {
  const [name, setName] = useState<string | null>(null)
  useEffect(() => {
    void findBrowser().then(setName)
  }, [])
  return name
}

export async function startSignIn(google: boolean, reauthId?: string): Promise<void> {
  try {
    if (google) useBrowserSignIn.setState({ waiting: (await findBrowser()) ?? 'your browser' })
    const a = await signIn(reauthId, google)
    if (a) toast(`Signed in as u/${a.username}`)
  } catch (e) {
    fail(e)
  } finally {
    useBrowserSignIn.setState({ waiting: null })
  }
}

/** The two sign-in buttons, for the signed-out screens. */
export function SignInButtons() {
  const browser = useSignInBrowser()
  return (
    <View style={{ gap: 10, alignItems: 'stretch', width: 260 }}>
      <Button title="Sign In" icon="log-in-outline" onPress={() => void startSignIn(false)} />
      {browser && <Button title="Sign in with Google" icon="logo-google" kind="secondary" onPress={() => void startSignIn(true)} />}
    </View>
  )
}

/** While signing in through the browser: what to do, and Cancel. Mounted once at the root. */
export function BrowserSignInHost() {
  const waiting = useBrowserSignIn((s) => s.waiting)
  const [shown, setShown] = useState(waiting)
  useEffect(() => {
    if (waiting) setShown(waiting)
  }, [waiting])
  return (
    <BottomCard visible={!!waiting} onClose={() => {}}>
      <View style={{ backgroundColor: colors.cardHi, borderRadius: 22, padding: 22, gap: 12, alignItems: 'center', borderWidth: 1, borderColor: colors.border }}>
        <View style={{ width: 54, height: 54, borderRadius: 27, backgroundColor: colors.accentSoft, alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name="logo-google" size={26} color={colors.accentHi} />
        </View>
        <Text style={{ color: colors.text, fontSize: fs(18), fontWeight: '800', textAlign: 'center' }}>Sign in in {shown}</Text>
        <Text style={{ color: colors.dim, fontSize: fs(14), textAlign: 'center', lineHeight: 20 }}>
          Reddit's sign-in page opened in a {shown} window. Choose Continue with Google (or any other way to sign in). The window closes by itself within about half a minute of signing in.
        </Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <ActivityIndicator color={colors.accentHi} size="small" />
          <Text style={{ color: colors.dim, fontSize: fs(13) }}>Waiting for Reddit…</Text>
        </View>
        <Pressable onPress={() => void transport.cancelBrowser?.()} style={{ padding: 8 }}>
          <Text style={{ color: colors.accentHi, fontWeight: '700', fontSize: fs(15) }}>Cancel</Text>
        </Pressable>
      </View>
    </BottomCard>
  )
}
