// Category color mapping for services
const categoryColors: Record<string, string> = {
  'Facial': '#E8B4BC',
  'Corporal': '#C9A86C',
  'Sobrancelhas': '#B8A9C9',
  'Capilar': '#A8C9C9',
  'Outros': '#A8C9A7',
};

export function getCategoryColor(category: string): string {
  return categoryColors[category] || categoryColors['Outros'];
}