// Learn more https://docs.expo.io/guides/customizing-metro
// Monorepo config: this app lives in a pnpm workspace, so Metro must watch the
// workspace root and resolve modules from both the app and the root node_modules
// (that's where hoisted deps like @babel/runtime live). Without this, native
// (Metro) bundling fails to resolve workspace-root dependencies.
const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '..');

const config = getDefaultConfig(projectRoot);

config.watchFolders = [workspaceRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];
config.resolver.disableHierarchicalLookup = true;

module.exports = config;
