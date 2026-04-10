import CampLinkList from './CampLinkList';

export default function GuideContent() {
  return (
    <CampLinkList
      linkType="guideLinks"
      categoryTitle="인솔표"
      emptyIcon={
        <svg className="w-16 h-16 text-gray-400 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
        </svg>
      }
      emptyTitle="등록된 인솔표가 없습니다"
      emptyDescription={[
        '마이페이지에서 참여 중인 캠프를 활성화하면',
        '해당 캠프의 인솔표를 확인할 수 있습니다.',
      ]}
    />
  );
}
