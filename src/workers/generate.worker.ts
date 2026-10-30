/// <reference lib="webworker" />
/**
 * 数据生成 Web Worker
 * 大批量（默认 > 2000 行）生成移至后台线程：
 * - 主页面动画 / 滚动 / 取消按钮始终可响应，彻底避免主线程冻结
 * - 结果分块 postMessage，避免单次结构化克隆过大造成长任务
 * - 收到 cancel 后在分块边界优雅停止，回传已生成的部分数据
 */
import type { FieldNode } from '../types'
import { createGenContext, generateRow } from '../utils/generator'
import type { Row } from '../utils/export'

export interface GenStartMessage {
  type: 'start'
  tree: FieldNode
  count: number
  /** 单块行数：生成与回传的粒度，也是取消响应粒度 */
  chunkSize?: number
}

export interface GenCancelMessage {
  type: 'cancel'
}

export type GenInMessage = GenStartMessage | GenCancelMessage

export interface GenProgressMessage {
  type: 'progress'
  done: number
  total: number
}

export interface GenChunkMessage {
  type: 'chunk'
  rows: Row[]
}

export interface GenDoneMessage {
  type: 'done' | 'cancelled'
  total: number
}

export type GenOutMessage = GenProgressMessage | GenChunkMessage | GenDoneMessage

const ctx = self as unknown as DedicatedWorkerGlobalScope

let cancelled = false
let generating = false

ctx.onmessage = (e: MessageEvent<GenInMessage>) => {
  const msg = e.data
  if (msg.type === 'cancel') {
    cancelled = true
    return
  }
  if (msg.type === 'start') {
    if (generating) return
    generating = true
    cancelled = false
    run(msg)
      .catch((err: unknown) => {
        ctx.postMessage({ type: 'cancelled', total: 0 } satisfies GenDoneMessage)
        console.error('[generate-worker]', err)
      })
      .finally(() => {
        generating = false
      })
  }
}

async function run(msg: GenStartMessage) {
  const { tree, count } = msg
  const chunkSize = Math.min(Math.max(msg.chunkSize ?? 2000, 200), 20000)
  const genCtx = createGenContext()
  let done = 0

  while (done < count) {
    if (cancelled) break
    const end = Math.min(done + chunkSize, count)
    const chunk: Row[] = new Array(end - done)
    for (let i = done; i < end; i += 1) {
      chunk[i - done] = generateRow(tree, genCtx)
    }
    done = end
    ctx.postMessage({ type: 'chunk', rows: chunk } satisfies GenChunkMessage)
    ctx.postMessage({ type: 'progress', done, total: count } satisfies GenProgressMessage)
    // 让出事件循环，使取消消息能在下一块之前被处理
    await new Promise((r) => setTimeout(r, 0))
  }

  ctx.postMessage({
    type: cancelled ? 'cancelled' : 'done',
    total: done,
  } satisfies GenDoneMessage)
}
