import { describe, expect, it } from 'vitest';

describe('EXPO_PUBLIC_API_BASE_URL', () => {
  it('should be set and reachable', async () => {
    const url = process.env.EXPO_PUBLIC_API_BASE_URL;
    expect(url).toBeDefined();
    expect(url).not.toBe('');
    // Test that the API endpoint responds using auth.me (GET query)
    const res = await fetch(url + '/api/trpc/auth.me', {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    });
    // Should get 200 (returns null user when no auth) — proves the endpoint exists
    expect([200, 401]).toContain(res.status);
  });
});
