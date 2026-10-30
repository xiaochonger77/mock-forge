<script setup lang="ts">
import { computed } from 'vue'
import { useAppStore } from '../store/app'
import TreeNodeRow from './TreeNodeRow.vue'

const store = useAppStore()

const state = store.state
const disabled = computed(() => state.lockedByGeneration)
const errorCount = computed(() => Object.keys(store.errors.value).length)

/* ---------------- 节点搜索 ---------------- */

const matches = computed(() => store.searchMatches.value)
let searchTimer: ReturnType<typeof setTimeout> | null = null

function scheduleSearch() {
  if (searchTimer) clearTimeout(searchTimer)
  searchTimer = setTimeout(() => store.executeSearch(), 180)
}

function onSearchKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter') {
    e.preventDefault()
    if (matches.value.length) store.navigateMatch(e.shiftKey ? -1 : 1)
    else store.executeSearch()
  } else if (e.key === 'Escape') {
    store.clearSearch()
    ;(e.target as HTMLInputElement).blur()
  }
}

function switchSearchMode(mode: 'keyword' | 'path') {
  store.setSearchMode(mode)
  if (state.searchQuery.trim()) store.executeSearch()
}

const searchPlaceholder = computed(() =>
  state.searchMode === 'path'
    ? 'JSONPath 跳转，如 $.user.info.name 或 $..name'
    : '搜索字段名 / 类型 / 枚举值，Enter 下一个',
)

/* ---------------- 面包屑 ---------------- */

const breadcrumb = computed(() => store.selectedPath.value)

function crumbName(n: { name: string }, isRoot: boolean): string {
  if (isRoot) return 'root'
  return n.name.trim() || '未命名字段'
}

/** 一键回退上层：选中并定位到父级（已在顶层时回到 root） */
function goUp() {
  const path = breadcrumb.value
  if (path.length <= 1) return
  store.focusNode(path[path.length - 2].id)
}
</script>

<template>
  <div class="tree-editor glass">
    <div class="editor-header">
      <div class="title-wrap">
        <span class="title-icon">
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none">
            <path d="M4 6.5A1.5 1.5 0 0 1 5.5 5h3.88a1.5 1.5 0 0 1 1.06.44l.62.62a1.5 1.5 0 0 0 1.06.44H18.5A1.5 1.5 0 0 1 20 8v9.5A1.5 1.5 0 0 1 18.5 19h-13A1.5 1.5 0 0 1 4 17.5v-11z" stroke="currentColor" stroke-width="1.6"/>
          </svg>
        </span>
        <input
          class="title-input"
          :value="state.structureName"
          :disabled="disabled"
          spellcheck="false"
          @input="state.structureName = ($event.target as HTMLInputElement).value"
        />
      </div>
      <div class="header-actions">
        <div
          class="valid-badge"
          :class="errorCount ? 'invalid' : 'valid'"
          :title="errorCount ? `有 ${errorCount} 处配置需要修正（字段名为空 / 同级重名）` : '结构校验通过，可以生成数据'"
        >
          <template v-if="errorCount">
            <svg viewBox="0 0 24 24" width="12" height="12" fill="none">
              <path d="M12 8v5m0 3h.01M10.3 3.9 2.6 17a2 2 0 0 0 1.7 3h15.4a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />
            </svg>
            {{ errorCount }} 处需修复
          </template>
          <template v-else>
            <svg viewBox="0 0 24 24" width="12" height="12" fill="none">
              <circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.7" />
              <path d="M8 12.2l2.6 2.6L16.2 9.4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />
            </svg>
            结构合法
          </template>
        </div>
        <button class="tool-btn clear-btn" :disabled="disabled" title="清空全部字段（可 ⌘/Ctrl+Z 撤销）" @click="store.clearTree()">
          <svg viewBox="0 0 24 24" width="13" height="13" fill="none">
            <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m2 0v14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V6M10 11v6M14 11v6" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
          清空结构
        </button>
        <button class="tool-btn save-btn" :disabled="disabled" title="将当前结构保存为本地模板" @click="store.saveTemplate()">
          <svg viewBox="0 0 24 24" width="13" height="13" fill="none">
            <path d="M5 3h11.2L19 5.8V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round" />
            <path d="M8 3v5h7V3M8 21v-6h8v6" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round" />
          </svg>
          保存模板
        </button>
      </div>
    </div>

    <div class="editor-toolbar">
      <button class="tool-link" :disabled="disabled" @click="store.setAllCollapsed(false)">
        <svg viewBox="0 0 24 24" width="12" height="12" fill="none"><path d="M12 5v14M5 12l7 7 7-7" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>
        全部展开
      </button>
      <button class="tool-link" :disabled="disabled" @click="store.setAllCollapsed(true)">
        <svg viewBox="0 0 24 24" width="12" height="12" fill="none"><path d="M12 19V5m-7 7 7-7 7 7" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>
        全部收起
      </button>
      <span class="hint node-count">共 {{ store.totalCount.value }} 个节点</span>
    </div>

    <!-- 节点搜索：关键字模式（字段名/类型/枚举）或 JSONPath 跳转；命中自动展开树并定位 -->
    <div class="search-bar">
      <div class="search-input-wrap" :class="{ 'path-mode': state.searchMode === 'path' }">
        <svg class="search-icon" viewBox="0 0 24 24" width="13" height="13" fill="none">
          <circle cx="11" cy="11" r="6.5" stroke="currentColor" stroke-width="1.8" />
          <path d="m16 16 4.2 4.2" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
        </svg>
        <input
          class="search-input"
          :value="state.searchQuery"
          :placeholder="searchPlaceholder"
          spellcheck="false"
          @input="state.searchQuery = ($event.target as HTMLInputElement).value; scheduleSearch()"
          @keydown="onSearchKeydown"
        />
        <span v-if="state.searchQuery" class="match-counter" :class="{ zero: !matches.length }">
          {{ matches.length ? `${state.activeMatchIndex + 1}/${matches.length}` : '0' }}
        </span>
        <button
          v-if="state.searchQuery"
          class="search-nav"
          title="上一个（Shift+Enter）"
          :disabled="!matches.length"
          @click="store.navigateMatch(-1)"
        >↑</button>
        <button
          v-if="state.searchQuery"
          class="search-nav"
          title="下一个（Enter）"
          :disabled="!matches.length"
          @click="store.navigateMatch(1)"
        >↓</button>
        <button v-if="state.searchQuery" class="search-clear" title="清空（Esc）" @click="store.clearSearch()">✕</button>
      </div>
      <div class="search-mode segmented">
        <button
          class="mode-btn"
          :class="{ active: state.searchMode === 'keyword' }"
          title="按字段名 / 类型 / 枚举值搜索"
          @click="switchSearchMode('keyword')"
        >关键字</button>
        <button
          class="mode-btn"
          :class="{ active: state.searchMode === 'path' }"
          title="按 JSONPath 跳转选中，如 $.user.info.name"
          @click="switchSearchMode('path')"
        >JSONPath</button>
      </div>
    </div>

    <!-- 面包屑：当前节点路径，点击任意层级直接跳转，深层嵌套不迷路 -->
    <div class="breadcrumb-bar">
      <button class="crumb-up" :disabled="breadcrumb.length <= 1" title="返回上层" @click="goUp">
        <svg viewBox="0 0 24 24" width="12" height="12" fill="none">
          <path d="M15 5l-7 7 7 7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </button>
      <div class="crumbs">
        <template v-for="(n, i) in breadcrumb" :key="n.id">
          <button
            class="crumb"
            :class="{ current: i === breadcrumb.length - 1 }"
            :title="i === 0 ? '输出根节点' : `定位到 ${crumbName(n, false)}`"
            @click="store.focusNode(n.id)"
          >{{ crumbName(n, i === 0) }}</button>
          <span v-if="i < breadcrumb.length - 1" class="crumb-sep">›</span>
        </template>
      </div>
    </div>

    <div v-if="state.lockedByGeneration" class="lock-banner">
      <span class="lock-dot"></span>生成中，结构编辑已锁定…
    </div>

    <div class="tree-scroll">
      <TreeNodeRow
        :node="state.tree"
        :depth="0"
        :errors="store.errors.value"
        :locked="disabled"
      />
    </div>

    <div class="editor-footer">
      <span class="footer-dot"></span>
      <span class="hint">原地修改 · 点「约束」条配置规则 · 对象 / 数组可无限嵌套</span>
      <span class="hint shortcut-hint">⌘/Ctrl + Z 撤销 · ⇧⌘Z 重做</span>
    </div>
  </div>
</template>

<style scoped>
.tree-editor {
  flex: 1;
  min-width: 420px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.editor-header {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 13px 16px;
  border-bottom: 1px solid var(--divider);
}

.title-wrap {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 9px;
  min-width: 0;
}

.title-icon {
  width: 28px;
  height: 28px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--color-primary-soft);
  color: var(--color-primary);
  border: 1px solid rgba(79, 141, 255, 0.25);
  flex-shrink: 0;
}

.title-input {
  flex: 1;
  min-width: 0;
  font-size: 14px;
  font-weight: 650;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid transparent;
  box-shadow: none;
}

.title-input:hover:not(:disabled) {
  border-color: var(--input-border);
}

.title-input:focus {
  background: var(--input-bg);
  border-color: rgba(79, 141, 255, 0.7);
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

/* 校验状态徽章：让用户随时知道结构是否可生成 */
.valid-badge {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 4px 10px;
  font-size: 11px;
  font-weight: 600;
  border-radius: 999px;
  border: 1px solid transparent;
  white-space: nowrap;
}

.valid-badge.valid {
  color: var(--color-success);
  background: rgba(52, 211, 153, 0.12);
  border-color: rgba(52, 211, 153, 0.32);
}

.valid-badge.invalid {
  color: var(--color-danger);
  background: rgba(248, 113, 113, 0.12);
  border-color: rgba(248, 113, 113, 0.34);
}

.tool-btn {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 6px 12px;
  font-size: 11.5px;
  font-weight: 500;
  background: var(--inner-bg);
  color: var(--text-primary);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: var(--radius-control);
}

.tool-btn:hover:not(:disabled) {
  background: var(--inner-bg-hover);
}

/* 明确的主操作按钮：替代原来藏在侧栏的小链接 */
.save-btn {
  font-weight: 600;
  color: #fff;
  border-color: transparent;
  background: linear-gradient(180deg, #5a97ff 0%, #2f6ff0 100%);
  box-shadow: 0 3px 10px -2px rgba(47, 111, 240, 0.6), inset 0 1px 0 rgba(255, 255, 255, 0.25);
}

.save-btn:hover:not(:disabled) {
  background: linear-gradient(180deg, #6aa2ff 0%, #3a78f2 100%);
}

.save-btn:disabled {
  opacity: 0.5;
}

/* 危险操作：与「保存模板」并列于头部，描边警示样式而非纯文字链接 */
.clear-btn {
  color: var(--color-danger);
  border-color: rgba(248, 113, 113, 0.35);
  background: rgba(248, 113, 113, 0.1);
}

.clear-btn:hover:not(:disabled) {
  background: rgba(248, 113, 113, 0.2);
  border-color: rgba(248, 113, 113, 0.55);
}

.clear-btn:disabled {
  opacity: 0.5;
}

.editor-toolbar {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 9px 16px;
  border-bottom: 1px solid var(--divider);
}

.tool-link {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 4px 9px;
  font-size: 11.5px;
  background: transparent;
  color: var(--text-secondary);
  border-radius: var(--radius-control);
}

.tool-link:hover:not(:disabled) {
  background: var(--inner-bg);
  color: var(--text-primary);
}

.node-count {
  margin-left: auto;
  font-size: 11px;
}

/* ---------------- 搜索栏 ---------------- */

.search-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px 9px;
  border-bottom: 1px solid var(--divider);
}

.search-input-wrap {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 5px;
  height: 30px;
  padding: 0 7px 0 9px;
  border-radius: var(--radius-control);
  background: var(--input-bg);
  border: 1px solid var(--input-border);
  transition: border-color 0.15s ease, box-shadow 0.15s ease;
}

.search-input-wrap:focus-within {
  border-color: rgba(79, 141, 255, 0.7);
  box-shadow: 0 0 0 3px rgba(79, 141, 255, 0.16);
}

/* JSONPath 模式以紫色描边暗示「路径」语义，与关键字的蓝色区分 */
.search-input-wrap.path-mode {
  border-color: rgba(167, 139, 250, 0.4);
}

.search-input-wrap.path-mode:focus-within {
  border-color: rgba(167, 139, 250, 0.8);
  box-shadow: 0 0 0 3px rgba(167, 139, 250, 0.16);
}

.search-icon {
  color: var(--text-placeholder);
  flex-shrink: 0;
}

.search-input {
  flex: 1;
  min-width: 0;
  height: 100%;
  padding: 0;
  border: none;
  background: transparent;
  box-shadow: none;
  font-size: 12px;
}

.search-input:focus {
  box-shadow: none;
}

.match-counter {
  flex-shrink: 0;
  font-size: 10.5px;
  font-variant-numeric: tabular-nums;
  color: var(--color-warning);
  padding: 1px 7px;
  border-radius: 20px;
  background: rgba(251, 191, 36, 0.12);
  border: 1px solid rgba(251, 191, 36, 0.3);
}

.match-counter.zero {
  color: var(--color-danger);
  background: rgba(248, 113, 113, 0.1);
  border-color: rgba(248, 113, 113, 0.28);
}

.search-nav,
.search-clear {
  flex-shrink: 0;
  width: 20px;
  height: 20px;
  padding: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  color: var(--text-secondary);
  background: transparent;
  border-radius: 5px;
}

.search-nav:hover:not(:disabled),
.search-clear:hover {
  color: var(--text-primary);
  background: rgba(255, 255, 255, 0.08);
}

.search-mode {
  flex-shrink: 0;
  gap: 2px;
  padding: 2px;
  border-radius: 8px;
}

.mode-btn {
  padding: 4px 9px;
  font-size: 11px;
  font-weight: 600;
  color: var(--text-secondary);
  background: transparent;
  border-radius: 6px;
  white-space: nowrap;
}

.mode-btn:hover:not(.active) {
  color: var(--text-primary);
}

.mode-btn.active {
  color: #fff;
  background: linear-gradient(180deg, #5a97ff 0%, #2f6ff0 100%);
  box-shadow: 0 2px 7px -2px rgba(47, 111, 240, 0.6);
}

.search-input-wrap.path-mode ~ .search-mode .mode-btn.active {
  background: linear-gradient(180deg, #a78bfa 0%, #7c5cf0 100%);
  box-shadow: 0 2px 7px -2px rgba(124, 92, 252, 0.6);
}

/* ---------------- 面包屑 ---------------- */

.breadcrumb-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 16px;
  border-bottom: 1px solid var(--divider);
  background: rgba(255, 255, 255, 0.02);
  min-height: 33px;
}

.crumb-up {
  width: 22px;
  height: 22px;
  padding: 0;
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--text-secondary);
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 6px;
}

.crumb-up:hover:not(:disabled) {
  color: var(--text-primary);
  background: rgba(255, 255, 255, 0.1);
}

.crumbs {
  display: flex;
  align-items: center;
  gap: 3px;
  min-width: 0;
  overflow-x: auto;
  scrollbar-width: none;
}

.crumbs::-webkit-scrollbar {
  display: none;
}

.crumb {
  flex-shrink: 0;
  max-width: 180px;
  padding: 3px 8px;
  font-size: 11.5px;
  color: var(--text-secondary);
  background: transparent;
  border-radius: 6px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.crumb:hover {
  color: var(--text-primary);
  background: rgba(255, 255, 255, 0.07);
}

.crumb.current {
  color: #9fc0ff;
  font-weight: 650;
  background: rgba(79, 141, 255, 0.14);
  box-shadow: inset 0 0 0 1px rgba(79, 141, 255, 0.28);
  cursor: default;
}

.crumb-sep {
  flex-shrink: 0;
  color: var(--text-placeholder);
  font-size: 12px;
}

.lock-banner {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 7px 16px;
  font-size: 11.5px;
  color: var(--color-warning);
  background: rgba(251, 191, 36, 0.1);
  border-bottom: 1px solid rgba(251, 191, 36, 0.18);
}

.lock-dot,
.footer-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--color-warning);
  box-shadow: 0 0 7px var(--color-warning);
  flex-shrink: 0;
}

.tree-scroll {
  flex: 1;
  overflow: auto;
  padding: 10px 8px 14px;
}

.editor-footer {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 9px 16px;
  border-top: 1px solid var(--divider);
}

.footer-dot {
  background: var(--color-primary);
  box-shadow: 0 0 7px var(--color-primary);
}

.shortcut-hint {
  margin-left: auto;
  font-size: 10.5px;
  color: var(--text-placeholder);
  white-space: nowrap;
}
</style>
