/**
 * Configura o Monaco para rodar 100% offline dentro do Electron (sem CDN).
 *
 *  - Aponta o @monaco-editor/react para o pacote npm `monaco-editor` (loader.config).
 *  - Registra o worker do editor via import `?worker` do Vite, que o empacota localmente.
 *
 * Importar este módulo UMA vez, antes de montar qualquer <Editor/>.
 */
import * as monaco from 'monaco-editor'
import { loader } from '@monaco-editor/react'
// Vite empacota o worker como arquivo separado servido pela própria origin.
import EditorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker'

// Só precisamos do worker base do editor; Python usa apenas tokenização (Monarch),
// que roda na main thread e não exige worker de linguagem dedicado.
self.MonacoEnvironment = {
  getWorker(): Worker {
    return new EditorWorker()
  }
}

loader.config({ monaco })

export { monaco }
