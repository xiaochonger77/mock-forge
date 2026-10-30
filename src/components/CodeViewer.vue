<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { monaco } from '../utils/monaco'
import { useAppStore } from '../store/app'

/**
 * 只读代码查看器（Monaco）：
 * 语法高亮 / 区块折叠 / 一键格式化 / 一键压缩 / 自动换行开关 / 复制。
 * 格式化与压缩只改变查看器内的呈现，不回写生成结果；父级 value 刷新（重新生成）时自动复位。
 */
const props = withDefaults(
  defineProps<{
    value: string
    language?: string
  }>(),
  { language: 'json' },
)

const store = useAppStore()
const hostEl = ref<HTMLDivElement | null>(null)
const wordWrap = ref(true)
const copied = ref(false)

/** 当前查看器内实际展示的文本（null 时跟随 props.value） */
const viewText = ref(props.value)
let copyTimer: ReturnType<typeof setTimeout> | null = null
let editor: monaco.editor.IStandaloneCodeEditor | null = null

const isEmpty = computed(() => !viewText.value.trim())
const isSingleLine = computed(() => !viewText.value.includes('\n'))

const langLabel = computed(() => (props.language === 'json' ? 'JSON' : props.language.toUpperCase()))

const meta = computed(() => {
  const t = viewText.value
  if (!t) return langLabel.value
  const bytes = new Blob([t]).size
  const size =
    bytes >= 1024 * 1024
      ? `${(bytes / 1024 / 1024).toFixed(2)} MB`
      : bytes >= 1024
        ? `${(bytes / 1024).toFixed(1)} KB`
        : `${bytes} B`
  return `${langLabel.value} · ${size} · ${t.split('\n').length} 行`
})

onMounted(() => {
  if (!hostEl.value) return

  monaco.editor.defineTheme('glass-dark', {
    base: 'vs-dark',
    inherit: true,
    rules: [],
    colors: {
      'editor.background': '#00000000',
      'editorGutter.background': '#00000000',
      'minimap.background': '#00000000',
      'editorLineNumber.foreground': '#4b5b7d',
      'editorLineNumber.activeForeground': '#9fb0cc',
      'editor.lineHighlightBackground': '#ffffff0a',
      'editorLineNumber.background': '#00000000',
    },
  })

  editor = monaco.editor.create(hostEl.value, {
    value: viewText.value,
    language: props.language,
    theme: 'glass-dark',
    readOnly: true,
    automaticLayout: true,
    minimap: { enabled: false },
    fontSize: 12,
    fontFamily: 'JetBrains Mono, SF Mono, Menlo, Consolas, monospace',
    lineNumbers: 'on',
    lineNumbersMinChars: 3,
    scrollBeyondLastLine: false,
    smoothScrolling: true,
    folding: true,
    foldingHighlight: true,
    showFoldingControls: 'always',
    wordWrap: 'on',
    padding: { top: 8, bottom: 12 },
    scrollbar: {
      verticalScrollbarSize: 9,
      horizontalScrollbarSize: 9,
    },
  })
})

// 父级数据刷新（重新生成 / 切换预览条数）：放弃本地格式化覆盖，跟随最新内容
watch(
  () => props.value,
  (v) => {
    viewText.value = v
    if (editor && editor.getValue() !== v) editor.setValue(v)
  },
)

onBeforeUnmount(() => {
  if (copyTimer) clearTimeout(copyTimer)
  editor?.dispose()
  editor = null
})

/* ---------------- 工具条动作 ---------------- */

/** pretty = 2 空格缩进格式化；minify = 去空白单行压缩 */
function applyTransform(mode: 'pretty' | 'minify') {
  if (!editor || isEmpty.value) return
  try {
    const obj = JSON.parse(viewText.value)
    const next = mode === 'pretty' ? JSON.stringify(obj, null, 2) : JSON.stringify(obj)
    viewText.value = next
    editor.setValue(next)
    if (mode === 'minify') editor.trigger('code-viewer', 'editor.unfoldAll', null)
  } catch {
    store.toast('JSON 解析失败，无法格式化 / 压缩', 'error')
  }
}

/** Monaco 内建折叠动作（折叠区间由 JSON language worker 提供） */
function foldAll() {
  if (!editor || isEmpty.value || isSingleLine.value) return
  editor.trigger('code-viewer', 'editor.foldAll', null)
}

function unfoldAll() {
  if (!editor || isEmpty.value) return
  editor.trigger('code-viewer', 'editor.unfoldAll', null)
}

function toggleWrap() {
  wordWrap.value = !wordWrap.value
  editor?.updateOptions({ wordWrap: wordWrap.value ? 'on' : 'off' })
}

async function copyAll() {
  if (isEmpty.value) return
  try {
    await navigator.clipboard.writeText(viewText.value)
  } catch {
    const ta = document.createElement('textarea')
    ta.value = viewText.value
    ta.style.position = 'fixed'
    ta.style.opacity = '0'
    document.body.appendChild(ta)
    ta.select()
    document.execCommand('copy')
    ta.remove()
  }
  copied.value = true
  if (copyTimer) clearTimeout(copyTimer)
  copyTimer = setTimeout(() => (copied.value = false), 1500)
}
</script>

<template>
  <div class="code-viewer">
    <div class="cv-toolbar">
      <span class="cv-meta">{{ meta }}</span>
      <div class="cv-actions">
        <button class="cv-btn" :disabled="isEmpty" title="格式化（2 空格缩进）" @click="applyTransform('pretty')">
          <svg viewBox="0 0 24 24" width="13.5" height="13.5" fill="none">
            <path d="M12 3l1.7 4.6L18.3 9l-4.6 1.4L12 15l-1.7-4.6L5.7 9l4.6-1.4L12 3z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/>
            <path d="M18.5 14.5l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8.8-2.2z" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/>
          </svg>
        </button>
        <button class="cv-btn" :disabled="isEmpty" title="一键压缩为单行" @click="applyTransform('minify')">
          <svg viewBox="0 0 24 24" width="13.5" height="13.5" fill="none">
            <path d="M8 3.5V7H4.5M16 3.5V7h3.5M8 20.5V17H4.5M16 20.5V17h3.5" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </button>
        <span class="cv-sep"></span>
        <button class="cv-btn" :disabled="isEmpty || isSingleLine" title="全部折叠" @click="foldAll">
          <svg viewBox="0 0 24 24" width="13.5" height="13.5" fill="none">
            <path d="M12 9V3.5m0 0L9.5 6M12 3.5 14.5 6M12 15v5.5m0 0L9.5 18m2.5 2.5 2.5-2.5M4 12h16" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </button>
        <button class="cv-btn" :disabled="isEmpty || isSingleLine" title="全部展开" @click="unfoldAll">
          <svg viewBox="0 0 24 24" width="13.5" height="13.5" fill="none">
            <path d="M12 3.5V9m0 0L9.5 6.5M12 9l2.5-2.5M12 20.5V15m0 0-2.5 2.5m2.5-2.5 2.5 2.5M4 12h16" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </button>
        <button
          class="cv-btn"
          :class="{ on: wordWrap }"
          :disabled="isEmpty"
          :title="wordWrap ? '关闭自动换行' : '开启自动换行'"
          @click="toggleWrap"
        >
          <svg viewBox="0 0 24 24" width="13.5" height="13.5" fill="none">
            <path d="M4 6h13a3 3 0 0 1 0 6H7" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/>
            <path d="M9.5 9 7 12l2.5 3M4 18h16" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </button>
        <span class="cv-sep"></span>
        <button class="cv-btn copy-btn" :class="{ ok: copied }" :disabled="isEmpty" title="复制全部内容" @click="copyAll">
          <svg v-if="!copied" viewBox="0 0 24 24" width="13" height="13" fill="none">
            <rect x="8.5" y="8.5" width="11" height="11" rx="2" stroke="currentColor" stroke-width="1.7" />
            <path d="M5.5 15.5H5A2 2 0 0 1 3 13.5V5a2 2 0 0 1 2-2h8.5a2 2 0 0 1 2 2v.5" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" />
          </svg>
          <svg v-else viewBox="0 0 24 24" width="13" height="13" fill="none">
            <path d="M5 12.5l4.5 4.5L19 7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
        </button>
      </div>
    </div>
    <div ref="hostEl" class="cv-host"></div>
  </div>
</template>

<style scoped>
.code-viewer {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

/* 细工具条：语言/体积元信息在左，VS Code 式图标动作在右 */
.cv-toolbar {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 5px 10px 5px 14px;
  border-bottom: 1px solid var(--divider);
  background: rgba(255, 255, 255, 0.02);
}

.cv-meta {
  font-size: 10.5px;
  letter-spacing: 0.4px;
  color: var(--text-placeholder);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.cv-actions {
  display: flex;
  align-items: center;
  gap: 2px;
  flex-shrink: 0;
}

.cv-btn {
  width: 26px;
  height: 26px;
  padding: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--text-secondary);
  background: transparent;
  border: 1px solid transparent;
  border-radius: 6px;
  transition: color 0.14s ease, background 0.14s ease, border-color 0.14s ease;
}

.cv-btn:hover:not(:disabled) {
  color: var(--text-primary);
  background: rgba(255, 255, 255, 0.08);
}

.cv-btn:disabled {
  opacity: 0.32;
}

/* 换行开关：激活态冷蓝描边，明确当前状态 */
.cv-btn.on {
  color: #8fb6f5;
  background: rgba(79, 141, 255, 0.14);
  border-color: rgba(79, 141, 255, 0.32);
}

.cv-btn.copy-btn.ok {
  color: var(--color-success);
  background: rgba(52, 211, 153, 0.12);
}

.cv-sep {
  width: 1px;
  height: 14px;
  margin: 0 5px;
  background: var(--divider);
}

.cv-host {
  flex: 1;
  min-height: 0;
}
</style>
