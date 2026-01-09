import { toast } from 'sonner';

interface ExportOptions {
  filename: string;
  headers: string[];
  rows: (string | number | null | undefined)[][];
  successMessage?: string;
}

let lastExport: {
  filename: string;
  blob: Blob;
  timeout: ReturnType<typeof setTimeout>;
} | null = null;

export function exportToCSV({ filename, headers, rows, successMessage = 'Dados exportados com sucesso!' }: ExportOptions) {
  const csv = [headers, ...rows].map(row => 
    row.map(cell => {
      if (cell === null || cell === undefined) return '-';
      const cellStr = String(cell);
      // Escape quotes and wrap in quotes if contains comma, newline or quote
      if (cellStr.includes(',') || cellStr.includes('\n') || cellStr.includes('"')) {
        return `"${cellStr.replace(/"/g, '""')}"`;
      }
      return cellStr;
    }).join(',')
  ).join('\n');
  
  const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${filename}_${new Date().toISOString().split('T')[0]}.csv`;
  link.click();
  URL.revokeObjectURL(url);

  // Clear any previous undo timeout
  if (lastExport?.timeout) {
    clearTimeout(lastExport.timeout);
  }

  // Store export info for potential undo
  lastExport = {
    filename: link.download,
    blob,
    timeout: setTimeout(() => {
      lastExport = null;
    }, 10000),
  };

  toast.success(successMessage, {
    action: {
      label: 'Exportar novamente',
      onClick: () => {
        const newLink = document.createElement('a');
        newLink.href = URL.createObjectURL(blob);
        newLink.download = link.download;
        newLink.click();
      },
    },
    duration: 5000,
  });
}
