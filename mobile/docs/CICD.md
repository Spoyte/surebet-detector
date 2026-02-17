# Surebet Mobile CI/CD Documentation

## Overview

This document describes the continuous integration and deployment pipeline for the Surebet Mobile application.

## Workflows

### 1. Main CI/CD Pipeline (`ci-cd.yml`)

Triggered on push to `main`/`develop` branches and pull requests.

#### Stages:

1. **Code Quality**
   - ESLint
   - TypeScript type checking
   - Unit tests with coverage
   - Coverage upload to Codecov

2. **iOS Build**
   - Runs on macOS
   - Installs dependencies and CocoaPods
   - Sets up code signing with certificates
   - Builds archive and exports IPA
   - Uploads IPA artifact

3. **Android Build**
   - Runs on Ubuntu
   - Installs dependencies
   - Decodes keystore
   - Builds signed APK and AAB
   - Uploads artifacts

4. **E2E Tests** (PR only)
   - Runs Detox tests on iOS simulator
   - Captures screenshots/videos on failure

5. **Deploy iOS to TestFlight** (main branch only)
   - Uploads IPA to App Store Connect
   - Available to internal testers

6. **Deploy Android to Play Store Internal** (main branch only)
   - Uploads AAB to Google Play
   - Available to internal testers

7. **Create GitHub Release** (tags only)
   - Creates release with IPA and APK
   - Auto-generates release notes

### 2. EAS Build (`eas-build.yml`)

Alternative build pipeline using Expo Application Services.

#### Features:
- Cloud builds for iOS and Android
- Automatic code signing
- Over-the-air updates
- Store submission

#### Build Profiles:
- **development**: Development client build
- **preview**: Internal distribution build
- **production**: Production build for stores

### 3. E2E Tests (`e2e-tests.yml`)

Runs on every PR affecting mobile code.

## Required Secrets

### GitHub Secrets

| Secret | Description |
|--------|-------------|
| `IOS_CERTIFICATE` | Base64-encoded iOS distribution certificate |
| `IOS_CERTIFICATE_PASSWORD` | Certificate password |
| `IOS_PROVISIONING_PROFILE` | Base64-encoded provisioning profile |
| `IOS_KEYCHAIN_PASSWORD` | Temporary keychain password |
| `ANDROID_KEYSTORE` | Base64-encoded Android keystore |
| `ANDROID_KEYSTORE_PASSWORD` | Keystore password |
| `ANDROID_KEY_ALIAS` | Key alias |
| `ANDROID_KEY_PASSWORD` | Key password |
| `APPLE_API_KEY_ID` | App Store Connect API key ID |
| `APPLE_API_ISSUER_ID` | App Store Connect issuer ID |
| `APPLE_API_KEY` | Base64-encoded API key |
| `GOOGLE_PLAY_SERVICE_ACCOUNT` | Google Play service account JSON |
| `EXPO_TOKEN` | Expo access token |

### Environment Variables

| Variable | Description |
|----------|-------------|
| `SENTRY_DSN` | Sentry error tracking DSN |
| `API_BASE_URL` | Backend API URL |
| `WS_BASE_URL` | WebSocket URL |

## Local Development

### Running E2E Tests Locally

```bash
cd mobile

# Install Detox CLI
npm install -g detox-cli

# Build for testing
detox build --configuration ios

# Run tests
detox test --configuration ios

# Run with artifacts
detox test --configuration ios --artifacts-location ./artifacts
```

### EAS Build Locally

```bash
# Login to Expo
eas login

# Build for development
eas build --platform ios --profile development

# Build for production
eas build --platform all --profile production

# Submit to stores
eas submit --platform ios --latest
eas submit --platform android --latest
```

## Release Process

### Standard Release

1. Create a release branch:
   ```bash
   git checkout -b release/v1.2.0
   ```

2. Update version in `package.json` and `app.json`

3. Update `CHANGELOG.md`

4. Create PR and merge to `main`

5. Tag the release:
   ```bash
   git tag -a v1.2.0 -m "Release v1.2.0"
   git push origin v1.2.0
   ```

6. CI/CD automatically:
   - Builds iOS and Android
   - Deploys to TestFlight and Play Store Internal
   - Creates GitHub Release

### Hotfix Release

1. Create hotfix branch from `main`:
   ```bash
   git checkout -b hotfix/v1.2.1 main
   ```

2. Apply fix and update patch version

3. Create PR and merge

4. Tag with patch version

## Build Artifacts

Artifacts are retained for 30 days and include:
- iOS IPA files
- Android APK and AAB files
- E2E test screenshots/videos
- Code coverage reports

## Monitoring

- **Build Status**: Check GitHub Actions tab
- **Test Results**: View in PR checks
- **Coverage**: View on Codecov
- **Crash Reports**: Sentry dashboard
- **Store Status**: App Store Connect and Google Play Console