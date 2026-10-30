import { CircleCheck, TriangleAlert } from 'lucide-react'

// Dashboard ki alag-alag haalaton ke views, sab ek file mein.

// ---------- LOADING ----------
// animate-pulse = halka dhadakne wala effect
export function SkeletonCards() {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {[0, 1, 2, 3].map((i) => (
        <div
          key={i}
          className="flex animate-pulse items-center gap-4 rounded-xl border border-slate-200 bg-white p-5"
        >
          <div className="h-12 w-12 rounded-full bg-slate-200" />
          <div className="space-y-2">
            <div className="h-3 w-24 rounded bg-slate-200" />
            <div className="h-7 w-12 rounded bg-slate-200" />
          </div>
        </div>
      ))}
    </div>
  )
}

export function SkeletonTable() {
  return (
    <div className="animate-pulse space-y-3 rounded-xl border border-slate-200 bg-white p-5">
      <div className="h-4 w-32 rounded bg-slate-200" />
      {[0, 1, 2, 3, 4].map((i) => (
        <div key={i} className="h-10 rounded bg-slate-200" />
      ))}
    </div>
  )
}

// ---------- ERROR ----------
// Props: message (kya galat hua) aur onRetry (Retry dabane par chalne wala function)
export function ErrorBox({ message, onRetry }) {
  return (
    <div
      role="alert"
      className="flex flex-wrap items-center gap-4 rounded-xl border border-rose-200 bg-rose-50 p-5"
    >
      <TriangleAlert className="h-6 w-6 shrink-0 text-rose-600" />

      <div className="min-w-0 flex-1">
        <p className="font-medium text-rose-800">Scan failed</p>
        <p className="text-sm text-rose-700">{message}</p>
      </div>

      <button
        onClick={onRetry}
        className="rounded-lg bg-white px-4 py-2 text-sm font-medium text-rose-700 ring-1 ring-inset ring-rose-200 transition-colors hover:bg-rose-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-600"
      >
        Retry
      </button>
    </div>
  )
}

// ---------- EMPTY (koi secret nahi mila) ----------
export function EmptyState() {
  return (
    <div className="flex flex-col items-center rounded-xl border border-slate-200 bg-white px-6 py-14 text-center shadow-sm">
      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-50">
        <CircleCheck className="h-8 w-8 text-emerald-600" />
      </div>
      <h2 className="text-lg font-semibold text-slate-800">No secrets found</h2>
      <p className="mt-1 text-sm text-slate-500">
        Your repository looks clean. Safe to commit!
      </p>
    </div>
  )
}