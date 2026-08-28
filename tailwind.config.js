/** Tailwind config — compiled to public/tailwind.css (no runtime CDN needed). */
module.exports = {
  content: ['./public/index.html', './public/app.js'],
  theme: {
    extend: {
      colors: {
        navy: '#1f2a44', brand: '#1f7a5a', brandDark: '#155c43', gold: '#b08a2e',
        ink: '#222a33', mute: '#5a6472', line: '#e3e9e6', paper: '#f6f8f7',
      },
      fontFamily: { sans: ['Inter', 'system-ui', 'Segoe UI', 'Arial', 'sans-serif'] },
    },
  },
  // classes composed dynamically in JS (e.g. `text-${color}`) must be safelisted
  safelist: [
    'text-navy','text-brand','text-gold','text-mute','text-ink',
    'bg-navy','bg-brand','bg-gold','bg-paper',
    'bg-amber-400','bg-emerald-400','bg-teal-400','bg-red-300',
    'bg-slate-100','text-slate-600','bg-amber-100','text-amber-700',
    'bg-blue-100','text-blue-700','bg-indigo-100','text-indigo-700',
    'bg-violet-100','text-violet-700','bg-emerald-100','text-emerald-700',
    'bg-teal-100','text-teal-700','bg-red-100','text-red-700','bg-slate-100',
  ],
};
