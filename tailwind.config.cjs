/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./index.html', './lights.js', './js/**/*.js'],
  theme: {
    extend: {
      colors: {
        primary: '#7c3aed',
        'primary-dark': '#6d28d9',
      },
    },
  },
  plugins: [],
};
