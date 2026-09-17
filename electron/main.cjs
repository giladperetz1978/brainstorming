const { app, BrowserWindow, ipcMain, safeStorage } = require('electron')
const path = require('node:path')
const fs = require('node:fs')

app.setPath('userData', path.join(app.getPath('appData'), 'FutureAmarel'))
app.commandLine.appendSwitch('disable-http-cache')
app.commandLine.appendSwitch('disable-gpu-shader-disk-cache')

let apiKey = process.env.GEMINI_API_KEY || ''
const keyFile = path.join(app.getPath('userData'), 'gemini-key.bin')

function loadStoredKey() {
  if (apiKey || !safeStorage.isEncryptionAvailable() || !fs.existsSync(keyFile)) return
  try {
    apiKey = safeStorage.decryptString(fs.readFileSync(keyFile))
  } catch {
    apiKey = ''
  }
}

function storeKey() {
  if (!apiKey || !safeStorage.isEncryptionAvailable()) return
  fs.mkdirSync(path.dirname(keyFile), { recursive: true })
  fs.writeFileSync(keyFile, safeStorage.encryptString(apiKey))
}

function createWindow() {
  const window = new BrowserWindow({
    width: 1440,
    height: 980,
    minWidth: 960,
    minHeight: 720,
    backgroundColor: '#f2efe9',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  window.loadFile(path.join(__dirname, '..', 'dist', 'index.html'))
}

ipcMain.handle('gemini:status', () => ({ configured: Boolean(apiKey) }))

ipcMain.handle('gemini:set-key', (_event, value) => {
  const nextKey = String(value || '').trim()
  if (!nextKey) return { configured: false, ok: false, error: 'מפתח Gemini ריק' }
  apiKey = nextKey
  storeKey()
  return { configured: true, ok: true }
})

async function callGeminiApi(model, body) {
  return await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

async function askGemini(body) {
  // Test gemini-2.5-flash, fallback to gemini-2.0-flash, then gemini-1.5-flash
  const models = ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-1.5-flash']
  let lastError = ''

  for (const model of models) {
    try {
      const response = await callGeminiApi(model, body)
      if (response.ok) {
        return { configured: true, ok: true, data: await response.json() }
      }
      const details = await response.text()
      lastError = `Gemini (${model}) ${response.status}: ${details.slice(0, 200)}`
      // If unauthorized / invalid key (400 or 403 with specific message), stop immediately
      if (response.status === 400 && details.includes('API_KEY_INVALID')) {
        return { configured: false, ok: false, error: 'מפתח Gemini API אינו תקין. בדקו שהעתקתם את המפתח המלא מ-Google AI Studio.' }
      }
    } catch (err) {
      lastError = err instanceof Error ? err.message : 'שגיאת רשת מול Google'
    }
  }

  return { configured: true, ok: false, error: lastError }
}

ipcMain.handle('gemini:research', async (_event, { topic }) => {
  if (!apiKey) return { configured: false, ok: false, error: 'לא הוגדר מפתח Gemini' }
  
  // Try with Google Search grounding first
  let result = await askGemini({
    contents: [{ parts: [{ text: `חקור את הנושא הבא ברשת לפני סיעור מוחות: ${topic}. החזר בעברית תקציר קצר ומדויק, מסודר לקריאה, של 4-6 עובדות, מגמות או הזדמנויות עדכניות. פתח בכותרת "תמונת מצב", אחריה השתמש בשורות קצרות עם תבליט "•", ולסיום הוסף שורה "מה זה אומר לסיעור" עם מסקנה אחת. ציין את מקור המידע ליד הטענה הרלוונטית, ואל תמציא עובדות.` }] }],
    tools: [{ google_search: {} }],
  })

  // If google_search tool is rejected, fallback without tools
  if (!result.ok) {
    result = await askGemini({
      contents: [{ parts: [{ text: `סכם ידע, עובדות, מגמות והזדמנויות מרכזיות בנושא הבא לפני סיעור מוחות: ${topic}. פתח בכותרת "תמונת מצב", אחריה תבליטים "•", ולסיום "מה זה אומר לסיעור" עם מסקנה מעשית אחת.` }] }],
    })
  }

  if (!result.ok) return result
  const candidate = result.data.candidates?.[0]
  const sources = (candidate?.groundingMetadata?.groundingChunks ?? []).map((chunk) => chunk.web).filter(Boolean).slice(0, 5)
  return { configured: true, ok: true, text: candidate?.content?.parts?.[0]?.text || '', sources }
})

ipcMain.handle('gemini:generate', async (_event, { prompt }) => {
  if (!apiKey) return { configured: false }
  const result = await askGemini({ contents: [{ parts: [{ text: prompt }] }] })
  if (!result.ok) return result
  return { configured: true, ok: true, text: result.data.candidates?.[0]?.content?.parts?.[0]?.text || '[]' }
})

app.whenReady().then(() => {
  loadStoredKey()
  storeKey()
  createWindow()
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow() })
})

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit() })