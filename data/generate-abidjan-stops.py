#!/usr/bin/env python3
"""Genere data/abidjan-stops.json — jeu de donnees de test du pilote Abidjan.

Roadmap Phase 0.5 : 60 points de livraison realistes repartis sur Plateau,
Cocody, Marcory, Yopougon et Treichville, avec adressage informel.

Les coordonnees sont saisies a la main a partir de reperes reels d'Abidjan ;
les attributs logistiques (poids, volume, duree de service, fenetres horaires)
sont derives d'un generateur seede, donc reproductibles a l'identique.

Usage : python data/generate-abidjan-stops.py
"""

from __future__ import annotations

import json
import random
from pathlib import Path

SEED = 42
OUTPUT = Path(__file__).parent / "abidjan-stops.json"

# (label, commune, lat, lon, adresse texte, description informelle, repere)
STOPS: list[tuple[str, str, float, float, str, str, str]] = [
    # ------------------------------------------------------------------ Plateau
    ("Pharmacie du Plateau", "Plateau", 5.3251, -4.0212,
     "Avenue Chardy, Plateau",
     "Rez-de-chaussee de l'immeuble creme, entre la banque et le kiosque a cafe",
     "Avenue Chardy"),
    ("Boutique Tour F", "Plateau", 5.3268, -4.0224,
     "Tour F, Cite Administrative, Plateau",
     "Entree cote parking, demander l'agent de securite du hall B",
     "Cite Administrative"),
    ("Restaurant Le Bafing", "Plateau", 5.3240, -4.0196,
     "Place de la Republique, Plateau",
     "En face de la fontaine, terrasse bleue au premier etage",
     "Place de la Republique"),
    ("Cabinet Kouassi et Associes", "Plateau", 5.3247, -4.0208,
     "Immeuble CCIA, Plateau",
     "12e etage, se signaler a l'accueil avec le nom du cabinet",
     "Immeuble CCIA"),
    ("Kiosque Rue du Commerce", "Plateau", 5.3199, -4.0205,
     "Rue du Commerce, Plateau",
     "Trottoir cote pair, juste apres la librairie, parasol rouge",
     "Rue du Commerce"),
    ("Agence Voyages Chardy", "Plateau", 5.3232, -4.0177,
     "Marche du Plateau, Plateau",
     "Angle du marche, portail metallique vert, sonner deux fois",
     "Marche du Plateau"),
    ("Hotel Tiama - reception", "Plateau", 5.3241, -4.0222,
     "Boulevard de la Republique, Plateau",
     "Livrer a la conciergerie, ne pas passer par le parking souterrain",
     "Hotel Tiama"),
    ("Clinique Saint Paul", "Plateau", 5.3244, -4.0143,
     "Pres de la Cathedrale Saint-Paul, Plateau",
     "Petite rue derriere la cathedrale, batiment blanc a deux niveaux",
     "Cathedrale Saint-Paul"),
    ("Bureau Angoulvant", "Plateau", 5.3298, -4.0181,
     "Boulevard Angoulvant, Plateau",
     "Immeuble avec fresque murale, 3e porte apres le feu tricolore",
     "Boulevard Angoulvant"),
    ("Superette Gare Sud", "Plateau", 5.3171, -4.0207,
     "Gare lagunaire de Gare Sud, Plateau",
     "A 50 m de l'embarcadere des bateaux-bus, enseigne jaune",
     "Gare Sud"),

    # ------------------------------------------------------------------- Cocody
    ("Pharmacie Saint Jean", "Cocody", 5.3457, -3.9958,
     "Carrefour Saint Jean, Cocody",
     "En face de la station-service, portail bleu a cote du maquis",
     "Carrefour Saint Jean"),
    ("Residence Danga - Villa 12", "Cocody", 5.3402, -3.9998,
     "Cite Danga, Cocody",
     "Entrer par la 2e barriere, villa 12 au fond de l'impasse, chien attache",
     "Cite Danga"),
    ("Sococe II Plateaux", "Cocody", 5.3672, -3.9964,
     "Centre commercial Sococe, II Plateaux",
     "Quai de livraison a l'arriere du centre, badge visiteur obligatoire",
     "Sococe"),
    ("Boulangerie Vallon", "Cocody", 5.3676, -3.9953,
     "Vallon, II Plateaux, Cocody",
     "Descendre la rue du Vallon, boulangerie a l'angle apres le lavage auto",
     "Vallon"),
    ("Bureau Rue Mercedes", "Cocody", 5.3691, -3.9908,
     "Rue Mercedes, II Plateaux, Cocody",
     "Immeuble R+3 avec parking en pave, 1er etage porte gauche",
     "Rue Mercedes"),
    ("Ecole Angre 8e tranche", "Cocody", 5.3988, -3.9843,
     "Angre 8e tranche, Cocody",
     "Apres le chateau d'eau, grand portail vert, livrer au bureau du surveillant",
     "Chateau d'eau d'Angre"),
    ("Maquis Carrefour Duncan", "Cocody", 5.3583, -3.9946,
     "Carrefour Duncan, II Plateaux, Cocody",
     "Sous les paillotes cote gauche du carrefour, demander le gerant",
     "Carrefour Duncan"),
    ("Riviera 2 - Immeuble Palmier", "Cocody", 5.3521, -3.9663,
     "Riviera 2, Cocody",
     "Face au terrain de foot, immeuble beige, appartement B4",
     "Terrain de foot Riviera 2"),
    ("Supermarche Riviera 3", "Cocody", 5.3612, -3.9558,
     "Riviera 3, Cocody",
     "Livraison par la rampe laterale, eviter l'entree clients apres 17h",
     "Riviera 3"),
    ("Residence Palmeraie", "Cocody", 5.3688, -3.9531,
     "La Palmeraie, Cocody",
     "Rue non bitumee apres la mosquee, 4e villa a droite, mur ocre",
     "Mosquee de la Palmeraie"),
    ("Cabinet dentaire Bonoumin", "Cocody", 5.3659, -3.9642,
     "Bonoumin, Cocody",
     "Au-dessus de la pharmacie, escalier exterieur cote rue",
     "Pharmacie de Bonoumin"),
    ("CHU de Cocody - magasin", "Cocody", 5.3452, -4.0087,
     "CHU de Cocody, Cocody",
     "Entree logistique cote nord, ne pas utiliser l'entree des urgences",
     "CHU de Cocody"),
    ("Cite universitaire FHB", "Cocody", 5.3479, -4.0041,
     "Universite Felix Houphouet-Boigny, Cocody",
     "Batiment C, remettre au concierge si l'etudiant est absent",
     "Universite FHB"),
    ("Attoban - Villa 27", "Cocody", 5.3579, -3.9884,
     "Attoban, Cocody",
     "Apres le carrefour, prendre la voie en terre, villa au portail rouille",
     "Carrefour Attoban"),
    ("Boutique Blockhauss", "Cocody", 5.3312, -4.0021,
     "Blockhauss, Cocody",
     "Cote lagune, en face du depot de bois, enseigne peinte a la main",
     "Depot de bois Blockhauss"),

    # ------------------------------------------------------------------ Marcory
    ("Cap Sud - Espace boutique", "Marcory", 5.2957, -3.9952,
     "Centre commercial Cap Sud, Marcory",
     "Quai de livraison au sous-sol, hauteur limitee a 2,5 m",
     "Cap Sud"),
    ("Restaurant Zone 4C", "Marcory", 5.2871, -3.9931,
     "Rue Paul Langevin, Zone 4, Marcory",
     "Entre le pressing et l'agence de transfert d'argent, store vert",
     "Rue Paul Langevin"),
    ("Garage Bietry", "Marcory", 5.2792, -3.9819,
     "Bietry, Marcory",
     "Apres le pont, premiere voie a droite, hangar en tole bleue",
     "Pont de Bietry"),
    ("Pharmacie Marcory Residentiel", "Marcory", 5.2987, -3.9947,
     "Marcory Residentiel, Marcory",
     "A l'angle de la rue du Canal, croix verte visible depuis le boulevard",
     "Rue du Canal"),
    ("Depot Anoumabo", "Marcory", 5.2963, -4.0003,
     "Anoumabo, Marcory",
     "Ruelle etroite, laisser la moto a l'entree, magasin au fond a gauche",
     "Marche d'Anoumabo"),
    ("Boutique Remblais", "Marcory", 5.2903, -3.9884,
     "Les Remblais, Marcory",
     "En face du terrain vague, conteneur amenage peint en blanc",
     "Les Remblais"),
    ("Bureau Chevalier de Clieu", "Marcory", 5.2846, -3.9917,
     "Rue Chevalier de Clieu, Zone 4, Marcory",
     "Immeuble avec grille noire, interphone appartement 3",
     "Zone 4"),
    ("Cite Sicogi Marcory", "Marcory", 5.2932, -3.9908,
     "Cite Sicogi, Marcory",
     "Bloc D, escalier 2, 4e etage, pas d'ascenseur",
     "Cite Sicogi"),
    ("Marche de Marcory - etal 44", "Marcory", 5.2986, -3.9987,
     "Marche de Marcory, Marcory",
     "Allee des tissus, etal 44, demander Tantie Adjoua",
     "Marche de Marcory"),
    ("Clinique Zone 4", "Marcory", 5.2856, -3.9958,
     "Boulevard Valery Giscard d'Estaing, Zone 4, Marcory",
     "Entree du personnel sur le cote, sonnette au portail coulissant",
     "Boulevard VGE"),
    ("Entrepot Route de Koumassi", "Marcory", 5.2905, -3.9791,
     "Route de Koumassi, Marcory",
     "Grand hangar apres le pont, quai numero 3",
     "Route de Koumassi"),
    ("Superette Bietry Plage", "Marcory", 5.2764, -3.9848,
     "Bietry, Marcory",
     "Derniere rue avant la lagune, portail beige avec bougainvillier",
     "Lagune Ebrie"),

    # -------------------------------------------------------------- Treichville
    ("Marche de Treichville - etal 12", "Treichville", 5.2957, -4.0136,
     "Grand marche de Treichville, Treichville",
     "Entree cote avenue 8, etal 12 dans l'allee des cosmetiques",
     "Grand marche de Treichville"),
    ("Boutique Avenue 16", "Treichville", 5.2942, -4.0083,
     "Avenue 16, Treichville",
     "Entre la rue 21 et la rue 23, rideau metallique vert",
     "Avenue 16"),
    ("Restaurant Rue 12", "Treichville", 5.2967, -4.0102,
     "Rue 12, Treichville",
     "Maquis a ciel ouvert, demander le patron apres 11h",
     "Rue 12"),
    ("Palais des Sports - loge", "Treichville", 5.2988, -4.0092,
     "Palais des Sports, Treichville",
     "Loge de la securite a l'entree nord, laisser une piece d'identite",
     "Palais des Sports"),
    ("CHU de Treichville - pharmacie", "Treichville", 5.2983, -4.0168,
     "CHU de Treichville, Treichville",
     "Batiment de la pharmacie centrale, guichet des livraisons",
     "CHU de Treichville"),
    ("Atelier Arras", "Treichville", 5.2928, -4.0053,
     "Quartier Arras, Treichville",
     "Cour commune, 2e porte a droite, atelier de couture",
     "Arras"),
    ("Boutique Biafra", "Treichville", 5.2986, -4.0041,
     "Quartier Biafra, Treichville",
     "Face a l'ecole primaire, boutique avec auvent raye",
     "Ecole primaire Biafra"),
    ("Cite Habitat Treichville", "Treichville", 5.2933, -4.0114,
     "Cite Habitat, Treichville",
     "Immeuble 7, appel obligatoire avant d'arriver, gardien absent le midi",
     "Cite Habitat"),
    ("Depot zone portuaire", "Treichville", 5.2894, -4.0203,
     "Zone portuaire, Treichville",
     "Badge portuaire exige au poste de controle, quai C",
     "Port autonome d'Abidjan"),
    ("Kiosque Rue 38", "Treichville", 5.2903, -4.0062,
     "Rue 38, Treichville",
     "Sous le grand manguier, kiosque a cafe ouvert des 6h",
     "Rue 38"),
    ("Boutique Avenue 21", "Treichville", 5.3007, -4.0119,
     "Avenue 21, Treichville",
     "Pres du carrefour anime, devanture peinte en orange",
     "Avenue 21"),

    # ----------------------------------------------------------------- Yopougon
    ("Pharmacie Siporex", "Yopougon", 5.3392, -4.0869,
     "Siporex, Yopougon",
     "Face a l'arret de gbaka, croix verte au-dessus de la boutique",
     "Arret de gbaka Siporex"),
    ("Boutique Toit Rouge", "Yopougon", 5.3407, -4.0713,
     "Toit Rouge, Yopougon",
     "Apres le carrefour, allee de terre, maison au toit rouge",
     "Carrefour Toit Rouge"),
    ("Maquis Selmer", "Yopougon", 5.3352, -4.0788,
     "Selmer, Yopougon",
     "Rue animee le soir, maquis avec enceintes a l'entree",
     "Selmer"),
    ("Cite Niangon Sud", "Yopougon", 5.3302, -4.0967,
     "Niangon Sud, Yopougon",
     "Bloc 14, sonner au portail vert, cour partagee",
     "Niangon Sud"),
    ("Ecole Niangon Nord", "Yopougon", 5.3468, -4.0898,
     "Niangon Nord, Yopougon",
     "Grand mur peint en blanc, livrer au secretariat avant 15h",
     "Niangon Nord"),
    ("Superette Ananeraie", "Yopougon", 5.3451, -4.0669,
     "Ananeraie, Yopougon",
     "En face du chateau d'eau, rideau bleu, ouvre a 8h",
     "Chateau d'eau Ananeraie"),
    ("Boutique Sideci", "Yopougon", 5.3557, -4.0782,
     "Sideci, Yopougon",
     "3e rue apres la pharmacie, boutique d'angle avec congelateur dehors",
     "Sideci"),
    ("Depot Gesco", "Yopougon", 5.3697, -4.1032,
     "Gesco, Yopougon",
     "Pres de la gare routiere, hangar avec portail coulissant rouille",
     "Gare routiere de Gesco"),
    ("Atelier Wassakara", "Yopougon", 5.3463, -4.0748,
     "Wassakara, Yopougon",
     "Voie non bitumee, atelier de soudure, bruit reconnaissable",
     "Wassakara"),
    ("Boutique Maroc", "Yopougon", 5.3257, -4.0757,
     "Quartier Maroc, Yopougon",
     "Ruelle derriere le marche, devanture bleue, demander Ibrahim",
     "Marche de Yopougon"),
    ("Cite Andokoi", "Yopougon", 5.3612, -4.0857,
     "Andokoi, Yopougon",
     "Entrer par la voie du dispensaire, villa 8, portail sans numero",
     "Dispensaire d'Andokoi"),
    ("Clinique Banco 2", "Yopougon", 5.3558, -4.0607,
     "Banco 2, Yopougon",
     "Route de la foret du Banco, batiment jaune a gauche apres le virage",
     "Foret du Banco"),
]

DEPOTS = [
    {
        "id": "DEP-01",
        "label": "Entrepot SIRA Zone 4",
        "commune": "Marcory",
        "lat": 5.2866,
        "lon": -3.9946,
        "addressText": "Zone industrielle de Zone 4C, Marcory",
        "openFrom": "06:30",
        "openUntil": "19:00",
    },
    {
        "id": "DEP-02",
        "label": "Hub Yopougon Siporex",
        "commune": "Yopougon",
        "lat": 5.3396,
        "lon": -4.0861,
        "addressText": "Siporex, en face de la station, Yopougon",
        "openFrom": "07:00",
        "openUntil": "18:00",
    },
]

# Fenetres horaires plausibles pour la livraison urbaine (env. 1 arret sur 3).
TIME_WINDOWS = [
    {"start": "08:00", "end": "11:00"},
    {"start": "09:00", "end": "12:00"},
    {"start": "10:00", "end": "13:00"},
    {"start": "12:00", "end": "15:00"},
    {"start": "14:00", "end": "17:00"},
    {"start": "15:00", "end": "18:00"},
]

MOBILE_PREFIXES = ["01", "05", "07"]  # Moov, MTN, Orange


def build() -> dict:
    rng = random.Random(SEED)
    stops = []

    for index, entry in enumerate(STOPS, start=1):
        label, commune, lat, lon, address, informal, landmark = entry

        # Colis type e-commerce / restauration : majorite legere, quelques lourds.
        load_kg = rng.choice([0.5, 1.2, 2.0, 3.5, 5.0, 8.0, 12.0, 18.0, 25.0])
        volume_l = round(load_kg * rng.uniform(2.5, 4.5), 1)
        service_minutes = rng.choice([3, 4, 5, 5, 6, 8, 10])
        national_number = rng.randint(0, 99999999)
        phone = "+225" + rng.choice(MOBILE_PREFIXES) + str(national_number).zfill(8)

        stops.append(
            {
                "id": "STP-" + str(index).zfill(3),
                "label": label,
                "commune": commune,
                "lat": lat,
                "lon": lon,
                "addressText": address,
                "informalDescription": informal,
                "landmark": landmark,
                "contactPhone": phone,
                "timeWindow": rng.choice(TIME_WINDOWS) if index % 3 == 0 else None,
                "loadKg": load_kg,
                "volumeL": volume_l,
                "serviceMinutes": service_minutes,
                "priority": "high" if index % 10 == 0 else "normal",
            }
        )

    return {
        "version": "1.0.0",
        "generatedAt": "2026-08-20",
        "city": "Abidjan",
        "country": "CI",
        "crs": "EPSG:4326",
        "notes": (
            "Jeu de donnees de test du pilote Abidjan (roadmap Phase 0.5). "
            "Coordonnees approximatives saisies a la main a partir de reperes reels ; "
            "les contacts telephoniques sont fictifs. "
            "Regenerer avec : python data/generate-abidjan-stops.py"
        ),
        "depots": DEPOTS,
        "stops": stops,
    }


def main() -> None:
    dataset = build()
    count = len(dataset["stops"])
    if count != 60:
        raise SystemExit("60 arrets attendus, " + str(count) + " obtenus")

    OUTPUT.write_text(json.dumps(dataset, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    communes: dict[str, int] = {}
    for stop in dataset["stops"]:
        communes[stop["commune"]] = communes.get(stop["commune"], 0) + 1

    print("Ecrit " + str(OUTPUT))
    print(str(count) + " arrets, " + str(len(dataset["depots"])) + " depots")
    for commune in sorted(communes):
        print("  " + commune.ljust(12) + str(communes[commune]))


if __name__ == "__main__":
    main()
