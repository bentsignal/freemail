const { withInfoPlist } = require("expo/config-plugins");

const MAILTO_URL_TYPE = { CFBundleURLSchemes: ["mailto"] };

// iOS only offers the app as the default mail app once Apple also grants
// com.apple.developer.mail-client; see docs/default-mail-app.md. Not
// `ios.scheme`: expo-linking warns about, and could pick, a second scheme.
function withIosMailtoScheme(config) {
  return withInfoPlist(config, (config) => {
    const urlTypes = config.modResults.CFBundleURLTypes ?? [];
    config.modResults.CFBundleURLTypes = [...urlTypes, MAILTO_URL_TYPE];
    return config;
  });
}

module.exports = withIosMailtoScheme;
