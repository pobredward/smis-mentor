import Link from 'next/link';
import { JobCodeWithId } from '@/types';
import { getActiveJobBoards, getJobCodeById } from '@/lib/firebaseService';
import { formatDate } from '@/utils/dateUtils';

export default async function JobBoardSection() {
  // 서버 컴포넌트에서 데이터 가져오기
  const boards = await getActiveJobBoards();
  const sortedBoards = boards
    .sort((a, b) => b.createdAt.seconds - a.createdAt.seconds)
    .slice(0, 4); // 최신 4개만 표시
    
  // JobCode 정보도 한 번에 가져오기
  const jobCodeIds = sortedBoards.map(board => board.refJobCodeId);
  const uniqueJobCodeIds = [...new Set(jobCodeIds)];
  
  // Promise.all을 사용하여 병렬로 JobCode 정보 가져오기
  const jobCodePromises = uniqueJobCodeIds.map(async (id) => {
    const jobCode = await getJobCodeById(id);
    return { id, jobCode };
  });
  
  const jobCodeResults = await Promise.all(jobCodePromises);
  
  // 조회 결과를 맵으로 변환하여 효율적인 접근 가능하도록 함
  const jobCodesMap: {[key: string]: JobCodeWithId} = {};
  jobCodeResults.forEach(({ id, jobCode }) => {
    if (jobCode) {
      jobCodesMap[id] = jobCode;
    }
  });

  return (
    <div className="bg-gray-50 py-4 md:py-8 mb-6 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto">
        <div className="flex justify-between items-center mb-6 md:mb-8">
          <h2 className="text-2xl md:text-3xl font-extrabold text-gray-900">
            진행중인 공고
          </h2>
          <Link
            href="/job-board"
            className="inline-flex items-center text-blue-600 hover:text-blue-700"
          >
            보러가기
            <svg className="ml-1 h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
            </svg>
          </Link>
        </div>
        
        {sortedBoards.length === 0 ? (
          <div className="text-center py-10 bg-white rounded-lg shadow">
            <p className="text-gray-500">현재 모집 중인 공고가 없습니다.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
            {sortedBoards.map((board) => (
              <Link
                key={board.id}
                href={`/job-board/${board.id}`}
                className="group bg-white rounded-xl shadow-sm hover:shadow-xl transition-all duration-300 overflow-hidden cursor-pointer flex flex-col transform hover:scale-[1.02]"
              >
                <div className="p-4 md:p-6 flex-grow">
                  <div className="flex flex-wrap items-center gap-2 md:gap-3 mb-3 md:mb-4">
                    <span className="inline-flex items-center px-2 py-1 md:px-3 md:py-1.5 text-xs md:text-sm font-medium rounded-full bg-blue-100 text-blue-800 group-hover:bg-blue-200 transition-colors">
                      {board.generation}
                    </span>
                    <span className={`inline-flex items-center px-2 py-1 md:px-3 md:py-1.5 text-xs md:text-sm font-medium rounded-full transition-colors ${
                      board.korea
                        ? 'bg-green-100 text-green-800 group-hover:bg-green-200'
                        : 'bg-purple-100 text-purple-800 group-hover:bg-purple-200'
                    }`}>
                      {board.korea ? '국내' : '해외'}
                    </span>
                  </div>
                  
                  <h3 className="text-lg md:text-xl font-semibold text-gray-900 mb-3 group-hover:text-blue-600 transition-colors">
                    {board.title}
                  </h3>
                  
                  <div className="space-y-2 md:space-y-3">
                    <div className="flex items-center text-xs md:text-sm text-gray-600">
                      <svg className="w-4 h-4 md:w-5 md:h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                      {jobCodesMap[board.refJobCodeId] ? 
                        `${formatDate(jobCodesMap[board.refJobCodeId].startDate)} ~ ${formatDate(jobCodesMap[board.refJobCodeId].endDate)}` : 
                        formatDate(board.educationStartDate) + ' ~ ' + formatDate(board.educationEndDate)
                      }
                    </div>
                    <div className="flex items-center text-xs md:text-sm text-gray-600">
                      <svg className="w-4 h-4 md:w-5 md:h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                      </svg>
                      {jobCodesMap[board.refJobCodeId] ? 
                        jobCodesMap[board.refJobCodeId].location : 
                        board.jobCode
                      }
                    </div>
                  </div>
                </div>
                
                <div className="bg-gray-50 px-4 md:px-6 py-3 md:py-4 flex justify-between items-center border-t group-hover:bg-gray-100 transition-colors">
                  <span className="text-xs md:text-sm font-medium text-gray-600">자세히 보기</span>
                  <svg className="w-4 h-4 md:w-5 md:h-5 text-gray-400 group-hover:text-blue-500 transform group-hover:translate-x-1 transition-all" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
                  </svg>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
} 