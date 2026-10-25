import { dsClass } from '../../utils/dsClass';
import React from 'react';

interface Column<T> {
  key: string;
  header: string;
  render?: (item: T, index: number) => React.ReactNode;
  className?: string;
  headerClassName?: string;
}

interface TableProps<T> {
  columns: Column<T>[];
  data: T[];
  keyExtractor: (item: T, index: number) => string | number;
  onRowClick?: (item: T) => void;
  emptyMessage?: string;
  emptyIcon?: React.ReactNode;
  isLoading?: boolean;
  loadingRows?: number;
  className?: string;
  compact?: boolean;
}

function Table<T>({
  columns,
  data,
  keyExtractor,
  onRowClick,
  emptyMessage = 'No data available',
  emptyIcon,
  isLoading = false,
  loadingRows = 5,
  className = '',
  compact = false,
}: TableProps<T>) {
  const cellPadding = compact ? 'px-4 py-2' : 'px-6 py-4';
  const headerPadding = compact ? 'px-4 py-2' : 'px-6 py-3';

  if (isLoading) {
    return (
      <div className={dsClass(`overflow-hidden rounded-xl border border-gray-200 ${className}`)}>
        <table className={dsClass("min-w-full divide-y divide-gray-200")}>
          <thead className={dsClass("bg-gray-50")}>
            <tr>
              {columns.map((col) => (
                <th
                  key={col.key}
                  className={dsClass(`${headerPadding} text-left text-xs font-semibold text-gray-600 uppercase tracking-wider ${col.headerClassName || ''}`)}
                >
                  {col.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className={dsClass("bg-white divide-y divide-gray-100")}>
            {Array.from({ length: loadingRows }).map((_, i) => (
              <tr key={i}>
                {columns.map((col) => (
                  <td key={col.key} className={dsClass(cellPadding)}>
                    <div className={dsClass("h-4 bg-gray-200 rounded animate-pulse")} style={{ width: `${60 + Math.random() * 40}%` }} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className={dsClass(`overflow-hidden rounded-xl border border-gray-200 ${className}`)}>
        <table className={dsClass("min-w-full divide-y divide-gray-200")}>
          <thead className={dsClass("bg-gray-50")}>
            <tr>
              {columns.map((col) => (
                <th
                  key={col.key}
                  className={dsClass(`${headerPadding} text-left text-xs font-semibold text-gray-600 uppercase tracking-wider ${col.headerClassName || ''}`)}
                >
                  {col.header}
                </th>
              ))}
            </tr>
          </thead>
        </table>
        <div className={dsClass("bg-white px-6 py-12 text-center")}>
          {emptyIcon && <div className="flex justify-center mb-4">{emptyIcon}</div>}
          <p className={dsClass("text-gray-500")}>{emptyMessage}</p>
        </div>
      </div>
    );
  }

  return (
    <div className={dsClass(`overflow-hidden rounded-xl border border-gray-200 ${className}`)}>
      <div className="overflow-x-auto">
        <table className={dsClass("min-w-full divide-y divide-gray-200")}>
          <thead className={dsClass("bg-gray-50")}>
            <tr>
              {columns.map((col) => (
                <th
                  key={col.key}
                  className={dsClass(`${headerPadding} text-left text-xs font-semibold text-gray-600 uppercase tracking-wider ${col.headerClassName || ''}`)}
                >
                  {col.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className={dsClass("bg-white divide-y divide-gray-100")}>
            {data.map((item, index) => (
              <tr
                key={keyExtractor(item, index)}
                onClick={() => onRowClick?.(item)}
                className={dsClass(`${onRowClick ? 'cursor-pointer hover:bg-gray-50' : ''} transition-colors duration-150 animate-fade-in-up stagger-item`)}
                style={{ animationDelay: `${Math.min(index * 30, 300)}ms` }}
              >
                {columns.map((col) => (
                  <td
                    key={col.key}
                    className={dsClass(`${cellPadding} text-sm text-gray-900 ${col.className || ''}`)}
                  >
                    {col.render
                      ? col.render(item, index)
                      : (item as Record<string, unknown>)[col.key] as React.ReactNode}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default Table;
