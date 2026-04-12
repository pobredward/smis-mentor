module.exports = function (api) {
  api.cache(true);
  
  const isProduction = process.env.NODE_ENV === 'production';
  
  return {
    presets: ['babel-preset-expo'],
    plugins: [
      // 프로덕션 빌드에서 console.log, console.info, console.debug 제거
      // error와 warn은 유지
      ...(isProduction
        ? [
            [
              'transform-remove-console',
              {
                exclude: ['error', 'warn'],
              },
            ],
          ]
        : []),
    ],
  };
};
