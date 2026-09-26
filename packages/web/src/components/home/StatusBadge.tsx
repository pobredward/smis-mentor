import { recruitStatusBadge, type StatusTone } from '@smis-mentor/shared';

const TONE_CLASS: Record<StatusTone, string> = {
  wait: 'bg-yellow-100 text-yellow-800', info: 'bg-purple-100 text-purple-800', ok: 'bg-green-100 text-green-800',
  bad: 'bg-red-100 text-red-800', muted: 'bg-gray-100 text-gray-800',
};

interface StatusBadgeProps {
  status: string | undefined;
  type: 'application' | 'interview' | 'final';
}

export default function StatusBadge({ status, type }: StatusBadgeProps) {
  // 라벨은 shared 한 곳에서 (웹·앱 공통)
  const b = recruitStatusBadge(type, status);
  const color = TONE_CLASS[b.tone];
  const label = b.label;

  return (
    <span className={`px-2 py-1 text-xs rounded-full ${color}`}>
      {label}
    </span>
  );
} 