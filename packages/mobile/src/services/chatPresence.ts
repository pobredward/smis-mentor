/**
 * 채팅 — 지금 열려 있는 방 · 알림으로 열 방 (작은 전역 상태)
 *
 * - setOpenChatRoom / getOpenChatRoom: 대화방 화면이 포커스되어 있는 동안 그 방 id.
 *   알림 핸들러가 "지금 보고 있는 방의 알림"이면 배너·소리를 내지 않는 데 쓴다.
 * - queueChatRoomOpen: 채팅 알림을 눌렀을 때 열 방. 앱이 막 켜져 로그인·화면 준비가 덜 됐을 수 있으므로
 *   여기에 넣어 두고, 채팅을 쓸 수 있는 상태(MainTabs)가 되면 꺼내서 연다 (useChatPushNavigation).
 */

let openRoomId: string | null = null;

/** 대화방 화면이 포커스되면 방 id, 벗어나면 null */
export function setOpenChatRoom(roomId: string | null): void {
  openRoomId = roomId;
}

/** 이 방에서 나갈 때 — 다른 방이 이미 열렸으면 건드리지 않는다 */
export function clearOpenChatRoom(roomId: string): void {
  if (openRoomId === roomId) openRoomId = null;
}

export function getOpenChatRoom(): string | null {
  return openRoomId;
}

// ── 알림으로 열 방 ───────────────────────────────────────────────────

let queuedRoomId: string | null = null;
const handledResponseIds = new Set<string>();
const queueListeners = new Set<() => void>();

/**
 * 알림을 눌러 열 방을 예약한다.
 * @param responseId 같은 알림 응답을 두 번 처리하지 않도록 (앱 시작 시 마지막 응답 + 리스너가 겹칠 수 있음)
 */
export function queueChatRoomOpen(roomId: string, responseId?: string): void {
  if (!roomId) return;
  if (responseId) {
    if (handledResponseIds.has(responseId)) return;
    handledResponseIds.add(responseId);
  }
  queuedRoomId = roomId;
  queueListeners.forEach((l) => l());
}

/** 예약된 방을 꺼낸다 (한 번만) */
export function takeQueuedChatRoom(): string | null {
  const id = queuedRoomId;
  queuedRoomId = null;
  return id;
}

export function onChatRoomQueued(listener: () => void): () => void {
  queueListeners.add(listener);
  return () => {
    queueListeners.delete(listener);
  };
}
