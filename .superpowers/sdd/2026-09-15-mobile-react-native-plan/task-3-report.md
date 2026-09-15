# Task 3 report — OAuth PKCE and deep links

## Status

Implemented Authorization Code + PKCE login for the React Native CLI mobile app. The public client is `plegat-mobile` and its exact redirect URI is `plegat://oauth/callback`. No attendance screens or offline punches were added.

## Implementation

- `apps/mobile/src/auth/oauth.js` exports `beginLogin()` and `completeLogin(url)`. Login generates cryptographically random `state` and `code_verifier` using `react-native-get-random-values`, computes a SHA-256 S256 challenge, stores the pending pair under a dedicated Keychain service, and opens the backend authorization URL with React Native Linking.
- Callback handling checks the exact redirect URI, requires both `state` and `code`, consumes the pending Keychain record, and rejects a mismatched state before posting the authorization code and verifier to `/oauth/token`. Successful tokens are saved through the Task 2 `saveTokens()` interface. Consuming the state prevents replay.
- `apps/mobile/App.js` subscribes to `Linking` events and calls `getInitialURL()` for an app launched from a deep link. It includes a login button and displays success/error feedback while keeping the existing shell.
- The Android manifest registers an exported `VIEW` intent for `plegat://oauth/callback`; iOS `Info.plist` registers the `plegat` scheme, and `AppDelegate.swift` forwards opened URLs to `RCTLinkingManager`.
- `apps/backend/migrations/017_oauth_mobile.sql` registers the public OAuth client using the existing SQL migration pattern. The in-memory backend store recognizes it for development without a database. The existing token/session endpoints accept this client ID.
- React and `react-test-renderer` were aligned with the root workspace's React 19.2.8 copy because the first hooked App test exposed duplicate React instances.

## Validation

- `npm run test -w @plegat/mobile -- --watch=false`: 4 suites, 14 tests passed. OAuth tests cover S256 challenge parameters, matching callback exchange, Keychain token storage, rejection of absent or incorrect state/code, incorrect redirect, and replay. App test covers cold-start and live Linking callbacks.
- `npm run bundle:android -w @plegat/mobile`: Metro bundle completed.
- `git diff --check` and `node --check apps/backend/src/store.js`: passed.

## Concerns

- Native Android/iOS builds and on-device deep-link delivery were not run in this environment; Android Metro bundling validates JavaScript only. `plutil` is unavailable, so the iOS plist was not machine-linted.
- The SQL migration was added but not applied to a live database here. Deployment must run backend migrations before mobile authorization works against a database-backed server.

## Review fix — custom scheme parsing

React Native 0.87 polyfills global `URL` with getters for `host` and `pathname` that only recognize HTTP(S) URLs. As a result, the original exact-redirect check rejected `plegat://oauth/callback` at runtime despite passing Node-backed Jest tests. `completeLogin()` now validates the raw URI prefix including the `?` delimiter, rejects fragments, and decodes only its query with `URLSearchParams`; the state/code and one-time Keychain checks are unchanged. A regression test replaces global `URL` with the custom-scheme behavior of the React Native polyfill. The test failed before the fix and passed afterward.
