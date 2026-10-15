import time
import importlib.util
import tempfile
import os
import uuid
import json
import re
import glob
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
DUREE_CONSERVATION_TRAVAUX = timedelta(hours=6)
DUREE_MORCEAU = 600
TAILLE_MAX_TEXTE_OUTIL = 400000
MODELE_WHISPER_GROQ = os.environ.get("GROQ_WHISPER_MODEL", "whisper-large-v3-turbo").strip()
MODELE_GROQ_WEB = os.environ.get("MODELE_GROQ_WEB", "").strip()
LANGUES_AUTO = ("", "auto", "ee")
GOOGLE_CLIENT_ID = os.environ.get("GOOGLE_CLIENT_ID", "").strip()
FICHIER_COOKIES_YOUTUBE = os.environ.get("YOUTUBE_COOKIES_FILE", "").strip()
NAVIGATEUR_COOKIES_YOUTUBE = os.environ.get("YOUTUBE_COOKIES_BROWSER", "").strip().lower()
EXTENSIONS_MEDIA = (
    ".webm", ".wav", ".mp3", ".m4a", ".ogg", ".mpeg", ".mpga",
    ".mp4", ".mov", ".mkv", ".avi", ".m4v", ".mpg", ".aac", ".flac",
)
REGEX_TELEPHONE = re.compile(r"^[0-9+\s().-]{6,20}$")
REGEX_EMAIL = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")

audio_temporaires = {}
verrou_temporaires = threading.Lock()
travaux = {}
verrou_travaux = threading.Lock()
verrou_transcription = threading.Lock()

JOURS_FR = ["lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi", "dimanche"]
MOIS_FR = [
    "janvier", "février", "mars", "avril", "mai", "juin",
    "juillet", "août", "septembre", "octobre", "novembre", "décembre",
]

NOMS_LANGUES = {
    "fr": "français", "en": "anglais", "es": "espagnol", "de": "allemand", "pt": "portugais",
    "it": "italien", "ar": "arabe", "nl": "néerlandais", "ru": "russe", "zh": "chinois",
    "ja": "japonais", "ko": "coréen", "tr": "turc", "sw": "swahili", "ln": "lingala",
    "hi": "hindi", "pl": "polonais",
}

CODES_PAR_NOM = {
    "english": "en", "french": "fr", "spanish": "es", "german": "de", "portuguese": "pt",
    "italian": "it", "arabic": "ar", "dutch": "nl", "russian": "ru", "chinese": "zh",
    "japanese": "ja", "korean": "ko", "turkish": "tr", "swahili": "sw", "lingala": "ln",
    "hindi": "hi", "polish": "pl",
}

REGEX_ACTUALITE = re.compile(
    r"\b(match|score|résultat|resultat|classement|aujourd.?hui|hier|ce soir|cette semaine|"
    r"dernier|dernière|derniere|récent|recent|météo|meteo|prix|cours|bourse|2025|2026)\b|actualit",
    re.IGNORECASE,
)

PROMPT_SYSTEME = (
    "Tu es VocalIA, un assistant intelligent, vocal et écrit, intégré à une application de transcription "
    "audio utilisée pour des réunions et des prédications à l'église, au Togo. "
    "Tu réponds en français, sauf si l'utilisateur écrit dans une autre langue ou demande une autre langue. "
    "Réponds directement et utilement dès la première réponse, avec des informations concrètes. "
    "Quand une demande est un peu vague, ne pose pas de question : choisis l'interprétation la plus probable "
    "(par exemple le football quand on parle du Barça), dis-la en quelques mots, puis réponds. "
    "Ne pose une question de précision que si la demande est impossible à traiter sans elle, et jamais plus d'une. "
    "Tu n'as pas accès à internet ni aux informations en temps réel, sauf si des résultats de recherche te sont fournis. "
    "Pour un résultat sportif récent, l'actualité ou tout ce qui a pu changer, dis-le honnêtement, "
    "donne ce que tu sais avec une date approximative et indique où vérifier. "
    "N'invente jamais un score, une date, un chiffre ou une citation. "
    "Tiens compte du contexte des messages précédents. "
    "Tu ne peux pas parler toi-même : la lecture à voix haute est faite par l'application, avec le bouton Lire "
    "sous chaque réponse (ou la commande /lire en ligne de commande). "
    "Si l'utilisateur te demande de lire un texte à voix haute, ne prétends jamais l'avoir lu : "
    "dis en une phrase courte qu'il peut utiliser le bouton Lire, puis, si cela l'aide, "
    "reformule le texte avec une ponctuation et des espaces naturels, prêt à être lu. "
    "Ne parle de la lecture vocale que si l'utilisateur en parle lui-même. "
    "N'utilise jamais de tableaux, ni de formatage Markdown (pas d'astérisques, pas de dièses, pas de tirets "
    "de liste). Réponds uniquement en texte simple, en phrases complètes, comme dans une conversation orale naturelle. "
    "Si tu dois présenter plusieurs éléments, énumère-les dans une phrase fluide plutôt qu'en liste ou tableau."
)

CONSIGNE_TRADUCTION = (
    "Tu es un traducteur professionnel. Traduis fidèlement le texte de l'utilisateur en {langue}. "
    "Conserve le sens, le ton et la ponctuation. Ne résume pas, n'ajoute rien, ne commente pas. "
    "Réponds uniquement avec la traduction, en texte simple sans Markdown."
)

CONSIGNE_RESUME_PARTIEL = (
    "Tu résumes un extrait d'une transcription automatique (prédication, réunion ou vidéo). "
    "Rédige en {langue}, en texte simple sans Markdown. Garde les idées principales, les arguments, "
    "les chiffres et les références bibliques citées. N'invente rien."
)

CONSIGNE_RESUME = (
    "Tu résumes la transcription automatique d'une prédication, d'une réunion ou d'une vidéo. "
    "Rédige entièrement en {langue}, en texte simple sans Markdown (pas d'astérisques ni de dièses). "
    "Corrige silencieusement les erreurs évidentes de transcription et n'invente rien. "
    "Structure ta réponse ainsi, avec les titres de section traduits en {langue} : "
    "d'abord le titre du résumé suivi de 4 à 8 phrases ; ensuite les points clés, un par ligne, "
    "chaque ligne commençant par un tiret ; enfin, uniquement s'il y en a, les versets ou références bibliques cités."
)

PROMPTS_TRANSCRIPTION = {
    "fr": "Transcription d'une prédication ou d'un message en français, avec des termes comme Seigneur, Évangile, prière, église, Togo.",
    "en": "Transcription of a sermon or message in English.",
}

modele_whisper = None
verrou_modele = threading.Lock()
client_groq = Groq(api_key=os.environ.get("GROQ_API_KEY"))


def whisper_local_disponible():
    return importlib.util.find_spec("whisper") is not None


def get_modele():
    global modele_whisper
    if modele_whisper is None:
        with verrou_modele:
            if modele_whisper is None:
                try:
                    import whisper
                except ImportError:
                    raise HTTPException(
                        status_code=503,
                        detail="La transcription locale n'est pas installée sur ce serveur.",
                    )
                modele_whisper = whisper.load_model(os.environ.get("WHISPER_MODELE", "small"))
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
    allow_origin_regex=r"https?://.*",
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


def supprimer_fichier(chemin):
    if chemin and os.path.isfile(chemin):
        try:
            os.remove(chemin)
        except OSError:
            pass


def nettoyer_audio_temporaires():
    maintenant = datetime.now()
    with verrou_temporaires:
        expires = [cle for cle, info in audio_temporaires.items() if info["expiration"] < maintenant]
        for cle in expires:
            supprimer_fichier(audio_temporaires.pop(cle)["chemin"])


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
        supprimer_fichier(chemin)
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
        supprimer_fichier(chemin_wav)
        raise HTTPException(
            status_code=400,
            detail="Impossible d’extraire l’audio de ce fichier. Vérifiez le format.",
        )
    return chemin_wav


def version_yt_dlp():
    try:
        return yt_dlp.version.__version__
    except Exception:
        return "inconnue"


def message_erreur_lien(erreur):
    texte = str(erreur).lower()

    if "sign in to confirm" in texte or "not a bot" in texte or "cookies" in texte:
        return (
            "YouTube bloque cette requête (protection anti-bot). "
            "Configurez YOUTUBE_COOKIES_BROWSER dans le .env du backend (ex. chrome) puis relancez le serveur."
        )
    if "ffmpeg" in texte or "ffprobe" in texte:
        return "ffmpeg est introuvable sur le serveur. Installez-le puis relancez le backend."
    if "private video" in texte or "members-only" in texte or "members only" in texte:
        return "Cette vidéo est privée ou réservée aux membres."
    if "age" in texte and ("restricted" in texte or "confirm your age" in texte):
        return "Cette vidéo est soumise à une restriction d'âge. Utilisez les cookies du navigateur."
    if "unavailable" in texte or "removed" in texte or "not available" in texte:
        return "Cette vidéo n'est pas disponible (supprimée ou bloquée dans votre région)."
    if "unsupported url" in texte:
        return "Ce lien n'est pas pris en charge. Collez le lien direct de la vidéo ou de l'audio."
    if "javascript" in texte or "js runtime" in texte or "n challenge" in texte or "signature" in texte:
        return (
            "YouTube demande un moteur JavaScript. Installez Node.js ou Deno, "
            "et mettez à jour yt-dlp : pip install -U \"yt-dlp[default]\""
        )
    return (
        "Impossible de récupérer l'audio depuis ce lien. "
        "Mettez à jour yt-dlp (pip install -U \"yt-dlp[default]\") et regardez le terminal du serveur pour le détail."
    )


def supprimer_residus(base_sans_extension):
    for chemin in glob.glob(base_sans_extension + ".*"):
        supprimer_fichier(chemin)


def telecharger_audio_lien(url):
    if not ffmpeg_disponible():
        raise HTTPException(
            status_code=500,
            detail="ffmpeg est introuvable sur le serveur. Installez-le puis relancez le backend.",
        )

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
        "geo_bypass": True,
        "retries": 3,
        "js_runtimes": {"node": {}, "deno": {}},
    }

    if FICHIER_COOKIES_YOUTUBE and os.path.isfile(FICHIER_COOKIES_YOUTUBE):
        options["cookiefile"] = FICHIER_COOKIES_YOUTUBE
    elif NAVIGATEUR_COOKIES_YOUTUBE:
        options["cookiesfrombrowser"] = (NAVIGATEUR_COOKIES_YOUTUBE,)

    try:
        with yt_dlp.YoutubeDL(options) as ydl:
            ydl.download([url])
    except Exception as e:
        print(f"[yt-dlp {version_yt_dlp()}] Échec du téléchargement pour {url} : {type(e).__name__}: {e}")
        supprimer_residus(base_sans_extension)
        raise HTTPException(status_code=400, detail=message_erreur_lien(e))

    chemin_wav = base_sans_extension + ".wav"
    if not os.path.isfile(chemin_wav) or os.path.getsize(chemin_wav) == 0:
        supprimer_residus(base_sans_extension)
        raise HTTPException(status_code=400, detail="Aucun audio n'a pu être extrait de ce lien.")

    for chemin in glob.glob(base_sans_extension + ".*"):
        if chemin != chemin_wav:
            supprimer_fichier(chemin)

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


def date_francaise():
    maintenant = datetime.now()
    return f"{JOURS_FR[maintenant.weekday()]} {maintenant.day} {MOIS_FR[maintenant.month - 1]} {maintenant.year}"


def construire_messages(historique_json, nouveau_message):
    messages = [{"role": "system", "content": f"{PROMPT_SYSTEME} Date du jour : {date_francaise()}."}]

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


def code_langue(valeur):
    if not valeur:
        return None
    texte = str(valeur).strip().lower()
    if texte in NOMS_LANGUES:
        return texte
    return CODES_PAR_NOM.get(texte)


def nom_langue(code):
    return NOMS_LANGUES.get(code, code)


def avec_reprise(fonction, tentatives=4):
    for essai in range(tentatives):
        try:
            return fonction()
        except Exception as e:
            texte = str(e).lower()
            limite = "429" in texte or "rate limit" in texte or "rate_limit" in texte
            if not limite or essai == tentatives - 1:
                raise
            time.sleep(15 * (essai + 1))


def groq_disponible():
    return bool(os.environ.get("GROQ_API_KEY")) and os.environ.get("TRANSCRIPTION_LOCALE", "").strip() != "1"


def lire_champ(objet, nom, defaut=None):
    if isinstance(objet, dict):
        valeur = objet.get(nom)
    else:
        valeur = getattr(objet, nom, None)
        extra = getattr(objet, "model_extra", None)
        if valeur is None and extra:
            valeur = extra.get(nom)
    return defaut if valeur is None else valeur


def decouper_audio(chemin_audio):
    dossier = tempfile.mkdtemp()
    modele = os.path.join(dossier, "morceau_%03d.mp3")
    commande = [
        "ffmpeg", "-y", "-i", chemin_audio, "-vn", "-ac", "1", "-ar", "16000",
        "-c:a", "libmp3lame", "-b:a", "48k",
        "-f", "segment", "-segment_time", str(DUREE_MORCEAU), "-reset_timestamps", "1",
        modele,
    ]
    resultat = subprocess.run(commande, capture_output=True, timeout=4 * 3600)
    morceaux = sorted(glob.glob(os.path.join(dossier, "morceau_*.mp3")))
    if resultat.returncode != 0 or not morceaux:
        shutil.rmtree(dossier, ignore_errors=True)
        raise RuntimeError("Découpage audio impossible.")
    return dossier, morceaux


def transcrire_groq(chemin_audio, code):
    dossier, morceaux = decouper_audio(chemin_audio)
    try:
        textes = []
        segments = []
        code_utilise = code
        langue_detectee = code

        for index, morceau in enumerate(morceaux):
            with open(morceau, "rb") as f:
                contenu = f.read()

            parametres = {
                "file": (os.path.basename(morceau), contenu),
                "model": MODELE_WHISPER_GROQ,
                "response_format": "verbose_json",
                "temperature": 0.0,
            }
            if code_utilise:
                parametres["language"] = code_utilise

            reponse = avec_reprise(lambda: client_groq.audio.transcriptions.create(**parametres))

            texte = (lire_champ(reponse, "text", "") or "").strip()
            if texte:
                textes.append(texte)

            decalage = index * DUREE_MORCEAU
            for segment in lire_champ(reponse, "segments", []) or []:
                segments.append({
                    "start": float(lire_champ(segment, "start", 0) or 0) + decalage,
                    "end": float(lire_champ(segment, "end", 0) or 0) + decalage,
                    "text": (lire_champ(segment, "text", "") or "").strip(),
                    "no_speech_prob": float(lire_champ(segment, "no_speech_prob", 0) or 0),
                })

            if langue_detectee is None and texte:
                detectee = code_langue(lire_champ(reponse, "language"))
                if detectee:
                    langue_detectee = detectee
                    code_utilise = detectee

        resultat = {"text": " ".join(textes), "segments": segments, "language": langue_detectee}
        return resultat, langue_detectee, False
    finally:
        shutil.rmtree(dossier, ignore_errors=True)


def transcrire_local(chemin_audio, code):
    modele = get_modele()
    prompt = PROMPTS_TRANSCRIPTION.get(code) if code else None
    with verrou_transcription:
        if code is None:
            resultat = modele.transcribe(chemin_audio)
            return resultat, resultat.get("language"), False
        try:
            resultat = modele.transcribe(chemin_audio, language=code, initial_prompt=prompt)
            return resultat, code, False
        except Exception:
            resultat = modele.transcribe(chemin_audio)
            return resultat, resultat.get("language"), True


def transcrire_audio_complet(chemin_audio, langue):
    code = None if (langue or "").strip().lower() in LANGUES_AUTO else langue.strip().lower()

    if groq_disponible():
        try:
            return transcrire_groq(chemin_audio, code)
        except Exception as e:
            print(f"[transcription groq] {type(e).__name__}: {e}")
            if not whisper_local_disponible():
                raise HTTPException(
                    status_code=502,
                    detail="Le service de transcription est indisponible ou sa limite est atteinte. Réessayez plus tard.",
                )

    return transcrire_local(chemin_audio, code)


def analyser_resultat(resultat, langue, langue_utilisee, repli_auto):
    texte = (resultat.get("text") or "").strip()
    segments = resultat.get("segments") or []

    if not texte:
        return None, None, "Aucune parole détectée dans cet audio."

    if segments:
        moyenne_no_speech = sum(s.get("no_speech_prob", 0) for s in segments) / len(segments)
        if moyenne_no_speech > 0.6:
            return None, None, "Aucune parole claire détectée (silence probable)."

    note = None
    if repli_auto:
        note = (
            f"Langue « {langue} » non reconnue, détection automatique utilisée "
            f"(langue détectée : {langue_utilisee})."
        )
    elif (langue or "").strip().lower() in LANGUES_AUTO and langue_utilisee:
        note = f"Langue détectée : {nom_langue(langue_utilisee)}."

    return texte, note, None


def appeler_groq(messages, modele=None, temperature=0.4):
    def appel():
        reponse_ia = client_groq.chat.completions.create(
            model=modele or MODELE_GROQ,
            messages=messages,
            temperature=temperature,
        )
        return reponse_ia.choices[0].message.content

    return avec_reprise(appel, 3)


def repondre(messages, question):
    if MODELE_GROQ_WEB and REGEX_ACTUALITE.search(question):
        try:
            reponse = appeler_groq(messages, modele=MODELE_GROQ_WEB)
            if reponse and reponse.strip():
                return reponse
        except Exception as e:
            print(f"[assistant web] {type(e).__name__}: {e}")
    return appeler_groq(messages)


def demander(consigne, contenu, temperature=0.2):
    messages = [
        {"role": "system", "content": consigne},
        {"role": "user", "content": contenu},
    ]
    return (appeler_groq(messages, temperature=temperature) or "").strip()


def decouper_texte(texte, taille):
    morceaux = []
    courant = ""
    for phrase in re.split(r"(?<=[.!?…])\s+", texte.strip()):
        while len(phrase) > taille:
            if courant:
                morceaux.append(courant)
                courant = ""
            morceaux.append(phrase[:taille])
            phrase = phrase[taille:]
        if courant and len(courant) + len(phrase) + 1 > taille:
            morceaux.append(courant)
            courant = phrase
        else:
            courant = f"{courant} {phrase}".strip()
    if courant:
        morceaux.append(courant)
    return morceaux


def traduire_long(texte, langue_cible, signaler):
    morceaux = decouper_texte(texte, 4000)
    consigne = CONSIGNE_TRADUCTION.format(langue=langue_cible)
    traductions = []
    for index, morceau in enumerate(morceaux, 1):
        signaler(f"Traduction en cours… {index}/{len(morceaux)}")
        traductions.append(demander(consigne, morceau, 0.1))
    return " ".join(traductions)


def resumer_long(texte, langue_cible, signaler):
    morceaux = decouper_texte(texte, 6000)

    if len(morceaux) == 1:
        signaler("Résumé en cours…")
        return demander(CONSIGNE_RESUME.format(langue=langue_cible), morceaux[0], 0.3)

    consigne_partielle = CONSIGNE_RESUME_PARTIEL.format(langue=langue_cible)
    partiels = []
    for index, morceau in enumerate(morceaux, 1):
        signaler(f"Lecture du texte… {index}/{len(morceaux)}")
        partiels.append(demander(consigne_partielle, morceau, 0.3))

    signaler("Rédaction du résumé final…")
    return demander(CONSIGNE_RESUME.format(langue=langue_cible), "\n\n".join(partiels), 0.3)


def nom_fichier_sur(nom: str) -> bool:
    if not nom or "/" in nom or "\\" in nom or ".." in nom:
        return False
    nom_min = nom.lower()
    return nom_min.endswith(EXTENSIONS_MEDIA)


def nettoyer_travaux():
    limite = datetime.now() - DUREE_CONSERVATION_TRAVAUX
    with verrou_travaux:
        for cle in [c for c, t in travaux.items() if t["creation"] < limite]:
            travaux.pop(cle, None)


def creer_travail(user_id, etape):
    nettoyer_travaux()
    identifiant = str(uuid.uuid4())
    with verrou_travaux:
        travaux[identifiant] = {
            "user_id": user_id,
            "statut": "en_cours",
            "etape": etape,
            "creation": datetime.now(),
        }
    return identifiant


def maj_travail(identifiant, **champs):
    with verrou_travaux:
        if identifiant in travaux:
            travaux[identifiant].update(champs)


def message_exception(erreur):
    if isinstance(erreur, HTTPException):
        return erreur.detail if isinstance(erreur.detail, str) else "Requête invalide."
    return "Une erreur est survenue pendant le traitement."


def transcrire_travail(identifiant, user_id, chemin_wav, nom, langue, conserver):
    if verrou_transcription.locked():
        maj_travail(identifiant, etape="En attente d’une transcription précédente…")
    else:
        maj_travail(identifiant, etape="Transcription en cours…")

    resultat, langue_utilisee, repli_auto = transcrire_audio_complet(chemin_wav, langue)
    texte, note, erreur = analyser_resultat(resultat, langue, langue_utilisee, repli_auto)

    if erreur:
        maj_travail(identifiant, statut="erreur", message=erreur)
        return

    audio_temporaire = enregistrer_audio_temporaire(user_id, chemin_wav) if conserver else None
    maj_travail(
        identifiant,
        statut="termine",
        texte=texte,
        note=note or "",
        audio_temporaire=audio_temporaire,
        nom_fichier=nom,
        langue_detectee=langue_utilisee,
    )


def executer_travail_fichier(identifiant, user_id, chemin_source, nom, langue, conserver):
    chemin_wav = None
    try:
        maj_travail(identifiant, etape="Extraction de l’audio…")
        chemin_wav = extraire_audio_wav(chemin_source)
        transcrire_travail(identifiant, user_id, chemin_wav, nom, langue, conserver)
    except Exception as e:
        print(f"[travail {identifiant}] {type(e).__name__}: {e}")
        maj_travail(identifiant, statut="erreur", message=message_exception(e))
    finally:
        supprimer_fichier(chemin_source)
        supprimer_fichier(chemin_wav)


def executer_travail_lien(identifiant, user_id, url, langue, conserver):
    chemin_wav = None
    try:
        maj_travail(identifiant, etape="Téléchargement de l’audio du lien…")
        chemin_wav = telecharger_audio_lien(url)
        transcrire_travail(identifiant, user_id, chemin_wav, url, langue, conserver)
    except Exception as e:
        print(f"[travail {identifiant}] {type(e).__name__}: {e}")
        maj_travail(identifiant, statut="erreur", message=message_exception(e))
    finally:
        supprimer_fichier(chemin_wav)


def executer_travail_outil(identifiant, type_outil, texte, langue_cible):
    def signaler(etape):
        maj_travail(identifiant, etape=etape)

    try:
        if type_outil == "traduction":
            resultat = traduire_long(texte, langue_cible, signaler)
        else:
            resultat = resumer_long(texte, langue_cible, signaler)

        if not resultat.strip():
            raise ValueError("Résultat vide")

        maj_travail(
            identifiant,
            statut="termine",
            texte=resultat,
            note="",
            audio_temporaire=None,
            nom_fichier="",
            langue_detectee=None,
        )
    except Exception as e:
        print(f"[outil {type_outil} {identifiant}] {type(e).__name__}: {e}")
        maj_travail(
            identifiant,
            statut="erreur",
            message="L'assistant IA est momentanément indisponible ou sa limite est atteinte. Réessayez dans une minute.",
        )


def nettoyer_langue_cible(langue_cible):
    propre = re.sub(r"[^\w\s'’-]", "", langue_cible or "").strip()[:40]
    return propre or "français"


@app.get("/")
def read_root():
    return {"message": "VocalIA backend en ligne"}


@app.get("/health")
def health_check():
    return {
        "status": "ok",
        "service": "VocalIA",
        "ffmpeg": ffmpeg_disponible(),
        "yt_dlp": version_yt_dlp(),
        "node": shutil.which("node") is not None,
        "deno": shutil.which("deno") is not None,
    }


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
            transcrire_audio_complet, chemin_wav, langue
        )
        if conserver_audio in ("1", "true", "True"):
            audio_temporaire = await asyncio.to_thread(enregistrer_audio_temporaire, user_id, chemin_wav)
    finally:
        supprimer_fichier(chemin_source)
        supprimer_fichier(chemin_wav)

    texte, note, erreur = analyser_resultat(resultat, langue, langue_utilisee, repli_auto)
    if erreur:
        return reponse_erreur(erreur)

    reponse = {
        "texte": texte,
        "nom_fichier": fichier.filename,
        "audio_temporaire": audio_temporaire,
        "langue_detectee": langue_utilisee,
    }
    if note:
        reponse["note"] = note

    return reponse


@app.post("/travaux/fichier")
async def lancer_travail_fichier(
    user_id: Annotated[int, Depends(utilisateur_connecte)],
    fichier: UploadFile = File(...),
    langue: str = Form("fr"),
    conserver_audio: str = Form("0"),
):
    extension = os.path.splitext(fichier.filename or "")[1].lower() or ".webm"
    chemin_source, _taille = await enregistrer_upload_sur_disque(fichier, extension)
    identifiant = creer_travail(user_id, "Préparation du fichier…")
    conserver = conserver_audio in ("1", "true", "True")
    threading.Thread(
        target=executer_travail_fichier,
        args=(identifiant, user_id, chemin_source, fichier.filename, langue, conserver),
        daemon=True,
    ).start()
    return {"id_travail": identifiant}


@app.post("/travaux/lien")
async def lancer_travail_lien(
    user_id: Annotated[int, Depends(utilisateur_connecte)],
    url: str = Form(...),
    langue: str = Form("fr"),
    conserver_audio: str = Form("0"),
):
    url = url.strip()
    if not url.startswith(("http://", "https://")):
        return reponse_erreur("Lien invalide.")

    identifiant = creer_travail(user_id, "Préparation du lien…")
    conserver = conserver_audio in ("1", "true", "True")
    threading.Thread(
        target=executer_travail_lien,
        args=(identifiant, user_id, url, langue, conserver),
        daemon=True,
    ).start()
    return {"id_travail": identifiant}


@app.post("/outils/traduire")
async def lancer_traduction(
    user_id: Annotated[int, Depends(utilisateur_connecte)],
    texte: str = Form(...),
    langue_cible: str = Form("français"),
):
    texte = texte.strip()
    if not texte:
        return reponse_erreur("Aucun texte à traduire.")
    if len(texte) > TAILLE_MAX_TEXTE_OUTIL:
        return reponse_erreur("Texte trop long pour être traité.", 413)

    identifiant = creer_travail(user_id, "Préparation de la traduction…")
    threading.Thread(
        target=executer_travail_outil,
        args=(identifiant, "traduction", texte, nettoyer_langue_cible(langue_cible)),
        daemon=True,
    ).start()
    return {"id_travail": identifiant}


@app.post("/outils/resumer")
async def lancer_resume(
    user_id: Annotated[int, Depends(utilisateur_connecte)],
    texte: str = Form(...),
    langue_cible: str = Form("français"),
):
    texte = texte.strip()
    if not texte:
        return reponse_erreur("Aucun texte à résumer.")
    if len(texte) > TAILLE_MAX_TEXTE_OUTIL:
        return reponse_erreur("Texte trop long pour être traité.", 413)

    identifiant = creer_travail(user_id, "Préparation du résumé…")
    threading.Thread(
        target=executer_travail_outil,
        args=(identifiant, "resume", texte, nettoyer_langue_cible(langue_cible)),
        daemon=True,
    ).start()
    return {"id_travail": identifiant}


@app.get("/travaux/{identifiant}")
def etat_travail(identifiant: str, user_id: Annotated[int, Depends(utilisateur_connecte)]):
    with verrou_travaux:
        travail = dict(travaux.get(identifiant) or {})

    if not travail or travail["user_id"] != user_id:
        return reponse_erreur("Travail introuvable (le serveur a peut-être redémarré).", 404)

    statut = travail["statut"]

    if statut == "en_cours":
        return {"statut": statut, "etape": travail.get("etape", "")}

    if statut == "erreur":
        return {"statut": statut, "message": travail.get("message", "Une erreur est survenue.")}

    return {
        "statut": statut,
        "texte": travail.get("texte", ""),
        "note": travail.get("note", ""),
        "audio_temporaire": travail.get("audio_temporaire"),
        "nom_fichier": travail.get("nom_fichier", ""),
        "langue_detectee": travail.get("langue_detectee"),
    }


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
        resultat, langue_utilisee, repli_auto = await asyncio.to_thread(
            transcrire_audio_complet, chemin_source, "auto"
        )
    finally:
        supprimer_fichier(chemin_source)

    question, _note, erreur = analyser_resultat(resultat, "auto", langue_utilisee, repli_auto)
    if erreur:
        return reponse_erreur(erreur)

    try:
        messages = construire_messages(historique, question)
        texte_reponse = await asyncio.to_thread(repondre, messages, question)
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
        texte_reponse = await asyncio.to_thread(repondre, messages, message.strip())
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
            supprimer_fichier(chemin_source)

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

    if nom_audio and nom_fichier_sur(nom_audio):
        supprimer_fichier(os.path.join(DOSSIER_AUDIOS, nom_audio))

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