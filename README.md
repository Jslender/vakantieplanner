# Slender vakantieplanner (v13)

Nieuw:
- Titel linksboven: **Slender vakantieplanner**
- Prikker-modus verwijderd
- JSON backup heet nu **Project opslaan (JSON)** + **Project laden (JSON)**
- Nieuw veld: **Naam van reis**
  - wordt opgeslagen in project JSON
  - komt bovenaan in de Excel export (titelregel)

Start:
```bash
npm install
npm run dev
```


## Let op bij kaart-afbeeldingen in Excel
De export maakt een screenshot van de Leaflet-kaart. Afhankelijk van je browser/OSM tile-server kan het zijn dat **kaarttegels niet in de screenshot komen** (CORS). In dat geval zie je vooral prikkers/route-lijnen.
