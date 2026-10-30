import * as monaco from 'monaco-editor'
// monaco-editor 0.52+ 的 package.json exports 将 `monaco-editor/*.js` 映射到 `./esm/vs/*.js`，
// 因此这里不能再带 esm/vs 前缀，否则会被解析成 ./esm/vs/esm/vs/... 而失败
import editorWorker from 'monaco-editor/editor/editor.worker.js?worker'
import jsonWorker from 'monaco-editor/language/json/json.worker.js?worker'

  ; (self as unknown as { MonacoEnvironment?: unknown }).MonacoEnvironment = {
    getWorker(_workerId: string, label: string) {
      if (label === 'json') return new jsonWorker()
      return new editorWorker()
    },
  }

export { monaco }
