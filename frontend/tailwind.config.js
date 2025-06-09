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
        'guardian-gold': '#FFD700',
        'healing-teal': '#00B5B2',
        'sky-blue': '#AEE1F9',
        'deep-midnight': '#0C1A2A',
        'cloud-ivory': '#F9F9F9',
        'soft-gray': '#B0BEC5',
      },
      fontFamily: {
        // Symptom Savior Typography
        'heading': ['DM Serif Display', 'serif'],
        'subheading': ['Poppins', 'sans-serif'],
        'body': ['Inter', 'sans-serif'],
        'mono': ['JetBrains Mono', 'Source Code Pro', 'monospace'],
      },
      borderRadius: {
        'xl': '1rem',
        '2xl': '1.5rem',
      },
      boxShadow: {
        'mild': '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
        'soft': '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)',
        'glow': '0 0 20px rgba(0, 181, 178, 0.3)',
      },
    },
  },
  plugins: [],
}