/* global jest, test, expect, beforeEach, afterEach */
import * as Keychain from 'react-native-keychain';
import {apiFetch} from '../src/api/client';
import {restoreSession} from '../src/auth/session';
import {clearTokens, loadTokens, saveTokens} from '../src/auth/tokenStore';

jest.mock('react-native-keychain', () => {
  let credential = null;
  return {
    setGenericPassword: jest.fn(async (username, password, options) => {
      credential = {username, password, service: options.service};
      return {service: options.service, storage: 'Keystore'};
    }),
    getGenericPassword: jest.fn(async ({service}) =>
      credential?.service === service ? {...credential} : false,
    ),
    resetGenericPassword: jest.fn(async ({service}) => {
      if (credential?.service === service) credential = null;
      return true;
    }),
  };
});

const originalFetch = global.fetch;
const reply = (status, body = {}) => ({
  status,
  ok: status >= 200 && status < 300,
  json: async () => body,
});

beforeEach(async () => {
  await clearTokens();
});

afterEach(() => {
  global.fetch = originalFetch;
  jest.restoreAllMocks();
});

test('a 401 refreshes once, rotates both tokens, and returns the retried response', async () => {
  await saveTokens({accessToken: 'expired-access', refreshToken: 'valid-refresh'});
  const original = reply(401);
  const success = reply(200, {user: {name: 'Laia'}});
  const requests = [];
  global.fetch = jest.fn(async (url, options) => {
    requests.push({
      url,
      authorization: new Headers(options.headers).get('authorization'),
      body: options.body,
    });
    if (url.endsWith('/oauth/token')) {
      return reply(200, {access_token: 'new-access', refresh_token: 'new-refresh'});
    }
    return requests.filter(request => request.url.endsWith('/api/v1/me')).length === 1
      ? original
      : success;
  });

  expect(await apiFetch('/api/v1/me')).toBe(success);
  expect(await loadTokens()).toEqual({
    accessToken: 'new-access',
    refreshToken: 'new-refresh',
  });
  expect(requests).toHaveLength(3);
  expect(requests[0].authorization).toBe('Bearer expired-access');
  expect(JSON.parse(requests[1].body)).toEqual({
    grant_type: 'refresh_token',
    client_id: 'plegat-mobile',
    refresh_token: 'valid-refresh',
  });
  expect(requests[2].authorization).toBe('Bearer new-access');
});

test('invalid refresh clears the session and does not retry repeatedly', async () => {
  await saveTokens({accessToken: 'expired-access', refreshToken: 'bad-refresh'});
  const original = reply(401);
  global.fetch = jest.fn(async url =>
    url.endsWith('/oauth/token') ? reply(400, {error: 'invalid_grant'}) : original,
  );

  expect(await apiFetch('/api/v1/me')).toBe(original);
  expect(await loadTokens()).toBeNull();
  expect(global.fetch).toHaveBeenCalledTimes(2);
  expect(await restoreSession()).toBe(false);
});

test('restores a valid stored session by checking the profile endpoint', async () => {
  await saveTokens({accessToken: 'live-access', refreshToken: 'live-refresh'});
  global.fetch = jest.fn(async () => reply(200, {user: {name: 'Laia'}}));

  expect(await restoreSession()).toBe(true);
});

test('session restoration returns false when protected storage is unavailable', async () => {
  Keychain.getGenericPassword.mockRejectedValueOnce(new Error('Keychain locked'));

  expect(await restoreSession()).toBe(false);
});

test('a refresh network error preserves stored tokens for a later retry', async () => {
  await saveTokens({accessToken: 'expired-access', refreshToken: 'valid-refresh'});
  global.fetch = jest.fn(async url => {
    if (url.endsWith('/oauth/token')) throw new Error('Network offline');
    return reply(401);
  });

  await expect(apiFetch('/api/v1/me')).rejects.toThrow('Network offline');
  expect(await loadTokens()).toEqual({
    accessToken: 'expired-access',
    refreshToken: 'valid-refresh',
  });
});
