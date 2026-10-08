/**
 * Escolhe onde cortar uma folha sem dividir uma linha de texto ao meio.
 * Procura, de baixo para cima a partir do corte ideal, uma faixa em branco.
 * Se não houver (ex.: imagem grande), usa o corte ideal.
 */
export function findSafeBreak(
  isBlankRow: (row: number) => boolean,
  idealRow: number,
  minRow: number,
  blankRunNeeded = 3,
): number {
  let run = 0;
  for (let row = idealRow; row > minRow; row--) {
    if (isBlankRow(row)) {
      run++;
      if (run >= blankRunNeeded) return row + Math.floor(blankRunNeeded / 2);
    } else {
      run = 0;
    }
  }
  return idealRow;
}

/** Calcula as fatias (início/altura em px) respeitando cortes seguros. */
export function computePageSlices(
  totalHeight: number,
  pageContentPx: number,
  isBlankRow: (row: number) => boolean,
  searchFraction = 0.2,
): Array<{ start: number; height: number }> {
  const slices: Array<{ start: number; height: number }> = [];
  let start = 0;
  while (start < totalHeight) {
    const remaining = totalHeight - start;
    if (remaining <= pageContentPx) {
      slices.push({ start, height: remaining });
      break;
    }
    const ideal = start + pageContentPx;
    const min = start + Math.floor(pageContentPx * (1 - searchFraction));
    const cut = findSafeBreak(isBlankRow, ideal, min);
    slices.push({ start, height: cut - start });
    start = cut;
  }
  return slices;
}
