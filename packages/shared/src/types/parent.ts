/**
 * 학부모 — 관리자가 학부모 계정에 아이(캠프 학생)를 연결한다.
 * parentLinks/{학부모 uid} — 서버만 쓴다 (학부모 본인 · 관리자 읽기). 학생은 캠프 열쇠 + 학생 고유번호로 가리킨다.
 */
export interface ParentChildLink {
  campCode: string;
  /** 학생 명단의 고유번호 (STSheetStudent.studentId) */
  studentId: string;
  /** 연결할 때의 이름 (명단이 바뀌어도 화면에 보여 줄 값) */
  studentName: string;
  linkedAt: string;   // ISO
  linkedBy: string;   // 관리자 uid
}

export interface ParentLinksDoc {
  children: ParentChildLink[];
  updatedAt?: unknown;
}

export const PARENT_LINKS_COLLECTION = 'parentLinks';

export const isParentRole = (role: unknown): boolean => role === 'parent';
