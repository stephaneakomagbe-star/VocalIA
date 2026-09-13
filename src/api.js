const API_URL = import.meta.env.VITE_API_URL || `http://${window.location.hostname}:8000`
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

export async function apiFetch(route, { method = 'GET', body, token, headers } = {}) {
  let reponse
  try {
    reponse = await fetch(`${API_URL}${route}`, {
      method,
      body,
      headers: { ...construireEnTeteAuth(token), ...(headers || {}) },
    })
  } catch {
    throw new Error('Impossible de joindre le serveur VocalIA. Vérifiez qu’il est bien démarré et accessible.')
  }

  const donnees = await lireJsonSecurise(reponse)
  return { donnees, status: reponse.status }
}

export function apiUpload(route, { token, body, onProgress } = {}) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('POST', `${API_URL}${route}`)
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

    xhr.onerror = () => reject(new Error('Impossible de joindre le serveur VocalIA pendant l’envoi.'))
    xhr.send(body)
  })
}

export async function verifierServeur() {
  try {
    const reponse = await fetch(`${API_URL}/health`)
    return reponse.ok
  } catch {
    return false
  }
}

export async function chargerConfig() {
  try {
    const reponse = await fetch(`${API_URL}/config`)
    if (!reponse.ok) return {}
    return await reponse.json()
  } catch {
    return {}
  }
}

export async function chargerBlobAudio(token, nomFichier) {
  if (!nomFichier) return null
  try {
    const reponse = await fetch(`${API_URL}/media/${encodeURIComponent(nomFichier)}`, {
      headers: construireEnTeteAuth(token),
    })
    if (!reponse.ok) return null
    const blob = await reponse.blob()
    return URL.createObjectURL(blob)
  } catch {
    return null
  }
}
