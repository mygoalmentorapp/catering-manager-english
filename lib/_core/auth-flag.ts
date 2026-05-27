import AsyncStorage from "@react-native-async-storage/async-storage";

const AUTH_FLAG_KEY = "app:user_is_logged_in";

/**
 * Set the persistent auth flag — indicates user has successfully authenticated.
 * This flag is only cleared on explicit sign-out (SIGNED_OUT event or signOut() call).
 * It prevents the app from redirecting to login when Supabase's internal state
 * gets confused after a failed token refresh (warm restart after 1-2h in background).
 */
export async function setAuthFlag(): Promise<void> {
  await AsyncStorage.setItem(AUTH_FLAG_KEY, "true");
}

/**
 * Clear the persistent auth flag — only call on explicit logout.
 */
export async function clearAuthFlag(): Promise<void> {
  await AsyncStorage.removeItem(AUTH_FLAG_KEY);
}

/**
 * Check if the auth flag is set — returns true if user was previously authenticated
 * and hasn't explicitly signed out.
 */
export async function getAuthFlag(): Promise<boolean> {
  const val = await AsyncStorage.getItem(AUTH_FLAG_KEY);
  return val === "true";
}
