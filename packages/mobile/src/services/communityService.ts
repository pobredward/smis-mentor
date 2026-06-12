import {
  collection,
  doc,
  addDoc,
  updateDoc,
  deleteDoc,
  getDocs,
  getDoc,
  query,
  where,
  orderBy,
  limit,
  startAfter,
  arrayUnion,
  arrayRemove,
  increment,
  serverTimestamp,
  type DocumentSnapshot,
  type QueryDocumentSnapshot,
} from 'firebase/firestore';
import {
  ref,
  uploadBytes,
  getDownloadURL,
  deleteObject,
} from 'firebase/storage';
import { db, storage } from '../config/firebase';
import type {
  CommunityPost,
  CommunityComment,
  CreatePostInput,
  UpdatePostInput,
  CreateCommentInput,
  PostsPage,
} from '@smis-mentor/shared';

const PAGE_SIZE = 15;

// ─── 이미지 업로드 ────────────────────────────────────────────────────────────

/**
 * 로컬 URI 이미지를 Firebase Storage에 업로드하고 다운로드 URL을 반환합니다.
 */
async function uploadPostImage(localUri: string, postId: string): Promise<string> {
  const response = await fetch(localUri);
  const blob = await response.blob();
  const ext = localUri.split('.').pop()?.split('?')[0] ?? 'jpg';
  const filename = `${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
  const storageRef = ref(storage, `community/posts/${postId}/${filename}`);
  await uploadBytes(storageRef, blob);
  return getDownloadURL(storageRef);
}

/**
 * Firebase Storage URL에서 파일을 삭제합니다.
 */
async function deleteStorageImage(url: string): Promise<void> {
  try {
    const storageRef = ref(storage, url);
    await deleteObject(storageRef);
  } catch {
    // 이미 삭제됐거나 없는 파일이면 무시
  }
}

// ─── 게시글 변환 ──────────────────────────────────────────────────────────────

function docToPost(docSnap: QueryDocumentSnapshot | DocumentSnapshot): CommunityPost {
  const data = docSnap.data()!;
  return {
    id: docSnap.id,
    scope: data.scope,
    jobCodeId: data.jobCodeId ?? null,
    groupId: data.groupId ?? null,
    authorId: data.authorId,
    authorName: data.authorName,
    authorProfileImage: data.authorProfileImage ?? null,
    authorJobCodeLabel: data.authorJobCodeLabel ?? null,
    authorIsAdmin: data.authorIsAdmin ?? false,
    isAnonymous: data.isAnonymous ?? false,
    content: data.content,
    imageUrls: data.imageUrls ?? [],
    likeCount: data.likeCount ?? 0,
    likedBy: data.likedBy ?? [],
    commentCount: data.commentCount ?? 0,
    createdAt: data.createdAt,
    updatedAt: data.updatedAt,
  } as CommunityPost;
}

function docToComment(docSnap: QueryDocumentSnapshot | DocumentSnapshot): CommunityComment {
  const data = docSnap.data()!;
  return {
    id: docSnap.id,
    parentId: data.parentId ?? null,
    authorId: data.authorId,
    authorName: data.authorName,
    authorProfileImage: data.authorProfileImage ?? null,
    isAnonymous: data.isAnonymous ?? false,
    content: data.content,
    createdAt: data.createdAt,
    updatedAt: data.updatedAt,
    deletedAt: data.deletedAt ?? null,
  } as CommunityComment;
}

// ─── 게시글 CRUD ──────────────────────────────────────────────────────────────

/** 공통 페이지 쿼리 헬퍼 */
async function queryPage(
  constraints: Parameters<typeof query>[1][],
  cursor: QueryDocumentSnapshot | null
): Promise<PostsPage> {
  if (cursor) {
    constraints.push(startAfter(cursor) as never);
  }
  const q = query(collection(db, 'posts'), ...constraints);
  const snapshot = await getDocs(q);
  const docs = snapshot.docs;
  return {
    posts: docs.map(docToPost),
    lastVisible: docs[docs.length - 1] ?? null,
    hasMore: docs.length === PAGE_SIZE,
  };
}

/**
 * 전체 게시판 (scope='all') — 업무코드 보유 유저 전체 대상
 */
export async function getAllPosts(
  cursor: QueryDocumentSnapshot | null = null
): Promise<PostsPage> {
  return queryPage(
    [where('scope', '==', 'all'), orderBy('createdAt', 'desc'), limit(PAGE_SIZE)],
    cursor
  );
}

/**
 * 캠프 게시판 (scope='camp', jobCodeId 일치)
 */
export async function getCampPosts(
  jobCodeId: string,
  cursor: QueryDocumentSnapshot | null = null
): Promise<PostsPage> {
  return queryPage(
    [
      where('scope', '==', 'camp'),
      where('jobCodeId', '==', jobCodeId),
      orderBy('createdAt', 'desc'),
      limit(PAGE_SIZE),
    ],
    cursor
  );
}

/**
 * 그룹 게시판 (scope='group', jobCodeId + groupId 일치)
 */
export async function getGroupPosts(
  jobCodeId: string,
  groupId: string,
  cursor: QueryDocumentSnapshot | null = null
): Promise<PostsPage> {
  return queryPage(
    [
      where('scope', '==', 'group'),
      where('jobCodeId', '==', jobCodeId),
      where('groupId', '==', groupId),
      orderBy('createdAt', 'desc'),
      limit(PAGE_SIZE),
    ],
    cursor
  );
}

/**
 * 개발자 건의 게시판 (scope='dev')
 * - admin: 모든 게시글 조회
 * - 일반 유저: 본인이 작성한 게시글만 조회
 */
export async function getDevPosts(
  userId: string,
  isAdmin: boolean,
  cursor: QueryDocumentSnapshot | null = null
): Promise<PostsPage> {
  const baseConstraints = isAdmin
    ? [where('scope', '==', 'dev'), orderBy('createdAt', 'desc'), limit(PAGE_SIZE)]
    : [
        where('scope', '==', 'dev'),
        where('authorId', '==', userId),
        orderBy('createdAt', 'desc'),
        limit(PAGE_SIZE),
      ];
  return queryPage(baseConstraints, cursor);
}

/**
 * 단일 게시글 조회
 */
export async function getPostById(postId: string): Promise<CommunityPost | null> {
  const docRef = doc(db, 'posts', postId);
  const docSnap = await getDoc(docRef);
  if (!docSnap.exists()) return null;
  return docToPost(docSnap as QueryDocumentSnapshot);
}

/**
 * 게시글 생성 (이미지 업로드 포함)
 * @param input 게시글 기본 정보
 * @param localImageUris 업로드할 로컬 이미지 URI 배열 (최대 10장)
 */
export async function createPost(
  input: CreatePostInput,
  localImageUris: string[] = []
): Promise<string> {
  // 임시 문서 ID로 스토리지 경로 확정 후 업로드
  const tempRef = doc(collection(db, 'posts'));
  const postId = tempRef.id;

  const imageUrls: string[] = [];
  for (const uri of localImageUris.slice(0, 10)) {
    const url = await uploadPostImage(uri, postId);
    imageUrls.push(url);
  }

  await addDoc(collection(db, 'posts'), {
    ...input,
    imageUrls,
    likeCount: 0,
    likedBy: [],
    commentCount: 0,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  return postId;
}

/**
 * 게시글 수정 (텍스트만 수정, 이미지 변경은 지원하지 않음)
 */
export async function updatePost(
  postId: string,
  input: UpdatePostInput,
  newLocalImageUris?: string[],
  removedImageUrls?: string[]
): Promise<void> {
  const updateData: Record<string, unknown> = {
    content: input.content,
    updatedAt: serverTimestamp(),
  };

  // 이미지 삭제
  if (removedImageUrls && removedImageUrls.length > 0) {
    for (const url of removedImageUrls) {
      await deleteStorageImage(url);
    }
    updateData.imageUrls = arrayRemove(...removedImageUrls);
  }

  await updateDoc(doc(db, 'posts', postId), updateData);

  // 새 이미지 업로드
  if (newLocalImageUris && newLocalImageUris.length > 0) {
    const newUrls: string[] = [];
    for (const uri of newLocalImageUris) {
      const url = await uploadPostImage(uri, postId);
      newUrls.push(url);
    }
    await updateDoc(doc(db, 'posts', postId), {
      imageUrls: arrayUnion(...newUrls),
    });
  }
}

/**
 * 게시글 삭제 (Storage 이미지 포함 삭제)
 */
export async function deletePost(postId: string): Promise<void> {
  const postSnap = await getDoc(doc(db, 'posts', postId));
  if (postSnap.exists()) {
    const imageUrls: string[] = postSnap.data().imageUrls ?? [];
    for (const url of imageUrls) {
      await deleteStorageImage(url);
    }
  }
  await deleteDoc(doc(db, 'posts', postId));
}

/**
 * 좋아요 토글: 이미 좋아요 → 취소, 없으면 → 추가
 */
export async function toggleLike(postId: string, userId: string): Promise<void> {
  const postRef = doc(db, 'posts', postId);
  const postSnap = await getDoc(postRef);
  if (!postSnap.exists()) return;

  const likedBy: string[] = postSnap.data().likedBy ?? [];
  const isLiked = likedBy.includes(userId);

  await updateDoc(postRef, {
    likedBy: isLiked ? arrayRemove(userId) : arrayUnion(userId),
    likeCount: increment(isLiked ? -1 : 1),
  });
}

// ─── 댓글 CRUD ────────────────────────────────────────────────────────────────

/**
 * 게시글의 댓글 전체 조회 (생성 시각 오름차순)
 */
export async function getComments(postId: string): Promise<CommunityComment[]> {
  const commentsRef = collection(db, 'posts', postId, 'comments');
  const q = query(commentsRef, orderBy('createdAt', 'asc'));
  const snapshot = await getDocs(q);
  return snapshot.docs.map(docToComment);
}

/**
 * 댓글 or 대댓글 생성
 */
export async function createComment(
  postId: string,
  input: CreateCommentInput
): Promise<string> {
  const commentsRef = collection(db, 'posts', postId, 'comments');
  const docRef = await addDoc(commentsRef, {
    ...input,
    deletedAt: null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  // 게시글 commentCount 증가
  await updateDoc(doc(db, 'posts', postId), {
    commentCount: increment(1),
  });

  return docRef.id;
}

/**
 * 댓글 내용 수정
 */
export async function updateComment(
  postId: string,
  commentId: string,
  content: string
): Promise<void> {
  await updateDoc(doc(db, 'posts', postId, 'comments', commentId), {
    content,
    updatedAt: serverTimestamp(),
  });
}

/**
 * 댓글 soft delete: 내용을 지우고 deletedAt을 설정합니다.
 * 대댓글이 있을 경우 대댓글은 유지되므로 hard delete 하지 않습니다.
 */
export async function deleteComment(
  postId: string,
  commentId: string
): Promise<void> {
  await updateDoc(doc(db, 'posts', postId, 'comments', commentId), {
    content: '',
    deletedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  await updateDoc(doc(db, 'posts', postId), {
    commentCount: increment(-1),
  });
}
