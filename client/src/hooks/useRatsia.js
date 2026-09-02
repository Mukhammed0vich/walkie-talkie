import { useEffect, useRef, useState, useCallback } from 'react'
import { io } from 'socket.io-client'

export function useRatsia(serverUrl, userId) {
  const socketRef = useRef(null)
  const [connected, setConnected] = useState(false)
  const [team, setTeam] = useState([])
  const [presence, setPresence] = useState([])
  const [talking, setTalking] = useState(null)
  const [incoming, setIncoming] = useState(null) // { from }
  const [error, setError] = useState(null)
  const [lastBlob, setLastBlob] = useState(null) // for debug

  // connect
  useEffect(() => {
    if (!serverUrl || !userId) return
    setError(null)
    const socket = io(serverUrl, {
      transports: ['websocket', 'polling'],
      reconnection: true,
    })
    socketRef.current = socket

    socket.on('connect', () => {
      setConnected(true)
      socket.emit('user:join', { userId })
    })
    socket.on('disconnect', () => setConnected(false))
    socket.on('connect_error', (e) => {
      setError(e.message)
      setConnected(false)
    })
    socket.on('user:joined', ({ team }) => {
      if (team) setTeam(team)
    })
    socket.on('presence:update', (p) => {
      setPresence(p)
      // also keep team synced if presence contains full objects
      if (p && p.length) setTeam(p)
    })
    socket.on('talking:update', (t) => setTalking(t))
    socket.on('ptt:incoming:start', ({ from }) => {
      setIncoming({ from })
      // beep
      try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)()
        const o = ctx.createOscillator()
        const g = ctx.createGain()
        o.type = 'sine'; o.frequency.value = 880
        o.connect(g); g.connect(ctx.destination)
        g.gain.value = 0.12
        o.start(); g.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.18)
        setTimeout(() => { o.stop(); ctx.close() }, 200)
      } catch {}
    })
    socket.on('ptt:incoming:end', () => setIncoming(null))
    socket.on('ptt:blob', async ({ from, blob, mimeType }) => {
      try {
        const type = mimeType || 'audio/webm'
        let audioBlob = blob
        if (blob instanceof ArrayBuffer) {
          audioBlob = new Blob([blob], { type })
        } else if (Array.isArray(blob)) {
          audioBlob = new Blob([new Uint8Array(blob)], { type })
        } else if (typeof blob === 'string' && blob.startsWith('data:')) {
          const res = await fetch(blob)
          audioBlob = await res.blob()
        }
        if (!(audioBlob instanceof Blob)) {
          audioBlob = new Blob([audioBlob], { type })
        }
        // agar blob type bo'sh bo'lsa, mimeType ni qo'llash
        if (!audioBlob.type && type) {
          audioBlob = new Blob([audioBlob], { type })
        }
        setLastBlob({ from, at: Date.now() })
        const url = URL.createObjectURL(audioBlob)
        const audio = new Audio(url)
        audio.playsInline = true
        audio.autoplay = true
        audio.onended = () => URL.revokeObjectURL(url)
        audio.onerror = () => URL.revokeObjectURL(url)
        try {
          await audio.play()
        } catch (err) {
          console.warn('audio play blocked', err)
          try {
            const ctx = new (window.AudioContext || window.webkitAudioContext)()
            if (ctx.state === 'suspended') await ctx.resume()
          } catch {}
          // foydalanuvchiga ko'rsatish uchun error ni set qilish mumkin
          setError('Ovoz avtomatik eshittirilmadi — ekranga bir marta bosing')
          setTimeout(() => setError(null), 3000)
        }
        if (navigator.vibrate) navigator.vibrate(120)
      } catch (e) {
        console.error('play error', e)
      }
    })
    socket.on('ptt:audio', async ({ from, chunk }) => {
      try {
        let b = chunk
        if (chunk instanceof ArrayBuffer) b = new Blob([chunk], { type: 'audio/webm' })
        const url = URL.createObjectURL(b)
        const a = new Audio(url)
        a.playsInline = true
        a.onended = () => URL.revokeObjectURL(url)
        try { await a.play() } catch {}
      } catch {}
    })
    socket.on('ptt:busy', (m) => setError(m.message))
    socket.on('ptt:error', (m) => setError(m.message))
    socket.on('error:msg', (m) => setError(m.message))

    // fetch team fallback
    fetch(serverUrl + '/team').then(r => r.json()).then(setTeam).catch(()=>{})

    return () => {
      socket.disconnect()
      socketRef.current = null
    }
  }, [serverUrl, userId])

  const sendStart = useCallback((to) => {
    setError(null)
    socketRef.current?.emit('ptt:start', { to })
  }, [])
  const sendEnd = useCallback((to) => {
    socketRef.current?.emit('ptt:end', { to })
  }, [])
  const sendBlob = useCallback((to, blob, mimeType) => {
    if (blob instanceof Blob) {
      blob.arrayBuffer().then(buf => {
        socketRef.current?.emit('ptt:blob', { to, blob: buf, mimeType: mimeType || blob.type || 'audio/webm' })
      })
    } else {
      socketRef.current?.emit('ptt:blob', { to, blob, mimeType: mimeType || 'audio/webm' })
    }
  }, [])
  const sendCancel = useCallback((to) => {
    socketRef.current?.emit('ptt:cancel', { to })
  }, [])

  return {
    socket: socketRef.current,
    connected,
    team: presence.length ? presence : team,
    talking,
    incoming,
    error,
    lastBlob,
    sendStart, sendEnd, sendBlob, sendCancel,
    clearError: () => setError(null)
  }
}
