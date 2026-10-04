import { ConfigContext, ExpoConfig } from '@expo/config';
import type { ConfigPlugin } from 'expo/config-plugins';
import { withProjectBuildGradle, withAppBuildGradle, withDangerousMod, withAppDelegate, withAndroidManifest, AndroidConfig } from 'expo/config-plugins';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';

/**
 * AppCheckCore(Firebase)가 Swift pod이므로 GoogleUtilities와 RecaptchaInterop에
 * modular_headers를 활성화해야 static library로 통합 가능
 * EAS pod install 시 "cannot yet be integrated as static libraries" 오류 방지
 */
const withIosModularHeaders: ConfigPlugin = (cfg) =>
  withDangerousMod(cfg, [
    'ios',
    async (c) => {
      const podfilePath = path.join(c.modRequest.platformProjectRoot, 'Podfile');
      if (!fs.existsSync(podfilePath)) return c;

      let contents = fs.readFileSync(podfilePath, 'utf8');
      const MARKER = '# smis-modular-headers';
      if (contents.includes(MARKER)) return c;

      // target 블록 시작 직전에 개별 pod modular_headers 설정 삽입
      const snippet = `
${MARKER}
pod 'GoogleUtilities', :modular_headers => true
pod 'RecaptchaInterop', :modular_headers => true
`;

      // Podfile의 target 블록 앞에 삽입
      const targetMatch = contents.match(/^target ['"]SMISMentor['"]/m);
      if (targetMatch && targetMatch.index !== undefined) {
        const insertAt = targetMatch.index;
        contents = contents.slice(0, insertAt) + snippet + '\n' + contents.slice(insertAt);
      } else {
        // fallback: 파일 끝에 추가
        contents += snippet;
      }

      fs.writeFileSync(podfilePath, contents, 'utf8');
      return c;
    },
  ]);

/**
 * 채팅 통화 — 진짜 전화처럼 잠금화면에서 받기
 *
 * iOS: 앱이 꺼져 있어도 VoIP 푸시(PushKit)가 오면 AppDelegate 가 바로 CallKit 수신 화면을 띄운다
 *      (iOS 13+ 는 VoIP 푸시마다 CallKit 에 알리지 않으면 앱을 죽인다 — JS 를 기다리지 않고 네이티브에서 바로 알린다).
 *      react-native-callkeep · react-native-voip-push-notification 의 클래스 메서드를 ObjC 런타임으로 부른다
 *      (Expo SDK 54+ 에서 브리징 헤더로 import 하면 빌드가 깨진다 — callkeep issue #869).
 * Android: @config-plugins/react-native-callkeep 가 VoiceConnectionService 를 넣고, 여기서는 이름 · 포그라운드 서비스 권한만 맞춘다.
 */
const SMIS_CALL_MARK = '// smis-callkit';
const SMIS_CALL_SWIFT = `

// MARK: - 채팅 통화 잠금화면 수신 (PushKit VoIP → CallKit) ${SMIS_CALL_MARK} — app.config.ts withSmisCallKit 가 넣는다
extension AppDelegate: PKPushRegistryDelegate {
  func pushRegistry(_ registry: PKPushRegistry, didUpdate pushCredentials: PKPushCredentials, for type: PKPushType) {
    SmisCallBridge.tokenUpdated(pushCredentials, type: type)
  }

  func pushRegistry(_ registry: PKPushRegistry, didInvalidatePushTokenFor type: PKPushType) {}

  func pushRegistry(_ registry: PKPushRegistry, didReceiveIncomingPushWith payload: PKPushPayload, for type: PKPushType, completion: @escaping () -> Void) {
    SmisCallBridge.incoming(payload)
    completion()
  }
}

/// react-native-callkeep (RNCallKeep) · react-native-voip-push-notification (RNVoipPushNotificationManager) 를 헤더 없이 부른다
enum SmisCallBridge {
  private static var registry: PKPushRegistry?
  private static var fallbackProvider: CXProvider?

  private struct Target {
    let obj: AnyObject
    let sel: Selector
    let imp: IMP
  }

  private typealias Fn1 = @convention(c) (AnyObject, Selector, AnyObject?) -> Void
  private typealias Fn2 = @convention(c) (AnyObject, Selector, AnyObject?, AnyObject?) -> Void
  private typealias ReportFn = @convention(c) (AnyObject, Selector, NSString, NSString, NSString, Bool, NSString?, Bool, Bool, Bool, Bool, Bool, NSDictionary?, AnyObject?) -> Void

  private static func classMethod(_ className: String, _ name: String) -> Target? {
    guard let cls: AnyClass = NSClassFromString(className) else { return nil }
    let sel = NSSelectorFromString(name)
    guard let method = class_getClassMethod(cls, sel) else { return nil }
    return Target(obj: cls as AnyObject, sel: sel, imp: method_getImplementation(method))
  }

  /// 앱 시작 — CallKit 설정 (callkeep 은 네이티브에서 한 번 설정하면 JS setup 을 무시한다) · VoIP 토큰 받기
  static func start(_ delegate: PKPushRegistryDelegate) {
    if let t = classMethod("RNCallKeep", "setup:") {
      let options: NSDictionary = [
        "appName": "SMIS Mentor",
        "handleType": "generic",
        "supportsVideo": true,
        "maximumCallGroups": "1",
        "maximumCallsPerCallGroup": "1",
        "includesCallsInRecents": false,
      ]
      unsafeBitCast(t.imp, to: Fn1.self)(t.obj, t.sel, options)
    }
    let r = PKPushRegistry(queue: DispatchQueue.main)
    r.delegate = delegate
    r.desiredPushTypes = [PKPushType.voIP]
    registry = r
  }

  /// VoIP 토큰 → JS ('register' 이벤트 — JS 가 users/{uid}.voipTokens 에 저장)
  static func tokenUpdated(_ credentials: PKPushCredentials, type: PKPushType) {
    guard let t = classMethod("RNVoipPushNotificationManager", "didUpdatePushCredentials:forType:") else { return }
    unsafeBitCast(t.imp, to: Fn2.self)(t.obj, t.sel, credentials, type.rawValue as NSString)
  }

  /// VoIP 푸시 → 바로 CallKit 수신 화면 (payload: 서버 ringPeer 의 uuid · callId · callerName · handle · hasVideo …)
  static func incoming(_ payload: PKPushPayload) {
    let data = payload.dictionaryPayload
    var info: [String: Any] = [:]
    for (key, value) in data {
      if let k = key as? String { info[k] = value }
    }
    var uuid = (info["uuid"] as? String) ?? ""
    if UUID(uuidString: uuid) == nil { uuid = UUID().uuidString.lowercased() }
    let callerName = (info["callerName"] as? String) ?? "SMIS Mentor"
    let handle = (info["handle"] as? String) ?? callerName
    let hasVideo = (info["hasVideo"] as? Bool) ?? ((info["media"] as? String) == "video")
    let sel = "reportNewIncomingCall:handle:handleType:hasVideo:localizedCallerName:supportsHolding:supportsDTMF:supportsGrouping:supportsUngrouping:fromPushKit:payload:withCompletionHandler:"
    if let t = classMethod("RNCallKeep", sel) {
      unsafeBitCast(t.imp, to: ReportFn.self)(
        t.obj, t.sel,
        uuid as NSString, handle as NSString, "generic" as NSString, hasVideo, callerName as NSString,
        false, false, false, false, true,
        info as NSDictionary, nil
      )
    } else {
      reportFallback(uuid: uuid, callerName: callerName, hasVideo: hasVideo)
    }
  }

  /// callkeep 을 못 찾았을 때 — 그래도 CallKit 에 알려야 iOS 가 앱을 죽이지 않는다 (바로 끝냄)
  private static func reportFallback(uuid: String, callerName: String, hasVideo: Bool) {
    let provider: CXProvider
    if let p = fallbackProvider {
      provider = p
    } else {
      let config = CXProviderConfiguration()
      config.supportsVideo = true
      config.maximumCallGroups = 1
      config.maximumCallsPerCallGroup = 1
      provider = CXProvider(configuration: config)
      fallbackProvider = provider
    }
    let update = CXCallUpdate()
    update.remoteHandle = CXHandle(type: .generic, value: callerName)
    update.localizedCallerName = callerName
    update.hasVideo = hasVideo
    let id = UUID(uuidString: uuid) ?? UUID()
    provider.reportNewIncomingCall(with: id, update: update) { _ in
      provider.reportCall(with: id, endedAt: Date(), reason: .failed)
    }
  }
}
`;

const withSmisCallKit: ConfigPlugin = (cfg) => {
  cfg = withAppDelegate(cfg, (c) => {
    if (c.modResults.language !== 'swift') {
      throw new Error('[withSmisCallKit] AppDelegate 가 Swift 가 아닙니다 — 통화 수신 코드를 넣지 못했습니다.');
    }
    let src = c.modResults.contents;
    if (src.includes(SMIS_CALL_MARK)) return c;
    const importLine = /^(?:internal |public )?import Expo\s*$/m;
    const imports = `import PushKit ${SMIS_CALL_MARK}\nimport CallKit\nimport ObjectiveC`;
    src = importLine.test(src) ? src.replace(importLine, (m) => `${m.trimEnd()}\n${imports}`) : `${imports}\n${src}`;
    const ret = /^([ \t]*)return super\.application\(application, didFinishLaunchingWithOptions: launchOptions\)/m;
    if (!ret.test(src)) {
      throw new Error('[withSmisCallKit] AppDelegate 에서 didFinishLaunching 의 return super.application(...) 줄을 찾지 못했습니다.');
    }
    src = src.replace(ret, (m, indent: string) => `${indent}SmisCallBridge.start(self) ${SMIS_CALL_MARK}\n${m}`);
    c.modResults.contents = src.trimEnd() + '\n' + SMIS_CALL_SWIFT;
    return c;
  });
  // callkeep 플러그인이 넣은 서비스 — VoiceConnectionService 이름을 앱 이름으로 (시스템 통화 계정 화면에 보인다),
  // 쓰지 않는 RNCallKeepBackgroundMessagingService(밖에서 부를 수 있는 headless JS 서비스)는 뺀다 (Android 벨은 expo-notifications 백그라운드 작업이 띄운다)
  cfg = withAndroidManifest(cfg, (c) => {
    const app = AndroidConfig.Manifest.getMainApplicationOrThrow(c.modResults);
    app.service = (app.service ?? []).filter((svc) => svc.$['android:name'] !== 'io.wazo.callkeep.RNCallKeepBackgroundMessagingService');
    for (const svc of app.service) {
      if (svc.$['android:name'] === 'io.wazo.callkeep.VoiceConnectionService') {
        (svc.$ as Record<string, string>)['android:label'] = 'SMIS Mentor';
      }
    }
    return c;
  });
  // react-native-agora 가 함께 넣는 화면 공유 모듈(io.agora.rtc:full-screen-sharing) — 화면 공유를 쓰지 않으므로 뺀다.
  // 이 모듈의 매니페스트가 FOREGROUND_SERVICE_MEDIA_PROJECTION(화면 녹화 포그라운드 서비스)을 넣어 Play 신고 대상이 된다.
  cfg = withAppBuildGradle(cfg, (c) => {
    const MARK = '// smis-agora-no-screen-sharing';
    if (c.modResults.language === 'groovy' && !c.modResults.contents.includes(MARK)) {
      c.modResults.contents += `\n${MARK}\nconfigurations.all {\n    exclude group: 'io.agora.rtc', module: 'full-screen-sharing'\n}\n`;
    }
    return c;
  });
  return cfg;
};

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
    version: '1.8.0',
    // 코드푸시(EAS Update) — 같은 앱 버전의 스토어 빌드에만 JS 업데이트를 보낸다.
    // 네이티브 변경(라이브러리·권한·app.config 네이티브 설정)이 있으면 버전을 올려 새로 빌드할 것.
    runtimeVersion: { policy: 'appVersion' },
    updates: {
      url: 'https://u.expo.dev/684d0445-c299-4e77-a362-42efa9c671ac',
      checkAutomatically: 'ON_LOAD',
      fallbackToCacheTimeout: 0,
    },
    orientation: 'portrait',
    icon: './assets/icon.png',
    userInterfaceStyle: 'light',
    // newArchEnabled: SDK 55부터 New Architecture가 기본값이므로 제거
    scheme: 'smismentor',
    // splash는 expo-splash-screen 플러그인에서 관리 (SDK 55+)
    // 하위 호환을 위해 유지하되 타입 캐스팅 사용
    ios: {
      supportsTablet: true,
      bundleIdentifier: 'com.smis.smismentor',
      googleServicesFile: './GoogleService-Info.plist',
      buildNumber: '1',
      associatedDomains: [
        'applinks:smis-mentor.com',
        'applinks:www.smis-mentor.com',
      ], 
      // ios.config.googleMapsApiKey(구형 설정)는 Podfile에 지금은 없는 'react-native-google-maps' pod을 넣어
      // iOS 빌드가 pod install에서 실패한다. 대신 아래 plugins의 react-native-maps 플러그인으로 키를 넘긴다.
      infoPlist: {
        NSPhotoLibraryUsageDescription: '이 앱은 프로필 사진과 분실물 사진·영상을 업로드하기 위해 사진 라이브러리에 접근합니다.',
        NSPhotoLibraryAddUsageDescription: '이 앱은 채팅방의 사진·동영상을 저장하기 위해 사진 라이브러리에 접근합니다.',
        NSLocationWhenInUseUsageDescription: '사용자 위치를 지도에 표시하기 위해 위치 정보가 필요합니다.',
        NSLocationAlwaysAndWhenInUseUsageDescription: '캠프 위치 공유를 위해 항상 위치 접근 권한이 필요합니다.',
        NSLocationAlwaysUsageDescription: '캠프 위치 공유를 위해 항상 위치 접근 권한이 필요합니다.',
        NSContactsUsageDescription: '학생 부모님 연락처를 기기 연락처 앱에 저장하기 위해 연락처 접근 권한이 필요합니다.',
        ITSAppUsesNonExemptEncryption: false,
        // 채팅 통화 — 화면이 꺼지거나 다른 앱으로 가도 통화가 이어지게(audio), 잠금화면 수신(voip — PushKit · CallKit)
        UIBackgroundModes: ['audio', 'voip', 'remote-notification'],
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
      // edgeToEdgeEnabled: SDK 55부터 Android 16+ 타겟 시 필수 적용되므로 config에서 제거
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
      // expo-media-library 플러그인이 넣는 '선택한 사진만 읽기' 권한 — 채팅은 저장(쓰기)만 하므로 막는다 (Google Play 사진 권한 정책)
      // FOREGROUND_SERVICE_MEDIA_PROJECTION — Agora 화면 공유용(쓰지 않음, 위 withSmisCallKit 에서 모듈도 뺀다)
      blockedPermissions: ['android.permission.READ_MEDIA_VISUAL_USER_SELECTED', 'android.permission.FOREGROUND_SERVICE_MEDIA_PROJECTION'],
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
        // 채팅 통화 (Agora) — 마이크 · 카메라 · 스피커/블루투스 전환
        'RECORD_AUDIO',
        'CAMERA',
        'MODIFY_AUDIO_SETTINGS',
        'BLUETOOTH_CONNECT',
        'ACCESS_NETWORK_STATE',
        // 잠금화면 수신(ConnectionService) — 받은 통화가 백그라운드에서도 이어지게 (Android 14+ 포그라운드 서비스 phoneCall)
        'FOREGROUND_SERVICE_PHONE_CALL',
        'MANAGE_OWN_CALLS',
      ],
      googleServicesFile: './google-services.json',
    },
    web: {
      favicon: './assets/favicon.png',
    },
    plugins: [
      [
        'react-native-maps',
        {
          // iOS는 여기서 Google Maps(pod 'react-native-maps/Google')를 붙인다
          iosGoogleMapsApiKey: process.env.GOOGLE_MAPS_API_KEY_FOR_IOS || '',
        },
      ],
      [
        'expo-image-picker',
        {
          photosPermission: '이 앱은 프로필 사진과 분실물 사진·영상을 업로드하기 위해 사진 라이브러리에 접근합니다.',
          cameraPermission: '이 앱은 채팅 영상 통화와 프로필 사진·분실물 사진·영상 촬영을 위해 카메라에 접근합니다.',
          // expo-audio 와 같은 문구 (NSMicrophoneUsageDescription 은 하나라서 둘 다 같게)
          microphonePermission: '이 앱은 채팅 통화, 채팅방 음성 메시지 녹음, 분실물 영상 촬영 때 소리를 녹음하기 위해 마이크를 사용합니다.',
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
      [
        // 채팅 사진·동영상 저장 — 쓰기만 쓴다 (requestPermissionsAsync(true))
        // granularPermissions: [] → Android 13+ READ_MEDIA_IMAGES/VIDEO/AUDIO 를 넣지 않는다 (Google Play 사진 권한 정책)
        'expo-media-library',
        {
          photosPermission: '이 앱은 프로필 사진과 분실물 사진·영상을 업로드하기 위해 사진 라이브러리에 접근합니다.',
          savePhotosPermission: '이 앱은 채팅방의 사진·동영상을 저장하기 위해 사진 라이브러리에 접근합니다.',
          isAccessMediaLocationEnabled: false,
          granularPermissions: [],
        },
      ],
      // 채팅 동영상 재생 — 백그라운드 재생·PiP 는 쓰지 않는다 (옵션 없이 등록하면 네이티브 설정을 바꾸지 않음)
      'expo-video',
      [
        // 채팅 음성 메시지 — 녹음(RECORD_AUDIO · NSMicrophoneUsageDescription)만. 백그라운드 재생·녹음은 쓰지 않는다
        'expo-audio',
        {
          microphonePermission: '이 앱은 채팅 통화, 채팅방 음성 메시지 녹음, 분실물 영상 촬영 때 소리를 녹음하기 위해 마이크를 사용합니다.',
          recordAudioAndroid: true,
          enableBackgroundPlayback: false,
          enableBackgroundRecording: false,
        },
      ],
      'expo-web-browser',
      'expo-apple-authentication',
      // 채팅 통화 잠금화면 수신 — iOS CallKit(voip 백그라운드 · CallKit.framework) · Android ConnectionService(VoiceConnectionService · 전화 권한)
      '@config-plugins/react-native-callkeep',
      '@react-native-community/datetimepicker',
      [
        '@sentry/react-native',
        {
          url: 'https://sentry.io/',
          project: process.env.SENTRY_PROJECT || '',
          organization: process.env.SENTRY_ORG || '',
        },
      ],
      [
        'expo-image',
        {
          // expo-image SDK 57 플러그인 등록
        },
      ],
      [
        'expo-splash-screen',
        {
          // splash screen은 baseConfig.splash에서 설정
          image: './assets/splash-icon.png',
          resizeMode: 'contain',
          backgroundColor: '#ffffff',
        },
      ],
      [
        'expo-status-bar',
        {
          style: 'auto',
        },
      ],
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
      EXPO_PUBLIC_WEBSITE_URL: process.env.EXPO_PUBLIC_WEBSITE_URL || 'https://smis-mentor.com',
      // www 없는 도메인 사용 필수: www.smis-mentor.com → smis-mentor.com 리다이렉트 시
      // Authorization 헤더가 제거되어 인증 실패하므로 반드시 canonical 도메인(www 없음)을 사용해야 함
      EXPO_PUBLIC_WEB_API_URL: process.env.EXPO_PUBLIC_WEB_API_URL || 'https://smis-mentor.com',
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
  return withSmisCallKit(withNaverLoginProguard(withReactNativePickerMonorepo(withIosModularHeaders(baseConfig))));
};
