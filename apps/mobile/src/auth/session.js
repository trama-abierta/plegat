import {apiFetch, apiUrl} from '../api/client';
import {clearTokens, loadTokens} from './tokenStore';

export async function restoreSession() {
  try {
    if (!(await loadTokens())) return false;
    const response = await apiFetch('/api/v1/me');
    return response.ok;
  } catch {
    return false;
  }
}

export async function signOut() {
  const tokens = await loadTokens();
  try {
    if (tokens?.refreshToken) {
      await fetch(apiUrl('/oauth/revoke'), {
        method: 'POST',
        headers: {'content-type': 'application/json'},
        body: JSON.stringify({
          client_id: 'plegat-mobile',
          token: tokens.refreshToken,
          token_type_hint: 'refresh_token',
        }),
      });
    }
  } finally {
    await clearTokens();
  }
}
