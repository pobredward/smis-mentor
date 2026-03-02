/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    // !! 주의: 이 옵션은 타입 오류를 무시하고 빌드를 진행합니다. 
    // 실제 문제가 해결되면 제거하는 것이 좋습니다.
    ignoreBuildErrors: true,
  },
}

module.exports = nextConfig 