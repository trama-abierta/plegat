import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-shell';

const API_ORIGIN = import.meta.env.VITE_PLEGAT_API_ORIGIN || 'http://127.0.0.1:3000';
const WEB_ORIGIN = import.meta.env.VITE_PLEGAT_WEB_ORIGIN || (import.meta.env.DEV ? 'http://127.0.0.1:5173' : API_ORIGIN);
const CLIENT_ID = 'plegat-desktop';
const REDIRECT_URI = 'plegat://oauth/callback';
let accessToken = null;
let refreshToken = null;

function base64Url(bytes) {
  let binary = '';
  bytes.forEach((value) => { binary += String.fromCharCode(value); });
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function randomString(size = 32) {
  const bytes = new Uint8Array(size);
  crypto.getRandomValues(bytes);
  return base64Url(bytes);
}

async function challengeFor(verifier) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  return base64Url(new Uint8Array(digest));
}

export function apiOrigin() { return API_ORIGIN; }
export function webOrigin() { return WEB_ORIGIN; }
export function token() { return accessToken; }

export async function beginLogin() {
  const verifier = randomString(48);
  const state = randomString(24);
  const challenge = await challengeFor(verifier);
  await invoke('save_oauth_state', { stateValue: state, verifier });
  const query = new URLSearchParams({ response_type: 'code', client_id: CLIENT_ID, redirect_uri: REDIRECT_URI, code_challenge: challenge, code_challenge_method: 'S256', state, desktop_hint: '1' });
  await open(`${API_ORIGIN}/oauth/authorize?${query}`);
}

export async function completeLogin(callbackUrl) {
  const url = new URL(callbackUrl);
  const error = url.searchParams.get('error');
  if (error) throw new Error(url.searchParams.get('error_description') || error);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const saved = await invoke('take_oauth_state');
  if (!code || !state || !saved || saved.state !== state) throw new Error('Respuesta OAuth no válida');
  const response = await fetch(`${API_ORIGIN}/oauth/token`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ grant_type: 'authorization_code', client_id: CLIENT_ID, redirect_uri: REDIRECT_URI, code, code_verifier: saved.verifier }) });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error_description || data.message || 'No se pudo iniciar sesión');
  accessToken = data.access_token;
  refreshToken = data.refresh_token;
  await invoke('save_refresh_token', { token: refreshToken });
  return data;
}

export async function restoreSession() {
  refreshToken = await invoke('load_refresh_token');
  if (!refreshToken) return false;
  const response = await fetch(`${API_ORIGIN}/oauth/token`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ grant_type: 'refresh_token', client_id: CLIENT_ID, refresh_token: refreshToken }) });
  if (!response.ok) { await signOut(); return false; }
  const data = await response.json();
  accessToken = data.access_token;
  refreshToken = data.refresh_token;
  await invoke('save_refresh_token', { token: refreshToken });
  return true;
}

export async function signOut() {
  if (refreshToken) await fetch(`${API_ORIGIN}/oauth/revoke`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ client_id: CLIENT_ID, token: refreshToken, token_type_hint: 'refresh_token' }) }).catch(() => {});
  accessToken = null;
  refreshToken = null;
  await invoke('delete_refresh_token');
}

export async function apiFetch(path, options = {}) {
  if (!accessToken && !(await restoreSession())) throw new Error('Sesión no iniciada');
  const headers = new Headers(options.headers || {});
  headers.set('authorization', `Bearer ${accessToken}`);
  if (options.body && !headers.has('content-type')) headers.set('content-type', 'application/json');
  const response = await fetch(`${API_ORIGIN}${path}`, { ...options, headers });
  if (response.status === 401 && refreshToken) {
    accessToken = null;
    if (await restoreSession()) return apiFetch(path, options);
  }
  return response;
}
