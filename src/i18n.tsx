import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'

export type AppLanguage = 'en' | 'fr'

const messages = {
  en: {
    appSubtitle: 'Private game operations & agent studio',
    recoveryAvailable: 'Recovery available', saved: 'Saved', unsaved: 'Unsaved', emptyCanvas: 'empty canvas',
    runAgent: 'Play', agentWorking: 'Agent working…', runHint: 'Start the governed game workflow', pauseAgent: 'Pause', stopAgent: 'Stop', addSourceHint: 'Add an authorized Game Server or Evidence Source before running', openSettings: 'Open settings',
    promptPlaceholder: 'Ask the agent to diagnose a server or evaluate a private-game mission…', promptDisconnected: 'Connect ChatGPT or an API provider in Settings to activate the agent…',
    connectSource: 'Connect an AI source before sending. Your prompt is preserved.', agentLabel: 'GAME LAB agent', noAction: 'No simulated action · connection required', connect: 'Connect', send: 'Send request to GAME LAB agent', details: 'Show agentic details',
    humanReview: 'Human review', notified: 'notified', reviewWhen: 'when Agent Decision requests it',
  },
  fr: {
    appSubtitle: 'Studio d’exploitation de jeux et d’agents privés',
    recoveryAvailable: 'Récupération disponible', saved: 'Enregistré', unsaved: 'Non enregistré', emptyCanvas: 'canvas vide',
    runAgent: 'Play', agentWorking: 'Agent en cours…', runHint: 'Démarrer le workflow de jeu gouverné', pauseAgent: 'Pause', stopAgent: 'Stop', addSourceHint: 'Ajoutez un serveur autorisé ou une source de preuves avant de lancer', openSettings: 'Ouvrir les réglages',
    promptPlaceholder: 'Demandez à l’agent d’analyser, optimiser ou revoir ce portefeuille logiciel…', promptDisconnected: 'Connectez ChatGPT ou un fournisseur API dans les réglages pour activer l’agent…',
    connectSource: 'Connectez une source IA avant l’envoi. Votre prompt est conservé.', agentLabel: 'Agent GAME LAB', noAction: 'Aucune action simulée · connexion requise', connect: 'Connecter', send: 'Envoyer la demande à l’agent GAME LAB', details: 'Afficher les détails agentiques',
    humanReview: 'Revue humaine', notified: 'notifiée', reviewWhen: 'quand Agent Decision la demande',
  },
} as const

export type MessageKey = keyof typeof messages.en

interface LanguageContextValue {
  language: AppLanguage
  setLanguage(language: AppLanguage): void
  t(key: MessageKey): string
}

const LanguageContext = createContext<LanguageContextValue>({ language: 'en', setLanguage: () => undefined, t: (key) => messages.en[key] })

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<AppLanguage>(() => window.localStorage.getItem('game-lab-language') === 'fr' ? 'fr' : 'en')
  const setLanguage = (nextLanguage: AppLanguage) => {
    window.localStorage.setItem('game-lab-language', nextLanguage)
    setLanguageState(nextLanguage)
  }
  useEffect(() => { document.documentElement.lang = language }, [language])
  const value = useMemo<LanguageContextValue>(() => ({ language, setLanguage, t: (key) => messages[language][key] }), [language])
  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>
}

export function useLanguage() { return useContext(LanguageContext) }
