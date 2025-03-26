import { Timestamp } from 'firebase/firestore';
import { format } from 'date-fns';
import { ko } from 'date-fns/locale';

export function formatDateOnly(timestamp: Timestamp | null | undefined): string {
  if (!timestamp?.toDate) return '-';
  return format(timestamp.toDate(), 'yyyy년 MM월 dd일 (EEE)', { locale: ko });
}

export function formatDateTime(timestamp: Timestamp | null | undefined): string {
  if (!timestamp?.toDate) return '-';
  return format(timestamp.toDate(), 'yyyy년 MM월 dd일 (EEE) HH:mm', { locale: ko });
} 