/**
 * Espelho TS do protocolo de mensagens do engine (services/engine/.../protocol.py).
 * Em fases futuras isso migra para packages/protocol como fonte única.
 */

// Cliente -> Servidor
export type ExecuteRequest = { type: 'execute_request'; code: string }
export type InterruptRequest = { type: 'interrupt' }
export type RestartRequest = { type: 'restart' }
export type ClientMessage = ExecuteRequest | InterruptRequest | RestartRequest

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

export type ServerMessage =
  | StatusMsg
  | StreamMsg
  | ExecuteResultMsg
  | DisplayDataMsg
  | ErrorMsg
  | ExecuteReplyMsg
  | KernelErrorMsg
  | RestartedMsg

/** Mensagens de saída que pertencem a uma execução (vão pro corpo do bloco). */
export type OutputMessage = StreamMsg | ExecuteResultMsg | DisplayDataMsg | ErrorMsg
