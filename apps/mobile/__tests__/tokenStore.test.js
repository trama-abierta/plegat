/* global jest, test, expect, beforeEach */
import * as Keychain from 'react-native-keychain';
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

beforeEach(async () => {
  await clearTokens();
});

test('stores both tokens as one protected credential and reads them back', async () => {
  await saveTokens({accessToken: 'access-one', refreshToken: 'refresh-one'});

  expect(await loadTokens()).toEqual({
    accessToken: 'access-one',
    refreshToken: 'refresh-one',
  });
  expect(Keychain.getGenericPassword).toHaveBeenCalledWith({
    service: 'com.plegat.mobile.tokens',
  });
});

test('clearing the service removes the complete session', async () => {
  await saveTokens({accessToken: 'access-one', refreshToken: 'refresh-one'});
  await clearTokens();

  expect(await loadTokens()).toBeNull();
});

test('rejects incomplete credentials before writing them', async () => {
  await expect(saveTokens({accessToken: 'access-only'})).rejects.toThrow(
    'Tokens no válidos',
  );
  expect(await loadTokens()).toBeNull();
});
