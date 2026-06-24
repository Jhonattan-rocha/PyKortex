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
export interface GitCommit {
  hash: string
  short: string
  author: string
  date: string
  subject: string
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
export const gitShow = (path: string, rev = 'HEAD'): Promise<{ content: string }> =>
  getJson(`/git/show?path=${encodeURIComponent(path)}&rev=${encodeURIComponent(rev)}`)
export const gitInit = (): Promise<GitResult> => postJson('/git/init', {})
export const gitStage = (paths: string[]): Promise<GitResult> => postJson('/git/stage', { paths })
export const gitUnstage = (paths: string[]): Promise<GitResult> =>
  postJson('/git/unstage', { paths })
export const gitDiscard = (paths: string[]): Promise<GitResult> =>
  postJson('/git/discard', { paths })
export const gitCommit = (message: string): Promise<GitResult> =>
  postJson('/git/commit', { message })
export const gitLog = (limit = 50): Promise<{ commits: GitCommit[] }> =>
  getJson(`/git/log?limit=${limit}`)
export const gitReset = (rev: string, mode: 'soft' | 'mixed' | 'hard'): Promise<GitResult> =>
  postJson('/git/reset', { rev, mode })

export interface GitCommitFile {
  status: string
  path: string
}
export interface GitRemote {
  name: string
  url: string
}
export const gitCommitFiles = (hash: string): Promise<{ files: GitCommitFile[] }> =>
  getJson(`/git/commit-files?hash=${encodeURIComponent(hash)}`)
export const gitRemotes = (): Promise<{ remotes: GitRemote[] }> => getJson('/git/remotes')
export const gitAddRemote = (url: string, name = 'origin'): Promise<GitResult> =>
  postJson('/git/remote', { url, name })
export const gitPush = (setUpstream = false, branch = ''): Promise<GitResult> =>
  postJson(`/git/push?set_upstream=${setUpstream}&branch=${encodeURIComponent(branch)}`, {})
export const gitPull = (): Promise<GitResult> => postJson('/git/pull', {})
export const gitFetch = (): Promise<GitResult> => postJson('/git/fetch', {})
