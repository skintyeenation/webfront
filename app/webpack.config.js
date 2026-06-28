// Customized Expo SDK 48 webpack config.
//
// Why:
//   pnpm's symlinked node_modules + source-map-loader = ENOENT when source-
//   map-loader tries to resolve transitive deps' source maps at paths the
//   pnpm layout doesn't have (e.g. `node_modules/react-redux/node_modules/
//   react-is/index.js`).
//
//   Telling source-map-loader to skip ALL node_modules is the standard
//   workaround. Our own source maps still get processed.

const createExpoWebpackConfigAsync = require('@expo/webpack-config');

module.exports = async function (env, argv) {
  // Transpile the shared workspace packages. @skintyee/api-client + /models ship
  // raw TypeScript (main: src/index.ts) so the Next.js website (transpilePackages)
  // and this app can share one source. Expo's webpack only babel-transpiles app
  // code by default, so without this it fails: "Module parse failed: Unexpected
  // token … export interface …". This is the webpack equivalent of next.config's
  // transpilePackages.
  env.babel = env.babel || {};
  env.babel.dangerouslyAddModulePathsToTranspile = [
    ...(env.babel.dangerouslyAddModulePathsToTranspile || []),
    '@skintyee/api-client',
    '@skintyee/models',
  ];

  const config = await createExpoWebpackConfigAsync(env, argv);

  // Find the source-map-loader rule (it's nested inside a `oneOf` block on
  // some Expo SDK versions, top-level on others) and add a node_modules
  // exclusion to it.
  const visit = (rules) => {
    if (!Array.isArray(rules)) return;
    for (const rule of rules) {
      if (rule.oneOf) visit(rule.oneOf);
      if (typeof rule.loader === 'string' && rule.loader.includes('source-map-loader')) {
        rule.exclude = /node_modules/;
      }
      if (Array.isArray(rule.use)) {
        for (const useEntry of rule.use) {
          if (typeof useEntry === 'string' && useEntry.includes('source-map-loader')) {
            rule.exclude = /node_modules/;
          }
          if (typeof useEntry === 'object' && useEntry?.loader?.includes?.('source-map-loader')) {
            rule.exclude = /node_modules/;
          }
        }
      }
    }
  };
  visit(config.module?.rules ?? []);

  // Also silence the resulting warning chatter — webpack still emits
  // warnings about missing source maps even when source-map-loader is
  // excluded.
  config.ignoreWarnings = [
    ...(config.ignoreWarnings ?? []),
    /Failed to parse source map/,
    /ENOENT: no such file or directory/,
  ];

  // Electron build: emit RELATIVE asset paths so the bundle loads from
  // web-build/index.html over file://. The normal web deploy (Azure Static Web
  // Apps) keeps absolute paths, so this is gated behind ELECTRON_BUILD.
  if (process.env.ELECTRON_BUILD === '1') {
    config.output = config.output || {};
    config.output.publicPath = './';
  }

  return config;
};
