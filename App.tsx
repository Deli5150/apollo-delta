import { DarkTheme, DefaultTheme, NavigationContainer, StackActions, type NavigationState } from '@react-navigation/native'
import { createNativeStackNavigator } from '@react-navigation/native-stack'
import { StatusBar } from 'expo-status-bar'
import { memo, useEffect, useRef } from 'react'
import { ActivityIndicator, AppState, Platform, useColorScheme, View } from 'react-native'
import { Freeze } from 'react-freeze'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { useShallow } from 'zustand/react/shallow'
import { loadSubs } from './src/lib/feeds'
import { useTab, useWide, type TabKey } from './src/lib/layout'
import { loadRouteUpdates } from './src/lib/reddit/routes'
import { loadAccounts, refreshMe, useSession } from './src/lib/reddit/transport'
import { desktop } from './src/lib/storage'
import { useStore } from './src/lib/store'
import { autoCheck, startUpdater, useUpdate } from './src/lib/updater'
import { nav, type RootParams } from './src/nav'
import About, { Wiki } from './src/screens/About'
import Compose from './src/screens/Compose'
import Gallery from './src/screens/Gallery'
import Inbox, { checkUnread, Conversation, useUnread } from './src/screens/Inbox'
import Posts, { FeedScreen } from './src/screens/Posts'
import Search from './src/screens/Search'
import Settings, { FeedbackScreen, SettingsPage, WhatsNew } from './src/screens/Settings'
import SubredditsScreen from './src/screens/Subreddits'
import ThreadScreen from './src/screens/Thread'
import UserScreen, { Account, RecentlyRead, SavedScreen } from './src/screens/User'
import { MediaViewerHost } from './src/ui/MediaViewer'
import { OverlayHost } from './src/ui/overlays'
import { BrowserSignInHost } from './src/ui/SignIn'
import { Rail, TabBar, TABS } from './src/ui/TabBar'
import { applyTheme, colors, setTextScale, themeKey } from './src/ui/theme'
import { ToastHost } from './src/ui/toast'
import { UpdatePrompt, useUpdatePrompt } from './src/ui/UpdatePrompt'

const Root = createNativeStackNavigator<RootParams>()
let appliedTheme = ''

// Development: preview the update sheet without a real release (the desktop screenshot hook calls it).
if (__DEV__ && typeof globalThis !== 'undefined') {
  ;(globalThis as { __deltaPreviewUpdate?: (iphone: boolean) => void }).__deltaPreviewUpdate = (iphone) => {
    useUpdatePrompt.setState({ forceChooser: iphone })
    useUpdate.setState({ state: 'available', version: '1.1.0', notes: '## What’s new\n- A preview of the update sheet', assetUrl: 'https://github.com/Deli5150/apollo-delta/releases/download/v1.1.0/ApolloDelta-1.1.0.ipa' })
  }
}

const SCREENS: Record<TabKey, React.ComponentType> = {
  posts: memo(Posts),
  inbox: memo(Inbox),
  account: memo(Account),
  search: memo(Search),
  settings: memo(Settings)
}

/** One tab's screen: mounted the first time it's shown, then kept (frozen while hidden). */
function TabPane({ active, k }: { active: boolean; k: TabKey }) {
  const seen = useRef(active)
  if (active) seen.current = true
  if (!seen.current) return null
  const Screen = SCREENS[k]
  return (
    <View style={{ flex: 1, display: active ? 'flex' : 'none' }}>
      <Freeze freeze={!active}>
        <Screen />
      </Freeze>
    </View>
  )
}

function Tabs() {
  const { tab, set } = useTab()
  const wide = useWide()
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      {TABS.map((t) => (
        <TabPane key={t.key} k={t.key} active={tab === t.key} />
      ))}
      {!wide && <TabBar tab={tab} onChange={set} />}
    </View>
  )
}

/** Desktop: the tab rail beside everything. Picking a tab also closes pages opened on top. */
function Shell({ children }: { children: React.ReactNode }) {
  const wide = useWide()
  const tab = useTab((s) => s.tab)
  if (!wide) return <>{children}</>
  return (
    <View style={{ flex: 1, flexDirection: 'row', backgroundColor: colors.bg }}>
      <Rail
        tab={tab}
        onChange={(t) => {
          useTab.getState().set(t)
          if (nav.isReady() && nav.canGoBack()) nav.dispatch(StackActions.popToTop())
        }}
      />
      <View style={{ flex: 1 }}>{children}</View>
    </View>
  )
}

/** Inbox checks: the unread badge, and a notification for each new message (desktop). */
function InboxWatcher() {
  const account = useSession((s) => s.current)
  const { minutes, notify, badge } = useStore(useShallow((s) => ({ minutes: s.settings.inboxCheckMinutes, notify: s.settings.inboxNotifications, badge: s.settings.unreadBadge })))
  const count = useUnread((s) => s.count)
  const seen = useRef<Set<string> | null>(null)
  useEffect(() => {
    if (!account) return
    seen.current = null
    const tick = async () => {
      const unread = await checkUnread()
      if (seen.current && notify && desktop) {
        for (const m of unread.filter((x) => !seen.current!.has(x.name)).slice(0, 3)) desktop.notifyNow(m.kind === 't1' ? `u/${m.author} replied` : `Message from u/${m.author || 'Reddit'}`, (m.kind === 't1' ? m.body : `${m.subject}: ${m.body}`).slice(0, 180))
      }
      seen.current = new Set(unread.map((m) => m.name))
    }
    void tick()
    const t = setInterval(() => void tick(), Math.max(1, minutes) * 60_000)
    return () => clearInterval(t)
  }, [account, minutes, notify])
  useEffect(() => desktop?.setBadge(badge ? count : 0), [count, badge])
  return null
}

/** Desktop keyboard shortcuts: ⌘1–5 switch tabs, ⌘F opens search, ⌘, settings. */
function Shortcuts() {
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey
      if (!mod) return
      const n = Number(e.key)
      if (n >= 1 && n <= TABS.length) {
        e.preventDefault()
        useTab.getState().set(TABS[n - 1].key)
        if (nav.isReady() && nav.canGoBack()) nav.dispatch(StackActions.popToTop())
      } else if (e.key === 'f') {
        e.preventDefault()
        useTab.getState().set('search')
      } else if (e.key === ',') {
        e.preventDefault()
        useTab.getState().set('settings')
      } else if (e.key === '[' && nav.isReady() && nav.canGoBack()) nav.goBack()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
  return null
}

export default function App() {
  const loaded = useStore((s) => s.loaded)
  const { themeId, appearance, pureBlack, textSize, checkUpdates, routeUpdates } = useStore(
    useShallow((s) => ({ themeId: s.settings.theme, appearance: s.settings.appearance, pureBlack: s.settings.pureBlack, textSize: s.settings.textSize, checkUpdates: s.settings.checkUpdates, routeUpdates: s.settings.routeUpdates }))
  )
  const current = useSession((s) => s.current)
  const sessionLoaded = useSession((s) => s.loaded)
  const system = useColorScheme()
  const wide = useWide()
  const navState = useRef<NavigationState | undefined>(undefined)

  const dark = appearance === 'system' ? system !== 'light' : appearance === 'dark'
  const key = themeKey(themeId, dark, pureBlack)
  if (appliedTheme !== key) {
    applyTheme(themeId, dark, pureBlack)
    appliedTheme = key
  }
  setTextScale(textSize)
  const base = colors.dark ? DarkTheme : DefaultTheme
  const theme = { ...base, colors: { ...base.colors, background: colors.bg, card: colors.bg, primary: colors.accent, text: colors.text, border: colors.separator } }

  useEffect(() => {
    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      document.body.style.backgroundColor = colors.chrome
      document.documentElement.style.colorScheme = colors.dark ? 'dark' : 'light'
    }
  }, [key])

  useEffect(() => {
    void useStore.getState().hydrate()
    startUpdater()
  }, [])

  useEffect(() => {
    if (!loaded) return
    void loadAccounts(useStore.getState().currentAccount)
  }, [loaded])

  // Remember which account you used last.
  useEffect(() => {
    if (sessionLoaded && useStore.getState().currentAccount !== current) useStore.getState().update(() => ({ currentAccount: current }))
    if (current) void loadSubs()
  }, [current, sessionLoaded])

  useEffect(() => {
    if (!loaded) return
    desktop?.updater.setAuto(checkUpdates)
    autoCheck(checkUpdates)
    if (routeUpdates) void loadRouteUpdates()
    const routes = routeUpdates ? setInterval(() => void loadRouteUpdates(), 15 * 60_000) : null
    const sub = AppState.addEventListener('change', (s) => {
      if (s !== 'active') return
      autoCheck(useStore.getState().settings.checkUpdates)
      void refreshMe()
    })
    return () => {
      sub.remove()
      if (routes) clearInterval(routes)
    }
  }, [loaded, checkUpdates, routeUpdates])

  const ready = loaded && sessionLoaded
  return (
    <SafeAreaProvider style={{ backgroundColor: colors.bg }}>
      <StatusBar style={colors.dark ? 'light' : 'dark'} />
      {!ready ? (
        <View style={{ flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={colors.accent} />
        </View>
      ) : (
        <Shell key={`${key}-${wide}-${textSize}`}>
          <NavigationContainer ref={nav} theme={theme} initialState={navState.current} onStateChange={(st) => (navState.current = st)}>
            <Root.Navigator screenOptions={{ headerShown: false, freezeOnBlur: true, contentStyle: { backgroundColor: colors.bg }, animation: wide ? 'fade' : undefined }}>
              <Root.Screen name="Tabs" component={Tabs} />
              <Root.Screen name="Thread" component={ThreadScreen} />
              <Root.Screen name="Feed" component={FeedScreen} />
              <Root.Screen name="User" component={UserScreen} />
              <Root.Screen name="About" component={About} />
              <Root.Screen name="Wiki" component={Wiki} />
              <Root.Screen name="Compose" component={Compose} options={{ presentation: wide ? 'card' : 'modal' }} />
              <Root.Screen name="Conversation" component={Conversation} />
              <Root.Screen name="Gallery" component={Gallery} />
              <Root.Screen name="RecentlyRead" component={RecentlyRead} />
              <Root.Screen name="Saved" component={SavedScreen} />
              <Root.Screen name="Subreddits" component={SubredditsScreen} />
              <Root.Screen name="SettingsPage" component={SettingsPage} />
              <Root.Screen name="Feedback" component={FeedbackScreen} />
              <Root.Screen name="WhatsNew" component={WhatsNew} />
            </Root.Navigator>
          </NavigationContainer>
        </Shell>
      )}
      {ready && <UpdatePrompt />}
      {ready && <InboxWatcher />}
      <Shortcuts />
      <MediaViewerHost />
      <BrowserSignInHost />
      <ToastHost />
      <OverlayHost />
    </SafeAreaProvider>
  )
}
