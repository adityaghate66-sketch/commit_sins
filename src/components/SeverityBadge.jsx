// Reusable badge. Prop: severity = 'Critical' | 'High' | 'Medium' | 'Low'
const styles = {
  Critical: 'bg-rose-50 text-rose-700 ring-rose-200',
  High: 'bg-orange-50 text-orange-700 ring-orange-200',
  Medium: 'bg-amber-50 text-amber-700 ring-amber-200',
  Low: 'bg-sky-50 text-sky-700 ring-sky-200',
}

export default function SeverityBadge({ severity }) {
  // Agar koi anjaan severity aaye toh grey badge dikhega (crash nahi hoga)
  const classes = styles[severity] ?? 'bg-slate-100 text-slate-600 ring-slate-200'

  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${classes}`}
    >
      {severity ?? 'Unknown'}
    </span>
  )
}