<script setup lang="ts">
import { ref } from 'vue'
import { useAppStore } from '../store/app'

const store = useAppStore()
const state = store.state
const openMenuId = ref<string | null>(null)

function toggleMenu(id: string) {
  openMenuId.value = openMenuId.value === id ? null : id
}

function closeMenu() {
  openMenuId.value = null
}

function menuAction(action: 'rename' | 'delete' | 'duplicate', id: string) {
  closeMenu()
  if (action === 'rename') store.renameTemplate(id)
  else if (action === 'delete') store.deleteTemplate(id)
  else store.duplicateTemplate(id)
}
</script>

<template>
  <aside class="left-sidebar glass">
    <div class="brand">
      <div class="brand-badge">
        <svg viewBox="0 0 24 24" width="17" height="17" fill="none">
          <ellipse cx="12" cy="6" rx="7.2" ry="3.1" fill="white" fill-opacity="0.95" />
          <path d="M4.8 6v5.4c0 1.7 3.2 3.1 7.2 3.1s7.2-1.4 7.2-3.1V6" stroke="white" stroke-opacity="0.95"
            stroke-width="1.7" />
          <path d="M4.8 11.4v5.2c0 1.7 3.2 3.1 7.2 3.1s7.2-1.4 7.2-3.1v-5.2" stroke="white" stroke-opacity="0.7"
            stroke-width="1.7" />
        </svg>
      </div>
      <div class="brand-text">
        <div class="brand-title">MockForge</div>
        <div class="brand-sub">数据锻造工坊 · 纯本地运行</div>
      </div>
    </div>

    <div class="mode-tabs segmented">
      <button class="mode-tab" :class="{ active: state.mode === 'manual' }" @click="store.setMode('manual')">
        <span>📝</span>手动构建
      </button>
      <button class="mode-tab" :class="{ active: state.mode === 'schema' }" @click="store.setMode('schema')">
        <span>📄</span>Schema 导入
      </button>
    </div>

    <div class="section-header">
      <span class="section-title">数据结构模板</span>
    </div>

    <div class="template-list">
      <div v-if="!state.templates.length" class="empty">
        <div class="empty-icon">🗂️</div>
        <div class="hint">暂无本地模板</div>
        <div class="hint empty-sub">在结构面板头部点击「保存模板」</div>
      </div>
      <div v-for="tpl in state.templates" :key="tpl.id" class="template-item"
        :class="{ active: state.activeTemplateId === tpl.id }" @click="store.loadTemplate(tpl.id)">
        <span class="tpl-icon">
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none">
            <path
              d="M3 6.5A1.5 1.5 0 0 1 4.5 5h4.38a1.5 1.5 0 0 1 1.06.44l1.12 1.12a1.5 1.5 0 0 0 1.06.44H19.5A1.5 1.5 0 0 1 21 8.5v9A1.5 1.5 0 0 1 19.5 19h-15A1.5 1.5 0 0 1 3 17.5v-11z"
              fill="currentColor" />
          </svg>
        </span>
        <span class="tpl-name" :title="tpl.name">{{ tpl.name }}</span>
        <button class="more" @click.stop="toggleMenu(tpl.id)">⋯</button>

        <div v-if="openMenuId === tpl.id" class="menu-mask" @click.stop="closeMenu"></div>
        <div v-if="openMenuId === tpl.id" class="menu glass-strong">
          <button class="menu-item" @click.stop="menuAction('rename', tpl.id)">✏️ 重命名</button>
          <button class="menu-item" @click.stop="menuAction('duplicate', tpl.id)">📋 复制</button>
          <div class="menu-divider"></div>
          <button class="menu-item danger" @click.stop="menuAction('delete', tpl.id)">🗑 删除</button>
        </div>
      </div>
    </div>

    <div class="bottom-actions">
      <button class="btn btn-primary full" @click="store.newBlankTemplate()">
        <span class="plus">＋</span>新建空白模板
      </button>
    </div>
  </aside>
</template>

<style scoped>
.left-sidebar {
  width: 252px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  padding: 16px 14px;
  gap: 14px;
  overflow: hidden;
}

/* 品牌头 */
.brand {
  display: flex;
  align-items: center;
  gap: 11px;
  padding: 2px 2px 4px;
}

.brand-badge {
  width: 36px;
  height: 36px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(150deg, #5a97ff 0%, #2f6ff0 55%, #6d5dfc 100%);
  box-shadow: 0 6px 16px -4px rgba(47, 111, 240, 0.65), inset 0 1px 0 rgba(255, 255, 255, 0.35);
  flex-shrink: 0;
  animation: brand-breathe 3.4s ease-in-out infinite;
}

@keyframes brand-breathe {

  0%,
  100% {
    box-shadow: 0 6px 16px -4px rgba(47, 111, 240, 0.55), inset 0 1px 0 rgba(255, 255, 255, 0.35);
  }

  50% {
    box-shadow: 0 8px 26px -3px rgba(93, 125, 255, 0.85), inset 0 1px 0 rgba(255, 255, 255, 0.45);
  }
}

.brand-title {
  font-size: 14px;
  font-weight: 700;
  letter-spacing: 0.2px;
  line-height: 1.3;
}

.brand-sub {
  font-size: 10.5px;
  color: var(--text-placeholder);
  margin-top: 1px;
}

/* 分段 Tab */
.mode-tabs {
  width: 100%;
}

.mode-tab {
  flex: 1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  padding: 7px 4px;
  font-size: 12px;
  font-weight: 600;
  background: transparent;
  color: var(--text-secondary);
  border-radius: 7px;
}

.mode-tab:hover:not(.active) {
  color: var(--text-primary);
}

.mode-tab.active {
  color: #fff;
  background: linear-gradient(180deg, #5a97ff 0%, #2f6ff0 100%);
  box-shadow: 0 3px 10px -2px rgba(47, 111, 240, 0.6), inset 0 1px 0 rgba(255, 255, 255, 0.3);
}

/* 区块标题 */
.section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 2px;
}

.section-title {
  font-size: 11px;
  font-weight: 650;
  color: var(--text-secondary);
  letter-spacing: 0.8px;
}

/* 模板列表 */
.template-list {
  flex: 1;
  overflow: auto;
  display: flex;
  flex-direction: column;
  gap: 5px;
  margin: 0 -4px;
  padding: 0 4px;
}

.empty {
  margin-top: 26px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
}

.empty-icon {
  font-size: 26px;
  opacity: 0.45;
  margin-bottom: 4px;
}

.empty-sub {
  font-size: 10.5px;
}

.template-item {
  position: relative;
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 9px 10px;
  border-radius: var(--radius-control);
  cursor: pointer;
  border: 1px solid transparent;
  background: var(--inner-bg);
  transition: background 0.15s ease, border-color 0.15s ease, transform 0.15s ease;
}

.template-item:hover {
  background: var(--inner-bg-hover);
  transform: translateX(2px);
}

.template-item.active {
  background: var(--color-primary-soft);
  border-color: rgba(79, 141, 255, 0.4);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.08);
}

.tpl-icon {
  color: var(--color-primary);
  display: flex;
  opacity: 0.85;
}

.tpl-name {
  flex: 1;
  font-size: 12.5px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.more {
  width: 22px;
  height: 22px;
  border-radius: 6px;
  background: transparent;
  border: none;
  color: var(--text-secondary);
  font-size: 15px;
  opacity: 0;
  transition: opacity 0.15s ease;
}

.template-item:hover .more,
.template-item.active .more {
  opacity: 1;
}

.more:hover {
  background: rgba(255, 255, 255, 0.12);
  color: var(--text-primary);
}

.menu-mask {
  position: fixed;
  inset: 0;
  z-index: 40;
}

.menu {
  position: absolute;
  right: 2px;
  top: 34px;
  z-index: 50;
  border-radius: 10px;
  overflow: hidden;
  min-width: 128px;
  padding: 4px;
}

.menu-item {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  text-align: left;
  padding: 7px 10px;
  font-size: 12px;
  background: transparent;
  color: var(--text-primary);
  border-radius: 6px;
}

.menu-item:hover {
  background: rgba(255, 255, 255, 0.09);
}

.menu-item.danger {
  color: var(--color-danger);
}

.menu-divider {
  height: 1px;
  background: var(--divider);
  margin: 4px 6px;
}

/* 底部操作 */
.bottom-actions {
  display: flex;
  flex-direction: column;
  gap: 9px;
}

.full {
  width: 100%;
  padding: 10px;
  font-size: 13px;
}

.plus {
  font-size: 14px;
  font-weight: 700;
}
</style>
