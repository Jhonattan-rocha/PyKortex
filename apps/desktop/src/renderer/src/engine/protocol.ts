/**
 * Espelho TS do protocolo de mensagens do engine (services/engine/.../protocol.py).
 * Em fases futuras isso migra para packages/protocol como fonte única.
 */

// Cliente -> Servidor
export type ExecuteRequest = { type: 'execute_request'; code: string }
export type InterruptRequest = { type: 'interrupt' }
export type ClientMessage = ExecuteRequest | InterruptRequest

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

export type ServerMessage =
  | StatusMsg
  | StreamMsg
  | ExecuteResultMsg
  | DisplayDataMsg
  | ErrorMsg
  | ExecuteReplyMsg
  | KernelErrorMsg
