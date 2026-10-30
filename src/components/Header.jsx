import { RefreshCw } from 'lucide-react'
import StatusPill from './StatusPill'

// ISO date ko padhne layak time mein badalta hai
function formatTime(iso) {
  if (!iso) return '-'
  return new Date(iso).toLocaleString('en-IN', {
    dateStyle: 'medium',
    timeStyle: 'medium',
  })
}

// Props: repo, scannedAt, status ('success' | 'loading' | 'error') aur onRescan
export default function Header({ repo, scannedAt, status, onRescan }) {
  // Scan chal raha hai ya nahi
  const isScanning = status === 'loading'

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-3">
      <div className="min-w-0">
        <h1 className="truncate text-lg font-semibold text-slate-800">
          Security Dashboard
        </h1>
        <p className="truncate text-sm text-slate-500">
          {repo} &middot; Last scan: {formatTime(scannedAt)}
        </p>
      </div>

      <div className="flex items-center gap-3">
        <StatusPill status={status} />

        <button
          onClick={onRescan}
          disabled={isScanning}
          className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-indigo-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:bg-indigo-600"
        >
          <RefreshCw className={`h-4 w-4 ${isScanning ? 'animate-spin' : ''}`} />
          {isScanning ? 'Scanning...' : 'Rescan'}
        </button>
      </div>
    </div>
  )
}