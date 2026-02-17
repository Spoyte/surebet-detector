{
  "testRunner": "jest",
  "runnerConfig": "e2e/config.json",
  "skipLegacyWorkersInjection": true,
  "apps": {
    "ios": {
      "type": "ios.app",
      "binaryPath": "ios/build/Build/Products/Debug-iphonesimulator/SurebetMobile.app",
      "build": "xcodebuild -workspace ios/SurebetMobile.xcworkspace -scheme SurebetMobile -configuration Debug -sdk iphonesimulator -derivedDataPath ios/build"
    },
    "ios.release": {
      "type": "ios.app",
      "binaryPath": "ios/build/Build/Products/Release-iphonesimulator/SurebetMobile.app",
      "build": "xcodebuild -workspace ios/SurebetMobile.xcworkspace -scheme SurebetMobile -configuration Release -sdk iphonesimulator -derivedDataPath ios/build"
    },
    "android": {
      "type": "android.apk",
      "binaryPath": "android/app/build/outputs/apk/debug/app-debug.apk",
      "build": "cd android && ./gradlew assembleDebug assembleAndroidTest -DtestBuildType=debug"
    },
    "android.release": {
      "type": "android.apk",
      "binaryPath": "android/app/build/outputs/apk/release/app-release.apk",
      "build": "cd android && ./gradlew assembleRelease assembleAndroidTest -DtestBuildType=release"
    }
  },
  "devices": {
    "simulator": {
      "type": "ios.simulator",
      "device": {
        "type": "iPhone 15"
      }
    },
    "emulator": {
      "type": "android.emulator",
      "device": {
        "avdName": "Pixel_7_API_34"
      }
    }
  },
  "configurations": {
    "ios": {
      "device": "simulator",
      "app": "ios"
    },
    "ios.release": {
      "device": "simulator",
      "app": "ios.release"
    },
    "android": {
      "device": "emulator",
      "app": "android"
    },
    "android.release": {
      "device": "emulator",
      "app": "android.release"
    }
  }
}