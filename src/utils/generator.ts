import type { FieldNode, FieldType, FieldConstraints } from '../types'
import { canHaveChildren, TYPE_MAP } from '../types'

let seq = 0
export function uid(): string {
  seq += 1
  return `n${Date.now().toString(36)}${seq.toString(36)}`
}

export function defaultConstraints(type: FieldType): FieldConstraints {
  switch (type) {
    case 'string':
      return { minLength: 4, maxLength: 12, nullable: false, unique: false }
    case 'number':
      return { min: 0, max: 1000, decimals: 0, nullable: false, unique: false }
    case 'boolean':
      return { trueRatio: 50, nullable: false }
    case 'date':
      return { dateStart: '2020-01-01', dateEnd: '2025-12-31', nullable: false }
    case 'timestamp':
      return { tsUnit: 'ms', dateStart: '2020-01-01', dateEnd: '2025-12-31', nullable: false }
    case 'enum':
      return { enumValues: ['选项A', '选项B', '选项C'], nullable: false }
    case 'array':
      return { arrayMin: 1, arrayMax: 3, nullable: false }
    case 'uuid':
      return { uuidHyphens: true, nullable: false }
    case 'serial':
      return { seqStart: 1, seqStep: 1, nullable: false }
    case 'phone':
    case 'email':
    case 'url':
    case 'name':
    case 'username':
    case 'address':
    case 'idcard':
    case 'ip':
      return { nullable: false, unique: false }
    default:
      return { nullable: false, unique: false }
  }
}

export function createNode(type: FieldType, name = ''): FieldNode {
  return {
    id: uid(),
    name,
    type,
    collapsed: false,
    constraints: defaultConstraints(type),
    children: [],
  }
}

export function createRoot(): FieldNode {
  // 根类型即输出形态：默认 array → 对象数组 [{...}, ...]
  return createNode('array', 'root')
}

/* ---------------- mock data primitives ---------------- */

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]
}

function randomLetters(len: number): string {
  let s = ''
  for (let i = 0; i < len; i += 1) s += 'abcdefghijklmnopqrstuvwxyz'[randomInt(0, 25)]
  return s
}

function randomWord(minLen: number, maxLen: number): string {
  return randomLetters(randomInt(minLen, maxLen))
}

const PROVINCES = ['北京市', '上海市', '广东省', '浙江省', '江苏省', '四川省', '湖北省', '山东省', '福建省', '陕西省']
const CITIES = ['杭州', '苏州', '成都', '武汉', '南京', '广州', '深圳', '青岛', '厦门', '西安']
const DISTRICTS = ['高新区', '西湖区', '朝阳区', '浦东新区', '南山区', '江汉区', '鼓楼区', '历下区']
const EMAIL_DOMAINS = ['gmail.com', 'outlook.com', '163.com', 'qq.com', 'example.com', 'company.cn']
const REGION_CODES = ['110101', '310115', '440305', '330106', '320102', '510107', '420106', '370102']

const SURNAMES = ['张', '王', '李', '赵', '刘', '陈', '杨', '黄', '周', '吴', '徐', '孙', '胡', '朱', '高', '林', '何', '郭', '马', '罗']
const GIVEN_NAMES = [
  '伟', '芳', '娜', '敏', '静', '丽', '强', '磊', '军', '洋',
  '子轩', '梓涵', '浩然', '欣怡', '子墨', '雨桐', '宇航', '思远', '嘉怡', '若曦',
  '志明', '建国', '晓燕', '雪梅', '桂英', '雅婷', '俊杰', '梦琪', '天佑', '语嫣',
]
const URL_DOMAINS = ['example.com', 'company.cn', 'docs.service.cn', 'shop.demo.net', 'cdn.cloud.cn', 'github.io']
const URL_PATHS = ['users', 'posts', 'orders', 'products', 'images', 'assets', 'news', 'docs', 'pages', 'accounts']

function genPhone(): string {
  return `1${pick(['3', '4', '5', '6', '7', '8', '9'])}${Array.from({ length: 9 }, () => randomInt(0, 9)).join('')}`
}

function genEmail(): string {
  return `${randomWord(4, 10)}${randomInt(1, 999)}@${pick(EMAIL_DOMAINS)}`
}

function genAddress(): string {
  return `${pick(PROVINCES)}${pick(CITIES)}市${pick(DISTRICTS)}${randomWord(2, 3)}路${randomInt(1, 300)}号${randomInt(1, 30)}栋${randomInt(101, 2500)}室`
}

function genName(): string {
  return pick(SURNAMES) + pick(GIVEN_NAMES)
}

function genUsername(): string {
  const sep = pick(['_', '.', ''])
  return `${randomWord(3, 7)}${sep}${randomInt(1, 9999)}`
}

function genUrl(): string {
  return `https://${pick(URL_DOMAINS)}/${pick(URL_PATHS)}/${randomWord(3, 6)}${randomInt(1, 999)}`
}

const ID_WEIGHTS = [7, 9, 10, 5, 8, 4, 2, 1, 6, 3, 7, 9, 10, 5, 8, 4, 2]
const ID_CHECK_CODES = '10X98765432'

function genIdCard(): string {
  const region = pick(REGION_CODES)
  const year = randomInt(1970, 2005)
  const month = String(randomInt(1, 12)).padStart(2, '0')
  const day = String(randomInt(1, 28)).padStart(2, '0')
  const seqPart = String(randomInt(1, 999)).padStart(3, '0')
  const body = `${region}${year}${month}${day}${seqPart}`
  let sum = 0
  for (let i = 0; i < 17; i += 1) sum += Number(body[i]) * ID_WEIGHTS[i]
  return body + ID_CHECK_CODES[sum % 11]
}

function genIp(): string {
  return `${randomInt(1, 223)}.${randomInt(0, 255)}.${randomInt(0, 255)}.${randomInt(1, 254)}`
}

/** UUID v4：优先 crypto.randomUUID，旧环境下手工构造并设置 version/variant 位 */
function genUuid(hyphens: boolean): string {
  let u: string
  const g = globalThis as { crypto?: Crypto & { randomUUID?: () => string } }
  if (g.crypto?.randomUUID) {
    u = g.crypto.randomUUID()
  } else if (g.crypto) {
    const bytes = new Uint8Array(16)
    g.crypto.getRandomValues(bytes)
    bytes[6] = (bytes[6] & 0x0f) | 0x40
    bytes[8] = (bytes[8] & 0x3f) | 0x80
    const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0'))
    u = `${hex.slice(0, 4).join('')}-${hex.slice(4, 6).join('')}-${hex.slice(6, 8).join('')}-${hex
      .slice(8, 10)
      .join('')}-${hex.slice(10, 16).join('')}`
  } else {
    const randHex = (n: number) => Array.from({ length: n }, () => '0123456789abcdef'[randomInt(0, 15)]).join('')
    u = `${randHex(8)}-${randHex(4)}-4${randHex(3)}-a${randHex(3)}-${randHex(12)}`
  }
  return hyphens ? u : u.replace(/-/g, '')
}

/** 取日期约束对应的时间窗（毫秒），与日期类型共用同一区间语义 */
function dateWindow(c: FieldConstraints): [number, number] {
  const start = c.dateStart ? new Date(c.dateStart).getTime() : new Date('2020-01-01').getTime()
  const end = c.dateEnd ? new Date(c.dateEnd).getTime() : Date.now()
  const lo = Number.isFinite(start) ? start : Date.now() - 365 * 86400_000
  const hi = Number.isFinite(end) && end > lo ? end : lo + 365 * 86400_000
  return [lo, hi]
}

function genDate(c: FieldConstraints): string {
  const [lo, hi] = dateWindow(c)
  const d = new Date(lo + Math.random() * (hi - lo))
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
}

function genTimestamp(c: FieldConstraints): number {
  const [lo, hi] = dateWindow(c)
  const ms = Math.floor(lo + Math.random() * (hi - lo))
  return c.tsUnit === 's' ? Math.floor(ms / 1000) : ms
}

function genNumber(c: FieldConstraints): number {
  const min = typeof c.min === 'number' ? c.min : 0
  const max = typeof c.max === 'number' && c.max > min ? c.max : min + 1000
  const decimals = typeof c.decimals === 'number' ? Math.min(Math.max(c.decimals, 0), 10) : 0
  const raw = min + Math.random() * (max - min)
  return decimals === 0 ? Math.floor(raw) : Number(raw.toFixed(decimals))
}

function genString(c: FieldConstraints): string {
  const minLen = typeof c.minLength === 'number' && c.minLength >= 0 ? c.minLength : 4
  const maxLen = typeof c.maxLength === 'number' && c.maxLength >= minLen ? c.maxLength : Math.max(minLen, 12)
  return randomWord(minLen, Math.min(maxLen, 64))
}

/* ---------------- row generation ---------------- */

export interface GenContext {
  /** 字符串/数值的已用值集合（跨行共享，unique 约束在整批数据内生效） */
  uniqueSets: Map<string, Set<string>>
  /** 自增序号计数器：每个字段路径独立计数，跨行持续递增 */
  seqCounters: Map<string, number>
  path: string
}

export function createGenContext(): GenContext {
  return { uniqueSets: new Map(), seqCounters: new Map(), path: '' }
}

function usedSet(ctx: GenContext): Set<string> {
  const set = ctx.uniqueSets.get(ctx.path) ?? new Set<string>()
  ctx.uniqueSets.set(ctx.path, set)
  return set
}

/** 字符串去重：冲突时追加 -2/-3 后缀 */
function makeUniqueString(ctx: GenContext, value: string): string {
  const set = usedSet(ctx)
  let v = value
  let n = 2
  while (set.has(v)) {
    v = `${value}-${n}`
    n += 1
  }
  set.add(v)
  return v
}

/** 数值去重：优先重新生成，避免旧逻辑把唯一数字变成带后缀的字符串 */
function makeUniqueNumber(ctx: GenContext, c: FieldConstraints, initial: number): number {
  const set = usedSet(ctx)
  if (!set.has(String(initial))) {
    set.add(String(initial))
    return initial
  }
  for (let i = 0; i < 60; i += 1) {
    const candidate = genNumber(c)
    if (!set.has(String(candidate))) {
      set.add(String(candidate))
      return candidate
    }
  }
  set.add(String(initial))
  return initial
}

function genSerial(c: FieldConstraints, ctx: GenContext): number {
  const start = typeof c.seqStart === 'number' ? c.seqStart : 1
  const step = typeof c.seqStep === 'number' && c.seqStep > 0 ? c.seqStep : 1
  const n = ctx.seqCounters.get(ctx.path) ?? 0
  ctx.seqCounters.set(ctx.path, n + 1)
  return start + n * step
}

function generateValue(node: FieldNode, ctx: GenContext): unknown {
  const c = node.constraints
  if (c.nullable && Math.random() < 0.1) return null

  let value: unknown
  switch (node.type) {
    case 'object':
      value = generateObject(node, ctx)
      break
    case 'array': {
      const min = typeof c.arrayMin === 'number' ? c.arrayMin : 1
      const max = typeof c.arrayMax === 'number' && c.arrayMax >= min ? c.arrayMax : Math.max(min, 3)
      const len = randomInt(min, Math.min(max, 20))
      // 数组元素的路径独立计数（含唯一/序号），避免与父级字段互相干扰
      const itemPath = ctx.path ? `${ctx.path}.${node.name}[]` : `${node.name}[]`
      const itemCtx: GenContext = { ...ctx, path: itemPath }
      // 唯一子节点且为叶子类型 → 该类型的原始值数组（如 string[]）；多个子节点 → 元素为对象
      const [onlyChild] = node.children
      const isPrimitiveArray = node.children.length === 1 && !canHaveChildren(onlyChild.type)
      value = Array.from({ length: len }, () => {
        if (isPrimitiveArray) return generateValue(onlyChild, itemCtx)
        if (node.children.length) return generateObject(node, itemCtx)
        return genString(defaultConstraints('string'))
      })
      break
    }
    case 'number':
      value = genNumber(c)
      break
    case 'boolean':
      value = Math.random() * 100 < (typeof c.trueRatio === 'number' ? c.trueRatio : 50)
      break
    case 'date':
      value = genDate(c)
      break
    case 'timestamp':
      value = genTimestamp(c)
      break
    case 'enum': {
      const values = c.enumValues && c.enumValues.length ? c.enumValues : ['A', 'B', 'C']
      value = pick(values)
      break
    }
    case 'uuid': {
      // 生成器保证天然全局唯一：极小概率碰撞时重新生成
      const set = usedSet(ctx)
      let u = genUuid(c.uuidHyphens !== false)
      let guard = 0
      while (set.has(u) && guard < 8) {
        u = genUuid(c.uuidHyphens !== false)
        guard += 1
      }
      set.add(u)
      value = u
      break
    }
    case 'serial':
      value = genSerial(c, ctx)
      break
    case 'url':
      value = genUrl()
      break
    case 'name':
      value = genName()
      break
    case 'username':
      value = genUsername()
      break
    case 'phone':
      value = genPhone()
      break
    case 'email':
      value = genEmail()
      break
    case 'address':
      value = genAddress()
      break
    case 'idcard':
      value = genIdCard()
      break
    case 'ip':
      value = genIp()
      break
    default:
      value = genString(c)
  }

  if (c.unique) {
    if (typeof value === 'string') value = makeUniqueString(ctx, value)
    else if (typeof value === 'number') value = makeUniqueNumber(ctx, c, value as number)
  }
  return value
}

function generateObject(node: FieldNode, ctx: GenContext): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const child of node.children) {
    const childCtx: GenContext = { ...ctx, path: `${ctx.path}.${child.name}` }
    out[child.name] = generateValue(child, childCtx)
  }
  return out
}

/** 生成一行；可传入跨整批共享的 ctx（自增序号持续递增、唯一约束跨行生效） */
export function generateRow(root: FieldNode, ctx: GenContext = createGenContext()): Record<string, unknown> {
  return generateObject(root, ctx)
}

export function findNode(root: FieldNode, id: string): FieldNode | null {
  if (root.id === id) return root
  for (const child of root.children) {
    const found = findNode(child, id)
    if (found) return found
  }
  return null
}

export function findParent(root: FieldNode, id: string): FieldNode | null {
  for (const child of root.children) {
    if (child.id === id) return root
    const found = findParent(child, id)
    if (found) return found
  }
  return null
}

export function countNodes(root: FieldNode): number {
  return 1 + root.children.reduce((sum, child) => sum + countNodes(child), 0)
}

/* ---------------- tree navigation: path / search / jsonpath ---------------- */

/** 返回从 root 到目标节点的完整链（含两端）；找不到返回 null */
export function findPath(root: FieldNode, id: string): FieldNode[] | null {
  if (root.id === id) return [root]
  for (const child of root.children) {
    const sub = findPath(child, id)
    if (sub) return [root, ...sub]
  }
  return null
}

/** node 是否为 ancestorId 的后代（不含自身） */
export function isDescendant(root: FieldNode, ancestorId: string, nodeId: string): boolean {
  const ancestor = findNode(root, ancestorId)
  if (!ancestor) return false
  return ancestor.children.some((c) => c.id === nodeId || isDescendant(c, c.id, nodeId))
}

/** 展开到目标节点路径上的所有容器（搜索/跳转时自动展开树） */
export function expandAncestors(root: FieldNode, id: string): boolean {
  const path = findPath(root, id)
  if (!path) return false
  // 目标节点自身保持原折叠态，仅展开祖先
  for (const n of path.slice(0, -1)) n.collapsed = false
  return true
}

/** 关键字搜索：命中字段名 / 类型名 / 枚举候选值，返回按树序排列的节点（不含 root） */
export function searchNodes(root: FieldNode, keyword: string): FieldNode[] {
  const kw = keyword.trim().toLowerCase()
  if (!kw) return []
  const hits: FieldNode[] = []
  const walk = (node: FieldNode, isRoot: boolean) => {
    if (!isRoot) {
      const meta = TYPE_MAP[node.type]
      const inName = node.name.toLowerCase().includes(kw)
      const inType =
        !!meta && (meta.label.toLowerCase().includes(kw) || meta.value.toLowerCase().includes(kw))
      const inEnum = (node.constraints.enumValues || []).some((v) => v.toLowerCase().includes(kw))
      if (inName || inType || inEnum) hits.push(node)
    }
    node.children.forEach((c) => walk(c, false))
  }
  walk(root, true)
  return hits
}

/** 展开所有命中节点的祖先，保证命中行在树中可见 */
export function expandToHits(root: FieldNode, hits: FieldNode[]) {
  for (const h of hits) expandAncestors(root, h.id)
}

export interface PathTarget {
  /** 解析后的字段名段（数组的元素标记 [] 已剔除） */
  segments: string[]
  /** 是否以 $.. 开头的递归下降（按名字找全树第一个同名节点） */
  recursive: boolean
}

/**
 * 解析 JSONPath 风格表达式：
 * 支持 $.user.info.name / user.info.name / $['user']['info'] / users[].id / users[0].id / $..name
 * 无法解析时返回 null
 */
export function parseJsonPath(expr: string): PathTarget | null {
  let s = expr.trim()
  if (!s) return null
  let recursive = false
  if (s.startsWith('$..')) {
    recursive = true
    s = s.slice(3)
  } else if (s.startsWith('$.')) {
    s = s.slice(2)
  } else if (s.startsWith('$')) {
    s = s.slice(1)
  }
  s = s.replace(/\[['"]?([^'"\]]*)['"]?\]/g, (_, key: string) => `.${key}`)
  const segments = s
    .split('.')
    .map((seg) => seg.trim())
    .filter((seg) => seg !== '' && seg !== '[]')
  if (!segments.length) return null
  return { segments, recursive }
}

/** 按字段名路径在树中定位节点；recursive 时最后一段做全树深度优先同名匹配 */
export function findByPath(root: FieldNode, target: PathTarget): FieldNode | null {
  if (target.recursive) {
    const lastName = target.segments[target.segments.length - 1].toLowerCase()
    let found: FieldNode | null = null
    const walk = (node: FieldNode) => {
      if (found) return
      if (node !== root && node.name.toLowerCase() === lastName) {
        found = node
        return
      }
      node.children.forEach(walk)
    }
    walk(root)
    return found
  }

  let current: FieldNode = root
  // 根数组/对象本身不占路径段：第一段若恰为 root 名（root）则跳过
  const segs = [...target.segments]
  if (segs[0]?.toLowerCase() === root.name.toLowerCase()) segs.shift()
  for (const segRaw of segs) {
    const seg = segRaw.toLowerCase()
    // 纯数字段：按下标取子节点
    if (/^\d+$/.test(segRaw)) {
      const idx = Number(segRaw)
      const next = current.children[idx]
      if (!next) return null
      current = next
      continue
    }
    const next = current.children.find((c) => c.name.toLowerCase() === seg)
    if (!next) return null
    current = next
  }
  return current === root ? null : current
}

export function validateTree(root: FieldNode): Record<string, string> {
  const errors: Record<string, string> = {}

  const walk = (node: FieldNode, isRoot: boolean) => {
    if (!isRoot && !node.name.trim()) {
      errors[node.id] = '字段名不能为空'
    }
    const seen = new Set<string>()
    for (const child of node.children) {
      const key = child.name.trim().toLowerCase()
      if (key && seen.has(key)) {
        errors[child.id] = '与同级字段重名'
      }
      seen.add(key)
      walk(child, false)
    }
  }

  walk(root, true)
  return errors
}
