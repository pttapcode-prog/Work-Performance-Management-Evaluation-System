/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'],
      },
      colors: {
        lark: {
          blue: '#3370FF',
          blueHover: '#245BDB',
          blueLight: '#EBF2FF',
          bg: '#F5F6F7',
          border: '#DEE0E3',
          text: '#1F2329',
          muted: '#646A73',
        },
      },
    },
  },
  plugins: [],
};
