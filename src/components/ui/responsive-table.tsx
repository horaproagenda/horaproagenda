import * as React from 'react';
import { useIsMobile } from '@/hooks/use-mobile';
import { cn } from '@/lib/utils';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

/**
 * Tabela responsiva compartilhada.
 *
 * Desktop/tablet largo: renderiza a `Table` normal (rolagem horizontal fica
 * confinada ao próprio componente, via [data-table-wrapper]).
 *
 * Celular (<768px): cada linha vira um cartão vertical com rótulo + valor.
 * Nenhuma coluna é descartada — colunas marcadas como `secondary` aparecem
 * abaixo das principais, e `actions` vai para o rodapé do cartão.
 *
 * Regra de projeto: só apresentação. Não altera dados, permissões ou cálculos.
 */
export interface ResponsiveColumn<T> {
  /** Identificador único da coluna. */
  key: string;
  /** Cabeçalho exibido na tabela e usado como rótulo no cartão. */
  header: React.ReactNode;
  /** Conteúdo da célula. */
  cell: (row: T, index: number) => React.ReactNode;
  /**
   * `primary` (padrão) — destaque no topo do cartão.
   * `secondary` — pares rótulo/valor no corpo do cartão.
   * `actions` — rodapé do cartão.
   */
  priority?: 'primary' | 'secondary' | 'actions';
  /** Classe da célula na visão de tabela. */
  className?: string;
  /** Classe do cabeçalho na visão de tabela. */
  headClassName?: string;
  /** Oculta o rótulo no cartão (útil para títulos e ações). */
  hideLabelOnCard?: boolean;
}

interface ResponsiveTableProps<T> {
  data: T[];
  columns: ResponsiveColumn<T>[];
  getRowKey: (row: T, index: number) => string;
  emptyMessage?: React.ReactNode;
  onRowClick?: (row: T) => void;
  /** Classe aplicada a cada linha/cartão. */
  rowClassName?: (row: T) => string | undefined;
  /** Largura mínima da tabela em desktop (ex.: 'min-w-[900px]'). */
  minWidthClassName?: string;
  className?: string;
  /** Força a visão de cartões (independente da largura). */
  forceCards?: boolean;
}

export function ResponsiveTable<T>({
  data,
  columns,
  getRowKey,
  emptyMessage = 'Nenhum registro encontrado',
  onRowClick,
  rowClassName,
  minWidthClassName,
  className,
  forceCards,
}: ResponsiveTableProps<T>) {
  const isMobile = useIsMobile();
  const asCards = forceCards ?? isMobile;

  if (data.length === 0) {
    return (
      <div className="py-8 text-center text-sm text-muted-foreground">{emptyMessage}</div>
    );
  }

  if (asCards) {
    const primary = columns.filter((c) => (c.priority ?? 'primary') === 'primary');
    const secondary = columns.filter((c) => c.priority === 'secondary');
    const actions = columns.filter((c) => c.priority === 'actions');

    return (
      <div className={cn('space-y-2', className)} data-responsive-cards="">
        {data.map((row, index) => (
          <div
            key={getRowKey(row, index)}
            className={cn(
              'rounded-lg border border-border bg-card p-3 text-sm shadow-sm',
              onRowClick && 'cursor-pointer active:bg-muted/50',
              rowClassName?.(row),
            )}
            onClick={onRowClick ? () => onRowClick(row) : undefined}
          >
            {primary.length > 0 && (
              <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
                {primary.map((col) => (
                  <div key={col.key} className="min-w-0 max-w-full break-words">
                    {!col.hideLabelOnCard && (
                      <span className="block text-[11px] leading-tight text-muted-foreground">
                        {col.header}
                      </span>
                    )}
                    <span className="block min-w-0 font-medium">{col.cell(row, index)}</span>
                  </div>
                ))}
              </div>
            )}

            {secondary.length > 0 && (
              <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1.5 border-t border-border/60 pt-2">
                {secondary.map((col) => (
                  <div key={col.key} className="min-w-0">
                    {!col.hideLabelOnCard && (
                      <dt className="text-[11px] leading-tight text-muted-foreground">
                        {col.header}
                      </dt>
                    )}
                    <dd className="min-w-0 break-words text-xs">{col.cell(row, index)}</dd>
                  </div>
                ))}
              </dl>
            )}

            {actions.length > 0 && (
              <div
                className="mt-2 flex flex-wrap items-center justify-end gap-1.5 border-t border-border/60 pt-2"
                onClick={(e) => e.stopPropagation()}
              >
                {actions.map((col) => (
                  <React.Fragment key={col.key}>{col.cell(row, index)}</React.Fragment>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    );
  }

  return (
    <Table className={cn(minWidthClassName, className)}>
      <TableHeader>
        <TableRow>
          {columns.map((col) => (
            <TableHead
              key={col.key}
              className={cn(col.priority === 'actions' && 'text-right', col.headClassName)}
            >
              {col.header}
            </TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {data.map((row, index) => (
          <TableRow
            key={getRowKey(row, index)}
            className={cn(onRowClick && 'cursor-pointer', rowClassName?.(row))}
            onClick={onRowClick ? () => onRowClick(row) : undefined}
          >
            {columns.map((col) => (
              <TableCell
                key={col.key}
                className={cn(col.priority === 'actions' && 'text-right', col.className)}
                onClick={col.priority === 'actions' ? (e) => e.stopPropagation() : undefined}
              >
                {col.cell(row, index)}
              </TableCell>
            ))}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
