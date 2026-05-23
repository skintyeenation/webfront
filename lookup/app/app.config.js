// Lookup-app Expo config. Mirrors @skintyee/app's app.config.js shape.
module.exports = {
  expo: {
    name: 'Skin Tyee Lookup',
    slug: 'skintyee-lookup-app',
    scheme: 'skintyeelookup',
    version: '0.0.0',
    userInterfaceStyle: 'dark',
    splash: {
      resizeMode: 'contain',
      backgroundColor: '#1e1e1e',
    },
    updates: { fallbackToCacheTimeout: 0 },
    assetBundlePatterns: ['**/*'],
    ios: {
      supportsTablet: true,
      bundleIdentifier: 'ca.skintyee.lookup',
    },
    android: {
      package: 'ca.skintyee.lookup',
    },
    extra: {
      // Default points at the local lookup-api server. Override per env.
      apiServer: process.env.EXPO_PUBLIC_LOOKUP_API || 'http://127.0.0.1:5050',
    },
  },
};
