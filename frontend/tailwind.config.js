/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Symptom Savior Brand Colors
        'deep-midnight': '#1a1a2e',
        'sky-blue': '#e3f2fd',
        'cloud-ivory': '#fefefe',
        'soft-gray': '#9e9e9e',
        'healing-teal': '#26a69a',
        'guardian-gold': '#ffc107',
      },
      fontFamily: {
        'heading': ['DM Serif Display', 'serif'],
        'subheading': ['Poppins', 'sans-serif'],
        'body': ['Inter', 'sans-serif'],
        'mono': ['JetBrains Mono', 'monospace'],
      },
      boxShadow: {
        'mild': '0 2px 8px rgba(0, 0, 0, 0.1)',
        'soft': '0 4px 16px rgba(0, 0, 0, 0.12)',
        'glow': '0 0 20px rgba(38, 166, 154, 0.3)',
      },
      animation: {
        'float': 'float 3s ease-in-out infinite',
        'pulse-glow': 'pulse-glow 2s ease-in-out infinite',
      },
      keyframes: {
        float: {
          '0%, 100%': { transform: 'translateY(0px)' },
          '50%': { transform: 'translateY(-10px)' },
        },
        'pulse-glow': {
          '0%, 100%': { boxShadow: '0 0 20px rgba(38, 166, 154, 0.3)' },
          '50%': { boxShadow: '0 0 30px rgba(38, 166, 154, 0.5)' },
        },
      },
    },
  },
  plugins: [],
}