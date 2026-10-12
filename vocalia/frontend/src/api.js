const CLE_URL_API = 'vocalia_api_url'
const URL_BACKEND_DISTANT = 'https://vocalia-ud4o.onrender.com'

function normaliserUrl(url) {
  return String(url || '').trim().replace(/\/$/, '')
}

function estApplicationNative() {
  if (typeof window === 'undefined') return false
  if (window.Capacitor?.isNativePlatform?.()) return true
  const protocole = window.location.protocol
  return protocole === 'capacitor:' || protocole === 'ionic:' || protocole === 'file:'
}

export function obtenirApiUrl() {
  const urlStockee = normaliserUrl(localStorage.getItem(CLE_URL_API))
  if (urlStockee) return urlStockee

  const envUrl = normaliserUrl(import.meta.env.VITE_API_URL)
  if (envUrl) return envUrl

  if (estApplicationNative()) {
    return URL_BACKEND_DISTANT
  }

  const hote = window.location.hostname
  if (hote && hote !== 'localhost' && hote !== '127.0.0.1') {
    return `http://${hote}:8000`
  }

  return 'http://127.0.0.1:8000'
}

export function definirApiUrl(url) {
  const propre = normaliserUrl(url)
  if (propre) localStorage.setItem(CLE_URL_API, propre)
  else localStorage.removeItem(CLE_URL_API)
  return obtenirApiUrl()
}

export const API_URL = obtenirApiUrl()

function construireEnTeteAuth(token) {
  return token ? { Authorization: `Bearer ${token}` } : {}
}

async function lireJsonSecurise(reponse) {
  const texte = await reponse.text()
  if (!texte) {
    if (!reponse.ok) {
      throw new Error(`Erreur serveur (${reponse.status}).`)
    }
    return {}
  }
  try {
    return JSON.parse(texte)
  } catch {
    if (!reponse.ok) {
      throw new Error(`Erreur serveur (${reponse.status}).`)
    }
    throw new Error('Réponse du serveur illisible.')
  }
}

function attendre(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export async function apiFetch(route, { method = 'GET', body, token, headers } = {}) {
  let reponse
  try {
    reponse = await fetch(`${obtenirApiUrl()}${route}`, {
      method,
      body,
      cache: 'no-store',
      headers: { ...construireEnTeteAuth(token), ...(headers || {}) },
    })
  } catch {
    throw new Error(
      'Impossible de joindre le serveur VocalIA. Vérifiez votre connexion internet et l’URL du serveur.',
    )
  }

  const donnees = await lireJsonSecurise(reponse)
  return { donnees, status: reponse.status }
}

export function apiUpload(route, { token, body, onProgress } = {}) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('POST', `${obtenirApiUrl()}${route}`)
    if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`)

    xhr.upload.onprogress = (event) => {
      if (onProgress && event.lengthComputable) {
        onProgress(Math.round((event.loaded / event.total) * 100))
      }
    }

    xhr.onload = () => {
      let donnees = {}
      try {
        donnees = xhr.responseText ? JSON.parse(xhr.responseText) : {}
      } catch {
        reject(new Error('Réponse du serveur illisible.'))
        return
      }
      resolve({ donnees, status: xhr.status })
    }

    xhr.onerror = () =>
      reject(new Error('Impossible de joindre le serveur VocalIA pendant l’envoi.'))
    xhr.send(body)
  })
}

export async function verifierServeur() {
  const url = `${obtenirApiUrl()}/health`
  for (let essai = 0; essai < 6; essai += 1) {
    try {
      const controle = new AbortController()
      const timer = setTimeout(() => controle.abort(), 15000)
      const reponse = await fetch(url, { signal: controle.signal, cache: 'no-store' })
      clearTimeout(timer)
      const type = reponse.headers.get('content-type') || ''
      if (reponse.ok && type.includes('application/json')) {
        const donnees = await reponse.json()
        if (donnees.status === 'ok' || donnees.service === 'VocalIA') return true
      }
    } catch {
      // Render (plan gratuit) met parfois 20–30 s à se réveiller.
    }
    await attendre(2500)
  }
  return false
}

export async function chargerConfig() {
  try {
    const reponse = await fetch(`${obtenirApiUrl()}/config`, { cache: 'no-store' })
    if (!reponse.ok) return {}
    return await reponse.json()
  } catch {
    return {}
  }
}

export async function chargerBlobAudio(token, nomFichier) {
  if (!nomFichier) return null
  try {
    const reponse = await fetch(`${obtenirApiUrl()}/media/${encodeURIComponent(nomFichier)}`, {
      headers: construireEnTeteAuth(token),
    })
    if (!reponse.ok) return null
    const blob = await reponse.blob()
    return URL.createObjectURL(blob)
  } catch {
    return null
  }
}
