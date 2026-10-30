import { Lock } from 'lucide-react'
import SeverityBadge from './SeverityBadge'
import StatusBadge from './StatusBadge'
import { maskSecret } from '../utils/maskSecret'

// Table component.
// Prop: findings = findings ki list (abhi sample data se aa rahi hai)
export default function FindingsTable({ findings }) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
      {/* Table ka title + masking note */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-5 py-4">
        <div>
          <h2 className="text-base font-semibold text-slate-800">Findings</h2>
          <p className="text-sm text-slate-500">
            {findings.length} potential secrets detected (sample data)
          </p>
        </div>

        <p className="flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">
          <Lock className="h-3.5 w-3.5" />
          Values are always masked
        </p>
      </div>

      {/* overflow-x-auto = table chaudi ho toh side mein scroll ho */}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-5 py-3 font-medium">Provider / Category</th>
              <th className="px-5 py-3 font-medium">File Path</th>
              <th className="px-5 py-3 font-medium">Line</th>
              <th className="px-5 py-3 font-medium">Severity</th>
              <th className="px-5 py-3 font-medium">Masked Value</th>
              <th className="px-5 py-3 font-medium">Status</th>
            </tr>
          </thead>

          <tbody className="divide-y divide-slate-100">
            {findings.map((finding) => (
              <tr key={finding.id} className="hover:bg-slate-50">
                <td className="px-5 py-3">
                  <p className="font-medium text-slate-800">{finding.provider}</p>
                  <p className="text-xs text-slate-500">{finding.category}</p>
                </td>
                <td className="px-5 py-3 font-mono text-xs text-slate-600">
                  {finding.file}
                </td>
                <td className="px-5 py-3 text-slate-600">{finding.line}</td>
                <td className="px-5 py-3">
                  <SeverityBadge severity={finding.severity} />
                </td>
                <td className="px-5 py-3">
                  {/* Masked value hamesha maskSecret() se guzar ke dikhegi */}
                  <span className="rounded-md bg-slate-100 px-2 py-1 font-mono text-xs text-slate-700">
                    {maskSecret(finding.maskedValue)}
                  </span>
                </td>
                <td className="px-5 py-3">
                  <StatusBadge status={finding.status} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}