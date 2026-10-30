// Layout = poore page ka "frame": sidebar + header + main area.
// Props: sidebar, header (dono ek-ek JSX tukda) aur children.
// children = jo bhi <Layout> ... </Layout> ke beech likha hoga.
export default function Layout({ sidebar, header, children }) {
  return (
    <div className="flex min-h-screen bg-slate-50 text-slate-800">
      {/* Left: sidebar */}
      <aside className="w-64 shrink-0 border-r border-slate-200 bg-white">
        {sidebar}
      </aside>

      {/* Right: header (upar) + main content (neeche) */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="border-b border-slate-200 bg-white">
          {header}
        </header>

        <main className="flex-1 p-6">
          {children}
        </main>
      </div>
    </div>
  )
}