import { useState } from 'react'
import { ShieldCheck, LayoutDashboard, ScanSearch, Wrench, History, Settings } from 'lucide-react'

// Menu ki list. Naya item chahiye toh bas yahan ek line badhao.
const menuItems = [
  { name: 'Dashboard', icon: LayoutDashboard },
  { name: 'Scan Results', icon: ScanSearch },
  { name: 'Remediation', icon: Wrench },
  { name: 'History', icon: History },
  { name: 'Settings', icon: Settings },
]

export default function Sidebar() {
  // useState = component ki "yaad". Yahan yaad rakhta hai ki kaun sa item active hai.
  // activeItem = abhi ki value, setActiveItem = value badalne wala function.
  const [activeItem, setActiveItem] = useState('Dashboard')

  return (
    <div className="flex h-full flex-col">
      {/* Logo */}
      <div className="flex h-16 items-center gap-2 border-b border-slate-200 px-5">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-600">
          <ShieldCheck className="h-5 w-5 text-white" />
        </div>
        <span className="text-lg font-semibold text-slate-800">LeakShield</span>
      </div>

      {/* Menu */}
      <nav className="space-y-1 p-3">
        {menuItems.map(({ name, icon: Icon }) => {
          const isActive = name === activeItem

          return (
            <button
              key={name}
              onClick={() => setActiveItem(name)}
              className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-indigo-50 text-indigo-600'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              <Icon className="h-5 w-5" />
              {name}
            </button>
          )
        })}
      </nav>
    </div>
  )
}