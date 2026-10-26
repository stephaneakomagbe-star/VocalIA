import os
import sqlite3
import sys

import main

TABLES = {
    "users": ["id", "email", "password_hash", "salt", "prenom", "nom", "telephone", "google_id"],
    "transcriptions": ["id", "user_id", "date", "texte", "audio_fichier"],
    "conversations": ["id", "user_id", "date", "messages"],
}


def colonnes_existantes(source, table):
    return {ligne[1] for ligne in source.execute(f"PRAGMA table_info({table})").fetchall()}


def migrer():
    if not main.UTILISE_POSTGRES:
        print("DATABASE_URL est absent ou invalide dans le fichier .env. Ajoutez-le puis relancez ce script.")
        return 1

    chemin = "vocalia.db"
    if not os.path.isfile(chemin):
        print("Fichier vocalia.db introuvable. Lancez ce script depuis le dossier backend.")
        return 1

    main.init_db()
    source = sqlite3.connect(chemin)
    destination = main.get_db()

    try:
        deja = destination.execute("SELECT COUNT(*) FROM users").fetchone()[0]
        if deja > 0:
            print(
                f"La base PostgreSQL contient déjà {deja} compte(s). "
                "Migration annulée pour ne pas mélanger les données de plusieurs personnes."
            )
            return 1

        for table, colonnes in TABLES.items():
            existantes = colonnes_existantes(source, table)
            if not existantes:
                print(f"{table} : table absente, ignorée.")
                continue

            selection = ", ".join(c if c in existantes else "NULL" for c in colonnes)
            lignes = source.execute(f"SELECT {selection} FROM {table} ORDER BY id").fetchall()

            liste = ", ".join(colonnes)
            marqueurs = ", ".join("?" for _ in colonnes)
            for ligne in lignes:
                destination.execute(
                    f"INSERT INTO {table} ({liste}) VALUES ({marqueurs}) ON CONFLICT DO NOTHING",
                    ligne,
                )
            destination.commit()
            print(f"{table} : {len(lignes)} ligne(s) copiée(s).")

        for table in TABLES:
            destination.execute(
                f"SELECT setval(pg_get_serial_sequence('{table}', 'id'), "
                f"COALESCE((SELECT MAX(id) FROM {table}), 1), (SELECT COUNT(*) FROM {table}) > 0)"
            )
        destination.commit()
    finally:
        source.close()
        destination.close()

    print("Migration terminée. Les connexions en cours devront se reconnecter.")
    return 0


if __name__ == "__main__":
    sys.exit(migrer())