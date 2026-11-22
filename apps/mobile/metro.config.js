const { getDefaultConfig } = require("expo/metro-config");
const { withUniwindConfig } = require("uniwind/metro");
const path = require("node:path");

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, "../..");

const config = getDefaultConfig(projectRoot, {
  isCSSEnabled: true,
});

config.watchFolders = [...(config.watchFolders ?? []), workspaceRoot];

config.resolver.nodeModulesPaths = [
  ...(config.resolver.nodeModulesPaths ?? []),
  path.resolve(projectRoot, "node_modules"),
  path.resolve(workspaceRoot, "node_modules"),
];

config.resolver.unstable_enablePackageExports = true;

// One lucide icon per module (src/components/icons.ts), which the package's
// exports map doesn't list.
const lucideIconPrefix = "lucide-react-native/icons/";
const lucideIcons = path.join(
  path.dirname(
    require.resolve("lucide-react-native", { paths: [projectRoot] }),
  ),
  "../esm/icons",
);
const resolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName.startsWith(lucideIconPrefix)) {
    const icon = moduleName.slice(lucideIconPrefix.length);
    if (/^[a-z0-9-]+$/u.test(icon)) {
      return {
        filePath: path.join(lucideIcons, `${icon}.js`),
        type: "sourceFile",
      };
    }
  }
  return (resolveRequest ?? context.resolveRequest)(
    context,
    moduleName,
    platform,
  );
};

/** @type {import('expo/metro-config').MetroConfig} */
module.exports = withUniwindConfig(config, {
  cssEntryFile: "./src/styles.css",
  dtsFile: "./uniwind-types.d.ts",
});
