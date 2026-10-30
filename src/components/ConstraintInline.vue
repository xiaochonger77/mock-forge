<script setup lang="ts">
import { computed } from 'vue'
import type { FieldNode, FieldConstraints } from '../types'
import { summarizeConstraints, supportsUnique, inherentlyUnique } from '../types'
import { useAppStore } from '../store/app'

const props = defineProps<{
  node: FieldNode
}>()

defineEmits<{
  close: []
}>()

const store = useAppStore()
const c = computed(() => props.node.constraints)
const summaries = computed(() => summarizeConstraints(props.node))

function patch(p: Partial<FieldConstraints>) {
  store.updateConstraints(props.node, p)
}

function num(e: Event): number | undefined {
  const v = (e.target as HTMLInputElement).value
  return v === '' ? undefined : Number(v)
}

function onEnumValues(e: Event) {
  const text = (e.target as HTMLTextAreaElement).value
  patch({ enumValues: text.split('\n').map((s) => s.trim()).filter(Boolean) })
}

const showLength = computed(() => props.node.type === 'string')
const showNumber = computed(() => props.node.type === 'number')
const showDate = computed(() => props.node.type === 'date')
const showTimestamp = computed(() => props.node.type === 'timestamp')
const showBool = computed(() => props.node.type === 'boolean')
const showArray = computed(() => props.node.type === 'array')
const showEnum = computed(() => props.node.type === 'enum')
const showUuid = computed(() => props.node.type === 'uuid')
const showSerial = computed(() => props.node.type === 'serial')
/** 容器除外；UUID / 序号也允许为 null（外键可空的常见场景） */
const showNullable = computed(() => props.node.type !== 'object' && props.node.type !== 'array')
/** 仅在「值唯一」语义成立的类型上展示 */
const showUnique = computed(() => supportsUnique(props.node.type))
/** UUID / 序号由生成器天然保证唯一，以只读提示替代开关 */
const showInherentUnique = computed(() => inherentlyUnique(props.node.type))
</script>

<template>
  <div class="constraint-panel">
    <!-- 面板头：标题 + 当前规则摘要 + 完成收起 -->
    <div class="panel-head">
      <span class="head-title">
        <svg viewBox="0 0 24 24" width="12" height="12" fill="none">
          <path d="M3 6h11M17 6h4M3 12h4M10 12h11M3 18h13M19 18h2" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
          <circle cx="15.5" cy="6" r="2" stroke="currentColor" stroke-width="1.8"/>
          <circle cx="8.5" cy="12" r="2" stroke="currentColor" stroke-width="1.8"/>
          <circle cx="17.5" cy="18" r="2" stroke="currentColor" stroke-width="1.8"/>
        </svg>
        约束规则
      </span>
      <span v-if="summaries.length" class="head-chips">
        <span v-for="(s, i) in summaries" :key="i" class="summary-chip">{{ s }}</span>
      </span>
      <button class="head-done" @click="$emit('close')">完成</button>
    </div>

    <div class="detail">
      <div v-if="showLength" class="d-row">
        <span class="d-label">长度</span>
        <input type="number" min="0" :value="c.minLength" @change="patch({ minLength: num($event) })" />
        <span class="d-sep">–</span>
        <input type="number" min="0" :value="c.maxLength" @change="patch({ maxLength: num($event) })" />
        <span class="d-hint">字符</span>
      </div>

      <div v-if="showNumber" class="d-row">
        <span class="d-label">范围</span>
        <input type="number" :value="c.min" @change="patch({ min: num($event) })" />
        <span class="d-sep">~</span>
        <input type="number" :value="c.max" @change="patch({ max: num($event) })" />
        <span class="d-label d-ml">小数位</span>
        <input class="narrow" type="number" min="0" max="10" :value="c.decimals" @change="patch({ decimals: num($event) })" />
      </div>

      <div v-if="showDate" class="d-row">
        <span class="d-label">起止</span>
        <input type="date" :value="c.dateStart" @change="patch({ dateStart: ($event.target as HTMLInputElement).value })" />
        <span class="d-sep">→</span>
        <input type="date" :value="c.dateEnd" @change="patch({ dateEnd: ($event.target as HTMLInputElement).value })" />
      </div>

      <div v-if="showTimestamp" class="d-row">
        <span class="d-label">单位</span>
        <select
          class="unit-select"
          :value="c.tsUnit ?? 'ms'"
          @change="patch({ tsUnit: ($event.target as HTMLSelectElement).value as 'ms' | 's' })"
        >
          <option value="ms">毫秒（13 位）</option>
          <option value="s">秒（10 位）</option>
        </select>
        <span class="d-label d-ml">区间</span>
        <input type="date" :value="c.dateStart" @change="patch({ dateStart: ($event.target as HTMLInputElement).value })" />
        <span class="d-sep">→</span>
        <input type="date" :value="c.dateEnd" @change="patch({ dateEnd: ($event.target as HTMLInputElement).value })" />
      </div>

      <div v-if="showBool" class="d-row">
        <span class="d-label">true 概率</span>
        <input class="narrow" type="number" min="0" max="100" :value="c.trueRatio" @change="patch({ trueRatio: num($event) })" />
        <span class="d-hint">%</span>
        <span class="d-hint d-ml2">布尔仅有 true / false 两个取值，不提供「值唯一」</span>
      </div>

      <div v-if="showArray" class="d-row">
        <span class="d-label">元素个数</span>
        <input class="narrow" type="number" min="0" :value="c.arrayMin" @change="patch({ arrayMin: num($event) })" />
        <span class="d-sep">–</span>
        <input class="narrow" type="number" min="0" :value="c.arrayMax" @change="patch({ arrayMax: num($event) })" />
        <span class="d-hint">子节点定义数组元素结构</span>
      </div>

      <div v-if="showEnum" class="d-block">
        <span class="d-label">候选值<em>每行一个 · 候选集合有限，不提供「值唯一」</em></span>
        <textarea rows="4" :value="(c.enumValues || []).join('\n')" @change="onEnumValues"></textarea>
      </div>

      <div v-if="showUuid" class="d-row">
        <span class="d-label">格式</span>
        <label class="switch">
          <input
            type="checkbox"
            :checked="c.uuidHyphens !== false"
            @change="patch({ uuidHyphens: ($event.target as HTMLInputElement).checked })"
          />
          <span>含横线（标准 8-4-4-4-12）</span>
        </label>
        <span v-if="c.uuidHyphens === false" class="d-hint">输出 32 位连续 hex</span>
      </div>

      <div v-if="showSerial" class="d-row">
        <span class="d-label">起始值</span>
        <input class="narrow" type="number" :value="c.seqStart ?? 1" @change="patch({ seqStart: num($event) })" />
        <span class="d-label d-ml">步长</span>
        <input class="narrow" type="number" min="1" :value="c.seqStep ?? 1" @change="patch({ seqStep: num($event) })" />
        <span class="d-hint d-ml2">每行按路径独立递增</span>
      </div>

      <div v-if="showInherentUnique" class="d-row">
        <span class="lock-chip">
          <svg viewBox="0 0 24 24" width="11" height="11" fill="none">
            <rect x="5.5" y="10.5" width="13" height="9" rx="2" stroke="currentColor" stroke-width="1.7" />
            <path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5" stroke="currentColor" stroke-width="1.7" />
          </svg>
          天然全局唯一，生成器自动保证
        </span>
      </div>

      <div v-if="showNullable || showUnique" class="d-toggles">
        <label v-if="showNullable" class="switch">
          <input type="checkbox" :checked="!!c.nullable" @change="patch({ nullable: ($event.target as HTMLInputElement).checked })" />
          <span>允许为 null（约 10% 概率）</span>
        </label>
        <label v-if="showUnique" class="switch">
          <input type="checkbox" :checked="!!c.unique" @change="patch({ unique: ($event.target as HTMLInputElement).checked })" />
          <span>值唯一（跨整批数据不重复）</span>
        </label>
      </div>
    </div>
  </div>
</template>

<style scoped>
.constraint-panel {
  animation: detail-in 0.16s ease;
}

@keyframes detail-in {
  from {
    opacity: 0;
    transform: translateY(-3px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

/* 面板头：极低调的附属标题行，视觉权重远低于字段主行 */
.panel-head {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 2px 4px;
}

.head-title {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 10.5px;
  font-weight: 600;
  letter-spacing: 0.4px;
  color: var(--text-placeholder);
  white-space: nowrap;
}

.head-chips {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  flex-wrap: wrap;
  min-width: 0;
}

.summary-chip {
  padding: 1px 7px;
  border-radius: 20px;
  background: rgba(79, 141, 255, 0.14);
  border: 1px solid rgba(79, 141, 255, 0.26);
  color: #8fb6f5;
  font-size: 10px;
  white-space: nowrap;
}

.head-done {
  margin-left: auto;
  padding: 2px 10px;
  font-size: 10.5px;
  color: var(--text-secondary);
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 6px;
  flex-shrink: 0;
}

.head-done:hover {
  color: var(--text-primary);
  background: rgba(255, 255, 255, 0.1);
}

.detail {
  padding: 10px 12px;
  border-radius: 9px;
  background: rgba(5, 9, 20, 0.35);
  border: 1px solid rgba(255, 255, 255, 0.07);
  display: flex;
  flex-direction: column;
  gap: 9px;
}

.d-row {
  display: flex;
  align-items: center;
  gap: 7px;
  flex-wrap: wrap;
}

.d-block {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.d-label {
  font-size: 11.5px;
  color: var(--text-secondary);
  white-space: nowrap;
}

.d-label em {
  font-style: normal;
  color: var(--text-placeholder);
  margin-left: 7px;
  font-size: 10.5px;
}

.d-ml {
  margin-left: 8px;
}

.d-ml2 {
  margin-left: 4px;
}

.d-sep {
  color: var(--text-placeholder);
  font-size: 11px;
}

.d-hint {
  font-size: 10.5px;
  color: var(--text-placeholder);
}

.detail input[type='number'] {
  width: 78px;
  padding: 4px 8px;
  font-size: 11.5px;
}

.detail input.narrow {
  width: 58px;
}

.detail input[type='date'] {
  width: 128px;
  padding: 4px 8px;
  font-size: 11.5px;
}

.detail select.unit-select {
  width: 118px;
  padding: 4px 8px;
  font-size: 11.5px;
}

.detail textarea {
  resize: vertical;
  font-family: var(--font-mono);
  font-size: 11.5px;
  line-height: 1.7;
  padding: 7px 9px;
}

.d-toggles {
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
}

.switch {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  font-size: 11.5px;
  color: var(--text-primary);
  cursor: pointer;
}

.switch input {
  width: 14px;
  height: 14px;
  accent-color: var(--color-primary);
  box-shadow: none;
}

/* 天然唯一的只读提示（UUID / 序号） */
.lock-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 3px 10px;
  border-radius: 20px;
  font-size: 10.5px;
  color: #b9cdff;
  background: rgba(79, 141, 255, 0.12);
  border: 1px solid rgba(79, 141, 255, 0.28);
  white-space: nowrap;
}
</style>
