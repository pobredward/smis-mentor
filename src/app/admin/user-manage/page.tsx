'use client';

import { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import { format } from 'date-fns';
import Layout from '@/components/common/Layout';
import Button from '@/components/common/Button';
import FormInput from '@/components/common/FormInput';
import { getAllUsers, updateUser, deleteUser } from '@/lib/firebaseService';
import { User } from '@/types';

export default function UserManage() {
  const [users, setUsers] = useState<User[]>([]);
  const [filteredUsers, setFilteredUsers] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editFormData, setEditFormData] = useState<Partial<User>>({});

  // 사용자 목록 불러오기
  useEffect(() => {
    const loadUsers = async () => {
      try {
        setIsLoading(true);
        const allUsers = await getAllUsers();
        setUsers(allUsers);
        setFilteredUsers(allUsers);
      } catch (error) {
        console.error('사용자 정보 로드 오류:', error);
        toast.error('사용자 정보를 불러오는 중 오류가 발생했습니다.');
      } finally {
        setIsLoading(false);
      }
    };

    loadUsers();
  }, []);

  // 검색어가 변경될 때 사용자 필터링
  useEffect(() => {
    if (!searchTerm.trim()) {
      setFilteredUsers(users);
      return;
    }

    const filtered = users.filter(user => 
      user.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      user.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
      user.phoneNumber.includes(searchTerm)
    );
    
    setFilteredUsers(filtered);
  }, [searchTerm, users]);

  // 사용자 선택 핸들러
  const handleSelectUser = (user: User) => {
    setSelectedUser(user);
    setIsEditing(false);
  };

  // 사용자 편집 모드 시작
  const handleStartEdit = () => {
    if (!selectedUser) return;
    
    setEditFormData({
      name: selectedUser.name,
      email: selectedUser.email,
      phoneNumber: selectedUser.phoneNumber,
      address: selectedUser.address,
      addressDetail: selectedUser.addressDetail,
      role: selectedUser.role,
      status: selectedUser.status,
    });
    
    setIsEditing(true);
  };

  // 편집 폼 데이터 변경 핸들러
  const handleEditFormChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setEditFormData(prev => ({ ...prev, [name]: value }));
  };

  // 사용자 업데이트 핸들러
  const handleUpdateUser = async () => {
    if (!selectedUser) return;
    
    try {
      await updateUser(selectedUser.userId, editFormData);
      
      // 상태 업데이트
      const updatedUsers = users.map(user => 
        user.userId === selectedUser.userId 
          ? { ...user, ...editFormData } 
          : user
      );
      
      setUsers(updatedUsers);
      setSelectedUser({ ...selectedUser, ...editFormData });
      setIsEditing(false);
      
      toast.success('사용자 정보가 업데이트되었습니다.');
    } catch (error) {
      console.error('사용자 업데이트 오류:', error);
      toast.error('사용자 정보 업데이트 중 오류가 발생했습니다.');
    }
  };

  // 사용자 삭제 핸들러
  const handleDeleteUser = async () => {
    if (!selectedUser) return;
    
    if (!window.confirm(`정말로 ${selectedUser.name} 사용자를 삭제하시겠습니까?`)) {
      return;
    }
    
    try {
      await deleteUser(selectedUser.userId);
      
      // 상태 업데이트
      const updatedUsers = users.filter(user => user.userId !== selectedUser.userId);
      setUsers(updatedUsers);
      setSelectedUser(null);
      
      toast.success('사용자가 삭제되었습니다.');
    } catch (error) {
      console.error('사용자 삭제 오류:', error);
      toast.error('사용자 삭제 중 오류가 발생했습니다.');
    }
  };

  // 날짜 포맷팅 함수
  const formatDate = (timestamp: { seconds: number } | undefined) => {
    if (!timestamp) return '-';
    return format(new Date(timestamp.seconds * 1000), 'yyyy-MM-dd HH:mm');
  };

  return (
    <Layout requireAuth requireAdmin>
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold">사용자 관리</h1>
        </div>

        <div className="mb-6">
          <div className="relative">
            <input
              type="text"
              placeholder="이름, 이메일 또는 전화번호로 검색"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full p-3 pl-10 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <svg className="h-5 w-5 text-gray-400" fill="currentColor" viewBox="0 0 20 20">
                <path
                  fillRule="evenodd"
                  d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z"
                  clipRule="evenodd"
                />
              </svg>
            </div>
          </div>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-10">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gray-900"></div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* 사용자 목록 */}
            <div className="md:col-span-1">
              <div className="bg-white rounded-lg shadow overflow-hidden">
                <div className="p-4 border-b flex justify-between items-center">
                  <h2 className="font-medium text-gray-900">사용자 목록</h2>
                  <span className="text-sm text-gray-500">{filteredUsers.length}명</span>
                </div>
                
                {filteredUsers.length === 0 ? (
                  <div className="p-6 text-center text-gray-500">
                    {searchTerm ? '검색 결과가 없습니다.' : '사용자가 없습니다.'}
                  </div>
                ) : (
                  <div className="divide-y overflow-y-auto max-h-[600px]">
                    {filteredUsers.map((user) => (
                      <div 
                        key={user.userId}
                        className={`p-4 cursor-pointer hover:bg-gray-50 ${
                          selectedUser?.userId === user.userId ? 'bg-blue-50' : ''
                        }`}
                        onClick={() => handleSelectUser(user)}
                      >
                        <div className="flex items-start">
                          {user.profileImage ? (
                            <img 
                              src={user.profileImage} 
                              alt={user.name}
                              className="h-10 w-10 rounded-full mr-3 object-cover"
                            />
                          ) : (
                            <div className="h-10 w-10 rounded-full bg-gray-200 flex items-center justify-center mr-3">
                              <span className="text-gray-500">{user.name.charAt(0)}</span>
                            </div>
                          )}
                          <div>
                            <h3 className="font-medium text-gray-900">{user.name}</h3>
                            <p className="text-sm text-gray-500">{user.email || user.phoneNumber}</p>
                            <div className="flex items-center mt-1">
                              <span className={`px-2 py-0.5 text-xs rounded-full ${
                                user.role === 'admin' ? 'bg-purple-100 text-purple-800' :
                                user.role === 'mentor' ? 'bg-blue-100 text-blue-800' :
                                'bg-gray-100 text-gray-800'
                              }`}>
                                {user.role === 'admin' ? '관리자' : 
                                 user.role === 'mentor' ? '멘토' : '사용자'}
                              </span>
                              <span className={`ml-2 px-2 py-0.5 text-xs rounded-full ${
                                user.status === 'active' ? 'bg-green-100 text-green-800' :
                                user.status === 'inactive' ? 'bg-red-100 text-red-800' :
                                'bg-yellow-100 text-yellow-800'
                              }`}>
                                {user.status === 'active' ? '활성' : 
                                 user.status === 'inactive' ? '비활성' : '임시'}
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* 사용자 상세 정보 */}
            <div className="md:col-span-2">
              {selectedUser ? (
                <div className="bg-white rounded-lg shadow">
                  {isEditing ? (
                    // 편집 폼
                    <div className="p-6">
                      <div className="flex justify-between items-center mb-6">
                        <h2 className="text-xl font-bold text-gray-900">사용자 정보 편집</h2>
                        <div className="flex gap-2">
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => setIsEditing(false)}
                          >
                            취소
                          </Button>
                          <Button
                            variant="primary"
                            size="sm"
                            onClick={handleUpdateUser}
                          >
                            저장
                          </Button>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <FormInput
                          label="이름"
                          name="name"
                          type="text"
                          value={editFormData.name || ''}
                          onChange={handleEditFormChange}
                        />
                        <FormInput
                          label="이메일"
                          name="email"
                          type="email"
                          value={editFormData.email || ''}
                          onChange={handleEditFormChange}
                        />
                        <FormInput
                          label="전화번호"
                          name="phoneNumber"
                          type="text"
                          value={editFormData.phoneNumber || ''}
                          onChange={handleEditFormChange}
                        />
                        <div className="md:col-span-2">
                          <FormInput
                            label="주소"
                            name="address"
                            type="text"
                            value={editFormData.address || ''}
                            onChange={handleEditFormChange}
                          />
                        </div>
                        <FormInput
                          label="상세 주소"
                          name="addressDetail"
                          type="text"
                          value={editFormData.addressDetail || ''}
                          onChange={handleEditFormChange}
                        />
                        
                        <div className="mb-4">
                          <label className="block text-gray-700 text-sm font-medium mb-2">역할</label>
                          <select
                            name="role"
                            value={editFormData.role}
                            onChange={handleEditFormChange}
                            className="w-full p-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                          >
                            <option value="user">사용자</option>
                            <option value="mentor">멘토</option>
                            <option value="admin">관리자</option>
                          </select>
                        </div>

                        <div className="mb-4">
                          <label className="block text-gray-700 text-sm font-medium mb-2">상태</label>
                          <select
                            name="status"
                            value={editFormData.status}
                            onChange={handleEditFormChange}
                            className="w-full p-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                          >
                            <option value="active">활성</option>
                            <option value="inactive">비활성</option>
                            <option value="temp">임시</option>
                          </select>
                        </div>
                      </div>
                    </div>
                  ) : (
                    // 상세 정보 보기
                    <div className="p-6">
                      <div className="flex justify-between items-start mb-6">
                        <div className="flex items-center">
                          {selectedUser.profileImage ? (
                            <img 
                              src={selectedUser.profileImage} 
                              alt={selectedUser.name}
                              className="h-16 w-16 rounded-full mr-4 object-cover"
                            />
                          ) : (
                            <div className="h-16 w-16 rounded-full bg-gray-200 flex items-center justify-center mr-4">
                              <span className="text-gray-500 text-xl">{selectedUser.name.charAt(0)}</span>
                            </div>
                          )}
                          <div>
                            <h2 className="text-xl font-bold text-gray-900">{selectedUser.name}</h2>
                            <div className="flex items-center mt-1">
                              <span className={`px-2 py-0.5 text-xs rounded-full ${
                                selectedUser.role === 'admin' ? 'bg-purple-100 text-purple-800' :
                                selectedUser.role === 'mentor' ? 'bg-blue-100 text-blue-800' :
                                'bg-gray-100 text-gray-800'
                              }`}>
                                {selectedUser.role === 'admin' ? '관리자' : 
                                 selectedUser.role === 'mentor' ? '멘토' : '사용자'}
                              </span>
                              <span className={`ml-2 px-2 py-0.5 text-xs rounded-full ${
                                selectedUser.status === 'active' ? 'bg-green-100 text-green-800' :
                                selectedUser.status === 'inactive' ? 'bg-red-100 text-red-800' :
                                'bg-yellow-100 text-yellow-800'
                              }`}>
                                {selectedUser.status === 'active' ? '활성' : 
                                 selectedUser.status === 'inactive' ? '비활성' : '임시'}
                              </span>
                            </div>
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={handleStartEdit}
                          >
                            수정
                          </Button>
                          <Button
                            variant="danger"
                            size="sm"
                            onClick={handleDeleteUser}
                          >
                            삭제
                          </Button>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-y-4 border-t pt-4">
                        <div>
                          <p className="text-sm text-gray-500">이메일</p>
                          <p className="text-gray-900">{selectedUser.email || '-'}</p>
                        </div>
                        <div>
                          <p className="text-sm text-gray-500">전화번호</p>
                          <p className="text-gray-900">{selectedUser.phoneNumber || '-'}</p>
                        </div>
                        <div className="md:col-span-2">
                          <p className="text-sm text-gray-500">주소</p>
                          <p className="text-gray-900">
                            {selectedUser.address ? `${selectedUser.address} ${selectedUser.addressDetail || ''}` : '-'}
                          </p>
                        </div>
                        <div>
                          <p className="text-sm text-gray-500">이메일 인증</p>
                          <p className="text-gray-900">
                            {selectedUser.isEmailVerified ? '인증됨' : '미인증'}
                          </p>
                        </div>
                        <div>
                          <p className="text-sm text-gray-500">마지막 로그인</p>
                          <p className="text-gray-900">{formatDate(selectedUser.lastLoginAt)}</p>
                        </div>
                        <div>
                          <p className="text-sm text-gray-500">가입일</p>
                          <p className="text-gray-900">{formatDate(selectedUser.createdAt)}</p>
                        </div>
                        <div>
                          <p className="text-sm text-gray-500">정보 업데이트</p>
                          <p className="text-gray-900">{formatDate(selectedUser.updatedAt)}</p>
                        </div>
                        <div className="md:col-span-2 mt-2">
                          <p className="text-sm text-gray-500">자기소개</p>
                          <p className="text-gray-900 whitespace-pre-line">
                            {selectedUser.selfIntroduction || '-'}
                          </p>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="bg-white rounded-lg shadow p-10 text-center">
                  <p className="text-gray-500">좌측에서 사용자를 선택해 주세요.</p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
} 