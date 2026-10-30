// Reusable badge. Prop: status = 'Active' | 'Resolved'
const styles = {
  Active: 'bg-amber-50 text-amber-700 ring-amber-200',
  Resolved: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
}

export default function StatusBadge({ status }) {
  const classes = styles[status] ?? 'bg-slate-100 text-slate-600 ring-slate-200'

  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${classes}`}
    >
      {status ?? 'Unknown'}
    </span>
  )
}