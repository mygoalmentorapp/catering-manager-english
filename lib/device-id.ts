/**
 * Device identification utilities for Single Active Session.
 * Each app installation gets a persistent UUID stored in AsyncStorage.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";

const DEVICE_ID_KEY = "app_device_id_v1";

let cachedDeviceId: string | null = null;

/**
 * Get or create a persistent device UUID for this installation.
 */
export async function getDeviceId(): Promise<string> {
  if (cachedDeviceId) return cachedDeviceId;

  let id = await AsyncStorage.getItem(DEVICE_ID_KEY);
  if (!id) {
    id = generateUUID();
    await AsyncStorage.setItem(DEVICE_ID_KEY, id);
  }
  cachedDeviceId = id;
  return id;
}

/**
 * Get a human-readable device name.
 */
export function getDeviceName(): string {
  if (Platform.OS === "web") return "Web Browser";
  if (Platform.OS === "ios") return "iPhone";
  if (Platform.OS === "android") return "Android";
  return "Unknown Device";
}

/**
 * Get the device OS string.
 */
export function getDeviceOS(): string {
  return Platform.OS;
}

/**
 * Get device info bundle for registration.
 */
export function getDeviceInfo(): { deviceName: string; deviceOs: string } {
  return { deviceName: getDeviceName(), deviceOs: getDeviceOS() };
}

/**
 * Simple UUID v4 generator (no external dependency needed).
 */
function generateUUID(): string {
  const hex = "0123456789abcdef";
  let uuid = "";
  for (let i = 0; i < 36; i++) {
    if (i === 8 || i === 13 || i === 18 || i === 23) {
      uuid += "-";
    } else if (i === 14) {
      uuid += "4";
    } else if (i === 19) {
      uuid += hex[(Math.random() * 4) | 8];
    } else {
      uuid += hex[(Math.random() * 16) | 0];
    }
  }
  return uuid;
}
