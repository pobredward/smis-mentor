import CampContentList from './CampContentList';

export default function EducationContent() {
  return (
    <CampContentList
      category="education"
      linkType="educationLinks"
      categoryTitle="교육 자료"
      allowLinks={false}
      emptyIcon={
        <svg className="w-16 h-16 text-gray-400 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
        </svg>
      }
      emptyTitle="등록된 교육 자료가 없습니다"
      emptyDescription={[
        '마이페이지에서 참여 중인 캠프를 활성화하면',
        '해당 캠프의 교육 자료를 확인할 수 있습니다.',
      ]}
    />
  );
}
