import { Platform } from "react-native";
import { Asset } from "expo-asset";

/**
 * Convert an image URI (local file or bundled asset) to a base64 data URI
 * suitable for embedding in HTML for expo-print.
 *
 * On iOS, WKWebView cannot render local file:// URIs in print HTML,
 * so we must convert to base64 data URIs.
 */
export async function imageUriToBase64(uri: string): Promise<string> {
  try {
    if (Platform.OS === "web") {
      // On web, we can use fetch + FileReader
      const response = await fetch(uri);
      const blob = await response.blob();
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
    }

    // On native, use expo-file-system
    const FileSystem = require("expo-file-system/legacy");
    const base64 = await FileSystem.readAsStringAsync(uri, {
      encoding: FileSystem.EncodingType.Base64 });
    return `data:image/png;base64,${base64}`;
  } catch (e) {
    console.warn("Failed to convert image to base64:", e);
    return "";
  }
}

/**
 * Get the default app icon as a base64 data URI.
 */
export async function getDefaultLogoBase64(): Promise<string> {
  try {
    const asset = Asset.fromModule(require("@/assets/images/icon.png"));
    await asset.downloadAsync();
    if (!asset.localUri) return "";
    return imageUriToBase64(asset.localUri);
  } catch (e) {
    console.warn("Failed to load default logo:", e);
    return "";
  }
}
