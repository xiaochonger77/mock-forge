export type FieldType =
  // 结构容器
  | 'object'
  | 'array'
  // 基础类型
  | 'string'
  | 'number'
  | 'boolean'
  | 'date'
  | 'timestamp'
  | 'enum'
  // 标识字段
  | 'serial'
  | 'uuid'
  // 网络信息
  | 'url'
  | 'email'
  | 'ip'
  // 个人信息
  | 'name'
  | 'username'
  | 'phone'
  | 'idcard'
  | 'address'

/** 类型在选择器中的分组（结构容器 / 基础 / 标识 / 网络 / 个人） */
export type FieldTypeGroup = 'container' | 'basic' | 'id' | 'network' | 'person'

export interface FieldConstraints {
  minLength?: number
  maxLength?: number
  min?: number
  max?: number
  decimals?: number
  dateStart?: string
  dateEnd?: string
  enumValues?: string[]
  trueRatio?: number
  arrayMin?: number
  arrayMax?: number
  nullable?: boolean
  unique?: boolean
  /** UUID：是否带横线（标准 8-4-4-4-12），false 输出 32 位纯 hex */
  uuidHyphens?: boolean
  /** 自增序号：起始值 */
  seqStart?: number
  /** 自增序号：步长 */
  seqStep?: number
  /** 时间戳单位：毫秒（13 位）/ 秒（10 位） */
  tsUnit?: 'ms' | 's'
}

export interface FieldNode {
  id: string
  name: string
  type: FieldType
  collapsed: boolean
  constraints: FieldConstraints
  children: FieldNode[]
}

export interface Template {
  id: string
  name: string
  tree: FieldNode
  updatedAt: number
  /** 结构版本号：缺省为旧版（根节点类型不表达输出形态，需迁移） */
  version?: number
}

export interface FieldTypeMeta {
  value: FieldType
  label: string
  /** 徽章缩写 */
  short: string
  /** 类型主色（徽章 / 色条 / 表头标签） */
  color: string
  canHaveChildren: boolean
  group: FieldTypeGroup
}

/**
 * 类型色板：每个类型独立取色，在深色底上拉开色相差，
 * 避免旧版「字符串/手机号同为绿、日期/地址/IP 同为青、对象/邮箱同为橙」的重复。
 */
export const FIELD_TYPES: FieldTypeMeta[] = [
  // 结构容器
  { value: 'object', label: '对象', short: '{}', color: '#FBBF24', canHaveChildren: true, group: 'container' },
  { value: 'array', label: '数组', short: '[]', color: '#A78BFA', canHaveChildren: true, group: 'container' },
  // 基础类型
  { value: 'string', label: '字符串', short: 'Aa', color: '#34D399', canHaveChildren: false, group: 'basic' },
  { value: 'number', label: '数字', short: '12', color: '#60A5FA', canHaveChildren: false, group: 'basic' },
  { value: 'boolean', label: '布尔', short: 'TF', color: '#FB7185', canHaveChildren: false, group: 'basic' },
  { value: 'date', label: '日期', short: 'YMD', color: '#22D3EE', canHaveChildren: false, group: 'basic' },
  { value: 'timestamp', label: '时间戳', short: 'TS', color: '#FB923C', canHaveChildren: false, group: 'basic' },
  { value: 'enum', label: '枚举', short: '···', color: '#E879F9', canHaveChildren: false, group: 'basic' },
  // 标识字段
  { value: 'serial', label: '自增序号', short: '#', color: '#94A3B8', canHaveChildren: false, group: 'id' },
  { value: 'uuid', label: 'UUID', short: 'uid', color: '#F472B6', canHaveChildren: false, group: 'id' },
  // 网络信息
  { value: 'url', label: '链接 URL', short: 'URL', color: '#2DD4BF', canHaveChildren: false, group: 'network' },
  { value: 'email', label: '邮箱', short: '@', color: '#F87171', canHaveChildren: false, group: 'network' },
  { value: 'ip', label: 'IP 地址', short: 'IP', color: '#38BDF8', canHaveChildren: false, group: 'network' },
  // 个人信息
  { value: 'name', label: '姓名', short: '姓', color: '#C084FC', canHaveChildren: false, group: 'person' },
  { value: 'username', label: '账号名', short: 'usr', color: '#FDE047', canHaveChildren: false, group: 'person' },
  { value: 'phone', label: '手机号', short: 'TEL', color: '#A3E635', canHaveChildren: false, group: 'person' },
  { value: 'idcard', label: '身份证', short: 'ID', color: '#818CF8', canHaveChildren: false, group: 'person' },
  { value: 'address', label: '地址', short: 'PIN', color: '#4ADE80', canHaveChildren: false, group: 'person' },
]

export const TYPE_GROUP_LABEL: Record<FieldTypeGroup, string> = {
  container: '结构容器',
  basic: '基础类型',
  id: '标识字段',
  network: '网络信息',
  person: '个人信息',
}

export const TYPE_GROUPS: { group: FieldTypeGroup; label: string; types: FieldTypeMeta[] }[] = (
  ['container', 'basic', 'id', 'network', 'person'] as FieldTypeGroup[]
).map((group) => ({
  group,
  label: TYPE_GROUP_LABEL[group],
  types: FIELD_TYPES.filter((t) => t.group === group),
}))

export const TYPE_MAP = Object.fromEntries(FIELD_TYPES.map((t) => [t.value, t])) as Record<
  FieldType,
  FieldTypeMeta
>

export function canHaveChildren(type: FieldType): boolean {
  return type === 'object' || type === 'array'
}

/**
 * 是否允许「值唯一」约束：
 * - 容器（对象/数组）无此概念；
 * - 布尔只有 true/false 两个取值，枚举候选有限，日期/时间戳为区间随机值——唯一均无实际意义；
 * - UUID、自增序号天然唯一，由生成器保证，不暴露开关。
 */
export function supportsUnique(type: FieldType): boolean {
  return (
    type === 'string' ||
    type === 'number' ||
    type === 'url' ||
    type === 'email' ||
    type === 'ip' ||
    type === 'name' ||
    type === 'username' ||
    type === 'phone' ||
    type === 'idcard' ||
    type === 'address'
  )
}

/** UUID / 自增序号由生成器保证天然全局唯一 */
export function inherentlyUnique(type: FieldType): boolean {
  return type === 'uuid' || type === 'serial'
}

/** 数值型列（表格右对齐 / 等宽数字） */
export function isNumericType(type: FieldType): boolean {
  return type === 'number' || type === 'timestamp' || type === 'serial'
}

/** 计算字段已配置约束的摘要 chips（行内触发器 / 规则面板标题共用）；无配置时返回空数组 */
export function summarizeConstraints(node: FieldNode): string[] {
  const out: string[] = []
  const v = node.constraints
  switch (node.type) {
    case 'string':
      if (v.minLength !== undefined || v.maxLength !== undefined)
        out.push(`${v.minLength ?? 0}–${v.maxLength ?? '∞'} 字`)
      break
    case 'number':
      if (v.min !== undefined || v.max !== undefined) out.push(`${v.min ?? 0} ~ ${v.max ?? '∞'}`)
      if (v.decimals) out.push(`${v.decimals} 位小数`)
      break
    case 'boolean':
      if (v.trueRatio !== undefined) out.push(`true ${v.trueRatio}%`)
      break
    case 'date':
      if (v.dateStart || v.dateEnd) out.push('日期区间')
      break
    case 'timestamp':
      out.push(v.tsUnit === 's' ? '秒级时间戳' : '毫秒时间戳')
      if (v.dateStart || v.dateEnd) out.push('日期区间')
      break
    case 'enum':
      if (v.enumValues?.length) out.push(`${v.enumValues.length} 个候选`)
      break
    case 'array':
      if (v.arrayMin !== undefined || v.arrayMax !== undefined)
        out.push(`长度 ${v.arrayMin ?? 1}–${v.arrayMax ?? 3}`)
      break
    case 'uuid':
      out.push('UUID v4')
      if (v.uuidHyphens === false) out.push('无横线')
      break
    case 'serial':
      out.push(`自增 · 从 ${v.seqStart ?? 1} 起`)
      if (v.seqStep && v.seqStep !== 1) out.push(`步长 ${v.seqStep}`)
      break
  }
  if (inherentlyUnique(node.type)) out.push('天然唯一')
  if (v.nullable) out.push('可空')
  if (v.unique && supportsUnique(node.type)) out.push('唯一')
  return out
}
