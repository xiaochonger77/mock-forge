import type { FieldNode, FieldType } from '../types'
import { createNode } from './generator'

interface JsonSchema {
  $schema?: string
  title?: string
  type?: string | string[]
  properties?: Record<string, JsonSchema>
  items?: JsonSchema
  enum?: unknown[]
  format?: string
  minimum?: number
  maximum?: number
  minLength?: number
  maxLength?: number
  minItems?: number
  maxItems?: number
}

export interface SchemaParseResult {
  root: FieldNode
  /** true 表示输入是普通 JSON 数据（按样例推断），false 表示是 JSON Schema */
  inferred: boolean
  title: string
}

function firstType(type: string | string[] | undefined): string | undefined {
  return Array.isArray(type) ? type[0] : type
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === 'object' && !Array.isArray(v)
}

function mapType(schema: JsonSchema): FieldType {
  if (schema.enum && schema.enum.length) return 'enum'
  const t = firstType(schema.type)
  if (t === 'object') return 'object'
  if (t === 'array') return 'array'
  if (t === 'boolean') return 'boolean'
  if (t === 'number' || t === 'integer') {
    const fmt = schema.format
    if (fmt === 'timestamp' || fmt === 'unix-time' || fmt === 'epoch' || fmt === 'unix') return 'timestamp'
    return 'number'
  }
  if (t === 'string') {
    const fmt = schema.format
    if (fmt === 'date' || fmt === 'date-time') return 'date'
    if (fmt === 'email') return 'email'
    if (fmt === 'ipv4' || fmt === 'ipv6' || fmt === 'ip') return 'ip'
    if (fmt === 'uuid' || fmt === 'guid') return 'uuid'
    if (fmt === 'uri' || fmt === 'url' || fmt === 'hostname') return 'url'
    return 'string'
  }
  if (schema.properties) return 'object'
  return 'string'
}

function schemaToNode(name: string, schema: JsonSchema): FieldNode {
  const type = mapType(schema)
  const node = createNode(type, name)
  const c = node.constraints

  if (type === 'enum' && schema.enum) {
    c.enumValues = schema.enum.map((v) => String(v))
  }
  if (typeof schema.minLength === 'number') c.minLength = schema.minLength
  if (typeof schema.maxLength === 'number') c.maxLength = schema.maxLength
  if (typeof schema.minimum === 'number') c.min = schema.minimum
  if (typeof schema.maximum === 'number') c.max = schema.maximum
  if (firstType(schema.type) === 'integer') c.decimals = 0
  if (typeof schema.minItems === 'number') c.arrayMin = schema.minItems
  if (typeof schema.maxItems === 'number') c.arrayMax = schema.maxItems

  if (type === 'object' && schema.properties) {
    node.children = Object.entries(schema.properties).map(([key, sub]) => schemaToNode(key, sub))
  }
  if (type === 'array' && schema.items) {
    const items = schema.items
    if (items.properties) {
      node.children = Object.entries(items.properties).map(([key, sub]) => schemaToNode(key, sub))
    } else if (items.type && firstType(items.type) !== 'object') {
      // 数组的基础元素类型收进约束里没有意义，保留单个占位子节点表示元素结构
      node.children = [schemaToNode('item', items)]
    }
  }
  return node
}

/* ---------------- JSON Schema 解析 ---------------- */

function parseSchemaDocument(raw: Record<string, unknown>): FieldNode {
  const schema = raw as unknown as JsonSchema

  const rootType = firstType(schema.type)
  if (rootType === 'array' && schema.items) {
    const root = createNode('array', 'root')
    const itemNode = schemaToNode('item', schema.items)
    root.children = itemNode.type === 'object' ? itemNode.children : [itemNode]
    return root
  }
  if (schema.properties) {
    // 显式声明 type:object → 单对象根；仅有 properties 而无 type（常见记录描述）→ 对象数组根
    const root = createNode(rootType === 'object' ? 'object' : 'array', 'root')
    root.children = Object.entries(schema.properties).map(([key, sub]) => schemaToNode(key, sub))
    return root
  }
  throw new Error('Schema 中未找到可用的 properties 或 items，请检查根节点定义')
}

/** 判断一段已解析的 JSON 是否像 JSON Schema（而非普通数据） */
function looksLikeSchema(raw: unknown): raw is Record<string, unknown> {
  if (!isRecord(raw)) return false
  if ('$schema' in raw || 'properties' in raw) return true
  const t = firstType((raw as JsonSchema).type)
  if (t === 'array' && isRecord(raw.items)) return true
  if ((t === 'object' || t === 'array') && 'properties' in raw) return true
  return false
}

/* ---------------- 普通 JSON 数据推断 ---------------- */

const RE_DATE = /^\d{4}-\d{2}-\d{2}([T ]\d{2}:\d{2}(:\d{2})?)?/
const RE_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const RE_PHONE = /^1[3-9]\d{9}$/
const RE_IP = /^(\d{1,3}\.){3}\d{1,3}$/

function inferScalarType(value: string): FieldType {
  if (RE_DATE.test(value)) return 'date'
  if (RE_EMAIL.test(value)) return 'email'
  if (RE_PHONE.test(value)) return 'phone'
  if (RE_IP.test(value)) return 'ip'
  return 'string'
}

function inferNode(name: string, value: unknown): FieldNode {
  if (Array.isArray(value)) {
    const node = createNode('array', name)
    const first = value.find((v) => v !== null && v !== undefined)
    if (first !== undefined) {
      if (isRecord(first)) node.children = inferChildren(first)
      else node.children = [inferNode('item', first)]
    }
    return node
  }
  if (isRecord(value)) {
    const node = createNode('object', name)
    node.children = inferChildren(value)
    return node
  }
  if (typeof value === 'boolean') return createNode('boolean', name)
  if (typeof value === 'number') return createNode('number', name)
  if (typeof value === 'string') return createNode(inferScalarType(value), name)
  // null / 未知类型按字符串兜底
  return createNode('string', name)
}

function inferChildren(obj: Record<string, unknown>): FieldNode[] {
  return Object.entries(obj).map(([key, v]) => inferNode(key, v))
}

function inferFromData(raw: unknown): FieldNode {
  if (Array.isArray(raw)) {
    const first = raw.find((v) => v !== null && v !== undefined)
    if (first === undefined) throw new Error('数组为空，无法推断字段结构，请至少提供一条数据')
    const root = createNode('array', 'root')
    if (isRecord(first)) root.children = inferChildren(first)
    else root.children = [inferNode('item', first)]
    return root
  }
  if (isRecord(raw)) {
    if (!Object.keys(raw).length) throw new Error('对象为空 {}，无法推断字段结构')
    const root = createNode('object', 'root')
    root.children = inferChildren(raw)
    return root
  }
  throw new Error('请粘贴 JSON 对象 {...} 或数组 [{...}]（当前根为基础类型值）')
}

/* ---------------- 入口：自动识别 Schema / 数据 ---------------- */

export function parseSchemaInput(text: string): SchemaParseResult {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch (e) {
    throw new Error(`JSON 解析失败：${(e as Error).message}`)
  }
  if (raw === null || typeof raw !== 'object') {
    throw new Error('请粘贴 JSON 对象 {...} 或数组 [{...}]')
  }

  if (looksLikeSchema(raw)) {
    const schema = raw as JsonSchema
    return { root: parseSchemaDocument(raw), inferred: false, title: schema.title?.trim() ?? '' }
  }
  return { root: inferFromData(raw), inferred: true, title: '' }
}
