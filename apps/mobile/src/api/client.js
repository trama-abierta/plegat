import {Platform} from 'react-native';
import {clearTokens, loadTokens, saveTokens} from '../auth/tokenStore';

const CLIENT_ID = 'plegat-mobile';
const DEFAULT_ORIGIN = Platform.OS === 'android'
  ? 'http://10.0.2.2:3000'
  : 'http://127.0.0.1:3000';
let origin = DEFAULT_ORIGIN;
let refreshPromise = null;

export function setApiOrigin(value) {
  if (typeof value !== 'string' || !/^https?:\/\/[^/]+\/?$/.test(value)) {
    throw new Error('Origen API no válido');
  }
  origin = value.replace(/\/$/, '');
}

export function apiUrl(path) {
  if (typeof path !== 'string' || !path.startsWith('/') || path.startsWith('//')) {
    throw new Error('Ruta API no válida');
  }
  return `${origin}${path}`;
}

async function refreshTokens(tokens) {
  const response = await fetch(apiUrl('/oauth/token'), {
    method: 'POST',
    headers: {'content-type': 'application/json'},
    body: JSON.stringify({
      grant_type: 'refresh_token',
      client_id: CLIENT_ID,
      refresh_token: tokens.refreshToken,
    }),
  });
  if (!response.ok) {
    if (response.status === 400 || response.status === 401) await clearTokens();
    return null;
  }
  const data = await response.json();
  const next = {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
  };
  await saveTokens(next);
  return next;
}

function refreshOnce(tokens) {
  if (!refreshPromise) {
    refreshPromise = refreshTokens(tokens).finally(() => {
      refreshPromise = null;
    });
  }
  return refreshPromise;
}

function request(path, options, accessToken) {
  const headers = new Headers(options.headers || {});
  headers.set('authorization', `Bearer ${accessToken}`);
  return fetch(apiUrl(path), {...options, headers});
}

export async function apiFetch(path, options = {}) {
  apiUrl(path);
  const tokens = await loadTokens();
  if (!tokens) throw new Error('Sesión no iniciada');
  const response = await request(path, options, tokens.accessToken);
  if (response.status !== 401) return response;

  const latest = await loadTokens();
  if (!latest) return response;
  const next = latest.accessToken !== tokens.accessToken
    ? latest
    : await refreshOnce(latest);
  if (!next) return response;
  return request(path, options, next.accessToken);
}
