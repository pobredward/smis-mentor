const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

// 모노레포 루트 경로
const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');

// Firebase와의 호환성을 위한 설정
config.resolver.sourceExts.push('cjs');
config.resolver.unstable_enablePackageExports = false;

// 모노레포 환경에서 node_modules 해석 경로 설정
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];

// Metro가 감시할 폴더 설정 (모노레포 전체 + node_modules)
config.watchFolders = [
  projectRoot,
  path.resolve(workspaceRoot, 'packages/shared'),
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];

module.exports = config;
