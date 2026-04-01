import Sentry from './sentry.config';
import React from 'react';
import { StatusBar } from 'expo-status-bar';
import { RootNavigator } from './src/navigation';
import { WebViewCacheProvider } from './src/context/WebViewCacheContext';
import { AuthProvider } from './src/context/AuthContext';

function App() {
  return (
    <AuthProvider>
      <WebViewCacheProvider>
        <RootNavigator />
        <StatusBar style="auto" />
      </WebViewCacheProvider>
    </AuthProvider>
  );
}

// Sentry로 래핑된 App 컴포넌트 export
export default Sentry.wrap(App);

