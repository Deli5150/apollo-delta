import { Wllama } from '/__wllama/index.js'

// The hidden summarizer window (desktop/ai.cjs): loads the model with wllama and writes replies,
// sending each piece back as it comes.

const wllama = new Wllama({ default: '/__wllama/wasm/wllama.wasm' }, { suppressNativeLog: true })
let loadedFile = null
let loading = null

function load(file) {
  if (loadedFile !== file || !loading) {
    loadedFile = file
    loading = (async () => {
      if (wllama.isModelLoaded()) await wllama.exit()
      await wllama.loadModelFromUrl(new URL(`/__model/${encodeURIComponent(file)}`, location.href).href, {
        useCache: false,
        n_ctx: 4096,
        // The GPU when there is one (WebGPU), else the processor's cores.
        n_gpu_layers: wllama.isSupportWebGPU() ? 99 : 0
      })
    })()
    loading.catch(() => {
      loadedFile = null
      loading = null
    })
  }
  return loading
}

const runs = new Map()

window.aiHost.onRun(async ({ id, file, messages, sampling }) => {
  const ctrl = new AbortController()
  runs.set(id, ctrl)
  try {
    await load(file)
    if (ctrl.signal.aborted) return window.aiHost.done(id)
    await wllama.createChatCompletion({
      messages,
      max_tokens: sampling.max_tokens,
      temperature: sampling.temperature,
      top_p: sampling.top_p,
      penalty_repeat: sampling.penalty_repeat,
      penalty_last_n: sampling.penalty_last_n,
      stream: true,
      abortSignal: ctrl.signal,
      onData: (chunk) => {
        const piece = chunk.choices?.[0]?.delta?.content
        if (piece) window.aiHost.token(id, piece)
      }
    })
    window.aiHost.done(id)
  } catch (e) {
    if (ctrl.signal.aborted || /abort/i.test(e?.name ?? '')) window.aiHost.done(id)
    else window.aiHost.done(id, String(e?.message ?? e))
  } finally {
    runs.delete(id)
  }
})

window.aiHost.onStop((id) => runs.get(id)?.abort())
window.aiHost.ready()
