import { format } from 'date-fns';
import { ko } from 'date-fns/locale';
import { Timestamp } from 'firebase/firestore';

/**
 * Timestamp를 yyyy.MM.dd(EEE) 형식으로 변환
 */
export const formatDate = (timestamp: Timestamp) => {
  const date = timestamp.toDate();
  return format(date, 'yyyy.MM.dd(EEE)', { locale: ko });
};

/**
 * Timestamp를 yyyy년 MM월 dd일 (EEE) HH:mm 형식으로 변환
 */
export const formatDateTime = (timestamp: Timestamp | undefined) => {
  if (!timestamp) return '-';
  const date = timestamp.toDate();
  return format(date, 'yyyy년 MM월 dd일 (EEE) HH:mm', { locale: ko });
}; 