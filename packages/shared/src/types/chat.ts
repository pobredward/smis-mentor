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
 * 캠프 방 (캠프마다 6개, id = `${jobCodeId}_${type}`)
 *  camp_all           전체방      매니저 + 멘토 + 원어민
 *  camp_manager       매니저방    매니저 + 부매니저 (멘토 '부매니저' · 원어민 'Sub Manager')
 *  camp_mentor        멘토방      매니저 + 멘토
 *  camp_mentor_only   멘토끼리    멘토 (부매니저 포함, 매니저 빠짐)
 *  camp_foreign       원어민방    매니저 + 원어민
 *  camp_foreign_only  원어민끼리  원어민 (Sub Manager 포함, 매니저 빠짐)
 * 매니저 = 그 캠프 그룹 역할이 '매니저'/'Manager' 인 사람, 또는 관리자(admin).
 *   관리자는 같은 기수(29기 …)의 캠프 하나에라도 배정돼 있으면 그 기수 모든 캠프 방의 매니저다 (J29 만 배정돼도 E29·S29 방까지).
 *   끼리 방은 관리자도 못 본다.
 * 방은 캠프마다 처음부터 있다 (캠프 코드를 만들면 서버가 만든다). 사람이 나중에 배정돼도 지난 대화를 모두 본다.
 * 그룹방 (캠프 그룹마다, id = `${jobCodeId}_group_${groupKey}`) — 매니저 + 그 그룹 멘토(부매니저 포함). 원어민은 없음.
 * 캠프 방 · 그룹방 = 미리 만들어진 방(preset) — 목록 위에 고정, 고정 해제 · 숨기기 불가.
 * DM: id = `dm_${uid 작은 쪽}_${uid 큰 쪽}`
 *
 * chatScheduled/{id}                 예약 메시지 — 보낸 사람만 읽고 지운다. Functions 가 1분마다 보낸다.
 */
import type { Timestamp } from 'firebase/firestore';

export const CAMP_CHAT_ROOM_TYPES = ['camp_all', 'camp_mentor', 'camp_mentor_only', 'camp_foreign', 'camp_foreign_only', 'camp_manager'] as const;
export type CampChatRoomType = typeof CAMP_CHAT_ROOM_TYPES[number];
export type ChatRoomType = CampChatRoomType | 'camp_group' | 'dm';

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

/** text 글 · media 사진/동영상 묶음 · voice 음성 메시지 · poll 투표 · system 서버가 쓴 알림(공지 등록 등) */
export type ChatMessageKind = 'text' | 'media' | 'voice' | 'poll' | 'system';

export interface ChatMediaItem {
  kind: 'image' | 'video' | 'audio';
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
  /** 답장 — 원래 메시지 요약 */
  replyTo?: ChatReplyRef | null;
  /** @멘션한 사람 uid */
  mentions?: string[];
  /** @모두 (매니저만) */
  mentionAll?: boolean;
  /** 조용히 보내기 — 받는 사람 알림에 소리·진동 없음 */
  silent?: boolean;
  /** 고친 시각 (글만, 24시간 안) */
  editedAt?: Timestamp | null;
  /** 공감 — uid → 종류 (한 사람 하나) */
  reactions?: Record<string, ChatReactionKey>;
  /** 투표 */
  poll?: ChatPoll | null;
  /** 투표한 것 — uid → 고른 항목 id */
  pollVotes?: Record<string, string[]>;
  /** 투표 마감 (만든 사람) */
  pollClosed?: boolean;
  /** 공지 '확인' — uid → 누른 시각 */
  acks?: Record<string, Timestamp>;
  /** 예약해서 보낸 메시지 */
  scheduled?: boolean;
  /** system 메시지의 종류 — notice 공지 등록 · call 통화 기록(통화 연결 후 서버가 쓴다) */
  systemType?: 'notice' | 'call';
  /** 통화 기록 (systemType 'call') */
  call?: ChatCallLog | null;
  /** 공지 등록 알림이 가리키는 메시지 */
  noticeOf?: string;
}

/** 답장할 때 붙는 원래 메시지 요약 */
export interface ChatReplyRef {
  id: string;
  senderId: string;
  senderName: string;
  kind: ChatMessageKind;
  /** 원래 글 (100자까지) · 사진이면 '' */
  text: string;
  /** 사진·동영상이면 첫 작은 그림 */
  thumbUrl?: string;
  /** 원래 메시지가 삭제됨 (서버가 표시) */
  deleted?: boolean;
}

export const CHAT_REACTIONS = ['check', 'heart', 'like', 'laugh', 'wow', 'sad'] as const;
export type ChatReactionKey = typeof CHAT_REACTIONS[number];
export const CHAT_REACTION_EMOJI: Record<ChatReactionKey, string> = {
  check: '✅', heart: '❤️', like: '👍', laugh: '😂', wow: '😮', sad: '😢',
};

export interface ChatPollOption {
  id: string;
  text: string;
}
export interface ChatPoll {
  question: string;
  /** 2~10개 */
  options: ChatPollOption[];
  /** 여러 개 고르기 */
  multi: boolean;
  /** 누가 뭘 골랐는지 숨기기 */
  anonymous: boolean;
  /** 마감 시각 (없으면 만든 사람이 닫을 때까지) */
  closesAt?: Timestamp | null;
  /** 마감 몇 분 전에 아직 투표하지 않은 사람에게 알림 (CHAT_POLL_REMIND_MINUTES 중 하나 · 마감 시각이 있을 때만) */
  remindMin?: number;
}

/** 방 공지 — 방 문서에 하나 (서버 /api/chat/notice 가 쓴다) */
export interface ChatNotice {
  messageId: string;
  kind: ChatMessageKind;
  /** 공지 글 (500자까지). 사진 공지는 '' */
  text: string;
  thumbUrl?: string;
  senderId: string;
  senderName: string;
  setBy: string;
  setByName: string;
  setAt: Timestamp | null;
}

/** 예약 메시지 — chatScheduled/{id} */
export interface ChatScheduledMessage {
  id: string;
  roomId: string;
  senderId: string;
  senderName: string;
  text: string;
  sendAt: Timestamp;
  createdAt: Timestamp | null;
  mentions?: string[];
  mentionAll?: boolean;
  silent?: boolean;
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
  /** 알림 메시지 종류 ('notice' · 'call') · 통화 기록 */
  systemType?: string;
  call?: ChatCallLog;
}

export interface ChatRoom {
  id: string;
  type: ChatRoomType;
  /** 캠프 방 — 캠프(jobCode) id · 코드 */
  jobCodeId?: string | null;
  campCode?: string | null;
  /** 캠프 기수 '29기' (캠프 방) */
  generation?: string | null;
  /** 그룹방 — 캠프 그룹 키 (junior · summer · short1 …) */
  groupKey?: string | null;
  memberIds: string[];
  memberInfo?: Record<string, ChatMemberInfo>;
  lastMessage?: ChatLastMessage | null;
  lastMessageAt?: Timestamp | null;
  messageCount?: number;
  /** 공지 (하나) */
  notice?: ChatNotice | null;
  /** 지금 이 방에서 하고 있는 통화 (통화 연결 후 서버가 쓴다 — 지금은 화면만) */
  activeCall?: ChatCallInfo | null;
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
  /** 숨긴 방 — 숨긴 시각(ms). 그 뒤에 새 메시지가 오면 다시 보인다 (미리 만든 방은 숨길 수 없음) */
  hidden?: Record<string, number>;
  /** 위에 고정한 방 — 고정한 시각(ms), 먼저 고정한 것이 위 (미리 만든 방은 늘 고정) */
  pinned?: Record<string, number>;
  updatedAt?: Timestamp | null;
}

export type ChatReportReason = 'spam' | 'abuse' | 'sexual' | 'privacy' | 'other';

// ── 통화 (Agora) ─────────────────────────────────────────────────────

/** 음성 · 영상 */
export type ChatCallMedia = 'voice' | 'video';

/** 방에서 진행 중인 통화 — room.activeCall */
export interface ChatCallInfo {
  callId: string;
  media: ChatCallMedia;
  startedBy: string;
  startedByName: string;
  /** ms */
  startedAt: number;
  participantIds: string[];
}

/**
 * 채팅에 남는 통화 기록 (system 메시지 systemType 'call', 보낸 사람 = 건 사람)
 *  started 단체 통화 시작 · ended 끝남(길이) · missed 1:1 응답 없음 · canceled 1:1 건 사람이 받기 전에 끊음
 *  declined 1:1 거절 · busy 1:1 상대가 다른 통화 중
 */
export interface ChatCallLog {
  callId: string;
  media: ChatCallMedia;
  status: 'started' | 'ended' | 'missed' | 'canceled' | 'declined' | 'busy';
  /** 끝난 통화의 길이 (ms) */
  durationMs?: number;
}

/** 통화 문서 상태 — ringing 1:1 벨 울리는 중 · active 통화 중 · ended 끝남 */
export type ChatCallStatus = 'ringing' | 'active' | 'ended';
export type ChatCallEndReason = 'ended' | 'missed' | 'canceled' | 'declined' | 'busy' | 'failed';

/**
 * chatCalls/{callId} — 통화 하나 (서버 /api/chat/call 만 쓴다. 방 사람 · 벨 받는 사람이 읽는다).
 * Agora 채널 이름 = callId. 시각은 모두 ms.
 */
export interface ChatCallDoc {
  id: string;
  /** OS 통화 화면(CallKit · ConnectionService)용 UUID — VoIP 푸시에도 같은 값 */
  uuid: string;
  roomId: string;
  direct: boolean;
  media: ChatCallMedia;
  status: ChatCallStatus;
  startedBy: string;
  startedByName: string;
  /** 1:1 벨을 받는 사람 */
  invitedIds: string[];
  /** 지금 통화 안에 있는 사람 */
  participantIds: string[];
  /** 한 번이라도 들어왔던 사람 */
  joinedIds: string[];
  /** Firebase uid → Agora uid (숫자) — 상대 영상·이름을 맞춘다 */
  agoraUids: Record<string, number>;
  /** 사람마다 마지막으로 살아 있다고 알린 시각 — 오래되면 서버가 뺀다 */
  lastSeen?: Record<string, number>;
  createdAt: number;
  /** 연결된 시각 (1:1 은 받은 때, 단체는 시작한 때) */
  connectedAt?: number;
  endedAt?: number;
  endedReason?: ChatCallEndReason;
  durationMs?: number;
}

/** /api/chat/call start · join 의 답 — 이걸로 Agora 채널에 들어간다 */
export interface ChatCallJoin {
  call: ChatCallDoc;
  appId: string;
  channel: string;
  token: string;
  /** 내 Agora uid */
  uid: number;
  /** 토큰 만료 (ms) */
  expiresAt: number;
}

export interface ChatCallParticipant {
  uid: string;
  name: string;
  photo?: string;
  micOn: boolean;
  camOn: boolean;
  /** 지금 말하는 중 (소리 크기로 판단) */
  speaking?: boolean;
  isMe?: boolean;
  /** Agora uid (영상을 그릴 때 — 나는 0) */
  agoraUid?: number;
  /** ms */
  joinedAt: number;
  connection?: 'good' | 'poor' | 'reconnecting';
}

/**
 * 통화 화면 상태
 *  idle 없음 · outgoing 1:1 거는 중(상대 벨) · incoming 1:1 받는 중 · connecting 연결 중 · inCall 통화 중 · ended 끝남(잠깐 보여 주고 idle)
 */
export type ChatCallPhase = 'idle' | 'outgoing' | 'incoming' | 'connecting' | 'inCall' | 'ended';

export interface ChatCallState {
  phase: ChatCallPhase;
  callId?: string;
  roomId?: string;
  /** 1:1(DM) 인가 — 1:1 은 벨이 울리고, 단체는 '참여' 방식 */
  direct?: boolean;
  media: ChatCallMedia;
  /** 나 포함 */
  participants: ChatCallParticipant[];
  micOn: boolean;
  camOn: boolean;
  speakerOn: boolean;
  frontCamera: boolean;
  /** 통화가 연결된 시각 (ms) */
  startedAt?: number;
  /** 1:1 받는 중 · 거는 중일 때 상대 */
  peer?: { uid: string; name: string; photo?: string };
  /** declined 내가 거절 · rejected 상대가 거절 · busy 상대가 다른 통화 중 · missed 받지 못함 · failed 연결 실패 · elsewhere 내 다른 기기에서 받음 (화면 없이 idle) */
  endedReason?: 'left' | 'ended' | 'declined' | 'rejected' | 'missed' | 'busy' | 'failed' | 'elsewhere';
  /** 작게 보기 (채팅을 보면서 통화) */
  minimized: boolean;
  /** 미리보기용 가짜 연결인가 */
  mock?: boolean;
}

/**
 * 통화 연결 — 화면은 이 모양만 쓴다. 실제 통화는 createCallController(Agora 엔진), 미리보기는 createMockCallAdapter(가짜).
 */
export interface ChatCallAdapter {
  getState(): ChatCallState;
  subscribe(cb: (s: ChatCallState) => void): () => void;
  /** 방에서 통화 시작 (단체방: 바로 연결, 1:1: 상대에게 벨) */
  start(args: { roomId: string; media: ChatCallMedia; direct: boolean; peer?: { uid: string; name: string; photo?: string } }): Promise<void>;
  /** 진행 중인 통화에 참여 */
  join(args: { roomId: string; callId: string; media: ChatCallMedia }): Promise<void>;
  /** 1:1 걸려 온 통화 받기 · 거절 */
  accept(opts?: { media?: ChatCallMedia }): Promise<void>;
  decline(): Promise<void>;
  /** 나가기 (1:1 은 끊기) */
  leave(): Promise<void>;
  setMic(on: boolean): void;
  setCamera(on: boolean): void;
  switchCamera(): void;
  setSpeaker(on: boolean): void;
  setMinimized(on: boolean): void;
}

