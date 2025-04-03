interface StatusBadgeProps {
  status: string | undefined;
  type: 'application' | 'interview' | 'final';
}

export default function StatusBadge({ status, type }: StatusBadgeProps) {
  let color = '';
  let label = '';
  
  if (type === 'application') {
    switch (status) {
      case 'pending':
        color = 'bg-yellow-100 text-yellow-800';
        label = '검토중';
        break;
      case 'accepted':
        color = 'bg-green-100 text-green-800';
        label = '서류합격';
        break;
      case 'rejected':
        color = 'bg-red-100 text-red-800';
        label = '서류불합격';
        break;
      default:
        color = 'bg-gray-100 text-gray-800';
        label = '미정';
    }
  } else if (type === 'interview') {
    switch (status) {
      case 'pending':
        color = 'bg-yellow-100 text-yellow-800';
        label = '면접예정';
        break;
      case 'passed':
        color = 'bg-green-100 text-green-800';
        label = '면접합격';
        break;
      case 'failed':
        color = 'bg-red-100 text-red-800';
        label = '면접불합격';
        break;
      case '불참':
        color = 'bg-red-100 text-red-800';
        label = '불참';
        break;
      default:
        color = 'bg-gray-100 text-gray-800';
        label = '미정';
    }
  } else if (type === 'final') {
    switch (status) {
      case 'finalAccepted':
        color = 'bg-green-100 text-green-800';
        label = '최종합격';
        break;
      case 'finalRejected':
        color = 'bg-red-100 text-red-800';
        label = '최종불합격';
        break;
      case '불참':
        color = 'bg-red-100 text-red-800';
        label = '불참';
        break;
      default:
        color = 'bg-gray-100 text-gray-800';
        label = '미정';
    }
  }
  
  return (
    <span className={`px-2 py-1 text-xs rounded-full ${color}`}>
      {label}
    </span>
  );
} 