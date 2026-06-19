import { useEffect, useState } from 'react'
import { listDir, type FsEntry } from '../engine/fsClient'

interface TreeProps {
  /** caminho absoluto do workspace; muda => recarrega a raiz */
  root: string | null
  activePath: string | null
  onOpen: (path: string) => void
}

/** Árvore de arquivos com expansão lazy (lista o diretório só ao abrir). */
export function FileTree({ root, activePath, onOpen }: TreeProps): JSX.Element {
  const [entries, setEntries] = useState<FsEntry[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setError(null)
    if (!root) {
      setEntries([])
      return
    }
    listDir('')
      .then(setEntries)
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
  }, [root])

  if (!root) {
    return <div className="tree tree--empty">Nenhuma pasta aberta.</div>
  }
  if (error) {
    return <div className="tree tree--error">{error}</div>
  }

  return (
    <div className="tree">
      {entries.map((e) => (
        <FileNode key={e.path} entry={e} depth={0} activePath={activePath} onOpen={onOpen} />
      ))}
    </div>
  )
}

interface NodeProps {
  entry: FsEntry
  depth: number
  activePath: string | null
  onOpen: (path: string) => void
}

function FileNode({ entry, depth, activePath, onOpen }: NodeProps): JSX.Element {
  const [open, setOpen] = useState(false)
  const [children, setChildren] = useState<FsEntry[] | null>(null)
  const [loading, setLoading] = useState(false)

  const isDir = entry.type === 'dir'
  const isActive = entry.path === activePath

  const handleClick = async (): Promise<void> => {
    if (!isDir) {
      onOpen(entry.path)
      return
    }
    const next = !open
    setOpen(next)
    if (next && children === null) {
      setLoading(true)
      try {
        setChildren(await listDir(entry.path))
      } finally {
        setLoading(false)
      }
    }
  }

  return (
    <>
      <div
        className={`tree-row${isActive ? ' tree-row--active' : ''}`}
        style={{ paddingLeft: 8 + depth * 14 }}
        onClick={handleClick}
        title={entry.path}
      >
        <span className="tree-icon">{isDir ? (open ? '▾' : '▸') : '·'}</span>
        <span className="tree-name">{entry.name}</span>
      </div>
      {isDir && open && (
        <>
          {loading && (
            <div className="tree-row tree-row--muted" style={{ paddingLeft: 8 + (depth + 1) * 14 }}>
              carregando…
            </div>
          )}
          {children?.map((c) => (
            <FileNode
              key={c.path}
              entry={c}
              depth={depth + 1}
              activePath={activePath}
              onOpen={onOpen}
            />
          ))}
        </>
      )}
    </>
  )
}
