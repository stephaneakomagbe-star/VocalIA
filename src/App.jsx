import React, { useState, useRef, useEffect } from 'react'
import { Home, Mic, MessageCircle, Save, Settings, Square, Calendar, X, Search, UploadCloud, Circle, CheckCircle2, Cloud, HardDrive, Send, Keyboard, Bell, LogOut, Trash2, Download, AlertTriangle, Link2 } from 'lucide-react'
import { apiFetch, apiUpload, verifierServeur, chargerBlobAudio, chargerConfig } from './api'
import './App.css'

// --- Filet de sécurité : si un rendu plante quelque part dans l'appli,
// on affiche un message au lieu de laisser l'écran devenir noir sans explication.
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = { erreur: null }
  }

  static getDerivedStateFromError(erreur) {
    return { erreur }
  }

  componentDidCatch(erreur, info) {
    console.error('Erreur capturée par ErrorBoundary :', erreur, info)
  }

  render() {
    if (this.state.erreur) {
      return (
        <div className="app-container">
          <div className="card">
            <p className="status-text" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
              <AlertTriangle size={18} /> Une erreur est survenue dans l'affichage.
            </p>
            <p className="status-text">{String(this.state.erreur.message || this.state.erreur)}</p>
            <button className="btn-primary" onClick={() => window.location.reload()}>
              Recharger l'application
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}

function AppInterne() {
  // --- Authentification ---
  const [token, setToken] = useState(() => localStorage.getItem('vocalia_token'))
  const [emailUtilisateur, setEmailUtilisateur] = useState(() => localStorage.getItem('vocalia_email'))
  const [prenomUtilisateur, setPrenomUtilisateur] = useState(() => localStorage.getItem('vocalia_prenom') || '')
  const [modeAuth, setModeAuth] = useState('connexion') // 'connexion' ou 'inscription'
  const [emailSaisi, setEmailSaisi] = useState('')
  const [mdpSaisi, setMdpSaisi] = useState('')
  const [mdpConfirm, setMdpConfirm] = useState('')
  const [prenomSaisi, setPrenomSaisi] = useState('')
  const [nomSaisi, setNomSaisi] = useState('')
  const [telephoneSaisi, setTelephoneSaisi] = useState('')
  const [erreurAuth, setErreurAuth] = useState('')
  const [authEnCours, setAuthEnCours] = useState(false)
  const [serveurJoignable, setServeurJoignable] = useState(null)
  const [googleClientId, setGoogleClientId] = useState('')
  const [driveConnecte, setDriveConnecte] = useState(() => Boolean(localStorage.getItem('vocalia_drive_token')))
  const [sauvegardeCloudAuto, setSauvegardeCloudAuto] = useState(
    () => localStorage.getItem('vocalia_cloud_auto') === '1',
  )
  const [messageDrive, setMessageDrive] = useState('')

  // --- Navigation principale : 'accueil' (Live + Import fusionnés), 'assistant', 'historique', 'reglages' ---
  const [mode, setMode] = useState('accueil')
  // --- Sous-onglet de l'écran Accueil : 'direct' (enregistrement live) ou 'importer' (fichier/lien) ---
  const [sousModeAccueil, setSousModeAccueil] = useState('direct')

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
  const [lienImporte, setLienImporte] = useState('')
  const [apercuImporte, setApercuImporte] = useState(null)
  const [texteImporte, setTexteImporte] = useState('')
  const [noteImportee, setNoteImportee] = useState('')
  const [analyseEnCours, setAnalyseEnCours] = useState(false)
  const [progressionImport, setProgressionImport] = useState(0)
  const [idAudioTemporaire, setIdAudioTemporaire] = useState(null)
  const [messageSauvegardeFichier, setMessageSauvegardeFichier] = useState('')

  const [permissionNotif, setPermissionNotif] = useState(
    typeof Notification !== 'undefined' ? Notification.permission : 'unsupported'
  )

  useEffect(() => {
    if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
      Notification.requestPermission().then(setPermissionNotif)
    }
  }, [])

  useEffect(() => {
    let ignore = false
    verifierServeur().then((ok) => {
      if (!ignore) setServeurJoignable(ok)
    })
    chargerConfig().then((config) => {
      if (!ignore) setGoogleClientId(config.google_client_id || '')
    })
    return () => { ignore = true }
  }, [])

  useEffect(() => {
    if (mode !== 'assistant') {
      if (window.speechSynthesis) {
        window.speechSynthesis.cancel()
      }
    }
  }, [mode])

  useEffect(() => {
    return () => {
      if (audioUrl) URL.revokeObjectURL(audioUrl)
    }
  }, [audioUrl])

  useEffect(() => {
    return () => {
      if (apercuImporte) URL.revokeObjectURL(apercuImporte)
    }
  }, [apercuImporte])

  const demanderPermissionNotification = () => {
    if (typeof Notification === 'undefined') return
    Notification.requestPermission().then(setPermissionNotif)
  }

  const envoyerNotification = (titre, corps) => {
    if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
      new Notification(titre, { body: corps })
    }
  }

  const estErreurSession = (message) =>
    typeof message === 'string' && message.toLowerCase().includes('session')

  // --- Authentification : connexion / inscription ---
  const enregistrerSession = (donnees) => {
    localStorage.setItem('vocalia_token', donnees.token)
    localStorage.setItem('vocalia_email', donnees.email)
    localStorage.setItem('vocalia_prenom', donnees.prenom || '')
    setToken(donnees.token)
    setEmailUtilisateur(donnees.email)
    setPrenomUtilisateur(donnees.prenom || '')
    setErreurAuth('')
  }

  const envoyerVersDrive = async (texte, nom) => {
    const accessToken = localStorage.getItem('vocalia_drive_token')
    if (!accessToken || !sauvegardeCloudAuto) return { ok: true, ignore: true }

    const formData = new FormData()
    formData.append('access_token', accessToken)
    formData.append('texte', texte)
    formData.append('nom', nom)

    const { donnees } = await apiFetch('/sauvegarder-drive', {
      method: 'POST',
      body: formData,
      token,
    })

    if (donnees.erreur) {
      if (String(donnees.erreur).toLowerCase().includes('expir')) {
        localStorage.removeItem('vocalia_drive_token')
        setDriveConnecte(false)
      }
      return { ok: false, erreur: donnees.erreur }
    }
    return { ok: true }
  }

  const soumettreAuth = async () => {
    if (!emailSaisi.trim() || !mdpSaisi.trim()) return
    if (modeAuth === 'inscription') {
      if (prenomSaisi.trim().length < 2 || nomSaisi.trim().length < 2) {
        setErreurAuth('Indiquez votre prénom et votre nom.')
        return
      }
      if (mdpSaisi !== mdpConfirm) {
        setErreurAuth('Les mots de passe ne correspondent pas.')
        return
      }
    }

    setAuthEnCours(true)
    setErreurAuth('')

    const formData = new FormData()
    formData.append('email', emailSaisi.trim())
    formData.append('mot_de_passe', mdpSaisi)
    if (modeAuth === 'inscription') {
      formData.append('prenom', prenomSaisi.trim())
      formData.append('nom', nomSaisi.trim())
      formData.append('telephone', telephoneSaisi.trim())
    }

    const route = modeAuth === 'connexion' ? '/connexion' : '/inscription'

    try {
      const { donnees } = await apiFetch(route, { method: 'POST', body: formData })

      if (donnees.erreur) {
        setErreurAuth(donnees.erreur)
      } else {
        enregistrerSession(donnees)
      }
    } catch (erreur) {
      setErreurAuth(erreur.message)
    }

    setAuthEnCours(false)
  }

  const attendreGoogle = () => new Promise((resolve, reject) => {
    if (window.google?.accounts) {
      resolve()
      return
    }
    const debut = Date.now()
    const timer = setInterval(() => {
      if (window.google?.accounts) {
        clearInterval(timer)
        resolve()
      } else if (Date.now() - debut > 8000) {
        clearInterval(timer)
        reject(new Error('Impossible de charger Google. Vérifiez votre connexion internet.'))
      }
    }, 200)
  })

  const connexionGoogle = async () => {
    if (!googleClientId) {
      setErreurAuth('Ajoutez GOOGLE_CLIENT_ID dans le fichier .env du backend, puis relancez le serveur.')
      return
    }
    setErreurAuth('')
    setAuthEnCours(true)
    try {
      await attendreGoogle()
      window.google.accounts.id.initialize({
        client_id: googleClientId,
        callback: async (reponse) => {
          try {
            const formData = new FormData()
            formData.append('id_token_google', reponse.credential)
            const { donnees } = await apiFetch('/connexion-google', { method: 'POST', body: formData })
            if (donnees.erreur) {
              setErreurAuth(donnees.erreur)
            } else {
              enregistrerSession(donnees)
            }
          } catch (erreur) {
            setErreurAuth(erreur.message)
          }
          setAuthEnCours(false)
        },
      })
      window.google.accounts.id.prompt((notification) => {
        if (notification.isNotDisplayed() || notification.isSkippedMoment()) {
          const conteneur = document.getElementById('bouton-google-vocalia')
          if (conteneur) {
            conteneur.innerHTML = ''
            window.google.accounts.id.renderButton(conteneur, {
              theme: 'outline',
              size: 'large',
              width: 320,
              text: 'continue_with',
              locale: 'fr',
            })
          }
          setAuthEnCours(false)
        }
      })
    } catch (erreur) {
      setErreurAuth(erreur.message)
      setAuthEnCours(false)
    }
  }

  const connecterGoogleDrive = async () => {
    if (!googleClientId) {
      setMessageDrive('Ajoutez GOOGLE_CLIENT_ID dans le .env du backend pour activer Google Drive.')
      return
    }
    try {
      await attendreGoogle()
      const client = window.google.accounts.oauth2.initTokenClient({
        client_id: googleClientId,
        scope: 'https://www.googleapis.com/auth/drive.file',
        callback: (reponse) => {
          if (reponse.access_token) {
            localStorage.setItem('vocalia_drive_token', reponse.access_token)
            setDriveConnecte(true)
            setMessageDrive('Google Drive est connecté. Les sauvegardes peuvent y être envoyées.')
          } else {
            setMessageDrive('Connexion Google Drive annulée.')
          }
        },
      })
      client.requestAccessToken()
    } catch (erreur) {
      setMessageDrive(erreur.message)
    }
  }

  const deconnecterGoogleDrive = () => {
    localStorage.removeItem('vocalia_drive_token')
    setDriveConnecte(false)
    setMessageDrive('Google Drive déconnecté.')
  }

  const seDeconnecter = async () => {
    if (token) {
      apiFetch('/deconnexion', { method: 'POST', token }).catch(() => {})
    }
    localStorage.removeItem('vocalia_token')
    localStorage.removeItem('vocalia_email')
    localStorage.removeItem('vocalia_prenom')
    setToken(null)
    setEmailUtilisateur(null)
    setPrenomUtilisateur('')
    setMode('accueil')
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
    try {
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
    } catch {
      setTranscriptionComplete('Impossible d’accéder au microphone. Vérifiez les permissions.')
    }
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
    setAudioUrl((precedent) => {
      if (precedent) URL.revokeObjectURL(precedent)
      return url
    })
    setEnvoiEnCours(true)

    const formData = new FormData()
    formData.append('fichier', blob, 'tranche.webm')
    formData.append('langue', langue)

    try {
      const { donnees } = await apiFetch('/transcription', {
        method: 'POST',
        body: formData,
        token,
      })

      if (donnees.erreur) {
        if (estErreurSession(donnees.erreur)) {
          seDeconnecter()
          return
        }
        setTranscriptionComplete(prev => prev + ' [' + donnees.erreur + ']')
      } else {
        setTranscriptionComplete(prev => prev + ' ' + donnees.texte)
      }
    } catch (erreur) {
      setTranscriptionComplete(prev => prev + ' [' + erreur.message + ']')
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

    try {
      const { donnees } = await apiFetch('/sauvegarder', {
        method: 'POST',
        body: formData,
        token,
      })

      if (donnees.erreur) {
        if (estErreurSession(donnees.erreur)) {
          seDeconnecter()
          return
        }
        setMessageSauvegarde(donnees.erreur)
      } else {
        setMessageSauvegarde('Transcription enregistrée avec succès.')
        envoyerNotification("VocalIA", "Votre transcription a été enregistrée.")
        tranchesAudioRef.current = []
        const cloud = await envoyerVersDrive(
          transcriptionComplete,
          `transcription-vocalia-${Date.now()}.txt`,
        )
        if (!cloud.ok) {
          setMessageSauvegarde(`Enregistrée localement. Cloud : ${cloud.erreur}`)
        } else if (!cloud.ignore) {
          setMessageSauvegarde('Transcription enregistrée et envoyée sur Google Drive.')
        }
      }
    } catch (erreur) {
      setMessageSauvegarde(erreur.message)
    }
    setTimeout(() => setMessageSauvegarde(''), 3000)
  }

  const demarrerAssistant = async () => {
    try {
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
    } catch {
      setConversation(prev => [...prev, { role: 'assistant', texte: 'Impossible d’accéder au microphone. Vérifiez les permissions.' }])
    }
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

    try {
      const { donnees } = await apiFetch('/assistant', {
        method: 'POST',
        body: formData,
        token,
      })

      if (donnees.erreur) {
        if (estErreurSession(donnees.erreur)) {
          seDeconnecter()
          return
        }
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
    } catch (erreur) {
      setConversation(prev => [...prev, { role: 'assistant', texte: erreur.message }])
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

    try {
      const { donnees } = await apiFetch('/assistant-texte', {
        method: 'POST',
        body: formData,
        token,
      })

      if (donnees.erreur) {
        if (estErreurSession(donnees.erreur)) {
          seDeconnecter()
          return
        }
        setConversation(prev => [...prev, { role: 'assistant', texte: donnees.erreur }])
      } else {
        setConversation(prev => [...prev, { role: 'assistant', texte: donnees.reponse }])
      }
    } catch (erreur) {
      setConversation(prev => [...prev, { role: 'assistant', texte: erreur.message }])
    }
    setAssistantEnCours(false)
  }

  const sauvegarderConversation = async () => {
    const formData = new FormData()
    formData.append('conversation', JSON.stringify(conversation))

    try {
      const { donnees } = await apiFetch('/sauvegarder-conversation', {
        method: 'POST',
        body: formData,
        token,
      })

      if (donnees.erreur) {
        if (estErreurSession(donnees.erreur)) {
          seDeconnecter()
          return
        }
        setMessageSauvegardeConversation(donnees.erreur)
      } else {
        setMessageSauvegardeConversation('Conversation enregistrée avec succès.')
        envoyerNotification("VocalIA", "Votre conversation a été enregistrée.")
        const texteConv = conversation
          .map((m) => `${m.role === 'user' ? 'Vous' : 'VocalIA'} : ${m.texte}`)
          .join('\n')
        const cloud = await envoyerVersDrive(texteConv, `conversation-vocalia-${Date.now()}.txt`)
        if (!cloud.ok) {
          setMessageSauvegardeConversation(`Enregistrée localement. Cloud : ${cloud.erreur}`)
        } else if (!cloud.ignore) {
          setMessageSauvegardeConversation('Conversation enregistrée et envoyée sur Google Drive.')
        }
      }
    } catch (erreur) {
      setMessageSauvegardeConversation(erreur.message)
    }
    setTimeout(() => setMessageSauvegardeConversation(''), 3000)
  }

  const lireAVoixHaute = (texte) => {
    if (!windows.speechSynthesis) return
    const parole = new SpeechSynthesisUtterance(texte)
    parole.lang = 'fr-FR'
    window.speechSynthesis.speak(parole)
  }

  const chargerHistorique = async () => {
    try {
      const { donnees } = await apiFetch('/historique', { token })
      if (donnees.erreur) {
        if (estErreurSession(donnees.erreur)) seDeconnecter()
        return
      }

      setHistorique((precedent) => {
        precedent.forEach((item) => {
          if (item.audio_blob_url) URL.revokeObjectURL(item.audio_blob_url)
        })
        return []
      })

      const brutes = Array.isArray(donnees.transcriptions) ? donnees.transcriptions : []

      const avecAudio = await Promise.all(
        brutes.map(async (item) => {
          if (!item?.audio_fichier) return item
          try {
            const audio_blob_url = await chargerBlobAudio(token, item.audio_fichier)
            return { ...item, audio_blob_url }
          } catch {
            return item
          }
        })
      )
      setHistorique(avecAudio)
    } catch {
      setHistorique([])
    }
  }

  const chargerHistoriqueConversations = async () => {
    try {
      const { donnees } = await apiFetch('/historique-conversations', { token })
      if (donnees.erreur) {
        if (estErreurSession(donnees.erreur)) seDeconnecter()
        return
      }
      setConversationsSauvegardees(Array.isArray(donnees.conversations) ? donnees.conversations : [])
    } catch {
      setConversationsSauvegardees([])
    }
  }

  const supprimerTranscription = async (id) => {
    try {
      const { donnees } = await apiFetch(`/transcriptions/${id}`, { method: 'DELETE', token })
      if (donnees.erreur) {
        if (estErreurSession(donnees.erreur)) seDeconnecter()
        return
      }
      setHistorique((prev) => {
        const cible = prev.find((item) => item.id === id)
        if (cible?.audio_blob_url) URL.revokeObjectURL(cible.audio_blob_url)
        return prev.filter((item) => item.id !== id)
      })
    } catch {
      /* ignore */
    }
  }

  const supprimerConversation = async (id) => {
    try {
      const { donnees } = await apiFetch(`/conversations/${id}`, { method: 'DELETE', token })
      if (donnees.erreur) {
        if (estErreurSession(donnees.erreur)) seDeconnecter()
        return
      }
      setConversationsSauvegardees((prev) => prev.filter((item) => item.id !== id))
    } catch {
      /* ignore */
    }
  }

  const exporterTexte = (nomFichier, contenu) => {
    const blob = new Blob([contenu], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const lien = document.createElement('a')
    lien.href = url
    lien.download = nomFichier
    lien.click()
    URL.revokeObjectURL(url)
  }

  const historiqueFiltre = historique.filter(item =>
    (item?.texte || '').toLowerCase().includes(rechercheHistorique.toLowerCase())
  )

  const conversationsFiltrees = conversationsSauvegardees.filter(conv =>
    Array.isArray(conv?.messages) &&
    conv.messages.some(m => (m?.texte || '').toLowerCase().includes(rechercheHistorique.toLowerCase()))
  )

  const gererImportFichier = async (event) => {
    const fichier = event.target.files[0]
    if (!fichier) return

    setFichierImporte(fichier)
    setLienImporte('')
    setTexteImporte('')
    setNoteImportee('')
    setIdAudioTemporaire(null)
    setProgressionImport(0)
    setAnalyseEnCours(true)
    setApercuImporte((precedent) => {
      if (precedent) URL.revokeObjectURL(precedent)
      return URL.createObjectURL(fichier)
    })

    const formData = new FormData()
    formData.append('fichier', fichier)
    formData.append('langue', langue)
    formData.append('conserver_audio', '1')

    try {
      const { donnees } = await apiUpload('/transcription', {
        token,
        body: formData,
        onProgress: setProgressionImport,
      })

      if (donnees.erreur) {
        if (estErreurSession(donnees.erreur)) {
          seDeconnecter()
          return
        }
        setTexteImporte(donnees.erreur)
      } else {
        setTexteImporte(donnees.texte)
        setNoteImportee(donnees.note || '')
        setIdAudioTemporaire(donnees.audio_temporaire || null)
      }
    } catch (erreur) {
      setTexteImporte(erreur.message)
    }
    setAnalyseEnCours(false)
  }

  const envoyerLienImporte = async (urlManuelle = null) => {
    const url = (typeof urlManuelle === 'string' ? urlManuelle : lienImporte).trim()
    if (!url || analyseEnCours) return

    setFichierImporte(null)
    setTexteImporte('')
    setNoteImportee('')
    setIdAudioTemporaire(null)
    setProgressionImport(0)
    setAnalyseEnCours(true)
    setApercuImporte((precedent) => {
      if (precedent) URL.revokeObjectURL(precedent)
      return null
    })

    const formData = new FormData()
    formData.append('url', url)
    formData.append('langue', langue)
    formData.append('conserver_audio', '1')

    try {
      const { donnees } = await apiFetch('/transcription-lien', {
        method: 'POST',
        body: formData,
        token,
      })

      if (donnees.erreur) {
        if (estErreurSession(donnees.erreur)) {
          seDeconnecter()
          return
        }
        setTexteImporte(donnees.erreur)
      } else {
        setTexteImporte(donnees.texte)
        setNoteImportee(donnees.note || '')
        setIdAudioTemporaire(donnees.audio_temporaire || null)
        setLienImporte('')
      }
    } catch (erreur) {
      setTexteImporte(erreur.message)
    }

    setAnalyseEnCours(false)
  }

  const sauvegarderFichierImporte = async () => {
    if (!texteImporte.trim()) return

    const formData = new FormData()
    formData.append('texte', texteImporte)
    if (idAudioTemporaire && inclureAudio) {
      formData.append('audio_temporaire', idAudioTemporaire)
    }

    try {
      const { donnees } = await apiFetch('/sauvegarder', {
        method: 'POST',
        body: formData,
        token,
      })

      if (donnees.erreur) {
        if (estErreurSession(donnees.erreur)) {
          seDeconnecter()
          return
        }
        setMessageSauvegardeFichier(donnees.erreur)
      } else {
        setIdAudioTemporaire(null)
        envoyerNotification("VocalIA", "Votre transcription a été enregistrée.")
        const cloud = await envoyerVersDrive(texteImporte, `fichier-vocalia-${Date.now()}.txt`)
        if (!cloud.ok) {
          setMessageSauvegardeFichier(`Enregistrée localement. Cloud : ${cloud.erreur}`)
        } else if (!cloud.ignore) {
          setMessageSauvegardeFichier('Transcription enregistrée et envoyée sur Google Drive.')
        } else {
          setMessageSauvegardeFichier('Transcription enregistrée avec succès.')
        }
      }
    } catch (erreur) {
      setMessageSauvegardeFichier(erreur.message)
    }
    setTimeout(() => setMessageSauvegardeFichier(''), 4000)
  }

  const aEchangeAssistant = conversation.some(m => m.role === 'user')

  // --- Écran de connexion / inscription, affiché si pas de token ---
  if (!token) {
    return (
      <div className="app-container">
        <div className="ambient-glow ambient-glow-1"></div>
        <div className="ambient-glow ambient-glow-2"></div>
        <h1 className="app-title">VocalIA</h1>

        {serveurJoignable === false && (
          <p className="status-text serveur-alerte">
            Le serveur VocalIA n’est pas joignable. Dans un terminal, lancez le backend :
            uvicorn main:app --reload --host 0.0.0.0 --port 8000
          </p>
        )}

        <div className="card">
          <div className="assistant-toggle">
            <button
              className={`btn-secondary ${modeAuth === 'connexion' ? 'active' : ''}`}
              onClick={() => { setModeAuth('connexion'); setErreurAuth('') }}
            >
              Connexion
            </button>
            <button
              className={`btn-secondary ${modeAuth === 'inscription' ? 'active' : ''}`}
              onClick={() => { setModeAuth('inscription'); setErreurAuth('') }}
            >
              Inscription
            </button>
          </div>

          {googleClientId ? (
            <>
              <button
                type="button"
                className="btn-google"
                onClick={connexionGoogle}
                disabled={authEnCours}
              >
                Continuer avec Google
              </button>
              <div id="bouton-google-vocalia" className="google-fallback"></div>
              <div className="auth-separator">ou</div>
            </>
          ) : (
            <p className="status-text" style={{ marginBottom: '16px' }}>
              Compte Google : ajoutez GOOGLE_CLIENT_ID dans le .env du backend pour l’activer.
            </p>
          )}

          <div style={{ textAlign: 'left', marginBottom: '16px' }}>
            {modeAuth === 'inscription' && (
              <>
                <label className="field-label">Prénom</label>
                <input
                  type="text"
                  className="input-field"
                  value={prenomSaisi}
                  onChange={(e) => setPrenomSaisi(e.target.value)}
                  style={{ marginBottom: '16px' }}
                />
                <label className="field-label">Nom</label>
                <input
                  type="text"
                  className="input-field"
                  value={nomSaisi}
                  onChange={(e) => setNomSaisi(e.target.value)}
                  style={{ marginBottom: '16px' }}
                />
                <label className="field-label">Téléphone (optionnel)</label>
                <input
                  type="tel"
                  className="input-field"
                  value={telephoneSaisi}
                  onChange={(e) => setTelephoneSaisi(e.target.value)}
                  style={{ marginBottom: '16px' }}
                />
              </>
            )}
            <label className="field-label">Email</label>
            <input
              type="email"
              className="input-field"
              value={emailSaisi}
              onChange={(e) => setEmailSaisi(e.target.value)}
              style={{ marginBottom: '16px' }}
            />
            <label className="field-label">Mot de passe</label>
            <input
              type="password"
              className="input-field"
              value={mdpSaisi}
              onChange={(e) => setMdpSaisi(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && soumettreAuth()}
              style={{ marginBottom: modeAuth === 'inscription' ? '16px' : 0 }}
            />
            {modeAuth === 'inscription' && (
              <>
                <label className="field-label">Confirmer le mot de passe</label>
                <input
                  type="password"
                  className="input-field"
                  value={mdpConfirm}
                  onChange={(e) => setMdpConfirm(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && soumettreAuth()}
                />
              </>
            )}
          </div>

          {erreurAuth && <p className="status-text">{erreurAuth}</p>}

          <button
            className="btn-primary"
            onClick={soumettreAuth}
            disabled={
              authEnCours
              || !emailSaisi.trim()
              || !mdpSaisi.trim()
              || (modeAuth === 'inscription' && (
                prenomSaisi.trim().length < 2
                || nomSaisi.trim().length < 2
                || !mdpConfirm
              ))
            }
          >
            {authEnCours ? 'Veuillez patienter…' : modeAuth === 'connexion' ? 'Se connecter' : 'Créer mon compte'}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="app-container">
      <div className="ambient-glow ambient-glow-1"></div>
      <div className="ambient-glow ambient-glow-2"></div>
      <h1 className="app-title">VocalIA</h1>

      {mode === 'accueil' && (
        <div className="card">
          <p className="status-text" style={{ marginTop: 0 }}>
            {prenomUtilisateur ? `Bienvenue, ${prenomUtilisateur}` : 'Bienvenue sur VocalIA'}
          </p>

          <div className="assistant-toggle">
            <button
              className={`btn-secondary ${sousModeAccueil === 'direct' ? 'active' : ''}`}
              onClick={() => setSousModeAccueil('direct')}
            >
              <Mic size={16} /> Enregistrer
            </button>
            <button
              className={`btn-secondary ${sousModeAccueil === 'importer' ? 'active' : ''}`}
              onClick={() => setSousModeAccueil('importer')}
            >
              <UploadCloud size={16} /> Importer
            </button>
          </div>

          {sousModeAccueil === 'direct' && (
            <>
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
            </>
          )}

          {sousModeAccueil === 'importer' && (
            <>
              <p className="status-text" style={{ marginTop: 0, marginBottom: '12px' }}>
                MP3, WAV, MP4, MOV, MKV… sans limite de taille. L’audio est extrait automatiquement.
              </p>

              <div className="import-grid">
                <div className="file-import-box">
                  <input
                    type="file"
                    accept="audio/*,video/*,.mp4,.mov,.mkv,.avi,.webm,.m4a,.mp3,.wav,.ogg,.flac"
                    onChange={gererImportFichier}
                    className="input-field file-input"
                  />
                </div>

                <div className="divider-with-label">
                  <div className="divider-line"></div>
                  <span>ou</span>
                  <div className="divider-line"></div>
                </div>

                <div className="link-import-box">
                  <label className="field-label">Coller un lien (n'importe quelle source audio ou vidéo)</label>
                  <div className="link-import-row">
                    <input
                      type="url"
                      className="input-field"
                      placeholder="Collez ici le lien de la vidéo ou de l'audio"
                      value={lienImporte}
                      onChange={(e) => setLienImporte(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && envoyerLienImporte()}
                      onPaste={(e) => {
                        const pasted = (e.clipboardData || window.clipboardData)?.getData('text') || ''
                        if (!pasted) return
                        e.preventDefault()
                        setLienImporte(pasted)
                        setTimeout(() => envoyerLienImporte(pasted), 50)
                      }}
                      style={{ flex: 1 }}
                    />
                    <button
                      className="btn-secondary upload-link-btn"
                      onClick={() => envoyerLienImporte()}
                      disabled={!lienImporte.trim() || analyseEnCours}
                    >
                      <Link2 size={16} />
                    </button>
                  </div>
                  <p className="status-text" style={{ marginTop: '8px', marginBottom: 0, fontSize: '12px', textAlign: 'left' }}>
                    YouTube, Facebook, Instagram, Google Drive, Dropbox, ou tout autre lien direct vers un fichier audio ou vidéo.
                  </p>
                </div>
              </div>

              {fichierImporte && (
                <p className="status-text">
                  {fichierImporte.name} ({(fichierImporte.size / (1024 * 1024)).toFixed(1)} Mo)
                </p>
              )}

              {apercuImporte && fichierImporte?.type.startsWith('video/') && (
                <video className="preview-media" controls src={apercuImporte}></video>
              )}
              {apercuImporte && fichierImporte?.type.startsWith('audio/') && (
                <audio controls src={apercuImporte} style={{ width: '100%', marginBottom: '12px' }}></audio>
              )}

              {analyseEnCours && (
                <>
                  <p className="status-text">
                    {progressionImport < 100
                      ? `Envoi du fichier… ${progressionImport} %`
                      : 'Extraction audio et transcription en cours, cela peut être long sur les gros fichiers…'}
                  </p>
                  <div className="progress-track">
                    <div className="progress-fill" style={{ width: `${Math.max(progressionImport, progressionImport < 100 ? progressionImport : 100)}%` }}></div>
                  </div>
                </>
              )}

              {noteImportee && <p className="status-text">{noteImportee}</p>}

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
            </>
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
        <div className="card history-panel">
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
                <div className="empty-state">
                  {historique.length === 0
                    ? "Vous n'avez encore aucune sauvegarde."
                    : "Aucun résultat trouvé."}
                </div>
              )}

              {historiqueFiltre.map((item) => (
                <div key={item.id} className="history-item">
                  <p className="history-date">{item.date}</p>
                  <p>{item.texte}</p>
                  {item.audio_blob_url && (
                    <audio controls src={item.audio_blob_url} style={{ width: '100%', marginTop: '8px' }}></audio>
                  )}
                  <div className="history-actions">
                    <button
                      className="btn-secondary"
                      onClick={() => exporterTexte(`transcription-${item.id}.txt`, item.texte)}
                      style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
                    >
                      <Download size={14} /> Exporter
                    </button>
                    <button
                      className="btn-secondary"
                      onClick={() => supprimerTranscription(item.id)}
                      style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
                    >
                      <Trash2 size={14} /> Supprimer
                    </button>
                  </div>
                </div>
              ))}
            </>
          ) : (
            <>
              {conversationsFiltrees.length === 0 && (
                <div className="empty-state">
                  {conversationsSauvegardees.length === 0
                    ? "Vous n'avez encore aucune conversation enregistrée."
                    : "Aucun résultat trouvé."}
                </div>
              )}

              {conversationsFiltrees.map((conv) => (
                <div key={conv.id} className="history-item">
                  <p className="history-date">{conv.date}</p>
                  {Array.isArray(conv.messages) && conv.messages.map((m, i) => (
                    <p key={i} style={{ marginBottom: '4px' }}>
                      <strong>{m?.role === 'user' ? 'Vous : ' : 'VocalIA : '}</strong>{m?.texte || ''}
                    </p>
                  ))}
                  <div className="history-actions">
                    <button
                      className="btn-secondary"
                      onClick={() => exporterTexte(
                        `conversation-${conv.id}.txt`,
                        (conv.messages || []).map((m) => `${m?.role === 'user' ? 'Vous' : 'VocalIA'} : ${m?.texte || ''}`).join('\n'),
                      )}
                      style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
                    >
                      <Download size={14} /> Exporter
                    </button>
                    <button
                      className="btn-secondary"
                      onClick={() => supprimerConversation(conv.id)}
                      style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
                    >
                      <Trash2 size={14} /> Supprimer
                    </button>
                  </div>
                </div>
              ))}
            </>
          )}
        </div>
      )}

      {mode === 'reglages' && (
        <div className="card settings-card">
          <p className="settings-section-title">Compte</p>
          {prenomUtilisateur && (
            <p className="status-text" style={{ textAlign: 'left', marginBottom: '16px' }}>
              {prenomUtilisateur}
            </p>
          )}
          <button className="btn-secondary" onClick={seDeconnecter} style={{ width: '100%', marginBottom: '24px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
            <LogOut size={16} /> Se déconnecter
          </button>

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

          <div className="toggle-row">
            <span className="field-label" style={{ margin: 0 }}>Envoyer aussi les sauvegardes sur Google Drive</span>
            <label className="toggle-switch">
              <input
                type="checkbox"
                checked={sauvegardeCloudAuto}
                onChange={(e) => {
                  setSauvegardeCloudAuto(e.target.checked)
                  localStorage.setItem('vocalia_cloud_auto', e.target.checked ? '1' : '0')
                }}
                disabled={!driveConnecte}
              />
              <span className="toggle-slider"></span>
            </label>
          </div>

          {driveConnecte ? (
            <button className="btn-secondary" onClick={deconnecterGoogleDrive} style={{ width: '100%', marginBottom: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
              <Cloud size={16} /> Google Drive connecté — Déconnecter
            </button>
          ) : (
            <button className="btn-secondary" onClick={connecterGoogleDrive} style={{ width: '100%', marginBottom: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
              <Cloud size={16} /> Connecter Google Drive
            </button>
          )}

          {messageDrive && <p className="status-text">{messageDrive}</p>}

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

export default function App() {
  return (
    <ErrorBoundary>
      <AppInterne />
    </ErrorBoundary>
  )
}