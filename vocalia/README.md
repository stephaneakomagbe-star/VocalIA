# VocalIA

Application de transcription audio et d’assistant vocal pour réunions et prédications.

## Lancer en local

### Backend

```bash
cd backend
python -m venv venv
venv\Scripts\activate
pip install -r requirements.txt
```

Créez `backend/.env` avec `GROQ_API_KEY=...` (ne commitez jamais ce fichier).

```bash
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

Le modèle Whisper n’est chargé qu’au premier usage de la transcription, pour que la connexion fonctionne tout de suite.

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Ouvrez l’adresse indiquée par Vite (souvent `http://localhost:5173`). En développement, les appels `/api` sont envoyés au backend `http://127.0.0.1:8000`.

Les deux services doivent tourner en même temps.

## Application Android (Capacitor)

Le téléphone ne peut pas utiliser `localhost` : cela pointe vers le téléphone, pas vers votre PC.

Le build de production utilise `https://vocalia-ud4o.onrender.com`. Pour recompiler l’APK :

```bash
cd frontend
npm run build
npx cap sync android
```

Dans l’app, vous pouvez aussi coller l’URL du serveur (Render, ou `http://VOTRE_IP_LOCALE:8000` si le backend tourne sur le PC et que le téléphone est sur le même Wi-Fi).
