import whisper
import tempfile
import os
import uuid
import json
import re
import sqlite3
import hashlib
import secrets
import hmac
import asyncio
import threading
import shutil
import subprocess
import urllib.error
import urllib.request
import yt_dlp
from contextlib import asynccontextmanager
from datetime import datetime, timedelta
from typing import Annotated, Optional

from fastapi import FastAPI, UploadFile, File, Form, Depends, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, FileResponse
from fastapi.exceptions import RequestValidationError
from dotenv import load_dotenv
from groq import Groq

load_dotenv()

MODELE_GROQ = "openai/gpt-oss-20b"
NB_MAX_ECHANGES_HISTORIQUE = 10
DUREE_SESSION_JOURS = 30
MAX_TENTATIVES_CONNEXION = 5
FENETRE_BLOCAGE_MINUTES = 15
MAX_AUDIO_OCTETS = 80 * 1024 * 1024
TAILLE_LOT_UPLOAD = 1024 * 1024
DOSSIER_AUDIOS = "audios"
GOOGLE_CLIENT_ID = os.environ.get("GOOGLE_CLIENT_ID", "").strip()
FICHIER_COOKIES_YOUTUBE = os.environ.get("YOUTUBE_COOKIES_FILE", "").strip()
EXTENSIONS_MEDIA = (
    ".webm", ".wav", ".mp3", ".m4a", ".ogg", ".mpeg", ".mpga",
    ".mp4", ".mov", ".mkv", ".avi", ".m4v", ".mpg", ".aac", ".flac",
)
REGEX_TELEPHONE = re.compile(r"^[0-9+\s().-]{6,20}$")
audio_temporaires = {}
verrou_temporaires = threading.Lock()

PROMPT_SYSTEME = (
    "Tu es VocalIA, un assistant vocal et écrit intégré à une application de transcription "
    "audio utilisée pour des réunions et des prédications à l'église, au Togo. "
    "Réponds toujours en français, de façon claire, précise et concise. "
    "Si une question est ambiguë, demande une précision plutôt que de deviner. "
    "Évite les réponses vagues ou génériques : donne des réponses concrètes et directement utiles. "
    "Tiens compte du contexte des messages précédents dans la conversation pour répondre de manière cohérente. "
    "N'utilise jamais de tableaux, ni de formatage Markdown (pas d'astérisques, pas de dièses, pas de tirets "
    "de liste). Réponds uniquement en texte simple, comme dans une conversation orale naturelle, "
    "en phrases complètes. Si tu dois présenter plusieurs éléments, énumère-les dans une phrase "
    "fluide plutôt qu'en liste ou tableau."
)

PROMPTS_TRANSCRIPTION = {
    "fr": "Transcription d'une prédication ou d'un message en français, avec des termes comme Seigneur, Évangile, prière, église, Togo.",
    "en": "Transcription of a sermon or message in English.",
}

REGEX_EMAIL = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")

modele_whisper = None
verrou_modele = threading.Lock()
client_groq = Groq(api_key=os.environ.get("GROQ_API_KEY"))


def get_modele():
    global modele_whisper
    if modele_whisper is None:
        with verrou_modele:
            if modele_whisper is None:
                modele_whisper = whisper.load_model("small")
    return modele_whisper


def get_db():
    conn = sqlite3.connect("vocalia.db")
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def init_db():
    os.makedirs(DOSSIER_AUDIOS, exist_ok=True)
    conn = get_db()
    conn.execute("""CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT UNIQUE,
        password_hash TEXT,
        salt TEXT,
        prenom TEXT,
        nom TEXT,
        telephone TEXT,
        google_id TEXT
    )""")
    colonnes = {row[1] for row in conn.execute("PRAGMA table_info(users)").fetchall()}
    for nom_colonne, definition in (
        ("prenom", "TEXT"),
        ("nom", "TEXT"),
        ("telephone", "TEXT"),
        ("google_id", "TEXT"),
    ):
        if nom_colonne not in colonnes:
            conn.execute(f"ALTER TABLE users ADD COLUMN {nom_colonne} {definition}")
    conn.execute("""CREATE TABLE IF NOT EXISTS transcriptions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER,
        date TEXT,
        texte TEXT,
        audio_fichier TEXT,
        FOREIGN KEY (user_id) REFERENCES users(id)
    )""")
    conn.execute("""CREATE TABLE IF NOT EXISTS conversations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER,
        date TEXT,
        messages TEXT,
        FOREIGN KEY (user_id) REFERENCES users(id)
    )""")
    conn.execute("""CREATE TABLE IF NOT EXISTS sessions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        token TEXT UNIQUE,
        user_id INTEGER,
        date_creation TEXT,
        date_expiration TEXT,
        FOREIGN KEY (user_id) REFERENCES users(id)
    )""")
    conn.execute("""CREATE TABLE IF NOT EXISTS tentatives_connexion (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT,
        date_tentative TEXT
    )""")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(token)")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_transcriptions_user ON transcriptions(user_id)")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_conversations_user ON conversations(user_id)")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_tentatives_email ON tentatives_connexion(email)")
    conn.commit()
    conn.close()


@asynccontextmanager
async def lifespan(_app: FastAPI):
    init_db()
    yield


app = FastAPI(lifespan=lifespan)

ORIGINES_CORS = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:4173",
    "http://127.0.0.1:4173",
    "http://localhost:8000",
    "http://127.0.0.1:8000",
    "capacitor://localhost",
    "ionic://localhost",
    "http://localhost",
    "https://localhost",
]
extra_cors = os.environ.get("CORS_ORIGINS", "")
if extra_cors:
    ORIGINES_CORS.extend([o.strip() for o in extra_cors.split(",") if o.strip()])

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

def reponse_erreur(message: str, status: int = 400):
    return JSONResponse({"erreur": message}, status_code=status)


@app.exception_handler(HTTPException)
async def gestionnaire_http(_request, exc: HTTPException):
    detail = exc.detail
    message = detail if isinstance(detail, str) else "Requête invalide."
    return JSONResponse({"erreur": message}, status_code=exc.status_code)


@app.exception_handler(RequestValidationError)
async def gestionnaire_validation(_request, _exc: RequestValidationError):
    return JSONResponse({"erreur": "Requête invalide."}, status_code=422)


def ffmpeg_disponible():
    return shutil.which("ffmpeg") is not None


def nettoyer_audio_temporaires():
    maintenant = datetime.now()
    with verrou_temporaires:
        expires = [cle for cle, info in audio_temporaires.items() if info["expiration"] < maintenant]
        for cle in expires:
            chemin = audio_temporaires.pop(cle)["chemin"]
            if os.path.isfile(chemin):
                os.remove(chemin)


def enregistrer_audio_temporaire(user_id, chemin_wav):
    nettoyer_audio_temporaires()
    identifiant = str(uuid.uuid4())
    destination = os.path.join(DOSSIER_AUDIOS, f"tmp-{identifiant}.wav")
    shutil.copyfile(chemin_wav, destination)
    with verrou_temporaires:
        audio_temporaires[identifiant] = {
            "chemin": destination,
            "user_id": user_id,
            "expiration": datetime.now() + timedelta(hours=2),
        }
    return identifiant


def consommer_audio_temporaire(user_id, identifiant):
    if not identifiant:
        return None
    with verrou_temporaires:
        info = audio_temporaires.get(identifiant)
        if not info or info["user_id"] != user_id:
            return None
        audio_temporaires.pop(identifiant, None)
    return info["chemin"]


async def enregistrer_upload_sur_disque(fichier: UploadFile, suffixe: str, limite=None):
    extension = suffixe if suffixe.startswith(".") else f".{suffixe}"
    fd, chemin = tempfile.mkstemp(suffix=extension)
    os.close(fd)
    taille = 0
    try:
        with open(chemin, "wb") as sortie:
            while True:
                lot = await fichier.read(TAILLE_LOT_UPLOAD)
                if not lot:
                    break
                taille += len(lot)
                if limite is not None and taille > limite:
                    raise HTTPException(
                        status_code=413,
                        detail="Fichier trop volumineux (maximum 80 Mo pour l’assistant).",
                    )
                sortie.write(lot)
    except Exception:
        if os.path.isfile(chemin):
            os.remove(chemin)
        raise
    return chemin, taille


def extraire_audio_wav(chemin_source):
    if not ffmpeg_disponible():
        raise HTTPException(
            status_code=500,
            detail="ffmpeg est requis pour transcrire les vidéos. Installez-le puis relancez le serveur.",
        )
    fd, chemin_wav = tempfile.mkstemp(suffix=".wav")
    os.close(fd)
    commande = [
        "ffmpeg",
        "-y",
        "-i",
        chemin_source,
        "-vn",
        "-ac",
        "1",
        "-ar",
        "16000",
        "-f",
        "wav",
        chemin_wav,
    ]
    resultat = subprocess.run(commande, capture_output=True, timeout=4 * 3600)
    if resultat.returncode != 0 or not os.path.isfile(chemin_wav) or os.path.getsize(chemin_wav) == 0:
        if os.path.isfile(chemin_wav):
            os.remove(chemin_wav)
        raise HTTPException(
            status_code=400,
            detail="Impossible d’extraire l’audio de ce fichier. Vérifiez le format.",
        )
    return chemin_wav


def telecharger_audio_lien(url):
    """Télécharge l'audio d'un lien (YouTube et autres sites vidéo) via yt-dlp,
    et le convertit en .wav exploitable par Whisper."""
    fd, chemin_temp = tempfile.mkstemp(suffix=".wav")
    os.close(fd)
    os.remove(chemin_temp)
    base_sans_extension = chemin_temp[:-4]

    options = {
        "format": "bestaudio/best",
        "outtmpl": base_sans_extension + ".%(ext)s",
        "postprocessors": [{
            "key": "FFmpegExtractAudio",
            "preferredcodec": "wav",
            "preferredquality": "192",
        }],
        "noplaylist": True,
        "quiet": True,
        "no_warnings": True,
        "socket_timeout": 30,
        # Options qui aident souvent à contourner les blocages anti-bot récents de YouTube :
        "extractor_args": {
            "youtube": {
                "player_client": ["android", "web"],
            }
        },
        "geo_bypass": True,
        "nocheckcertificate": True,
        "retries": 3,
    }

    # Si un fichier de cookies YouTube exporté est fourni via la variable
    # d'environnement YOUTUBE_COOKIES_FILE, on l'utilise — ça résout la
    # plupart des blocages "Sign in to confirm you're not a bot".
    if FICHIER_COOKIES_YOUTUBE and os.path.isfile(FICHIER_COOKIES_YOUTUBE):
        options["cookiefile"] = FICHIER_COOKIES_YOUTUBE

    try:
        with yt_dlp.YoutubeDL(options) as ydl:
            ydl.download([url])
    except Exception as e:
        # Message détaillé dans le terminal du serveur pour diagnostiquer précisément
        # la cause (vidéo privée, âge, blocage anti-bot, yt-dlp obsolète, etc.)
        print(f"[yt-dlp] Échec du téléchargement pour {url} : {type(e).__name__}: {e}")
        raise HTTPException(
            status_code=400,
            detail="Impossible de récupérer l'audio depuis ce lien. Vérifiez qu'il est valide, public, et accessible.",
        )

    chemin_wav = base_sans_extension + ".wav"
    if not os.path.isfile(chemin_wav) or os.path.getsize(chemin_wav) == 0:
        if os.path.isfile(chemin_wav):
            os.remove(chemin_wav)
        raise HTTPException(status_code=400, detail="Aucun audio n'a pu être extrait de ce lien.")

    return chemin_wav


def profil_utilisateur(user_id):
    conn = get_db()
    row = conn.execute(
        "SELECT email, prenom, nom, telephone, google_id FROM users WHERE id = ?",
        (user_id,),
    ).fetchone()
    conn.close()
    if not row:
        return None
    email, prenom, nom, telephone, google_id = row
    return {
        "email": email,
        "prenom": prenom or "",
        "nom": nom or "",
        "telephone": telephone or "",
        "compte_google": bool(google_id),
    }


def reponse_auth(user_id, email):
    token = creer_session(user_id)
    profil = profil_utilisateur(user_id) or {}
    return {
        "status": "ok",
        "token": token,
        "email": email,
        "prenom": profil.get("prenom", ""),
        "nom": profil.get("nom", ""),
        "telephone": profil.get("telephone", ""),
        "compte_google": profil.get("compte_google", False),
    }


def telecharger_vers_drive(access_token, nom_fichier, contenu: bytes, mime="text/plain"):
    limite = "vocalia_drive_boundary"
    meta = json.dumps({"name": nom_fichier})
    corps = (
        f"--{limite}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n{meta}\r\n"
        f"--{limite}\r\nContent-Type: {mime}\r\n\r\n"
    ).encode("utf-8") + contenu + f"\r\n--{limite}--\r\n".encode("utf-8")
    requete = urllib.request.Request(
        "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart",
        data=corps,
        headers={
            "Authorization": f"Bearer {access_token}",
            "Content-Type": f"multipart/related; boundary={limite}",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(requete, timeout=60) as reponse:
            return json.loads(reponse.read().decode("utf-8"))
    except urllib.error.HTTPError as erreur:
        if erreur.code in (401, 403):
            raise HTTPException(
                status_code=401,
                detail="Session Google Drive expirée. Reconnectez Google Drive dans les réglages.",
            )
        raise HTTPException(status_code=502, detail="Impossible d’envoyer le fichier vers Google Drive.")


def hasher_mot_de_passe(mot_de_passe, sel=None):
    if sel is None:
        sel = secrets.token_hex(16)
    hash_resultat = hashlib.pbkdf2_hmac(
        "sha256", mot_de_passe.encode(), sel.encode(), 100000
    ).hex()
    return hash_resultat, sel


def creer_session(user_id):
    token = secrets.token_hex(32)
    maintenant = datetime.now()
    expiration = maintenant + timedelta(days=DUREE_SESSION_JOURS)
    conn = get_db()
    conn.execute(
        "INSERT INTO sessions (token, user_id, date_creation, date_expiration) VALUES (?, ?, ?, ?)",
        (token, user_id, maintenant.isoformat(), expiration.isoformat()),
    )
    conn.commit()
    conn.close()
    return token


def utilisateur_depuis_token(token):
    if not token:
        return None
    conn = get_db()
    row = conn.execute(
        "SELECT user_id, date_expiration FROM sessions WHERE token = ?", (token,)
    ).fetchone()

    if not row:
        conn.close()
        return None

    user_id, date_expiration = row
    if datetime.fromisoformat(date_expiration) < datetime.now():
        conn.execute("DELETE FROM sessions WHERE token = ?", (token,))
        conn.commit()
        conn.close()
        return None

    conn.close()
    return user_id


def extraire_token(authorization: Optional[str]) -> Optional[str]:
    if not authorization:
        return None
    prefixe = "Bearer "
    if authorization.startswith(prefixe):
        return authorization[len(prefixe):].strip()
    return authorization.strip()


def utilisateur_connecte(authorization: Annotated[Optional[str], Header()] = None):
    user_id = utilisateur_depuis_token(extraire_token(authorization))
    if not user_id:
        raise HTTPException(
            status_code=401,
            detail="Session invalide ou expirée, veuillez vous reconnecter.",
        )
    return user_id


def trop_de_tentatives(email):
    conn = get_db()
    limite = (datetime.now() - timedelta(minutes=FENETRE_BLOCAGE_MINUTES)).isoformat()
    nb = conn.execute(
        "SELECT COUNT(*) FROM tentatives_connexion WHERE email = ? AND date_tentative > ?",
        (email, limite),
    ).fetchone()[0]
    conn.close()
    return nb >= MAX_TENTATIVES_CONNEXION


def enregistrer_tentative(email):
    conn = get_db()
    conn.execute(
        "INSERT INTO tentatives_connexion (email, date_tentative) VALUES (?, ?)",
        (email, datetime.now().isoformat()),
    )
    conn.commit()
    conn.close()


def reinitialiser_tentatives(email):
    conn = get_db()
    conn.execute("DELETE FROM tentatives_connexion WHERE email = ?", (email,))
    conn.commit()
    conn.close()


def construire_messages(historique_json, nouveau_message):
    messages = [{"role": "system", "content": PROMPT_SYSTEME}]

    if historique_json:
        try:
            historique = json.loads(historique_json)
            historique = historique[-NB_MAX_ECHANGES_HISTORIQUE:]
            for item in historique:
                role = "assistant" if item.get("role") == "assistant" else "user"
                texte = item.get("texte", "").strip()
                if texte:
                    messages.append({"role": role, "content": texte})
        except (json.JSONDecodeError, TypeError):
            pass

    messages.append({"role": "user", "content": nouveau_message})
    return messages


def transcrire_avec_langue(chemin_temp, langue):
    modele = get_modele()
    prompt = PROMPTS_TRANSCRIPTION.get(langue)
    try:
        resultat = modele.transcribe(chemin_temp, language=langue, initial_prompt=prompt)
        return resultat, langue, False
    except Exception:
        resultat = modele.transcribe(chemin_temp)
        langue_detectee = resultat.get("language")
        return resultat, langue_detectee, True


def transcrire_francais(chemin_temp):
    return get_modele().transcribe(chemin_temp, language="fr")


def appeler_groq(messages):
    reponse_ia = client_groq.chat.completions.create(
        model=MODELE_GROQ,
        messages=messages,
        temperature=0.4,
    )
    return reponse_ia.choices[0].message.content


def nom_fichier_sur(nom: str) -> bool:
    if not nom or "/" in nom or "\\" in nom or ".." in nom:
        return False
    nom_min = nom.lower()
    return nom_min.endswith(EXTENSIONS_MEDIA)


@app.get("/")
def read_root():
    return {"message": "VocalIA backend en ligne"}


@app.get("/health")
def health_check():
    return {"status": "ok", "service": "VocalIA", "ffmpeg": ffmpeg_disponible()}


@app.get("/config")
def config_publique():
    return {"google_client_id": GOOGLE_CLIENT_ID or None}


@app.post("/inscription")
def inscription(
    email: str = Form(...),
    mot_de_passe: str = Form(...),
    prenom: str = Form(""),
    nom: str = Form(""),
    telephone: str = Form(""),
):
    email = email.strip().lower()
    prenom = prenom.strip()
    nom = nom.strip()
    telephone = telephone.strip()

    if not REGEX_EMAIL.match(email):
        return reponse_erreur("Adresse email invalide.")

    if len(prenom) < 2:
        return reponse_erreur("Indiquez votre prénom.")

    if len(nom) < 2:
        return reponse_erreur("Indiquez votre nom.")

    if telephone and not REGEX_TELEPHONE.match(telephone):
        return reponse_erreur("Numéro de téléphone invalide.")

    if len(mot_de_passe) < 6:
        return reponse_erreur("Le mot de passe doit contenir au moins 6 caractères.")

    conn = get_db()
    existant = conn.execute("SELECT id FROM users WHERE email = ?", (email,)).fetchone()
    if existant:
        conn.close()
        return reponse_erreur("Un compte existe déjà avec cet email.")

    hash_mdp, sel = hasher_mot_de_passe(mot_de_passe)
    conn.execute(
        "INSERT INTO users (email, password_hash, salt, prenom, nom, telephone) VALUES (?, ?, ?, ?, ?, ?)",
        (email, hash_mdp, sel, prenom, nom, telephone or None),
    )
    conn.commit()
    user_id = conn.execute("SELECT id FROM users WHERE email = ?", (email,)).fetchone()[0]
    conn.close()

    return reponse_auth(user_id, email)


@app.post("/connexion")
def connexion(email: str = Form(...), mot_de_passe: str = Form(...)):
    email = email.strip().lower()

    if trop_de_tentatives(email):
        return reponse_erreur(
            f"Trop de tentatives. Réessayez dans {FENETRE_BLOCAGE_MINUTES} minutes.",
            429,
        )

    conn = get_db()
    utilisateur = conn.execute(
        "SELECT id, password_hash, salt FROM users WHERE email = ?", (email,)
    ).fetchone()
    conn.close()

    if not utilisateur:
        enregistrer_tentative(email)
        return reponse_erreur("Email ou mot de passe incorrect.", 401)

    user_id, hash_stocke, sel = utilisateur
    if not hash_stocke or not sel:
        return reponse_erreur("Ce compte utilise Google. Connectez-vous avec Google.", 401)

    hash_verif, _ = hasher_mot_de_passe(mot_de_passe, sel)

    if not hmac.compare_digest(hash_verif, hash_stocke):
        enregistrer_tentative(email)
        return reponse_erreur("Email ou mot de passe incorrect.", 401)

    reinitialiser_tentatives(email)
    return reponse_auth(user_id, email)


@app.post("/connexion-google")
def connexion_google(id_token_google: str = Form(...)):
    if not GOOGLE_CLIENT_ID:
        return reponse_erreur(
            "Connexion Google non configurée. Ajoutez GOOGLE_CLIENT_ID dans le fichier .env du backend.",
            503,
        )

    try:
        from google.oauth2 import id_token as google_id_token
        from google.auth.transport import requests as google_requests

        infos = google_id_token.verify_oauth2_token(
            id_token_google,
            google_requests.Request(),
            GOOGLE_CLIENT_ID,
        )
    except Exception:
        return reponse_erreur("Connexion Google invalide. Réessayez.", 401)

    email = (infos.get("email") or "").strip().lower()
    google_id = infos.get("sub")
    if not email or not google_id:
        return reponse_erreur("Impossible de lire le compte Google.", 401)

    prenom = (infos.get("given_name") or "").strip()
    nom = (infos.get("family_name") or "").strip()
    if not prenom:
        prenom = (infos.get("name") or email.split("@")[0]).strip()

    conn = get_db()
    utilisateur = conn.execute(
        "SELECT id, google_id FROM users WHERE email = ? OR google_id = ?",
        (email, google_id),
    ).fetchone()

    if utilisateur:
        user_id, google_id_existant = utilisateur
        if not google_id_existant:
            conn.execute(
                "UPDATE users SET google_id = ?, prenom = COALESCE(NULLIF(prenom, ''), ?), nom = COALESCE(NULLIF(nom, ''), ?) WHERE id = ?",
                (google_id, prenom, nom, user_id),
            )
            conn.commit()
    else:
        conn.execute(
            "INSERT INTO users (email, password_hash, salt, prenom, nom, google_id) VALUES (?, NULL, NULL, ?, ?, ?)",
            (email, prenom, nom, google_id),
        )
        conn.commit()
        user_id = conn.execute("SELECT id FROM users WHERE google_id = ?", (google_id,)).fetchone()[0]

    conn.close()
    return reponse_auth(user_id, email)


@app.post("/deconnexion")
def deconnexion(user_id: Annotated[int, Depends(utilisateur_connecte)], authorization: Annotated[Optional[str], Header()] = None):
    token = extraire_token(authorization)
    conn = get_db()
    conn.execute("DELETE FROM sessions WHERE token = ? AND user_id = ?", (token, user_id))
    conn.commit()
    conn.close()
    return {"status": "ok"}


@app.post("/transcription")
async def transcrire_audio(
    user_id: Annotated[int, Depends(utilisateur_connecte)],
    fichier: UploadFile = File(...),
    langue: str = Form("fr"),
    conserver_audio: str = Form("0"),
):
    extension = os.path.splitext(fichier.filename or "")[1].lower() or ".webm"
    chemin_source = None
    chemin_wav = None
    audio_temporaire = None

    try:
        chemin_source, _taille = await enregistrer_upload_sur_disque(fichier, extension)
        chemin_wav = await asyncio.to_thread(extraire_audio_wav, chemin_source)
        resultat, langue_utilisee, repli_auto = await asyncio.to_thread(
            transcrire_avec_langue, chemin_wav, langue
        )
        if conserver_audio in ("1", "true", "True"):
            audio_temporaire = await asyncio.to_thread(enregistrer_audio_temporaire, user_id, chemin_wav)
    finally:
        for chemin in (chemin_source, chemin_wav):
            if chemin and os.path.exists(chemin):
                os.remove(chemin)

    segments = resultat.get("segments", [])

    if not segments:
        return reponse_erreur("Aucune parole détectée dans cet audio.")

    moyenne_no_speech = sum(s["no_speech_prob"] for s in segments) / len(segments)

    if moyenne_no_speech > 0.6:
        return reponse_erreur("Aucune parole claire détectée (silence probable).")

    texte = resultat["text"].strip()

    if not texte:
        return reponse_erreur("Aucune parole claire détectée dans cet audio.")

    reponse = {
        "texte": texte,
        "nom_fichier": fichier.filename,
        "audio_temporaire": audio_temporaire,
    }

    if repli_auto:
        reponse["note"] = (
            f"Langue « {langue} » non reconnue, détection automatique utilisée "
            f"(langue détectée : {langue_utilisee})."
        )

    return reponse


@app.post("/transcription-lien")
async def transcrire_lien(
    user_id: Annotated[int, Depends(utilisateur_connecte)],
    url: str = Form(...),
    langue: str = Form("fr"),
    conserver_audio: str = Form("0"),
):
    url = url.strip()
    if not url.startswith(("http://", "https://")):
        return reponse_erreur("Lien invalide.")

    chemin_wav = None
    audio_temporaire = None

    try:
        chemin_wav = await asyncio.to_thread(telecharger_audio_lien, url)
        resultat, langue_utilisee, repli_auto = await asyncio.to_thread(
            transcrire_avec_langue, chemin_wav, langue
        )
        if conserver_audio in ("1", "true", "True"):
            audio_temporaire = await asyncio.to_thread(enregistrer_audio_temporaire, user_id, chemin_wav)
    finally:
        if chemin_wav and os.path.exists(chemin_wav):
            os.remove(chemin_wav)

    segments = resultat.get("segments", [])

    if not segments:
        return reponse_erreur("Aucune parole détectée dans cet audio.")

    moyenne_no_speech = sum(s["no_speech_prob"] for s in segments) / len(segments)

    if moyenne_no_speech > 0.6:
        return reponse_erreur("Aucune parole claire détectée (silence probable).")

    texte = resultat["text"].strip()

    if not texte:
        return reponse_erreur("Aucune parole claire détectée dans cet audio.")

    reponse = {
        "texte": texte,
        "nom_fichier": url,
        "audio_temporaire": audio_temporaire,
    }

    if repli_auto:
        reponse["note"] = (
            f"Langue « {langue} » non reconnue, détection automatique utilisée "
            f"(langue détectée : {langue_utilisee})."
        )

    return reponse


@app.post("/assistant")
async def assistant_vocal(
    user_id: Annotated[int, Depends(utilisateur_connecte)],
    fichier: UploadFile = File(...),
    historique: str = Form(None),
):
    chemin_source = None

    try:
        chemin_source, _taille = await enregistrer_upload_sur_disque(
            fichier, ".webm", limite=MAX_AUDIO_OCTETS
        )
        resultat = await asyncio.to_thread(transcrire_francais, chemin_source)
    finally:
        if chemin_source and os.path.exists(chemin_source):
            os.remove(chemin_source)

    segments = resultat.get("segments", [])

    if not segments:
        return reponse_erreur("Aucune parole détectée dans cet audio.")

    moyenne_no_speech = sum(s["no_speech_prob"] for s in segments) / len(segments)

    if moyenne_no_speech > 0.6:
        return reponse_erreur("Aucune parole claire détectée (silence probable).")

    question = resultat["text"].strip()

    if not question:
        return reponse_erreur("Aucune parole détectée.")

    try:
        messages = construire_messages(historique, question)
        texte_reponse = await asyncio.to_thread(appeler_groq, messages)
    except Exception as e:
        return reponse_erreur(f"Erreur de l'assistant IA : {str(e)}", 502)

    return {"question": question, "reponse": texte_reponse}


@app.post("/assistant-texte")
async def assistant_texte(
    user_id: Annotated[int, Depends(utilisateur_connecte)],
    message: str = Form(...),
    historique: str = Form(None),
):
    if not message.strip():
        return reponse_erreur("Message vide.")

    try:
        messages = construire_messages(historique, message.strip())
        texte_reponse = await asyncio.to_thread(appeler_groq, messages)
    except Exception as e:
        return reponse_erreur(f"Erreur de l'assistant IA : {str(e)}", 502)

    return {"question": message.strip(), "reponse": texte_reponse}


@app.post("/sauvegarder")
async def sauvegarder_transcription(
    user_id: Annotated[int, Depends(utilisateur_connecte)],
    texte: str = Form(...),
    fichier: UploadFile = File(None),
    audio_temporaire: str = Form(None),
):
    nom_audio = None
    chemin_temporaire = consommer_audio_temporaire(user_id, audio_temporaire)
    if chemin_temporaire and os.path.isfile(chemin_temporaire):
        nom_audio = f"{uuid.uuid4()}.wav"
        os.replace(chemin_temporaire, os.path.join(DOSSIER_AUDIOS, nom_audio))
    elif fichier and fichier.filename:
        extension = os.path.splitext(fichier.filename)[1] or ".webm"
        if len(extension) > 8:
            extension = ".webm"
        chemin_source, _taille = await enregistrer_upload_sur_disque(fichier, extension)
        try:
            chemin_wav = extraire_audio_wav(chemin_source)
            nom_audio = f"{uuid.uuid4()}.wav"
            os.replace(chemin_wav, os.path.join(DOSSIER_AUDIOS, nom_audio))
        finally:
            if os.path.isfile(chemin_source):
                os.remove(chemin_source)

    conn = get_db()
    conn.execute(
        "INSERT INTO transcriptions (user_id, date, texte, audio_fichier) VALUES (?, ?, ?, ?)",
        (user_id, datetime.now().strftime("%d/%m/%Y %H:%M"), texte, nom_audio),
    )
    conn.commit()
    conn.close()
    return {"status": "ok"}


@app.post("/sauvegarder-drive")
def sauvegarder_drive(
    user_id: Annotated[int, Depends(utilisateur_connecte)],
    access_token: str = Form(...),
    texte: str = Form(...),
    nom: str = Form("transcription-vocalia.txt"),
):
    nom_fichier = os.path.basename(nom).strip() or "transcription-vocalia.txt"
    if not nom_fichier.lower().endswith(".txt"):
        nom_fichier += ".txt"
    resultat = telecharger_vers_drive(access_token, nom_fichier, texte.encode("utf-8"))
    return {"status": "ok", "id_drive": resultat.get("id")}


@app.post("/sauvegarder-conversation")
def sauvegarder_conversation(
    user_id: Annotated[int, Depends(utilisateur_connecte)],
    conversation: str = Form(...),
):
    conn = get_db()
    conn.execute(
        "INSERT INTO conversations (user_id, date, messages) VALUES (?, ?, ?)",
        (user_id, datetime.now().strftime("%d/%m/%Y %H:%M"), conversation),
    )
    conn.commit()
    conn.close()
    return {"status": "ok"}


@app.get("/historique")
def get_historique(user_id: Annotated[int, Depends(utilisateur_connecte)]):
    conn = get_db()
    rows = conn.execute(
        "SELECT id, date, texte, audio_fichier FROM transcriptions WHERE user_id = ? ORDER BY id DESC",
        (user_id,),
    ).fetchall()
    conn.close()
    return {
        "transcriptions": [
            {
                "id": r[0],
                "date": r[1],
                "texte": r[2],
                "audio_fichier": r[3],
            }
            for r in rows
        ]
    }


@app.get("/historique-conversations")
def get_historique_conversations(user_id: Annotated[int, Depends(utilisateur_connecte)]):
    conn = get_db()
    rows = conn.execute(
        "SELECT id, date, messages FROM conversations WHERE user_id = ? ORDER BY id DESC",
        (user_id,),
    ).fetchall()
    conn.close()

    resultats = []
    for r in rows:
        try:
            messages = json.loads(r[2])
        except (json.JSONDecodeError, TypeError):
            messages = []
        resultats.append({"id": r[0], "date": r[1], "messages": messages})

    return {"conversations": resultats}


@app.get("/media/{nom_audio}")
def servir_audio(nom_audio: str, user_id: Annotated[int, Depends(utilisateur_connecte)]):
    if not nom_fichier_sur(nom_audio):
        return reponse_erreur("Fichier invalide.", 400)

    conn = get_db()
    row = conn.execute(
        "SELECT id FROM transcriptions WHERE user_id = ? AND audio_fichier = ?",
        (user_id, nom_audio),
    ).fetchone()
    conn.close()

    if not row:
        return reponse_erreur("Fichier introuvable.", 404)

    chemin = os.path.join(DOSSIER_AUDIOS, nom_audio)
    if not os.path.isfile(chemin):
        return reponse_erreur("Fichier introuvable.", 404)

    return FileResponse(chemin)


@app.delete("/transcriptions/{item_id}")
def supprimer_transcription(item_id: int, user_id: Annotated[int, Depends(utilisateur_connecte)]):
    conn = get_db()
    row = conn.execute(
        "SELECT audio_fichier FROM transcriptions WHERE id = ? AND user_id = ?",
        (item_id, user_id),
    ).fetchone()
    if not row:
        conn.close()
        return reponse_erreur("Transcription introuvable.", 404)

    nom_audio = row[0]
    conn.execute("DELETE FROM transcriptions WHERE id = ? AND user_id = ?", (item_id, user_id))
    conn.commit()
    conn.close()

    if nom_audio:
        chemin = os.path.join(DOSSIER_AUDIOS, nom_audio)
        if os.path.isfile(chemin) and nom_fichier_sur(nom_audio):
            os.remove(chemin)

    return {"status": "ok"}


@app.delete("/conversations/{item_id}")
def supprimer_conversation(item_id: int, user_id: Annotated[int, Depends(utilisateur_connecte)]):
    conn = get_db()
    curseur = conn.execute(
        "DELETE FROM conversations WHERE id = ? AND user_id = ?",
        (item_id, user_id),
    )
    if curseur.rowcount == 0:
        conn.close()
        return reponse_erreur("Conversation introuvable.", 404)
    conn.commit()
    conn.close()
    return {"status": "ok"}