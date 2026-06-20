/**
 * Espelho TS do protocolo de mensagens do engine (services/engine/.../protocol.py).
 * Em fases futuras isso migra para packages/protocol como fonte única.
 */

// Cliente -> Servidor
export type ExecuteRequest = { type: 'execute_request'; code: string }
export type InterruptRequest = { type: 'interrupt' }
export type RestartRequest = { type: 'restart' }
export type InspectRequest = { type: 'inspect' }
export type DfSort = { col: string; dir: 'asc' | 'desc' } | null
export type DfPageRequest = {
  type: 'df_page'
  reqId: number
  handle: string
  start: number
  end: number
  sort?: DfSort
  filters?: Record<string, string>
}
export type ClientMessage =
  | ExecuteRequest
  | InterruptRequest
  | RestartRequest
  | InspectRequest
  | DfPageRequest

// Servidor -> Cliente
export type KernelState = 'busy' | 'idle' | 'starting'
export type StatusMsg = { type: 'status'; state: KernelState }
export type StreamMsg = { type: 'stream'; name: 'stdout' | 'stderr'; text: string }
export type ExecuteResultMsg = {
  type: 'execute_result'
  execution_count: number | null
  data: Record<string, unknown>
}
export type DisplayDataMsg = { type: 'display_data'; data: Record<string, unknown> }
export type ErrorMsg = {
  type: 'error'
  ename: string
  evalue: string
  traceback: string[]
}
export type ExecuteReplyMsg = {
  type: 'execute_reply'
  status: 'ok' | 'error' | 'aborted'
  execution_count: number | null
}
export type KernelErrorMsg = { type: 'kernel_error'; message: string }
export type RestartedMsg = { type: 'restarted' }

export interface VariableInfo {
  name: string
  type: string
  kind: 'DataFrame' | 'Series' | 'ndarray' | 'collection' | 'scalar' | 'str' | 'other'
  summary: string
}
export type VariablesMsg = { type: 'variables'; variables: VariableInfo[] }
export type DfRowsMsg = {
  type: 'df_rows'
  reqId: number
  rows: DfRow[]
  start: number
  total?: number
  error?: string | null
}
/** Resultado de uma página: linhas + total da view (filtrada). */
export interface DfPage {
  rows: DfRow[]
  total: number
}
export interface DfView {
  sort?: DfSort
  filters?: Record<string, string>
}

export type ServerMessage =
  | StatusMsg
  | StreamMsg
  | ExecuteResultMsg
  | DisplayDataMsg
  | ErrorMsg
  | ExecuteReplyMsg
  | KernelErrorMsg
  | RestartedMsg
  | VariablesMsg
  | DfRowsMsg

/** Mensagens de saída que pertencem a uma execução (vão pro corpo do bloco). */
export type OutputMessage = StreamMsg | ExecuteResultMsg | DisplayDataMsg | ErrorMsg

// --- MIMEs customizados do PyKortex (espelham pykortex/mime.py) ---
export const DATAFRAME_MIME = 'application/vnd.pykortex.dataframe+json'

export interface DfRow {
  index: unknown
  values: unknown[]
}
export interface DataFramePayload {
  kind: 'dataframe'
  handle: string // id para paginação sob demanda
  shape: [number, number] // [linhas, colunas]
  columns: { name: string; dtype: string }[]
  index_name: string | null
  rows: DfRow[]
  truncated: boolean
  shown: number
}
