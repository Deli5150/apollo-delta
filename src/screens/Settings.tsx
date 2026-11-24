import { Ionicons } from '@expo/vector-icons'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import { useEffect, useState, type ReactNode } from 'react'
import { Platform, Pressable, Text, View } from 'react-native'
import DeltaReddit from '../../modules/delta-reddit/src/DeltaRedditModule'
import { checkModel, deleteModel, MODEL, summariesAvailable, useSummaries } from '../lib/summarizer'
import { useShallow } from 'zustand/react/shallow'
import { CHANGELOG } from '../data/changelog'
import { useSubs } from '../lib/feeds'
import { sendFeedback, type FeedbackKind } from '../lib/feedback'
import * as api from '../lib/reddit/api'
import { loadRouteUpdates, resetRouteHealth, routeHealth } from '../lib/reddit/routes'
import { myName, signIn, signOut, switchAccount, useSession } from '../lib/reddit/transport'
import type { CommentSort, Sort, TimeRange } from '../lib/reddit/types'
import { REPO_URL } from '../lib/release'
import { cacheClear, desktop } from '../lib/storage'
import { DEFAULT_SETTINGS, migrate, useStore, type Settings as S } from '../lib/store'
import { LANGUAGES } from '../lib/translate'
import { checkForUpdates, useUpdate } from '../lib/updater'
import { VERSION } from '../version'
import { go, openExternal, type RootParams } from '../nav'
import { copy, fail } from '../ui/actions'
import { AppIcon, dockIcon, ICONS, SECRET_ICONS, type IconGroup } from '../ui/AppIcon'
import { appIconChanged } from '../lib/appIcon'
import { Avatar, Button, Empty, Field, Group, Header, Page, Row, Screen, Segmented, Sep, ToggleRow } from '../ui/kit'
import { confirm, showMenu } from '../ui/overlays'
import { colors, fs, THEMES } from '../ui/theme'
import { ThingList } from '../ui/ThingList'
import { startSignIn, useSignInBrowser } from '../ui/SignIn'
import { toast } from '../ui/toast'
import { openUpdatePrompt } from '../ui/UpdatePrompt'
import { COMMENT_SORTS } from './Thread'
import { SearchView } from './Search'
import { SORTS, TIMES } from '../lib/feeds'

// Settings, laid out like Apollo's: one list of sections, each opening its own page.

function useSetting<K extends keyof S>(key: K): [S[K], (v: S[K]) => void] {
  const v = useStore((s) => s.settings[key])
  return [v, (x) => useStore.getState().set(key, x)]
}

function Toggle({ k, title, sub }: { k: keyof S; title: string; sub?: string }) {
  const [v, set] = useSetting(k)
  return <ToggleRow title={title} sub={sub} value={Boolean(v)} onChange={(x) => set(x as never)} />
}

function Choice<T extends string>({ title, value, options, onChange, sub }: { title: string; value: T; options: Array<{ value: T; label: string }>; onChange: (v: T) => void; sub?: string }) {
  return <Row title={title} sub={sub} value={options.find((o) => o.value === value)?.label} onPress={() => showMenu(title, options.map((o) => ({ label: o.label, selected: o.value === value, onPress: () => onChange(o.value) })))} />
}

/** Rows separated by lines. */
function Rows({ children }: { children: ReactNode[] }) {
  const list = children.filter(Boolean)
  return (
    <>
      {list.map((c, i) => (
        <View key={i}>
          {i > 0 && <Sep />}
          {c}
        </View>
      ))}
    </>
  )
}

export default function Settings() {
  const account = useSession((s) => s.accounts.find((a) => a.id === s.current))
  const update = useUpdate((s) => s.state)
  const items: Array<[string, keyof typeof Ionicons.glyphMap, string, string, string?]> = [
    ['accounts', 'person-circle', '#4b6bff', 'Accounts', account ? `u/${account.username}` : 'Not signed in'],
    ['general', 'settings', '#8a98ad', 'General'],
    ['appearance', 'color-palette', '#9b5cff', 'Appearance & Themes'],
    ['icon', 'apps', '#ff6a2c', 'App Icon'],
    ['posts', 'albums', '#0a9cf5', 'Posts & Feeds'],
    ['comments', 'chatbubbles', '#1fbf8f', 'Comments'],
    ['media', 'images', '#ff4f8b', 'Media'],
    ['filters', 'funnel', '#e5383b', 'Filters'],
    ['tags', 'eye-off', '#6b7080', 'Tag Filters'],
    ['translation', 'language', '#0a9cf5', 'Translation'],
    ['inbox', 'notifications', '#ff4d5e', 'Inbox & Notifications'],
    ['categories', 'folder', '#34c759', 'Saved Categories'],
    ['backup', 'archive', '#e9a514', 'Backup & Restore'],
    ['routes', 'git-network', '#5e7bff', 'Reddit Connection'],
    ['updates', 'cloud-download', '#3aa655', 'Updates', update === 'available' ? 'Update available' : undefined],
    ['about', 'information-circle', '#8a98ad', 'About Apollo Delta']
  ]
  return (
    <Screen>
      <Header showBack={false} title="Settings" subtitle={account ? `Saved to u/${account.username}` : 'Signed out'} />
      <Page>
        <Group>
          <Rows>
            {items.slice(0, 4).map(([page, icon, color, title, value]) => (
              <Row key={page} icon={icon} iconColor={color} title={title} value={value} onPress={() => go('SettingsPage', { page })} />
            ))}
          </Rows>
        </Group>
        <Group>
          <Rows>
            {items.slice(4, 11).map(([page, icon, color, title, value]) => (
              <Row key={page} icon={icon} iconColor={color} title={title} value={value} onPress={() => go('SettingsPage', { page })} />
            ))}
          </Rows>
        </Group>
        <Group>
          <Rows>
            {items.slice(11).map(([page, icon, color, title, value]) => (
              <Row key={page} icon={icon} iconColor={color} title={title} value={value} onPress={() => go('SettingsPage', { page })} />
            ))}
          </Rows>
        </Group>
        <Group>
          <Row icon="chatbox-ellipses" iconColor="#4b6bff" title="Send Feedback" onPress={() => go('Feedback')} />
        </Group>
      </Page>
    </Screen>
  )
}

// ── Pages ────────────────────────────────────────────────────────────────────────────────────

function Accounts() {
  const { accounts, current, expired } = useSession(useShallow((s) => ({ accounts: s.accounts, current: s.current, expired: s.expired })))
  const [busy, setBusy] = useState(false)
  const browser = useSignInBrowser()
  const [remembered, setRemembered] = useState(false)
  const checkRemembered = () => void desktop?.reddit.browserRemembered().then(setRemembered)
  useEffect(checkRemembered, [])
  const add = async (reauth?: string, google = false) => {
    setBusy(!google)
    await startSignIn(google, reauth)
    setBusy(false)
    checkRemembered()
  }
  return (
    <Page>
      {expired && (
        <Group>
          <Row icon="warning" iconColor={colors.danger} title="Your Reddit session has expired" sub="Sign in again to keep browsing." onPress={() => void add(current ?? undefined)} />
        </Group>
      )}
      <Group
        title="Accounts"
        footer={`Apollo Delta has no API key. You sign in on Reddit's own page, and the app reads Reddit with that session, the way your browser does. Your password never passes through Apollo Delta.${browser ? ` Google won't sign in inside apps, so Sign in with Google opens Reddit's page in a separate ${browser} window (not your own ${browser} profile).` : ''}`}
      >
        <Rows>
          {[
            ...accounts.map((a) => (
              <Row
                key={a.id}
                title={`u/${a.username}`}
                sub={a.hasModhash ? undefined : 'Read-only: Reddit gave no write token. Sign in again to vote and comment.'}
                selected={a.id === current}
                chevron={false}
                onPress={() =>
                  showMenu(`u/${a.username}`, [
                    { label: 'Use This Account', selected: a.id === current, onPress: () => switchAccount(a.id) },
                    { label: 'Sign In Again', onPress: () => void add(a.id) },
                    ...(browser ? [{ label: 'Sign In Again with Google', onPress: () => void add(a.id, true) }] : []),
                    { label: 'Sign Out', destructive: true, onPress: () => confirm(`Sign out of u/${a.username}?`, 'Its session is deleted from this computer.', 'Sign Out', () => void signOut(a.id)) }
                  ])
                }
                right={<Avatar uri={a.icon} name={a.username} size={30} />}
              />
            )),
            <Row key="add" icon="add" iconColor={colors.accent} title={busy ? 'Waiting for Reddit…' : 'Add Account'} sub={busy ? 'Finish signing in in the Reddit window.' : 'Sign in with your Reddit username and password.'} onPress={() => void add()} />,
            browser ? <Row key="google" icon="logo-google" iconColor="#4285f4" title="Sign in with Google" sub={`Opens Reddit's sign-in in ${browser}, where Google and Apple sign-in work.`} onPress={() => void add(undefined, true)} /> : null,
            remembered ? (
              <Row
                key="forget"
                title="Forget Google Sign-In"
                sub={`The ${browser} window remembers your Google account so the next sign-in is one click.`}
                destructive
                chevron={false}
                onPress={() => confirm('Forget Google sign-in?', `Signs Google out of Apollo Delta's ${browser} window. Your Reddit accounts here stay signed in.`, 'Forget', () => void desktop?.reddit.forgetBrowser().then(() => (setRemembered(false), toast('Forgotten'))))}
              />
            ) : null
          ]}
        </Rows>
      </Group>
    </Page>
  )
}

function General() {
  const [defaultFeed, setDefaultFeed] = useSetting('defaultFeed')
  const subs = useSubs((s) => s.subs)
  const model = useSummaries((s) => s.model)
  useEffect(() => void checkModel(), [])
  return (
    <Page>
      <Group title="Startup">
        <Rows>
          {[
            <Row
              key="feed"
              title="Default Feed"
              value={defaultFeed ? (['popular', 'all'].includes(defaultFeed) ? defaultFeed[0].toUpperCase() + defaultFeed.slice(1) : `r/${defaultFeed}`) : 'Home'}
              onPress={() => showMenu('Open On Launch', [{ label: 'Home', selected: !defaultFeed, onPress: () => setDefaultFeed('') }, { label: 'Popular', selected: defaultFeed === 'popular', onPress: () => setDefaultFeed('popular') }, { label: 'All', selected: defaultFeed === 'all', onPress: () => setDefaultFeed('all') }, ...subs.slice(0, 60).map((s) => ({ label: `r/${s.name}`, selected: defaultFeed === s.name, onPress: () => setDefaultFeed(s.name) }))])}
            />,
            <Toggle key="restore" k="restoreSession" title="Restore Reading Session" sub="Reopen the feed you were reading last time." />
          ]}
        </Rows>
      </Group>
      <Group title="Behavior">
        <Rows>
          {[
            <Toggle key="links" k="openLinksInApp" title="Open Reddit Links in Apollo Delta" sub="Posts, subreddits and profiles open here; other links in your browser." />,
            <Toggle key="tap" k="tapScoreToDownvote" title="Tap Score to Cycle Votes" />,
            <Toggle key="abs" k="showTimestampsAbsolute" title="Show Dates Instead of Ages" sub="Tap any time to see its full date either way." />
          ]}
        </Rows>
      </Group>
      {Platform.OS === 'android' && DeltaReddit ? (
        <Group title="Links From Other Apps" footer="Android lets only Reddit's own app open Reddit links by itself. Turn on “Open supported links” and add the reddit.com links there, and links from other apps and your browser open here. Sharing a Reddit link to Apollo Delta works either way.">
          <Row icon="link" iconColor="#4b6bff" title="Open Reddit Links Here" sub="Opens Android's Open by default settings." onPress={() => DeltaReddit?.openLinkSettings()} />
        </Group>
      ) : null}
      {summariesAvailable && model === 'ready' ? (
        <Group title="Comment Summaries" footer={`Summaries are written on this phone by ${MODEL.name}, an open-source AI model. Deleting it frees ${(MODEL.bytes / 1e9).toFixed(1)} GB; Summarize Comments offers to download it again.`}>
          <Row icon="trash" iconColor={colors.danger} title="Delete the AI Model" onPress={() => confirm('Delete the AI model?', `Frees ${(MODEL.bytes / 1e9).toFixed(1)} GB. You can download it again from any thread.`, 'Delete', () => void deleteModel().then(() => toast('Model deleted')))} />
        </Group>
      ) : null}
    </Page>
  )
}

function Appearance() {
  const [theme, setTheme] = useSetting('theme')
  const [appearance, setAppearance] = useSetting('appearance')
  const [textSize, setTextSize] = useSetting('textSize')
  const unlocked = useStore((s) => s.settings.pixelPal === 'unlocked')
  return (
    <Page>
      <Group title="Mode">
        <View style={{ padding: 12 }}>
          <Segmented value={appearance} onChange={setAppearance} options={[{ value: 'light', label: 'Light' }, { value: 'dark', label: 'Dark' }, { value: 'system', label: 'System' }]} />
        </View>
        <Sep />
        <Toggle k="pureBlack" title="Pure Black Dark Mode" sub="True black backgrounds for OLED screens." />
      </Group>
      <Group title="Theme">
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', padding: 10, gap: 10 }}>
          {THEMES.filter((t) => !t.hidden || unlocked || theme === t.id).map((t) => (
            <Pressable key={t.id} onPress={() => setTheme(t.id)} style={{ width: 96, alignItems: 'center', gap: 6, padding: 8, borderRadius: 12, borderWidth: 2, borderColor: theme === t.id ? t.accent : 'transparent', backgroundColor: colors.field }}>
              <View style={{ width: 60, height: 40, borderRadius: 8, backgroundColor: t.darkBg, overflow: 'hidden', flexDirection: 'row' }}>
                <View style={{ flex: 1, backgroundColor: t.lightBg ?? t.darkBg }} />
                <View style={{ flex: 1, backgroundColor: t.darkBg }} />
                <View style={{ position: 'absolute', bottom: 6, left: 10, right: 10, height: 8, borderRadius: 4, backgroundColor: t.accent }} />
              </View>
              <Text numberOfLines={1} style={{ color: colors.text, fontSize: fs(12.5), fontWeight: theme === t.id ? '700' : '500' }}>
                {t.name}
              </Text>
            </Pressable>
          ))}
        </View>
      </Group>
      <Group title="Text">
        <View style={{ padding: 12 }}>
          <Segmented value={textSize} onChange={setTextSize} options={[{ value: 'small', label: 'Small' }, { value: 'medium', label: 'Medium' }, { value: 'large', label: 'Large' }, { value: 'xlarge', label: 'Huge' }]} />
        </View>
      </Group>
    </Page>
  )
}

function AppIconPage() {
  const [icon, setIcon] = useSetting('appIcon')
  const unlocked = useStore((s) => s.settings.pixelPal === 'unlocked')
  const pick = async (id: string) => {
    setIcon(id)
    if (!desktop) {
      appIconChanged()
      return toast('The new icon appears when you leave Apollo Delta')
    }
    await desktop.setIcon(id === 'default' ? null : await dockIcon(id))
    toast(desktop.platform === 'darwin' ? 'Dock icon changed' : 'Icon changed (shows on the taskbar while Apollo Delta is open)')
  }
  const groups: Array<{ group: IconGroup | 'Secret'; title: string }> = [
    { group: 'Colours', title: 'Colors' },
    { group: 'Art Styles', title: 'Art Styles' },
    ...(unlocked ? [{ group: 'Secret' as const, title: 'Sekrit' }] : [])
  ]
  return (
    <Page>
      {groups.map(({ group, title }) => (
        <Group key={group} title={title}>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', padding: 10, gap: 12 }}>
            {ICONS.filter((i) => (group === 'Secret' ? SECRET_ICONS.has(i.id) : i.group === group && !SECRET_ICONS.has(i.id))).map((i) => (
              <Pressable key={i.id} onPress={() => void pick(i.id)} accessibilityRole="button" accessibilityLabel={`${i.name} icon`} accessibilityState={{ selected: icon === i.id }} style={{ alignItems: 'center', gap: 6, width: 84 }}>
                <View style={{ borderRadius: 18, borderWidth: 3, borderColor: icon === i.id ? colors.accent : 'transparent', padding: 2 }}>
                  <AppIcon id={i.id} size={64} />
                </View>
                <Text numberOfLines={1} style={{ color: icon === i.id ? colors.accentHi : colors.text, fontSize: fs(12.5), fontWeight: '600' }}>{i.name}</Text>
              </Pressable>
            ))}
          </View>
        </Group>
      ))}
    </Page>
  )
}

function PostsPage() {
  const [postSize, setPostSize] = useSetting('postSize')
  const [side, setSide] = useSetting('thumbnailSide')
  const [sort, setSort] = useSetting('defaultSort')
  const [time, setTime] = useSetting('defaultTime')
  return (
    <Page>
      <Group title="Layout">
        <View style={{ padding: 12 }}>
          <Segmented value={postSize} onChange={setPostSize} options={[{ value: 'large', label: 'Large Posts' }, { value: 'compact', label: 'Compact Posts' }]} />
        </View>
        <Sep />
        <Rows>
          {[
            <Toggle key="t" k="showThumbnails" title="Thumbnails (Compact)" />,
            <Choice key="side" title="Thumbnail Side" value={side} onChange={setSide} options={[{ value: 'left', label: 'Left' }, { value: 'right', label: 'Right' }]} />,
            <Toggle key="f" k="showFlair" title="Show Flair" />,
            <Toggle key="a" k="showAwards" title="Show Awards" />,
            <Toggle key="i" k="showSubredditIcons" title="Show Subreddit Icons" />
          ]}
        </Rows>
      </Group>
      <Group title="Sorting">
        <Rows>
          {[
            <Choice key="s" title="Default Sort" value={sort} onChange={(v) => setSort(v as Sort)} options={SORTS.map((s) => ({ value: s.value, label: s.label }))} />,
            <Choice key="t" title="Default Top Range" value={time} onChange={(v) => setTime(v as TimeRange)} options={TIMES.map((t) => ({ value: t.value, label: t.label }))} />,
            <Toggle key="r" k="rememberSubredditSort" title="Remember Sort per Subreddit" />
          ]}
        </Rows>
      </Group>
      <Group title="Read Posts">
        <Rows>
          {[<Toggle key="o" k="markReadOnOpen" title="Mark Read When Opened" />, <Toggle key="d" k="dimReadPosts" title="Dim Read Posts" />, <Toggle key="h" k="hideReadPosts" title="Hide Read Posts" sub="On Home, Popular, All and multireddits." />]}
        </Rows>
      </Group>
      <Group title="All+" footer="Mix NSFW posts back into r/all, the way old Reddit's r/all showed them.">
        <Toggle k="nsfwInAll" title="Show NSFW in r/all" />
      </Group>
    </Page>
  )
}

function CommentsPage() {
  const [sort, setSort] = useSetting('defaultCommentSort')
  const [jump, setJump] = useSetting('jumpButton')
  return (
    <Page>
      <Group>
        <Rows>
          {[
            <Choice key="s" title="Default Comment Sort" value={sort} onChange={(v) => setSort(v as CommentSort)} options={COMMENT_SORTS} />,
            <Toggle key="h" k="highlightNewComments" title="New Comments Highlightifier" sub="Comments posted since your last visit are tinted and marked NEW." />,
            <Toggle key="p" k="autoCollapsePinned" title="Auto-Collapse Pinned Comments" sub="Moderator stickies start collapsed." />,
            <Toggle key="c" k="collapseChildren" title="Collapse Replies by Default" />,
            <Toggle key="a" k="showUserAvatars" title="Show User Profile Pictures" />,
            <Toggle key="sc" k="showScoreOnComments" title="Show Comment Scores" />
          ]}
        </Rows>
      </Group>
      <Group title="Jump Button" footer="Long press the jump button to go back one.">
        <Rows>
          {[<Toggle key="j" k="showJumpButton" title="Show Jump Button" />, <Choice key="m" title="Jumps To" value={jump} onChange={setJump} options={[{ value: 'threads', label: 'Next Thread' }, { value: 'new', label: 'Next New Comment' }]} />]}
        </Rows>
      </Group>
    </Page>
  )
}

function MediaPage() {
  return (
    <Page>
      <Group title="Video">
        <Rows>{[<Toggle key="a" k="autoplay" title="Autoplay Videos & GIFs" />, <Toggle key="m" k="mutedVideos" title="Start Videos Muted" />, <Toggle key="l" k="loopVideos" title="Loop Videos" />]}</Rows>
      </Group>
      <Group title="Previews">
        <Rows>
          {[<Toggle key="i" k="inlineMedia" title="Inline Media Previews" sub="Show images posted in comments and posts inline." />, <Toggle key="r" k="richLinks" title="Rich Link Previews" sub="Show a link's page title, picture and site as a card." />]}
        </Rows>
      </Group>
    </Page>
  )
}

function ListEditor({ title, items, onChange, placeholder, prefix = '' }: { title: string; items: string[]; onChange: (v: string[]) => void; placeholder: string; prefix?: string }) {
  const [text, setText] = useState('')
  const add = () => {
    const v = text.trim().toLowerCase().replace(/^\/?(r|u)\//, '')
    if (v && !items.includes(v)) onChange([...items, v])
    setText('')
  }
  return (
    <Group title={title}>
      <View style={{ padding: 10 }}>
        <Field placeholder={placeholder} value={text} onChangeText={setText} onSubmitEditing={add} autoCapitalize="none" icon="add" />
      </View>
      {items.map((it) => (
        <View key={it}>
          <Sep />
          <Row title={`${prefix}${it}`} chevron={false} right={<Ionicons name="close-circle" size={19} color={colors.faint} />} onPress={() => onChange(items.filter((x) => x !== it))} />
        </View>
      ))}
    </Group>
  )
}

function FiltersPage() {
  const filters = useStore((s) => s.settings.filters)
  const setF = (k: keyof S['filters'], v: string[]) => useStore.getState().set('filters', { ...filters, [k]: v })
  return (
    <Page>
      <Group footer="Filters hide posts on Home, Popular, All and multireddits.">
        <Rows>{[<Toggle key="n" k="showNsfw" title="Show NSFW Content" />, <Toggle key="s" k="filterInSubreddits" title="Also Filter Inside Subreddits" />]}</Rows>
      </Group>
      <ListEditor title="Keywords (in titles)" items={filters.keywords} onChange={(v) => setF('keywords', v)} placeholder="Add a keyword" />
      <ListEditor title="Subreddits" items={filters.subreddits} onChange={(v) => setF('subreddits', v)} placeholder="Add a subreddit" prefix="r/" />
      <ListEditor title="Users" items={filters.users} onChange={(v) => setF('users', v)} placeholder="Add a username" prefix="u/" />
      <ListEditor title="Domains" items={filters.domains} onChange={(v) => setF('domains', v)} placeholder="Add a domain (e.g. example.com)" />
      <ListEditor title="Flairs" items={filters.flairs} onChange={(v) => setF('flairs', v)} placeholder="Add a flair" />
    </Page>
  )
}

function TagsPage() {
  const overrides = useStore((s) => s.settings.tagOverrides)
  return (
    <Page>
      <Group footer="Blurred posts show their media (and spoiler text) after a tap.">
        <Rows>{[<Toggle key="n" k="blurNsfw" title="Blur NSFW Posts" />, <Toggle key="s" k="blurSpoilers" title="Blur Spoilers" />]}</Rows>
      </Group>
      <Group title="Per-Subreddit Exceptions" footer="Set these from a subreddit's About page.">
        {Object.keys(overrides).length ? (
          Object.entries(overrides).map(([sr, o], i) => (
            <View key={sr}>
              {i > 0 && <Sep />}
              <Row
                title={`r/${sr}`}
                value={[o.nsfw !== undefined ? `NSFW ${o.nsfw ? 'blurred' : 'shown'}` : '', o.spoiler !== undefined ? `Spoilers ${o.spoiler ? 'blurred' : 'shown'}` : ''].filter(Boolean).join(' · ')}
                onPress={() =>
                  showMenu(`r/${sr}`, [
                    { label: 'Edit', onPress: () => go('About', { sr }) },
                    {
                      label: 'Remove Exception',
                      destructive: true,
                      onPress: () => {
                        const next = { ...overrides }
                        delete next[sr]
                        useStore.getState().set('tagOverrides', next)
                      }
                    }
                  ])
                }
              />
            </View>
          ))
        ) : (
          <Row title="No exceptions" chevron={false} />
        )}
      </Group>
    </Page>
  )
}

function TranslationPage() {
  const [target, setTarget] = useSetting('translateTarget')
  return (
    <Page>
      <Group footer="Translate posts and comments in place from their ••• menu (translations by Google).">
        {LANGUAGES.map(([code, name], i) => (
          <View key={code}>
            {i > 0 && <Sep />}
            <Row title={name} selected={target === code} chevron={false} onPress={() => setTarget(code)} />
          </View>
        ))}
      </Group>
    </Page>
  )
}

function InboxPage() {
  const [minutes, setMinutes] = useSetting('inboxCheckMinutes')
  return (
    <Page>
      <Group footer="While Apollo Delta is open (or in the menu bar / tray), it checks your inbox and shows a notification for new replies and messages.">
        <Rows>
          {[
            <Toggle key="n" k="inboxNotifications" title="Inbox Notifications" />,
            <Toggle key="b" k="unreadBadge" title="Unread Badge" sub="On the Inbox tab and the app's icon." />,
            <Choice key="m" title="Check Every" value={String(minutes)} onChange={(v) => setMinutes(Number(v))} options={['1', '2', '5', '10', '15', '30'].map((m) => ({ value: m, label: `${m} min` }))} />
          ]}
        </Rows>
      </Group>
    </Page>
  )
}

function CategoriesPage() {
  const categories = useStore((s) => s.savedCategories)
  const counts = useStore((s) => s.itemCategories)
  const [text, setText] = useState('')
  const set = (savedCategories: string[]) => useStore.getState().update(() => ({ savedCategories }))
  return (
    <Page>
      <Group footer="Save into a category from a post's or comment's ••• menu. Categories are kept by Apollo Delta, not Reddit.">
        <View style={{ padding: 10 }}>
          <Field
            placeholder="New category"
            value={text}
            onChangeText={setText}
            icon="add"
            onSubmitEditing={() => {
              const t = text.trim()
              if (t && !categories.includes(t)) set([...categories, t])
              setText('')
            }}
          />
        </View>
        {categories.map((c) => (
          <View key={c}>
            <Sep />
            <Row
              title={c}
              value={String(Object.values(counts).filter((x) => x === c).length)}
              onPress={() =>
                showMenu(c, [
                  { label: 'Open', onPress: () => go('Saved', { category: c }) },
                  {
                    label: 'Rename',
                    onPress: () => {
                      const name = typeof window !== 'undefined' && window.prompt ? window.prompt('Rename category', c) : null
                      if (!name?.trim() || categories.includes(name.trim())) return
                      useStore.getState().update((d) => ({
                        savedCategories: d.savedCategories.map((x) => (x === c ? name.trim() : x)),
                        itemCategories: Object.fromEntries(Object.entries(d.itemCategories).map(([k, v]) => [k, v === c ? name.trim() : v]))
                      }))
                    }
                  },
                  {
                    label: 'Delete',
                    destructive: true,
                    onPress: () =>
                      confirm(`Delete “${c}”?`, 'The posts stay saved on Reddit.', 'Delete', () =>
                        useStore.getState().update((d) => ({ savedCategories: d.savedCategories.filter((x) => x !== c), itemCategories: Object.fromEntries(Object.entries(d.itemCategories).filter(([, v]) => v !== c)) }))
                      )
                  }
                ])
              }
            />
          </View>
        ))}
      </Group>
    </Page>
  )
}

function BackupPage() {
  const exportBackup = async () => {
    const { loaded, hydrate, update, set, setSettings, ...data } = useStore.getState()
    const json = JSON.stringify({ app: 'apollo-delta', version: VERSION, exportedAt: new Date().toISOString(), data }, null, 2)
    const name = `Apollo Delta Backup ${new Date().toISOString().slice(0, 10)}.json`
    if (desktop) {
      if (await desktop.saveFile(name, json)) toast('Backup saved')
    } else void copy(json, 'Backup')
  }
  const importBackup = async () => {
    if (!desktop) return toast('Restoring works in the desktop app for now.')
    const file = await desktop.openFile(['json'])
    if (!file) return
    try {
      const parsed = JSON.parse(decodeURIComponent(escape(atob(file.base64))))
      if (parsed.app !== 'apollo-delta' || !parsed.data) throw new Error("This isn't an Apollo Delta backup.")
      confirm('Restore this backup?', `From ${new Date(parsed.exportedAt).toLocaleString()}. Your current settings, favorites, filters and categories are replaced. Accounts stay signed in.`, 'Restore', () => {
        const data = migrate(parsed.data)
        useStore.getState().update(() => ({ ...data, currentAccount: useStore.getState().currentAccount }))
        toast('Backup restored')
      })
    } catch (e) {
      fail(e)
    }
  }
  return (
    <Page>
      <Group footer="A backup has your settings, themes, favorites, filters, saved categories and reading history. It doesn't include your Reddit sign-in.">
        <Rows>{[<Row key="e" icon="share-outline" iconColor="#e9a514" title="Export Backup" onPress={() => void exportBackup()} />, <Row key="i" icon="download-outline" iconColor="#0a9cf5" title="Restore from Backup" onPress={() => void importBackup()} />]}</Rows>
      </Group>
      <Group>
        <Rows>
          {[
            <Row key="c" title="Clear Cached Feeds" onPress={() => void cacheClear().then(() => toast('Cache cleared'))} />,
            <Row key="r" title="Reset All Settings" destructive onPress={() => confirm('Reset all settings?', 'Themes, filters and preferences go back to how they started.', 'Reset', () => useStore.getState().update(() => ({ settings: DEFAULT_SETTINGS })))} />
          ]}
        </Rows>
      </Group>
    </Page>
  )
}

function RoutesPage() {
  const [health, setHealth] = useState(routeHealth())
  const rl = useSession((s) => s.ratelimit)
  return (
    <Page>
      <Group footer="Reddit serves some pages from different hosts to signed-in web sessions and blocks others. Apollo Delta tries the hosts in order, and backs off from one that keeps refusing. Route updates let fixes reach you without an app update.">
        <Rows>
          {[
            <Toggle key="u" k="routeUpdates" title="Use Route Updates" />,
            <Row key="c" title="Check for Route Updates Now" onPress={() => void loadRouteUpdates().then((n) => toast(n ? `${n} route updates in use` : 'No route updates'))} />,
            <Row key="rl" title="Rate Limit" value={rl.remaining !== undefined ? `${Math.floor(rl.remaining)} left${rl.resetAt ? `, resets in ${Math.max(0, Math.round((rl.resetAt - Date.now()) / 1000))}s` : ''}` : '—'} chevron={false} />
          ]}
        </Rows>
      </Group>
      <Group title="Route Health">
        {health.length ? (
          health.map((h, i) => (
            <View key={`${h.key}-${h.host}`}>
              {i > 0 && <Sep />}
              <Row title={h.key} sub={`${h.host}.reddit.com`} value={h.until > Date.now() ? 'cooling down' : h.fails ? `${h.fails} blocked` : 'OK'} chevron={false} />
            </View>
          ))
        ) : (
          <Row title="Every route is working" chevron={false} />
        )}
        <Sep />
        <Row title="Reset Route Health" onPress={() => (resetRouteHealth(), setHealth([]))} />
      </Group>
    </Page>
  )
}

function UpdatesPage() {
  const u = useUpdate()
  const [auto, setAuto] = useSetting('checkUpdates')
  return (
    <Page>
      <Group footer="Update settings are the same on every account; everything else in Settings is kept for each account.">
        <Rows>
          {[
            <Row key="v" title="Current Version" value={VERSION} chevron={false} />,
            <Row
              key="c"
              title={u.state === 'checking' ? 'Checking…' : u.state === 'available' ? `Version ${u.version} is available` : u.state === 'latest' ? "You're up to date" : 'Check for Updates'}
              sub={u.error}
              onPress={() => (u.state === 'available' ? openUpdatePrompt() : void checkForUpdates())}
            />,
            <ToggleRow key="a" title="Check Automatically" value={auto} onChange={(v) => (setAuto(v), desktop?.updater.setAuto(v))} />,
            <Row key="w" title="What's New" onPress={() => go('WhatsNew')} />
          ]}
        </Rows>
      </Group>
    </Page>
  )
}

function AboutPage() {
  const [taps, setTaps] = useState(0)
  const unlocked = useStore((s) => s.settings.pixelPal === 'unlocked')
  return (
    <Page>
      <View style={{ alignItems: 'center', paddingTop: 30, gap: 8 }}>
        <AppIcon id="default" size={96} />
        <Text style={{ color: colors.text, fontSize: fs(24), fontWeight: '800' }}>Apollo Delta</Text>
        <Text
          onPress={() => {
            const n = taps + 1
            setTaps(n)
            if (n === 7 && !unlocked) {
              useStore.getState().set('pixelPal', 'unlocked')
              toast('🛸 Sekrit unlocked: the Nebula theme and icon')
            }
          }}
          style={{ color: colors.dim, fontSize: fs(14) }}
        >
          Version {VERSION}
        </Text>
        <Text style={{ color: colors.dim, fontSize: fs(13.5), textAlign: 'center', maxWidth: 420, lineHeight: 19, marginTop: 6 }}>
          A Reddit client for Mac, Windows and Android, inspired by Christian Selig's Apollo and the community's Apollo Reborn. No API key needed. Not affiliated with Reddit, Apollo or Apollo Reborn.
        </Text>
      </View>
      <Group>
        <Rows>
          {[
            <Row key="g" icon="logo-github" iconColor="#24292f" title="Source Code" onPress={() => openExternal(REPO_URL)} />,
            <Row key="r" icon="planet" iconColor="#ff4500" title="Apollo Reborn" sub="The iOS project that inspired Apollo Delta" onPress={() => openExternal('https://apolloreborn.app')} />,
            <Row key="p" icon="shield-checkmark" iconColor="#34c759" title="Privacy" sub="Your Reddit session and data stay on this device." onPress={() => openExternal('https://deli5150.github.io/apollo-delta/privacy.html')} />
          ]}
        </Rows>
      </Group>
    </Page>
  )
}

export function FeedbackScreen() {
  const [kind, setKind] = useState<FeedbackKind>('bug')
  const [title, setTitle] = useState('')
  const [text, setText] = useState('')
  return (
    <Screen>
      <Header title="Send Feedback" />
      <Page>
        <View style={{ gap: 10, marginTop: 16 }}>
          <Segmented value={kind} onChange={setKind} options={[{ value: 'bug', label: 'Report a Bug' }, { value: 'feature', label: 'Suggest a Feature' }]} />
          <Field placeholder="Title" value={title} onChangeText={setTitle} />
          <Field placeholder={kind === 'bug' ? 'What happened?' : 'What would you like?'} value={text} onChangeText={setText} multiline style={{ minHeight: 160, textAlignVertical: 'top' }} />
          <Text style={{ color: colors.dim, fontSize: fs(12.5) }}>This opens a filled-in issue on GitHub for you to review and submit.</Text>
          <Button title="Continue on GitHub" icon="logo-github" disabled={!title.trim()} onPress={() => void sendFeedback(kind, title, text, VERSION).then((r) => r === 'copied' && toast('Your description is also copied, in case GitHub leaves it out')).catch(fail)} />
        </View>
      </Page>
    </Screen>
  )
}

export function WhatsNew() {
  return (
    <Screen>
      <Header title="What's New" />
      <Page>
        {CHANGELOG.map((r) => (
          <Group key={r.version} title={`Version ${r.version} · ${r.date}`}>
            <View style={{ padding: 14, gap: 6 }}>
              {r.notes.map((n, i) => (
                <Text key={i} style={{ color: colors.text, fontSize: fs(14), lineHeight: 20 }}>
                  • {n}
                </Text>
              ))}
            </View>
          </Group>
        ))}
      </Page>
    </Screen>
  )
}

const TITLES: Record<string, string> = {
  accounts: 'Accounts',
  general: 'General',
  appearance: 'Appearance',
  icon: 'App Icon',
  posts: 'Posts & Feeds',
  comments: 'Comments',
  media: 'Media',
  filters: 'Filters',
  tags: 'Tag Filters',
  translation: 'Translation',
  inbox: 'Inbox & Notifications',
  categories: 'Saved Categories',
  backup: 'Backup & Restore',
  routes: 'Reddit Connection',
  updates: 'Updates',
  about: 'About'
}

const PAGES: Record<string, () => ReactNode> = {
  accounts: Accounts,
  general: General,
  appearance: Appearance,
  icon: AppIconPage,
  posts: PostsPage,
  comments: CommentsPage,
  media: MediaPage,
  filters: FiltersPage,
  tags: TagsPage,
  translation: TranslationPage,
  inbox: InboxPage,
  categories: CategoriesPage,
  backup: BackupPage,
  routes: RoutesPage,
  updates: UpdatesPage,
  about: AboutPage
}

/** One settings page — also hosts a few account lists and in-feed search (by `page` name). */
export function SettingsPage({ route }: NativeStackScreenProps<RootParams, 'SettingsPage'>) {
  const page = route.params.page
  if (page.startsWith('list:')) {
    const where = page.slice(5) as api.UserWhere
    const me = myName()
    return (
      <Screen>
        <Header title={where[0].toUpperCase() + where.slice(1)} />
        {me ? <ThingList deps={[where, me]} load={(after) => api.userListing(me, where, 'new', after)} /> : <Empty icon="person-outline" title="Sign in first" />}
      </Screen>
    )
  }
  if (page.startsWith('search:')) {
    const scope = page.slice(7)
    return (
      <Screen>
        <Header title="Search" subtitle={scope ? `in ${scope.startsWith('/') ? 'this feed' : `r/${scope}`}` : undefined} />
        <SearchView scope={scope || undefined} />
      </Screen>
    )
  }
  const Body = PAGES[page]
  return (
    <Screen>
      <Header title={TITLES[page] ?? 'Settings'} />
      {Body ? <Body /> : <Empty icon="help" title="Unknown page" />}
    </Screen>
  )
}
