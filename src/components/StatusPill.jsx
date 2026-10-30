// Reusable pill. Props: status = 'success' | 'loading' | 'error' | 'empty'
const styles = {
  success: {
    label: 'Scan Complete',
    classes: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
    dot: 'bg-emerald-500',
  },
  loading: {
    label: 'Scanning...',
    classes: 'bg-indigo-50 text-indigo-700 ring-indigo-200',
    dot: 'bg-indigo-500 animate-pulse',
  },
  error: {
    label: 'Scan Failed',
    classes: 'bg-rose-50 text-rose-700 ring-rose-200',
    dot: 'bg-rose-500',
  },
  empty: {
    label: 'No Secrets Found',
    classes: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
    dot: 'bg-emerald-500',
  },
}

export default function StatusPill({ status }) {
  // Agar galat status aaye toh 'success' wala style use hoga
  const current = styles[status] ?? styles.success

  return (
    <span
      className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-medium ring-1 ring-inset ${current.classes}`}
    >
      <span className={`h-2 w-2 rounded-full ${current.dot}`} />
      {current.label}
    </span>
  )
}