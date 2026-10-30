<script setup lang="ts">
import { computed } from 'vue'
import type { FieldNode, FieldType } from '../types'
import { TYPE_MAP, isNumericType } from '../types'
import {
  flattenRow,
  collectSchemaColumns,
  columnsFromRows,
  type Row,
  type ColMeta,
} from '../utils/export'

const props = defineProps<{
  rows: Row[]
  root: FieldNode
  total: number
}>()

/** 以结构树列为主序，数据中出现但树未定义的 key 追加到末尾兜底 */
const columns = computed<ColMeta[]>(() => {
  const schemaCols = collectSchemaColumns(props.root)
  if (!schemaCols.length) return columnsFromRows(props.rows)
  const known = new Set(schemaCols.map((c) => c.key))
  const extra: ColMeta[] = []
  for (const row of props.rows.slice(0, 20)) {
    for (const key of Object.keys(flattenRow(row))) {
      if (!known.has(key)) {
        known.add(key)
        extra.push({ key, segments: key.split('.'), type: 'string' })
      }
    }
  }
  return [...schemaCols, ...extra]
})

const flatRows = computed(() => props.rows.map((r) => flattenRow(r)))

function typeColor(type: FieldType): string {
  return TYPE_MAP[type]?.color ?? '#94A3B8'
}

function typeShort(type: FieldType): string {
  return TYPE_MAP[type]?.short ?? ''
}

function typeLabel(type: FieldType): string {
  return TYPE_MAP[type]?.label ?? type
}

const COL_WIDTH: Partial<Record<FieldType, number>> = {
  number: 100,
  boolean: 76,
  date: 158,
  timestamp: 162,
  serial: 92,
  uuid: 232,
  url: 210,
  name: 96,
  username: 142,
  phone: 128,
  email: 190,
  address: 210,
  idcard: 158,
  ip: 128,
  enum: 112,
  array: 92,
  string: 150,
}

interface CellView {
  text: string
  cls: string
  title: string
}

function viewCell(value: unknown, type: FieldType): CellView {
  if (value === null || value === undefined) {
    return { text: 'null', cls: 'v-null', title: '空值' }
  }
  if (typeof value === 'boolean') {
    return { text: value ? 'true' : 'false', cls: value ? 'v-true' : 'v-false', title: value ? '布尔 · 真' : '布尔 · 假' }
  }
  if (Array.isArray(value)) {
    return { text: `[ ${value.length} 项 ]`, cls: 'v-array', title: JSON.stringify(value, null, 2) }
  }
  if (typeof value === 'number') {
    return { text: String(value), cls: 'v-number', title: `${TYPE_MAP[type]?.label ?? '数字'}：${value}` }
  }
  if (typeof value === 'object') {
    const json = JSON.stringify(value)
    return { text: json, cls: 'v-object', title: json }
  }
  return { text: String(value), cls: type === 'date' ? 'v-date' : 'v-string', title: String(value) }
}

/** 单元格文字使用所属类型的主题色（null / 布尔 / 数组有独立语义色，通用字符串保持中性） */
function cellColor(value: unknown, type: FieldType): string | undefined {
  if (value === null || value === undefined) return undefined
  if (typeof value === 'boolean' || Array.isArray(value) || typeof value === 'object') return undefined
  if (type === 'string') return undefined
  return TYPE_MAP[type]?.color
}
</script>

<template>
  <div class="grid-host">
    <div class="grid-scroll">
      <table>
        <thead>
          <tr>
            <th class="col-index">#</th>
            <th
              v-for="col in columns"
              :key="col.key"
              class="col-head"
              :style="{ minWidth: `${COL_WIDTH[col.type] ?? 130}px` }"
            >
              <div class="th-main">
                <span
                  class="th-tag"
                  :style="{ color: typeColor(col.type), borderColor: `${typeColor(col.type)}55`, background: `${typeColor(col.type)}1a` }"
                  :title="typeLabel(col.type)"
                >{{ typeShort(col.type) }}</span>
                <span class="th-name" :title="col.key">{{ col.segments[col.segments.length - 1] }}</span>
              </div>
              <div v-if="col.segments.length > 1" class="th-path">{{ col.segments.slice(0, -1).join(' . ') }}</div>
            </th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(flat, i) in flatRows" :key="i">
            <td class="col-index">{{ i + 1 }}</td>
            <td
              v-for="col in columns"
              :key="col.key"
              class="cell"
              :class="[viewCell(flat[col.key], col.type).cls, { 'num-align': isNumericType(col.type) }]"
              :style="{ color: cellColor(flat[col.key], col.type) }"
              :title="viewCell(flat[col.key], col.type).title"
            >
              <span class="cell-text">{{ viewCell(flat[col.key], col.type).text }}</span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
    <div class="grid-footer">
      <span class="foot-item">
        <span class="foot-dot"></span>
        预览 <b>{{ rows.length }}</b> 条<template v-if="total > rows.length"> · 共 {{ total }} 条（导出包含全部）</template>
      </span>
      <span class="foot-item muted">{{ columns.length }} 个字段</span>
    </div>
  </div>
</template>

<style scoped>
.grid-host {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.grid-scroll {
  flex: 1;
  min-height: 0;
  overflow: auto;
}

table {
  border-collapse: separate;
  border-spacing: 0;
  width: 100%;
  font-family: var(--font-mono);
  font-size: 11.5px;
}

thead th {
  position: sticky;
  top: 0;
  z-index: 2;
  background: rgba(9, 14, 30, 0.92);
  backdrop-filter: blur(14px);
  -webkit-backdrop-filter: blur(14px);
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  text-align: left;
  padding: 8px 12px;
  vertical-align: middle;
  white-space: nowrap;
}

thead tr :first-child {
  border-top-left-radius: 0;
}

.col-index {
  width: 46px;
  min-width: 46px;
  text-align: right !important;
  color: var(--text-placeholder);
  font-weight: 500;
  padding-right: 10px;
}

tbody .col-index {
  text-align: right;
  padding-right: 10px;
  user-select: none;
}

.th-main {
  display: flex;
  align-items: center;
  gap: 7px;
}

.th-tag {
  font-size: 9.5px;
  font-weight: 700;
  letter-spacing: 0.3px;
  padding: 1px 5px;
  border-radius: 4px;
  border: 1px solid;
  flex-shrink: 0;
  line-height: 1.5;
}

.th-name {
  color: var(--text-primary);
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
}

.th-path {
  margin-top: 2px;
  padding-left: 2px;
  font-size: 9.5px;
  color: var(--text-placeholder);
  font-weight: 400;
  overflow: hidden;
  text-overflow: ellipsis;
}

tbody td {
  padding: 6px 12px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.045);
  vertical-align: middle;
  max-width: 260px;
}

tbody tr:nth-child(even) {
  background: rgba(255, 255, 255, 0.018);
}

tbody tr:hover {
  background: rgba(79, 141, 255, 0.07);
}

.cell {
  color: #d5e0f5;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 260px;
}

.cell-text {
  display: inline;
}

.num-align {
  text-align: right;
  font-variant-numeric: tabular-nums;
}

/* 数字 / 日期等单元格颜色由所属类型主题色（内联）驱动，此处只保留数字排版 */
.v-number {
  font-variant-numeric: tabular-nums;
}

.v-date,
.v-string {
  color: #d5e0f5;
}

.v-null {
  color: var(--text-placeholder);
  font-style: italic;
  font-family: var(--font-ui);
}

.v-object {
  color: var(--text-secondary);
}

.cell.v-array .cell-text {
  display: inline-block;
  color: #c4b5fd;
  background: rgba(167, 139, 250, 0.12);
  border: 1px solid rgba(167, 139, 250, 0.25);
  border-radius: 5px;
  padding: 1px 8px;
  font-size: 10.5px;
}

.cell.v-true {
  color: #34d399;
  font-weight: 700;
}

.cell.v-false {
  color: #fb7185;
  font-weight: 700;
}

.cell.v-true::before,
.cell.v-false::before {
  content: '';
  display: inline-block;
  width: 5px;
  height: 5px;
  border-radius: 50%;
  margin-right: 6px;
  vertical-align: 1px;
  background: currentColor;
  box-shadow: 0 0 6px currentColor;
}

.grid-footer {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 7px 14px;
  border-top: 1px solid var(--divider);
  background: rgba(5, 9, 20, 0.3);
  font-size: 11px;
  color: var(--text-secondary);
}

.foot-item {
  display: inline-flex;
  align-items: center;
  gap: 7px;
}

.foot-item b {
  color: var(--text-primary);
  font-weight: 700;
}

.foot-item.muted {
  color: var(--text-placeholder);
}

.foot-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--color-success);
  box-shadow: 0 0 7px var(--color-success);
}
</style>
