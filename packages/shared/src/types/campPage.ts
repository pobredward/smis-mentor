import { Timestamp } from 'firebase/firestore';

export type CampPageCategory = 'education' | 'schedule' | 'guide';
export type CampPageRole = 'common' | 'mentor' | 'foreign';

export interface CampPage {
  id: string;
  jobCodeId: string;
  category: CampPageCategory;
  title: string;
  targetRole: CampPageRole;
  
  // Tiptap 에디터 HTML 콘텐츠
  content: string;
  
  // 아이콘 이모지 (관리자가 설정)
  emoji?: string;
  
  // 메타데이터
  order: number;
  createdAt: Timestamp;
  createdBy: string;
  updatedAt: Timestamp;
  updatedBy: string;
}

// Firestore 문서에서 읽을 때 사용
export interface CampPageDocument extends Omit<CampPage, 'id'> {
  // Firestore 문서는 id를 별도로 가짐
}

// 클라이언트에서 표시할 때 사용 (페이지 + 링크 통합)
export interface DisplayItem {
  id: string;
  title: string;
  type: 'page' | 'link';
  targetRole: CampPageRole;
  order: number;
  
  // 아이콘 이모지
  emoji?: string;
  
  // type === 'page'
  content?: string;
  
  // type === 'link'
  url?: string;
}

// 관리자가 선택할 수 있는 기본 이모지 목록
export const DEFAULT_EMOJIS = [
  '📄', '📝', '📋', '📌', '📍', 
  '📖', '📚', '📓', '📔', '📕',
  '📗', '📘', '📙', '📰', '🗒️',
  '📑', '🗂️', '📂', '📁', '🏷️',
  '🎯', '🎨', '🎪', '🎭', '🎬',
  '💡', '🔔', '🔖', '✅', '❗',
  '⭐', '🌟', '💫', '✨', '🔥',
  '👍', '👏', '🙌', '💪', '🏆',
  '🎓', '📊', '📈', '📉', '💼',
  '🔧', '🔨', '⚙️', '🛠️', '🧰',
  '🎁', '🎉', '🎊', '🎈', '🎀',
  '📢', '📣', '📡', '📺', '📻',
  '🌍', '🌎', '🌏', '🗺️', '🧭',
  '⏰', '⏱️', '⏲️', '⌚', '📅',
  '🔑', '🔐', '🔒', '🔓', '🗝️',
] as const;
