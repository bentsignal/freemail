import type { ConfigContext, ExpoConfig } from "expo/config";

/**
 * `APP_VARIANT=development` builds "Freemail Dev": its own bundle ID, name,
 * scheme, and icon, so the phone dev client (scripts/phone.sh) installs next
 * to the everyday Freemail build. Without it the config is unchanged. See
 * docs/phone-testing.md.
 */
const dev = process.env.APP_VARIANT === "development";
const BUNDLE_ID = dev
  ? "com.bentsignal.rodgemail.dev"
  : "com.bentsignal.rodgemail";

export default ({ config }: ConfigContext): ExpoConfig => {
  const buildProfile = process.env.EAS_BUILD_PROFILE;
  if (buildProfile && !buildProfile.startsWith("development")) {
    throw new Error(
      `Freemail only has development builds configured; received EAS profile "${buildProfile}"`,
    );
  }

  return {
    ...config,
    name: dev ? "Freemail Dev" : "Freemail",
    slug: "rodge-mail",
    owner: "directedbyshawn",
    scheme: dev ? "rodge-mail-dev" : "rodge-mail",
    version: "0.1.0",
    orientation: "portrait",
    icon: "./assets/icon.png",
    userInterfaceStyle: "automatic",
    updates: {
      fallbackToCacheTimeout: 0,
    },
    assetBundlePatterns: ["**/*"],
    extra: {
      ...config.extra,
      deploymentEnvironment: "development",
      ...(dev ? { appVariant: "development" } : {}),
      eas: {
        projectId: "4273bb9c-b86a-419b-8b0a-ac4180f0b9bd",
      },
    },
    ios: {
      associatedDomains: ["webcredentials:dazzling-dog-633.convex.site"],
      bundleIdentifier: BUNDLE_ID,
      supportsTablet: true,
      // Liquid Glass icon from Icon Composer; see assets/icons/README.md.
      icon: dev
        ? "./assets/icons/freemail-dev.icon"
        : "./assets/icons/freemail.icon",
      infoPlist: {
        ITSAppUsesNonExemptEncryption: false,
      },
    },
    android: {
      package: BUNDLE_ID,
      adaptiveIcon: {
        backgroundImage: dev
          ? "./assets/icons/freemail-dev-android-background.png"
          : "./assets/icons/freemail-android-background.png",
        foregroundImage: "./assets/icons/freemail-android-foreground.png",
        monochromeImage: "./assets/icons/freemail-android-monochrome.png",
      },
    },
    experiments: {
      tsconfigPaths: true,
      typedRoutes: true,
      reactCompiler: true,
    },
    plugins: [
      "expo-router",
      [
        "expo-notifications",
        {
          color: "#000000",
          icon: "./assets/icons/freemail-android-notification.png",
          defaultChannel: "new-mail",
          enableBackgroundRemoteNotifications: true,
        },
      ],
      "./expo-plugins/with-ios-notification-quick-actions.cjs",
      "expo-secure-store",
      "expo-web-browser",
      "expo-system-ui",
      [
        "expo-build-properties",
        {
          ios: {
            deploymentTarget: "16.4",
          },
        },
      ],
      "./expo-plugins/with-ios-scene-lifecycle.cjs",
      "./expo-plugins/with-ios-mailto-scheme.cjs",
      "./expo-plugins/with-ios-pods-deployment-target.cjs",
      [
        "expo-image-picker",
        {
          photosPermission:
            "Allow Freemail to access photos you choose to attach to email.",
        },
      ],
      "./expo-plugins/with-android-network-security.cjs",
      [
        "expo-splash-screen",
        {
          // A blank splash in the app's background color. The image is a
          // transparent pixel: without one, the plugin leaves iOS
          // constraints and an Android drawable pointing at nothing.
          backgroundColor: "#ffffff",
          image: "./assets/splash-blank.png",
          imageWidth: 1,
          dark: {
            backgroundColor: "#000000",
            image: "./assets/splash-blank.png",
          },
        },
      ],
    ],
  };
};
