// ESL 교재 리스트 — 기수·캠프와 무관한 전사 공용 값이라 앱 설정에 한 벌만 둔다
import { doc, getDoc, setDoc, Firestore } from 'firebase/firestore';
import { EslBookList } from '../../types/eslBook';

const COLLECTION = 'appSettings';
const DOC_ID = 'eslBooks';

/** 학년별 ESL 교재 리스트 조회. 없으면 빈 리스트 */
export const getEslBooks = async (db: Firestore): Promise<EslBookList> => {
  const snap = await getDoc(doc(db, COLLECTION, DOC_ID));
  if (!snap.exists()) return { codes: {} };
  const data = snap.data() as EslBookList;
  return { codes: data.codes ?? {}, bands: data.bands, updatedAt: data.updatedAt };
};

/** 교재 리스트 저장 (관리자) */
export const updateEslBooks = async (db: Firestore, list: EslBookList): Promise<void> => {
  await setDoc(
    doc(db, COLLECTION, DOC_ID),
    { codes: list.codes ?? {}, bands: list.bands ?? {}, updatedAt: new Date().toISOString() },
    { merge: true }
  );
};
