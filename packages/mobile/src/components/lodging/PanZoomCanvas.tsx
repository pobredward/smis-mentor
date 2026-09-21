import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  type LayoutChangeEvent,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';

export interface PanZoomRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface PanZoomHandle {
  /** 전체가 화면에 들어오게 */
  fit: () => void;
  /** 내용 좌표의 이 사각형이 화면 가운데 오게 옮긴다. scale 을 주면 그 배율로 (없으면 1배 이상) */
  focus: (r: PanZoomRect, scale?: number) => void;
}

interface Props {
  children: React.ReactNode;
  /**
   * 처음 보여 줄 모양.
   * 'start' 실제 크기로 왼쪽 위부터 · 'fitWidth' 폭에 맞춰 위부터 · 'fit' 전체가 들어오게
   */
  initial?: 'start' | 'fitWidth' | 'fit';
  maxScale?: number;
  style?: StyleProp<ViewStyle>;
}

/** 내용 가장자리와 화면 가장자리 사이 여유 */
const MARGIN = 12;

/**
 * 지도처럼 움직이는 판 — 한 손가락은 어느 방향으로든 끌기, 두 손가락은 확대·축소(와 이동).
 *
 * 세로 스크롤 안에 가로 스크롤을 넣으면 손가락을 대는 순간 둘 중 하나만 제스처를 가져가
 * 대각선으로 움직일 수 없다. 여기서는 스크롤 뷰 없이 이동·배율을 직접 들고 있는다.
 *
 * 앱의 다른 제스처(업무 탭)와 같이 gesture-handler + RN Animated(runOnJS) 로 만든다.
 * 끌기는 8px 이상 움직여야 시작하므로, 짧게 누르면 안쪽 칸의 onPress 가 그대로 불린다.
 */
export const PanZoomCanvas = forwardRef<PanZoomHandle, Props>(function PanZoomCanvas(
  { children, initial = 'start', maxScale = 2.5, style },
  ref
) {
  const viewSize = useRef({ w: 0, h: 0 });
  const contentSize = useRef({ w: 0, h: 0 });
  const cur = useRef({ s: 1, x: MARGIN, y: MARGIN });
  const placed = useRef(false);

  const sc = useRef(new Animated.Value(1)).current;
  const tx = useRef(new Animated.Value(MARGIN)).current;
  const ty = useRef(new Animated.Value(MARGIN)).current;
  const [zoomed, setZoomed] = useState(false);

  // 움직이는 중에도 cur 가 실제 값을 따라가게 (끌다가 멈춘 자리에서 이어서 잡을 수 있게)
  useEffect(() => {
    const a = sc.addListener(({ value }) => (cur.current.s = value));
    const b = tx.addListener(({ value }) => (cur.current.x = value));
    const c = ty.addListener(({ value }) => (cur.current.y = value));
    return () => {
      sc.removeListener(a);
      tx.removeListener(b);
      ty.removeListener(c);
    };
  }, [sc, tx, ty]);

  /** 전체가 들어오는 배율 (1 보다 크게는 키우지 않는다) */
  const fitScale = useCallback(() => {
    const v = viewSize.current;
    const c = contentSize.current;
    if (!v.w || !c.w || !c.h) return 1;
    return Math.min(1, (v.w - MARGIN * 2) / c.w, (v.h - MARGIN * 2) / c.h);
  }, []);

  const clampScale = useCallback((s: number) => Math.max(fitScale(), Math.min(maxScale, s)), [fitScale, maxScale]);

  /** 한 축: 내용이 화면보다 작으면 가운데, 크면 가장자리가 안쪽으로 들어오지 않게 */
  const clampAxis = (t: number, size: number, view: number) => {
    if (size + MARGIN * 2 <= view) return (view - size) / 2;
    return Math.min(MARGIN, Math.max(view - size - MARGIN, t));
  };

  const clamped = useCallback(
    (s: number, x: number, y: number) => {
      const c = contentSize.current;
      const v = viewSize.current;
      const ss = clampScale(s);
      return { s: ss, x: clampAxis(x, c.w * ss, v.w), y: clampAxis(y, c.h * ss, v.h) };
    },
    [clampScale]
  );

  const stop = useCallback(() => {
    sc.stopAnimation();
    tx.stopAnimation();
    ty.stopAnimation();
  }, [sc, tx, ty]);

  const set = useCallback(
    (s: number, x: number, y: number) => {
      const n = clamped(s, x, y);
      cur.current = n;
      sc.setValue(n.s);
      tx.setValue(n.x);
      ty.setValue(n.y);
    },
    [clamped, sc, tx, ty]
  );

  const animateTo = useCallback(
    (s: number, x: number, y: number, duration = 260) => {
      const n = clamped(s, x, y);
      setZoomed(n.s > fitScale() + 0.01);
      Animated.parallel([
        Animated.timing(sc, { toValue: n.s, duration, easing: Easing.out(Easing.cubic), useNativeDriver: false }),
        Animated.timing(tx, { toValue: n.x, duration, easing: Easing.out(Easing.cubic), useNativeDriver: false }),
        Animated.timing(ty, { toValue: n.y, duration, easing: Easing.out(Easing.cubic), useNativeDriver: false }),
      ]).start();
    },
    [clamped, fitScale, sc, tx, ty]
  );

  // 판이 아직 자리를 못 잡았을 때 들어온 focus 는 자리를 잡은 뒤에 한다 (보기를 바꾸자마자 검색한 방으로 갈 때)
  const pendingFocus = useRef<{ r: PanZoomRect; scale?: number } | null>(null);
  const focusNow = useCallback(
    (r: PanZoomRect, scale?: number) => {
      const v = viewSize.current;
      const s = clampScale(scale ?? Math.max(cur.current.s, 1));
      animateTo(s, v.w / 2 - (r.x + r.w / 2) * s, v.h / 2 - (r.y + r.h / 2) * s, 380);
    },
    [animateTo, clampScale]
  );
  const focus = useCallback(
    (r: PanZoomRect, scale?: number) => {
      const v = viewSize.current;
      const c = contentSize.current;
      if (!placed.current || !v.w || !c.w) {
        pendingFocus.current = { r, scale };
        return;
      }
      focusNow(r, scale);
    },
    [focusNow]
  );
  const flushFocus = useCallback(() => {
    const p = pendingFocus.current;
    if (!p) return;
    pendingFocus.current = null;
    focusNow(p.r, p.scale);
  }, [focusNow]);

  /** 처음 자리 — 화면과 내용 크기를 둘 다 알게 된 뒤 한 번 */
  const place = useCallback(() => {
    const v = viewSize.current;
    const c = contentSize.current;
    if (!v.w || !v.h || !c.w || !c.h) return;
    if (placed.current) {
      // 크기만 바뀐 경우 — 지금 자리를 그대로 두고 범위만 다시 맞춘다
      set(cur.current.s, cur.current.x, cur.current.y);
      flushFocus();
      return;
    }
    placed.current = true;
    if (initial === 'fit') {
      const s = fitScale();
      set(s, (v.w - c.w * s) / 2, (v.h - c.h * s) / 2);
    } else if (initial === 'fitWidth') {
      const s = Math.min(1, (v.w - MARGIN * 2) / c.w);
      set(s, MARGIN, MARGIN);
    } else {
      set(1, MARGIN, MARGIN);
    }
    setZoomed(cur.current.s > fitScale() + 0.01);
    flushFocus();
  }, [fitScale, flushFocus, initial, set]);

  const onViewLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    viewSize.current = { w: width, h: height };
    place();
  };
  const onContentLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    contentSize.current = { w: width, h: height };
    place();
  };

  const fit = useCallback(() => {
    const v = viewSize.current;
    const c = contentSize.current;
    const s = fitScale();
    animateTo(s, (v.w - c.w * s) / 2, (v.h - c.h * s) / 2);
  }, [animateTo, fitScale]);

  /** 화면 가운데를 기준으로 실제 크기(1배)로 */
  const actualSize = useCallback(() => {
    const v = viewSize.current;
    const { s, x, y } = cur.current;
    const cx = (v.w / 2 - x) / s;
    const cy = (v.h / 2 - y) / s;
    animateTo(1, v.w / 2 - cx, v.h / 2 - cy);
  }, [animateTo]);

  useImperativeHandle(ref, () => ({ fit, focus }), [fit, focus]);

  // ── 제스처
  const pinching = useRef(false);
  const rebase = useRef(false);
  const panBase = useRef({ x: 0, y: 0 });
  const panPointers = useRef(0);
  const multiTouch = useRef(false);
  /** k: 확대를 (다시) 시작할 때의 e.scale — 손가락을 뗐다 다시 대도 배율이 이어지게 */
  const pinchBase = useRef({ s: 1, x: 0, y: 0, fx: 0, fy: 0, k: 1 });

  // 제스처는 한 번만 만든다 — 콜백은 ref 와 고정된 함수만 쓴다
  const gesture = useMemo(() => {
    const pan = Gesture.Pan()
      .runOnJS(true)
      .minDistance(8)
      .averageTouches(true)
      .onStart((e) => {
        stop();
        panBase.current = { x: cur.current.x - e.translationX, y: cur.current.y - e.translationY };
        panPointers.current = e.numberOfPointers;
        multiTouch.current = e.numberOfPointers > 1;
      })
      .onUpdate((e) => {
        // 손가락 수가 바뀌는 순간에는 기준(손가락들의 가운데)이 튄다 — 그 프레임은 기준만 다시 잡고 움직이지 않는다
        if (e.numberOfPointers !== panPointers.current) {
          panPointers.current = e.numberOfPointers;
          if (e.numberOfPointers > 1) multiTouch.current = true;
          rebase.current = true;
        }
        if (pinching.current) return;
        if (rebase.current) {
          panBase.current = { x: cur.current.x - e.translationX, y: cur.current.y - e.translationY };
          rebase.current = false;
          return;
        }
        set(cur.current.s, panBase.current.x + e.translationX, panBase.current.y + e.translationY);
      })
      .onEnd((e) => {
        // 두 손가락을 썼던 제스처는 손을 뗄 때 속도가 부정확하다 — 미끄러지기 없이 그 자리에 멈춘다
        if (pinching.current || multiTouch.current) return;
        // 살짝 미끄러지듯 멈춘다
        const speed = Math.hypot(e.velocityX, e.velocityY);
        if (speed > 250) {
          const k = 0.16;
          animateTo(cur.current.s, cur.current.x + e.velocityX * k, cur.current.y + e.velocityY * k, 320);
        }
      });

    const pinch = Gesture.Pinch()
      .runOnJS(true)
      .onStart((e) => {
        stop();
        pinching.current = true;
        pinchBase.current = { ...cur.current, fx: e.focalX, fy: e.focalY, k: e.scale || 1 };
      })
      .onUpdate((e) => {
        // 두 손가락 중 하나를 떼면 확대 제스처가 남은 손가락 위치를 '가운데'로 한 번 더 보낸다.
        // 그걸 따라가면 화면이 튄다 — 손가락이 둘이 아니면 확대를 멈추고, 한 손가락 끌기가 이어받는다.
        if (e.numberOfPointers < 2) {
          if (pinching.current) {
            pinching.current = false;
            rebase.current = true;
          }
          return;
        }
        if (!pinching.current) {
          // 뗐던 손가락을 다시 댄 경우 — 지금 자리에서 새로 시작
          pinching.current = true;
          pinchBase.current = { ...cur.current, fx: e.focalX, fy: e.focalY, k: e.scale || 1 };
          return;
        }
        const b = pinchBase.current;
        const s = clampScale((b.s * e.scale) / b.k);
        // 손가락 사이에 있던 점이 손가락을 따라가게 — 벌리면 확대, 같이 밀면 이동
        const px = (b.fx - b.x) / b.s;
        const py = (b.fy - b.y) / b.s;
        set(s, e.focalX - px * s, e.focalY - py * s);
      })
      .onEnd(() => {
        pinching.current = false;
        rebase.current = true;
        setZoomed(cur.current.s > fitScale() + 0.01);
      });
    return Gesture.Simultaneous(pan, pinch);
  }, [animateTo, clampScale, fitScale, set, stop]);

  return (
    <View style={[styles.viewport, style]} onLayout={onViewLayout}>
      <GestureDetector gesture={gesture}>
        <View style={styles.fill} collapsable={false}>
          <Animated.View
            onLayout={onContentLayout}
            style={[styles.content, { transform: [{ translateX: tx }, { translateY: ty }, { scale: sc }] }]}
          >
            {children}
          </Animated.View>
        </View>
      </GestureDetector>
      <View style={styles.controls} pointerEvents="box-none">
        <TouchableOpacity style={styles.ctrl} onPress={zoomed ? fit : actualSize} hitSlop={6}>
          <Text style={styles.ctrlText}>{zoomed ? '전체 보기' : '크게 보기'}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  viewport: { flex: 1, overflow: 'hidden', backgroundColor: '#f8fafc' },
  fill: { position: 'absolute', left: 0, top: 0, right: 0, bottom: 0 },
  // 크기는 내용이 정한다 — 화면 폭에 눌리지 않게 절대 위치로 둔다. 배율은 왼쪽 위 기준.
  content: { position: 'absolute', left: 0, top: 0, transformOrigin: 'left top' },
  controls: { position: 'absolute', right: 10, bottom: 10 },
  ctrl: {
    backgroundColor: 'rgba(17,24,39,0.82)',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  ctrlText: { color: '#fff', fontSize: 12, fontWeight: '600' },
});
