import { useEffect, useState } from 'react'

export function useAppTheme() {
  const [theme, setTheme] = useState<'light' | 'dark'>(() => window.localStorage.getItem('game-lab-theme') === 'dark' ? 'dark' : 'light')
  useEffect(() => {
    document.documentElement.dataset.theme = theme
    window.localStorage.setItem('game-lab-theme', theme)
  }, [theme])
  return [theme, setTheme] as const
}
