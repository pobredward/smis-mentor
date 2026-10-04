/**
 * 채팅 (카톡방 대체) — web·mobile·서버 공용 타입
 *
 * Firestore
 *  chatRooms/{roomId}                 방. 서버(/api/chat/sync · /api/chat/dm)만 만들고 사람을 바꾼다
 *    messages/{messageId}             메시지. 방 사람이 직접 쓴다 (규칙으로 검사)
 *    reads/{uid}                      그 사람이 이 방을 마지막으로 본 시각 — 본인만 쓴다 (안 읽은 사람 수 '1')
 *  chatUserState/{uid}                방별 안 읽은 수 · 알림 끈 방 · 차단한 사람 — 본인 (안 읽은 수는 서버가 더한다)
 *
 * Storage: chat/{roomId}/{uid}/{messageId}/{0.jpg | 0_t.jpg …}
 *
 * 캠프 방 (캠프마다 5개, id = `${jobCodeId}_${type}`)
 *  camp_all           전체방      매니저 + 멘토 + 원어민
 *  camp_mentor        멘토방      매니저 + 멘토
 *  camp_mentor_only   멘토끼리    멘토 (부매니저 포함, 매니저 빠짐)
 *  camp_foreign       원어민방    매니저 + 원어민
 *  camp_foreign_only  원어민끼리  원어민 (Sub Manager 포함, 매니저 빠짐)
 * 매니저 = 그 캠프 그룹 역할이 '매니저'/'Manager' 인 사람, 또는 관리자(admin).
 *   관리자는 같은 기수(29기 …)의 캠프 하나에라도 배정돼 있으면 그 기수 모든 캠프 방의 매니저다 (J29 만 배정돼도 E29·S29 방까지).
 *   끼리 방은 관리자도 못 본다.
 * 방은 캠프마다 처음부터 있다 (캠프 코드를 만들면 서버가 만든다). 사람이 나중에 배정돼도 지난 대화를 모두 본다.
 * DM: id = `dm_${uid 작은 쪽}_${uid 큰 쪽}`
 */
import type { Timestamp } from 'firebase/firestore';

export const CAMP_CHAT_ROOM_TYPES = ['camp_all', 'camp_mentor', 'camp_mentor_only', 'camp_foreign', 'camp_foreign_only'] as const;
export type CampChatRoomType = typeof CAMP_CHAT_ROOM_TYPES[number];
export type ChatRoomType = CampChatRoomType | 'dm';

/** 방에서 그 사람의 자리 — 매니저(관리자·매니저) / 멘토(부매니저 포함) / 원어민 */
export type ChatMemberKind = 'manager' | 'mentor' | 'foreign';

export interface ChatMemberInfo {
  name: string;
  photo?: string;
  kind: ChatMemberKind;
  /** 계정 역할 (admin · mentor · foreign) */
  role?: string;
  /** 캠프에서의 역할 "Summer 담임 S10", "매니저" (DM 은 비어 있을 수 있다) */
  label?: string;
}

export type ChatMessageKind = 'text' | 'media' | 'system';

export interface ChatMediaItem {
  kind: 'image' | 'video';
  /** 보기용 (일반 화질 2048px · 원본이면 원본) */
  url: string;
  /** Storage 경로 — 지울 때 */
  path: string;
  /** 작은 그림 (480px) — 목록·묶음 칸 */
  thumbUrl?: string;
  thumbPath?: string;
  w?: number;
  h?: number;
  /** 바이트 */
  size?: number;
  durationMs?: number;
  contentType?: string;
  /** 원본으로 보냈는가 */
  original?: boolean;
}

export interface ChatMessage {
  id: string;
  senderId: string;
  senderName: string;
  kind: ChatMessageKind;
  text?: string;
  /** 사진·동영상 (최대 10개 — 카톡 묶어 보내기처럼 한 말풍선) */
  media?: ChatMediaItem[];
  /** 보낸 기기에서 만든 id — 보내는 중 말풍선과 짝 맞추기 */
  clientId?: string;
  /** 서버 시각. 보내는 중에는 추정값(serverTimestamps: 'estimate') */
  createdAt: Timestamp | null;
  deleted?: boolean;
  deletedAt?: Timestamp | null;
}

/** 화면용 — 아직 서버에 닿지 않은 메시지 */
export interface ChatMessageView extends ChatMessage {
  pending?: boolean;
}

export interface ChatLastMessage {
  messageId?: string;
  kind: ChatMessageKind;
  /** 글 (200자까지). 사진·동영상만 있으면 '' */
  text: string;
  senderId: string;
  senderName: string;
  imageCount?: number;
  videoCount?: number;
  deleted?: boolean;
}

export interface ChatRoom {
  id: string;
  type: ChatRoomType;
  /** 캠프 방 — 캠프(jobCode) id · 코드 */
  jobCodeId?: string | null;
  campCode?: string | null;
  /** 캠프 기수 '29기' (캠프 방) */
  generation?: string | null;
  memberIds: string[];
  memberInfo?: Record<string, ChatMemberInfo>;
  lastMessage?: ChatLastMessage | null;
  lastMessageAt?: Timestamp | null;
  messageCount?: number;
  createdAt?: Timestamp | null;
  updatedAt?: Timestamp | null;
  syncedAt?: Timestamp | null;
}

export interface ChatRead {
  uid: string;
  at: Timestamp | null;
}

export interface ChatUserState {
  /** 방별 안 읽은 메시지 수 — 서버가 더하고, 읽으면 본인이 0 으로 */
  unread?: Record<string, number>;
  /** 알림 끈 방 */
  muted?: Record<string, boolean>;
  /** 차단한 사람 — 그 사람 메시지를 가리고 알림도 받지 않는다 */
  blocked?: Record<string, boolean>;
  updatedAt?: Timestamp | null;
}

export type ChatReportReason = 'spam' | 'abuse' | 'sexual' | 'privacy' | 'other';
