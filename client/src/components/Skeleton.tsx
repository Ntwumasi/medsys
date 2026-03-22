import React from 'react';

interface SkeletonProps {
  className?: string;
}

// Base skeleton with shimmer animation
export const Skeleton: React.FC<SkeletonProps> = ({ className = '' }) => (
  <div className={`animate-pulse bg-gray-200 rounded ${className}`} />
);

// Card skeleton for summary cards
export const CardSkeleton: React.FC = () => (
  <div className="bg-white rounded-xl p-5 border border-gray-200 shadow-sm">
    <Skeleton className="h-4 w-24 mb-3" />
    <Skeleton className="h-8 w-32 mb-2" />
    <Skeleton className="h-3 w-20" />
  </div>
);

// Gradient card skeleton (for primary stats)
export const GradientCardSkeleton: React.FC = () => (
  <div className="rounded-xl p-5 bg-gradient-to-br from-gray-200 to-gray-300 animate-pulse">
    <div className="h-4 w-24 bg-gray-300 rounded mb-3" />
    <div className="h-8 w-32 bg-gray-300 rounded mb-2" />
    <div className="h-3 w-28 bg-gray-300 rounded" />
  </div>
);

// Table row skeleton
export const TableRowSkeleton: React.FC<{ columns?: number }> = ({ columns = 6 }) => (
  <tr className="border-b border-gray-100">
    {Array.from({ length: columns }).map((_, i) => (
      <td key={i} className="px-4 py-3">
        <Skeleton className={`h-4 ${i === 0 ? 'w-20' : i === 1 ? 'w-32' : 'w-16'}`} />
      </td>
    ))}
  </tr>
);

// Table skeleton
export const TableSkeleton: React.FC<{ rows?: number; columns?: number }> = ({
  rows = 5,
  columns = 6
}) => (
  <div className="overflow-x-auto">
    <table className="w-full">
      <thead>
        <tr className="bg-gray-50 border-b border-gray-200">
          {Array.from({ length: columns }).map((_, i) => (
            <th key={i} className="px-4 py-3 text-left">
              <Skeleton className="h-4 w-20" />
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {Array.from({ length: rows }).map((_, i) => (
          <TableRowSkeleton key={i} columns={columns} />
        ))}
      </tbody>
    </table>
  </div>
);

// Chart skeleton
export const ChartSkeleton: React.FC<{ height?: string }> = ({ height = 'h-64' }) => (
  <div className={`${height} bg-gray-50 rounded-lg animate-pulse flex items-end justify-around p-4 gap-2`}>
    <div className="w-8 bg-gray-200 rounded-t" style={{ height: '60%' }} />
    <div className="w-8 bg-gray-200 rounded-t" style={{ height: '40%' }} />
    <div className="w-8 bg-gray-200 rounded-t" style={{ height: '80%' }} />
    <div className="w-8 bg-gray-200 rounded-t" style={{ height: '55%' }} />
    <div className="w-8 bg-gray-200 rounded-t" style={{ height: '70%' }} />
    <div className="w-8 bg-gray-200 rounded-t" style={{ height: '45%' }} />
    <div className="w-8 bg-gray-200 rounded-t" style={{ height: '65%' }} />
  </div>
);

// Line chart skeleton
export const LineChartSkeleton: React.FC<{ height?: string }> = ({ height = 'h-64' }) => (
  <div className={`${height} bg-gray-50 rounded-lg animate-pulse relative p-4`}>
    <svg className="w-full h-full" viewBox="0 0 400 150" preserveAspectRatio="none">
      <path
        d="M 0,100 Q 50,80 100,90 T 200,70 T 300,85 T 400,60"
        fill="none"
        stroke="#E5E7EB"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  </div>
);

// Pie chart skeleton
export const PieChartSkeleton: React.FC<{ size?: string }> = ({ size = 'w-48 h-48' }) => (
  <div className={`${size} rounded-full bg-gradient-to-br from-gray-200 via-gray-100 to-gray-200 animate-pulse mx-auto`}>
    <div className="w-full h-full relative">
      <div className="absolute inset-4 rounded-full bg-white" />
    </div>
  </div>
);

// Stats summary skeleton for overview
export const StatsSummarySkeleton: React.FC = () => (
  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
    <GradientCardSkeleton />
    <CardSkeleton />
    <CardSkeleton />
    <CardSkeleton />
  </div>
);

// Dashboard overview skeleton
export const OverviewSkeleton: React.FC = () => (
  <div className="space-y-6">
    <StatsSummarySkeleton />
    <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
      <Skeleton className="h-6 w-40 mb-4" />
      <LineChartSkeleton />
    </div>
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
        <Skeleton className="h-6 w-36 mb-4" />
        <PieChartSkeleton />
      </div>
      <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
        <Skeleton className="h-6 w-36 mb-4" />
        <ChartSkeleton />
      </div>
    </div>
  </div>
);

// Invoices tab skeleton
export const InvoicesSkeleton: React.FC = () => (
  <div className="space-y-4">
    <div className="flex gap-4">
      <Skeleton className="h-10 w-48" />
      <Skeleton className="h-10 w-64" />
    </div>
    <TableSkeleton rows={8} columns={7} />
  </div>
);

// Claims tab skeleton
export const ClaimsSkeleton: React.FC = () => (
  <div className="space-y-6">
    <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3">
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="bg-white rounded-lg p-3 border border-gray-200 animate-pulse">
          <Skeleton className="h-3 w-16 mb-2" />
          <Skeleton className="h-6 w-12" />
        </div>
      ))}
    </div>
    <TableSkeleton rows={6} columns={8} />
  </div>
);

// Aging report skeleton
export const AgingSkeleton: React.FC = () => (
  <div className="space-y-6">
    <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="bg-white rounded-lg p-4 border border-gray-200 animate-pulse">
          <Skeleton className="h-4 w-20 mb-2" />
          <Skeleton className="h-6 w-24 mb-1" />
          <Skeleton className="h-3 w-16" />
        </div>
      ))}
    </div>
    <TableSkeleton rows={6} columns={6} />
  </div>
);

// Reminders tab skeleton
export const RemindersSkeleton: React.FC = () => (
  <div className="space-y-6">
    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <CardSkeleton key={i} />
      ))}
    </div>
    <TableSkeleton rows={6} columns={7} />
  </div>
);

export default Skeleton;
