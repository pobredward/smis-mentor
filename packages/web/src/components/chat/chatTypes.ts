/**
 * 채팅 화면(web) 내부 타입 — 보내기 전 고른 파일 · 보내는 중인 메시지
 */
import type { ChatImageProbe, ChatPickKind, ChatVideoProbe } from '@/lib/chatMedia';

/** 보내기 전 미리보기 줄의 한 칸 */
export interface ChatTrayItem {
  id: string;
  file: File;
  kind: ChatPickKind;
  /** 작은 그림 주소 (object URL) — 아직 만드는 중이면 null */
  previewUrl: string | null;
  /** 열어 보는 중 */
  loading: boolean;
  w?: number;
  h?: number;
  durationMs?: number;
  imageProbe?: ChatImageProbe | null;
  videoProbe?: ChatVideoProbe | null;
}

/** 보내는 중 말풍선의 한 칸 (로컬 미리보기) */
export interface ChatOutgoingItem {
  kind: ChatPickKind;
  previewUrl: string | null;
  w?: number;
  h?: number;
  durationMs?: number;
}

/** 아직 서버 메시지가 되지 않은 내 메시지 — 사진 올리는 중 · 보내지 못함 */
export interface ChatOutgoing {
  clientId: string;
  roomId: string;
  kind: 'text' | 'media';
  /** 글 (사진 묶음이면 묶음 다음에 따로 보낼 글) */
  text: string;
  items: ChatOutgoingItem[];
  /** uploading 올리는 중 · failed 실패 · sent 메시지를 썼고 목록에 나타나기를 기다림 */
  status: 'uploading' | 'failed' | 'sent';
  /** 0~1 */
  progress: number;
  /** 다 올라간 파일 수 */
  done: number;
  messageId?: string;
  createdAt: number;
}
