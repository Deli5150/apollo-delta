import { useRef } from 'react'
import { Modal, Platform, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { WebView, type WebViewMessageEvent } from 'react-native-webview'
import { finishWebSignIn, MOBILE_UA, useWebSignIn } from '../lib/reddit/mobile'
import { IconButton } from './kit'
import { colors, fs } from './theme'

// Phones: Reddit's own sign-in page in a WebView. The page asks Reddit who's signed in every
// couple of seconds (the sign-in form posts without loading a new page); once it's someone, the
// session is handed to mobile.ts and the sheet closes.

const PROBE = `
  (function () {
    if (window.__deltaProbe) return true;
    window.__deltaProbe = setInterval(function () {
      if (!/reddit\\.com$/.test(location.hostname)) return;
      fetch('/api/me.json', { credentials: 'include' })
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (j) {
          var d = j && j.data;
          if (d && d.name) window.ReactNativeWebView.postMessage(JSON.stringify({ name: d.name, modhash: d.modhash || '', icon: d.icon_img || d.snoovatar_img || '' }));
        })
        .catch(function () {});
    }, 1500);
    return true;
  })();
`

export function WebSignInHost() {
  const pending = useWebSignIn((s) => s.pending)
  const done = useRef(false)
  if (Platform.OS === 'web') return null
  const onMessage = (e: WebViewMessageEvent): void => {
    if (done.current) return
    try {
      const me = JSON.parse(e.nativeEvent.data)
      if (me?.name) {
        done.current = true
        void finishWebSignIn(me)
      }
    } catch {}
  }
  return (
    <Modal visible={Boolean(pending)} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => void finishWebSignIn(null)} onShow={() => {
        done.current = false
      }}>
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['top', 'bottom']}>
        <View style={{ height: 52, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, borderBottomWidth: 1, borderColor: colors.separator }}>
          <IconButton icon="close" label="Cancel" onPress={() => void finishWebSignIn(null)} />
          <Text style={{ flex: 1, textAlign: 'center', color: colors.text, fontSize: fs(16), fontWeight: '700', marginRight: 38 }}>Sign in to Reddit</Text>
        </View>
        {pending && (
          <WebView
            key={pending.id}
            source={{ uri: 'https://www.reddit.com/login/' }}
            userAgent={MOBILE_UA}
            sharedCookiesEnabled
            thirdPartyCookiesEnabled
            injectedJavaScript={PROBE}
            onMessage={onMessage}
            // "Continue with Google" opens Google's sign-in as a pop-up that hands the result back to
            // this page. Pop-ups show as a window over the sheet (patches/react-native-webview*.patch);
            // ones the page opens by itself, without a tap, are still blocked.
            setSupportMultipleWindows
            javaScriptCanOpenWindowsAutomatically={false}
            style={{ flex: 1, backgroundColor: '#fff' }}
          />
        )}
      </SafeAreaView>
    </Modal>
  )
}
