/** Cliente REST do git do engine (/git). Opera no workspace atual. */
import { baseUrl } from './fsClient'

export interface GitFile {
  path: string
  x: string // status no índice (staged)
  y: string // status no worktree
  staged: boolean
  untracked: boolean
}
export interface GitStatus {
  repo: boolean
  files: GitFile[]
  branch: string
  ahead: number
  behind: number
  upstream?: string | null
}
export interface GitResult {
  ok: boolean
  message: string
}

async function getJson<T>(path: string): Promise<T> {
  const base = await baseUrl()
  const r = await fetch(`${base}${path}`)
  if (!r.ok) throw new Error(`HTTP ${r.status}`)
  return r.json() as Promise<T>
}

async function postJson<T>(path: string, body: unknown): Promise<T> {
  const base = await baseUrl()
  const r = await fetch(`${base}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body)
  })
  if (!r.ok) throw new Error(`HTTP ${r.status}`)
  return r.json() as Promise<T>
}

export const gitStatus = (): Promise<GitStatus> => getJson('/git/status')
export const gitInit = (): Promise<GitResult> => postJson('/git/init', {})
export const gitStage = (paths: string[]): Promise<GitResult> => postJson('/git/stage', { paths })
export const gitUnstage = (paths: string[]): Promise<GitResult> =>
  postJson('/git/unstage', { paths })
export const gitDiscard = (paths: string[]): Promise<GitResult> =>
  postJson('/git/discard', { paths })
export const gitCommit = (message: string): Promise<GitResult> =>
  postJson('/git/commit', { message })
