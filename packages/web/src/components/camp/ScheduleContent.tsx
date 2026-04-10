import CampLinkList from './CampLinkList';

export default function ScheduleContent() {
  return (
    <CampLinkList
      linkType="scheduleLinks"
      categoryTitle="시간표"
      emptyIcon={
        <svg className="w-16 h-16 text-gray-400 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
      }
      emptyTitle="등록된 시간표가 없습니다"
      emptyDescription={[
        '마이페이지에서 참여 중인 캠프를 활성화하면',
        '해당 캠프의 시간표를 확인할 수 있습니다.',
      ]}
    />
  );
}
