<script setup lang="ts">
import { nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { useAppStore } from './store/app'
import LeftSidebar from './components/LeftSidebar.vue'
import TreeEditor from './components/TreeEditor.vue'
import SchemaPanel from './components/SchemaPanel.vue'
import RightPanel from './components/RightPanel.vue'

const store = useAppStore()
const state = store.state
const promptValue = ref('')
const promptInputEl = ref<HTMLInputElement | null>(null)

/**
 * 撤销 / 重做快捷键：⌘/Ctrl+Z、⇧⌘Z（或 Ctrl+Y）。
 * 输入框、文本域、contenteditable（如名称输入、Monaco）内不拦截，交给原生编辑撤销。
 */
function onGlobalKeydown(e: KeyboardEvent) {
  const mod = e.metaKey || e.ctrlKey
  if (!mod) return
  const key = e.key.toLowerCase()
  if (key !== 'z' && key !== 'y') return
  const target = e.target as HTMLElement | null
  const tag = target?.tagName
  if (tag === 'INPUT' || tag === 'TEXTAREA' || target?.isContentEditable) return
  if (state.lockedByGeneration || state.prompt.show) return
  e.preventDefault()
  if (key === 'y' || e.shiftKey) store.redo()
  else store.undo()
}

onMounted(() => {
  store.refreshTemplates()
  window.addEventListener('keydown', onGlobalKeydown)
})

onUnmounted(() => {
  window.removeEventListener('keydown', onGlobalKeydown)
})

watch(
  () => state.prompt.show,
  (show) => {
    if (show) {
      promptValue.value = state.prompt.value
      // 弹窗打开后自动聚焦输入框并选中现有文本，可直接键入名称
      if (state.prompt.inputMode) {
        nextTick(() => {
          promptInputEl.value?.focus()
          promptInputEl.value?.select()
        })
      }
    }
  },
)

function onPromptOk() {
  store.resolvePrompt(state.prompt.inputMode ? promptValue.value : 'ok')
}

function onPromptCancel() {
  store.resolvePrompt(null)
}
</script>

<template>
  <div class="app-shell" @keyup.esc="state.prompt.show && onPromptCancel()">
    <!-- 动态氛围背景：缓慢漂移的极光团 + 科技网格 + 细噪点，透过毛玻璃可见 -->
    <div class="bg-scene" aria-hidden="true">
      <span class="aurora aurora-a"></span>
      <span class="aurora aurora-b"></span>
      <span class="aurora aurora-c"></span>
      <span class="bg-grid"></span>
      <span class="bg-noise"></span>
    </div>

    <LeftSidebar class="shell-col" />

    <TreeEditor v-if="state.mode === 'manual'" class="shell-col" />
    <SchemaPanel v-else class="shell-col" />

    <RightPanel class="shell-col" />

    <!-- Toast -->
    <div class="toast-stack">
      <transition-group name="toast">
        <div v-for="t in state.toasts" :key="t.id" class="toast glass-strong" :class="t.type">
          <span class="toast-dot"></span>
          {{ t.message }}
        </div>
      </transition-group>
    </div>

    <!-- 通用输入 / 确认弹窗 -->
    <div v-if="state.prompt.show" class="modal-mask" @click="onPromptCancel()">
      <div class="modal glass-strong" @click.stop>
        <div class="modal-title">{{ state.prompt.title }}</div>
        <div v-if="state.prompt.message" class="modal-message hint">{{ state.prompt.message }}</div>
        <input
          v-if="state.prompt.inputMode"
          ref="promptInputEl"
          v-model="promptValue"
          class="modal-input"
          spellcheck="false"
          @keyup.enter="onPromptOk"
        />
        <div class="modal-actions">
          <button class="btn" @click="onPromptCancel">取消</button>
          <button
            class="btn"
            :class="state.prompt.okText === '删除' || state.prompt.okText === '清空' ? 'btn-danger' : 'btn-primary'"
            @click="onPromptOk"
          >
            {{ state.prompt.okText }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.app-shell {
  position: relative;
  z-index: 1;
  display: flex;
  gap: 10px;
  height: 100vh;
  padding: 10px;
  overflow: hidden;
}

/* ---------------- 动态氛围背景 ---------------- */

.bg-scene {
  position: fixed;
  inset: 0;
  z-index: 0;
  overflow: hidden;
  pointer-events: none;
}

.aurora {
  position: absolute;
  border-radius: 50%;
  filter: blur(100px);
  will-change: transform, opacity;
}

.aurora-a {
  width: 46vw;
  height: 46vw;
  left: -10vw;
  top: -16vw;
  background: radial-gradient(circle, rgba(64, 128, 255, 0.5), rgba(64, 128, 255, 0) 68%);
  animation: drift-a 34s ease-in-out infinite alternate;
}

.aurora-b {
  width: 42vw;
  height: 42vw;
  right: -12vw;
  top: -10vw;
  background: radial-gradient(circle, rgba(124, 92, 255, 0.4), rgba(124, 92, 255, 0) 66%);
  animation: drift-b 40s ease-in-out infinite alternate;
}

.aurora-c {
  width: 50vw;
  height: 50vw;
  left: 22vw;
  bottom: -26vw;
  background: radial-gradient(circle, rgba(20, 180, 233, 0.28), rgba(20, 180, 233, 0) 66%);
  animation: drift-c 46s ease-in-out infinite alternate;
}

@keyframes drift-a {
  from {
    transform: translate3d(0, 0, 0) scale(1);
    opacity: 0.85;
  }
  to {
    transform: translate3d(11vw, 9vh, 0) scale(1.16);
    opacity: 1;
  }
}

@keyframes drift-b {
  from {
    transform: translate3d(0, 2vh, 0) scale(1);
    opacity: 0.8;
  }
  to {
    transform: translate3d(-9vw, 11vh, 0) scale(1.14);
    opacity: 1;
  }
}

@keyframes drift-c {
  from {
    transform: translate3d(0, 0, 0) scale(1.05);
    opacity: 0.75;
  }
  to {
    transform: translate3d(-12vw, -8vh, 0) scale(0.94);
    opacity: 1;
  }
}

/* 科技网格：中心清晰、四周隐入黑暗 */
.bg-grid {
  position: absolute;
  inset: 0;
  background-image: linear-gradient(rgba(148, 180, 255, 0.055) 1px, transparent 1px),
    linear-gradient(90deg, rgba(148, 180, 255, 0.055) 1px, transparent 1px);
  background-size: 46px 46px;
  -webkit-mask-image: radial-gradient(ellipse 90% 82% at 50% 38%, #000 25%, transparent 100%);
  mask-image: radial-gradient(ellipse 90% 82% at 50% 38%, #000 25%, transparent 100%);
}

/* 细噪点：消除大面积渐变的塑料感，贴近真实玻璃纹理 */
.bg-noise {
  position: absolute;
  inset: 0;
  opacity: 0.045;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.55'/%3E%3C/svg%3E");
}

.toast-stack {
  position: fixed;
  top: 20px;
  right: 20px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  z-index: 200;
}

.toast {
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 10px 16px;
  border-radius: 11px;
  font-size: 12.5px;
  color: var(--text-primary);
  max-width: 360px;
}

.toast-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--color-success);
  box-shadow: 0 0 8px var(--color-success);
  flex-shrink: 0;
}

.toast.warning .toast-dot {
  background: var(--color-warning);
  box-shadow: 0 0 8px var(--color-warning);
}

.toast.error .toast-dot {
  background: var(--color-danger);
  box-shadow: 0 0 8px var(--color-danger);
}

.toast-enter-active,
.toast-leave-active {
  transition: all 0.25s ease;
}

.toast-enter-from,
.toast-leave-to {
  opacity: 0;
  transform: translateX(14px) scale(0.97);
}

.modal-mask {
  position: fixed;
  inset: 0;
  background: rgba(5, 8, 18, 0.45);
  backdrop-filter: blur(6px);
  -webkit-backdrop-filter: blur(6px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 150;
}

.modal {
  width: 380px;
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 13px;
  border-radius: 18px;
  animation: modal-in 0.18s ease;
}

@keyframes modal-in {
  from {
    opacity: 0;
    transform: translateY(8px) scale(0.98);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

.modal-title {
  font-size: 15px;
  font-weight: 650;
}

.modal-message {
  font-size: 12.5px;
}

.modal-input {
  width: 100%;
}

.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 2px;
}
</style>
