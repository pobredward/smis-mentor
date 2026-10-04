'use client';

/**
 * 보내기 전 미리보기 줄 (고른 사진·동영상) — 고르기 · 끌어 놓기 · 붙여 넣기에서 같이 쓴다.
 * 고를 때 사진을 한 번 열어 본다: 못 여는 형식(크롬의 HEIC 등)은 빼고 알리고, 작은 그림을 미리 만든다.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { CHAT_LIMITS, L } from '@smis-mentor/shared';
import { chatPickKindOf, probeChatImage, probeChatVideo } from '@/lib/chatMedia';
import type { ChatTrayItem } from './chatTypes';

let seq = 0;
const nextId = () => `t${Date.now().toString(36)}${(seq++).toString(36)}`;

export function useChatTray() {
  const [items, setItems] = useState<ChatTrayItem[]>([]);
  const [original, setOriginal] = useState(false);
  const itemsRef = useRef<ChatTrayItem[]>([]);
  useEffect(() => {
    itemsRef.current = items;
  }, [items]);
  /** 넘겨준(보낸) 항목의 미리보기 주소는 여기서 풀지 않는다 */
  const handedOff = useRef(new Set<string>());

  const patch = useCallback((id: string, p: Partial<ChatTrayItem>) => {
    setItems((list) => list.map((x) => (x.id === id ? { ...x, ...p } : x)));
  }, []);

  const drop = useCallback((id: string) => {
    setItems((list) => {
      const it = list.find((x) => x.id === id);
      if (it?.previewUrl && !handedOff.current.has(id)) URL.revokeObjectURL(it.previewUrl);
      return list.filter((x) => x.id !== id);
    });
  }, []);

  const addFiles = useCallback((files: File[] | FileList | null | undefined) => {
    const all = Array.from(files ?? []);
    if (!all.length) return;
    const media = all.filter((f) => chatPickKindOf(f));
    if (media.length < all.length) toast.error(L('chat.webOnlyMedia'));
    const videoMaxMb = Math.round(CHAT_LIMITS.videoMaxBytes / 1024 / 1024);
    const sized = media.filter((f) => {
      if (chatPickKindOf(f) === 'video' && f.size > CHAT_LIMITS.videoMaxBytes) {
        toast.error(L('chat.videoTooLarge', { max: videoMaxMb }));
        return false;
      }
      return true;
    });
    const room = CHAT_LIMITS.mediaMax - itemsRef.current.length;
    let picked = sized;
    if (sized.length > room) {
      toast(L('chat.selectUpTo', { n: CHAT_LIMITS.mediaMax }));
      picked = sized.slice(0, Math.max(0, room));
    }
    if (!picked.length) return;
    const added: ChatTrayItem[] = picked.map((file) => ({ id: nextId(), file, kind: chatPickKindOf(file)!, previewUrl: null, loading: true }));
    setItems((list) => [...list, ...added]);
    added.forEach((it) => {
      if (it.kind === 'image') {
        probeChatImage(it.file)
          .then((p) => patch(it.id, { loading: false, previewUrl: URL.createObjectURL(p.thumb), w: p.w, h: p.h, imageProbe: p }))
          .catch(() => {
            toast.error(L('chat.webImageDecodeFailed', { name: it.file.name }));
            drop(it.id);
          });
      } else {
        probeChatVideo(it.file).then((p) =>
          patch(it.id, { loading: false, previewUrl: p.thumb ? URL.createObjectURL(p.thumb) : null, w: p.w, h: p.h, durationMs: p.durationMs, videoProbe: p }),
        );
      }
    });
  }, [drop, patch]);

  /** 보내기 — 지금 목록을 넘기고 비운다 (미리보기 주소는 보내는 쪽이 푼다) */
  const take = useCallback((): ChatTrayItem[] => {
    const list = itemsRef.current.filter((x) => !x.loading);
    list.forEach((x) => handedOff.current.add(x.id));
    setItems([]);
    setOriginal(false);
    return list;
  }, []);

  // 화면을 떠나면 보내지 않은 미리보기 주소 정리
  useEffect(() => () => {
    itemsRef.current.forEach((x) => { if (x.previewUrl && !handedOff.current.has(x.id)) URL.revokeObjectURL(x.previewUrl); });
  }, []);

  return {
    items,
    original,
    setOriginal,
    addFiles,
    remove: drop,
    take,
    busy: items.some((x) => x.loading),
  };
}

export type ChatTray = ReturnType<typeof useChatTray>;
