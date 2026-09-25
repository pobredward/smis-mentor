'use client';

import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import {
  lodgingViewerHtml,
  lodgingViewerRooms,
  type LodgingBuilding,
  type LodgingPlaceView,
  type LodgingRoomView,
  type LodgingViewerMode,
} from '@smis-mentor/shared';

export interface LodgingViewerHandle {
  /** 준비되기 전에 보내면 준비된 뒤에 전달된다 */
  send: (cmd: { type: 'goTo'; num: string } | { type: 'setFloor'; floor: number } | { type: 'setMode'; mode: 'orbit' | 'walk' }) => void;
}

interface Props {
  building: LodgingBuilding;
  rooms: Map<string, LodgingRoomView>;
  places: LodgingPlaceView[];
  mode: LodgingViewerMode;
  floor?: number;
  className?: string;
  onRoom: (num: string) => void;
  onPlace: (id: string) => void;
  onFloor?: (floor: number) => void;
}

/**
 * 3D — shared 가 만든 한 장짜리 HTML 을 iframe 으로 띄운다.
 * 모바일 WebView 와 같은 문서라 두 플랫폼이 똑같이 보인다.
 */
const LodgingViewer = forwardRef<LodgingViewerHandle, Props>(function LodgingViewer(
  { building, rooms, places, mode, floor, className, onRoom, onPlace, onFloor },
  ref
) {
  const frame = useRef<HTMLIFrameElement>(null);
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

  // 문서가 바뀌면 다시 준비를 기다린다
  useEffect(() => {
    setReady(false);
  }, [html]);

  const post = (cmd: object) => {
    frame.current?.contentWindow?.postMessage({ source: 'lodging-host', ...cmd }, '*');
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

  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (e.source !== frame.current?.contentWindow) return;
      const m = e.data;
      if (!m || m.source !== 'lodging-viewer') return;
      if (m.type === 'ready') {
        setReady(true);
        queue.current.splice(0).forEach(post);
      } else if (m.type === 'room') onRoom(String(m.num));
      else if (m.type === 'place') onPlace(String(m.id));
      else if (m.type === 'floor') onFloor?.(Number(m.floor));
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [onRoom, onPlace, onFloor]);

  return (
    <iframe
      ref={frame}
      title="3D 숙소"
      srcDoc={html}
      className={className ?? 'h-[640px] w-full rounded-xl border border-gray-200 bg-white'}
      sandbox="allow-scripts"
    />
  );
});

export default LodgingViewer;
