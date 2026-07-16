import { useEffect, useState } from 'react'

const THEME_KEY = 'innova-ui-theme'
const LANGUAGE_KEY = 'innova-ui-language'

function getStoredValue(key, fallback) {
  if (typeof window === 'undefined') return fallback
  return window.localStorage.getItem(key) || fallback
}

export function useUiLanguage() {
  const [language, setLanguage] = useState(() => getStoredValue(LANGUAGE_KEY, 'es'))

  useEffect(() => {
    const syncLanguage = () => setLanguage(getStoredValue(LANGUAGE_KEY, 'es'))
    window.addEventListener('innova-language-change', syncLanguage)
    return () => window.removeEventListener('innova-language-change', syncLanguage)
  }, [])

  return language
}

function SystemControls() {
  const [theme, setTheme] = useState(() => getStoredValue(THEME_KEY, 'light'))
  const [language, setLanguage] = useState(() => getStoredValue(LANGUAGE_KEY, 'es'))

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    window.localStorage.setItem(THEME_KEY, theme)
  }, [theme])

  useEffect(() => {
    document.documentElement.lang = language
    document.documentElement.dataset.language = language
    window.localStorage.setItem(LANGUAGE_KEY, language)
    window.dispatchEvent(new CustomEvent('innova-language-change', { detail: language }))
  }, [language])

  const toggleTheme = () => setTheme(current => current === 'dark' ? 'light' : 'dark')
  const toggleLanguage = () => setLanguage(current => current === 'es' ? 'en' : 'es')

  return (
    <div className="system-controls" aria-label="Preferencias de interfaz">
      <button className="btn btn-secondary small-btn" type="button" onClick={toggleLanguage}>
        {language === 'es' ? 'EN' : 'ES'}
      </button>
      <button className="btn btn-secondary small-btn" type="button" onClick={toggleTheme}>
        {theme === 'dark' ? 'Modo blanco' : 'Modo oscuro'}
      </button>
    </div>
  )
}

export default SystemControls
