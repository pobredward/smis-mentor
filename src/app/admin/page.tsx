'use client';

import Link from 'next/link';
import Layout from '@/components/common/Layout';
import { FaUserPlus, FaCalendarPlus, FaUserClock } from 'react-icons/fa';

export default function AdminDashboard() {
  const adminMenus = [
    {
      title: '임시 사용자 생성',
      description: '교육생을 위한 임시 계정을 생성합니다.',
      href: '/admin/user-generate',
      iconClass: 'text-green-600',
      icon: <FaUserPlus />,
    },
    {
      title: '업무 생성 & 관리',
      description: '새로운 업무를 생성하고 관리합니다.',
      href: '/admin/job-generate',
      iconClass: 'text-blue-600',
      icon: <FaCalendarPlus />,
    },
    {
      title: '지원 유저 관리',
      description: '지원자 정보와 지원 현황을 관리합니다.',
      href: '/admin/job-board-manage',
      iconClass: 'text-purple-600',
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6">
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25zM6.75 12h.008v.008H6.75V12zm0 3h.008v.008H6.75V15zm0 3h.008v.008H6.75V18z" />
        </svg>
      ),
    },
    {
      title: '면접 관리',
      description: '면접일 및 면접 대상 유저들을 관리합니다.',
      href: '/admin/interview-manage',
      iconClass: 'text-indigo-600',
      icon: <FaUserClock />,
    },
    {
      title: '사용자 관리',
      description: '사용자 정보를 수정, 삭제 및 기타 기능 수행.',
      href: '/admin/user-manage',
      iconClass: 'text-yellow-600',
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6">
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
        </svg>
      ),
    },
    {
      title: '사용자 조회',
      description: '캠프에 참여했던 유저를 기수별로 조회합니다.',
      href: '/admin/user-check',
      iconClass: 'text-red-600',
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6">
          <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 15.75l-2.489-2.489m0 0a3.375 3.375 0 10-4.773-4.773 3.375 3.375 0 004.774 4.774zM21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      ),
    }
  ];

  return (
    <Layout requireAuth requireAdmin>
      <div>
        <div className="mb-8 lg:px-4 px-0">
          <h1 className="text-2xl font-bold text-gray-900">관리자 대시보드</h1>
          <p className="mt-1 text-sm text-gray-600">업무 및 멘토 관리를 위한 관리자 기능</p>
        </div>

        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {adminMenus.map((menu, index) => (
            <Link
              key={index}
              href={menu.href}
              className="block p-6 bg-white shadow-md rounded-lg hover:shadow-lg transition-shadow"
            >
              <div className="flex items-center mb-4">
                <div className={`rounded-full p-2 ${menu.iconClass} bg-gray-100`}>
                  {menu.icon}
                </div>
                <h2 className="ml-3 text-lg font-semibold text-gray-900">{menu.title}</h2>
              </div>
              <p className="text-gray-600">{menu.description}</p>
            </Link>
          ))}
        </div>
      </div>
    </Layout>
  );
} 