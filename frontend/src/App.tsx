import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import { useAuthStore } from '@/stores/auth.store'
import { LoginPage } from '@/pages/LoginPage'
import { RegisterPage } from '@/pages/RegisterPage'
import { LobbyPage } from '@/pages/LobbyPage'
import { GameRoomPage } from '@/pages/GameRoomPage'
import { HiloPage } from '@/pages/HiloPage'
import { ArenaPage } from '@/pages/ArenaPage'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, staleTime: 30_000 },
  },
})

function PrivateRoute({ children }: { children: React.ReactNode }) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  return isAuthenticated ? <>{children}</> : <Navigate to="/login" replace />
}

function PublicRoute({ children }: { children: React.ReactNode }) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  return isAuthenticated ? <Navigate to="/lobby" replace /> : <>{children}</>
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Navigate to="/lobby" replace />} />
          <Route path="/login" element={<PublicRoute><LoginPage /></PublicRoute>} />
          <Route path="/register" element={<PublicRoute><RegisterPage /></PublicRoute>} />
          <Route path="/lobby" element={<PrivateRoute><LobbyPage /></PrivateRoute>} />
          <Route path="/sala/:code" element={<PrivateRoute><GameRoomPage /></PrivateRoute>} />
          <Route path="/hilo/:roomId" element={<PrivateRoute><HiloPage /></PrivateRoute>} />
          <Route path="/arena" element={<PrivateRoute><ArenaPage /></PrivateRoute>} />
        </Routes>
      </BrowserRouter>
      <Toaster
        position="top-center"
        toastOptions={{
          style: { background: '#12121A', color: '#F0F0F5', border: '1px solid #2A2A3A' },
          success: { iconTheme: { primary: '#FF2D55', secondary: '#F0F0F5' } },
        }}
      />
    </QueryClientProvider>
  )
}
