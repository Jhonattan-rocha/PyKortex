import { useRef } from 'react'
import MonacoEditor, { type OnMount } from '@monaco-editor/react'
import { monaco } from './monacoSetup'
import { cellAtLine, parseCells } from './cells'

type Editor = monaco.editor.IStandaloneCodeEditor

export interface EditorProps {
  value: string
  onChange: (value: string) => void
  /** executa um trecho de código (célula ou arquivo inteiro) */
  onRun: (code: string) => void
}

/**
 * Editor Monaco com suporte a células `# %%`:
 *   Ctrl/Cmd+Enter        -> roda a célula do cursor
 *   Shift+Enter           -> roda a célula do cursor e avança para a próxima
 *   Ctrl/Cmd+Shift+Enter  -> roda o arquivo inteiro
 *
 * Os comandos leem o modelo e o callback via refs, então nunca capturam
 * estado/props velhos (o onMount roda só uma vez).
 */
export function CodeEditor({ value, onChange, onRun }: EditorProps): JSX.Element {
  const editorRef = useRef<Editor | null>(null)
  const onRunRef = useRef(onRun)
  onRunRef.current = onRun

  const runCurrentCell = (advance: boolean): void => {
    const editor = editorRef.current
    if (!editor) return
    const model = editor.getModel()
    if (!model) return
    const line = editor.getPosition()?.lineNumber ?? 1
    const cells = parseCells(model.getValue())
    const cell = cellAtLine(cells, line)
    if (!cell) return

    if (cell.code.trim().length > 0) onRunRef.current(cell.code)

    if (advance) {
      const next = cells[cell.index + 1]
      if (next) {
        // primeira linha de código da próxima célula (pula o marcador)
        const target = Math.min(next.startLine + 1, model.getLineCount())
        editor.setPosition({ lineNumber: target, column: 1 })
        editor.revealLineInCenterIfOutsideViewport(target)
      }
    }
  }

  const runAll = (): void => {
    const model = editorRef.current?.getModel()
    const src = model?.getValue() ?? ''
    if (src.trim().length > 0) onRunRef.current(src)
  }

  const handleMount: OnMount = (editor) => {
    editorRef.current = editor

    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () =>
      runCurrentCell(false)
    )
    editor.addCommand(monaco.KeyMod.Shift | monaco.KeyCode.Enter, () =>
      runCurrentCell(true)
    )
    editor.addCommand(
      monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.Enter,
      () => runAll()
    )
  }

  return (
    <MonacoEditor
      height="100%"
      language="python"
      theme="vs-dark"
      value={value}
      onChange={(v) => onChange(v ?? '')}
      onMount={handleMount}
      options={{
        fontFamily: "'Cascadia Code', 'Consolas', monospace",
        fontSize: 13,
        minimap: { enabled: false },
        scrollBeyondLastLine: false,
        automaticLayout: true,
        renderWhitespace: 'selection',
        tabSize: 4,
        rulers: [88]
      }}
    />
  )
}
