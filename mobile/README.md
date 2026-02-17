# Surebet Detector Mobile App

A React Native mobile application for the Surebet Detector arbitrage betting platform.

## Features

- **🔐 Biometric Authentication**: Face ID / Touch ID support for secure access
- **🔔 Push Notifications**: Real-time alerts for high-value arbitrage opportunities
- **📊 Live Dashboard**: Track profits, active bets, and win rates with charts
- **⚡ Quick Bet Interface**: One-tap bet placement for mobile
- **🔍 Opportunity Scanner**: Browse and filter arbitrage opportunities
- **📈 Analytics**: Visual charts showing profit trends and sports distribution
- **💰 Bet Tracking**: Monitor all your bets with P/L tracking

## Tech Stack

- React Native with Expo
- React Navigation (Bottom Tabs + Stack)
- Zustand for state management
- React Native Chart Kit for visualizations
- Expo Local Authentication for biometrics
- Expo Notifications for push notifications

## Getting Started

```bash
# Install dependencies
npm install

# Start the development server
npm start

# Run on iOS
npm run ios

# Run on Android
npm run android
```

## Project Structure

```
mobile/
├── assets/              # App icons and images
├── src/
│   ├── components/      # Reusable components
│   │   ├── BiometricGuard.js
│   │   └── TabBarIcon.js
│   ├── screens/         # Screen components
│   │   ├── LoginScreen.js
│   │   ├── OpportunitiesScreen.js
│   │   ├── OpportunityDetailScreen.js
│   │   ├── DashboardScreen.js
│   │   ├── BetsScreen.js
│   │   ├── QuickBetScreen.js
│   │   └── ProfileScreen.js
│   ├── store/           # State management
│   │   ├── authStore.js
│   │   └── notificationStore.js
│   ├── theme/           # Theme configuration
│   │   └── ThemeProvider.js
│   └── App.js           # Main app component
├── app.json             # Expo configuration
├── package.json
└── index.js
```

## Configuration

Update the `API_BASE_URL` in store files to point to your Surebet Detector API server.

## Building for Production

```bash
# Build for iOS
expo build:ios

# Build for Android
expo build:android
```

## License

MIT
