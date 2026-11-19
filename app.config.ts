import type { ExpoConfig } from 'expo/config'
import { version } from './package.json'

// Android's versionCode from the version: 1.2.3 → 10203.
const [major, minor, patch] = version.split('.').map(Number)

const config: ExpoConfig = {
  name: 'Apollo Delta',
  slug: 'apollo-delta',
  scheme: 'apollodelta',
  version,
  orientation: 'portrait',
  icon: './assets/icon.png',
  userInterfaceStyle: 'automatic',
  backgroundColor: '#0b0d14',
  ios: {
    bundleIdentifier: 'app.apollodelta.reddit',
    supportsTablet: true,
    infoPlist: {
      ITSAppUsesNonExemptEncryption: false,
      // The update chooser checks which sideloading apps are installed (src/ui/UpdatePrompt.tsx).
      LSApplicationQueriesSchemes: ['altstore', 'sidestore', 'feather', 'flarestore']
    }
  },
  android: {
    package: 'app.apollodelta.reddit',
    versionCode: major * 10000 + minor * 100 + patch,
    adaptiveIcon: { backgroundColor: '#3d4bff', foregroundImage: './assets/android-icon-foreground.png', monochromeImage: './assets/android-icon-monochrome.png' },
    permissions: ['REQUEST_INSTALL_PACKAGES'],
    predictiveBackGestureEnabled: false
  },
  web: { favicon: './assets/favicon.png', output: 'single', bundler: 'metro' },
  plugins: [
    'expo-sharing',
    'expo-image',
    'expo-secure-store',
    ['expo-video', { supportsPictureInPicture: true }],
    ['expo-media-library', { photosPermission: 'Apollo Delta saves pictures and videos you choose to your gallery.', savePhotosPermission: 'Apollo Delta saves pictures and videos you choose to your gallery.', isAccessMediaLocationEnabled: false }],
    ['expo-image-picker', { photosPermission: 'Apollo Delta lets you pick a picture to post.' }],
    './plugins/withReleaseSigning',
    './plugins/withoutCodeShrinking',
    './plugins/withPhoneArchitectures',
    './plugins/withGradleMemory'
  ]
}

export default config
