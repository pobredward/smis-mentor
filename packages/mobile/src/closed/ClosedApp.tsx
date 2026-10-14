/**
 * SMIS Mentor 앱 종료 화면 (2026-10-15)
 *
 * 코드푸시(EAS Update)로 스토어에 나가 있는 옛 앱 전체를 이 화면 하나로 바꾼다.
 *  - react-native 기본 모듈만 쓴다. 1.7.2 · 1.8.0 · 1.9.0 어느 빌드에 내려가도 없는 네이티브 모듈 때문에 죽지 않게.
 *  - iOS: App Store 의 새 앱 SMIS CAMP 로 보낸다.
 *  - Android: Google Play 에 SMIS CAMP 가 나오면(상세 페이지 200) 다운로드 버튼으로 바뀐다. 그전에는 '심사 중' 안내 + 웹.
 *    앱으로 돌아올 때마다 다시 확인하므로, 출시 뒤 코드푸시를 또 할 필요가 없다.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { AppState, Linking, Platform, Pressable, ScrollView, StatusBar, StyleSheet, Text, View } from 'react-native';

const APP_STORE_URL = 'https://apps.apple.com/kr/app/smis-camp/id6819282081';
const PLAY_URL = 'https://play.google.com/store/apps/details?id=com.smis.smiscamp';
const WEB_URL = 'https://smiscamp.com';

const C = {
  brand: '#2E26D3',
  brandSoft: '#EEEDFF',
  bg: '#F5F6FB',
  card: '#FFFFFF',
  text: '#14142B',
  sub: '#555872',
  line: '#E6E7F0',
};

/** 'ready' = 스토어에서 받을 수 있음 · 'review' = 아직 (Android 심사 중) */
type StoreState = 'checking' | 'ready' | 'review';

function useStoreState(): StoreState {
  const [state, setState] = useState<StoreState>(Platform.OS === 'android' ? 'checking' : 'ready');
  const check = useCallback(() => {
    if (Platform.OS !== 'android') return () => {};
    let alive = true;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 8000);
    fetch(PLAY_URL, { method: 'HEAD', signal: ctrl.signal })
      .then((r) => { if (alive) setState(r.ok ? 'ready' : 'review'); })
      .catch(() => { if (alive) setState((s) => (s === 'ready' ? 'ready' : 'review')); })
      .finally(() => clearTimeout(timer));
    return () => { alive = false; clearTimeout(timer); ctrl.abort(); };
  }, []);
  useEffect(() => {
    let stop = check();
    const sub = AppState.addEventListener('change', (s) => { if (s === 'active') { stop(); stop = check(); } });
    return () => { stop(); sub.remove(); };
  }, [check]);
  return state;
}

const open = (url: string) => { Linking.openURL(url).catch(() => {}); };

function Button({ label, onPress, kind = 'primary' }: { label: string; onPress: () => void; kind?: 'primary' | 'ghost' }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.btn, kind === 'ghost' && styles.btnGhost, pressed && { opacity: 0.8 }]}
      accessibilityRole="button"
    >
      <Text style={[styles.btnText, kind === 'ghost' && styles.btnGhostText]}>{label}</Text>
    </Pressable>
  );
}

export default function ClosedApp() {
  const store = useStoreState();
  const ios = Platform.OS === 'ios';
  const canDownload = store === 'ready';
  const storeUrl = ios ? APP_STORE_URL : PLAY_URL;
  const storeName = ios ? 'App Store' : 'Google Play';

  return (
    <View style={styles.root}>
      <StatusBar barStyle="dark-content" backgroundColor={C.bg} />
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.mark}>SMIS CAMP</Text>

        <View style={styles.card}>
          <View style={styles.badge}><Text style={styles.badgeText}>서비스 종료 안내</Text></View>
          <Text style={styles.h1}>SMIS Mentor 서비스가{'\n'}종료되었습니다</Text>
          <Text style={styles.p}>
            SMIS Mentor는 새 앱 <Text style={styles.strong}>SMIS CAMP</Text>로 옮겼습니다. 지원서, 캠프 기록, 수업자료, 채팅 등
            지금까지의 정보는 모두 옮겨 두었으니 새 앱에서 쓰시던 계정 그대로 로그인해 주세요.
          </Text>

          {canDownload ? (
            <>
              <Button label={`${storeName}에서 SMIS CAMP 받기`} onPress={() => open(storeUrl)} />
              <Button kind="ghost" label="웹으로 이용하기 (smiscamp.com)" onPress={() => open(WEB_URL)} />
            </>
          ) : (
            <>
              <View style={styles.notice}>
                <Text style={styles.noticeTitle}>Android 앱은 Google Play 심사 중이에요</Text>
                <Text style={styles.noticeText}>
                  출시되는 대로 이 화면에 다운로드 버튼이 나타납니다. 조금만 기다려 주세요.
                  그동안은 smiscamp.com(웹)에서 쓰시던 계정으로 이용하실 수 있습니다.
                </Text>
              </View>
              <Button label="smiscamp.com 열기" onPress={() => open(WEB_URL)} />
            </>
          )}

          <Text style={styles.small}>이 앱(SMIS Mentor)은 더 이상 쓰지 않으니 지우셔도 됩니다. 여기서 입력한 내용은 새 서비스에 반영되지 않습니다.</Text>
        </View>

        <View style={[styles.card, styles.en]}>
          <Text style={styles.h2}>SMIS Mentor has closed</Text>
          <Text style={styles.pEn}>
            We have moved to the new <Text style={styles.strong}>SMIS CAMP</Text> app. All your applications, camp records,
            lesson materials and chats have been moved — just sign in with the same account.
          </Text>
          {canDownload ? (
            <Text style={styles.pEn}>Tap the button above to download SMIS CAMP from {storeName}.</Text>
          ) : (
            <Text style={styles.pEn}>
              The Android app is under review on Google Play. A download button will appear here as soon as it is released.
              Until then, please use smiscamp.com in your browser.
            </Text>
          )}
        </View>

        <Text style={styles.foot}>(주)에스엠아이에스 · smiscamp.com</Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  scroll: { paddingHorizontal: 20, paddingTop: Platform.OS === 'ios' ? 72 : (StatusBar.currentHeight ?? 24) + 32, paddingBottom: 48 },
  mark: { color: C.brand, fontWeight: '900', fontSize: 15, letterSpacing: 0.6, marginBottom: 16 },
  card: { backgroundColor: C.card, borderRadius: 20, borderWidth: 1, borderColor: C.line, padding: 22 },
  badge: { alignSelf: 'flex-start', backgroundColor: C.brandSoft, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4, marginBottom: 12 },
  badgeText: { color: C.brand, fontSize: 12, fontWeight: '700' },
  h1: { color: C.text, fontSize: 23, fontWeight: '800', lineHeight: 31, marginBottom: 12 },
  h2: { color: C.text, fontSize: 17, fontWeight: '800', marginBottom: 8 },
  p: { color: C.sub, fontSize: 15, lineHeight: 23 },
  pEn: { color: C.sub, fontSize: 14, lineHeight: 21, marginBottom: 6 },
  strong: { color: C.text, fontWeight: '700' },
  notice: { backgroundColor: C.brandSoft, borderRadius: 14, padding: 14, marginTop: 18 },
  noticeTitle: { color: C.brand, fontSize: 15, fontWeight: '800', marginBottom: 4 },
  noticeText: { color: C.text, fontSize: 14, lineHeight: 21 },
  btn: { backgroundColor: C.brand, borderRadius: 14, paddingVertical: 15, alignItems: 'center', marginTop: 18 },
  btnText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
  btnGhost: { backgroundColor: 'transparent', borderWidth: 1.5, borderColor: C.brand, marginTop: 10, paddingVertical: 13.5 },
  btnGhostText: { color: C.brand },
  small: { color: C.sub, fontSize: 12.5, lineHeight: 19, marginTop: 16 },
  en: { marginTop: 14 },
  foot: { color: C.sub, fontSize: 12, textAlign: 'center', marginTop: 20 },
});
