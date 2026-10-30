<script setup lang="ts">
import { nextTick, onMounted, onBeforeUnmount, ref, watch } from 'vue'
import { monaco } from '../utils/monaco'
import { useAppStore } from '../store/app'

const store = useAppStore()
const state = store.state
const container = ref<HTMLDivElement | null>(null)

let editor: monaco.editor.IStandaloneCodeEditor | null = null

onMounted(() => {
  if (!container.value) return

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

  editor = monaco.editor.create(container.value, {
    value: state.schemaText,
    language: 'json',
    theme: 'glass-dark',
    automaticLayout: true,
    minimap: { enabled: false },
    fontSize: 12.5,
    fontFamily: 'JetBrains Mono, SF Mono, Menlo, Consolas, monospace',
    lineNumbers: 'on',
    scrollBeyondLastLine: false,
    folding: true,
    wordWrap: 'on',
    padding: { top: 10, bottom: 10 },
    scrollbar: {
      verticalScrollbarSize: 9,
      horizontalScrollbarSize: 9,
    },
  })
  editor.onDidChangeModelContent(() => {
    state.schemaText = editor?.getValue() ?? ''
  })
})

/* 代码区工具：格式化（2 空格缩进）/ 一键压缩（单行）；写回编辑器并同步 state */
function transformSchema(mode: 'pretty' | 'minify') {
  if (!editor) return
  try {
    const obj = JSON.parse(editor.getValue())
    editor.setValue(mode === 'pretty' ? JSON.stringify(obj, null, 2) : JSON.stringify(obj))
  } catch {
    store.toast('JSON 解析失败，请检查语法后再格式化', 'error')
  }
}

/* 将 state.schemaText 同步进编辑器；编辑器自身输入通过 onDidChangeModelContent 回写 state，
   因此用值比较避免回环。大文本 setValue 后显式 layout()，避免 Monaco 视口未重绘导致内容不显示 */
function syncEditorFromState() {
  if (!editor) return
  if (editor.getValue() !== state.schemaText) {
    editor.setValue(state.schemaText)
    nextTick(() => editor?.layout())
  }
}

watch(() => state.mode, (mode) => {
  if (mode === 'schema') syncEditorFromState()
})

/* 关键修复：导入文件时用户已处于 schema 模式，state.mode 不变，
   仅靠 mode watch 无法把大文件内容灌入编辑器；必须直接监听 schemaText */
watch(() => state.schemaText, () => {
  syncEditorFromState()
})

onBeforeUnmount(() => {
  editor?.dispose()
  editor = null
})
</script>

<template>
  <div class="schema-panel glass">
    <div class="schema-header">
      <span class="title-icon">
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none">
          <path d="M8 4 4 12l4 8M16 4l4 8-4 8M14 4l-4 16" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
      </span>
      <div class="header-text">
        <span class="panel-title">Schema 导入</span>
        <span class="hint">粘贴 JSON Schema，解析后自动生成结构树并切回手动编辑微调</span>
      </div>
      <button class="btn import-file-btn" @click="store.importSchemaFile()">
        <svg viewBox="0 0 24 24" width="13" height="13" fill="none">
          <path d="M12 16V4m0 0L8.5 7.5M12 4l3.5 3.5M5 15v4a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-4" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
        导入 .json 文件
      </button>
    </div>

    <div class="editor-host">
      <div class="schema-tools">
        <span class="tools-hint">语法高亮 · 区块折叠 · 自动换行</span>
        <div class="tools-actions">
          <button class="schema-tool-btn" title="格式化（2 空格缩进）" @click="transformSchema('pretty')">
            <svg viewBox="0 0 24 24" width="12.5" height="12.5" fill="none">
              <path d="M12 3l1.7 4.6L18.3 9l-4.6 1.4L12 15l-1.7-4.6L5.7 9l4.6-1.4L12 3z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/>
              <path d="M18.5 14.5l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8.8-2.2z" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/>
            </svg>
            格式化
          </button>
          <button class="schema-tool-btn" title="一键压缩为单行" @click="transformSchema('minify')">
            <svg viewBox="0 0 24 24" width="12.5" height="12.5" fill="none">
              <path d="M8 3.5V7H4.5M16 3.5V7h3.5M8 20.5V17H4.5M16 20.5V17h3.5" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
            压缩
          </button>
        </div>
      </div>
      <div ref="container" class="monaco-host"></div>
    </div>

    <div class="schema-footer">
      <button class="btn btn-primary full" :disabled="!state.schemaText.trim()" @click="store.parseSchema()">
        📄 解析为结构树
      </button>
    </div>
  </div>
</template>

<style scoped>
.schema-panel {
  flex: 1;
  min-width: 420px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.schema-header {
  display: flex;
  align-items: center;
  gap: 11px;
  padding: 13px 16px;
  border-bottom: 1px solid var(--divider);
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

.header-text {
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.import-file-btn {
  margin-left: auto;
  padding: 6px 12px;
  font-size: 11.5px;
  flex-shrink: 0;
}

.editor-host {
  flex: 1;
  min-height: 0;
  padding: 8px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.schema-tools {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 0 2px;
}

.tools-hint {
  font-size: 10.5px;
  letter-spacing: 0.3px;
  color: var(--text-placeholder);
  white-space: nowrap;
}

.tools-actions {
  display: flex;
  align-items: center;
  gap: 6px;
}

.schema-tool-btn {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  height: 25px;
  padding: 0 10px;
  font-size: 11px;
  font-weight: 500;
  color: var(--text-secondary);
  background: var(--inner-bg);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: var(--radius-control);
}

.schema-tool-btn:hover {
  color: var(--text-primary);
  background: var(--inner-bg-hover);
}

.monaco-host {
  flex: 1;
  min-height: 0;
  width: 100%;
  border-radius: var(--radius-card);
  overflow: hidden;
}

.schema-footer {
  padding: 12px 16px 15px;
  border-top: 1px solid var(--divider);
}

.full {
  width: 100%;
  padding: 10px;
  font-size: 13px;
}
</style>
