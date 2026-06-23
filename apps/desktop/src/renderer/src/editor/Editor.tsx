import { useEffect, useRef } from 'react'
import MonacoEditor, { type OnMount } from '@monaco-editor/react'
import { monaco } from './monacoSetup'
import { cellAtLine, parseCells } from './cells'
import type {
  CompleteResult,
  Diagnostic,
  GotoDef,
  HoverResult,
  SignatureInfo
} from '../engine/protocol'

type Editor = monaco.editor.IStandaloneCodeEditor

export interface EditorProps {
  value: string
  onChange: (value: string) => void
  /** executa um trecho de código (célula ou arquivo inteiro) */
  onRun: (code: string) => void
  /** salva o conteúdo atual (Ctrl/Cmd+S) */
  onSave: (code: string) => void
  /** completar via kernel (jedi + namespace vivo) */
  onComplete: (code: string, cursorPos: number) => Promise<CompleteResult>
  /** diagnósticos (pyflakes) do conteúdo */
  onLint: (code: string) => Promise<Diagnostic[]>
  /** doc/assinatura do símbolo (jedi) */
  onHover: (code: string, line: number, col: number) => Promise<HoverResult>
  /** assinaturas da chamada (jedi) */
  onSignature: (code: string, line: number, col: number) => Promise<SignatureInfo[]>
  /** definição do símbolo (jedi) */
  onGoto: (code: string, line: number, col: number) => Promise<GotoDef[]>
  /** abrir definição em outro arquivo (path absoluto) */
  onOpenDefinition: (path: string, line: number, col: number) => void
  /** posição a revelar (go-to cross-file); nonce força re-trigger */
  reveal?: { line: number; col: number; nonce: number }
  /** id/caminho da aba ativa: cria um model dedicado por arquivo (preserva undo/cursor) */
  path?: string
}

const K = monaco.languages.CompletionItemKind
function completionKind(type: string): monaco.languages.CompletionItemKind {
  switch (type) {
    case 'function':
      return K.Function
    case 'class':
      return K.Class
    case 'module':
      return K.Module
    case 'instance':
      return K.Variable
    case 'keyword':
      return K.Keyword
    case 'magic':
      return K.Event
    default:
      return K.Field
  }
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
export function CodeEditor({
  value,
  onChange,
  onRun,
  onSave,
  onComplete,
  onLint,
  onHover,
  onSignature,
  onGoto,
  onOpenDefinition,
  reveal,
  path
}: EditorProps): JSX.Element {
  const editorRef = useRef<Editor | null>(null)
  const onRunRef = useRef(onRun)
  onRunRef.current = onRun
  const onSaveRef = useRef(onSave)
  onSaveRef.current = onSave
  const onCompleteRef = useRef(onComplete)
  onCompleteRef.current = onComplete
  const onLintRef = useRef(onLint)
  onLintRef.current = onLint
  const onHoverRef = useRef(onHover)
  onHoverRef.current = onHover
  const onSignatureRef = useRef(onSignature)
  onSignatureRef.current = onSignature
  const onGotoRef = useRef(onGoto)
  onGotoRef.current = onGoto
  const onOpenDefinitionRef = useRef(onOpenDefinition)
  onOpenDefinitionRef.current = onOpenDefinition

  // reveal de posição (go-to cross-file): posiciona o cursor após abrir o arquivo
  useEffect(() => {
    if (!reveal) return
    const editor = editorRef.current
    if (!editor) return
    editor.revealLineInCenter(reveal.line)
    editor.setPosition({ lineNumber: reveal.line, column: reveal.col + 1 })
    editor.focus()
  }, [reveal])

  // diagnósticos (squiggles): re-lint debounced a cada mudança de conteúdo
  useEffect(() => {
    const handle = setTimeout(() => {
      void (async () => {
        const model = editorRef.current?.getModel()
        if (!model) return
        const diags = await onLintRef.current(model.getValue())
        if (model.isDisposed()) return
        const markers = diags.map((d) => {
          const word = model.getWordAtPosition({ lineNumber: d.line, column: d.col + 1 })
          return {
            startLineNumber: d.line,
            startColumn: word ? word.startColumn : d.col + 1,
            endLineNumber: d.line,
            endColumn: word ? word.endColumn : d.col + 2,
            message: d.message,
            severity:
              d.severity === 'error'
                ? monaco.MarkerSeverity.Error
                : monaco.MarkerSeverity.Warning
          }
        })
        monaco.editor.setModelMarkers(model, 'pykortex', markers)
      })()
    }, 400)
    return () => clearTimeout(handle)
  }, [value])

  // provider de hover (jedi): doc/assinatura ao passar o mouse
  useEffect(() => {
    const provider = monaco.languages.registerHoverProvider('python', {
      async provideHover(model, position) {
        const res = await onHoverRef.current(model.getValue(), position.lineNumber, position.column - 1)
        if (!res.name && !res.docstring) return null
        const header = res.name ? `**${res.name}**${res.kind ? ` *(${res.kind})*` : ''}` : ''
        const doc = res.docstring ? '```text\n' + res.docstring.slice(0, 1500) + '\n```' : ''
        return { contents: [header, doc].filter(Boolean).map((value) => ({ value })) }
      }
    })
    return () => provider.dispose()
  }, [])

  // signature help (jedi): dicas de parâmetro ao digitar '(' / ','
  useEffect(() => {
    const provider = monaco.languages.registerSignatureHelpProvider('python', {
      signatureHelpTriggerCharacters: ['(', ','],
      signatureHelpRetriggerCharacters: [','],
      async provideSignatureHelp(model, position) {
        const sigs = await onSignatureRef.current(
          model.getValue(),
          position.lineNumber,
          position.column - 1
        )
        if (sigs.length === 0) return null
        return {
          value: {
            signatures: sigs.map((s) => ({
              label: s.label,
              parameters: s.params.map((p) => ({ label: p }))
            })),
            activeSignature: 0,
            activeParameter: sigs[0].active
          },
          dispose() {}
        }
      }
    })
    return () => provider.dispose()
  }, [])

  // go-to-definition (jedi): in-file via Monaco; cross-file abre o arquivo
  useEffect(() => {
    const provider = monaco.languages.registerDefinitionProvider('python', {
      async provideDefinition(model, position) {
        const defs = await onGotoRef.current(
          model.getValue(),
          position.lineNumber,
          position.column - 1
        )
        const inFile = defs.filter((d) => !d.path)
        if (inFile.length > 0) {
          return inFile.map((d) => ({
            uri: model.uri,
            range: {
              startLineNumber: d.line,
              startColumn: d.col + 1,
              endLineNumber: d.line,
              endColumn: d.col + 1
            }
          }))
        }
        const ext = defs.find((d) => d.path)
        if (ext) onOpenDefinitionRef.current(ext.path as string, ext.line, ext.col)
        return []
      }
    })
    return () => provider.dispose()
  }, [])

  // provider de autocomplete (kernel: jedi + namespace vivo), registrado 1x
  useEffect(() => {
    const provider = monaco.languages.registerCompletionItemProvider('python', {
      triggerCharacters: ['.'],
      async provideCompletionItems(model, position) {
        const res = await onCompleteRef.current(model.getValue(), model.getOffsetAt(position))
        if (res.matches.length === 0) return { suggestions: [] }
        const start = model.getPositionAt(res.cursor_start)
        const end = model.getPositionAt(res.cursor_end)
        const range = {
          startLineNumber: start.lineNumber,
          startColumn: start.column,
          endLineNumber: end.lineNumber,
          endColumn: end.column
        }
        return {
          suggestions: res.matches.map((label, i) => ({
            label,
            kind: completionKind(res.types[i] ?? ''),
            insertText: label,
            range
          }))
        }
      }
    })
    return () => provider.dispose()
  }, [])

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

  // "Rodar tudo" = roda CADA célula como execução separada (igual Run All do
  // Jupyter), pra cada célula exibir sua própria última expressão.
  const runAll = (): void => {
    const model = editorRef.current?.getModel()
    if (!model) return
    for (const cell of parseCells(model.getValue())) {
      if (cell.code.trim().length > 0) onRunRef.current(cell.code)
    }
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
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
      const src = editorRef.current?.getModel()?.getValue() ?? ''
      onSaveRef.current(src)
    })
  }

  return (
    <MonacoEditor
      height="100%"
      language="python"
      theme="vs-dark"
      path={path}
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
