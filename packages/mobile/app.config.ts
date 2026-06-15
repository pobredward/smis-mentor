import { ConfigContext, ExpoConfig } from '@expo/config';
import type { ConfigPlugin } from 'expo/config-plugins';
import { withProjectBuildGradle, withDangerousMod } from 'expo/config-plugins';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';

// .env 파일 로드
dotenv.config();

/**
 * 네이버 로그인 SDK Proguard 규칙 주입
 * @react-native-seoul/naver-login 4.2.4 내부 Android SDK(v5.9.1)는 consumer rules 미포함
 * → Release 빌드에서 ClassNotFoundException 방지를 위해 proguard-rules.pro에 수동 추가 필요
 */
const withNaverLoginProguard: ConfigPlugin = (cfg) =>
  withDangerousMod(cfg, [
    'android',
    async (c) => {
      const proguardPath = path.join(c.modRequest.platformProjectRoot, 'app', 'proguard-rules.pro');
      const MARKER = '# smis-naver-login-proguard';
      const rule = `-keep public class com.navercorp.nid.** { *; }`;

      let contents = '';
      if (fs.existsSync(proguardPath)) {
        contents = fs.readFileSync(proguardPath, 'utf8');
      }
      if (!contents.includes(MARKER)) {
        contents += `\n${MARKER}\n${rule}\n`;
        fs.writeFileSync(proguardPath, contents, 'utf8');
      }
      return c;
    },
  ]);

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

export default ({ config }: ConfigContext): ExpoConfig => {
  const baseConfig: ExpoConfig = {
    ...config,
    name: 'SMIS Mentor',
    slug: 'smis-mentor',
    version: '1.6.5',
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
        googleMapsApiKey: process.env.GOOGLE_MAPS_API_KEY_FOR_IOS || '',
      },
      infoPlist: {
        NSPhotoLibraryUsageDescription: '이 앱은 프로필 사진을 업로드하기 위해 사진 라이브러리에 접근합니다.',
        NSPhotoLibraryAddUsageDescription: '이 앱은 사진을 저장하기 위해 사진 라이브러리에 접근합니다.',
        NSLocationWhenInUseUsageDescription: '사용자 위치를 지도에 표시하기 위해 위치 정보가 필요합니다.',
        NSLocationAlwaysAndWhenInUseUsageDescription: '캠프 위치 공유를 위해 항상 위치 접근 권한이 필요합니다.',
        NSLocationAlwaysUsageDescription: '캠프 위치 공유를 위해 항상 위치 접근 권한이 필요합니다.',
        NSContactsUsageDescription: '학생 부모님 연락처를 기기 연락처 앱에 저장하기 위해 연락처 접근 권한이 필요합니다.',
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
          apiKey: process.env.GOOGLE_MAPS_API_KEY_FOR_ANDROID || '',
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
        // Android 13+ (API 33+)에서는 Photo Picker가 자동으로 사용되어 READ_MEDIA_IMAGES 권한 불필요
        // Android 12 이하에서는 READ_EXTERNAL_STORAGE로 충분
        'READ_EXTERNAL_STORAGE',
        'WRITE_EXTERNAL_STORAGE',
        // 'READ_MEDIA_IMAGES', // Google Play 정책으로 인해 제거 - expo-image-picker가 자동으로 Photo Picker 사용
        'ACCESS_FINE_LOCATION',
        'ACCESS_COARSE_LOCATION',
        'ACCESS_BACKGROUND_LOCATION',
        'POST_NOTIFICATIONS',
        'READ_CONTACTS',
        'WRITE_CONTACTS',
      ],
      googleServicesFile: './google-services.json',
    },
    web: {
      favicon: './assets/favicon.png',
    },
    plugins: [
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
          urlScheme: 'smismentor',
        },
      ],
      [
        '@react-native-google-signin/google-signin',
        {
          iosUrlScheme: 'com.googleusercontent.apps.382190683951-6qjb6jfc4ssfirqt7807ttt7b77rl8me',
        },
      ],
      [
        'expo-location',
        {
          locationAlwaysAndWhenInUsePermission: '캠프 위치 공유를 위해 위치 정보 접근 권한이 필요합니다.',
          locationWhenInUsePermission: '캠프 위치 공유를 위해 앱 사용 중 위치 정보 접근 권한이 필요합니다.',
          isAndroidBackgroundLocationEnabled: true,
          isAndroidForegroundServiceEnabled: true,
        },
      ],
    ],
    extra: {
      eas: {
        projectId: '684d0445-c299-4e77-a362-42efa9c671ac',
      },
      EXPO_PUBLIC_WEBSITE_URL: process.env.EXPO_PUBLIC_WEBSITE_URL || 'https://www.smis-mentor.com',
      EXPO_PUBLIC_WEB_API_URL: process.env.EXPO_PUBLIC_WEB_API_URL || 'https://www.smis-mentor.com',
      EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
      EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID,
      EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID: process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID,
      EXPO_PUBLIC_NAVER_CLIENT_ID: process.env.EXPO_PUBLIC_NAVER_CLIENT_ID,
      // Native SDK 초기화에 필요 (Android/iOS 모두). 앱 바이너리에 포함되지만
      // 네이버 개발자 센터에 등록된 패키지명/번들 ID와 함께 검증되어 단독 사용 불가.
      NAVER_CLIENT_SECRET: process.env.NAVER_CLIENT_SECRET,
      kakaoRestApiKey: process.env.EXPO_PUBLIC_KAKAO_REST_API_KEY,
    },
    owner: 'pobredward02',
  };

  // ConfigPlugin을 직접 적용하여 타입 오류 해결
  return withNaverLoginProguard(withReactNativePickerMonorepo(baseConfig));
};
