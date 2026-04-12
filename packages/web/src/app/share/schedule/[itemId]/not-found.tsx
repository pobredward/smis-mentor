export default function NotFound() {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="text-center">
        <h1 className="text-4xl font-bold text-gray-900 mb-4">404</h1>
        <p className="text-gray-600 mb-8">페이지를 찾을 수 없습니다.</p>
        <p className="text-sm text-gray-500">
          유효하지 않은 링크이거나 삭제된 페이지입니다.
        </p>
      </div>
    </div>
  );
}
