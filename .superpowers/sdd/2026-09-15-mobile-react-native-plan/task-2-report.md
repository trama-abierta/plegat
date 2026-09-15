# Task 2 report — Mobile API and protected session

## Result

Added `react-native-keychain` 10.0.0 to `@plegat/mobile`. `saveTokens`, `loadTokens`, and `clearTokens` keep the access and refresh token together as one generic credential in the iOS Keychain / Android Keystore-backed module, under service `com.plegat.mobile.tokens`. Malformed or incomplete token pairs are rejected; no token is written to AsyncStorage or source files.

`apiFetch(path, options)` reads the protected token pair, adds `Authorization: Bearer ...`, returns the fetch Response, and on HTTP 401 posts a refresh-token grant to `/oauth/token` with client ID `plegat-mobile`. A valid response rotates both stored tokens and retries the original request once. An invalid grant clears the protected session; a network failure preserves it. Concurrent refresh attempts share one refresh operation. API paths are constrained to local absolute paths so callers cannot attach the bearer token to an arbitrary URL. `setApiOrigin(origin)` allows a later build/config layer to point to a device-reachable backend; emulator/simulator loopback origins are defaults.

`restoreSession()` checks `/api/v1/me` and always returns a boolean, including when protected storage or the network is unavailable. `signOut()` attempts `/oauth/revoke` and clears the local protected session in a `finally` block. No screens, OAuth callback UI, attendance actions, or offline queue were added.

## Validation

- Red phase: focused Jest tests failed against stub implementations for token storage, refresh, and restoration.
- Green phase: `npm run test -w @plegat/mobile -- --watch=false` — 3 suites, 9 tests passed.
- Focused ESLint for the new JavaScript sources and tests — exit 0.
- `npm run bundle:android -w @plegat/mobile` — Metro wrote the Android JS bundle; exit 0.
- `react-native config` — detected autolinked `react-native-keychain` and both native projects; exit 0.
- No TypeScript or Expo source files were introduced.

## Limits and concerns

The current in-memory backend OAuth client lookup recognizes `plegat-desktop` but not `plegat-mobile`. A mobile OAuth client registration is required before the forthcoming login/refresh integration can work; this task did not change backend contracts or build OAuth UI.

The Keychain native module has not been exercised in an APK/IPA on this host, which lacks JDK/Android SDK/Xcode/CocoaPods. Tests use an in-memory fake only at the native Keychain boundary and a controlled fetch fake. Metro retains the non-fatal `setup_env.sh EPERM` and React Native package-exports warnings already observed in Task 1.

Default API origins target local emulators; a device or production build must call `setApiOrigin` with its reachable backend origin. The secure token pair can survive a transient network failure, but `restoreSession()` correctly returns false until profile verification succeeds.
