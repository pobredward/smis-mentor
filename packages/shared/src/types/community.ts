import { Timestamp } from 'firebase/firestore';

/**
 * 게시판 범위
 * - 'all'   : 전체 게시판 — 업무코드가 1개 이상인 모든 유저
 * - 'camp'  : 캠프 게시판 — 동일 activeJobExperienceId 보유 유저
 * - 'group' : 그룹 게시판 — 동일 캠프 + 동일 그룹 유저
 * - 'dev'   : 개발자 건의 — 작성자 본인 + admin 전체 열람
 */
export type CommunityPostScope = 'all' | 'camp' | 'group' | 'dev';

export interface CommunityPost {
  id: string;
  scope: CommunityPostScope;
  /** 'camp' | 'group' 게시판일 때 해당 캠프의 jobExperienceId */
  jobCodeId: string | null;
  /** 'group' 게시판일 때 그룹 식별자 (예: "junior__담임") */
  groupId: string | null;
  authorId: string;
  authorName: string;
  authorProfileImage: string | null;
  /** 작성 시점의 캠프 코드 (예: "J28") — 다른 유저가 볼 때 표시 */
  authorJobCodeLabel: string | null;
  /** 작성자가 admin인 경우 true — "운영진" 배지 표시에 사용 */
  authorIsAdmin: boolean;
  /** 익명 작성 여부 — true면 다른 유저에게 "익명"으로 표시 */
  isAnonymous: boolean;
  content: string;
  imageUrls: string[];
  likeCount: number;
  /** 좋아요 중복 방지용 userId 배열 */
  likedBy: string[];
  commentCount: number;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface CommunityComment {
  id: string;
  /** null이면 최상위 댓글, commentId이면 대댓글 */
  parentId: string | null;
  authorId: string;
  authorName: string;
  authorProfileImage: string | null;
  /** 익명 작성 여부 */
  isAnonymous: boolean;
  content: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  /** soft delete: null이면 정상, Timestamp이면 삭제됨 */
  deletedAt: Timestamp | null;
}

export interface CreatePostInput {
  scope: CommunityPostScope;
  jobCodeId: string | null;
  groupId: string | null;
  authorId: string;
  authorName: string;
  authorProfileImage: string | null;
  /** 작성자의 현재 활성 캠프 코드 (예: "J28") */
  authorJobCodeLabel: string | null;
  /** 작성자가 admin인 경우 true */
  authorIsAdmin: boolean;
  /** 익명 작성 여부 */
  isAnonymous: boolean;
  content: string;
}

export interface UpdatePostInput {
  content: string;
}

export interface CreateCommentInput {
  parentId: string | null;
  authorId: string;
  authorName: string;
  authorProfileImage: string | null;
  /** 익명 작성 여부 */
  isAnonymous: boolean;
  content: string;
}

export interface PostsPage {
  posts: CommunityPost[];
  lastVisible: unknown | null;
  hasMore: boolean;
}
