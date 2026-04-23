import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface User {
  id: string
  username: string
  email: string
  avatarUrl?: string
  isPremium: boolean
  llamasBalance: number
  charismaPts: number
}

interface AuthState {
  user: User | null
  token: string | null
  isAuthenticated: boolean
  setAuth: (user: User, token: string) => void
  updateBalance: (newBalance: number) => void
  logout: () => void
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      token: null,
      isAuthenticated: false,

      setAuth: (user, token) => {
        localStorage.setItem('bf_token', token)
        set({ user, token, isAuthenticated: true })
      },

      updateBalance: (newBalance) =>
        set((state) => ({
          user: state.user ? { ...state.user, llamasBalance: newBalance } : null,
        })),

      logout: () => {
        localStorage.removeItem('bf_token')
        set({ user: null, token: null, isAuthenticated: false })
      },
    }),
    {
      name: 'bf-auth',
      partialize: (state) => ({ user: state.user, token: state.token }),
    }
  )
)
