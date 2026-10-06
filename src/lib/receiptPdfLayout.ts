export interface ReceiptSummaryLayout {
  startsOnNewPage: boolean;
  originalValueY: number;
  additionalItemsY: number;
  discountY?: number;
  paymentMethodsY: number;
  totalY: number;
  paidY: number;
}

interface ReceiptSummaryLayoutOptions {
  tableFinalY: number;
  hasDiscount: boolean;
  pageHeight?: number;
  topMargin?: number;
  bottomMargin?: number;
}

/** Keeps the complete receipt summary together and gives every line a stable baseline. */
export function calculateReceiptSummaryLayout({
  tableFinalY,
  hasDiscount,
  pageHeight = 297,
  topMargin = 20,
  bottomMargin = 15,
}: ReceiptSummaryLayoutOptions): ReceiptSummaryLayout {
  const regularLineGap = 8;
  const totalGap = 12;
  const paidGap = 10;
  const summaryHeight = hasDiscount ? 46 : 38;
  const candidateStartY = tableFinalY + 12;
  const startsOnNewPage = candidateStartY + summaryHeight > pageHeight - bottomMargin;
  let cursorY = startsOnNewPage ? topMargin : candidateStartY;

  const originalValueY = cursorY;
  cursorY += regularLineGap;
  const additionalItemsY = cursorY;
  cursorY += regularLineGap;

  let discountY: number | undefined;
  if (hasDiscount) {
    discountY = cursorY;
    cursorY += regularLineGap;
  }

  const paymentMethodsY = cursorY;
  cursorY += totalGap;
  const totalY = cursorY;
  cursorY += paidGap;

  return {
    startsOnNewPage,
    originalValueY,
    additionalItemsY,
    discountY,
    paymentMethodsY,
    totalY,
    paidY: cursorY,
  };
}