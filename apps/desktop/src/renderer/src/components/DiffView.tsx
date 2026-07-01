import { DiffEditor } from '@monaco-editor/react'
import '../editor/monacoSetup' // garante o monaco configurado (offline)

export interface DiffData {
  title: string
  original: string
  modified: string
  language: string
}

/** Visualização de diff (git) lado a lado, read-only, no Monaco DiffEditor. */
export function DiffView({
  data,
  onClose,
  monacoTheme = 'vs-dark'
}: {
  data: DiffData
  onClose: () => void
  monacoTheme?: string
}): JSX.Element {
  return (
    <div className="diffview">
      <div className="diffview__head">
        <span className="diffview__title">{data.title}</span>
        <span className="diffview__tag">diff vs HEAD</span>
        <button className="diffview__close" onClick={onClose}>
          ✕ fechar
        </button>
      </div>
      <div className="diffview__body">
        <DiffEditor
          original={data.original}
          modified={data.modified}
          language={data.language}
          theme={monacoTheme}
          options={{
            readOnly: true,
            renderSideBySide: true,
            automaticLayout: true,
            minimap: { enabled: false },
            scrollBeyondLastLine: false,
            fontSize: 13
          }}
        />
      </div>
    </div>
  )
}

export function languageFromPath(path: string): string {
  const ext = path.slice(path.lastIndexOf('.') + 1).toLowerCase()
  const map: Record<string, string> = {
    py: 'python',
    ts: 'typescript',
    tsx: 'typescript',
    js: 'javascript',
    jsx: 'javascript',
    json: 'json',
    md: 'markdown',
    css: 'css',
    html: 'html',
    yml: 'yaml',
    yaml: 'yaml',
    toml: 'ini',
    sh: 'shell'
  }
  return map[ext] ?? 'plaintext'
}
