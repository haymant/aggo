module.exports = {
  // Use class-based dark mode so the webview can toggle class 'dark' on <html> or <body>
  darkMode: 'class',
  content: [
    './src/**/*.{html,ts,tsx}'
  ],
  theme: {
    extend: {}
  },
  plugins: []
};
