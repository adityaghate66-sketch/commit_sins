// SIRF TESTING KE LIYE. Demo se pehle isko hata denge.
// import.meta.env.DEV = sirf `npm run dev` mein true hota hai.
const states = ['success', 'loading', 'error', 'empty']

export default function DevStateSwitcher({ onPick }) {
  if (!import.meta.env.DEV) return null

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-dashed border-slate-300 bg-white p-3 text-xs text-slate-500">
      <span className="font-medium">Dev only - test states:</span>
      {states.map((state) => (
        <button
          key={state}
          onClick={() => onPick(state)}
          className="rounded-md bg-slate-100 px-2.5 py-1 capitalize text-slate-700 hover:bg-slate-200"
        >
          {state}
        </button>
      ))}
    </div>
  )
}