import React from 'react'

interface SkeletonProps {
  className?: string
}

export function Skeleton({ className = '' }: SkeletonProps) {
  return (
    <div className={`animate-pulse rounded bg-[var(--bg-tertiary)] ${className}`} />
  )
}

export function StatCardSkeleton() {
  return (
    <div className="card p-5 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <Skeleton className="h-4 w-28" />
        <Skeleton className="h-8 w-8 rounded-lg" />
      </div>
      <Skeleton className="h-8 w-20" />
      <Skeleton className="h-3 w-36" />
    </div>
  )
}

export function ChartSkeleton({ height = 200 }: { height?: number }) {
  return (
    <div className="card p-5 flex flex-col gap-4">
      <Skeleton className="h-5 w-40" />
      <div style={{ height }} className="animate-pulse rounded bg-[var(--bg-tertiary)]" />
    </div>
  )
}

export function MonitorRowSkeleton() {
  return (
    <div className="flex items-center gap-4 px-4 py-3 border-b border-[var(--border)]">
      <Skeleton className="h-3 w-3 rounded-full" />
      <Skeleton className="h-4 w-40" />
      <Skeleton className="h-4 w-24 ml-auto" />
      <Skeleton className="h-4 w-16" />
      <Skeleton className="h-6 w-24 rounded" />
    </div>
  )
}
