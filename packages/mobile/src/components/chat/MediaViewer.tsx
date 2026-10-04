/**
 * 사진·동영상 보기 (전체 화면) — 좌우로 넘기기 · "3 / 10" · 동영상 재생(보이는 칸만) · [저장] · [모두 저장]
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Modal,
  View,
  Text,
  FlatList,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
  Platform,
  useWindowDimensions,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { Image } from 'expo-image';
import { useVideoPlayer, VideoView } from 'expo-video';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { L, chatDayLabel, chatTimeLabel, getCurrentLocale, type ChatMediaItem } from '@smis-mentor/shared';
import { saveChatMediaWithFeedback } from './saveWithFeedback';

interface MediaViewerProps {
  visible: boolean;
  media: ChatMediaItem[];
  startIndex: number;
  senderName: string;
  at: Date | null;
  campCode?: string | null;
  onClose: () => void;
}

function ViewerVideo({ uri, width, height }: { uri: string; width: number; height: number }) {
  const player = useVideoPlayer(uri, (p) => {
    p.loop = false;
    p.play();
  });
  return (
    <VideoView
      player={player}
      style={{ width, height }}
      contentFit="contain"
      nativeControls
      allowsPictureInPicture={false}
    />
  );
}

/** 위·아래 막대에 가리지 않도록 동영상(재생 막대 포함)은 그 사이에 둔다 */
const BAR_TOP = 76;
const BAR_BOTTOM = 72;

function ViewerPage({
  item,
  active,
  width,
  height,
  insetTop,
  insetBottom,
}: {
  item: ChatMediaItem;
  active: boolean;
  width: number;
  height: number;
  insetTop: number;
  insetBottom: number;
}) {
  if (item.kind === 'video') {
    const top = insetTop + BAR_TOP;
    const videoHeight = Math.max(200, height - top - insetBottom - BAR_BOTTOM);
    if (active) {
      return (
        <View style={{ width, height, paddingTop: top }}>
          <ViewerVideo uri={item.url} width={width} height={videoHeight} />
        </View>
      );
    }
    return (
      <View style={{ width, height, alignItems: 'center', justifyContent: 'center' }}>
        {item.thumbUrl ? (
          <Image source={{ uri: item.thumbUrl }} style={StyleSheet.absoluteFill} contentFit="contain" />
        ) : null}
        <Ionicons name="play-circle" size={64} color="rgba(255,255,255,0.85)" />
      </View>
    );
  }
  const image = (
    <Image
      source={{ uri: item.url }}
      placeholder={item.thumbUrl ? { uri: item.thumbUrl } : undefined}
      placeholderContentFit="contain"
      style={{ width, height }}
      contentFit="contain"
      transition={150}
      cachePolicy="memory-disk"
    />
  );
  // iOS 는 두 손가락으로 확대 (ScrollView 확대)
  if (Platform.OS === 'ios') {
    return (
      <ScrollView
        style={{ width, height }}
        contentContainerStyle={{ width, height }}
        maximumZoomScale={3}
        minimumZoomScale={1}
        centerContent
        showsHorizontalScrollIndicator={false}
        showsVerticalScrollIndicator={false}
        bouncesZoom
      >
        {image}
      </ScrollView>
    );
  }
  return image;
}

export function MediaViewer({ visible, media, startIndex, senderName, at, campCode, onClose }: MediaViewerProps) {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [index, setIndex] = useState(startIndex);
  const [saving, setSaving] = useState<{ done: number; total: number } | null>(null);
  const listRef = useRef<FlatList<ChatMediaItem>>(null);
  const lang = getCurrentLocale();

  useEffect(() => {
    if (visible) setIndex(startIndex);
  }, [visible, startIndex]);

  const onScrollEnd = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const i = Math.round(e.nativeEvent.contentOffset.x / Math.max(1, width));
      setIndex(Math.max(0, Math.min(media.length - 1, i)));
    },
    [width, media.length],
  );

  const save = useCallback(
    async (all: boolean) => {
      if (saving) return;
      const entries = all ? media.map((item, i) => ({ item, index: i })) : media[index] ? [{ item: media[index], index }] : [];
      if (!entries.length) return;
      setSaving({ done: 0, total: entries.length });
      await saveChatMediaWithFeedback(entries, {
        campCode,
        at,
        onProgress: (done, total) => setSaving({ done, total }),
      });
      setSaving(null);
    },
    [saving, media, index, campCode, at],
  );

  const n = media.length;
  return (
    <Modal visible={visible} animationType="fade" onRequestClose={onClose} statusBarTranslucent navigationBarTranslucent supportedOrientations={['portrait']}>
      <View style={styles.root}>
        {visible && n > 0 ? (
          <FlatList
            ref={listRef}
            data={media}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            keyExtractor={(m, i) => `${i}_${m.path || m.url}`}
            initialScrollIndex={Math.min(startIndex, n - 1)}
            getItemLayout={(_, i) => ({ length: width, offset: width * i, index: i })}
            onMomentumScrollEnd={onScrollEnd}
            initialNumToRender={1}
            maxToRenderPerBatch={2}
            windowSize={3}
            renderItem={({ item, index: i }) => (
              <ViewerPage
                item={item}
                active={i === index}
                width={width}
                height={height}
                insetTop={insets.top}
                insetBottom={insets.bottom}
              />
            )}
            extraData={index}
          />
        ) : null}

        <View style={[styles.top, { paddingTop: insets.top + 6 }]} pointerEvents="box-none">
          <TouchableOpacity onPress={onClose} hitSlop={12} style={styles.iconBtn} accessibilityLabel={L('common.close')}>
            <Ionicons name="close" size={28} color="#ffffff" />
          </TouchableOpacity>
          <View style={styles.topCenter} pointerEvents="none">
            {n > 1 ? <Text style={styles.counter}>{L('chat.photoN', { i: index + 1, n })}</Text> : null}
            <Text style={styles.sender} numberOfLines={1}>{senderName}</Text>
            {at ? <Text style={styles.when}>{`${chatDayLabel(at, lang)} ${chatTimeLabel(at, lang)}`}</Text> : null}
          </View>
          <View style={styles.iconBtn} />
        </View>

        <View style={[styles.bottom, { paddingBottom: insets.bottom + 10 }]}>
          <TouchableOpacity style={styles.action} onPress={() => save(false)} disabled={!!saving}>
            <Ionicons name="download-outline" size={20} color="#ffffff" />
            <Text style={styles.actionText}>{L('chat.save')}</Text>
          </TouchableOpacity>
          {n > 1 ? (
            <TouchableOpacity style={styles.action} onPress={() => save(true)} disabled={!!saving}>
              <Ionicons name="albums-outline" size={20} color="#ffffff" />
              <Text style={styles.actionText}>{L('chat.saveAll')}</Text>
            </TouchableOpacity>
          ) : null}
        </View>

        {saving ? (
          <View style={styles.saving} pointerEvents="auto">
            <ActivityIndicator color="#ffffff" />
            <Text style={styles.savingText}>{L('chat.appSaving', { done: saving.done, total: saving.total })}</Text>
          </View>
        ) : null}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000000' },
  top: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: 12,
    paddingBottom: 10,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  iconBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  topCenter: { flex: 1, alignItems: 'center', paddingTop: 2 },
  counter: { color: '#ffffff', fontSize: 16, fontWeight: '700' },
  sender: { color: '#e2e8f0', fontSize: 13, marginTop: 2 },
  when: { color: '#cbd5e1', fontSize: 11.5, marginTop: 1 },
  bottom: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 28,
    paddingTop: 12,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  action: { alignItems: 'center', paddingHorizontal: 12, paddingVertical: 4 },
  actionText: { color: '#ffffff', fontSize: 12.5, marginTop: 3 },
  saving: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  savingText: { color: '#ffffff', fontSize: 14, marginTop: 10 },
});
