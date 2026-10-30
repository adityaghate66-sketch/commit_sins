import { useState } from 'react'
import { FileSearch, ShieldAlert, TriangleAlert, CircleCheck } from 'lucide-react'
import Layout from './components/Layout'
import Sidebar from './components/Sidebar'
import Header from './components/Header'
import SummaryCard from './components/SummaryCard'
import FindingsTable from './components/FindingsTable'
import DevStateSwitcher from './components/DevStateSwitcher'
import {
  SkeletonCards,
  SkeletonTable,
  ErrorBox,
  EmptyState,
} from './components/StateViews'
import { sampleScan } from './data/sampleData'

function App() {
  // status: 'success' | 'loading' | 'error' | 'empty'
  const [status, setStatus] = useState('success')
  const [scannedAt, setScannedAt] = useState(sampleScan.scannedAt)
  const [errorMessage, setErrorMessage] = useState('')

  // FAKE scan: 1.5 second baad success.
  // Asli backend call Milestone 13 mein isi function ke andar aayega.
  function handleRescan() {
    setStatus('loading')
    setErrorMessage('')

    setTimeout(() => {
      setScannedAt(new Date().toISOString())
      setStatus('success')
    }, 1500)
  }

  // Sirf testing ke liye: kisi bhi state ko zabardasti dikhao
  function handleDevPick(name) {
    if (name === 'error') {
      setErrorMessage('Demo error: could not reach the scan service.')
    }
    setStatus(name)
  }

  // Empty state mein findings ki list khali maani jayegi
  const findings = status === 'empty' ? [] : sampleScan.findings

  // Active = jo abhi tak resolve nahi hue
  const activeFindings = findings.filter((f) => f.status === 'Active')

  const summaryCards = [
    {
      label: 'Files Scanned',
      value: sampleScan.filesScanned,
      icon: FileSearch,
      tone: 'indigo',
    },
    {
      label: 'Active Secrets',
      value: activeFindings.length,
      icon: ShieldAlert,
      tone: 'amber',
    },
    {
      label: 'Critical / High',
      value: activeFindings.filter(
        (f) => f.severity === 'Critical' || f.severity === 'High',
      ).length,
      icon: TriangleAlert,
      tone: 'rose',
    },
    {
      label: 'Resolved',
      value: findings.filter((f) => f.status === 'Resolved').length,
      icon: CircleCheck,
      tone: 'emerald',
    },
  ]

  const cards = (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {summaryCards.map((card) => (
        <SummaryCard key={card.label} {...card} />
      ))}
    </div>
  )

  return (
    <Layout
      sidebar={<Sidebar />}
      header={
        <Header
          repo={sampleScan.repo}
          scannedAt={scannedAt}
          status={status}
          onRescan={handleRescan}
        />
      }
    >
      <div className="space-y-6">
        <DevStateSwitcher onPick={handleDevPick} />

        {/* 1. LOADING */}
        {status === 'loading' && (
          <>
            <SkeletonCards />
            <SkeletonTable />
          </>
        )}

        {/* 2. ERROR */}
        {status === 'error' && (
          <ErrorBox message={errorMessage} onRetry={handleRescan} />
        )}

        {/* 3. EMPTY */}
        {status === 'empty' && (
          <>
            {cards}
            <EmptyState />
          </>
        )}

        {/* 4. SUCCESS */}
        {status === 'success' && (
          <>
            {cards}
            <FindingsTable findings={findings} />
          </>
        )}
      </div>
    </Layout>
  )
}

export default App