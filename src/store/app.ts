import { reactive, computed } from 'vue'
import { load, type Store } from '@tauri-apps/plugin-store'
import { save as saveDialog, open as openDialog } from '@tauri-apps/plugin-dialog'
import { writeTextFile, readTextFile } from '@tauri-apps/plugin-fs'
import type { FieldNode, FieldType, Template, FieldConstraints } from '../types'
import { canHaveChildren, supportsUnique } from '../types'
import {
  createNode,
  createRoot,
  createGenContext,
  generateRow,
  findNode,
  findParent,
  findPath,
  isDescendant,
  expandAncestors,
  expandToHits,
  searchNodes,
  parseJsonPath,
  findByPath,
  defaultConstraints,
  validateTree,
} from '../utils/generator'
import GenerateWorker from '../workers/generate.worker?worker'
import { parseSchemaInput } from '../utils/schema'
import { toJson, toJsonObject, toCsv, toSql, collectColumns, flattenRow, type Row } from '../utils/export'

const PREVIEW_MIN = 20
const PREVIEW_MAX = 100

export type ToastType = 'success' | 'warning' | 'error'

interface Toast {
  id: number
  type: ToastType
  message: string
}

interface PromptState {
  show: boolean
  title: string
  message: string
  inputMode: boolean
  value: string
  okText: string
  resolve: ((value: string | null) => void) | null
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function newId(): string {
  return `t${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`
}

const state = reactive({
  mode: 'manual' as 'manual' | 'schema',
  structureName: '未命名结构',
  tree: createRoot() as FieldNode,
  schemaText: '',
  templates: [] as Template[],
  activeTemplateId: null as string | null,
  generating: false,
  progress: 0,
  generatedCount: 0,
  hasResult: false,
  previewLimit: 20,
  previewRows: [] as Row[],
  previewColumns: [] as string[],
  toasts: [] as Toast[],
  prompt: {
    show: false,
    title: '',
    message: '',
    inputMode: false,
    value: '',
    okText: '确定',
    resolve: null,
  } as PromptState,
  lockedByGeneration: false,
  // 选中节点（面包屑 / 高亮）与树内聚焦请求（搜索跳转、点击面包屑时滚动定位）
  selectedNodeId: null as string | null,
  focusNodeId: null as string | null,
  focusTick: 0,
  // 节点搜索：关键字模式实时命中；JSONPath 模式按路径跳转
  searchQuery: '',
  searchMode: 'keyword' as 'keyword' | 'path',
  activeMatchIndex: 0,
})

const past: FieldNode[] = []
const future: FieldNode[] = []
let editSnapshot: FieldNode | null = null
let cancelRequested = false
let results: Row[] = []
let toastSeq = 0

const errors = computed(() => validateTree(state.tree))
const undoable = computed(() => past.length > 0)
const redoable = computed(() => future.length > 0)
/** 输出形态由根节点类型决定：object 根 = 单对象，array 根 = 对象数组 */
const isObjectOutput = computed(() => state.tree.type === 'object')
const totalCount = computed(() => {
  const walk = (n: FieldNode): number => 1 + n.children.reduce((s, c) => s + walk(c), 0)
  return walk(state.tree)
})

/** 当前搜索命中（随树编辑实时更新，保持树序） */
const searchMatches = computed<FieldNode[]>(() => {
  const q = state.searchQuery.trim()
  if (!q) return []
  if (state.searchMode === 'path' || q.startsWith('$')) {
    const parsed = parseJsonPath(q)
    const node = parsed ? findByPath(state.tree, parsed) : null
    return node ? [node] : []
  }
  return searchNodes(state.tree, q)
})

/** 当前选中节点的完整路径；未选中时面包屑只展示 root */
const selectedPath = computed<FieldNode[]>(() => {
  if (state.selectedNodeId) {
    const path = findPath(state.tree, state.selectedNodeId)
    if (path) return path
  }
  return [state.tree]
})

/** 命中节点的祖先 id 集合：搜索弱化时保留这些容器的视觉权重，避免命中行被父级透明度压暗 */
const matchAncestorIds = computed<Set<string>>(() => {
  const set = new Set<string>()
  if (!state.searchQuery.trim()) return set
  for (const m of searchMatches.value) {
    const path = findPath(state.tree, m.id)
    path?.slice(0, -1).forEach((n) => set.add(n.id))
  }
  return set
})

/* ---------------- toast & dialog ---------------- */

function toast(message: string, type: ToastType = 'success') {
  const id = ++toastSeq
  state.toasts.push({ id, type, message })
  setTimeout(() => {
    const idx = state.toasts.findIndex((t) => t.id === id)
    if (idx >= 0) state.toasts.splice(idx, 1)
  }, 2800)
}

function promptInput(title: string, message = '', initialValue = ''): Promise<string | null> {
  return new Promise((resolve) => {
    state.prompt = {
      show: true,
      title,
      message,
      inputMode: true,
      value: initialValue,
      okText: '确定',
      resolve,
    }
  })
}

function confirmDialog(title: string, message = '', okText = '确定'): Promise<boolean> {
  return new Promise((resolve) => {
    state.prompt = {
      show: true,
      title,
      message,
      inputMode: false,
      value: '',
      okText,
      resolve: (v) => resolve(v !== null),
    }
  })
}

function resolvePrompt(value: string | null) {
  const resolve = state.prompt.resolve
  state.prompt.show = false
  state.prompt.resolve = null
  if (resolve) resolve(value)
}

/* ---------------- undo / redo ---------------- */

function pushHistory() {
  past.push(clone(state.tree))
  if (past.length > 100) past.shift()
  future.splice(0)
}

function beginEdit() {
  if (!editSnapshot) editSnapshot = clone(state.tree)
}

function endEdit() {
  if (editSnapshot) {
    past.push(editSnapshot)
    if (past.length > 100) past.shift()
    future.splice(0)
    editSnapshot = null
  }
}

function undo() {
  if (!past.length) return
  endEdit()
  future.push(clone(state.tree))
  state.tree = past.pop() as FieldNode
}

function redo() {
  if (!future.length) return
  endEdit()
  past.push(clone(state.tree))
  state.tree = future.pop() as FieldNode
}

/* ---------------- tree operations ---------------- */

function addChild(parentId: string) {
  const parent = findNode(state.tree, parentId)
  if (!parent || !canHaveChildren(parent.type)) return
  pushHistory()
  const child = createNode('string', `field${parent.children.length + 1}`)
  parent.children.push(child)
  parent.collapsed = false
}

function removeNode(id: string) {
  const parent = findParent(state.tree, id)
  if (!parent) return
  pushHistory()
  const idx = parent.children.findIndex((c) => c.id === id)
  if (idx >= 0) parent.children.splice(idx, 1)
  // 选中 / 聚焦的节点若随删除消失，回退到 root，避免面包屑悬空
  if (state.selectedNodeId && !findNode(state.tree, state.selectedNodeId)) state.selectedNodeId = null
  if (state.focusNodeId && !findNode(state.tree, state.focusNodeId)) state.focusNodeId = null
}

/**
 * 跨级拖拽排序：
 * - before / after：与目标同级插入（可跨父级）
 * - inside：成为目标的子节点（目标必须可容纳子节点）
 * 被拖节点的整棵子树随之迁移；禁止拖入自身子树（成环）。
 * 返回是否执行成功。
 */
function moveNode(dragId: string, targetId: string, where: 'before' | 'after' | 'inside'): boolean {
  if (dragId === targetId) return false
  const dragNode = findNode(state.tree, dragId)
  const dragParent = findParent(state.tree, dragId)
  if (!dragNode || !dragParent) return false
  // 不能拖入自身或自身子树，否则产生循环引用
  if (isDescendant(state.tree, dragId, targetId)) return false

  if (where === 'inside') {
    const target = findNode(state.tree, targetId)
    if (!target || !canHaveChildren(target.type)) return false
    pushHistory()
    const from = dragParent.children.findIndex((c) => c.id === dragId)
    dragParent.children.splice(from, 1)
    target.children.push(dragNode)
    target.collapsed = false
    return true
  }

  // before / after：插入到目标的同级位置（目标父级与被拖父级可不同）
  const targetParent = findParent(state.tree, targetId)
  if (!targetParent) return false
  pushHistory()
  const fromArr = dragParent.children
  const from = fromArr.findIndex((c) => c.id === dragId)
  const [node] = fromArr.splice(from, 1)

  const toArr = targetParent.children
  let to = toArr.findIndex((c) => c.id === targetId)
  if (to < 0) {
    fromArr.splice(from, 0, node)
    return false
  }
  if (where === 'after') to += 1
  toArr.splice(to, 0, node)
  return true
}

/* ---------------- selection / search / breadcrumb ---------------- */

function selectNode(id: string | null) {
  state.selectedNodeId = id
}

/** 展开祖先 + 选中 + 请求树组件滚动到该节点（focusTick 每次递增以支持重复定位同一节点） */
function focusNode(id: string) {
  if (!expandAncestors(state.tree, id)) return
  state.selectedNodeId = id
  state.focusNodeId = id
  state.focusTick += 1
}

function setSearchMode(mode: 'keyword' | 'path') {
  state.searchMode = mode
}

/**
 * 执行搜索：自动展开命中节点祖先，并把第一个命中滚动到视口中央。
 * JSONPath 模式（或以 $ 开头）解析失败 / 路径不存在时给出警示提示。
 */
function executeSearch() {
  const q = state.searchQuery.trim()
  state.activeMatchIndex = 0
  if (!q) return
  const hits = searchMatches.value
  if (state.searchMode === 'path' || q.startsWith('$')) {
    if (!hits.length) {
      toast(`找不到路径「${q}」对应的节点`, 'warning')
      return
    }
  } else if (!hits.length) {
    return
  }
  expandToHits(state.tree, hits)
  focusNode(hits[0].id)
}

/** 在命中结果之间跳转（循环） */
function navigateMatch(delta: 1 | -1) {
  const hits = searchMatches.value
  if (!hits.length) return
  const idx = (state.activeMatchIndex + delta + hits.length) % hits.length
  state.activeMatchIndex = idx
  focusNode(hits[idx].id)
}

function clearSearch() {
  state.searchQuery = ''
  state.activeMatchIndex = 0
}

function renameNode(node: FieldNode, name: string) {
  node.name = name
}

function changeType(node: FieldNode, type: FieldType) {
  pushHistory()
  const prev = node.constraints
  node.type = type
  // 仅迁移在新类型上仍然成立的开关：例如切到布尔/枚举时，旧的「值唯一」必须丢弃
  node.constraints = {
    ...defaultConstraints(type),
    nullable: !!prev.nullable,
    unique: supportsUnique(type) ? !!prev.unique : false,
  }
  if (!canHaveChildren(type)) node.children = []
}

function updateConstraints(node: FieldNode, patch: Partial<FieldConstraints>) {
  pushHistory()
  node.constraints = { ...node.constraints, ...patch }
}

function toggleCollapse(node: FieldNode) {
  node.collapsed = !node.collapsed
}

function setAllCollapsed(collapsed: boolean) {
  const walk = (n: FieldNode) => {
    if (canHaveChildren(n.type)) n.collapsed = collapsed
    n.children.forEach(walk)
  }
  walk(state.tree)
}

async function clearTree() {
  const ok = await confirmDialog('清空整个结构', '将删除所有节点并重置为默认 root 对象，确定继续吗？', '清空')
  if (!ok) return
  pushHistory()
  state.tree = createRoot()
  state.structureName = '未命名结构'
  state.activeTemplateId = null
  toast('已清空结构')
}

/* ---------------- generation ---------------- */

/** 超过该阈值使用 Web Worker，保证超大批量生成时页面动画与交互不冻结 */
const WORKER_THRESHOLD = 2000

let genWorker: Worker | null = null

async function generate(count: number) {
  if (state.generating) return
  const objectMode = isObjectOutput.value
  const targetCount = objectMode ? 1 : count
  if (!objectMode && (!Number.isFinite(targetCount) || targetCount <= 0)) {
    toast('请输入有效的生成数量', 'warning')
    return
  }
  if (!objectMode && targetCount > 1_000_000) {
    toast('单次生成上限为 100 万条', 'warning')
    return
  }
  const errList = Object.values(errors.value)
  if (errList.length) {
    toast(`结构存在 ${errList.length} 处非法配置，请先修正`, 'error')
    return
  }

  state.generating = true
  state.lockedByGeneration = true
  state.progress = 0
  cancelRequested = false
  results = []

  // 大批量走 Worker；小批量（含单对象）走主线程分块，省去 Worker 启动开销
  if (!objectMode && targetCount > WORKER_THRESHOLD) {
    await generateInWorker(targetCount)
  } else {
    await generateOnMain(targetCount)
  }
}

/** 生成结束：统一收口预览数据与状态提示 */
function finishGeneration(cancelled: boolean) {
  state.generatedCount = results.length
  state.progress = cancelled ? state.progress : 1
  state.hasResult = results.length > 0
  const effectiveLimit = Math.min(Math.max(state.previewLimit, PREVIEW_MIN), Math.max(results.length, 1))
  state.previewLimit = effectiveLimit
  state.previewRows = results.slice(0, effectiveLimit)
  state.previewColumns = collectColumns(state.previewRows)
  if (cancelled && results.length) toast(`已取消生成，保留前 ${results.length} 条`, 'warning')
  else if (cancelled) toast('已取消生成', 'warning')
  else toast(`生成完成，共 ${results.length} 条`)
  state.generating = false
  state.lockedByGeneration = false
  state.progress = 0
}

/** 主线程分块生成（小批量）：每块让出事件循环，取消按钮即时可响应 */
async function generateOnMain(targetCount: number) {
  try {
    // 整批共享一个上下文：自增序号跨行持续递增，unique 约束在所有行间生效
    const genCtx = createGenContext()
    const chunkSize = 500
    let generated = 0
    while (generated < targetCount && !cancelRequested) {
      const end = Math.min(generated + chunkSize, targetCount)
      for (let i = generated; i < end; i += 1) {
        results.push(generateRow(state.tree, genCtx))
      }
      generated = end
      state.progress = Math.min(0.99, generated / targetCount)
      state.generatedCount = generated
      await new Promise((r) => setTimeout(r, 0))
    }
    finishGeneration(cancelRequested)
  } catch (e) {
    state.generating = false
    state.lockedByGeneration = false
    state.progress = 0
    toast(`生成失败：${(e as Error).message}`, 'error')
  }
}

/** Worker 生成（大批量）：分块回传结果，页面全程保持流畅 */
function generateInWorker(targetCount: number): Promise<void> {
  return new Promise((resolve) => {
    const worker = new GenerateWorker({ name: 'data-generator' })
    genWorker = worker
    let settled = false

    const cleanup = () => {
      worker.terminate()
      if (genWorker === worker) genWorker = null
      resolve()
    }

    worker.onmessage = (e: MessageEvent) => {
      const msg = e.data as { type: string; rows?: Row[]; done?: number; total?: number }
      if (msg.type === 'chunk' && msg.rows) {
        for (const r of msg.rows) results.push(r)
      } else if (msg.type === 'progress') {
        state.generatedCount = msg.done ?? 0
        state.progress = Math.min(0.99, (msg.done ?? 0) / targetCount)
      } else if (msg.type === 'done' || msg.type === 'cancelled') {
        if (settled) return
        settled = true
        const cancelled = msg.type === 'cancelled' || cancelRequested
        finishGeneration(cancelled)
        cleanup()
      }
    }

    worker.onerror = (e) => {
      if (settled) return
      settled = true
      state.generating = false
      state.lockedByGeneration = false
      state.progress = 0
      toast(`生成失败：${e.message || 'Worker 异常'}`, 'error')
      cleanup()
    }

    try {
      // Vue 响应式 Proxy 无法被结构化克隆，先脱壳为纯数据再投递
      worker.postMessage({ type: 'start', tree: clone(state.tree), count: targetCount })
    } catch (e) {
      if (settled) return
      settled = true
      state.generating = false
      state.lockedByGeneration = false
      state.progress = 0
      toast(`生成失败：${(e as Error).message || '无法启动生成线程'}`, 'error')
      cleanup()
    }
  })
}

function cancelGenerate() {
  cancelRequested = true
  // Worker 模式：通知其在分块边界优雅停止（主线程兜底 terminate 在消息回收后执行）
  genWorker?.postMessage({ type: 'cancel' })
}

function setPreviewLimit(n: number) {
  const limit = Math.min(PREVIEW_MAX, Math.max(1, Math.floor(n) || 1))
  state.previewLimit = limit
  const effective = Math.min(limit, results.length)
  state.previewRows = results.slice(0, effective)
  state.previewColumns = collectColumns(state.previewRows)
}

/* ---------------- export ---------------- */

const isTauri = (): boolean => '__TAURI_INTERNALS__' in window

function buildContent(format: 'json' | 'csv' | 'sql'): string {
  if (format === 'json') {
    return isObjectOutput.value ? toJsonObject(results) : toJson(results)
  }
  if (format === 'csv') return toCsv(results)
  return toSql(results, state.tree.name || 'mock_data')
}

function downloadInBrowser(filename: string, content: string, mime: string) {
  const blob = new Blob([content], { type: `${mime};charset=utf-8` })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

async function exportData(format: 'json' | 'csv' | 'sql') {
  if (!results.length) {
    toast('请先生成模拟数据', 'warning')
    return
  }
  const filename = `${state.tree.name || 'mock_data'}.${format}`
  const content = buildContent(format)
  const mime = format === 'json' ? 'application/json' : format === 'csv' ? 'text/csv' : 'application/sql'
  // CSV 加 BOM，保证 Excel 打开中文不乱码
  const fileContent = format === 'csv' ? '﻿' + content : content

  // 浏览器预览环境兜底：直接触发下载
  if (!isTauri()) {
    downloadInBrowser(filename, fileContent, mime)
    toast(`已导出 ${format.toUpperCase()}：${results.length} 条`)
    return
  }

  // Tauri 桌面环境：原生保存对话框 + 写文件
  const filters =
    format === 'json'
      ? [{ name: 'JSON', extensions: ['json'] }]
      : format === 'csv'
        ? [{ name: 'CSV', extensions: ['csv'] }]
        : [{ name: 'SQL', extensions: ['sql'] }]
  try {
    const path = await saveDialog({ defaultPath: filename, filters })
    if (!path) return
    await writeTextFile(path, fileContent)
    toast(`已导出 ${format.toUpperCase()}：${results.length} 条`)
  } catch (e) {
    toast(`导出失败：${(e as Error).message}`, 'error')
  }
}

/* ---------------- schema mode ---------------- */

function parseSchema() {
  try {
    const { root } = parseSchemaInput(state.schemaText)
    pushHistory()
    state.tree = root
    let title = ''
    try {
      const parsed = JSON.parse(state.schemaText) as { title?: unknown }
      title = typeof parsed.title === 'string' ? parsed.title.trim() : ''
    } catch {
      /* 标题缺失时使用默认结构名 */
    }
    state.structureName = title || '未命名结构'
    state.mode = 'manual'
    toast(`Schema 解析成功，已生成结构树`)
  } catch (e) {
    toast((e as Error).message, 'error')
  }
}

function pickFileInBrowser(): Promise<string | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.json,.schema,application/json'
    input.onchange = () => {
      const file = input.files?.[0]
      if (!file) {
        resolve(null)
        return
      }
      const reader = new FileReader()
      reader.onload = () => resolve(String(reader.result ?? ''))
      reader.onerror = () => resolve(null)
      reader.readAsText(file)
    }
    input.click()
  })
}

async function importSchemaFile() {
  try {
    let text: string | null = null
    if (isTauri()) {
      const path = await openDialog({
        multiple: false,
        filters: [{ name: 'JSON Schema', extensions: ['json', 'schema'] }],
      })
      if (!path) return
      text = await readTextFile(path as string)
    } else {
      text = await pickFileInBrowser()
    }
    if (text === null) return
    state.schemaText = text
    state.mode = 'schema'
    toast('文件已载入，点击「解析为结构树」生成结构')
  } catch (e) {
    toast(`读取失败：${(e as Error).message}`, 'error')
  }
}

/* ---------------- templates ---------------- */

let store: Store | null = null

async function getStore(): Promise<Store | null> {
  if (store) return store
  try {
    store = await load('templates.json', { autoSave: true })
    return store
  } catch {
    return null
  }
}

async function refreshTemplates() {
  const s = await getStore()
  if (!s) return
  const saved = await s.get<Template[]>('templates')
  if (!saved) {
    state.templates = []
    return
  }
  // 旧版模板：根节点类型不表达输出形态，其本意均为对象数组，根类型迁移为 array；根名固定 root
  let migrated = false
  for (const tpl of saved) {
    if (tpl.version !== 1) {
      if (tpl.tree?.type === 'object') tpl.tree.type = 'array'
      tpl.version = 1
      migrated = true
    }
    if (tpl.tree?.name !== 'root') {
      tpl.tree.name = 'root'
      migrated = true
    }
  }
  state.templates = saved
  if (migrated) await persistTemplates()
}

async function persistTemplates() {
  const s = await getStore()
  if (!s) return
  await s.set('templates', clone(state.templates))
  await s.save()
}

async function saveTemplate() {
  const name = await promptInput('保存为模板', '模板名称', state.structureName === '未命名结构' ? '' : state.structureName)
  if (!name || !name.trim()) return
  const treeForSave = clone(state.tree)
  treeForSave.name = 'root'
  const tpl: Template = {
    id: state.activeTemplateId ?? newId(),
    name: name.trim(),
    tree: treeForSave,
    updatedAt: Date.now(),
    version: 1,
  }
  const idx = state.templates.findIndex((t) => t.id === tpl.id)
  if (idx >= 0) state.templates.splice(idx, 1, tpl)
  else state.templates.unshift(tpl)
  state.activeTemplateId = tpl.id
  state.structureName = tpl.name
  await persistTemplates()
  toast(`模板「${tpl.name}」已保存`)
}

async function loadTemplate(id: string) {
  const tpl = state.templates.find((t) => t.id === id)
  if (!tpl) return
  pushHistory()
  state.tree = clone(tpl.tree)
  state.structureName = tpl.name
  state.activeTemplateId = tpl.id
  state.mode = 'manual'
  toast(`已加载模板「${tpl.name}」`)
}

async function renameTemplate(id: string) {
  const tpl = state.templates.find((t) => t.id === id)
  if (!tpl) return
  const name = await promptInput('重命名模板', '', tpl.name)
  if (!name || !name.trim()) return
  tpl.name = name.trim()
  tpl.updatedAt = Date.now()
  if (state.activeTemplateId === id) state.structureName = tpl.name
  await persistTemplates()
  toast('已重命名')
}

async function deleteTemplate(id: string) {
  const tpl = state.templates.find((t) => t.id === id)
  if (!tpl) return
  const ok = await confirmDialog('删除模板', `确定删除模板「${tpl.name}」吗？`, '删除')
  if (!ok) return
  const idx = state.templates.findIndex((t) => t.id === id)
  if (idx >= 0) state.templates.splice(idx, 1)
  if (state.activeTemplateId === id) state.activeTemplateId = null
  await persistTemplates()
  toast('模板已删除')
}

async function duplicateTemplate(id: string) {
  const tpl = state.templates.find((t) => t.id === id)
  if (!tpl) return
  const copy: Template = {
    id: newId(),
    name: `${tpl.name} 副本`,
    tree: clone(tpl.tree),
    updatedAt: Date.now(),
    version: 1,
  }
  state.templates.unshift(copy)
  await persistTemplates()
  toast('已复制模板')
}

function newBlankTemplate() {
  pushHistory()
  state.tree = createRoot()
  state.structureName = '未命名结构'
  state.activeTemplateId = null
  state.mode = 'manual'
  toast('已新建空白结构')
}

function setMode(mode: 'manual' | 'schema') {
  state.mode = mode
}

export function useAppStore() {
  return {
    state,
    errors,
    undoable,
    redoable,
    isObjectOutput,
    totalCount,
    searchMatches,
    selectedPath,
    matchAncestorIds,
    toast,
    promptInput,
    confirmDialog,
    resolvePrompt,
    pushHistory,
    beginEdit,
    endEdit,
    undo,
    redo,
    addChild,
    removeNode,
    renameNode,
    changeType,
    updateConstraints,
    toggleCollapse,
    setAllCollapsed,
    moveNode,
    selectNode,
    focusNode,
    setSearchMode,
    executeSearch,
    navigateMatch,
    clearSearch,
    clearTree,
    generate,
    cancelGenerate,
    setPreviewLimit,
    exportData,
    parseSchema,
    importSchemaFile,
    refreshTemplates,
    saveTemplate,
    loadTemplate,
    renameTemplate,
    deleteTemplate,
    duplicateTemplate,
    newBlankTemplate,
    setMode,
    flattenRow,
  }
}
