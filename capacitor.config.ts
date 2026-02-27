import type { CapacitorConfig } from '@capacitor/cli'

const slug = process.env.GAME_SLUG
if (!slug) {
  console.error('Set GAME_SLUG env var (e.g. GAME_SLUG=crazy-west npx cap sync)')
  process.exit(1)
}

const config: CapacitorConfig = {
  appId: 'com.gamefactory.app',
  appName: 'Game Factory',
  webDir: `games/${slug}/dist`,
  ios: {
    contentInset: 'always',
    backgroundColor: '#000000',
    preferredContentMode: 'mobile',
  },
  android: {
    backgroundColor: '#000000',
  },
  plugins: {
    StatusBar: {
      style: 'DARK',
      backgroundColor: '#000000',
    },
    ScreenOrientation: {
      defaultOrientation: 'landscape',
    },
  },
}

export default config
