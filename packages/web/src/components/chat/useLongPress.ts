'use client';

/**
 * 길게 누르기(터치 0.5초) · 우클릭 → 메뉴 열기. 누른 뒤 따라오는 click 은 막는다.
 */
import { useRef, type MouseEvent, type TouchEvent } from 'react';
import type { ChatMenuAnchor } from './ChatMenus';

const isCoarse = () => typeof window !== 'undefined' && !!window.matchMedia?.('(pointer: coarse)').matches;

/** 길게 누르기 (터치) — 0.5초. 누른 뒤 따라오는 click 은 막는다 */
export function useLongPress(onLongPress: (a: ChatMenuAnchor) => void) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const start = useRef<{ x: number; y: number } | null>(null);
  const fired = useRef(false);
  const clear = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };
  return {
    onTouchStart: (e: TouchEvent) => {
      const t = e.touches[0];
      start.current = { x: t.clientX, y: t.clientY };
      fired.current = false;
      clear();
      timer.current = setTimeout(() => {
        fired.current = true;
        if (navigator.vibrate) navigator.vibrate(10);
        onLongPress({ x: t.clientX, y: t.clientY, sheet: true });
      }, 500);
    },
    onTouchMove: (e: TouchEvent) => {
      const t = e.touches[0];
      const s = start.current;
      if (s && Math.hypot(t.clientX - s.x, t.clientY - s.y) > 10) clear();
    },
    onTouchEnd: clear,
    onTouchCancel: clear,
    onClickCapture: (e: MouseEvent) => {
      if (fired.current) {
        fired.current = false;
        e.preventDefault();
        e.stopPropagation();
      }
    },
    onContextMenu: (e: MouseEvent) => {
      e.preventDefault();
      clear();
      if (fired.current) return; // 터치 길게 누르기에서 이미 열었다
      onLongPress({ x: e.clientX, y: e.clientY, sheet: isCoarse() });
    },
  };
}

