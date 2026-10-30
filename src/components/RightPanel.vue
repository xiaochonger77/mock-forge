<script setup lang="ts">
import { ref, computed } from 'vue'
import { useAppStore } from '../store/app'
import DataGrid from './DataGrid.vue'
import CodeViewer from './CodeViewer.vue'

const store = useAppStore()
const state = store.state

const count = ref(100)
const previewTab = ref<'table' | 'json'>('table')
const exportMenuOpen = ref(false)
const exportBtn = ref<HTMLElement | null>(null)
const menuPos = ref<{ top: number; right: number }>({ top: 0, right: 0 })

const largeCount = computed(() => count.value > 100_000)
/** 输出形态跟随根节点类型：object 根 = 单对象，array 根 = 对象数组 */
const isObject = computed(() => store.isObjectOutput.value)
const jsonPreview = computed(() =>
  isObject.value ? JSON.stringify(state.previewRows[0] ?? {}, null, 2) : JSON.stringify(state.previewRows, null, 2),
)
const gridRows = computed(() => (isObject.value ? state.previewRows.slice(0, 1) : state.previewRows))
const basePreviewOptions = [20, 30, 50, 100]
/** 实际生成数小于最小档位（如单对象=1）时，补一个如实反映数量的档位 */
const previewOptions = computed(() => {
  const total = state.generatedCount
  if (total > 0 && total < basePreviewOptions[0] && !basePreviewOptions.includes(total)) {
    return [total, ...basePreviewOptions]
  }
  return basePreviewOptions
})

function onGenerate() {
  store.generate(isObject.value ? 1 : count.value)
}

function toggleExportMenu() {
  if (!exportMenuOpen.value && exportBtn.value) {
    const rect = exportBtn.value.getBoundingClientRect()
    menuPos.value = { top: rect.bottom + 6, right: window.innerWidth - rect.right }
  }
  exportMenuOpen.value = !exportMenuOpen.value
}

function onExport(format: 'json' | 'csv' | 'sql') {
  exportMenuOpen.value = false
  store.exportData(format)
}
</script>

<template>
  <div class="right-panel">
    <!-- 生成配置区 -->
    <div class="config-area panel">
      <div class="config-row">
        <div class="count-wrap">
          <template v-if="!isObject">
            <label class="config-label">生成数量</label>
            <input
              class="count-input"
              type="number"
              min="1"
              :value="count"
              :disabled="state.generating"
              placeholder="生成组数"
              @input="count = Number(($event.target as HTMLInputElement).value)"
            />
          </template>
          <!-- 单对象形态固定产出 1 条，数量输入框无意义，改为形态标识 -->
          <span v-else class="object-mode-tag" title="单对象形态固定生成 1 条">
            <svg viewBox="0 0 24 24" width="13" height="13" fill="none">
              <path d="M8 3H7a2 2 0 0 0-2 2v4.5c0 .83-.67 1.5-1.5 1.5.83 0 1.5.67 1.5 1.5V19a2 2 0 0 0 2 2h1M16 3h1a2 2 0 0 1 2 2v4.5c0 .83.67 1.5 1.5 1.5-.83 0-1.5.67-1.5 1.5V19a2 2 0 0 1-2 2h-1" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
            单个 JSON 对象
          </span>
        </div>
        <button class="btn btn-primary generate-btn" :disabled="state.generating" @click="onGenerate">
          <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
            <path d="M13 2 4.5 13.5H11l-1 8.5 8.5-11.5H12l1-8.5z" />
          </svg>
          {{ isObject ? '生成对象' : '生成模拟数据' }}
        </button>
        <button v-if="state.generating" class="btn btn-danger cancel-btn" @click="store.cancelGenerate()">取消</button>
      </div>

      <div v-if="largeCount && !isObject && !state.generating" class="hint warn-hint">
        ⚠ 数量大于 10 万，将分批生成并流式导出，预览仅展示少量样例
      </div>

      <div v-if="state.generating" class="progress-row">
        <span class="gen-status"><span class="gen-dot"></span>{{ isObject ? '正在生成对象' : `正在生成第 ${state.generatedCount} 条` }}</span>
        <div class="progress-track">
          <div class="progress-fill" :style="{ width: `${Math.round(state.progress * 100)}%` }"></div>
        </div>
        <span class="progress-pct">{{ Math.round(state.progress * 100) }}%</span>
      </div>

      <div v-if="!state.generating" class="result-row">
        <span class="hint result-info">
          <template v-if="state.hasResult">
            <template v-if="isObject">已生成 <b class="num">1</b> 个 JSON 对象</template>
            <template v-else>已生成 <b class="num">{{ state.generatedCount }}</b> 条 · 预览前 {{ state.previewRows.length }} 条</template>
          </template>
          <template v-else>生成数据后可导出 JSON / CSV / SQL</template>
        </span>
        <div class="export-wrap">
          <button
            ref="exportBtn"
            class="btn export-btn"
            :disabled="!state.hasResult"
            :title="state.hasResult ? '导出数据' : '请先生成模拟数据'"
            @click="toggleExportMenu"
          >
            <svg viewBox="0 0 24 24" width="13" height="13" fill="none">
              <path d="M12 3v11m0 0 4-4m-4 4-4-4M5 19h14" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />
            </svg>
            导出 ▾
          </button>
        </div>
      </div>
    </div>

    <!-- 预览结果区 -->
    <div class="preview-area panel">
      <div class="preview-header">
        <div class="preview-tabs segmented">
          <button class="tab" :class="{ active: previewTab === 'table' }" @click="previewTab = 'table'">表格预览</button>
          <button class="tab" :class="{ active: previewTab === 'json' }" @click="previewTab = 'json'">JSON 预览</button>
        </div>
        <div class="header-tools">
          <div v-if="!isObject" class="limit-wrap" :class="{ disabled: !state.hasResult }">
            <span class="hint">预览条数</span>
            <select
              class="limit-select"
              :value="state.previewLimit"
              :disabled="!state.hasResult"
              @change="store.setPreviewLimit(Number(($event.target as HTMLSelectElement).value))"
            >
              <option v-for="n in previewOptions" :key="n" :value="n" :disabled="n > state.generatedCount">
                {{ n }} 条
              </option>
            </select>
          </div>
        </div>
      </div>

      <div class="preview-body">
        <template v-if="state.previewRows.length">
          <DataGrid v-if="previewTab === 'table'" :rows="gridRows" :root="state.tree" :total="state.generatedCount" />
          <CodeViewer v-else :value="jsonPreview" language="json" />
        </template>
        <div v-else class="empty-state">
          <div class="empty-icon">
            <svg viewBox="0 0 24 24" width="40" height="40" fill="none">
              <rect x="3" y="4" width="18" height="16" rx="2.5" stroke="currentColor" stroke-width="1.4" opacity="0.5" />
              <path d="M3 9h18M8 4v5" stroke="currentColor" stroke-width="1.4" opacity="0.5" />
              <circle cx="8.5" cy="14" r="1.1" fill="currentColor" opacity="0.6" />
              <path d="M12 14h5M12 16.5h3.5" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" opacity="0.6" />
            </svg>
          </div>
          <div class="hint">配置好结构后，输入生成数量并点击「生成模拟数据」</div>
        </div>
      </div>
    </div>

    <!-- 导出菜单：Teleport 到 body 避免被玻璃面板 overflow 裁切 -->
    <Teleport to="body">
      <div v-if="exportMenuOpen" class="export-menu-mask" @click="exportMenuOpen = false"></div>
      <div
        v-if="exportMenuOpen"
        class="export-menu-pop glass-strong"
        :style="{ top: `${menuPos.top}px`, right: `${menuPos.right}px` }"
      >
        <button class="menu-item" @click="onExport('json')">📄 导出 JSON</button>
        <button class="menu-item" @click="onExport('csv')">📊 导出 CSV</button>
        <button class="menu-item" @click="onExport('sql')">🗃 导出 SQL</button>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.right-panel {
  flex: 1.35;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
  overflow: hidden;
}

/* 配置区 */
.config-area {
  padding: 14px 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  flex-shrink: 0;
  border-radius: var(--radius-lg);
}

/* 单对象形态标识：替代无意义的数量输入框 */
.object-mode-tag {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  font-size: 12px;
  font-weight: 500;
  color: var(--color-primary);
  background: rgba(79, 141, 255, 0.1);
  border: 1px solid rgba(79, 141, 255, 0.3);
  border-radius: 999px;
  white-space: nowrap;
}

.config-row {
  display: flex;
  align-items: center;
  gap: 12px;
}

.count-wrap {
  display: flex;
  align-items: center;
  gap: 9px;
}

.config-label {
  color: var(--text-secondary);
  font-size: 12.5px;
  white-space: nowrap;
  font-weight: 500;
}

.count-input {
  width: 120px;
}

.generate-btn {
  padding: 9px 20px;
  font-size: 13px;
}

.cancel-btn {
  padding: 9px 16px;
}

.warn-hint {
  color: var(--color-warning);
}

.progress-row {
  display: flex;
  align-items: center;
  gap: 12px;
}

.gen-status {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  font-size: 12px;
  color: var(--color-success);
  white-space: nowrap;
}

.gen-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--color-success);
  box-shadow: 0 0 8px var(--color-success);
  flex-shrink: 0;
  animation: gen-breathe 1.6s ease-in-out infinite;
}

@keyframes gen-breathe {
  0%,
  100% {
    transform: scale(1);
    box-shadow: 0 0 6px rgba(52, 211, 153, 0.55);
  }
  50% {
    transform: scale(1.35);
    box-shadow: 0 0 12px rgba(52, 211, 153, 0.9);
  }
}

.progress-row .progress-track {
  flex: 1;
}

.progress-pct {
  font-size: 11.5px;
  color: var(--text-secondary);
  width: 38px;
  text-align: right;
  font-variant-numeric: tabular-nums;
}

.result-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.num {
  color: var(--color-success);
  font-weight: 700;
}

.export-wrap {
  position: relative;
}

.export-btn {
  padding: 7px 15px;
}

/* 预览区 */
.preview-area {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border-radius: var(--radius-lg);
}

.preview-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 11px 14px;
  border-bottom: 1px solid var(--divider);
}

.preview-tabs {
  width: 210px;
}

.tab {
  flex: 1;
  padding: 6px 10px;
  font-size: 12px;
  font-weight: 600;
  background: transparent;
  color: var(--text-secondary);
  border-radius: 6px;
}

.tab:hover:not(.active) {
  color: var(--text-primary);
}

.tab.active {
  color: #fff;
  background: linear-gradient(180deg, rgba(90, 151, 255, 0.95), rgba(47, 111, 240, 0.95));
  box-shadow: 0 2px 8px -1px rgba(47, 111, 240, 0.55), inset 0 1px 0 rgba(255, 255, 255, 0.28);
}

.limit-wrap {
  display: flex;
  align-items: center;
  gap: 8px;
}

.limit-wrap.disabled {
  opacity: 0.45;
}

.limit-select {
  width: 86px;
  padding: 5px 8px;
}

.header-tools {
  display: flex;
  align-items: center;
  gap: 10px;
}

.preview-body {
  flex: 1;
  min-height: 0;
  overflow: hidden;
  display: flex;
}

.empty-state {
  flex: 1;
  min-height: 240px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 14px;
  color: var(--text-placeholder);
}

.empty-icon {
  opacity: 0.8;
}
</style>

<!-- 非 scoped：Teleport 到 body 的导出浮层需要全局样式 -->
<style>
.export-menu-mask {
  position: fixed;
  inset: 0;
  z-index: 400;
}

.export-menu-pop {
  position: fixed;
  z-index: 401;
  border-radius: 12px;
  min-width: 158px;
  padding: 5px;
  animation: export-menu-in 0.16s ease;
}

@keyframes export-menu-in {
  from {
    opacity: 0;
    transform: translateY(-5px) scale(0.98);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

.export-menu-pop .menu-item {
  display: flex;
  align-items: center;
  gap: 9px;
  width: 100%;
  text-align: left;
  padding: 9px 12px;
  font-size: 12.5px;
  background: transparent;
  color: var(--text-primary);
  border-radius: 8px;
}

.export-menu-pop .menu-item:hover {
  background: rgba(255, 255, 255, 0.1);
}
</style>
