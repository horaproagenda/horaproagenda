// Category color mapping for services
// Tons neutros/temáticos — evitamos rosa/coral fixos para não conflitar com a cor do tema.
const categoryColors: Record<string, { bg: string; border: string; text: string; hex: string }> = {
  'Facial': { bg: 'bg-primary/10', border: 'border-primary/40', text: 'text-primary', hex: '#7D573D' },
  'Corporal': { bg: 'bg-amber-100', border: 'border-amber-400', text: 'text-amber-800', hex: '#f59e0b' },
  'Sobrancelhas': { bg: 'bg-purple-100', border: 'border-purple-400', text: 'text-purple-800', hex: '#a855f7' },
  'Capilar': { bg: 'bg-teal-100', border: 'border-teal-400', text: 'text-teal-800', hex: '#14b8a6' },
  'Outros': { bg: 'bg-green-100', border: 'border-green-400', text: 'text-green-800', hex: '#22c55e' },
};

const defaultColor = { bg: 'bg-gray-100', border: 'border-gray-400', text: 'text-gray-800', hex: '#6b7280' };

export function getCategoryColor(category: string): { bg: string; border: string; text: string; hex: string } {
  return categoryColors[category] || defaultColor;
}