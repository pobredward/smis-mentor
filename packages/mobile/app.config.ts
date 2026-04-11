import { ConfigContext, ExpoConfig } from '@expo/config';
import type { ConfigPlugin } from 'expo/config-plugins';
import { withProjectBuildGradle } from 'expo/config-plugins';

/** android/ 가 gitignore → EAS prebuild 시 매번 생성되므로 여기서 루트 build.gradle을 패치합니다. */
const withReactNativePickerMonorepo: ConfigPlugin = (cfg) =>
  withProjectBuildGradle(cfg, (c) => {
    if (c.modResults.language !== 'groovy') {
      return c;
    }
    const MARKER = 'smis-react-native-picker-monorepo';
    let contents = c.modResults.contents;
    if (contents.includes(MARKER)) {
      return c;
    }
    const snippet = `
// ${MARKER}: @react-native-picker/picker — react-native 패키지 루트(모노레포·npm workspaces·EAS)
def smisReactNativePackageDir = [
  new File(rootDir, "../node_modules/react-native"),
  new File(rootDir, "../../../node_modules/react-native"),
  new File(rootDir, "../../node_modules/react-native"),
].find { it.exists() }
if (smisReactNativePackageDir != null) {
  ext.REACT_NATIVE_NODE_MODULES_DIR = smisReactNativePackageDir
}
`.trim();
    const anchor = ['apply plugin: "expo-root-project"', "apply plugin: 'expo-root-project'"].find((a) =>
      contents.includes(a),
    );
    if (!anchor) {
      throw new Error(
        '[withReactNativePickerMonorepo] android/build.gradle에서 expo-root-project 적용 줄을 찾지 못했습니다.',
      );
    }
    c.modResults.contents = contents.replace(anchor, `${snippet}\n\n${anchor}`);
    return c;
  });

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: 'SMIS Mentor',
  slug: 'smis-mentor',
  version: '1.1.1',
  orientation: 'portrait',
  icon: './assets/icon.png',
  userInterfaceStyle: 'light',
  newArchEnabled: true,
  scheme: 'smismentor',
  splash: {
    image: './assets/splash-icon.png',
    resizeMode: 'contain',
    backgroundColor: '#ffffff',
  },
  ios: {
    supportsTablet: true,
    bundleIdentifier: 'com.smis.smismentor',
    googleServicesFile: './GoogleService-Info.plist',
    buildNumber: '1',
    associatedDomains: [
      'applinks:smis-mentor.com',
      'applinks:www.smis-mentor.com',
    ],
    config: {
      googleMapsApiKey: 'YOUR_GOOGLE_MAPS_API_KEY_FOR_IOS',
    },
    infoPlist: {
      NSPhotoLibraryUsageDescription: '이 앱은 프로필 사진을 업로드하기 위해 사진 라이브러리에 접근합니다.',
      NSCameraUsageDescription: '이 앱은 프로필 사진을 촬영하기 위해 카메라에 접근합니다.',
      NSPhotoLibraryAddUsageDescription: '이 앱은 사진을 저장하기 위해 사진 라이브러리에 접근합니다.',
      NSLocationWhenInUseUsageDescription: '사용자 위치를 지도에 표시하기 위해 위치 정보가 필요합니다.',
      ITSAppUsesNonExemptEncryption: false,
      CFBundleURLTypes: [
        {
          CFBundleURLSchemes: ['com.googleusercontent.apps.382190683951-6qjb6jfc4ssfirqt7807ttt7b77rl8me'],
        },
        {
          CFBundleURLSchemes: ['smismentor'],
        },
      ],
    },
  },
  android: {
    adaptiveIcon: {
      foregroundImage: './assets/adaptive-icon.png',
      backgroundColor: '#ffffff',
    },
    package: 'com.smis.smismentor',
    versionCode: 1,
    edgeToEdgeEnabled: true,
    predictiveBackGestureEnabled: false,
    softwareKeyboardLayoutMode: 'resize',
    config: {
      googleMaps: {
        apiKey: 'YOUR_GOOGLE_MAPS_API_KEY_FOR_ANDROID',
      },
    },
    intentFilters: [
      {
        action: 'VIEW',
        autoVerify: true,
        data: [
          {
            scheme: 'https',
            host: 'smis-mentor.com',
            pathPrefix: '/camp/tasks',
          },
          {
            scheme: 'https',
            host: 'www.smis-mentor.com',
            pathPrefix: '/camp/tasks',
          },
        ],
        category: ['BROWSABLE', 'DEFAULT'],
      },
    ],
    permissions: [
      'CAMERA',
      // Android 13+ (API 33+)에서는 Photo Picker가 자동으로 사용되어 READ_MEDIA_IMAGES 권한 불필요
      // Android 12 이하에서는 READ_EXTERNAL_STORAGE로 충분
      'READ_EXTERNAL_STORAGE',
      'WRITE_EXTERNAL_STORAGE',
      // 'READ_MEDIA_IMAGES', // Google Play 정책으로 인해 제거 - expo-image-picker가 자동으로 Photo Picker 사용
      'ACCESS_FINE_LOCATION',
      'ACCESS_COARSE_LOCATION',
      'POST_NOTIFICATIONS',
    ],
    googleServicesFile: './google-services.json',
  },
  web: {
    favicon: './assets/favicon.png',
  },
  plugins: [
    withReactNativePickerMonorepo,
    [
      'expo-image-picker',
      {
        photosPermission: '이 앱은 프로필 사진을 업로드하기 위해 사진 라이브러리에 접근합니다.',
        cameraPermission: '이 앱은 프로필 사진을 촬영하기 위해 카메라에 접근합니다.',
      },
    ],
    [
      'expo-notifications',
      {
        icon: './assets/notification-icon.png',
        color: '#3b82f6',
        sounds: [],
        mode: 'production',
        androidMode: 'default',
        androidCollapsedTitle: 'SMIS Mentor',
      },
    ],
    'expo-web-browser',
    'expo-apple-authentication',
    [
      '@react-native-seoul/naver-login',
      {
        urlScheme: 'com.smis.smismentor',
      },
    ],
    [
      '@react-native-google-signin/google-signin',
      {
        iosUrlScheme: 'com.googleusercontent.apps.382190683951-6qjb6jfc4ssfirqt7807ttt7b77rl8me',
      },
    ],
  ],
  extra: {
    eas: {
      projectId: '684d0445-c299-4e77-a362-42efa9c671ac',
    },
    EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
    EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID,
    EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID: process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID,
    EXPO_PUBLIC_NAVER_CLIENT_ID: process.env.EXPO_PUBLIC_NAVER_CLIENT_ID,
    EXPO_PUBLIC_NAVER_CLIENT_SECRET: process.env.EXPO_PUBLIC_NAVER_CLIENT_SECRET,
  },
  owner: 'pobredward02',
});
