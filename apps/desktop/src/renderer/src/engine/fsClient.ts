/**
 * Cliente REST do filesystem do engine (/fs). Descobre a base URL via preload
 * (window.pykortex.getEngineInfo) e a memoriza.
 */

export interface FsEntry {
  name: string
  path: string
  type: 'dir' | 'file'
}

let basePromise: Promise<string> | null = null

export async function baseUrl(): Promise<string> {
  if (!basePromise) {
    basePromise = window.pykortex.getEngineInfo().then((info) => {
      if (!info.ok) throw new Error(info.error)
      return `http://${info.host}:${info.port}`
    })
  }
  return basePromise
}

async function unwrap(res: Response): Promise<unknown> {
  if (!res.ok) {
    let detail = `HTTP ${res.status}`
    try {
      const body = (await res.json()) as { detail?: string }
      if (body.detail) detail = body.detail
    } catch {
      /* corpo não-JSON */
    }
    throw new Error(detail)
  }
  return res.json()
}

export async function setWorkspace(root: string): Promise<string> {
  const base = await baseUrl()
  const body = (await unwrap(
    await fetch(`${base}/fs/workspace`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ root })
    })
  )) as { root: string }
  return body.root
}

export async function listDir(path = ''): Promise<FsEntry[]> {
  const base = await baseUrl()
  const body = (await unwrap(
    await fetch(`${base}/fs/list?path=${encodeURIComponent(path)}`)
  )) as { entries: FsEntry[] }
  return body.entries
}

export async function readFile(path: string): Promise<string> {
  const base = await baseUrl()
  const body = (await unwrap(
    await fetch(`${base}/fs/read?path=${encodeURIComponent(path)}`)
  )) as { content: string }
  return body.content
}

export async function writeFile(path: string, content: string): Promise<void> {
  const base = await baseUrl()
  await unwrap(
    await fetch(`${base}/fs/write`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ path, content })
    })
  )
}

async function post(path: string, body: unknown): Promise<void> {
  const base = await baseUrl()
  await unwrap(
    await fetch(`${base}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body)
    })
  )
}

export async function createEntry(path: string, type: 'file' | 'dir'): Promise<void> {
  await post('/fs/create', { path, type })
}

export async function renameEntry(path: string, to: string): Promise<void> {
  await post('/fs/rename', { path, to })
}

export async function deleteEntry(path: string): Promise<void> {
  await post('/fs/delete', { path })
}
