import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { ArrowUp, Check, CircleDot, ExternalLink, FlaskConical, Lightbulb, LoaderCircle, MessageCircle, Orbit, Pencil, Play, Settings, Users, X } from 'lucide-react'
import './Room.css'

const RoundTableScene = lazy(() => import('./RoundTableScene'))

type Agent = { id: string; name: string; role: string; color: string; initials: string; voice: string }
type Idea = { id: string; author: string; role: string; text: string; color: string }
type DiscussionReply = { agent: Agent | null; text: string; human?: boolean }
type Research = { text: string; sources: Array<{ title?: string; uri?: string }> }

const agents: Agent[] = [
  { id: 'maya', name: 'מאיה', role: 'החיובית', color: '#e56b47', initials: 'מ', voice: 'רואה את הפוטנציאל, מחזקת את הרעיון ומסבירה למה הוא יכול לעבוד.' },
  { id: 'ori', name: 'אורי', role: 'המתנגד', color: '#4f7cac', initials: 'א', voice: 'מאתגר את הרעיון מהכיוון ההפוך, מוצא חולשות ומציע תיקונים מעשיים.' },
  { id: 'tamar', name: 'תמר', role: 'האופטימית', color: '#7c6bb2', initials: 'ת', voice: 'מחפשת את התרחיש הטוב ביותר, הזדמנויות גדולות ואיך להפוך חזון למציאות.' },
  { id: 'levi', name: 'לוי', role: 'הפסימי', color: '#d19a3b', initials: 'ל', voice: 'מזהה סיכונים, כשלים ותסריטי קצה כדי שנבנה רעיון עמיד יותר.' },
]

// Web Crypto Helper for Encrypted Key Storage (AES-GCM 256-bit)
const ENCRYPT_SALT = 'FutureAmarel-2026-Brainstorm-Salt'
const ENCRYPT_PASS = 'Brainstorm-Roundtable-Secure-Vault'

async function deriveAesKey(): Promise<CryptoKey> {
  const enc = new TextEncoder()
  const baseKey = await window.crypto.subtle.importKey(
    'raw',
    enc.encode(ENCRYPT_PASS),
    { name: 'PBKDF2' },
    false,
    ['deriveKey']
  )
  return await window.crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: enc.encode(ENCRYPT_SALT),
      iterations: 100000,
      hash: 'SHA-256',
    },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  )
}

async function encryptApiKey(plainKey: string): Promise<string> {
  const key = await deriveAesKey()
  const iv = window.crypto.getRandomValues(new Uint8Array(12))
  const encoded = new TextEncoder().encode(plainKey)
  const cipher = await window.crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoded)
  const combined = new Uint8Array(iv.length + cipher.byteLength)
  combined.set(iv, 0)
  combined.set(new Uint8Array(cipher), iv.length)
  let binary = ''
  for (let index = 0; index < combined.length; index++) binary += String.fromCharCode(combined[index])
  return btoa(binary)
}

async function decryptApiKey(cipherBase64: string): Promise<string> {
  try {
    if (!cipherBase64) return ''
    const raw = atob(cipherBase64)
    const combined = new Uint8Array(raw.length)
    for (let i = 0; i < raw.length; i++) combined[i] = raw.charCodeAt(i)
    if (combined.length <= 12) return ''
    const iv = combined.slice(0, 12)
    const data = combined.slice(12)
    const key = await deriveAesKey()
    const decrypted = await window.crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, data)
    return new TextDecoder().decode(decrypted)
  } catch {
    return /^AIza[\w-]+$/.test(cipherBase64) ? cipherBase64 : ''
  }
}

if (typeof window !== 'undefined' && !window.localAI) {
  let webKey = ''

  const loadWebKey = async () => {
    if (webKey) return
    try {
      const stored = localStorage.getItem('FUTURE_AMAREL_ENC_KEY') || localStorage.getItem('FUTURE_AMAREL_KEY') || ''
      if (stored) webKey = await decryptApiKey(stored)
    } catch {
      webKey = ''
    }
  }
  
  const callModel = async (model: string, key: string, body: unknown) => {
    return await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify(body),
    })
  }

  const tryAllModels = async (key: string, body: unknown) => {
    // Prioritize Gemini 3.8 Flash, with fallback to 2.5, 2.0, and 1.5
    const models = ['gemini-3.8-flash', 'gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-1.5-flash']
    let lastErr = ''
    for (const model of models) {
      try {
        const res = await callModel(model, key, body)
        if (res.ok) {
          const data = await res.json()
          return { ok: true, data }
        }
        const text = await res.text()
        lastErr = `שגיאה מ-Gemini (${model} - ${res.status}): ${text.slice(0, 160)}`
        if (res.status === 400 && text.includes('API_KEY_INVALID')) {
          return { ok: false, error: 'מפתח ה-API אינו תקין. בדקו שהעתקתם את המפתח המלא מ-Google AI Studio.' }
        }
      } catch (e: unknown) {
        lastErr = e instanceof Error ? e.message : 'שגיאת תקשורת'
      }
    }
    return { ok: false, error: lastErr }
  }

  window.localAI = {
    status: async () => {
      await loadWebKey()
      return { configured: Boolean(webKey) }
    },
    setKey: async (value: string) => {
      const next = String(value || '').trim()
      if (!next) return { configured: false, ok: false, error: 'מפתח Gemini ריק' }
      
      // Test the key securely over HTTPS before saving
      const testResult = await tryAllModels(next, {
        contents: [{ parts: [{ text: 'שלום' }] }],
      })

      if (!testResult.ok) {
        return { configured: false, ok: false, error: testResult.error || 'לא ניתן לאמת את המפתח מול Google' }
      }

      try {
        const encrypted = await encryptApiKey(next)
        localStorage.setItem('FUTURE_AMAREL_ENC_KEY', encrypted)
        localStorage.removeItem('FUTURE_AMAREL_KEY')
      } catch {
        return { configured: Boolean(webKey), ok: false, error: 'לא ניתן לשמור את המפתח מוצפן בדפדפן. יש לאפשר אחסון מקומי ולנסות שוב.' }
      }
      webKey = next
      return { configured: true, ok: true }
    },
    research: async (topic: string) => {
      await loadWebKey()
      if (!webKey) return { configured: false, ok: false, error: 'נדרש מפתח Gemini' }
      
      // 1. Try with google_search tool
      let res = await tryAllModels(webKey, {
        contents: [{ parts: [{ text: `חקור את הנושא הבא ברשת לפני סיעור מוחות: ${topic}. החזר בעברית תקציר קצר ומדויק, מסודר לקריאה, של 4-6 עובדות, מגמות או הזדמנויות עדכניות. פתח בכותרת "תמונת מצב", אחריה השתמש בשורות קצרות עם תבליט "•", ולסיום הוסף שורה "מה זה אומר לסיעור" עם מסקנה אחת. ציין את מקור המידע ליד הטענה הרלוונטית, ואל תמציא עובדות.` }] }],
        tools: [{ google_search: {} }],
      })

      // 2. If rejected with tool, try plain prompt
      if (!res.ok) {
        res = await tryAllModels(webKey, {
          contents: [{ parts: [{ text: `סכם ידע, עובדות, מגמות והזדמנויות מרכזיות בנושא הבא לפני סיעור מוחות: ${topic}. פתח בכותרת "תמונת מצב", אחריה שורות תבליט "•", ולסיום "מה זה אומר לסיעור" עם מסקנה מעשית אחת.` }] }],
        })
      }

      if (!res.ok) {
        return { configured: true, ok: false, error: res.error }
      }

      const candidate = res.data?.candidates?.[0]
      const rawSources = candidate?.groundingMetadata?.groundingChunks ?? []
      interface WebChunk { web?: { title?: string; uri?: string } }
      const sources = (rawSources as WebChunk[]).map((c) => c.web).filter((w): w is { title?: string; uri?: string } => Boolean(w)).slice(0, 5)
      return { configured: true, ok: true, text: candidate?.content?.parts?.[0]?.text || '', sources }
    },
    generate: async (prompt: string) => {
      await loadWebKey()
      if (!webKey) return { configured: false, ok: false, error: 'נדרש מפתח Gemini' }
      const res = await tryAllModels(webKey, {
        contents: [{ parts: [{ text: prompt }] }],
      })
      if (!res.ok) {
        return { configured: true, ok: false, error: res.error }
      }
      return { configured: true, ok: true, text: res.data?.candidates?.[0]?.content?.parts?.[0]?.text || '[]' }
    },
  }
}

function App() {
  const [topic, setTopic] = useState('')
  const [humanName, setHumanName] = useState('את/ה')
  const [tempName, setTempName] = useState('את/ה')
  const [isEditingName, setIsEditingName] = useState(false)
  const [ideas, setIdeas] = useState<Idea[]>([])
  const [humanThought, setHumanThought] = useState('')
  const [aiConfigured, setAiConfigured] = useState<boolean | null>(null)
  const [apiKeyInput, setApiKeyInput] = useState('')
  const [isSavingKey, setIsSavingKey] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [isThinking, setIsThinking] = useState(false)
  const [round, setRound] = useState(1)
  const [discussion, setDiscussion] = useState<{ idea: Idea; replies: DiscussionReply[] } | null>(null)
  const [discussionThought, setDiscussionThought] = useState('')
  const [isDiscussing, setIsDiscussing] = useState(false)
  const [notice, setNotice] = useState('')
  const [research, setResearch] = useState<Research | null>(null)
  const [tab, setTab] = useState<'chat' | 'ideas' | 'research'>('chat')
  const [thinkingPhase, setThinkingPhase] = useState('מכינים את השולחן')
  const [selectedAgent, setSelectedAgent] = useState<string | null>(null)
  const repliesEndRef = useRef<HTMLDivElement>(null)
  const settingsRef = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    repliesEndRef.current?.scrollIntoView({ block: 'nearest', behavior: 'instant' })
  }, [discussion, isDiscussing, tab])

  useEffect(() => {
    if (showSettings) settingsRef.current?.showModal()
    else settingsRef.current?.close()
  }, [showSettings])

  useEffect(() => {
    if (!window.localAI) return
    window.localAI.status().then(({ configured }) => {
      setAiConfigured(configured)
    })
  }, [])

  const saveApiKey = async () => {
    if (!apiKeyInput.trim() || isSavingKey) return
    setIsSavingKey(true)
    try {
      const result = await window.localAI.setKey(apiKeyInput)
      if (!result.ok) {
        setNotice(result.error ?? 'לא ניתן לשמור את המפתח')
        return
      }
      setAiConfigured(true)
      setApiKeyInput('')
      setNotice('Gemini מחובר. המפתח נשמר בצורה מוצפנת במכשיר הזה.')
      setShowSettings(false)
    } catch {
      setNotice('לא ניתן לאמת או לשמור את המפתח. נסו שוב.')
    } finally {
      setIsSavingKey(false)
    }
  }

  const saveHumanName = () => {
    const trimmed = tempName.trim()
    if (trimmed) setHumanName(trimmed)
    setIsEditingName(false)
  }

  const addHumanIdea = () => {
    const text = humanThought.trim()
    if (!text) return
    setIdeas((current) => [...current, { id: `human-${Date.now()}`, author: humanName || 'המנחה', role: 'המנחה', color: '#263f5b', text }])
    setHumanThought('')
    setNotice('הרעיון שלך נוסף לשולחן')
  }

  const runRound = async () => {
    if (isThinking || isDiscussing) return
    const activeTopic = topic.trim() || 'איך נייצר מנוע צמיחה חדש ופורץ דרך בחמש השנים הקרובות?'
    if (!topic.trim()) {
      setTopic(activeTopic)
    }

    if (aiConfigured !== true) {
      setNotice('Gemini אינו מחובר. לחצו על גלגל השיניים כדי לחבר מפתח.')
      setShowSettings(true)
      return
    }
    setIsThinking(true)
    setNotice('')
    setDiscussion(null)
    try {
      setThinkingPhase('סורקים את הרשת')
      setNotice('הסוכנים אוספים הקשר עדכני לפני הסיעור…')
      const researchResult = await window.localAI.research(activeTopic)
      if (!researchResult.ok) throw new Error(researchResult.error ?? 'המחקר נכשל')
      setResearch({ text: researchResult.text ?? '', sources: researchResult.sources ?? [] })
      setThinkingPhase('מחברים נקודות ומציתים רעיונות')
      const prompt = `אתה מנהל סיעור מוחות בעברית. הנושא: ${activeTopic}. קודם קיבלת את המחקר הבא מהרשת:\n${researchResult.text}\nהשתמש בו כהקשר, אבל אל תעתיק אותו. החזר JSON בלבד כמערך של 4 אובייקטים עם השדות author, role, text. כל רעיון צריך להיות שונה, קונקרטי, מפתיע ומבוסס על הזדמנות אמיתית. הסוכנים מייצרים רעיונות מזוויות שונות, אך אין צורך בהצבעות. הסוכנים: ${agents.map((agent) => `${agent.id}: ${agent.name} (${agent.role}: ${agent.voice})`).join('; ')}`
      const result = await window.localAI.generate(prompt)
      if (!result.ok) throw new Error(result.error ?? 'Gemini לא החזיר תשובה')
      const raw = result.text ?? '[]'
      const generated = JSON.parse(raw.replace(/```json|```/g, '').trim()) as Array<{ author: string; role: string; text: string }>
      const generatedIdeas = generated.map((idea, index) => ({
        id: `gemini-${Date.now()}-${index}`,
        author: idea.author,
        role: idea.role,
        text: idea.text,
        color: agents[index]?.color ?? '#4f7cac',
      }))
      setIdeas(generatedIdeas)
      setTab('ideas')
      setThinkingPhase('מעלים רעיונות')
      setNotice('הסבב הושלם! 4 רעיונות טריים הונחו על השולחן.')
    } catch (error) {
      setNotice(`Gemini לא התחבר: ${error instanceof Error ? error.message : 'שגיאה לא ידועה'}`)
    }
    setRound((value) => value + 1)
    setIsThinking(false)
    setThinkingPhase('מכינים את השולחן')
  }

  const discussIdea = async (idea: Idea) => {
    if (isThinking || isDiscussing) return
    if (aiConfigured !== true) {
      setNotice('נדרש חיבור ל-Gemini כדי לפתוח דיון.')
      setShowSettings(true)
      return
    }
    setSelectedAgent(null)
    setTab('chat')
    setIsDiscussing(true)
    setDiscussion({ idea, replies: [] })
    try {
      const prompt = `אנחנו מנהלים דיון שולחן עגול על הרעיון הבא: ${idea.text}. החזר JSON בלבד כמערך של 4 אובייקטים עם השדות agent ו-text. agent חייב להיות אחד מאלה: maya, ori, tamar, levi. החזר תגובה אחת לכל סוכן: maya חיובית ומסבירה למה הרעיון יכול לעבוד, ori מתנגד ומציג את הצד ההפוך, tamar אופטימית ומציירת תרחיש הצלחה, levi פסימי ומזהה סיכונים. כל סוכן יגיב בעברית ויוסיף ערך חדש.`
      const result = await window.localAI.generate(prompt)
      if (!result.ok) throw new Error(result.error ?? 'הדיון נכשל')
      const generated = JSON.parse((result.text ?? '[]').replace(/```json|```/g, '').trim()) as Array<{ agent: string; text: string }>
      setDiscussion({ idea, replies: generated.map((reply) => ({ agent: agents.find((agent) => agent.id === reply.agent) ?? agents[0], text: reply.text })) })
    } catch (error) { setNotice(`הדיון לא התחבר ל-Gemini: ${error instanceof Error ? error.message : 'שגיאה לא ידועה'}`) }
    finally { setIsDiscussing(false) }
  }

  const sendDiscussionMessage = async () => {
    const text = discussionThought.trim()
    if (!text || isDiscussing || isThinking) return
    if (aiConfigured !== true) {
      setNotice('Gemini אינו מחובר. לא נשלחה תגובה.')
      setShowSettings(true)
      return
    }
    const activeDiscussion = discussion ?? {
      idea: { id: `open-${Date.now()}`, author: humanName, role: 'המנחה', color: '#319b83', text: topic.trim() || text },
      replies: [],
    }
    const humanReply: DiscussionReply = { agent: null, text, human: true }
    setDiscussion({ ...activeDiscussion, replies: [...activeDiscussion.replies, humanReply] })
    setDiscussionThought('')
    setIsDiscussing(true)
    try {
      const transcript = [...activeDiscussion.replies, humanReply].map((reply) => `${reply.human ? (humanName || 'המנחה') : reply.agent?.name}: ${reply.text}`).join('\n')
      const respondents = selectedAgent ? agents.filter((agent) => agent.id === selectedAgent) : agents
      const prompt = `אנחנו בדיון חי בעברית על הנושא: ${activeDiscussion.idea.text}. הקשר מחקרי: ${research?.text ?? 'טרם בוצע מחקר'}. הנה היסטוריית השיחה:\n${transcript}\nהמנחה (${humanName}) הוסיף עכשיו תגובה. החזר JSON בלבד כמערך של ${respondents.length} אובייקטים עם השדות agent ו-text. החזר תגובה אחת רק לכל סוכן ברשימה: ${respondents.map((agent) => `${agent.id}: ${agent.name}, ${agent.voice}`).join('; ')}. הגב ישירות למה שנאמר והוסף ערך חדש, שאלה או הצעה מעשית.`
      const result = await window.localAI.generate(prompt)
      if (!result.ok) throw new Error(result.error ?? 'הדיון נכשל')
      const generated = JSON.parse((result.text ?? '[]').replace(/```json|```/g, '').trim()) as Array<{ agent: string; text: string }>
      setDiscussion((current) => current ? { ...current, replies: [...current.replies, ...generated.map((reply) => ({ agent: agents.find((agent) => agent.id === reply.agent) ?? agents[0], text: reply.text }))] } : current)
    } catch (error) { setNotice(`התגובה לא התחברה ל-Gemini: ${error instanceof Error ? error.message : 'שגיאה לא ידועה'}`) }
    setIsDiscussing(false)
  }

  const busy = isThinking || isDiscussing
  const chosenAgent = agents.find((agent) => agent.id === selectedAgent)
  const participants = [...agents, { id: 'human', name: humanName, role: 'המנחה', color: '#339c83' }]
  const chooseParticipant = (id: string | null) => {
    setSelectedAgent(id)
    setTab('chat')
  }

  return (
    <main className="app-shell" dir="rtl">
      <header className="topbar">
        <div className="brand"><div className="brand-mark"><Orbit size={27} strokeWidth={1.5} /></div><div><h1>שולחן העתיד</h1><small>סיעור מוחות</small></div></div>
        <div className="session-mark"><span /> חדר 01 <span className="session-separator">/</span> סבב {String(round).padStart(2, '0')}</div>
        <div className="top-actions">
          <button className={`connection-button ${aiConfigured ? 'connected' : ''}`} onClick={() => setShowSettings(true)}><span />{aiConfigured === null ? 'בודק חיבור' : aiConfigured ? 'Gemini מחובר' : 'חיבור Gemini'}</button>
          <button className="icon-button" onClick={() => setShowSettings(true)} aria-label="הגדרות" title="הגדרות"><Settings size={19} /></button>
        </div>
      </header>

      <form className="topic-bar" onSubmit={(event) => { event.preventDefault(); void runRound() }}>
        <div className="topic-label"><Lightbulb size={18} /><label htmlFor="topic-input-box">על השולחן</label></div>
        <input id="topic-input-box" value={topic} onChange={(event) => setTopic(event.target.value)} placeholder="מה האתגר הבא שלנו?" disabled={busy} />
        <button className="primary-button" type="submit" disabled={busy || aiConfigured === null}>{isThinking ? <LoaderCircle size={17} className="spin" /> : <Play size={16} fill="currentColor" />}<span>{isThinking ? 'סיעור בתהליך' : 'התחל סיעור'}</span></button>
      </form>

      <div className="room-layout">
        <section className="room-stage" aria-label="שולחן הדיונים">
          <div className="scene-wrap">
            <Suspense fallback={<div className="scene-loading" role="status"><LoaderCircle className="spin" /> טוען את החדר</div>}>
              <RoundTableScene participants={participants} selectedAgent={selectedAgent} activeAgent={discussion?.replies.at(-1)?.agent?.id ?? null} thinking={busy} onSelect={chooseParticipant} />
            </Suspense>
            <div className="room-hud"><div><span className="room-live"><span /> השולחן פתוח</span><span className="room-count">05 / משתתפים</span></div><span className="dimension-mark">3D <CircleDot size={14} /></span></div>
            {busy && <div className="thinking-status" role="status"><LoaderCircle size={17} className="spin" />{isThinking ? thinkingPhase : chosenAgent ? `${chosenAgent.name} חושב/ת` : 'הצוות חושב'}</div>}
          </div>
          <footer className="participant-bar">
            <div className="participant-heading"><span>סביב השולחן</span><small>{chosenAgent ? `בשיחה עם ${chosenAgent.name}` : 'בשיחה עם כולם'}</small></div>
            <div className="participant-options" role="group" aria-label="נמעני השיחה">
              <button className={`participant-option everyone ${!selectedAgent ? 'is-selected' : ''}`} aria-label="שיחה עם כולם" aria-pressed={!selectedAgent} onClick={() => chooseParticipant(null)}><span className="avatar"><Users size={18} /></span><span><strong>כולם</strong><small>שולחן פתוח</small></span></button>
              {agents.map((agent) => <button key={agent.id} className={`participant-option ${selectedAgent === agent.id ? 'is-selected' : ''}`} aria-label={`שיחה עם ${agent.name}`} aria-pressed={selectedAgent === agent.id} onClick={() => chooseParticipant(selectedAgent === agent.id ? null : agent.id)}><span className="avatar" style={{ background: agent.color }}>{agent.initials}</span><span><strong>{agent.name}</strong><small>{agent.role}</small></span></button>)}
            </div>
          </footer>
        </section>

        <aside className="conversation-dock" aria-label="שיחה ורעיונות">
          <div className="dock-heading"><div><span className="section-kicker">מרחב משותף</span><h2>{chosenAgent ? `שיחה עם ${chosenAgent.name}` : 'השיחה שלנו'}</h2></div><MessageCircle size={23} strokeWidth={1.4} /></div>
          <div className="dock-tabs" role="tablist" aria-label="תוכן השולחן">
            <button id="tab-chat" role="tab" aria-selected={tab === 'chat'} aria-controls="panel-chat" onClick={() => setTab('chat')}><MessageCircle size={16} />שיחה</button>
            <button id="tab-ideas" role="tab" aria-selected={tab === 'ideas'} aria-controls="panel-ideas" onClick={() => setTab('ideas')}><Lightbulb size={16} />רעיונות <span className="tab-count">{ideas.length}</span></button>
            <button id="tab-research" role="tab" aria-selected={tab === 'research'} aria-controls="panel-research" onClick={() => setTab('research')}><FlaskConical size={16} />מחקר{research && <span className="research-ready" />}</button>
          </div>
          {notice && <div className="notice" role="status"><span>{notice}</span><button className="icon-button" aria-label="סגירת הודעה" title="סגירת הודעה" onClick={() => setNotice('')}><X size={14} /></button></div>}

          <div className="dock-content" role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`} tabIndex={0}>
            {tab === 'chat' && <>
              {discussion && <div className="discussion-context"><span>{discussion.idea.text}</span><button className="icon-button" title="סיום דיון" aria-label="סיום דיון" disabled={busy} onClick={() => setDiscussion(null)}><X size={15} /></button></div>}
              {!discussion && <div className="empty-conversation"><div className="empty-symbol"><MessageCircle size={30} strokeWidth={1.3} /><span /></div><span className="section-kicker">ארבע נקודות מבט. שולחן אחד.</span><h3>{chosenAgent ? `מה דעתך, ${chosenAgent.name}?` : 'מה נרצה לשנות?'}</h3><div className="empty-roster">{agents.map((agent) => <span key={agent.id} className="avatar" style={{ background: agent.color }}>{agent.initials}</span>)}</div><p>{chosenAgent?.voice ?? 'מאיה, אורי, תמר ולוי סביב השולחן.'}</p></div>}
              <div className="reply-list" role="log" aria-label="היסטוריית השיחה" aria-live="polite" aria-relevant="additions text">
                {discussion?.replies.map((reply, index) => <article className={`reply ${reply.human ? 'human-reply' : ''}`} key={index}><span className="avatar" style={{ background: reply.human ? '#339c83' : reply.agent?.color }}>{reply.human ? humanName.slice(0, 1) : reply.agent?.initials}</span><div><div className="reply-byline"><strong>{reply.human ? humanName : reply.agent?.name}</strong><small>{reply.human ? 'המנחה' : reply.agent?.role}</small></div><p>{reply.text}</p></div></article>)}
              </div>
              {isDiscussing && <div className="reply-pending"><LoaderCircle size={15} className="spin" /><span>מגבשים תשובה...</span></div>}
              <div ref={repliesEndRef} />
            </>}
            {tab === 'ideas' && <div className="idea-list">
              {!ideas.length && <div className="empty-state"><Lightbulb size={30} strokeWidth={1.3} /><h3>מקום לרעיון הבא</h3><p>{isThinking ? thinkingPhase : 'עדיין אין רעיונות בסבב הזה.'}</p></div>}
              {ideas.map((idea, index) => <article className="idea-card" key={idea.id}><div className="idea-person"><span className="avatar" style={{ background: idea.color }}>{idea.author.slice(0, 1)}</span><div><strong>{idea.author}</strong><small>{idea.role}</small></div><span className="idea-number">{String(index + 1).padStart(2, '0')}</span></div><p>{idea.text}</p><button className="discussion-button" disabled={busy} onClick={() => void discussIdea(idea)}><MessageCircle size={15} />פתח דיון</button></article>)}
            </div>}
            {tab === 'research' && (research ? <div className="research-content"><span className="section-kicker">תמונת מצב</span><h3>מה למדנו מהרשת</h3><p className="research-copy">{research.text}</p>{research.sources.length > 0 && <div className="source-list"><h4>מקורות</h4>{research.sources.filter((source) => /^https?:\/\//i.test(source.uri ?? '')).map((source, index) => <a href={source.uri} target="_blank" rel="noreferrer" key={index}>{source.title || source.uri}<ExternalLink size={14} /></a>)}</div>}</div> : <div className="empty-state"><FlaskConical size={30} strokeWidth={1.3} /><h3>תמונת המצב</h3><p>{isThinking ? 'המחקר בתהליך...' : 'טרם בוצע מחקר לסבב הזה.'}</p></div>)}
          </div>

          {tab !== 'research' && <form className="composer" onSubmit={(event) => { event.preventDefault(); if (tab === 'ideas') addHumanIdea(); else void sendDiscussionMessage() }}>
            <div className="composer-target"><span className="participant-dot" style={{ background: chosenAgent?.color ?? '#339c83' }} />{tab === 'ideas' ? 'הרעיון שלי' : chosenAgent ? `אל ${chosenAgent.name}` : 'אל כל השולחן'}</div>
            <div className="composer-field"><textarea aria-label={tab === 'ideas' ? 'רעיון חדש' : 'הודעה לשולחן'} value={tab === 'ideas' ? humanThought : discussionThought} onChange={(event) => tab === 'ideas' ? setHumanThought(event.target.value) : setDiscussionThought(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); if (!busy) { if (tab === 'ideas') addHumanIdea(); else void sendDiscussionMessage() } } }} placeholder={tab === 'ideas' ? 'יש לי רעיון...' : 'מה עובר לך בראש?'} rows={2} /><button type="submit" className="send-button" disabled={busy || !(tab === 'ideas' ? humanThought : discussionThought).trim()} aria-label={tab === 'ideas' ? 'הוספת רעיון' : 'שליחת תגובה'} title={tab === 'ideas' ? 'הוספת רעיון' : 'שליחת תגובה'}>{isDiscussing ? <LoaderCircle className="spin" size={19} /> : <ArrowUp size={20} />}</button></div>
          </form>}
          <div className="human-identity"><span className="avatar human-avatar">{humanName.slice(0, 1)}</span>{isEditingName ? <form className="name-edit-form" onSubmit={(event) => { event.preventDefault(); saveHumanName() }}><input aria-label="השם שלי" maxLength={24} value={tempName} onChange={(event) => setTempName(event.target.value)} onKeyDown={(event) => { if (event.key === 'Escape') setIsEditingName(false) }} autoFocus /><button className="icon-button" type="submit" title="שמירת שם" aria-label="שמירת שם"><Check size={17} /></button></form> : <><div><strong>{humanName}</strong><small>המנחה</small></div><button className="icon-button" title="עריכת השם שלי" aria-label="עריכת השם שלי" onClick={() => { setTempName(humanName); setIsEditingName(true) }}><Pencil size={15} /></button></>}<span className="human-presence" /></div>
        </aside>
      </div>

      <dialog ref={settingsRef} className="settings-modal" aria-labelledby="settings-title" onCancel={() => setShowSettings(false)} onClose={() => setShowSettings(false)} onKeyDown={(event) => { if (event.key === 'Escape') { event.preventDefault(); setShowSettings(false) } }}>
        <button className="icon-button close-button" onClick={() => setShowSettings(false)} title="סגירת הגדרות" aria-label="סגירת הגדרות"><X size={20} /></button>
        <span className="section-kicker">הגדרות החדר</span><h2 id="settings-title">חיבור Gemini</h2>
        <div className={`connection-state ${aiConfigured ? 'connected' : ''}`}><span />{aiConfigured ? 'Gemini מחובר' : 'נדרש מפתח API'}</div>
        {notice && <p className="modal-notice" role="status">{notice}</p>}
        <form onSubmit={(event) => { event.preventDefault(); void saveApiKey() }}><label htmlFor="api-key">Gemini API key</label><input id="api-key" className="api-key-input" type="password" autoComplete="off" spellCheck={false} value={apiKeyInput} onChange={(event) => setApiKeyInput(event.target.value)} placeholder="AIzaSy..." dir="ltr" /><button className="primary-button full-button" type="submit" disabled={!apiKeyInput.trim() || isSavingKey}>{isSavingKey ? <LoaderCircle size={17} className="spin" /> : <Check size={17} />}{isSavingKey ? 'מאמת חיבור...' : 'שמירה ואימות חיבור'}</button></form>
        <a className="key-help-link" href="https://aistudio.google.com/app/apikey" target="_blank" rel="noreferrer">קבלת מפתח ב-Google AI Studio <ExternalLink size={14} /></a>
      </dialog>
    </main>
  )
}

export default App
