import { Alert, Linking } from "react-native";
import { router } from "expo-router";
import * as WebBrowser from "expo-web-browser";

import { isMailtoUrl, mailtoComposeHref } from "./mailto";

const WEB_LINK = /^https?:/iu;

let isBrowserOpen = false;

export async function openEmailLink(url: string) {
  if (isMailtoUrl(url)) {
    router.push(mailtoComposeHref(url));
    return;
  }
  if (!WEB_LINK.test(url)) {
    await Linking.openURL(url).catch(() =>
      Alert.alert("Couldn’t open link", url),
    );
    return;
  }
  if (isBrowserOpen) return;
  isBrowserOpen = true;
  try {
    await WebBrowser.openBrowserAsync(url, {
      presentationStyle: WebBrowser.WebBrowserPresentationStyle.PAGE_SHEET,
    });
  } catch {
    Alert.alert("Couldn’t open link", url);
  }
  isBrowserOpen = false;
}
