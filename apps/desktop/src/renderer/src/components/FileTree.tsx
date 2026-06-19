import { useCallback, useEffect, useRef, useState } from 'react'
import {
  createEntry,
  deleteEntry,
  listDir,
  renameEntry,
  type FsEntry
} from '../engine/fsClient'

interface TreeProps {
  /** caminho absoluto do workspace; muda => recarrega a raiz */
  root: string | null
  activePath: string | null
  onOpen: (path: string) => void
  /** notifica quando um caminho é renomeado (newPath) ou apagado (null) */
  onPathChanged: (oldPath: string, newPath: string | null) => void
}

type CreateState = { parent: string; type: 'file' | 'dir' } | null
type MenuState = { path: string; type: 'file' | 'dir'; x: number; y: number } | null

const dirname = (p: string): string => {
  const i = p.lastIndexOf('/')
  return i === -1 ? '' : p.slice(0, i)
}
const join = (parent: string, name: string): string => (parent ? `${parent}/${name}` : name)

/** Árvore de arquivos com expansão lazy, refresh preservando expansão e CRUD. */
export function FileTree({ root, activePath, onOpen, onPathChanged }: TreeProps): JSX.Element {
  const [children, setChildren] = useState<Record<string, FsEntry[]>>({})
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [error, setError] = useState<string | null>(null)
  const [creating, setCreating] = useState<CreateState>(null)
  const [renaming, setRenaming] = useState<string | null>(null)
  const [menu, setMenu] = useState<MenuState>(null)

  const expandedRef = useRef(expanded)
  expandedRef.current = expanded

  const load = useCallback(async (path: string): Promise<void> => {
    try {
      const entries = await listDir(path)
      setChildren((prev) => ({ ...prev, [path]: entries }))
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }, [])

  // recarrega raiz + todos os diretórios expandidos (preserva a expansão)
  const refresh = useCallback(async (): Promise<void> => {
    await load('')
    await Promise.all([...expandedRef.current].map((p) => load(p)))
  }, [load])

  // (re)carrega quando o workspace muda
  useEffect(() => {
    setChildren({})
    setExpanded(new Set())
    setCreating(null)
    setRenaming(null)
    if (root) void load('')
  }, [root, load])

  // fecha o menu de contexto ao clicar em qualquer lugar
  useEffect(() => {
    if (!menu) return
    const close = (): void => setMenu(null)
    window.addEventListener('click', close)
    window.addEventListener('contextmenu', close)
    return () => {
      window.removeEventListener('click', close)
      window.removeEventListener('contextmenu', close)
    }
  }, [menu])

  const toggle = useCallback(
    (path: string): void => {
      setExpanded((prev) => {
        const next = new Set(prev)
        if (next.has(path)) {
          next.delete(path)
        } else {
          next.add(path)
          if (!children[path]) void load(path)
        }
        return next
      })
    },
    [children, load]
  )

  const ensureExpanded = useCallback(
    (path: string): void => {
      if (path === '') return
      setExpanded((prev) => {
        if (prev.has(path)) return prev
        const next = new Set(prev)
        next.add(path)
        if (!children[path]) void load(path)
        return next
      })
    },
    [children, load]
  )

  const startCreate = useCallback(
    (parent: string, type: 'file' | 'dir'): void => {
      ensureExpanded(parent)
      setCreating({ parent, type })
      setMenu(null)
    },
    [ensureExpanded]
  )

  const commitCreate = useCallback(
    async (name: string): Promise<void> => {
      if (!creating) return
      const trimmed = name.trim()
      const { parent, type } = creating
      setCreating(null)
      if (!trimmed) return
      const path = join(parent, trimmed)
      try {
        await createEntry(path, type)
        await load(parent)
        if (type === 'file') onOpen(path)
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e))
      }
    },
    [creating, load, onOpen]
  )

  const commitRename = useCallback(
    async (path: string, newName: string): Promise<void> => {
      const trimmed = newName.trim()
      setRenaming(null)
      if (!trimmed || trimmed === path.slice(path.lastIndexOf('/') + 1)) return
      const to = join(dirname(path), trimmed)
      try {
        await renameEntry(path, to)
        await load(dirname(path))
        onPathChanged(path, to)
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e))
      }
    },
    [load, onPathChanged]
  )

  const doDelete = useCallback(
    async (path: string): Promise<void> => {
      setMenu(null)
      if (!window.confirm(`Apagar "${path}"? Esta ação não pode ser desfeita.`)) return
      try {
        await deleteEntry(path)
        await load(dirname(path))
        onPathChanged(path, null)
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e))
      }
    },
    [load, onPathChanged]
  )

  if (!root) {
    return <div className="tree tree--empty">Nenhuma pasta aberta.</div>
  }

  const ctrl: NodeCtrl = {
    children,
    expanded,
    activePath,
    creating,
    renaming,
    toggle,
    onOpen,
    openMenu: (path, type, x, y) => setMenu({ path, type, x, y }),
    startRename: (path) => {
      setRenaming(path)
      setMenu(null)
    },
    commitRename,
    commitCreate,
    cancelCreate: () => setCreating(null),
    cancelRename: () => setRenaming(null)
  }

  return (
    <div className="tree-wrap">
      <div className="tree-toolbar">
        <button title="Novo arquivo na raiz" onClick={() => startCreate('', 'file')}>
          ＋📄
        </button>
        <button title="Nova pasta na raiz" onClick={() => startCreate('', 'dir')}>
          ＋📁
        </button>
        <button title="Atualizar" onClick={() => void refresh()}>
          ⟳
        </button>
      </div>

      {error && <div className="tree--error">{error}</div>}

      <div className="tree">
        {creating?.parent === '' && (
          <CreateInput
            depth={0}
            type={creating.type}
            onCommit={commitCreate}
            onCancel={() => setCreating(null)}
          />
        )}
        {(children[''] ?? []).map((e) => (
          <FileNode key={e.path} entry={e} depth={0} ctrl={ctrl} />
        ))}
      </div>

      {menu && (
        <ContextMenu
          menu={menu}
          onNewFile={() => startCreate(menu.path, 'file')}
          onNewFolder={() => startCreate(menu.path, 'dir')}
          onRename={() => ctrl.startRename(menu.path)}
          onDelete={() => void doDelete(menu.path)}
        />
      )}
    </div>
  )
}

interface NodeCtrl {
  children: Record<string, FsEntry[]>
  expanded: Set<string>
  activePath: string | null
  creating: CreateState
  renaming: string | null
  toggle: (path: string) => void
  onOpen: (path: string) => void
  openMenu: (path: string, type: 'file' | 'dir', x: number, y: number) => void
  startRename: (path: string) => void
  commitRename: (path: string, name: string) => void
  commitCreate: (name: string) => void
  cancelCreate: () => void
  cancelRename: () => void
}

function FileNode({
  entry,
  depth,
  ctrl
}: {
  entry: FsEntry
  depth: number
  ctrl: NodeCtrl
}): JSX.Element {
  const isDir = entry.type === 'dir'
  const open = ctrl.expanded.has(entry.path)
  const isActive = entry.path === ctrl.activePath
  const pad = 8 + depth * 14

  if (ctrl.renaming === entry.path) {
    return (
      <CreateInput
        depth={depth}
        type={entry.type}
        initial={entry.name}
        onCommit={(name) => ctrl.commitRename(entry.path, name)}
        onCancel={ctrl.cancelRename}
      />
    )
  }

  return (
    <>
      <div
        className={`tree-row${isActive ? ' tree-row--active' : ''}`}
        style={{ paddingLeft: pad }}
        onClick={() => (isDir ? ctrl.toggle(entry.path) : ctrl.onOpen(entry.path))}
        onContextMenu={(e) => {
          e.preventDefault()
          ctrl.openMenu(entry.path, entry.type, e.clientX, e.clientY)
        }}
        title={entry.path}
      >
        <span className="tree-icon">{isDir ? (open ? '▾' : '▸') : '·'}</span>
        <span className="tree-name">{entry.name}</span>
      </div>
      {isDir && open && (
        <>
          {ctrl.creating?.parent === entry.path && (
            <CreateInput
              depth={depth + 1}
              type={ctrl.creating.type}
              onCommit={ctrl.commitCreate}
              onCancel={ctrl.cancelCreate}
            />
          )}
          {(ctrl.children[entry.path] ?? []).map((c) => (
            <FileNode key={c.path} entry={c} depth={depth + 1} ctrl={ctrl} />
          ))}
        </>
      )}
    </>
  )
}

function CreateInput({
  depth,
  type,
  initial = '',
  onCommit,
  onCancel
}: {
  depth: number
  type: 'file' | 'dir'
  initial?: string
  onCommit: (name: string) => void
  onCancel: () => void
}): JSX.Element {
  const ref = useRef<HTMLInputElement | null>(null)
  useEffect(() => {
    ref.current?.focus()
    ref.current?.select()
  }, [])
  return (
    <div className="tree-row tree-row--input" style={{ paddingLeft: 8 + depth * 14 }}>
      <span className="tree-icon">{type === 'dir' ? '▸' : '·'}</span>
      <input
        ref={ref}
        className="tree-input"
        defaultValue={initial}
        placeholder={type === 'dir' ? 'nome da pasta' : 'nome do arquivo'}
        onKeyDown={(e) => {
          if (e.key === 'Enter') onCommit((e.target as HTMLInputElement).value)
          else if (e.key === 'Escape') onCancel()
        }}
        onBlur={(e) => onCommit(e.target.value)}
      />
    </div>
  )
}

function ContextMenu({
  menu,
  onNewFile,
  onNewFolder,
  onRename,
  onDelete
}: {
  menu: NonNullable<MenuState>
  onNewFile: () => void
  onNewFolder: () => void
  onRename: () => void
  onDelete: () => void
}): JSX.Element {
  return (
    <div className="ctx-menu" style={{ left: menu.x, top: menu.y }}>
      {menu.type === 'dir' && (
        <>
          <button onClick={onNewFile}>Novo arquivo</button>
          <button onClick={onNewFolder}>Nova pasta</button>
          <div className="ctx-sep" />
        </>
      )}
      <button onClick={onRename}>Renomear</button>
      <button className="ctx-danger" onClick={onDelete}>
        Apagar
      </button>
    </div>
  )
}
