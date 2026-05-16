/**
 * Simple UUID v4 generator that works on all platforms (web, iOS, Android)
 * without requiring crypto.getRandomValues() polyfill.
 */
export function generateId(): string {
  const timestamp = Date.now().toString(36);
  const randomPart = Math.random().toString(36).substring(2, 10);
  const randomPart2 = Math.random().toString(36).substring(2, 10);
  return `${timestamp}-${randomPart}-${randomPart2}`;
}
