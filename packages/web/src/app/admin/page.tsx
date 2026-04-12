'use client';

import Link from 'next/link';
import Layout from '@/components/common/Layout';
import { 
  IoDocumentText, 
  IoVideocam, 
  IoPeople, 
  IoSearch, 
  IoFolder, 
  IoSettings, 
  IoMap, 
  IoPersonAdd, 
  IoBriefcase 
} from 'react-icons/io5';

type AdminMenuItem = {
  title: string;
  href: string;
  iconClass: string;
  icon: React.ReactNode;
};

type AdminSection = {
  title: string;
  items: AdminMenuItem[];
};

export default function AdminDashboard() {
  const adminSections: AdminSection[] = [
    {
      title: '채용 관련',
      items: [
        {
          title: '지원 유저 관리',
          href: '/admin/job-board-manage',
          iconClass: 'text-purple-600',
          icon: <IoDocumentText className="w-5 h-5" />,
        },
        {
          title: '면접 관리',
          href: '/admin/interview-manage',
          iconClass: 'text-pink-600',
          icon: <IoVideocam className="w-5 h-5" />,
        },
        {
          title: '사용자 관리',
          href: '/admin/user-manage',
          iconClass: 'text-yellow-600',
          icon: <IoPeople className="w-5 h-5" />,
        },
      ],
    },
    {
      title: '교육 관련',
      items: [
        {
          title: '캠프별 유저 조회',
          href: '/admin/user-check',
          iconClass: 'text-red-600',
          icon: <IoSearch className="w-5 h-5" />,
        },
        {
          title: '수업 템플릿 관리',
          href: '/admin/upload',
          iconClass: 'text-cyan-600',
          icon: <IoFolder className="w-5 h-5" />,
        },
      ],
    },
    {
      title: '기타',
      items: [
        {
          title: '로딩문구 관리',
          href: '/admin/app-config',
          iconClass: 'text-orange-600',
          icon: <IoSettings className="w-5 h-5" />,
        },
        {
          title: '사용자 지도',
          href: '/admin/user-map-test',
          iconClass: 'text-teal-600',
          icon: <IoMap className="w-5 h-5" />,
        },
        {
          title: '임시 사용자 생성',
          href: '/admin/user-generate',
          iconClass: 'text-green-600',
          icon: <IoPersonAdd className="w-5 h-5" />,
        },
        {
          title: '업무 생성',
          href: '/admin/job-generate',
          iconClass: 'text-blue-600',
          icon: <IoBriefcase className="w-5 h-5" />,
        },
      ],
    },
  ];

  return (
    <Layout requireAuth requireAdmin>
      <div>
        <div className="mb-6 lg:mb-8 lg:px-4 px-0">
          <h1 className="text-2xl font-bold text-gray-900">관리자 대시보드</h1>
        </div>

        <div className="space-y-5 lg:space-y-8">
          {adminSections.map((section, sectionIndex) => (
            <div key={sectionIndex}>
              <h2 className="text-lg font-semibold text-gray-800 mb-4 lg:px-4 px-0">{section.title}</h2>
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
                {section.items.map((menu, index) => (
                  <Link
                    key={index}
                    href={menu.href}
                    className="flex items-center gap-3 p-3 bg-white border border-gray-200 rounded-lg hover:border-gray-300 hover:shadow-md transition-all"
                  >
                    <div className={`rounded-lg p-2 ${menu.iconClass} bg-gray-50`}>
                      {menu.icon}
                    </div>
                    <h3 className="text-sm font-semibold text-gray-900">{menu.title}</h3>
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </Layout>
  );
}
 