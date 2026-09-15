import 'react-native-get-random-values';
import {Linking} from 'react-native';
import * as Keychain from 'react-native-keychain';
import {sha256} from 'js-sha256';
import {apiUrl} from '../api/client';
import {saveTokens} from './tokenStore';

const CLIENT_ID = 'plegat-mobile';
const REDIRECT_URI = 'plegat://oauth/callback';
const PENDING_SERVICE = 'com.plegat.mobile.oauth.pending';

function base64Url(bytes) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
  let result = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const value = (bytes[i] << 16) | ((bytes[i + 1] || 0) << 8) | (bytes[i + 2] || 0);
    result += alphabet[(value >>> 18) & 63] + alphabet[(value >>> 12) & 63];
    if (i + 1 < bytes.length) result += alphabet[(value >>> 6) & 63];
    if (i + 2 < bytes.length) result += alphabet[value & 63];
  }
  return result;
}

function randomString(length) {
  const bytes = new Uint8Array(length);
  if (!global.crypto?.getRandomValues) throw new Error('Generador seguro no disponible');
  global.crypto.getRandomValues(bytes);
  return base64Url(bytes);
}

async function savePending(state, verifier) {
  const saved = await Keychain.setGenericPassword('plegat-oauth', JSON.stringify({state, verifier}), {
    service: PENDING_SERVICE,
  });
  if (!saved) throw new Error('No se pudo guardar el estado OAuth');
}

async function takePending() {
  const credential = await Keychain.getGenericPassword({service: PENDING_SERVICE});
  if (!credential) return null;
  const cleared = await Keychain.resetGenericPassword({service: PENDING_SERVICE});
  if (!cleared) throw new Error('No se pudo borrar el estado OAuth');
  try {
    return JSON.parse(credential.password);
  } catch {
    return null;
  }
}

export async function beginLogin() {
  const verifier = randomString(48);
  const state = randomString(24);
  const challenge = base64Url(sha256.array(verifier));
  await savePending(state, verifier);
  const query = new URLSearchParams({
    response_type: 'code',
    client_id: CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    code_challenge: challenge,
    code_challenge_method: 'S256',
    state,
  });
  await Linking.openURL(apiUrl(`/oauth/authorize?${query.toString()}`));
}

export async function completeLogin(callbackUrl) {
  if (
    typeof callbackUrl !== 'string' ||
    !callbackUrl.startsWith(`${REDIRECT_URI}?`) ||
    callbackUrl.includes('#')
  ) {
    throw new Error('Respuesta OAuth no válida');
  }
  // React Native's URL polyfill only exposes host/pathname for http(s) URLs.
  const params = new URLSearchParams(callbackUrl.slice(REDIRECT_URI.length + 1));
  const state = params.get('state');
  const code = params.get('code');
  const pending = await takePending();
  if (!state || !code || !pending || pending.state !== state || !pending.verifier) {
    throw new Error('Respuesta OAuth no válida');
  }
  const response = await fetch(apiUrl('/oauth/token'), {
    method: 'POST',
    headers: {'content-type': 'application/json'},
    body: JSON.stringify({
      grant_type: 'authorization_code',
      client_id: CLIENT_ID,
      redirect_uri: REDIRECT_URI,
      code,
      code_verifier: pending.verifier,
    }),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error_description || data.message || 'No se pudo iniciar sesión');
  await saveTokens({accessToken: data.access_token, refreshToken: data.refresh_token});
  return data;
}
