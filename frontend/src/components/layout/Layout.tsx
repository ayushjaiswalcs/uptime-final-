import Sidebar from './Sidebar'
import VerifyBanner from '../auth/VerifyBanner'
import DemoBanner from '../demo/DemoBanner'

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen app-shell">
      <Sidebar />
      <main className="flex-1 ml-60 min-h-screen overflow-x-hidden">
        <DemoBanner />
        <VerifyBanner />
        {children}
      </main>
    </div>
  )
}
