module.exports = {
  expo: {
    name: 'Skin Tyee',
    slug: 'skintyee-app',
    scheme: 'skintyee',
    version: '0.0.0',
    userInterfaceStyle: 'dark',
    // STUB (assets): no app icon / splash art yet, so the icon/splash/favicon
    // fields are intentionally omitted and Expo's defaults are used. Add artwork
    // to assets/ and re-add icon/splash/adaptiveIcon/favicon here. See STUBS.md.
    splash: {
      resizeMode: 'contain',
      backgroundColor: '#1e1e1e',
    },
    updates: {
      fallbackToCacheTimeout: 0,
    },
    assetBundlePatterns: ['**/*'],
    ios: {
      supportsTablet: true,
      // STUB: placeholder bundle id — replace before any real build/submission.
      bundleIdentifier: 'ca.skintyee.app',
    },
    android: {
      // STUB: placeholder package name — replace before any real build/submission.
      package: 'ca.skintyee.app',
    },
    extra: {
      // STUB: no real API server yet (diagram: App.SkinTyee.ca → API Server → Azure Cloud DB).
      // The data layer is mocked; see src/services/api and STUBS.md.
      apiServer: process.env.EXPO_PUBLIC_API_SERVER || 'mock',
    },
  },
};
