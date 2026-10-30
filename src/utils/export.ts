import type { FieldNode, FieldType } from '../types'

export type Row = Record<string, unknown>

export interface ColMeta {
  /** 扁平化后的 key，如 address.city */
  key: string
  /** 层级路径 */
  segments: string[]
  type: FieldType
}

export function flattenRow(obj: Record<string, unknown>, prefix = '', out: Record<string, unknown> = {}): Record<string, unknown> {
  for (const [key, value] of Object.entries(obj)) {
    const flatKey = prefix ? `${prefix}.${key}` : key
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      flattenRow(value as Record<string, unknown>, flatKey, out)
    } else {
      out[flatKey] = value
    }
  }
  return out
}

/**
 * 基于结构树推导表格列：对象递归展开，数组作为叶子列（紧凑展示）。
 * 相比从数据采样，结构树能保证列顺序稳定、类型可知。
 */
export function collectSchemaColumns(root: FieldNode): ColMeta[] {
  const cols: ColMeta[] = []
  const walk = (node: FieldNode, path: string[]) => {
    for (const child of node.children) {
      const next = [...path, child.name]
      if (child.type === 'object') {
        walk(child, next)
      } else {
        cols.push({ key: next.join('.'), segments: next, type: child.type })
      }
    }
  }
  walk(root, [])
  return cols
}

/** 结构树无叶子节点时，从数据采样兜底 */
export function columnsFromRows(rows: Row[]): ColMeta[] {
  return collectColumns(rows).map((key) => ({
    key,
    segments: key.split('.'),
    type: 'string' as FieldType,
  }))
}

export function collectColumns(rows: Row[]): string[] {
  const cols: string[] = []
  const seen = new Set<string>()
  for (const row of rows) {
    for (const key of Object.keys(flattenRow(row))) {
      if (!seen.has(key)) {
        seen.add(key)
        cols.push(key)
      }
    }
  }
  return cols
}

export function toJson(rows: Row[]): string {
  return JSON.stringify(rows, null, 2)
}

/** 单对象形态：输出第一个对象，而非数组包裹 */
export function toJsonObject(rows: Row[]): string {
  return JSON.stringify(rows[0] ?? {}, null, 2)
}

function csvEscape(value: unknown): string {
  if (value === null || value === undefined) return ''
  const s = String(value)
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export function toCsv(rows: Row[]): string {
  const columns = collectColumns(rows)
  const lines = [columns.map(csvEscape).join(',')]
  for (const row of rows) {
    const flat = flattenRow(row)
    lines.push(columns.map((col) => csvEscape(flat[col])).join(','))
  }
  return lines.join('\n')
}

function sqlValue(value: unknown): string {
  if (value === null || value === undefined) return 'NULL'
  if (typeof value === 'number') return String(value)
  if (typeof value === 'boolean') return value ? '1' : '0'
  if (typeof value === 'object') return `'${JSON.stringify(value).replace(/'/g, "''")}'`
  return `'${String(value).replace(/'/g, "''")}'`
}

export function toSql(rows: Row[], tableName: string): string {
  const columns = collectColumns(rows)
  const table = tableName.replace(/[^A-Za-z0-9_$]/g, '') || 'mock_data'
  const stmts = rows.map((row) => {
    const flat = flattenRow(row)
    const values = columns.map((col) => sqlValue(flat[col])).join(', ')
    return `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${values});`
  })
  return stmts.join('\n')
}
