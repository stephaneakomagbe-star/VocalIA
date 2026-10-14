import React, { useState, useRef, useEffect } from 'react'
import { Home, Mic, MessageCircle, Save, Settings, Square, Calendar, X, Search, UploadCloud, Circle, CheckCircle2, Cloud, HardDrive, Send, Keyboard, Bell, LogOut, Trash2, Download, AlertTriangle, Link2, Languages, FileText, Copy, Volume2, VolumeX } from 'lucide-react'
import { apiFetch, apiUpload, verifierServeur, chargerBlobAudio, chargerConfig, obtenirApiUrl, definirApiUrl } from './api'
import './App.css'

const CLE_ETAT = 'vocalia_etat_v2'
const CLE_TRAVAIL = 'vocalia_travail'
const CLE_OUTIL = 'vocalia_outil'
const CLE_LECTURE_AUTO = 'vocalia_lecture_auto_texte'

const OPTIONS_LANGUES = [
  ['français', 'Français'],
  ['anglais', 'Anglais'],
  ['espagnol', 'Espagnol'],
  ['allemand', 'Allemand'],
  ['portugais', 'Portugais'],
  ['italien', 'Italien'],
  ['arabe', 'Arabe'],
  ['éwé', 'Éwé (expérimental)'],
  ['autre', 'Autre langue…'],
]

const MOTS_ANGLAIS = new Set([
  'the', 'and', 'is', 'are', 'you', 'that', 'with', 'this', 'have', 'for', 'not', 'was', 'what',
  'from', 'they', 'your', 'will', 'would', 'there', 'about', 'which', 'their', 'been', 'were',
])
const MOTS_FRANCAIS = new Set([
  'le', 'la', 'les', 'des', 'est', 'une', 'que', 'pour', 'pas', 'vous', 'dans', 'avec', 'qui',
  'sur', 'ce', 'cette', 'nous', 'mais', 'ont', 'sont', 'du', 'au', 'aux', 'et', 'je', 'il',
])

const langueProbable = (texte) => {
  const mots = (texte || '').toLowerCase().match(/[a-zàâçéèêëîïôûùüÿœ']+/g) || []
  let anglais = 0
  let francais = 0
  mots.forEach((mot) => {
    if (MOTS_ANGLAIS.has(mot)) anglais += 1
    if (MOTS_FRANCAIS.has(mot)) francais += 1
  })
  return anglais > francais ? 'en' : 'fr'
}

const decouperPourLecture = (texte, tailleMax = 180) => {
  const phrases = texte.replace(/\s+/g, ' ').trim().split(/(?<=[.!?…:;])\s+/)
  const morceaux = []
  let courant = ''

  phrases.forEach((phrase) => {
    let reste = phrase
    while (reste.length > tailleMax) {
      let coupe = reste.lastIndexOf(' ', tailleMax)
      if (coupe < 40) coupe = tailleMax
      if (courant) {
        morceaux.push(courant)
        courant = ''
      }
      morceaux.push(reste.slice(0, coupe).trim())
      reste = reste.slice(coupe).trim()
    }
    if (!reste) return
    if (courant && courant.length + reste.length + 1 > tailleMax) {
      morceaux.push(courant)
      courant = reste
    } else {
      courant = courant ? `${courant} ${reste}` : reste
    }
  })

  if (courant) morceaux.push(courant)
  return morceaux
}

function lireAVoixHaute(texte) {
  if (typeof window === 'undefined' || !window.speechSynthesis || !texte || !texte.trim()) return

  const synthese = window.speechSynthesis
  synthese.cancel()

  const prefixe = langueProbable(texte)
  const voix = synthese.getVoices().find((v) => v.lang && v.lang.toLowerCase().startsWith(prefixe))

  decouperPourLecture(texte).forEach((morceau) => {
    const parole = new SpeechSynthesisUtterance(morceau)
    parole.lang = prefixe === 'en' ? 'en-US' : 'fr-FR'
    if (voix) parole.voice = voix
    synthese.speak(parole)
  })
}

function arreterLecture() {
  if (typeof window !== 'undefined' && window.speechSynthesis) {
    window.speechSynthesis.cancel()
  }
}

const lireEtatSauvegarde = () => {
  try {
    const etat = JSON.parse(localStorage.getItem(CLE_ETAT)) || {}
    return etat.proprietaire && etat.proprietaire === localStorage.getItem('vocalia_email') ? etat : {}
  } catch {
    return {}
  }
}

const lireJson = (cle) => {
  try {
    return JSON.parse(localStorage.getItem(cle))
  } catch {
    return null
  }
}

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
  const etatInitial = useRef(lireEtatSauvegarde()).current

  const [token, setToken] = useState(() => localStorage.getItem('vocalia_token'))
  const [emailUtilisateur, setEmailUtilisateur] = useState(() => localStorage.getItem('vocalia_email'))
  const [prenomUtilisateur, setPrenomUtilisateur] = useState(() => localStorage.getItem('vocalia_prenom') || '')
  const [modeAuth, setModeAuth] = useState('connexion')
  const [emailSaisi, setEmailSaisi] = useState('')
  const [mdpSaisi, setMdpSaisi] = useState('')
  const [mdpConfirm, setMdpConfirm] = useState('')
  const [prenomSaisi, setPrenomSaisi] = useState('')
  const [nomSaisi, setNomSaisi] = useState('')
  const [telephoneSaisi, setTelephoneSaisi] = useState('')
  const [erreurAuth, setErreurAuth] = useState('')
  const [authEnCours, setAuthEnCours] = useState(false)
  const [serveurJoignable, setServeurJoignable] = useState(null)
  const [urlApi, setUrlApi] = useState(() => obtenirApiUrl())
  const [urlApiSaisie, setUrlApiSaisie] = useState(() => obtenirApiUrl())
  const [verificationServeur, setVerificationServeur] = useState(true)
  const [googleClientId, setGoogleClientId] = useState('')
  const [driveConnecte, setDriveConnecte] = useState(() => Boolean(localStorage.getItem('vocalia_drive_token')))
  const [sauvegardeCloudAuto, setSauvegardeCloudAuto] = useState(
    () => localStorage.getItem('vocalia_cloud_auto') === '1',
  )
  const [messageDrive, setMessageDrive] = useState('')

  const [mode, setMode] = useState(etatInitial.mode || 'accueil')
  const [sousModeAccueil, setSousModeAccueil] = useState(etatInitial.sousModeAccueil || 'direct')

  const [enregistrement, setEnregistrement] = useState(false)
  const [transcriptionComplete, setTranscriptionComplete] = useState(etatInitial.transcriptionComplete || '')
  const [envoiEnCours, setEnvoiEnCours] = useState(false)
  const [heureProgrammee, setHeureProgrammee] = useState('')
  const [programmationActive, setProgrammationActive] = useState(false)
  const [audioUrl, setAudioUrl] = useState(null)
  const [dureeChoisie, setDureeChoisie] = useState(etatInitial.dureeChoisie || 60)
  const streamRef = useRef(null)
  const mediaRecorderRef = useRef(null)
  const timeoutArretRef = useRef(null)
  const tranchesAudioRef = useRef([])

  const [modeAssistant, setModeAssistant] = useState(etatInitial.modeAssistant || 'vocal')
  const [enregistrementAssistant, setEnregistrementAssistant] = useState(false)
  const [conversation, setConversation] = useState(
    () => (Array.isArray(etatInitial.conversation) ? etatInitial.conversation : []),
  )
  const [messageTexte, setMessageTexte] = useState('')
  const [assistantEnCours, setAssistantEnCours] = useState(false)
  const [lectureAutoTexte, setLectureAutoTexte] = useState(
    () => localStorage.getItem(CLE_LECTURE_AUTO) === '1',
  )
  const assistantRecorderRef = useRef(null)
  const salutationFaiteRef = useRef(Array.isArray(etatInitial.conversation) && etatInitial.conversation.length > 0)
  const finConversationRef = useRef(null)
  const [messageSauvegardeConversation, setMessageSauvegardeConversation] = useState('')

  const [historique, setHistorique] = useState([])
  const [conversationsSauvegardees, setConversationsSauvegardees] = useState([])
  const [sousOngletSauvegarde, setSousOngletSauvegarde] = useState('transcriptions')
  const [messageSauvegarde, setMessageSauvegarde] = useState('')
  const [rechercheHistorique, setRechercheHistorique] = useState('')

  const [langue, setLangue] = useState(etatInitial.langue || 'auto')
  const [dureeTrancheMinutes, setDureeTrancheMinutes] = useState(etatInitial.dureeTrancheMinutes || 5)
  const dureeTranche = dureeTrancheMinutes * 60 * 1000
  const [inclureAudio, setInclureAudio] = useState(
    typeof etatInitial.inclureAudio === 'boolean' ? etatInitial.inclureAudio : true,
  )

  const [fichierImporte, setFichierImporte] = useState(null)
  const [nomImporte, setNomImporte] = useState(etatInitial.nomImporte || '')
  const [lienImporte, setLienImporte] = useState(etatInitial.lienImporte || '')
  const [apercuImporte, setApercuImporte] = useState(null)
  const [texteImporte, setTexteImporte] = useState(etatInitial.texteImporte || '')
  const [noteImportee, setNoteImportee] = useState(etatInitial.noteImportee || '')
  const [analyseEnCours, setAnalyseEnCours] = useState(false)
  const [phaseImport, setPhaseImport] = useState('')
  const [etapeImport, setEtapeImport] = useState('')
  const [progressionImport, setProgressionImport] = useState(0)
  const [idAudioTemporaire, setIdAudioTemporaire] = useState(etatInitial.idAudioTemporaire || null)
  const [messageSauvegardeFichier, setMessageSauvegardeFichier] = useState('')
  const [erreurImport, setErreurImport] = useState('')
  const [langueDetectee, setLangueDetectee] = useState(etatInitial.langueDetectee || '')
  const [langueCible, setLangueCible] = useState(etatInitial.langueCible || '')
  const [langueCibleAutre, setLangueCibleAutre] = useState(etatInitial.langueCibleAutre || '')
  const [outilEnCours, setOutilEnCours] = useState(null)
  const [etapeOutil, setEtapeOutil] = useState('')
  const [resultatOutil, setResultatOutil] = useState(etatInitial.resultatOutil || null)
  const [copie, setCopie] = useState(false)
  const cibleParDefaut = langueDetectee === 'fr' ? 'anglais' : 'français'
  const suiviRef = useRef(null)
  const suiviOutilRef = useRef(null)
  const emailPrecedentRef = useRef(localStorage.getItem('vocalia_email'))

  const [permissionNotif, setPermissionNotif] = useState(
    typeof Notification !== 'undefined' ? Notification.permission : 'unsupported'
  )

  useEffect(() => {
    if (!token) return
    try {
      localStorage.setItem(CLE_ETAT, JSON.stringify({
        proprietaire: emailUtilisateur,
        mode,
        sousModeAccueil,
        modeAssistant,
        transcriptionComplete,
        texteImporte,
        noteImportee,
        lienImporte,
        nomImporte,
        idAudioTemporaire,
        conversation,
        langue,
        dureeChoisie,
        dureeTrancheMinutes,
        inclureAudio,
        langueDetectee,
        langueCible,
        langueCibleAutre,
        resultatOutil,
      }))
    } catch {}
  }, [
    token, emailUtilisateur, mode, sousModeAccueil, modeAssistant, transcriptionComplete,
    texteImporte, noteImportee, lienImporte, nomImporte, idAudioTemporaire, conversation,
    langue, dureeChoisie, dureeTrancheMinutes, inclureAudio,
    langueDetectee, langueCible, langueCibleAutre, resultatOutil,
  ])

  useEffect(() => {
    const avertir = (event) => {
      event.preventDefault()
      event.returnValue = ''
    }
    if (enregistrement || envoiEnCours || phaseImport === 'envoi') {
      window.addEventListener('beforeunload', avertir)
    }
    return () => window.removeEventListener('beforeunload', avertir)
  }, [enregistrement, envoiEnCours, phaseImport])

  useEffect(() => {
    if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
      Notification.requestPermission().then(setPermissionNotif)
    }
  }, [])

  const testerServeur = async () => {
    setVerificationServeur(true)
    setServeurJoignable(null)
    const ok = await verifierServeur()
    setServeurJoignable(ok)
    setVerificationServeur(false)
    if (ok) {
      const config = await chargerConfig()
      setGoogleClientId(config.google_client_id || '')
    }
    return ok
  }

  useEffect(() => {
    testerServeur()
  }, [])

  useEffect(() => {
    if (mode !== 'assistant') {
      arreterLecture()
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

  useEffect(() => {
    if (!token) return
    const travail = lireJson(CLE_TRAVAIL)
    if (travail?.id) {
      suivreTravail(travail.id)
    }
    const outil = lireJson(CLE_OUTIL)
    if (outil?.id) {
      suivreOutil(outil.id, outil.type, outil.source, outil.langue)
    }
    return () => {
      suiviRef.current = null
      suiviOutilRef.current = null
    }
  }, [token])

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

  const sessionExpiree = () => {
    suiviRef.current = null
    suiviOutilRef.current = null
    setAnalyseEnCours(false)
    setPhaseImport('')
    setOutilEnCours(null)
    setErreurAuth('Votre session a expiré. Reconnectez-vous, puis réessayez.')
    localStorage.removeItem('vocalia_token')
    setToken(null)
  }

  const reinitialiserDonnees = () => {
    setTranscriptionComplete('')
    setTexteImporte('')
    setNoteImportee('')
    setLienImporte('')
    setNomImporte('')
    setIdAudioTemporaire(null)
    setConversation([])
    salutationFaiteRef.current = false
    setHistorique([])
    setConversationsSauvegardees([])
    setAudioUrl(null)
    setFichierImporte(null)
    setApercuImporte(null)
    setErreurImport('')
    setLangueDetectee('')
    setResultatOutil(null)
    setOutilEnCours(null)
    tranchesAudioRef.current = []
  }

  const enregistrerSession = (donnees) => {
    if (emailPrecedentRef.current && emailPrecedentRef.current !== donnees.email) {
      reinitialiserDonnees()
      localStorage.removeItem(CLE_TRAVAIL)
      localStorage.removeItem(CLE_OUTIL)
    }
    emailPrecedentRef.current = donnees.email
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
    arreterLecture()
    suiviRef.current = null
    suiviOutilRef.current = null
    setAnalyseEnCours(false)
    setPhaseImport('')
    reinitialiserDonnees()
    emailPrecedentRef.current = null
    localStorage.removeItem('vocalia_token')
    localStorage.removeItem('vocalia_email')
    localStorage.removeItem('vocalia_prenom')
    localStorage.removeItem(CLE_ETAT)
    localStorage.removeItem(CLE_TRAVAIL)
    localStorage.removeItem(CLE_OUTIL)
    setToken(null)
    setEmailUtilisateur(null)
    setPrenomUtilisateur('')
    setMode('accueil')
  }

  useEffect(() => {
    if (!token) return
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
  }, [mode, token])

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
      setResultatOutil(null)
      setLangueDetectee('')
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
          sessionExpiree()
          return
        }
        setTranscriptionComplete(prev => prev + ' [' + donnees.erreur + ']')
      } else {
        setTranscriptionComplete(prev => prev + ' ' + donnees.texte)
        if (donnees.langue_detectee) setLangueDetectee(donnees.langue_detectee)
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

    if (inclureAudio && tranchesAudioRef.current.length > 0) {
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
          sessionExpiree()
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
          sessionExpiree()
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
          sessionExpiree()
          return
        }
        setConversation(prev => [...prev, { role: 'assistant', texte: donnees.erreur }])
      } else {
        setConversation(prev => [...prev, { role: 'assistant', texte: donnees.reponse }])
        if (lectureAutoTexte) lireAVoixHaute(donnees.reponse)
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
          sessionExpiree()
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

  const chargerHistorique = async () => {
    try {
      const { donnees } = await apiFetch('/historique', { token })
      if (donnees.erreur) {
        if (estErreurSession(donnees.erreur)) sessionExpiree()
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
        if (estErreurSession(donnees.erreur)) sessionExpiree()
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
        if (estErreurSession(donnees.erreur)) sessionExpiree()
        return
      }
      setHistorique((prev) => {
        const cible = prev.find((item) => item.id === id)
        if (cible?.audio_blob_url) URL.revokeObjectURL(cible.audio_blob_url)
        return prev.filter((item) => item.id !== id)
      })
    } catch {}
  }

  const supprimerConversation = async (id) => {
    try {
      const { donnees } = await apiFetch(`/conversations/${id}`, { method: 'DELETE', token })
      if (donnees.erreur) {
        if (estErreurSession(donnees.erreur)) sessionExpiree()
        return
      }
      setConversationsSauvegardees((prev) => prev.filter((item) => item.id !== id))
    } catch {}
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

  const preparerImport = (nom, phase) => {
    setTexteImporte('')
    setNoteImportee('')
    setErreurImport('')
    setResultatOutil(null)
    setLangueDetectee('')
    setIdAudioTemporaire(null)
    setProgressionImport(0)
    setEtapeImport('')
    setNomImporte(nom)
    setPhaseImport(phase)
    setAnalyseEnCours(true)
  }

  const terminerImport = () => {
    setAnalyseEnCours(false)
    setPhaseImport('')
    setEtapeImport('')
  }

  const suivre = async (idTravail, { cle, reference, surEtape, surTermine, surErreur }) => {
    const marque = Symbol('suivi')
    reference.current = marque

    while (reference.current === marque) {
      try {
        const { donnees } = await apiFetch(`/travaux/${idTravail}`, { token })
        if (reference.current !== marque) return false

        if (donnees.erreur) {
          if (estErreurSession(donnees.erreur)) {
            sessionExpiree()
            return false
          }
          localStorage.removeItem(cle)
          surErreur(donnees.erreur)
          break
        }

        if (donnees.statut === 'termine') {
          localStorage.removeItem(cle)
          surTermine(donnees)
          break
        }

        if (donnees.statut === 'erreur') {
          localStorage.removeItem(cle)
          surErreur(donnees.message)
          break
        }

        surEtape(donnees.etape || '')
      } catch {}

      await new Promise((resolve) => setTimeout(resolve, 3000))
    }

    const termine = reference.current === marque
    if (termine) reference.current = null
    return termine
  }

  const suivreTravail = async (idTravail) => {
    setAnalyseEnCours(true)
    setPhaseImport('traitement')

    const fini = await suivre(idTravail, {
      cle: CLE_TRAVAIL,
      reference: suiviRef,
      surEtape: setEtapeImport,
      surTermine: (donnees) => {
        setTexteImporte(donnees.texte)
        setNoteImportee(donnees.note || '')
        setIdAudioTemporaire(donnees.audio_temporaire || null)
        if (donnees.langue_detectee) setLangueDetectee(donnees.langue_detectee)
        setLienImporte('')
        envoyerNotification("VocalIA", "Votre transcription est prête.")
      },
      surErreur: (message) => setErreurImport(message),
    })

    if (fini) terminerImport()
  }

  const suivreOutil = async (idTravail, type, source, cible) => {
    setOutilEnCours({ type, source })

    const fini = await suivre(idTravail, {
      cle: CLE_OUTIL,
      reference: suiviOutilRef,
      surEtape: setEtapeOutil,
      surTermine: (donnees) => {
        setResultatOutil({ type, source, langue: cible, texte: donnees.texte })
        envoyerNotification("VocalIA", type === 'traduction' ? "Votre traduction est prête." : "Votre résumé est prêt.")
      },
      surErreur: (message) => setResultatOutil({ type, source, langue: cible, texte: message, erreur: true }),
    })

    if (fini) {
      setOutilEnCours(null)
      setEtapeOutil('')
    }
  }

  const lancerOutil = async (type, texte, source) => {
    const choix = langueCible || cibleParDefaut
    const cible = choix === 'autre' ? langueCibleAutre.trim() : choix
    if (!texte.trim() || !cible || outilEnCours) return

    setResultatOutil(null)
    setOutilEnCours({ type, source })
    setEtapeOutil('')

    const formData = new FormData()
    formData.append('texte', texte)
    formData.append('langue_cible', cible)

    try {
      const { donnees } = await apiFetch(type === 'traduction' ? '/outils/traduire' : '/outils/resumer', {
        method: 'POST',
        body: formData,
        token,
      })

      if (donnees.erreur) {
        if (estErreurSession(donnees.erreur)) {
          sessionExpiree()
          return
        }
        setResultatOutil({ type, source, langue: cible, texte: donnees.erreur, erreur: true })
        setOutilEnCours(null)
        return
      }

      localStorage.setItem(CLE_OUTIL, JSON.stringify({ id: donnees.id_travail, type, source, langue: cible }))
      await suivreOutil(donnees.id_travail, type, source, cible)
    } catch (erreur) {
      setResultatOutil({ type, source, langue: cible, texte: erreur.message, erreur: true })
      setOutilEnCours(null)
    }
  }

  const copierTexte = async (texte) => {
    try {
      await navigator.clipboard.writeText(texte)
      setCopie(true)
      setTimeout(() => setCopie(false), 2000)
    } catch {}
  }

  const gererImportFichier = async (event) => {
    const fichier = event.target.files[0]
    if (!fichier) return

    setFichierImporte(fichier)
    setLienImporte('')
    preparerImport(`${fichier.name} (${(fichier.size / (1024 * 1024)).toFixed(1)} Mo)`, 'envoi')
    setApercuImporte((precedent) => {
      if (precedent) URL.revokeObjectURL(precedent)
      return URL.createObjectURL(fichier)
    })

    const formData = new FormData()
    formData.append('fichier', fichier)
    formData.append('langue', langue)
    formData.append('conserver_audio', '1')

    try {
      const { donnees } = await apiUpload('/travaux/fichier', {
        token,
        body: formData,
        onProgress: setProgressionImport,
      })

      if (donnees.erreur) {
        if (estErreurSession(donnees.erreur)) {
          sessionExpiree()
          return
        }
        setErreurImport(donnees.erreur)
        terminerImport()
        return
      }

      localStorage.setItem(CLE_TRAVAIL, JSON.stringify({ id: donnees.id_travail }))
      await suivreTravail(donnees.id_travail)
    } catch (erreur) {
      setErreurImport(erreur.message)
      terminerImport()
    }
  }

  const envoyerLienImporte = async (urlManuelle = null) => {
    const url = (typeof urlManuelle === 'string' ? urlManuelle : lienImporte).trim()
    if (!url || analyseEnCours) return

    setFichierImporte(null)
    preparerImport(url, 'traitement')
    setApercuImporte((precedent) => {
      if (precedent) URL.revokeObjectURL(precedent)
      return null
    })

    const formData = new FormData()
    formData.append('url', url)
    formData.append('langue', langue)
    formData.append('conserver_audio', '1')

    try {
      const { donnees } = await apiFetch('/travaux/lien', {
        method: 'POST',
        body: formData,
        token,
      })

      if (donnees.erreur) {
        if (estErreurSession(donnees.erreur)) {
          sessionExpiree()
          return
        }
        setErreurImport(donnees.erreur)
        terminerImport()
        return
      }

      localStorage.setItem(CLE_TRAVAIL, JSON.stringify({ id: donnees.id_travail }))
      await suivreTravail(donnees.id_travail)
    } catch (erreur) {
      setErreurImport(erreur.message)
      terminerImport()
    }
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
          sessionExpiree()
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

  const commandesLecture = (texte) => {
    if (!texte || !texte.trim()) return null
    if (typeof window === 'undefined' || !window.speechSynthesis) return null

    return (
      <>
        <button
          className="btn-secondary"
          onClick={() => lireAVoixHaute(texte)}
          style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
        >
          <Volume2 size={14} /> Lire
        </button>
        <button
          className="btn-secondary"
          onClick={arreterLecture}
          style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
        >
          <VolumeX size={14} /> Arrêter
        </button>
      </>
    )
  }

  const blocOutils = (texte, source) => {
    if (!texte || !texte.trim()) return null

    const choix = langueCible || cibleParDefaut
    const cibleFinale = choix === 'autre' ? langueCibleAutre.trim() : choix
    const occupe = Boolean(outilEnCours)
    const actif = outilEnCours?.source === source ? outilEnCours : null
    const resultat = resultatOutil?.source === source ? resultatOutil : null

    return (
      <div style={{ marginTop: '20px', textAlign: 'left' }}>
        <label className="field-label">Langue pour la traduction et le résumé</label>
        <select
          className="input-field"
          value={choix}
          onChange={(e) => setLangueCible(e.target.value)}
        >
          {OPTIONS_LANGUES.map(([valeur, libelle]) => (
            <option key={valeur} value={valeur}>{libelle}</option>
          ))}
        </select>

        {choix === 'autre' && (
          <input
            type="text"
            className="input-field"
            placeholder="Ex. : japonais, swahili, lingala…"
            value={langueCibleAutre}
            onChange={(e) => setLangueCibleAutre(e.target.value)}
            style={{ marginTop: '8px' }}
          />
        )}

        <div style={{ display: 'flex', gap: '8px', marginTop: '10px' }}>
          <button
            className="btn-secondary"
            onClick={() => lancerOutil('traduction', texte, source)}
            disabled={occupe || !cibleFinale}
            style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
          >
            <Languages size={16} /> Traduire
          </button>
          <button
            className="btn-secondary"
            onClick={() => lancerOutil('resume', texte, source)}
            disabled={occupe || !cibleFinale}
            style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
          >
            <FileText size={16} /> Résumer
          </button>
        </div>

        {actif && (
          <p className="status-text">
            {etapeOutil || (actif.type === 'traduction' ? 'Traduction en cours…' : 'Résumé en cours…')}
          </p>
        )}

        {resultat && (
          <div style={{ marginTop: '12px' }}>
            {!resultat.erreur && (
              <p className="history-date">
                {resultat.type === 'traduction' ? 'Traduction' : 'Résumé'} ({resultat.langue})
              </p>
            )}
            <p className="transcript-box" style={{ whiteSpace: 'pre-wrap' }}>{resultat.texte}</p>
            {!resultat.erreur && (
              <div className="history-actions">
                <button
                  className="btn-secondary"
                  onClick={() => copierTexte(resultat.texte)}
                  style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
                >
                  <Copy size={14} /> {copie ? 'Copié' : 'Copier'}
                </button>
                <button
                  className="btn-secondary"
                  onClick={() => exporterTexte(`${resultat.type}-vocalia-${Date.now()}.txt`, resultat.texte)}
                  style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
                >
                  <Download size={14} /> Exporter
                </button>
                {commandesLecture(resultat.texte)}
              </div>
            )}
          </div>
        )}
      </div>
    )
  }

  if (!token) {
    return (
      <div className="app-container">
        <div className="ambient-glow ambient-glow-1"></div>
        <div className="ambient-glow ambient-glow-2"></div>
        <h1 className="app-title">VocalIA</h1>

        {(verificationServeur || serveurJoignable === false) && (
          <div className={`serveur-alerte ${serveurJoignable === false ? '' : 'serveur-info'}`}>
            {verificationServeur ? (
              <p className="status-text">
                Connexion au serveur VocalIA… Le serveur distant peut mettre quelques secondes à se réveiller.
              </p>
            ) : (
              <p className="status-text">
                Le serveur n’est pas joignable depuis ce téléphone. Sur mobile, <strong>localhost</strong> désigne le téléphone, pas votre PC.
              </p>
            )}
            <label className="field-label" htmlFor="url-api-login">Adresse du serveur</label>
            <input
              id="url-api-login"
              className="input-field"
              type="url"
              value={urlApiSaisie}
              onChange={(e) => setUrlApiSaisie(e.target.value)}
              placeholder="https://vocalia-ud4o.onrender.com"
            />
            <button
              type="button"
              className="btn-secondary"
              style={{ width: '100%', marginTop: '10px' }}
              disabled={verificationServeur}
              onClick={async () => {
                const url = definirApiUrl(urlApiSaisie)
                setUrlApi(url)
                setUrlApiSaisie(url)
                await testerServeur()
              }}
            >
              {verificationServeur ? 'Vérification…' : 'Enregistrer et réessayer'}
            </button>
            <p className="status-text" style={{ marginTop: '8px' }}>URL actuelle : {urlApi}</p>
          </div>
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
                  <div className="history-actions" style={{ marginTop: '8px' }}>
                    {commandesLecture(transcriptionComplete)}
                  </div>
                  <button className="btn-primary" onClick={sauvegarderTranscription} style={{ marginTop: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                    <Save size={16} /> Enregistrer la transcription
                  </button>
                  {messageSauvegarde && (
                    <p className="status-text" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                      <CheckCircle2 size={16} /> {messageSauvegarde}
                    </p>
                  )}
                  {blocOutils(transcriptionComplete, 'direct')}
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
                  <label className="field-label">Coller un lien de vidéo ou d'audio</label>
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
                    YouTube, Facebook, Instagram, TikTok ou tout lien direct vers un fichier audio ou vidéo. Les liens de partage Google Drive et Dropbox ne sont pas pris en charge : téléchargez plutôt le fichier puis importez-le.
                  </p>
                </div>
              </div>

              {nomImporte && <p className="status-text">{nomImporte}</p>}

              {apercuImporte && fichierImporte?.type.startsWith('video/') && (
                <video className="preview-media" controls src={apercuImporte}></video>
              )}
              {apercuImporte && fichierImporte?.type.startsWith('audio/') && (
                <audio controls src={apercuImporte} style={{ width: '100%', marginBottom: '12px' }}></audio>
              )}

              {analyseEnCours && (
                <>
                  <p className="status-text">
                    {phaseImport === 'envoi'
                      ? `Envoi du fichier… ${progressionImport} %`
                      : (etapeImport || 'Traitement en cours sur le serveur. Vous pouvez quitter et revenir, le résultat sera récupéré.')}
                  </p>
                  <div className="progress-track">
                    <div
                      className="progress-fill"
                      style={{ width: phaseImport === 'envoi' ? `${progressionImport}%` : '100%' }}
                    ></div>
                  </div>
                </>
              )}

              {noteImportee && <p className="status-text">{noteImportee}</p>}
              {erreurImport && <p className="status-text">{erreurImport}</p>}

              {texteImporte && (
                <div>
                  <p className="transcript-box">{texteImporte}</p>
                  <div className="history-actions" style={{ marginTop: '8px' }}>
                    {commandesLecture(texteImporte)}
                  </div>
                  <button className="btn-primary" onClick={sauvegarderFichierImporte} style={{ marginTop: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                    <Save size={16} /> Enregistrer la transcription
                  </button>
                  {messageSauvegardeFichier && (
                    <p className="status-text" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                      <CheckCircle2 size={16} /> {messageSauvegardeFichier}
                    </p>
                  )}
                  {blocOutils(texteImporte, 'importer')}
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
                {msg.role === 'assistant' && (
                  <div style={{ display: 'flex', gap: '6px', marginTop: '8px' }}>
                    {commandesLecture(msg.texte)}
                  </div>
                )}
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
                    {commandesLecture(item.texte)}
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
          <p className="settings-section-title">Serveur</p>
          <div style={{ marginBottom: '28px', textAlign: 'left' }}>
            <label className="field-label" htmlFor="url-api-reglages">Adresse du backend</label>
            <input
              id="url-api-reglages"
              className="input-field"
              type="url"
              value={urlApiSaisie}
              onChange={(e) => setUrlApiSaisie(e.target.value)}
            />
            <button
              type="button"
              className="btn-secondary"
              style={{ width: '100%', marginTop: '10px' }}
              disabled={verificationServeur}
              onClick={async () => {
                const url = definirApiUrl(urlApiSaisie)
                setUrlApi(url)
                setUrlApiSaisie(url)
                await testerServeur()
              }}
            >
              {verificationServeur ? 'Vérification…' : 'Enregistrer l’adresse'}
            </button>
            {serveurJoignable === true && (
              <p className="status-text" style={{ textAlign: 'left', marginTop: '8px' }}>
                Serveur joignable : {urlApi}
              </p>
            )}
            {serveurJoignable === false && (
              <p className="status-text" style={{ textAlign: 'left', marginTop: '8px' }}>
                Serveur injoignable : {urlApi}
              </p>
            )}
          </div>

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
              <option value="auto">Détection automatique (recommandé)</option>
              <option value="fr">Français uniquement</option>
              <option value="en">Anglais uniquement</option>
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

          <p className="settings-section-title">Assistant</p>

          <div className="toggle-row">
            <span className="field-label" style={{ margin: 0 }}>Lire automatiquement les réponses en mode Texte</span>
            <label className="toggle-switch">
              <input
                type="checkbox"
                checked={lectureAutoTexte}
                onChange={(e) => {
                  setLectureAutoTexte(e.target.checked)
                  localStorage.setItem(CLE_LECTURE_AUTO, e.target.checked ? '1' : '0')
                }}
              />
              <span className="toggle-slider"></span>
            </label>
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