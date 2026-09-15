/* global jest, test, expect, beforeEach */
import {Linking} from 'react-native';
import * as Keychain from 'react-native-keychain';
import {sha256} from 'js-sha256';
import {beginLogin, completeLogin} from '../src/auth/oauth';
import {loadTokens} from '../src/auth/tokenStore';

jest.mock('react-native-get-random-values', () => ({}));

jest.mock('react-native-keychain', () => {
  const credentials = new Map();
  return {
    setGenericPassword: jest.fn(async (username, password, {service}) => {
      credentials.set(service, {username, password});
      return {service};
    }),
    getGenericPassword: jest.fn(async ({service}) => credentials.get(service) || false),
    resetGenericPassword: jest.fn(async ({service}) => {
      credentials.delete(service);
      return true;
    }),
  };
});

beforeEach(() => {
  jest.clearAllMocks();
  global.crypto = {getRandomValues: jest.fn(bytes => {
    for (let i = 0; i < bytes.length; i++) bytes[i] = i + 1;
    return bytes;
  })};
  global.fetch = jest.fn(async () => ({
    ok: true,
    json: async () => ({access_token: 'access-one', refresh_token: 'refresh-one'}),
  }));
  Linking.openURL = jest.fn(async () => true);
});

test('opens authorization with S256 challenge, public client and random state', async () => {
  await beginLogin();
  const url = new URL(Linking.openURL.mock.calls[0][0]);
  const pending = JSON.parse((await Keychain.getGenericPassword({service: 'com.plegat.mobile.oauth.pending'})).password);
  expect(url.pathname).toBe('/oauth/authorize');
  expect(url.searchParams.get('client_id')).toBe('plegat-mobile');
  expect(url.searchParams.get('redirect_uri')).toBe('plegat://oauth/callback');
  expect(url.searchParams.get('state')).toBe(pending.state);
  expect(url.searchParams.get('code_challenge_method')).toBe('S256');
  expect(url.searchParams.get('code_challenge')).not.toBe(pending.verifier);
  expect(url.searchParams.get('code_challenge')).toBe(Buffer.from(sha256.array(pending.verifier)).toString('base64url'));
  expect(global.crypto.getRandomValues).toHaveBeenCalledTimes(2);
});

test('exchanges only matching callback and writes tokens to protected storage', async () => {
  await beginLogin();
  const state = new URL(Linking.openURL.mock.calls[0][0]).searchParams.get('state');
  await completeLogin(`plegat://oauth/callback?code=auth-code&state=${state}`);
  const body = JSON.parse(global.fetch.mock.calls[0][1].body);
  expect(body).toMatchObject({grant_type: 'authorization_code', client_id: 'plegat-mobile', code: 'auth-code', redirect_uri: 'plegat://oauth/callback'});
  expect(body.code_verifier).toBeTruthy();
  expect(await loadTokens()).toEqual({accessToken: 'access-one', refreshToken: 'refresh-one'});
  await expect(completeLogin(`plegat://oauth/callback?code=auth-code&state=${state}`)).rejects.toThrow('Respuesta OAuth no válida');
});

test('rejects missing code, missing state, wrong state and wrong callback without token request', async () => {
  await beginLogin();
  const state = new URL(Linking.openURL.mock.calls[0][0]).searchParams.get('state');
  await expect(completeLogin(`plegat://oauth/callback?state=${state}`)).rejects.toThrow('Respuesta OAuth no válida');
  await beginLogin();
  await expect(completeLogin('plegat://oauth/callback?code=one')).rejects.toThrow('Respuesta OAuth no válida');
  await beginLogin();
  await expect(completeLogin('plegat://oauth/callback?code=one&state=wrong')).rejects.toThrow('Respuesta OAuth no válida');
  await expect(completeLogin('plegat://evil/callback?code=one&state=wrong')).rejects.toThrow('Respuesta OAuth no válida');
  expect(global.fetch).not.toHaveBeenCalled();
});
