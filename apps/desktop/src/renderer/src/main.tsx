import ReactDOM from 'react-dom/client'
import { App } from './App'
import './styles.css'

// Sem StrictMode: o double-mount/double-invoke do React 18 em dev conflita com
// o ciclo de vida de models/editor do Monaco (foco e edição). Reativar só se
// adotarmos um wrapper de editor resiliente a remount.
ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(<App />)
