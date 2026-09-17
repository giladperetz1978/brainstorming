import { useEffect, useState } from 'react'
import './App.css'

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

if (typeof window !== 'undefined' && !window.localAI) {
  let webKey = localStorage.getItem('FUTURE_AMAREL_KEY') || ''
  
  const callModel = async (model: string, key: string, body: unknown) => {
    return await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
  }

  const tryAllModels = async (key: string, body: unknown) => {
    const models = ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-1.5-flash']
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
    status: async () => ({ configured: Boolean(webKey) }),
    setKey: async (value: string) => {
      const next = String(value || '').trim()
      if (!next) return { configured: false, ok: false, error: 'מפתח Gemini ריק' }
      
      // Test the key with Gemini API before saving
      const testResult = await tryAllModels(next, {
        contents: [{ parts: [{ text: 'שלום' }] }],
      })

      if (!testResult.ok) {
        return { configured: false, ok: false, error: testResult.error || 'לא ניתן לאמת את המפתח מול Google' }
      }

      webKey = next
      try { localStorage.setItem('FUTURE_AMAREL_KEY', next) } catch { /* ignore */ }
      return { configured: true, ok: true }
    },
    research: async (topic: string) => {
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
  const [showResearch, setShowResearch] = useState(false)
  const [thinkingPhase, setThinkingPhase] = useState('מכינים את השולחן')

  useEffect(() => {
    if (!window.localAI) return
    window.localAI.status().then(({ configured }) => {
      setAiConfigured(configured)
      if (!configured) setShowSettings(true)
    })
  }, [])

  const saveApiKey = async () => {
    if (!apiKeyInput.trim() || isSavingKey) return
    setIsSavingKey(true)
    const result = await window.localAI.setKey(apiKeyInput)
    setIsSavingKey(false)
    if (!result.ok) {
      setNotice(result.error ?? 'לא ניתן לשמור את המפתח')
      return
    }
    setAiConfigured(true)
    setApiKeyInput('')
    setNotice('Gemini מחובר. המפתח נשמר בצורה מוצפנת במחשב הזה.')
    setShowSettings(false)
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
    if (aiConfigured !== true) {
      setNotice('Gemini אינו מחובר. הפעילו מחדש עם מפתח API תקין בטרמינל.')
      return
    }
    setDiscussion({ idea, replies: [] })
    try {
      const prompt = `אנחנו מנהלים דיון שולחן עגול על הרעיון הבא: ${idea.text}. החזר JSON בלבד כמערך של 4 אובייקטים עם השדות agent ו-text. agent חייב להיות אחד מאלה: maya, ori, tamar, levi. החזר תגובה אחת לכל סוכן: maya חיובית ומסבירה למה הרעיון יכול לעבוד, ori מתנגד ומציג את הצד ההפוך, tamar אופטימית ומציירת תרחיש הצלחה, levi פסימי ומזהה סיכונים. כל סוכן יגיב בעברית ויוסיף ערך חדש.`
      const result = await window.localAI.generate(prompt)
      if (!result.ok) throw new Error(result.error ?? 'הדיון נכשל')
      const generated = JSON.parse((result.text ?? '[]').replace(/```json|```/g, '').trim()) as Array<{ agent: string; text: string }>
      setDiscussion({ idea, replies: generated.map((reply) => ({ agent: agents.find((agent) => agent.id === reply.agent) ?? agents[0], text: reply.text })) })
    } catch (error) { setNotice(`הדיון לא התחבר ל-Gemini: ${error instanceof Error ? error.message : 'שגיאה לא ידועה'}`) }
  }

  const sendDiscussionMessage = async () => {
    const text = discussionThought.trim()
    if (!text || !discussion || isDiscussing) return
    const humanReply: DiscussionReply = { agent: null, text, human: true }
    setDiscussion((current) => current ? { ...current, replies: [...current.replies, humanReply] } : current)
    setDiscussionThought('')
    if (aiConfigured !== true) {
      setNotice('Gemini אינו מחובר. לא נשלחה תגובה.')
      return
    }
    setIsDiscussing(true)
    try {
      const transcript = [...(discussion.replies ?? []), humanReply].map((reply) => `${reply.human ? (humanName || 'המנחה') : reply.agent?.name}: ${reply.text}`).join('\n')
      const prompt = `אנחנו בדיון חי בעברית על הרעיון: ${discussion.idea.text}. הנה היסטוריית השיחה:\n${transcript}\nהמנחה (${humanName}) הוסיף עכשיו תגובה. החזר JSON בלבד כמערך של 4 אובייקטים עם השדות agent ו-text. החזר תגובה אחת לכל agent: maya, ori, tamar, levi. כל אחד יגיב ישירות למה שנאמר לפי העמדה שלו: maya חיובית, ori מתנגד, tamar אופטימית, levi פסימי. הם צריכים להוסיף ערך חדש, שאלה או הצעה מעשית.`
      const result = await window.localAI.generate(prompt)
      if (!result.ok) throw new Error(result.error ?? 'הדיון נכשל')
      const generated = JSON.parse((result.text ?? '[]').replace(/```json|```/g, '').trim()) as Array<{ agent: string; text: string }>
      setDiscussion((current) => current ? { ...current, replies: [...current.replies, ...generated.map((reply) => ({ agent: agents.find((agent) => agent.id === reply.agent) ?? agents[0], text: reply.text }))] } : current)
    } catch (error) { setNotice(`התגובה לא התחברה ל-Gemini: ${error instanceof Error ? error.message : 'שגיאה לא ידועה'}`) }
    setIsDiscussing(false)
  }

  return (
    <main className="app-shell" dir="rtl">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">🧠⚡</span>
          <div>
            <strong>סיעור מוחות</strong>
            <small>שולחן עגול חכם · 4 מוחות AI ומשתתף אנושי</small>
          </div>
        </div>
        <div className="top-actions">
          <span className="live-dot">●</span>
          <span>סשן מקומי</span>
          <button className="icon-button" onClick={() => setShowSettings(true)} aria-label="הגדרות">⚙</button>
        </div>
      </header>

      <section className="hero-section">
        <div className="eyebrow">סבב {String(round).padStart(2, '0')} · שולחן סיעור חי</div>
        <h1 className="hero-title" onClick={() => document.getElementById('topic-input-box')?.focus()}>
          תלחץ כאן ונתחיל ליצור
        </h1>
        <div className="topic-input-container">
          <span className="topic-prompt-icon">💡</span>
          <input
            id="topic-input-box"
            className="topic-input-field"
            value={topic}
            onChange={(event) => setTopic(event.target.value)}
            placeholder="תלחץ כאן ונתחיל ליצור..."
            onKeyDown={(event) => {
              if (event.key === 'Enter') void runRound()
            }}
          />
          {topic && (
            <button className="clear-btn" onClick={() => setTopic('')} title="נקה">✕</button>
          )}
        </div>
        <div className="hero-meta">
          <span>5 משתתפים מסביב לשולחן · חשיבה רב-ממדית · מחקר מבוסס רשת</span>
          <span className="status-pill"><i /> {isThinking ? 'המוחות בסערת רעיונות' : 'מוכנים להזנקת הסיעור'}</span>
        </div>
      </section>

      <section className="table-stage">
        <div className="table-top-perspective">
          <div className={`realistic-round-table ${isThinking ? 'storming-table' : ''}`}>
            <div className="table-wood-rim" />
            <div className="table-wood-grain" />

            {/* Top-down Seating Pods */}
            <div className="seat-pod seat-ori">
              <div className="chair-overhead" />
              <div className="desk-placemat">
                <div className="coffee-cup" />
                <div className="notepad" />
              </div>
              <div className="seat-badge" style={{ borderColor: agents[1].color }}>
                <div className="seat-avatar" style={{ background: agents[1].color }}>{agents[1].initials}</div>
                <div className="seat-details">
                  <strong>{agents[1].name}</strong>
                  <small>{agents[1].role}</small>
                </div>
              </div>
            </div>

            <div className="seat-pod seat-maya">
              <div className="chair-overhead" />
              <div className="desk-placemat">
                <div className="coffee-cup" />
                <div className="notepad" />
              </div>
              <div className="seat-badge" style={{ borderColor: agents[0].color }}>
                <div className="seat-avatar" style={{ background: agents[0].color }}>{agents[0].initials}</div>
                <div className="seat-details">
                  <strong>{agents[0].name}</strong>
                  <small>{agents[0].role}</small>
                </div>
              </div>
            </div>

            <div className="seat-pod seat-tamar">
              <div className="chair-overhead" />
              <div className="desk-placemat">
                <div className="coffee-cup" />
                <div className="notepad" />
              </div>
              <div className="seat-badge" style={{ borderColor: agents[2].color }}>
                <div className="seat-avatar" style={{ background: agents[2].color }}>{agents[2].initials}</div>
                <div className="seat-details">
                  <strong>{agents[2].name}</strong>
                  <small>{agents[2].role}</small>
                </div>
              </div>
            </div>

            <div className="seat-pod seat-human">
              <div className="chair-overhead human-chair" />
              <div className="desk-placemat">
                <div className="laptop-overhead" />
                <div className="coffee-cup" />
              </div>
              <div className="seat-badge human-badge">
                <div className="seat-avatar human-avatar">{humanName.slice(0, 2)}</div>
                <div className="seat-details">
                  {isEditingName ? (
                    <div className="name-edit-form" onClick={(e) => e.stopPropagation()}>
                      <input
                        className="name-edit-input"
                        value={tempName}
                        onChange={(e) => setTempName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') saveHumanName()
                          if (e.key === 'Escape') setIsEditingName(false)
                        }}
                        autoFocus
                      />
                      <button className="name-save-btn" onClick={saveHumanName} title="שמור">✓</button>
                    </div>
                  ) : (
                    <div
                      className="name-clickable-row"
                      onClick={() => { setTempName(humanName); setIsEditingName(true) }}
                      title="לחצו לעריכת שמכם בשולחן"
                    >
                      <strong>{humanName}</strong>
                      <span className="edit-pill">✏️ עריכה</span>
                    </div>
                  )}
                  <small>המנחה · קול אנושי</small>
                </div>
              </div>
            </div>

            <div className="seat-pod seat-levi">
              <div className="chair-overhead" />
              <div className="desk-placemat">
                <div className="coffee-cup" />
                <div className="notepad" />
              </div>
              <div className="seat-badge" style={{ borderColor: agents[3].color }}>
                <div className="seat-avatar" style={{ background: agents[3].color }}>{agents[3].initials}</div>
                <div className="seat-details">
                  <strong>{agents[3].name}</strong>
                  <small>{agents[3].role}</small>
                </div>
              </div>
            </div>

            {/* Table Center: Start Button & Brainstorming Effects */}
            <div className="table-center-hub">
              <div className="hub-glass-platter">
                <button
                  className={`table-start-action-btn ${isThinking ? 'in-storm' : ''}`}
                  onClick={runRound}
                  disabled={isThinking}
                  title="לחצו להתחלת סיעור המוחות"
                >
                  <div className="btn-lightning-glow" />
                  <div className="start-btn-icon-pair">
                    <span className="brain-glyph">🧠</span>
                    <span className="lightning-glyph">⚡</span>
                  </div>
                  <span className="start-btn-caption">{isThinking ? 'חושבים בסערה…' : 'התחל'}</span>
                </button>

                {isThinking && (
                  <div className="table-storm-burst" aria-hidden="true">
                    <span className="table-bolt bolt-top">⚡</span>
                    <span className="table-bolt bolt-right">⚡</span>
                    <span className="table-bolt bolt-bottom">⚡</span>
                    <span className="table-bolt bolt-left">⚡</span>
                    <div className="storm-ripple" />
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
        <div className="table-caption">
          <span>מבט־על על שולחן הדיונים</span>
          <span className="caption-line" />
          <span>לחצו על כפתור ״התחל״ במרכז השולחן כדי להצית את הסיעור</span>
        </div>
      </section>

      <section className="workspace">
        <div className="workspace-heading">
          <div>
            <div className="section-kicker">רעיונות שעלו בשיחה</div>
            <h2>מה אנחנו חושבים?</h2>
          </div>
          <button className="primary-button" onClick={runRound} disabled={isThinking || aiConfigured !== true}>
            {isThinking ? 'חוקרים וחושבים…' : aiConfigured === null ? 'בודק חיבור…' : '⚡ התחל סבב חדש'}
          </button>
        </div>
        {notice && <div className="notice">{notice}</div>}
        {research && (
          <button className="research-toggle" onClick={() => setShowResearch(true)}>
            <span className="research-icon">⌕</span>
            <span>
              <strong>המחקר מוכן</strong>
              <small>לצפייה במקורות ובתובנות שג׳מיני סידר</small>
            </span>
            <b>פתיחה ↗</b>
          </button>
        )}
        <div className="idea-list">
          {ideas.map((idea) => (
            <article className="idea-card" key={idea.id}>
              <div className="idea-person">
                <div className="avatar" style={{ background: idea.color }}>
                  {idea.author.slice(0, 1)}
                </div>
                <div>
                  <strong>{idea.author}</strong>
                  <small>{idea.role}</small>
                </div>
              </div>
              <p>{idea.text}</p>
              <div className="idea-actions">
                <button className="discussion-button" onClick={() => discussIdea(idea)}>
                  ◌ פתח דיון סביב הרעיון
                </button>
              </div>
            </article>
          ))}
        </div>
        <div className="human-input">
          <div className="input-avatar">{humanName.slice(0, 2)}</div>
          <textarea
            value={humanThought}
            onChange={(event) => setHumanThought(event.target.value)}
            placeholder={`יש לך מחשבה משלך, ${humanName}? הנח/י אותה על השולחן…`}
          />
          <button className="send-button" onClick={addHumanIdea} aria-label="הוספת רעיון">↑</button>
        </div>
      </section>
      {isThinking && <div className="thinking-overlay" role="status"><div className="thinking-card"><div className="thinking-orbit"><span>🧠</span><i>ϟ</i><i>ϟ</i><i>ϟ</i></div><div className="section-kicker">סיעור בתנועה</div><h2>{thinkingPhase}</h2><p>ארבע נקודות מבט מתנגשות, מתחברות ומחפשות את הניצוץ הבא.</p><div className="thinking-dots"><i /><i /><i /></div></div></div>}
      {showResearch && research && <div className="modal-backdrop research-backdrop" onClick={() => setShowResearch(false)}><section className="research-modal" onClick={(event) => event.stopPropagation()}><button className="close-button" onClick={() => setShowResearch(false)}>×</button><div className="research-heading"><span className="research-icon">⌕</span><div><div className="section-kicker">מודיעין מקדים</div><h2>מה למדנו מהרשת</h2></div></div><p className="research-copy">{research.text}</p>{research.sources.length > 0 && <div className="source-list">{research.sources.map((source) => <a href={source.uri} target="_blank" rel="noreferrer" key={source.uri}>{source.title || source.uri}</a>)}</div>}<div className="research-footnote">המחקר שימש את ארבעת הסוכנים כהקשר, לא כתשובה.</div></section></div>}
      {discussion && <section className="discussion-panel"><div className="discussion-header"><div><div className="section-kicker">שיחה חיה סביב רעיון</div><h2>{discussion.idea.text}</h2></div><button className="close-discussion" onClick={() => setDiscussion(null)}>×</button></div><div className="reply-list">{discussion.replies.map((reply, index) => <article className={`reply-card ${reply.human ? 'human-reply' : ''}`} key={`${reply.human ? 'human' : reply.agent?.id}-${index}`}><div className="avatar" style={{ background: reply.human ? '#213b59' : reply.agent?.color }}>{reply.human ? 'את' : reply.agent?.initials}</div><div><strong>{reply.human ? 'את/ה · המנחה' : `${reply.agent?.name} · ${reply.agent?.role}`}</strong><p>{reply.text}</p></div></article>)}</div><div className="human-input discussion-input"><div className="input-avatar">את</div><textarea value={discussionThought} onChange={(event) => setDiscussionThought(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); void sendDiscussionMessage() } }} placeholder="הגב/י לצוות והמשיכו את הדיון…" /><button className="send-button" onClick={() => void sendDiscussionMessage()} disabled={isDiscussing} aria-label="שליחת תגובה">{isDiscussing ? '…' : '↑'}</button></div></section>}
      {showSettings && (
        <div className="modal-backdrop" onClick={() => { if (aiConfigured) setShowSettings(false) }}>
          <div className="settings-modal" onClick={(event) => event.stopPropagation()}>
            <button className="close-button" onClick={() => setShowSettings(false)}>×</button>
            <div className="section-kicker">חיבור מודל</div>
            <h2>Gemini Flash API</h2>
            <p>
              {aiConfigured
                ? 'החיבור פעיל! המפתח נשמר במכשיר זה. ניתן להזין מפתח חלופי בכל עת.'
                : 'הדבק/י כאן מפתח API של Google Gemini. המפתח נבדק מול השרת ונשמר במכשיר שלך בלבד.'}
            </p>
            <div className={`connection-state ${aiConfigured ? 'connected' : ''}`}>
              <span /> {aiConfigured ? 'חיבור AI פעיל' : 'נדרש מפתח API תקין'}
            </div>
            {notice && <div className="modal-notice">{notice}</div>}
            <input
              className="api-key-input"
              type="text"
              value={apiKeyInput}
              onChange={(event) => setApiKeyInput(event.target.value)}
              placeholder="AIzaSy..."
              autoFocus={!aiConfigured}
              onKeyDown={(event) => { if (event.key === 'Enter') void saveApiKey() }}
            />
            <button
              className="primary-button full-button"
              onClick={() => void saveApiKey()}
              disabled={!apiKeyInput.trim() || isSavingKey}
            >
              {isSavingKey ? 'בודק חיבור מול Google...' : 'שמירת מפתח ואימות חיבור'}
            </button>
            <div className="key-help-link">
              <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noreferrer">
                אין לך מפתח? לחץ/י כאן לקבלת מפתח חינמי ב-Google AI Studio ↗
              </a>
            </div>
            {aiConfigured && (
              <button className="secondary-button full-button" onClick={() => setShowSettings(false)}>
                סגירה
              </button>
            )}
          </div>
        </div>
      )}
    </main>
  )
}

export default App
