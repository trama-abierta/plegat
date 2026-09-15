import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';

export function randomSecret(bytes = 32) {
  return randomBytes(bytes).toString('base64url');
}

export function hashSecret(value) {
  return createHash('sha256').update(String(value)).digest('hex');
}

export function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

export function verifyPkce(verifier, challenge, method = 'S256') {
  if (!verifier || !challenge || method !== 'S256') return false;
  const actual = createHash('sha256').update(verifier).digest('base64url');
  const left = Buffer.from(actual);
  const right = Buffer.from(challenge);
  return left.length === right.length && timingSafeEqual(left, right);
}

export function oauthError(error, description) {
  return { error, error_description: description };
}

export function authorizationCodeId() {
  return `oauth_${randomUUID()}`;
}

export function sessionToken() {
  return randomSecret(32);
}
