import { useState, useRef, useEffect } from 'react'
import { Home, Folder, Mic, MessageCircle, Save, Settings, Square, Calendar, X, Search, UploadCloud, Circle, CheckCircle2, Cloud, HardDrive, Send, Keyboard, Bell } from 'lucide-react'
import './App.css'

const API_URL = `http://${window.location.hostname}:8000`

function App() {
  const [mode, setMode] = useState('accueil')

  const [enregistrement, setEnregistrement] = useState(false)
  const [transcriptionComplete, setTranscriptionComplete] = useState('')
  const [envoiEnCours, setEnvoiEnCours] = useState(false)
  const [heureProgrammee, setHeureProgrammee] = useState('')
  const [programmationActive, setProgrammationActive] = useState(false)
  const [audioUrl, setAudioUrl] = useState(null)
  const [dureeChoisie, setDureeChoisie] = useState(60)
  const streamRef = useRef(null)
  const mediaRecorderRef = useRef(null)
  const timeoutArretRef = useRef(null)
  const tranchesAudioRef = useRef([])

  const [modeAssistant, setModeAssistant] = useState('vocal')
  const [enregistrementAssistant, setEnregistrementAssistant] = useState(false)
  const [conversation, setConversation] = useState([])
  const [messageTexte, setMessageTexte] = useState('')
  const [assistantEnCours, setAssistantEnCours] = useState(false)
  const assistantRecorderRef = useRef(null)
  const salutationFaiteRef = useRef(false)
  const finConversationRef = useRef(null)
  const [messageSauvegardeConversation, setMessageSauvegardeConversation] = useState('')

  const [historique, setHistorique] = useState([])
  const [conversationsSauvegardees, setConversationsSauvegardees] = useState([])
  const [sousOngletSauvegarde, setSousOngletSauvegarde] = useState('transcriptions')
  const [messageSauvegarde, setMessageSauvegarde] = useState('')
  const [rechercheHistorique, setRechercheHistorique] = useState('')

  const [langue, setLangue] = useState('fr')
  const [dureeTrancheMinutes, setDureeTrancheMinutes] = useState(5)
  const dureeTranche = dureeTrancheMinutes * 60 * 1000
  const [inclureAudio, setInclureAudio] = useState(true)

  const [fichierImporte, setFichierImporte] = useState(null)
  const [texteImporte, setTexteImporte] = useState('')
  const [analyseEnCours, setAnalyseEnCours] = useState(false)
  const [messageSauvegardeFichier, setMessageSauvegardeFichier] = useState('')

  const [permissionNotif, setPermissionNotif] = useState(
    typeof Notification !== 'undefined' ? Notification.permission : 'unsupported'
  )

  useEffect(() => {
    if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
      Notification.requestPermission().then(setPermissionNotif)
    }
  }, [])

  const demanderPermissionNotification = () => {
    if (typeof Notification === 'undefined') return
    Notification.requestPermission().then(setPermissionNotif)
  }

  const envoyerNotification = (titre, corps) => {
    if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
      new Notification(titre, { body: corps })
    }
  }

  useEffect(() => {
    if (mode === 'assistant' && !salutationFaiteRef.current) {
      salutationFaiteRef.current = true
      const heure = new Date().getHours()
      let salutation = "Bonjour"
      if (heure >= 18 || heure < 5) {
        salutation = "Bonsoir"
      } else if (heure >= 12) {
        salutation = "Bon après-midi"
      }
      const texteAccueil = `${salutation}, je suis VocalIA. Que puis-je faire pour vous ?`
      setConversation([{ role: 'assistant', texte: texteAccueil }])
      lireAVoixHaute(texteAccueil)
    }
    if (mode === 'historique') {
      chargerHistorique()
      chargerHistoriqueConversations()
    }
  }, [mode])

  useEffect(() => {
    if (finConversationRef.current) {
      finConversationRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [conversation, assistantEnCours])

  useEffect(() => {
    if (!programmationActive) return
    const intervalle = setInterval(() => {
      const maintenant = new Date()
      const heureActuelle = maintenant.toTimeString().slice(0, 5)
      if (heureActuelle === heureProgrammee) {
        setProgrammationActive(false)
        envoyerNotification("VocalIA", "L'enregistrement programmé démarre maintenant.")
        demarrerEnregistrement()
      }
    }, 1000)
    return () => clearInterval(intervalle)
  }, [programmationActive, heureProgrammee])

  const programmerEnregistrement = () => {
    if (!heureProgrammee) return
    setProgrammationActive(true)
  }

  const annulerProgrammation = () => setProgrammationActive(false)

  const demarrerEnregistrement = async () => {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
    })
    streamRef.current = stream
    setEnregistrement(true)
    setTranscriptionComplete('')
    tranchesAudioRef.current = []
    enregistrerUneTranche()

    timeoutArretRef.current = setTimeout(() => {
      arreterEnregistrement()
    }, dureeChoisie * 60 * 1000)
  }

  const enregistrerUneTranche = () => {
    if (!streamRef.current) return
    const recorder = new MediaRecorder(streamRef.current)
    mediaRecorderRef.current = recorder
    const chunks = []

    recorder.ondataavailable = (event) => chunks.push(event.data)

    recorder.onstop = async () => {
      const blob = new Blob(chunks, { type: 'audio/webm' })
      await envoyerAuBackend(blob)
      if (streamRef.current) enregistrerUneTranche()
    }

    recorder.start()
    setTimeout(() => {
      if (recorder.state !== 'inactive') recorder.stop()
    }, dureeTranche)
  }

  const arreterEnregistrement = () => {
    if (timeoutArretRef.current) {
      clearTimeout(timeoutArretRef.current)
      timeoutArretRef.current = null
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop()
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop())
      streamRef.current = null
    }
    setEnregistrement(false)
  }

  const envoyerAuBackend = async (blob) => {
    tranchesAudioRef.current.push(blob)

    const url = URL.createObjectURL(blob)
    setAudioUrl(url)
    setEnvoiEnCours(true)

    const formData = new FormData()
    formData.append('fichier', blob, 'tranche.webm')
    formData.append('langue', langue)

    const reponse = await fetch(`${API_URL}/transcription`, {
      method: 'POST',
      body: formData,
    })
    const donnees = await reponse.json()

    if (donnees.erreur) {
      setTranscriptionComplete(prev => prev + ' [' + donnees.erreur + ']')
    } else {
      setTranscriptionComplete(prev => prev + ' ' + donnees.texte)
    }
    setEnvoiEnCours(false)
  }

  const sauvegarderTranscription = async () => {
    if (!transcriptionComplete.trim()) return

    const formData = new FormData()
    formData.append('texte', transcriptionComplete)

    if (inclureAudio) {
      const audioComplet = new Blob(tranchesAudioRef.current, { type: 'audio/webm' })
      formData.append('fichier', audioComplet, 'enregistrement.webm')
    }

    const reponse = await fetch(`${API_URL}/sauvegarder`, {
      method: 'POST',
      body: formData,
    })

    if (reponse.ok) {
      setMessageSauvegarde('Transcription enregistrée avec succès.')
      envoyerNotification("VocalIA", "Votre transcription a été enregistrée.")
      tranchesAudioRef.current = []
      setTimeout(() => setMessageSauvegarde(''), 3000)
    }
  }

  const demarrerAssistant = async () => {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
    })
    const recorder = new MediaRecorder(stream)
    assistantRecorderRef.current = recorder
    const chunks = []

    recorder.ondataavailable = (event) => chunks.push(event.data)

    recorder.onstop = async () => {
      const blob = new Blob(chunks, { type: 'audio/webm' })
      stream.getTracks().forEach(track => track.stop())
      await envoyerAAssistant(blob)
    }

    recorder.start()
    setEnregistrementAssistant(true)
  }

  const arreterAssistant = () => {
    if (assistantRecorderRef.current && assistantRecorderRef.current.state !== 'inactive') {
      assistantRecorderRef.current.stop()
    }
    setEnregistrementAssistant(false)
  }

  const envoyerAAssistant = async (blob) => {
    setAssistantEnCours(true)
    const formData = new FormData()
    formData.append('fichier', blob, 'question.webm')
    formData.append('historique', JSON.stringify(conversation))

    const reponse = await fetch(`${API_URL}/assistant`, {
      method: 'POST',
      body: formData,
    })
    const donnees = await reponse.json()

    if (donnees.erreur) {
      setConversation(prev => [...prev, { role: 'assistant', texte: donnees.erreur }])
      lireAVoixHaute(donnees.erreur)
    } else {
      setConversation(prev => [
        ...prev,
        { role: 'user', texte: donnees.question },
        { role: 'assistant', texte: donnees.reponse },
      ])
      lireAVoixHaute(donnees.reponse)
    }
    setAssistantEnCours(false)
  }

  const envoyerMessageTexte = async () => {
    if (!messageTexte.trim() || assistantEnCours) return
    const texteEnvoye = messageTexte.trim()
    setMessageTexte('')
    setConversation(prev => [...prev, { role: 'user', texte: texteEnvoye }])
    setAssistantEnCours(true)

    const formData = new FormData()
    formData.append('message', texteEnvoye)
    formData.append('historique', JSON.stringify(conversation))

    const reponse = await fetch(`${API_URL}/assistant-texte`, {
      method: 'POST',
      body: formData,
    })
    const donnees = await reponse.json()

    if (donnees.erreur) {
      setConversation(prev => [...prev, { role: 'assistant', texte: donnees.erreur }])
    } else {
      setConversation(prev => [...prev, { role: 'assistant', texte: donnees.reponse }])
    }
    setAssistantEnCours(false)
  }

  const sauvegarderConversation = async () => {
    const formData = new FormData()
    formData.append('conversation', JSON.stringify(conversation))

    const reponse = await fetch(`${API_URL}/sauvegarder-conversation`, {
      method: 'POST',
      body: formData,
    })

    if (reponse.ok) {
      setMessageSauvegardeConversation('Conversation enregistrée avec succès.')
      envoyerNotification("VocalIA", "Votre conversation a été enregistrée.")
      setTimeout(() => setMessageSauvegardeConversation(''), 3000)
    }
  }

  const lireAVoixHaute = (texte) => {
    const parole = new SpeechSynthesisUtterance(texte)
    parole.lang = 'fr-FR'
    window.speechSynthesis.speak(parole)
  }

  const chargerHistorique = async () => {
    const reponse = await fetch(`${API_URL}/historique`)
    const donnees = await reponse.json()
    setHistorique(donnees.transcriptions)
  }

  const chargerHistoriqueConversations = async () => {
    const reponse = await fetch(`${API_URL}/historique-conversations`)
    const donnees = await reponse.json()
    setConversationsSauvegardees(donnees.conversations)
  }

  const historiqueFiltre = historique.filter(item =>
    item.texte.toLowerCase().includes(rechercheHistorique.toLowerCase())
  )

  const conversationsFiltrees = conversationsSauvegardees.filter(conv =>
    conv.messages.some(m => m.texte.toLowerCase().includes(rechercheHistorique.toLowerCase()))
  )

  const gererImportFichier = async (event) => {
    const fichier = event.target.files[0]
    if (!fichier) return

    setFichierImporte(fichier)
    setTexteImporte('')
    setAnalyseEnCours(true)

    const formData = new FormData()
    formData.append('fichier', fichier)
    formData.append('langue', langue)

    const reponse = await fetch(`${API_URL}/transcription`, {
      method: 'POST',
      body: formData,
    })
    const donnees = await reponse.json()

    if (donnees.erreur) {
      setTexteImporte(donnees.erreur)
    } else {
      setTexteImporte(donnees.texte)
    }
    setAnalyseEnCours(false)
  }

  const sauvegarderFichierImporte = async () => {
    if (!texteImporte.trim() || !fichierImporte) return

    const formData = new FormData()
    formData.append('texte', texteImporte)

    if (inclureAudio) {
      formData.append('fichier', fichierImporte)
    }

    const reponse = await fetch(`${API_URL}/sauvegarder`, {
      method: 'POST',
      body: formData,
    })

    if (reponse.ok) {
      setMessageSauvegardeFichier('Transcription enregistrée avec succès.')
      envoyerNotification("VocalIA", "Votre transcription a été enregistrée.")
      setTimeout(() => setMessageSauvegardeFichier(''), 3000)
    }
  }

  const aEchangeAssistant = conversation.some(m => m.role === 'user')

  return (
    <div className="app-container">
      <div className="ambient-glow ambient-glow-1"></div>
      <div className="ambient-glow ambient-glow-2"></div>
      <h1 className="app-title">VocalIA</h1>

      {mode === 'accueil' && (
        <div className="card">
          <p className="status-text">Bienvenue sur VocalIA</p>
          <button className="mic-button" onClick={() => setMode('transcription')}>
            <Mic size={32} />
          </button>
          <p className="status-text">Appuyez sur le micro pour démarrer une transcription</p>
        </div>
      )}

      {mode === 'fichiers' && (
        <div className="card">
          <p className="status-text" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', marginBottom: '10px' }}>
            <UploadCloud size={16} /> Importer un fichier audio
          </p>
          <input
            type="file"
            accept="audio/*"
            onChange={gererImportFichier}
            className="input-field"
            style={{ marginBottom: '16px' }}
          />

          {analyseEnCours && <p className="status-text">Analyse du fichier en cours…</p>}

          {texteImporte && (
            <div>
              <p className="transcript-box">{texteImporte}</p>
              <button className="btn-primary" onClick={sauvegarderFichierImporte} style={{ marginTop: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                <Save size={16} /> Enregistrer la transcription
              </button>
              {messageSauvegardeFichier && (
                <p className="status-text" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                  <CheckCircle2 size={16} /> {messageSauvegardeFichier}
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {mode === 'transcription' && (
        <div className="card">
          {!enregistrement && (
            <>
              <label className="field-label">Durée de l'enregistrement</label>
              <select
                className="input-field"
                value={dureeChoisie}
                onChange={(e) => setDureeChoisie(Number(e.target.value))}
                style={{ marginBottom: '24px' }}
              >
                <option value={30}>30 minutes</option>
                <option value={60}>1 heure</option>
                <option value={120}>2 heures</option>
              </select>

              <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
                <input
                  type="time"
                  className="input-field"
                  value={heureProgrammee}
                  onChange={(e) => setHeureProgrammee(e.target.value)}
                  disabled={programmationActive}
                />
                {!programmationActive ? (
                  <button className="btn-secondary" onClick={programmerEnregistrement} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Calendar size={16} /> Planifier
                  </button>
                ) : (
                  <button className="btn-secondary" onClick={annulerProgrammation} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <X size={16} /> Annuler
                  </button>
                )}
              </div>
            </>
          )}

          {programmationActive && <p className="status-text">Démarrage prévu à {heureProgrammee}</p>}

          <div className="mic-wrapper">
            {enregistrement && (
              <>
                <span className="pulse-ring recording"></span>
                <span className="pulse-ring recording ring-delay-1"></span>
                <span className="pulse-ring recording ring-delay-2"></span>
              </>
            )}
            <button
              className={`mic-button ${enregistrement ? 'recording' : ''}`}
              onClick={enregistrement ? arreterEnregistrement : demarrerEnregistrement}
            >
              {enregistrement ? <Square size={28} /> : <Mic size={28} />}
            </button>
          </div>

          {enregistrement && (
            <p className="status-text" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
              <Circle size={10} fill="#ef4444" color="#ef4444" /> Enregistrement en cours
            </p>
          )}
          {envoiEnCours && <p className="status-text">Transcription en cours…</p>}

          {audioUrl && (
            <div style={{ marginBottom: '16px' }}>
              <audio controls src={audioUrl} style={{ width: '100%' }}></audio>
            </div>
          )}

          {transcriptionComplete && (
            <div>
              <p className="transcript-box">{transcriptionComplete}</p>
              <button className="btn-primary" onClick={sauvegarderTranscription} style={{ marginTop: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                <Save size={16} /> Enregistrer la transcription
              </button>
              {messageSauvegarde && (
                <p className="status-text" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                  <CheckCircle2 size={16} /> {messageSauvegarde}
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {mode === 'assistant' && (
        <div className="card assistant-card">
          <div className="assistant-toggle">
            <button
              className={`btn-secondary ${modeAssistant === 'vocal' ? 'active' : ''}`}
              onClick={() => setModeAssistant('vocal')}
            >
              <Mic size={16} /> Voix
            </button>
            <button
              className={`btn-secondary ${modeAssistant === 'texte' ? 'active' : ''}`}
              onClick={() => setModeAssistant('texte')}
            >
              <Keyboard size={16} /> Texte
            </button>
          </div>

          <div className="chat-messages">
            {conversation.map((msg, i) => (
              <div key={i} className={`chat-bubble ${msg.role === 'user' ? 'user' : 'assistant'}`}>
                {msg.texte}
              </div>
            ))}
            {assistantEnCours && (
              <div className="chat-bubble assistant chat-bubble-loading">
                <span className="dot"></span>
                <span className="dot"></span>
                <span className="dot"></span>
              </div>
            )}
            <div ref={finConversationRef}></div>
          </div>

          {aEchangeAssistant && (
            <div style={{ marginBottom: '12px' }}>
              <button className="btn-secondary" onClick={sauvegarderConversation} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', width: '100%' }}>
                <Save size={16} /> Enregistrer la conversation
              </button>
              {messageSauvegardeConversation && (
                <p className="status-text" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                  <CheckCircle2 size={16} /> {messageSauvegardeConversation}
                </p>
              )}
            </div>
          )}

          {modeAssistant === 'vocal' ? (
            <>
              <div className="mic-wrapper">
                {enregistrementAssistant && (
                  <>
                    <span className="pulse-ring recording"></span>
                    <span className="pulse-ring recording ring-delay-1"></span>
                    <span className="pulse-ring recording ring-delay-2"></span>
                  </>
                )}
                <button
                  className={`mic-button ${enregistrementAssistant ? 'recording' : ''}`}
                  onClick={enregistrementAssistant ? arreterAssistant : demarrerAssistant}
                >
                  {enregistrementAssistant ? <Square size={28} /> : <Mic size={28} />}
                </button>
              </div>

              {enregistrementAssistant && (
                <p className="status-text" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                  <Circle size={10} fill="#ef4444" color="#ef4444" /> Je vous écoute…
                </p>
              )}
            </>
          ) : (
            <div className="chat-input-row">
              <input
                type="text"
                className="input-field"
                placeholder="Écrivez votre message…"
                value={messageTexte}
                onChange={(e) => setMessageTexte(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && envoyerMessageTexte()}
              />
              <button
                className="btn-send"
                onClick={envoyerMessageTexte}
                disabled={!messageTexte.trim() || assistantEnCours}
              >
                <Send size={18} />
              </button>
            </div>
          )}
        </div>
      )}

      {mode === 'historique' && (
        <div className="card">
          <div className="assistant-toggle">
            <button
              className={`btn-secondary ${sousOngletSauvegarde === 'transcriptions' ? 'active' : ''}`}
              onClick={() => setSousOngletSauvegarde('transcriptions')}
            >
              Transcriptions
            </button>
            <button
              className={`btn-secondary ${sousOngletSauvegarde === 'conversations' ? 'active' : ''}`}
              onClick={() => setSousOngletSauvegarde('conversations')}
            >
              Conversations
            </button>
          </div>

          <div style={{ position: 'relative', marginBottom: '16px' }}>
            <Search size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#999' }} />
            <input
              type="text"
              className="input-field"
              placeholder="Rechercher dans vos sauvegardes"
              value={rechercheHistorique}
              onChange={(e) => setRechercheHistorique(e.target.value)}
              style={{ paddingLeft: '36px' }}
            />
          </div>

          {sousOngletSauvegarde === 'transcriptions' ? (
            <>
              {historiqueFiltre.length === 0 && (
                <p className="status-text">
                  {historique.length === 0
                    ? "Vous n'avez encore aucune sauvegarde."
                    : "Aucun résultat trouvé."}
                </p>
              )}

              {historiqueFiltre.map((item) => (
                <div key={item.id} className="history-item">
                  <p className="history-date">{item.date}</p>
                  <p>{item.texte}</p>
                  {item.audio_url && (
                    <audio controls src={`${API_URL}${item.audio_url}`} style={{ width: '100%', marginTop: '8px' }}></audio>
                  )}
                </div>
              ))}
            </>
          ) : (
            <>
              {conversationsFiltrees.length === 0 && (
                <p className="status-text">
                  {conversationsSauvegardees.length === 0
                    ? "Vous n'avez encore aucune conversation enregistrée."
                    : "Aucun résultat trouvé."}
                </p>
              )}

              {conversationsFiltrees.map((conv) => (
                <div key={conv.id} className="history-item">
                  <p className="history-date">{conv.date}</p>
                  {conv.messages.map((m, i) => (
                    <p key={i} style={{ marginBottom: '4px' }}>
                      <strong>{m.role === 'user' ? 'Vous : ' : 'VocalIA : '}</strong>{m.texte}
                    </p>
                  ))}
                </div>
              ))}
            </>
          )}
        </div>
      )}

      {mode === 'reglages' && (
        <div className="card">
          <p className="settings-section-title">Transcription</p>

          <div style={{ marginBottom: '28px', textAlign: 'left' }}>
            <label className="field-label">Langue de transcription</label>
            <select className="input-field" value={langue} onChange={(e) => setLangue(e.target.value)}>
              <option value="fr">Français</option>
              <option value="en">Anglais</option>
              <option value="ee">Éwé (expérimental)</option>
            </select>
          </div>

          <div style={{ marginBottom: '28px', textAlign: 'left' }}>
            <label className="field-label">Durée d'un segment de transcription</label>
            <select
              className="input-field"
              value={dureeTrancheMinutes}
              onChange={(e) => setDureeTrancheMinutes(Number(e.target.value))}
            >
              <option value={3}>3 minutes</option>
              <option value={5}>5 minutes</option>
              <option value={10}>10 minutes</option>
            </select>
          </div>

          <p className="settings-section-title">Sauvegardes</p>

          <div className="toggle-row">
            <span className="field-label" style={{ margin: 0 }}>Inclure l'audio dans les sauvegardes</span>
            <label className="toggle-switch">
              <input
                type="checkbox"
                checked={inclureAudio}
                onChange={(e) => setInclureAudio(e.target.checked)}
              />
              <span className="toggle-slider"></span>
            </label>
          </div>

          <p className="settings-section-title">Notifications</p>

          {permissionNotif === 'granted' && (
            <p className="status-text" style={{ display: 'flex', alignItems: 'center', gap: '6px', textAlign: 'left' }}>
              <CheckCircle2 size={16} /> Notifications activées
            </p>
          )}
          {permissionNotif === 'denied' && (
            <p className="status-text" style={{ textAlign: 'left' }}>
              Notifications bloquées. Autorisez-les dans les paramètres de votre navigateur pour ce site.
            </p>
          )}
          {permissionNotif === 'default' && (
            <button className="btn-secondary" onClick={demanderPermissionNotification} style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
              <Bell size={16} /> Activer les notifications
            </button>
          )}

          <p className="settings-section-title">Sauvegarde cloud</p>

          <button className="btn-secondary" disabled style={{ width: '100%', marginBottom: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', opacity: 0.5, cursor: 'not-allowed' }}>
            <Cloud size={16} /> Connecter Google Drive — Bientôt disponible
          </button>

          <button className="btn-secondary" disabled style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', opacity: 0.5, cursor: 'not-allowed' }}>
            <HardDrive size={16} /> Connecter Dropbox — Bientôt disponible
          </button>
        </div>
      )}

      <div className="bottom-nav">
        <button className={`nav-item ${mode === 'accueil' ? 'active' : ''}`} onClick={() => setMode('accueil')}>
          <Home size={22} />
          <span className="nav-label">Accueil</span>
        </button>
        <button className={`nav-item ${mode === 'fichiers' ? 'active' : ''}`} onClick={() => setMode('fichiers')}>
          <Folder size={22} />
          <span className="nav-label">Fichiers</span>
        </button>
        <button className={`nav-item ${mode === 'transcription' ? 'active' : ''}`} onClick={() => setMode('transcription')}>
          <Mic size={22} />
          <span className="nav-label">Live</span>
        </button>
        <button className={`nav-item ${mode === 'assistant' ? 'active' : ''}`} onClick={() => setMode('assistant')}>
          <MessageCircle size={22} />
          <span className="nav-label">Assistant</span>
        </button>
        <button className={`nav-item ${mode === 'historique' ? 'active' : ''}`} onClick={() => setMode('historique')}>
          <Save size={22} />
          <span className="nav-label">Sauvegardes</span>
        </button>
        <button className={`nav-item ${mode === 'reglages' ? 'active' : ''}`} onClick={() => setMode('reglages')}>
          <Settings size={22} />
          <span className="nav-label">Réglages</span>
        </button>
      </div>
    </div>
  )
}

export default App