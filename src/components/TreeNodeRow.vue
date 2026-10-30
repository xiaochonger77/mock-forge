<script lang="ts">
import { reactive } from 'vue'

/** 跨行共享的拖拽状态（模块级：同一棵树内所有 TreeNodeRow 实例读写同一份落点信息） */
const dragState = reactive({
  id: null as string | null,
  overId: null as string | null,
  where: 'before' as 'before' | 'after' | 'inside',
})
</script>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import type { FieldNode, FieldType } from '../types'
import { TYPE_GROUPS, TYPE_MAP, canHaveChildren, summarizeConstraints } from '../types'
import { isDescendant } from '../utils/generator'
import { useAppStore } from '../store/app'
import ConstraintInline from './ConstraintInline.vue'

const props = defineProps<{
  node: FieldNode
  depth: number
  errors: Record<string, string>
  locked: boolean
}>()

const store = useAppStore()
const state = store.state
const constraintOpen = ref(false)
const rowEl = ref<HTMLElement | null>(null)
const flashing = ref(false)
let flashTimer: ReturnType<typeof setTimeout> | null = null

const typeInfo = computed(() => TYPE_MAP[props.node.type])
const typeColor = computed(() => typeInfo.value.color)
const allowChildren = computed(() => canHaveChildren(props.node.type))
const isRoot = computed(() => props.depth === 0)
const error = computed(() => props.errors[props.node.id] ?? '')
// 根节点即输出根：不展示字段级约束；根数组的长度由「生成数量」决定，而非 arrayMin/Max
const showConstraint = computed(() => !isRoot.value && props.node.type !== 'object')
/** 已配置的约束摘要；为空说明该字段保持默认生成规则 */
const constraintSummary = computed(() =>
  showConstraint.value ? summarizeConstraints(props.node) : [],
)
const hasConstraint = computed(() => constraintSummary.value.length > 0)
const constraintTitle = computed(() =>
  hasConstraint.value
    ? `约束：${constraintSummary.value.join(' · ')}（点击修改）`
    : '配置约束规则（范围 / 长度 / 枚举 / 可空…）',
)

// 节点被折叠时，附属的约束面板一并收起，避免折叠后留下孤立面板
watch(
  () => props.node.collapsed,
  (collapsed) => {
    if (collapsed) constraintOpen.value = false
  },
)

/** 根节点当前输出形态的说明文案 */
const rootTypeTitle = computed(() =>
  props.node.type === 'array'
    ? '输出形态：对象数组 [{...}, {...}]，条数由右侧「生成数量」决定'
    : '输出形态：单个 JSON 对象 {...}，固定生成 1 条',
)

function subtreeHasError(node: FieldNode): boolean {
  return !!props.errors[node.id] || node.children.some(subtreeHasError)
}

const branchError = computed(() => subtreeHasError(props.node))

/* ---------------- 选中 / 搜索高亮 / 聚焦滚动 ---------------- */

const isSelected = computed(() => state.selectedNodeId === props.node.id)
const isSearching = computed(() => !!state.searchQuery.trim())
const matchIndex = computed(() =>
  store.searchMatches.value.findIndex((m) => m.id === props.node.id),
)
const isMatch = computed(() => matchIndex.value >= 0)
const isActiveMatch = computed(
  () => isMatch.value && matchIndex.value === state.activeMatchIndex,
)
const isMatchAncestor = computed(() => store.matchAncestorIds.value.has(props.node.id))
/** 搜索态下，非命中且非命中祖先的行弱化，突出结果 */
const isDimmed = computed(() => isSearching.value && !isMatch.value && !isMatchAncestor.value)
const isDragging = computed(() => dragState.id === props.node.id)
const dropWhere = computed(() => (dragState.overId === props.node.id ? dragState.where : null))

// focusTick 每次递增代表一次「定位到此节点」请求：平滑滚入视口中央 + 闪烁强调
watch(
  () => state.focusTick,
  () => {
    if (state.focusNodeId !== props.node.id || !rowEl.value) return
    rowEl.value.scrollIntoView({ behavior: 'smooth', block: 'center' })
    flashing.value = true
    if (flashTimer) clearTimeout(flashTimer)
    flashTimer = setTimeout(() => (flashing.value = false), 1800)
  },
)

function onRowClick(e: MouseEvent) {
  const target = e.target as HTMLElement
  // 点到交互控件时不抢选中（名称框聚焦、下拉、按钮各自处理）
  if (target.closest('button, input, select, textarea, a')) return
  store.selectNode(props.node.id)
}

/* ---------------- 跨级拖拽排序 ---------------- */

/** 合法落点：非自身、且目标不在被拖节点的子树内（避免成环） */
function isAllowedTarget(dragId: string): boolean {
  if (dragId === props.node.id) return false
  return !isDescendant(state.tree, dragId, props.node.id)
}

function onDragStart(e: DragEvent) {
  if (props.locked || !e.dataTransfer) return
  dragState.id = props.node.id
  dragState.overId = null
  e.dataTransfer.effectAllowed = 'move'
  e.dataTransfer.setData('text/plain', props.node.id)
  // 拖拽影像用整行而非小小的手柄，落点关系一目了然
  if (rowEl.value) e.dataTransfer.setDragImage(rowEl.value, 24, 20)
}

/** 行内三分区：上 30% before、中 40% inside（可容纳子节点时）、下 30% after */
function resolveWhere(y: number, h: number): 'before' | 'after' | 'inside' {
  const canInside = canHaveChildren(props.node.type)
  if (canInside && y > h * 0.3 && y < h * 0.7) return 'inside'
  return y < h / 2 ? 'before' : 'after'
}

function onDragOver(e: DragEvent) {
  if (!dragState.id || props.locked) return
  if (!isAllowedTarget(dragState.id)) return
  e.preventDefault()
  if (e.dataTransfer) e.dataTransfer.dropEffect = 'move'
  const rect = rowEl.value?.getBoundingClientRect()
  if (!rect) return
  dragState.overId = props.node.id
  dragState.where = resolveWhere(e.clientY - rect.top, rect.height)
}

function onDrop(e: DragEvent) {
  e.preventDefault()
  const dragId = dragState.id
  const where = dragState.where
  resetDrag()
  if (dragId) store.moveNode(dragId, props.node.id, where)
}

/* ---- 根节点落点：拖入根头部 = 成为顶层字段 ---- */

function onDragOverRoot(e: DragEvent) {
  if (!dragState.id || props.locked) return
  if (dragState.id === props.node.id || isDescendant(state.tree, dragState.id, props.node.id)) return
  e.preventDefault()
  if (e.dataTransfer) e.dataTransfer.dropEffect = 'move'
  dragState.overId = props.node.id
  dragState.where = 'inside'
}

function onDropRoot(e: DragEvent) {
  e.preventDefault()
  const dragId = dragState.id
  resetDrag()
  if (dragId) store.moveNode(dragId, props.node.id, 'inside')
}

function resetDrag() {
  dragState.id = null
  dragState.overId = null
}

function onNameInput(e: Event) {
  store.renameNode(props.node, (e.target as HTMLInputElement).value)
}

function onTypeChange(e: Event) {
  store.changeType(props.node, (e.target as HTMLSelectElement).value as FieldType)
}

/** 根节点专属：在两种输出形态间切换（分段开关，非字段类型下拉） */
function setRootType(type: 'array' | 'object') {
  if (!props.locked && props.node.type !== type) store.changeType(props.node, type)
}

/** 删除节点：统一走全局确认弹窗（居中不被裁切，点遮罩 / Esc 均可取消，操作可 ⌘Z 撤销） */
async function onDeleteClick() {
  if (props.locked) return
  const childCount = props.node.children.length
  const label = props.node.name || '未命名'
  const message = childCount
    ? `将同时删除其下 ${childCount} 个子节点，此操作可用 ⌘/Ctrl+Z 撤销。`
    : '此操作可用 ⌘/Ctrl+Z 撤销。'
  const ok = await store.confirmDialog(`删除字段「${label}」`, message, '删除')
  if (ok) store.removeNode(props.node.id)
}
</script>

<template>
  <div class="tree-node" :data-depth="depth">
    <!-- ============ 根节点：输出容器头（全局形态控制，形态上独立于字段行） ============ -->
    <template v-if="isRoot">
      <div
        class="root-header"
        :class="{ 'is-collapsed': node.collapsed, 'is-drop-inside': dropWhere === 'inside' }"
        @dragover="onDragOverRoot"
        @drop="onDropRoot"
      >
        <button
          class="root-arrow"
          :disabled="locked"
          @click="store.toggleCollapse(node)"
          :title="node.collapsed ? '展开字段区' : '收起字段区'"
        >
          <svg
            viewBox="0 0 24 24"
            width="10"
            height="10"
            fill="none"
            class="chev"
            :class="{ collapsed: node.collapsed }"
          >
            <path d="M6 9l6 6 6-6" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
        </button>

        <span class="root-glyph">
          <svg viewBox="0 0 24 24" width="15" height="15" fill="none">
            <path d="M8 4 4.5 7.5 8 11M16 4l3.5 3.5L16 11" stroke="white" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" />
            <path d="M13.5 4 10.5 20" stroke="white" stroke-width="1.9" stroke-linecap="round" opacity="0.75" />
          </svg>
        </span>

        <div class="root-id">
          <span class="root-id-name">
            root
            <svg class="root-lock" viewBox="0 0 24 24" width="10" height="10" fill="none">
              <rect x="5.5" y="10.5" width="13" height="9" rx="2" stroke="currentColor" stroke-width="1.7" />
              <path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5" stroke="currentColor" stroke-width="1.7" />
            </svg>
          </span>
          <span class="root-id-sub">输出根节点 · 固定</span>
        </div>

        <span v-if="branchError && node.collapsed" class="error-dot root-err" title="字段区中存在非法配置">⚠</span>

        <!-- 输出形态：两段式分段开关（与字段类型下拉是两种控件，语义层级不冲突） -->
        <div class="root-switch" role="group" aria-label="输出形态" :title="rootTypeTitle" :data-disabled="locked">
          <span class="switch-caption">输出形态</span>
          <div class="root-seg">
            <button
              type="button"
              :class="{ on: node.type === 'array' }"
              :disabled="locked"
              title="对象数组 [{...}, {...}]，条数由右侧「生成数量」决定"
              @click="setRootType('array')"
            >
              <code>[{…}]</code>对象数组
            </button>
            <button
              type="button"
              :class="{ on: node.type === 'object' }"
              :disabled="locked"
              title="单个 JSON 对象 {...}，固定生成 1 条"
              @click="setRootType('object')"
            >
              <code>{…}</code>单对象
            </button>
          </div>
        </div>

        <button
          class="pill root-add"
          :disabled="locked || !allowChildren"
          title="在根节点下添加一个字段"
          @click="store.addChild(node.id)"
        >
          ＋ 添加字段
        </button>
      </div>

      <!-- 字段区：分区标注 + 缩进的字段树，明确「容器配置 / 容器内容」两层 -->
      <template v-if="!node.collapsed">
        <div class="fields-zone">
          <span class="zone-name">字段结构</span>
          <span v-if="node.children.length" class="zone-count">{{ node.children.length }}</span>
        </div>
        <div
          v-if="node.children.length"
          class="node-children root-children"
          :style="{ '--guide-left': '23px', '--elbow-w': '34px' }"
        >
          <TreeNodeRow
            v-for="child in node.children"
            :key="child.id"
            :node="child"
            :depth="depth + 1"
            :errors="errors"
            :locked="locked"
          />
        </div>
        <div v-else class="fields-empty">暂无字段，点击右上角「＋ 添加字段」开始定义</div>
      </template>
    </template>

    <!-- ============ 普通字段节点 ============ -->
    <template v-else>
      <div
        ref="rowEl"
        class="node-row"
        :class="{
          'has-error': !!error,
          'is-selected': isSelected,
          'is-match': isMatch,
          'is-match-active': isActiveMatch,
          'is-dimmed': isDimmed,
          'is-dragging': isDragging,
          'is-flash': flashing,
          'is-drop-inside': dropWhere === 'inside',
        }"
        :style="{
          paddingLeft: `${depth * 28 + 8}px`,
          '--type-color': typeColor,
        }"
        @click="onRowClick"
        @dragstart="onDragStart"
        @dragover="onDragOver"
        @drop="onDrop"
        @dragend="resetDrag"
      >
        <!-- 同级拖拽手柄：所有字段行保留等宽槽位（仅 hover 显现），行几何不发生偏移 -->
        <span
          class="drag-grip"
          draggable="true"
          :title="locked ? '' : '拖拽以调整同级顺序'"
        >
          <svg viewBox="0 0 10 14" width="10" height="14" fill="currentColor" aria-hidden="true">
            <circle cx="2.2" cy="2.5" r="1.15" /><circle cx="7.8" cy="2.5" r="1.15" />
            <circle cx="2.2" cy="7" r="1.15" /><circle cx="7.8" cy="7" r="1.15" />
            <circle cx="2.2" cy="11.5" r="1.15" /><circle cx="7.8" cy="11.5" r="1.15" />
          </svg>
        </span>

        <button
          v-if="node.children.length || allowChildren"
          class="icon-btn arrow"
          :disabled="locked"
          @click="store.toggleCollapse(node)"
          :title="node.collapsed ? '展开子节点' : '收起子节点'"
        >
          <svg
            viewBox="0 0 24 24"
            width="9"
            height="9"
            fill="none"
            :class="{ collapsed: node.collapsed }"
            class="chev"
          >
            <path d="M6 9l6 6 6-6" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
        </button>
        <span v-else class="arrow-placeholder"></span>

        <!-- 拖拽落点指示线（仅同一起父级时出现） -->
        <span v-if="dropWhere === 'before'" class="drop-line drop-before"></span>
        <span v-if="dropWhere === 'after'" class="drop-line drop-after"></span>

        <span
          class="type-badge"
          :title="typeInfo.label"
          :style="{ color: typeColor, background: `${typeColor}1f`, borderColor: `${typeColor}55` }"
        >
          {{ typeInfo.short }}
        </span>

        <input
          class="name-input"
          :class="{ 'error-input': !!error }"
          :value="node.name"
          :disabled="locked"
          placeholder="字段名"
          spellcheck="false"
          @input="onNameInput"
          @focus="store.beginEdit()"
          @change="store.endEdit()"
          @blur="store.endEdit()"
        />

        <select class="type-select" :value="node.type" :disabled="locked" @change="onTypeChange">
          <optgroup v-for="g in TYPE_GROUPS" :key="g.group" :label="g.label">
            <option v-for="t in g.types" :key="t.value" :value="t.value">{{ t.label }} · {{ t.value }}</option>
          </optgroup>
        </select>

        <button
          class="pill add-btn"
          :disabled="locked || !allowChildren"
          :title="allowChildren ? '新增子节点' : '该类型不能包含子节点'"
          @click="store.addChild(node.id)"
        >
          ＋ 子节点
        </button>

        <!-- 约束：附属功能，默认退行为低调图标；已配置规则时蓝点亮起并常驻高亮 -->
        <button
          v-if="showConstraint"
          class="icon-btn constraint-btn"
          :class="{ active: constraintOpen || hasConstraint }"
          :disabled="locked"
          :title="constraintTitle"
          @click="constraintOpen = !constraintOpen"
        >
          <svg viewBox="0 0 24 24" width="13" height="13" fill="none">
            <path d="M3 6h11M17 6h4M3 12h4M10 12h11M3 18h13M19 18h2" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/>
            <circle cx="15.5" cy="6" r="2.1" stroke="currentColor" stroke-width="1.9"/>
            <circle cx="8.5" cy="12" r="2.1" stroke="currentColor" stroke-width="1.9"/>
            <circle cx="17.5" cy="18" r="2.1" stroke="currentColor" stroke-width="1.9"/>
          </svg>
          <span v-if="hasConstraint" class="constraint-dot"></span>
        </button>
        <!-- 对象类型无字段级约束：用等宽占位保持行几何一致，
             否则 flex:1 的名称框会吞掉这 28px+gap，把类型胶囊和右侧按钮整体顶右 -->
        <span v-else class="action-slot" aria-hidden="true"></span>

        <button class="pill del-btn" :disabled="locked" title="删除此节点" @click="onDeleteClick">
          ✕
        </button>

        <span v-if="error" class="error-tip" :title="error">⚠ {{ error }}</span>
        <span v-else-if="branchError && node.collapsed" class="error-dot" title="子树中存在非法配置">⚠</span>
      </div>

      <!-- 字段约束：仅在主动展开时出现的附属面板，不常驻占用行高 -->
      <div
        v-if="showConstraint && constraintOpen"
        class="constraint-slot"
        :style="{ paddingLeft: `${depth * 28 + 65}px`, paddingRight: '8px' }"
      >
        <ConstraintInline :node="node" @close="constraintOpen = false" />
      </div>

      <div
        v-if="!node.collapsed && node.children.length"
        class="node-children"
        :style="{ '--guide-left': `${depth * 28 + 38}px`, '--elbow-w': '19px' }"
      >
        <TreeNodeRow
          v-for="child in node.children"
          :key="child.id"
          :node="child"
          :depth="depth + 1"
          :errors="errors"
          :locked="locked"
        />
      </div>
    </template>
  </div>
</template>

<style scoped>
.tree-node {
  position: relative;
  /* 新增节点时轻柔淡入（节点按 id 复用，仅真正新增的节点会播放） */
  animation: node-in 0.28s ease both;
}

@keyframes node-in {
  from {
    opacity: 0;
    transform: translateY(-4px);
  }
  to {
    opacity: 1;
    transform: none;
  }
}

.node-row {
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 5px 8px;
  margin: 2px 0;
  min-height: 38px;
  border-radius: var(--radius-control);
  position: relative;
  border: 1px solid transparent;
  transition: background 0.14s ease, border-color 0.14s ease, box-shadow 0.14s ease, transform 0.14s ease;
}

/* 悬停节点：整体轻微右移并泛起类型色微光 */
.node-row:hover {
  transform: translateX(3px);
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--type-color) 45%, transparent),
    0 0 14px -4px color-mix(in srgb, var(--type-color) 55%, transparent);
}

/* 类型色条：左缘 3px 强调，一眼区分 Object / Array / 基础类型 */
.node-row::before {
  content: '';
  position: absolute;
  left: 2px;
  top: 7px;
  bottom: 7px;
  width: 3px;
  border-radius: 2px;
  background: var(--type-color, transparent);
  opacity: 0.55;
}

.node-row:hover {
  background: color-mix(in srgb, var(--type-color) 12%, rgba(255, 255, 255, 0.03));
}

.node-row:hover::before {
  opacity: 1;
}

.node-row.has-error {
  background: rgba(248, 113, 113, 0.09);
  border-color: rgba(248, 113, 113, 0.3);
}

/* 关键对齐：重置 .icon-btn 的 min-width:26px / padding:0 8px，
   否则对象/数组行（按钮）比叶子行（18px 占位 span）宽出 8px，整行内容右移、与同级错位 */
.arrow {
  width: 18px;
  min-width: 0;
  height: 18px;
  padding: 0;
  color: var(--text-secondary);
  flex-shrink: 0;
}

.chev {
  transition: transform 0.16s ease;
}

.chev.collapsed {
  transform: rotate(-90deg);
}

.arrow-placeholder {
  width: 18px;
  flex-shrink: 0;
}

/* ---------------- 拖拽手柄 ---------------- */

.drag-grip {
  width: 14px;
  flex-shrink: 0;
  height: 20px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--text-placeholder);
  opacity: 0;
  cursor: grab;
  border-radius: 5px;
  transition: opacity 0.15s ease, color 0.15s ease, background 0.15s ease;
}

.node-row:hover .drag-grip {
  opacity: 0.65;
}

.drag-grip:hover {
  opacity: 1 !important;
  color: var(--text-primary);
  background: rgba(255, 255, 255, 0.07);
}

.drag-grip:active {
  cursor: grabbing;
}

.node-row.is-dragging {
  opacity: 0.4;
}

/* 落点指示线：贴在行上下缘的冷光蓝线 + 端头圆点 */
.drop-line {
  position: absolute;
  left: 10px;
  right: 10px;
  height: 2px;
  border-radius: 2px;
  background: linear-gradient(90deg, #5a97ff, #8fb6f5);
  box-shadow: 0 0 8px rgba(90, 151, 255, 0.9);
  pointer-events: none;
  z-index: 5;
}

.drop-line::before {
  content: '';
  position: absolute;
  left: -3px;
  top: 50%;
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: #8fb6f5;
  box-shadow: 0 0 8px rgba(90, 151, 255, 1);
  transform: translateY(-50%);
}

.drop-before {
  top: -3px;
}

.drop-after {
  bottom: -3px;
}

/* inside 落点：整行以类型色描边 + 外发光，明确表达「将成为该节点的子节点」，
   与 before/after 的蓝色横线在视觉上彻底区分 */
.node-row.is-drop-inside {
  background: color-mix(in srgb, var(--type-color) 22%, rgba(90, 151, 255, 0.06));
  border-color: var(--type-color);
  box-shadow:
    0 0 0 1.5px var(--type-color),
    0 0 18px -3px color-mix(in srgb, var(--type-color) 70%, transparent);
}

.root-header.is-drop-inside {
  border-color: #8fb6f5;
  box-shadow:
    0 0 0 2px rgba(143, 182, 245, 0.6),
    0 0 24px -4px rgba(90, 151, 255, 0.7);
}

/* ---------------- 选中 / 搜索命中 / 聚焦闪烁 ---------------- */

.node-row.is-selected {
  background: color-mix(in srgb, var(--type-color) 14%, rgba(79, 141, 255, 0.1));
  border-color: color-mix(in srgb, var(--type-color) 42%, transparent);
}

.node-row.is-match:not(.is-selected) {
  background: rgba(251, 191, 36, 0.08);
  border-color: rgba(251, 191, 36, 0.28);
}

.node-row.is-match-active {
  background: rgba(251, 191, 36, 0.16);
  border-color: rgba(251, 191, 36, 0.65);
  box-shadow: 0 0 16px -4px rgba(251, 191, 36, 0.55);
}

.node-row.is-dimmed {
  opacity: 0.32;
}

/* 搜索/跳转定位瞬间的强调脉冲（1.8s 后由组件移除 class） */
.node-row.is-flash {
  animation: row-focus-flash 0.9s ease 2;
}

@keyframes row-focus-flash {
  0%,
  100% {
    box-shadow: 0 0 0 0 rgba(90, 151, 255, 0);
  }
  50% {
    box-shadow: 0 0 0 2px rgba(90, 151, 255, 0.75), 0 0 20px -2px rgba(90, 151, 255, 0.8);
  }
}

/* 类型徽章 */
.type-badge {
  height: 24px;
  min-width: 30px;
  padding: 0 6px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 6px;
  border: 1px solid;
  font-family: var(--font-mono);
  font-size: 10.5px;
  font-weight: 700;
  letter-spacing: 0.3px;
  flex-shrink: 0;
  user-select: none;
}

/* 名称：透明无边框的"行内文本"观感，与类型胶囊明确区分；hover/focus 才浮现输入框边界 */
.name-input {
  flex: 1;
  min-width: 0;
  height: 28px;
  padding: 0 8px;
  font-size: 12.5px;
  font-weight: 550;
  background: transparent;
  border: 1px solid transparent;
  box-shadow: none;
}

.name-input:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.04);
  border-color: var(--input-border);
}

.name-input:focus {
  background: var(--input-bg);
}

.name-input.error-input {
  border-color: rgba(248, 113, 113, 0.65);
}

/* 类型：类型色着色的胶囊选择器，形状（药丸）+ 配色（类型色）+ 字体（等宽）与名称框彻底拉开 */
.type-select {
  flex-shrink: 0;
  width: 150px;
  height: 26px;
  padding: 0 24px 0 11px;
  appearance: none;
  -webkit-appearance: none;
  -moz-appearance: none;
  border-radius: 999px;
  font-family: var(--font-mono);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.2px;
  color: var(--type-color);
  background-color: color-mix(in srgb, var(--type-color) 13%, transparent);
  background-image: url("data:image/svg+xml;charset=utf-8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='10' viewBox='0 0 24 24' fill='none'%3E%3Cpath d='M6 9l6 6 6-6' stroke='%239fb0cc' stroke-width='2.4' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 8px center;
  background-size: 10px;
  border: 1px solid color-mix( in srgb, var(--type-color) 38%, transparent);
  box-shadow: none;
  cursor: pointer;
}

.type-select:hover:not(:disabled) {
  background-color: color-mix(in srgb, var(--type-color) 22%, transparent);
  border-color: color-mix(in srgb, var(--type-color) 60%, transparent);
}

.type-select:focus {
  outline: none;
  border-color: color-mix(in srgb, var(--type-color) 70%, transparent);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--type-color) 18%, transparent);
}

/* 展开的选项列表回归中性深色，避免彩色文字影响阅读 */
.type-select option {
  font-family: var(--font-ui);
  font-weight: 600;
  color: var(--text-primary);
}

/* ---------------- 根节点：输出容器头 ---------------- */

.root-header {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  padding: 10px 12px;
  border-radius: 12px;
  position: relative;
  overflow: hidden;
  border: 1px solid rgba(110, 157, 255, 0.38);
  background:
    linear-gradient(128deg, rgba(80, 135, 255, 0.22), rgba(109, 93, 252, 0.13) 55%, rgba(80, 135, 255, 0.07)),
    rgba(10, 17, 36, 0.5);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.12),
    inset 0 -1px 0 rgba(0, 0, 0, 0.3),
    0 10px 28px -14px rgba(47, 111, 240, 0.75);
}

/* 容器头顶部一道冷光棱边 */
.root-header::after {
  content: '';
  position: absolute;
  inset: 0;
  pointer-events: none;
  background: linear-gradient(165deg, rgba(255, 255, 255, 0.1), transparent 30%);
}

.root-header > * {
  position: relative;
  z-index: 1;
}

.root-arrow {
  width: 22px;
  height: 22px;
  border-radius: 6px;
  color: #b9cdff;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.1);
  flex-shrink: 0;
}

.root-glyph {
  width: 32px;
  height: 32px;
  border-radius: 9px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  background: linear-gradient(150deg, #5a97ff 0%, #2f6ff0 55%, #6d5dfc 100%);
  box-shadow: 0 5px 14px -3px rgba(47, 111, 240, 0.7), inset 0 1px 0 rgba(255, 255, 255, 0.35);
}

.root-id {
  display: flex;
  flex-direction: column;
  gap: 1px;
  min-width: 84px;
  margin-right: auto;
}

.root-id-name {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-family: var(--font-mono);
  font-size: 13.5px;
  font-weight: 700;
  color: #f2f6ff;
  letter-spacing: 0.3px;
}

.root-id-sub {
  font-size: 10px;
  color: rgba(185, 205, 255, 0.65);
  letter-spacing: 0.4px;
}

.root-lock {
  color: rgba(185, 205, 255, 0.55);
}

.root-err {
  flex-shrink: 0;
}

/* 输出形态分段开关：与字段类型下拉是完全不同的控件物种 */
.root-switch {
  display: flex;
  align-items: center;
  gap: 9px;
  flex-shrink: 0;
}

.switch-caption {
  font-size: 10.5px;
  font-weight: 600;
  letter-spacing: 0.8px;
  color: rgba(185, 205, 255, 0.7);
  white-space: nowrap;
}

.root-seg {
  display: flex;
  gap: 2px;
  padding: 3px;
  border-radius: 9px;
  background: rgba(4, 8, 18, 0.55);
  border: 1px solid rgba(255, 255, 255, 0.09);
  box-shadow: inset 0 1px 4px rgba(0, 0, 0, 0.45);
}

.root-seg button {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 5px 12px;
  font-size: 11.5px;
  font-weight: 600;
  color: var(--text-secondary);
  background: transparent;
  border-radius: 6px;
  transition: color 0.16s ease, background 0.16s ease, box-shadow 0.16s ease;
}

.root-seg button code {
  font-family: var(--font-mono);
  font-size: 10.5px;
  opacity: 0.75;
}

.root-seg button:hover:not(:disabled):not(.on) {
  color: var(--text-primary);
  background: rgba(255, 255, 255, 0.06);
}

.root-seg button.on {
  color: #fff;
  background: linear-gradient(180deg, #5a97ff 0%, #2f6ff0 100%);
  box-shadow: 0 2px 9px -2px rgba(47, 111, 240, 0.75), inset 0 1px 0 rgba(255, 255, 255, 0.3);
}

.root-seg button.on code {
  opacity: 1;
}

/* 根级添加字段：主操作，与分段开关相邻但用描边按钮区分 */
.root-add {
  height: 30px;
  padding: 0 13px;
  flex-shrink: 0;
  color: #dbe7ff;
  background: rgba(79, 141, 255, 0.18);
  border: 1px solid rgba(120, 168, 255, 0.5);
}

.root-add:hover:not(:disabled) {
  background: rgba(79, 141, 255, 0.32);
}

/* 字段分区标注 */
.fields-zone {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 10px 4px 2px 22px;
}

.zone-name {
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 1.6px;
  color: var(--text-placeholder);
}

.zone-count {
  font-size: 10px;
  font-weight: 700;
  color: #9fc0ff;
  background: rgba(79, 141, 255, 0.15);
  border: 1px solid rgba(79, 141, 255, 0.3);
  border-radius: 999px;
  padding: 0 7px;
  line-height: 16px;
}

.fields-zone::after {
  content: '';
  flex: 1;
  height: 1px;
  background: linear-gradient(90deg, rgba(255, 255, 255, 0.13), transparent);
}

.root-children {
  margin-top: 2px;
}

.fields-empty {
  margin: 6px 4px 2px 22px;
  padding: 14px 16px;
  font-size: 11.5px;
  color: var(--text-placeholder);
  border: 1px dashed rgba(255, 255, 255, 0.12);
  border-radius: 9px;
  text-align: center;
}

.pill {
  height: 26px;
  padding: 0 10px;
  border-radius: 6px;
  font-size: 11.5px;
  font-weight: 600;
  white-space: nowrap;
  flex-shrink: 0;
}

.add-btn {
  background: rgba(79, 141, 255, 0.14);
  color: #7db0ff;
  border: 1px solid rgba(79, 141, 255, 0.32);
}

.add-btn:hover:not(:disabled) {
  background: rgba(79, 141, 255, 0.28);
  color: #cfe2ff;
}

.del-btn {
  width: 28px;
  padding: 0;
  background: rgba(248, 113, 113, 0.1);
  color: var(--color-danger);
  border: 1px solid rgba(248, 113, 113, 0.3);
}

.del-btn:hover:not(:disabled) {
  background: rgba(248, 113, 113, 0.24);
}

/* 约束：附属操作。默认半透明退居次位，悬停行时才完全显现；已配置或展开时常驻蓝色高亮 */
.constraint-btn {
  position: relative;
  width: 28px;
  min-width: 28px;
  height: 26px;
  padding: 0;
  opacity: 0.45;
}

.node-row:hover .constraint-btn {
  opacity: 1;
}

.constraint-btn:hover:not(:disabled) {
  background: rgba(79, 141, 255, 0.16);
  color: #7db0ff;
  opacity: 1;
}

.constraint-btn.active {
  opacity: 1;
  color: #8fb6f5;
  background: rgba(79, 141, 255, 0.12);
  box-shadow: inset 0 0 0 1px rgba(79, 141, 255, 0.32);
}

.constraint-btn.active:hover:not(:disabled) {
  background: rgba(79, 141, 255, 0.22);
}

/* 无约束按钮时的等宽占位（对象行）：宽度与 .constraint-btn 完全一致 */
.action-slot {
  width: 28px;
  flex-shrink: 0;
  height: 26px;
}

/* 已配置约束的状态点 */
.constraint-dot {
  position: absolute;
  top: 3px;
  right: 3px;
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: var(--color-primary);
  box-shadow: 0 0 6px rgba(79, 141, 255, 0.9);
  pointer-events: none;
}

.constraint-slot {
  margin: 1px 0 5px;
}

.error-tip {
  color: var(--color-danger);
  font-size: 11px;
  white-space: nowrap;
  flex-shrink: 0;
  cursor: help;
}

.error-dot {
  color: var(--color-danger);
  font-size: 11px;
  flex-shrink: 0;
}

.node-children {
  position: relative;
  --elbow-w: 19px;
}

.node-children::before {
  content: '';
  position: absolute;
  left: var(--guide-left, 18px);
  top: -2px;
  bottom: 12px;
  width: 1px;
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.2), rgba(255, 255, 255, 0.07));
}

/* 横向连接肘线：从父级纵线连到本行箭头，明确「谁是谁的子级」，避免容器节点与同级混淆。
   --guide-left 由父级 .node-children 提供，深度 0 的根节点不绘制 */
.tree-node[data-depth]:not([data-depth='0'])::after {
  content: '';
  position: absolute;
  left: var(--guide-left, 18px);
  top: 21px;
  width: var(--elbow-w, 19px);
  height: 1px;
  background: linear-gradient(90deg, rgba(255, 255, 255, 0.22), rgba(255, 255, 255, 0.05));
  pointer-events: none;
}
</style>
