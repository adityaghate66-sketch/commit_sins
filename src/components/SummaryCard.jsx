// Reusable card.
// Props: label (naam), value (number), icon (lucide icon), tone (rang)
const tones = {
  indigo: 'bg-indigo-50 text-indigo-600',
  amber: 'bg-amber-50 text-amber-600',
  rose: 'bg-rose-50 text-rose-600',
  emerald: 'bg-emerald-50 text-emerald-600',
}

export default function SummaryCard({ label, value, icon: Icon, tone = 'indigo' }) {
  return (
    <div className="flex items-center gap-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div
        className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full ${tones[tone]}`}
      >
        <Icon className="h-6 w-6" />
      </div>

      <div>
        <p className="text-sm text-slate-500">{label}</p>
        <p className="text-3xl font-semibold text-slate-800">{value}</p>
      </div>
    </div>
  )
}