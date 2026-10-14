import argparse
import getpass
import json
import mimetypes
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid

URL_API = os.environ.get("VOCALIA_API_URL", "http://localhost:8000").rstrip("/")
FICHIER_SESSION = os.path.join(os.path.expanduser("~"), ".vocalia_cli.json")
DELAI_REQUETE = 900

AIDE = """Commandes disponibles :
  /aide                 afficher cette aide
  /nouveau              recommencer une conversation
  /lien URL             transcrire l'audio d'un lien (YouTube, etc.)
  /fichier CHEMIN       transcrire un fichier audio ou vidéo
  /traduire LANGUE      traduire la dernière transcription (ex. /traduire anglais)
  /resumer [LANGUE]     résumer la dernière transcription (français par défaut)
  /sauver               enregistrer la dernière transcription
  /enregistrer          enregistrer la conversation en cours
  /historique           afficher vos dernières transcriptions
  /deconnexion          se déconnecter
  /quitter              fermer VocalIA
Tout autre texte est envoyé à l'assistant."""


class ErreurApi(Exception):
    def __init__(self, message, statut=0):
        super().__init__(message)
        self.statut = statut


def lire_session():
    try:
        with open(FICHIER_SESSION, "r", encoding="utf-8") as f:
            return json.load(f)
    except (OSError, ValueError):
        return {}


def ecrire_session(donnees):
    with open(FICHIER_SESSION, "w", encoding="utf-8") as f:
        json.dump(donnees, f)


def effacer_session():
    try:
        os.remove(FICHIER_SESSION)
    except OSError:
        pass


def construire_multipart(champs, fichiers, limite):
    morceaux = []
    for nom, valeur in champs.items():
        morceaux.append(
            f'--{limite}\r\nContent-Disposition: form-data; name="{nom}"\r\n\r\n{valeur}\r\n'.encode("utf-8")
        )
    for nom, chemin in fichiers.items():
        type_mime = mimetypes.guess_type(chemin)[0] or "application/octet-stream"
        with open(chemin, "rb") as f:
            contenu = f.read()
        entete = (
            f'--{limite}\r\nContent-Disposition: form-data; name="{nom}"; '
            f'filename="{os.path.basename(chemin)}"\r\nContent-Type: {type_mime}\r\n\r\n'
        ).encode("utf-8")
        morceaux.append(entete + contenu + b"\r\n")
    morceaux.append(f"--{limite}--\r\n".encode("utf-8"))
    return b"".join(morceaux)


def appeler(methode, route, champs=None, fichiers=None, token=None):
    en_tetes = {}
    corps = None

    if fichiers is not None:
        limite = uuid.uuid4().hex
        corps = construire_multipart(champs or {}, fichiers, limite)
        en_tetes["Content-Type"] = f"multipart/form-data; boundary={limite}"
    elif champs is not None:
        corps = urllib.parse.urlencode(champs).encode("utf-8")
        en_tetes["Content-Type"] = "application/x-www-form-urlencoded"

    if token:
        en_tetes["Authorization"] = f"Bearer {token}"

    requete = urllib.request.Request(URL_API + route, data=corps, headers=en_tetes, method=methode)

    try:
        with urllib.request.urlopen(requete, timeout=DELAI_REQUETE) as reponse:
            return json.loads(reponse.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        try:
            message = json.loads(e.read().decode("utf-8")).get("erreur", "Erreur du serveur.")
        except Exception:
            message = "Erreur du serveur."
        raise ErreurApi(message, e.code)
    except urllib.error.URLError:
        raise ErreurApi(f"Serveur injoignable : {URL_API}")


class Client:
    def __init__(self):
        donnees = lire_session()
        self.token = donnees.get("token") if donnees.get("url") == URL_API else None
        self.historique = []
        self.derniere_transcription = ""
        self.dernier_audio = None
        self.derniere_langue = None

    def connecter(self):
        print(f"Connexion à {URL_API}")
        email = input("Email : ").strip()
        mot_de_passe = getpass.getpass("Mot de passe : ")
        reponse = appeler("POST", "/connexion", {"email": email, "mot_de_passe": mot_de_passe})
        self.token = reponse["token"]
        ecrire_session({"url": URL_API, "token": self.token, "email": email})
        print(f"Connecté{(' : ' + reponse['prenom']) if reponse.get('prenom') else ''}.")

    def requete(self, methode, route, champs=None, fichiers=None):
        if not self.token:
            self.connecter()
        try:
            return appeler(methode, route, champs, fichiers, self.token)
        except ErreurApi as e:
            if e.statut == 401 and "session" in str(e).lower():
                print("Session expirée, reconnexion nécessaire.")
                self.token = None
                self.connecter()
                return appeler(methode, route, champs, fichiers, self.token)
            raise

    def poser_question(self, message):
        reponse = self.requete(
            "POST",
            "/assistant-texte",
            {"message": message, "historique": json.dumps(self.historique)},
        )
        self.historique.append({"role": "user", "texte": message})
        self.historique.append({"role": "assistant", "texte": reponse["reponse"]})
        return reponse["reponse"]

    def attendre(self, id_travail):
        derniere_etape = ""

        while True:
            time.sleep(3)
            etat = self.requete("GET", f"/travaux/{id_travail}")

            if etat["statut"] == "en_cours":
                etape = etat.get("etape", "")
                if etape and etape != derniere_etape:
                    derniere_etape = etape
                    print(f"  {etape}")
                continue

            if etat["statut"] == "erreur":
                raise ErreurApi(etat.get("message", "Une erreur est survenue."))

            return etat

    def transcrire(self, route, champs, fichiers=None):
        champs = {**champs, "langue": "auto", "conserver_audio": "1"}
        id_travail = self.requete("POST", route, champs, fichiers)["id_travail"]
        etat = self.attendre(id_travail)
        self.derniere_transcription = etat["texte"]
        self.dernier_audio = etat.get("audio_temporaire")
        self.derniere_langue = etat.get("langue_detectee")
        if etat.get("note"):
            print(f"  {etat['note']}")
        return etat["texte"]

    def appliquer_outil(self, route, langue):
        if not self.derniere_transcription:
            raise ErreurApi("Faites d'abord une transcription avec /lien ou /fichier.")
        id_travail = self.requete(
            "POST", route, {"texte": self.derniere_transcription, "langue_cible": langue}
        )["id_travail"]
        return self.attendre(id_travail)["texte"]

    def traduire(self, langue):
        return self.appliquer_outil("/outils/traduire", langue)

    def resumer(self, langue):
        return self.appliquer_outil("/outils/resumer", langue)

    def transcrire_lien(self, url):
        return self.transcrire("/travaux/lien", {"url": url})

    def transcrire_fichier(self, chemin):
        chemin = chemin.strip().strip('"').strip("'")
        if not os.path.isfile(chemin):
            raise ErreurApi(f"Fichier introuvable : {chemin}")
        print("  Envoi du fichier…")
        return self.transcrire("/travaux/fichier", {}, {"fichier": chemin})

    def sauver_transcription(self):
        if not self.derniere_transcription:
            raise ErreurApi("Aucune transcription à enregistrer.")
        champs = {"texte": self.derniere_transcription}
        if self.dernier_audio:
            champs["audio_temporaire"] = self.dernier_audio
        self.requete("POST", "/sauvegarder", champs, {})
        self.dernier_audio = None

    def sauver_conversation(self):
        if not self.historique:
            raise ErreurApi("Aucune conversation à enregistrer.")
        self.requete("POST", "/sauvegarder-conversation", {"conversation": json.dumps(self.historique)})

    def lister_historique(self):
        reponse = self.requete("GET", "/historique")
        elements = reponse.get("transcriptions", [])[:10]
        if not elements:
            print("Aucune transcription enregistrée.")
        for element in elements:
            extrait = element["texte"].replace("\n", " ")
            print(f"- {element['date']} : {extrait[:90]}{'…' if len(extrait) > 90 else ''}")

    def deconnecter(self):
        if self.token:
            try:
                appeler("POST", "/deconnexion", {}, None, self.token)
            except ErreurApi:
                pass
        self.token = None
        effacer_session()


def traiter_commande(client, saisie):
    commande, _, argument = saisie.partition(" ")
    commande = commande.lower()
    argument = argument.strip()

    if commande in ("/quitter", "/exit"):
        return False

    if commande == "/aide":
        print(AIDE)
    elif commande == "/nouveau":
        client.historique = []
        print("Nouvelle conversation.")
    elif commande == "/lien":
        if not argument:
            print("Utilisation : /lien https://…")
        else:
            print(f"\nTranscription :\n{client.transcrire_lien(argument)}")
    elif commande == "/fichier":
        if not argument:
            print("Utilisation : /fichier C:\\chemin\\audio.mp3")
        else:
            print(f"\nTranscription :\n{client.transcrire_fichier(argument)}")
    elif commande == "/traduire":
        if not argument:
            langue = "anglais" if client.derniere_langue == "fr" else "français"
            print(f"Langue non précisée, traduction en {langue}.")
        else:
            langue = argument
        print(f"\nTraduction ({langue}) :\n{client.traduire(langue)}")
    elif commande == "/resumer":
        langue = argument or "français"
        print(f"\nRésumé ({langue}) :\n{client.resumer(langue)}")
    elif commande == "/sauver":
        client.sauver_transcription()
        print("Transcription enregistrée.")
    elif commande == "/enregistrer":
        client.sauver_conversation()
        print("Conversation enregistrée.")
    elif commande == "/historique":
        client.lister_historique()
    elif commande == "/deconnexion":
        client.deconnecter()
        print("Déconnecté.")
        return False
    else:
        print("Commande inconnue. Tapez /aide.")

    return True


def boucle(client):
    print("VocalIA en ligne de commande. Tapez /aide pour la liste des commandes.")

    while True:
        try:
            saisie = input("\nVous : ").strip()
        except (EOFError, KeyboardInterrupt):
            print()
            break

        if not saisie:
            continue

        try:
            if saisie.startswith("/"):
                if not traiter_commande(client, saisie):
                    break
            else:
                print(f"\nVocalIA : {client.poser_question(saisie)}")
        except ErreurApi as e:
            print(f"Erreur : {e}")
        except KeyboardInterrupt:
            print("\nInterrompu.")


def main():
    try:
        sys.stdout.reconfigure(encoding="utf-8")
        sys.stdin.reconfigure(encoding="utf-8")
    except (AttributeError, OSError):
        pass

    analyseur = argparse.ArgumentParser(prog="vocalia", description="VocalIA en ligne de commande")
    analyseur.add_argument("question", nargs="*", help="question à poser directement")
    analyseur.add_argument("--lien", help="transcrire l'audio d'un lien")
    analyseur.add_argument("--fichier", help="transcrire un fichier audio ou vidéo")
    arguments = analyseur.parse_args()

    client = Client()

    try:
        if arguments.lien:
            print(client.transcrire_lien(arguments.lien))
        elif arguments.fichier:
            print(client.transcrire_fichier(arguments.fichier))
        elif arguments.question:
            print(client.poser_question(" ".join(arguments.question)))
        else:
            boucle(client)
    except ErreurApi as e:
        print(f"Erreur : {e}")
        sys.exit(1)
    except KeyboardInterrupt:
        print()


if __name__ == "__main__":
    main()