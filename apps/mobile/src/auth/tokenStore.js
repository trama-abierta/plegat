import * as Keychain from 'react-native-keychain';

const SERVICE = 'com.plegat.mobile.tokens';
const ACCOUNT = 'plegat-session';

export async function saveTokens({accessToken, refreshToken} = {}) {
  if (
    typeof accessToken !== 'string' ||
    !accessToken ||
    typeof refreshToken !== 'string' ||
    !refreshToken
  ) {
    throw new Error('Tokens no válidos');
  }
  const saved = await Keychain.setGenericPassword(
    ACCOUNT,
    JSON.stringify({accessToken, refreshToken}),
    {service: SERVICE},
  );
  if (!saved) throw new Error('No se pudo guardar la sesión');
}

export async function loadTokens() {
  const credential = await Keychain.getGenericPassword({service: SERVICE});
  if (!credential) return null;
  try {
    const tokens = JSON.parse(credential.password);
    if (
      typeof tokens.accessToken === 'string' &&
      tokens.accessToken &&
      typeof tokens.refreshToken === 'string' &&
      tokens.refreshToken
    ) {
      return {accessToken: tokens.accessToken, refreshToken: tokens.refreshToken};
    }
  } catch {
    // A malformed old credential cannot be used for a session.
  }
  await clearTokens();
  return null;
}

export async function clearTokens() {
  const cleared = await Keychain.resetGenericPassword({service: SERVICE});
  if (!cleared) throw new Error('No se pudo borrar la sesión');
}
