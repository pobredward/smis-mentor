/**
 * 채팅 — 음성 메시지 보내기 (shared sendChatMessage 의 kind 'voice')
 * 받는 쪽은 kind 'voice' 메시지의 첫 파일을 음성으로 본다 (예전에 'image' 로 저장된 것도 재생된다).
 */
import { sendChatMessage, type ChatReplyRef } from '@smis-mentor/shared';
import { db } from '../config/firebase';

export async function sendChatVoiceMessage(
  roomId: string,
  input: {
    id: string;
    senderId: string;
    senderName: string;
    clientId: string;
    audio: { url: string; path: string; durationMs: number; size: number };
    replyTo?: ChatReplyRef | null;
    silent?: boolean;
  },
): Promise<void> {
  await sendChatMessage(db, roomId, {
    id: input.id,
    senderId: input.senderId,
    senderName: input.senderName,
    clientId: input.clientId,
    kind: 'voice',
    media: [{
      kind: 'audio',
      url: input.audio.url,
      path: input.audio.path,
      durationMs: Math.max(1, Math.round(input.audio.durationMs)),
      size: Math.round(input.audio.size),
      contentType: 'audio/mp4',
    }],
    replyTo: input.replyTo ?? null,
    silent: input.silent,
  });
}
