import { useEffect, useState, useRef, useCallback } from 'react'
import { useRatsia } from './hooks/useRatsia.js'

const DEFAULT_SERVER = import.meta.env.VITE_SERVER_URL || 'http://localhost:3001'

const FALLBACK_TEAM = [
  { id: "ceo", name: "Eldor Egamberdiyev", role: "CEO", avatar: "E" },
  { id: "cofounder", name: "Ro'zmamat Boltayev", role: "CO-FOUNDER", avatar: "R" },
  { id: "md", name: "Azamat Abdullayev", role: "Managing Director", avatar: "A" },
  { id: "feruza", name: "Feruza Rizayeva", role: "Sale & Call", avatar: "F" },
  { id: "komila", name: "Komila Odilova", role: "Sale & Call", avatar: "K" },
  { id: "abdurakhmon", name: "Abdurakhmon", role: "SMM", avatar: "A" },
  { id: "xursand", name: "Xursand", role: "Service manager", avatar: "X" },
  { id: "egamberdi", name: "Egamberdi", role: "Service manager", avatar: "E" },
]

function getInitialServerUrl() {
  return DEFAULT_SERVER
}

export default function App() {
  const [serverUrl] = useState(getInitialServerUrl)
  const [myId, setMyId] = useState(() => localStorage.getItem('ratsia:myId') || '')

  // eski noto'g'ri serverUrl ni tozalash
  useEffect(() => {
    localStorage.removeItem('ratsia:serverUrl')
  }, [])
  const [selectedId, setSelectedId] = useState('')
  const [search, setSearch] = useState('')
  const [isRecording, setIsRecording] = useState(false)
  const [amplitude, setAmplitude] = useState(0)
  const [permissionDenied, setPermissionDenied] = useState(false)
  const [roster, setRoster] = useState(FALLBACK_TEAM)

  useEffect(() => {
    if (myId) localStorage.setItem('ratsia:myId', myId)
  }, [myId])

  // login uchun ro'yxatni serverdan olish, bo'lmasa fallback
  useEffect(() => {
    if (myId) return
    let cancelled = false
    async function load() {
      try {
        const res = await fetch(serverUrl + '/team')
        if (!res.ok) throw new Error('bad')
        const data = await res.json()
        if (!cancelled && Array.isArray(data) && data.length) setRoster(data)
      } catch {
        if (!cancelled) setRoster(FALLBACK_TEAM)
      }
    }
    load()
    return () => { cancelled = true }
  }, [serverUrl, myId])

  const ratsia = useRatsia(myId ? serverUrl : null, myId || null)
  const { team, talking, incoming, error, clearError } = ratsia

  // login bo'lmaganda roster, login bo'lganda socket team ishlatilsin
  const displayTeam = myId ? (team.length ? team : roster) : roster

  // mobil da audio unlock — birinchi bosishda AudioContext ni resume qilish (iOS autoplay block uchun)
  useEffect(() => {
    const unlock = () => unlockAudio()
    document.addEventListener('click', unlock, { once: true })
    document.addEventListener('touchstart', unlock, { once: true })
    return () => {
      document.removeEventListener('click', unlock)
      document.removeEventListener('touchstart', unlock)
    }
  }, [unlockAudio])

  useEffect(() => {
    if (!error) return
    const t = setTimeout(clearError, 4000)
    return () => clearTimeout(t)
  }, [error, clearError])

  const mediaRef = useRef(null)
  const recorderRef = useRef(null)
  const chunksRef = useRef([])
  const analyserRef = useRef(null)
  const animRef = useRef(null)

  useEffect(() => {
    if (!selectedId && displayTeam.length) {
      const other = displayTeam.find(u => u.id !== myId && u.online)
      if (other) setSelectedId(other.id)
      else {
        const anyOther = displayTeam.find(u => u.id !== myId)
        if (anyOther) setSelectedId(anyOther.id)
      }
    }
  }, [displayTeam, myId, selectedId])

  const getSelectedUser = () => displayTeam.find(u => u.id === selectedId)
  const getMe = () => displayTeam.find(u => u.id === myId)

  const getSupportedMimeType = useCallback(() => {
    // mobil cross-platform uchun mp4 ni birinchi tekshiramiz (iOS/Android ikkalasida ham play bo'ladi)
    const candidates = [
      'audio/mp4',
      'audio/aac',
      'audio/webm;codecs=opus',
      'audio/webm',
      'audio/ogg;codecs=opus',
      ''
    ]
    for (const t of candidates) {
      if (!t) return ''
      try {
        if (MediaRecorder.isTypeSupported(t)) return t
      } catch {}
    }
    return ''
  }, [])

  const unlockAudio = useCallback(async () => {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)()
      if (ctx.state === 'suspended') await ctx.resume()
      // iOS da audio unlock uchun bo'sh buffer chalish
      const buf = ctx.createBuffer(1, 1, 22050)
      const src = ctx.createBufferSource()
      src.buffer = buf
      src.connect(ctx.destination)
      src.start(0)
      setTimeout(() => ctx.close(), 500)
    } catch {}
  }, [])

  const ensureMic = useCallback(async () => {
    if (mediaRef.current) return mediaRef.current
    if (!navigator.mediaDevices?.getUserMedia) {
      setPermissionDenied(true)
      throw new Error('Brauzer mikrofonni qo‘llab-quvvatlamaydi')
    }
    try {
      // mobil uchun soddaroq constraint — aksariyat telefonda yaxshiroq ishlaydi
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        }
      })
      mediaRef.current = stream
      setPermissionDenied(false)
      try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)()
        const src = ctx.createMediaStreamSource(stream)
        const analyser = ctx.createAnalyser()
        analyser.fftSize = 256
        src.connect(analyser)
        analyserRef.current = analyser
      } catch {}
      return stream
    } catch (e) {
      setPermissionDenied(true)
      throw e
    }
  }, [])

  const startVisualizer = useCallback(() => {
    const loop = () => {
      if (!analyserRef.current) return
      const data = new Uint8Array(analyserRef.current.frequencyBinCount)
      analyserRef.current.getByteFrequencyData(data)
      const avg = data.reduce((a, b) => a + b, 0) / data.length / 255
      setAmplitude(avg)
      animRef.current = requestAnimationFrame(loop)
    }
    loop()
  }, [])
  const stopVisualizer = useCallback(() => {
    if (animRef.current) cancelAnimationFrame(animRef.current)
    setAmplitude(0)
  }, [])

  const handlePressStart = useCallback(async (e) => {
    if (e) {
      e.preventDefault()
      e.stopPropagation()
    }
    if (!selectedId) return
    if (isRecording) return
    if (talking && talking.from !== myId) return
    unlockAudio()
    // telefonda MediaRecorder mavjudligini tekshirish
    if (typeof MediaRecorder === 'undefined') {
      alert('Bu brauzer ovoz yozishni qo‘llab-quvvatlamaydi. Chrome yoki Safari ni yangilang.')
      return
    }
    try {
      const stream = await ensureMic()
      ratsia.sendStart(selectedId)
      chunksRef.current = []
      const mimeType = getSupportedMimeType()
      const rec = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream)
      rec.ondataavailable = (ev) => {
        if (ev.data && ev.data.size > 0) chunksRef.current.push(ev.data)
      }
      rec.onerror = (ev) => console.error('recorder error', ev)
      rec.start(100)
      recorderRef.current = rec
      setIsRecording(true)
      startVisualizer()
      if (navigator.vibrate) navigator.vibrate(30)
    } catch (err) {
      console.error(err)
      // mobil da ruxsat berilmagan bo'lsa tushunarli xabar
      if (err?.name === 'NotAllowedError') {
        setPermissionDenied(true)
      }
    }
  }, [selectedId, talking, myId, isRecording, ensureMic, ratsia, startVisualizer, getSupportedMimeType, unlockAudio])

  const handlePressEnd = useCallback((e) => {
    if (e) e.preventDefault()
    if (!isRecording) return
    const rec = recorderRef.current
    if (rec && rec.state !== 'inactive') {
      rec.onstop = async () => {
        const type = rec.mimeType || getSupportedMimeType() || 'audio/mp4'
        const blob = new Blob(chunksRef.current, { type })
        if (blob.size < 300) {
          ratsia.sendCancel(selectedId)
        } else {
          ratsia.sendBlob(selectedId, blob, type)
        }
        ratsia.sendEnd(selectedId)
        chunksRef.current = []
      }
      try { rec.stop() } catch {}
    } else {
      ratsia.sendEnd(selectedId)
    }
    setIsRecording(false)
    stopVisualizer()
  }, [isRecording, ratsia, selectedId, stopVisualizer, getSupportedMimeType])

  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.code === 'Space' && !e.repeat && document.activeElement?.tagName !== 'INPUT') {
        e.preventDefault()
        handlePressStart()
      }
    }
    const onKeyUp = (e) => {
      if (e.code === 'Space') {
        e.preventDefault()
        handlePressEnd()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
    }
  }, [handlePressStart, handlePressEnd])

  const filtered = displayTeam.filter(u => {
    if (!search) return true
    const s = search.toLowerCase()
    return u.name.toLowerCase().includes(s) || u.role.toLowerCase().includes(s) || u.id.toLowerCase().includes(s)
  })

  // Login ekrani
  if (!myId) {
    return (
      <div className="min-h-screen flex flex-col">
        <HeaderLite />
        <main className="flex-1 flex items-center justify-center p-6">
          <div className="w-full max-w-[640px]">
            <div className="mb-8 text-center">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-black text-white text-[11px] tracking-widest font-semibold">ONLAYN RATSIYA • 1GA-1</div>
              <h1 className="mt-4 text-[34px] md:text-[44px] font-extrabold tracking-tight leading-none">Jamoa ratsiyasi.<br /><span className="text-[#ff3b30]">Tanla. Bos. Gapir.</span></h1>
              <p className="mt-3 text-[14px] leading-5 text-neutral-500 max-w-[520px] mx-auto">Kim bo'lib kirishni tanlang va jamoa bilan gaplashishni boshlang.</p>
            </div>

            <div className="bg-white rounded-[24px] shadow-[0_16px_40px_rgba(0,0,0,0.08)] border border-black/5 overflow-hidden">
              <div className="p-6 md:p-8">
                <h2 className="text-[13px] font-bold tracking-widest text-neutral-400">KIRISH — O'ZINGIZNI TANLANG</h2>
                <p className="mt-1 text-sm text-neutral-500">Ro'yxatdan o'zingizni tanlang.</p>
                <LoginPicker team={roster} onPick={(id) => setMyId(id)} />
                {error && <div className="mt-3 text-sm text-red-600 bg-red-50 border border-red-100 rounded-xl px-3 py-2">{error}</div>}
              </div>
            </div>
          </div>
        </main>
      </div>
    )
  }

  const me = getMe()
  const selected = getSelectedUser()
  const someoneTalking = talking && talking.from !== myId

  return (
    <div className="min-h-screen flex flex-col">
      <header className="sticky top-0 z-20 bg-white/80 backdrop-blur border-b border-black/5">
        <div className="max-w-[1280px] mx-auto px-4 md:px-6 h-[64px] flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-black text-white grid place-items-center font-extrabold text-[14px] tracking-tight">R</div>
            <div>
              <div className="text-[13px] font-extrabold tracking-tight leading-none">RATSIYA</div>
              <div className="text-[11px] tracking-widest font-semibold text-neutral-400 leading-none">ONLAYN • 1GA-1 • PTT</div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="hidden md:flex items-center gap-2 bg-[#f6f6f3] border border-black/5 rounded-full pl-1 pr-3 py-1">
              <div className="w-7 h-7 rounded-full bg-black text-white grid place-items-center text-xs font-bold">{me?.avatar || '?'}</div>
              <div className="text-xs leading-none">
                <div className="font-semibold">{me?.name || myId}</div>
                <div className="text-[10px] tracking-widest text-neutral-500">{me?.role || ''}</div>
              </div>
            </div>
            <button onClick={() => { localStorage.removeItem('ratsia:myId'); setMyId('') }} className="hidden md:inline-flex text-xs font-semibold px-3 py-2 rounded-full border border-black/10 hover:bg-black hover:text-white transition">Chiqish</button>
          </div>
        </div>
      </header>

      {error && (
        <div className="max-w-[1280px] mx-auto w-full px-4 md:px-6 mt-3">
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-2 flex items-center justify-between">
            <span>{error}</span>
            <button onClick={clearError} className="text-red-700 font-bold">×</button>
          </div>
        </div>
      )}
      {permissionDenied && (
        <div className="max-w-[1280px] mx-auto w-full px-4 md:px-6 mt-3">
          <div className="bg-amber-50 border border-amber-200 text-amber-800 text-sm rounded-xl px-4 py-3">
            <b>Mikrofon ruxsati berilmadi.</b> Telefonda: brauzer manzil satrining chapidagi 🔒 yoki ℹ️ ni bosing → <b>Mikrofon → Ruxsat berish</b> → sahifani yangilang. iPhone da: <b>Sozlamalar → Safari → Mikrofon</b> ni tekshiring. Keyin <b>“Mikrofonni tekshirish”</b> ni bosing.
            <button onClick={async () => { try { await ensureMic(); setPermissionDenied(false); } catch {} }} className="mt-2 text-xs px-3 py-1.5 rounded-full bg-amber-600 text-white font-semibold">Qayta urinib ko'rish</button>
          </div>
        </div>
      )}
      {incoming && (
        <div className="max-w-[1280px] mx-auto w-full px-4 md:px-6 mt-3">
          <div className="bg-black text-white rounded-xl px-4 py-3 flex items-center gap-3 animate-pulseSoft">
            <span className="w-2 h-2 rounded-full bg-[#ff3b30] animate-pulse" />
            <span className="text-sm font-semibold">{displayTeam.find(t => t.id === incoming.from)?.name || incoming.from} sizga gapiryapti...</span>
            <span className="ml-auto text-xs opacity-70">Avtomatik eshittiriladi</span>
          </div>
        </div>
      )}

      <main className="flex-1 max-w-[1280px] mx-auto w-full px-4 md:px-6 py-4 md:py-6 grid grid-cols-1 lg:grid-cols-[380px_1fr] gap-4 md:gap-6">
        {/* LEFT - Jamoa */}
        <section className="bg-white rounded-[20px] border border-black/5 shadow-[0_8px_24px_rgba(0,0,0,0.06)] overflow-hidden flex flex-col min-h-[420px] lg:min-h-[560px]">
          <div className="p-4 md:p-5 border-b border-black/5">
            <div className="flex items-center justify-between">
              <h2 className="text-[11px] font-bold tracking-[0.14em] text-neutral-400">JAMOA • {displayTeam.filter(t => t.online).length} ONLAYN</h2>
              <span className="text-[11px] px-2 py-1 rounded-full bg-[#f6f6f3] border border-black/5 tracking-widest font-semibold">{displayTeam.length} JAMI</span>
            </div>
            <div className="mt-3 relative">
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Ism yoki lavozim bo'yicha qidirish..." className="w-full bg-[#f6f6f3] border border-black/5 rounded-full pl-9 pr-3 py-2.5 text-sm outline-none focus:bg-white focus:border-black/10" />
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400 text-sm">⌕</span>
            </div>
          </div>
          <div className="flex-1 overflow-auto p-2 space-y-1">
            {filtered.map(u => {
              const isMe = u.id === myId
              const isSelected = u.id === selectedId
              const isTalkingThis = talking && (talking.from === u.id || talking.to === u.id)
              return (
                <button
                  key={u.id}
                  onClick={() => !isMe && setSelectedId(u.id)}
                  disabled={isMe}
                  className={`w-full text-left flex items-center gap-3 p-3 rounded-2xl border transition ${isSelected ? 'bg-black text-white border-black shadow-lg' : 'bg-white hover:bg-[#fcfcf9] border-transparent hover:border-black/5'} ${isMe ? 'opacity-60' : ''} ${isTalkingThis ? 'ring-2 ring-[#ff3b30]/30' : ''}`}
                >
                  <div className={`w-10 h-10 rounded-full grid place-items-center font-bold text-sm shrink-0 ${isSelected ? 'bg-white text-black' : 'bg-[#f1f1ee] text-neutral-700'}`}>{u.avatar}</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-[14px] font-semibold leading-none truncate">{u.name} {isMe && '(Siz)'}</span>
                      {isTalkingThis && <span className="w-1.5 h-1.5 rounded-full bg-[#ff3b30] animate-pulse" />}
                    </div>
                    <div className={`text-[11px] tracking-widest font-semibold ${isSelected ? 'text-white/60' : 'text-neutral-400'}`}>{u.role}</div>
                  </div>
                  <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${u.online ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.6)]' : 'bg-neutral-300'}`} title={u.online ? 'onlayn' : 'oflayn'} />
                </button>
              )
            })}
            {filtered.length === 0 && <div className="p-6 text-center text-sm text-neutral-400">Hech kim topilmadi</div>}
          </div>
          <div className="p-3 border-t border-black/5 bg-[#fcfcf9] flex items-center justify-between text-xs">
            <span className="text-neutral-500">Tanlangan: <b className="text-black">{selected?.name || '—'}</b></span>
            <span className={`px-2 py-1 rounded-full text-[11px] font-bold tracking-widest ${selected?.online ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-neutral-100 text-neutral-500 border border-black/5'}`}>{selected?.online ? 'ONLAYN' : 'OFLAYN'}</span>
          </div>
        </section>

        {/* RIGHT - Ratsia */}
        <section className="bg-[#0a0a0a] rounded-[20px] overflow-hidden shadow-[0_16px_40px_rgba(0,0,0,0.18)] flex flex-col min-h-[520px] relative">
          <div className="p-4 md:p-6 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-full bg-white/10 border border-white/10 grid place-items-center text-white font-bold">{selected?.avatar || '?'}</div>
              <div>
                <div className="text-white font-semibold leading-none">{selected ? `${selected.name} • ${selected.role}` : 'Hech kim tanlanmadi'}</div>
                <div className="text-xs tracking-widest font-semibold text-white/50">{selectedId ? (selected?.online ? 'TAYYOR — BOSIB GAPIRING' : 'OFLAYN') : 'CHAPDAN ODAMNI TANLANG'}</div>
              </div>
            </div>
            <div className="hidden md:flex items-center gap-2">
              <span className="text-[11px] tracking-widest font-semibold text-white/40">HOLAT</span>
              <span className={`px-3 py-1 rounded-full text-xs font-bold ${isRecording ? 'bg-[#ff3b30] text-white animate-pulse' : someoneTalking ? 'bg-white text-black' : 'bg-white/10 text-white border border-white/10'}`}>
                {isRecording ? '● YUBORILMOQDA' : someoneTalking ? '● QABUL' : '○ KUTISH'}
              </span>
            </div>
          </div>

          <div className="flex-1 flex flex-col items-center justify-center px-6 py-8 text-center relative">
            <div className="h-[56px] flex items-center gap-[3px] mb-6">
              {Array.from({ length: 20 }).map((_, i) => {
                const active = isRecording || someoneTalking
                const h = active ? 12 + Math.abs(Math.sin((Date.now()/180 + i*0.6))) * 28 + amplitude*40 : 8
                return <div key={i} className={`w-[4px] rounded-full transition-all duration-150 ${active ? 'bg-[#ff3b30]' : 'bg-white/15'}`} style={{ height: `${h}px`, opacity: active ? 1 : 0.7 }} />
              })}
            </div>

            <div className={`text-[12px] tracking-[0.18em] font-bold ${isRecording ? 'text-[#ff3b30]' : someoneTalking ? 'text-white' : 'text-white/40'}`}>
              {isRecording ? `GAPIRYAPSIZ → ${selected?.name?.toUpperCase()}` : someoneTalking ? `${displayTeam.find(t=>t.id===talking.from)?.name?.toUpperCase() || talking.from} GAPIRYAPTI...` : selected?.online ? 'BOSIB TURING VA GAPIRING' : 'QABUL QILUVCHI OFLAYN'}
            </div>

            <div className="mt-8 relative">
              <div className={`absolute inset-0 rounded-full blur-2xl transition ${isRecording ? 'bg-[#ff3b30]/30 scale-110' : 'bg-white/5'}`} />
              <button
                onPointerDown={handlePressStart}
                onPointerUp={handlePressEnd}
                onPointerLeave={handlePressEnd}
                onPointerCancel={handlePressEnd}
                onMouseDown={handlePressStart}
                onMouseUp={handlePressEnd}
                onMouseLeave={handlePressEnd}
                onTouchStart={handlePressStart}
                onTouchEnd={handlePressEnd}
                onContextMenu={(e) => e.preventDefault()}
                style={{ touchAction: 'none' }}
                disabled={!selectedId || !selected?.online || (talking && talking.from !== myId && talking.to !== myId && talking.from !== selectedId)}
                className={`relative w-[220px] h-[220px] md:w-[260px] md:h-[260px] rounded-full border-[8px] flex flex-col items-center justify-center gap-2 select-none touch-manipulation transition-all
                  ${isRecording ? 'bg-[#ff3b30] border-[#ff3b30] text-white scale-[0.98] shadow-[0_0_40px_rgba(255,59,48,0.5)]' : 'bg-white border-white text-black hover:scale-[1.01] active:scale-[0.98] shadow-[0_12px_32px_rgba(0,0,0,0.25)]'}
                  disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:scale-100`}
              >
                <span className="text-[28px]">{isRecording ? '●' : '🎙️'}</span>
                <span className="text-[13px] font-extrabold tracking-[0.14em]">{isRecording ? 'QO\'YIB YUBORING' : 'BOSIB GAPIRING'}</span>
                <span className="text-[11px] tracking-widest font-semibold opacity-60">{isRecording ? 'YUBORISH UCHUN' : 'HOLD TO TALK'}</span>
                {isRecording && <span className="absolute -bottom-2 left-1/2 -translate-x-1/2 bg-black text-white text-[10px] tracking-widest font-bold px-3 py-1 rounded-full">YUBORILMOQDA</span>}
              </button>
            </div>

            <div className="mt-8 flex flex-wrap items-center justify-center gap-2 text-xs">
              <span className="px-3 py-1.5 rounded-full bg-white/10 border border-white/10 text-white/70">Space — bosib gapirish</span>
              <span className="px-3 py-1.5 rounded-full bg-white/10 border border-white/10 text-white/70">Faqat tanlangan odam eshitadi</span>
            </div>

            {someoneTalking && !isRecording && (
              <div className="absolute inset-0 bg-black/60 backdrop-blur-[2px] flex flex-col items-center justify-center p-6">
                <div className="w-16 h-16 rounded-full bg-white grid place-items-center text-xl mb-3 animate-pulseSoft">🔊</div>
                <div className="text-white font-bold">{displayTeam.find(t=>t.id===talking.from)?.name} gapiryapti...</div>
                <div className="text-white/60 text-sm mt-1">Avtomatik eshittiriladi</div>
              </div>
            )}
          </div>

          <div className="h-[56px] border-t border-white/10 bg-white/[0.03] flex items-center justify-center px-4 md:px-6">
            <button onClick={async () => { try { await ensureMic(); } catch {} }} className="text-xs px-4 py-1.5 rounded-full bg-white text-black font-semibold hover:bg-white/90">Mikrofonni tekshirish</button>
          </div>
        </section>
      </main>
    </div>
  )
}

function HeaderLite() {
  return (
    <header className="h-[64px] flex items-center justify-between px-4 md:px-6 border-b border-black/5 bg-white/70 backdrop-blur sticky top-0">
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-xl bg-black text-white grid place-items-center font-extrabold">R</div>
        <div className="text-[13px] font-extrabold leading-none">RATSIYA</div>
      </div>
    </header>
  )
}

function LoginPicker({ team, onPick }) {
  const [q, setQ] = useState('')
  const list = team.filter(u => !q || u.name.toLowerCase().includes(q.toLowerCase()) || u.role.toLowerCase().includes(q.toLowerCase()))

  return (
    <div className="mt-4">
      <input value={q} onChange={e=>setQ(e.target.value)} placeholder="Qidirish..." className="w-full bg-[#f6f6f3] border border-black/5 rounded-full px-4 py-2.5 text-sm outline-none focus:bg-white" />
      <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-[320px] overflow-auto pr-1">
        {list.map(u => (
          <button key={u.id} onClick={() => onPick(u.id)} className="text-left flex items-center gap-3 p-3 rounded-2xl border border-black/5 bg-[#fcfcf9] hover:bg-black hover:text-white hover:border-black transition group">
            <div className="w-10 h-10 rounded-full bg-white border border-black/5 group-hover:bg-white group-hover:text-black grid place-items-center font-bold text-sm shrink-0">{u.avatar}</div>
            <div className="min-w-0">
              <div className="text-sm font-semibold leading-none">{u.name}</div>
              <div className="text-[11px] tracking-widest font-semibold opacity-60">{u.role}</div>
            </div>
            <span className={`ml-auto w-2 h-2 rounded-full ${u.online ? 'bg-emerald-500' : 'bg-neutral-300'}`} />
          </button>
        ))}
        {list.length===0 && <div className="col-span-2 p-6 text-center text-sm text-neutral-400">Topilmadi</div>}
      </div>
    </div>
  )
}
