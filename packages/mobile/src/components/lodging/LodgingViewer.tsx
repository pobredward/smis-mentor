import React, { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { View, StyleSheet, ActivityIndicator, Text } from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';
import {
  lodgingViewerHtml,
  lodgingViewerRooms,
  type LodgingBuilding,
  type LodgingPlaceView,
  type LodgingRoomView,
  type LodgingViewerMode,
} from '@smis-mentor/shared';

export interface LodgingViewerHandle {
  send: (cmd: { type: 'goTo'; num: string } | { type: 'setFloor'; floor: number } | { type: 'setMode'; mode: 'orbit' | 'walk' }) => void;
}

interface Props {
  building: LodgingBuilding;
  rooms: Map<string, LodgingRoomView>;
  places: LodgingPlaceView[];
  mode: LodgingViewerMode;
  floor?: number;
  onRoom: (num: string) => void;
  onPlace: (id: string) => void;
  onFloor?: (floor: number) => void;
}

/**
 * 3D — shared 가 만든 HTML 을 WebView 로 띄운다 (web 의 iframe 과 같은 문서).
 * 3D 는 three.js 를 CDN 에서 받으므로 인터넷이 필요하다.
 */
export const LodgingViewer = forwardRef<LodgingViewerHandle, Props>(function LodgingViewer(
  { building, rooms, places, mode, floor, onRoom, onPlace, onFloor },
  ref
) {
  const web = useRef<WebView>(null);
  const [ready, setReady] = useState(false);
  const queue = useRef<object[]>([]);
  // 명단(필터·편집)이 바뀔 때마다 문서를 새로 띄우면 3D 시점이 처음으로 돌아간다.
  // 문서는 건물·보기 방식이 바뀔 때만 새로 만들고, 명단은 준비된 뒤 setRooms 로 보낸다.
  const roomsRef = useRef(rooms);
  roomsRef.current = rooms;
  const html = useMemo(
    () => lodgingViewerHtml({ building, rooms: roomsRef.current, places, mode, floor }),
    [building, places, mode, floor]
  );
  const post = (cmd: object) => {
    web.current?.injectJavaScript(`window.lodgingCmd(${JSON.stringify(JSON.stringify(cmd))}); true;`);
  };
  useEffect(() => {
    if (ready) post({ type: 'setRooms', rooms: lodgingViewerRooms(rooms) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rooms, ready]);

  useImperativeHandle(ref, () => ({
    send: (cmd) => {
      if (ready) post(cmd);
      else queue.current.push(cmd);
    },
  }));
  const onMessage = (e: WebViewMessageEvent) => {
    let m: { type?: string; num?: string; id?: string; floor?: number } | null = null;
    try {
      m = JSON.parse(e.nativeEvent.data);
    } catch {
      return;
    }
    if (!m) return;
    if (m.type === 'ready') {
      setReady(true);
      queue.current.splice(0).forEach(post);
    } else if (m.type === 'room' && m.num) onRoom(String(m.num));
    else if (m.type === 'place' && m.id) onPlace(String(m.id));
    else if (m.type === 'floor' && m.floor !== undefined) onFloor?.(Number(m.floor));
  };
  return (
    <View style={styles.wrap}>
      <WebView
        ref={web}
        source={{ html, baseUrl: 'https://smis-mentor.com/' }}
        originWhitelist={['*']}
        javaScriptEnabled
        domStorageEnabled={false}
        onMessage={onMessage}
        scrollEnabled={false}
        bounces={false}
        allowsInlineMediaPlayback
        setBuiltInZoomControls={false}
        style={styles.web}
        renderLoading={() => (
          <View style={styles.loading}>
            <ActivityIndicator color="#3b82f6" />
            <Text style={styles.loadingText}>3D 준비 중…</Text>
          </View>
        )}
        startInLoadingState
      />
    </View>
  );
});

const styles = StyleSheet.create({
  wrap: { flex: 1, borderRadius: 12, overflow: 'hidden', borderWidth: 1, borderColor: '#e5e7eb', backgroundColor: '#fff' },
  web: { flex: 1, backgroundColor: '#F6F6F3' },
  loading: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#fff' },
  loadingText: { fontSize: 12, color: '#6b7280' },
});
