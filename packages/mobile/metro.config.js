const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

// Firebase와의 호환성을 위한 설정
config.resolver.sourceExts.push('cjs');
config.resolver.unstable_enablePackageExports = false;

// react-native-webview 중복 등록 방지
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === 'react-native-webview') {
    const webviewPath = path.resolve(
      __dirname,
      'node_modules/react-native-webview'
    );
    return {
      filePath: path.join(webviewPath, 'index.js'),
      type: 'sourceFile',
    };
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
