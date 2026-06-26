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
export interface CompleteResult {
  matches: string[]
  cursor_start: number
  cursor_end: number
  types: string[]
}
export interface Diagnostic {
  line: number
  col: number
  message: string
  severity: 'error' | 'warning'
}
export interface HoverResult {
  name?: string
  kind?: string
  docstring?: string
}
export interface SignatureInfo {
  label: string
  params: string[]
  active: number
}
export interface GotoDef {
  path: string | null // null = mesmo arquivo
  line: number
  col: number
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
export interface KernelStats {
  alive: boolean
  memory_mb?: number
  cpu_percent?: number
  threads?: number
}
export type KernelStatsMsg = { type: 'kernel_stats'; stats: KernelStats }
export type DfRowsMsg = {
  type: 'df_rows'
  reqId: number
  rows: DfRow[]
  start: number
  total?: number
  error?: string | null
}
export type ApiResponseMsg = { type: 'api_response'; reqId: number; response: ApiResponse }
export type CompleteReplyMsg = {
  type: 'complete_reply'
  reqId: number
  matches: string[]
  cursor_start: number
  cursor_end: number
  types: string[]
}
export interface PkCommand {
  name: string
}
export type CommandsReplyMsg = { type: 'commands_reply'; reqId: number; commands: PkCommand[] }
export interface PkCommandInput {
  name: string
  label?: string
  type?: 'text' | 'pick'
  options?: string[]
  default?: string
}
export type CommandInputsReplyMsg = {
  type: 'command_inputs_reply'
  reqId: number
  inputs: PkCommandInput[]
}
export interface PkPanel {
  name: string
}
export type PanelsReplyMsg = { type: 'panels_reply'; reqId: number; panels: PkPanel[] }
export type PanelReplyMsg = { type: 'panel_reply'; reqId: number; html: string }
export type LintReplyMsg = { type: 'lint_reply'; reqId: number; diagnostics: Diagnostic[] }
export type HoverReplyMsg = {
  type: 'hover_reply'
  reqId: number
  name?: string
  kind?: string
  docstring?: string
}
export type SignatureReplyMsg = {
  type: 'signature_reply'
  reqId: number
  signatures: SignatureInfo[]
}
export type GotoReplyMsg = { type: 'goto_reply'; reqId: number; definitions: GotoDef[] }
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
  | KernelStatsMsg
  | DfRowsMsg
  | ApiResponseMsg
  | CompleteReplyMsg
  | CommandsReplyMsg
  | CommandInputsReplyMsg
  | PanelsReplyMsg
  | PanelReplyMsg
  | LintReplyMsg
  | HoverReplyMsg
  | SignatureReplyMsg
  | GotoReplyMsg

/** Mensagens de saída que pertencem a uma execução (vão pro corpo do bloco). */
export type OutputMessage = StreamMsg | ExecuteResultMsg | DisplayDataMsg | ErrorMsg

// --- MIMEs customizados do PyKortex (espelham pykortex/mime.py) ---
export const DATAFRAME_MIME = 'application/vnd.pykortex.dataframe+json'
export const FASTAPI_MIME = 'application/vnd.pykortex.fastapi+json'
export const SQLALCHEMY_MIME = 'application/vnd.pykortex.sqlalchemy+json'

export interface SaColumn {
  name: string
  type: string
  pk: boolean
  nullable: boolean
  unique: boolean
  fk: string | null
}
export interface SaTable {
  name: string
  columns: SaColumn[]
}
export interface SaRelationship {
  from_table: string
  from_col: string
  to_table: string
  to_col: string
}
export interface SqlAlchemyPayload {
  kind: 'sqlalchemy'
  count: number
  tables: SaTable[]
  relationships: SaRelationship[]
}

export interface FastApiRoute {
  method: string
  path: string
  name: string
  tags: string[]
  summary: string
  deprecated: boolean
  params: { name: string; in: string; required: boolean; type: string }[]
  requestBody: string | null
  responses: Record<string, { description: string; schema: string | null }>
}
export interface FastApiPayload {
  kind: 'fastapi'
  handle: string
  title: string
  version: string
  count: number
  routes: FastApiRoute[]
}
export interface ApiResponse {
  status?: number
  elapsed_ms?: number
  headers?: Record<string, string>
  body?: string
  is_json?: boolean
  error?: string
}
export interface ApiRequestOpts {
  handle: string
  method: string
  path: string
  query?: Record<string, string>
  headers?: Record<string, string>
  body?: unknown
  hasBody?: boolean
}

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
