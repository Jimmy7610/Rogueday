# RogueDay

**Förvandla vardagen till ett roguelike-äventyr.**

RogueDay är ett offline-RPG som gör verkliga vardagssysslor till uppdrag. Du väljer hur mycket
tid och energi du har, var du är och hur du mår — spelet delar ut riktiga uppdrag som ger XP,
guld, nivåer, loot, märken och skada på veckans boss.

Allt körs lokalt i webbläsaren. Ingen server, inget konto, ingen AI vid körning, ingen kostnad.

---

## Innehåll

- [Vad RogueDay är](#vad-rogueday-är)
- [Funktioner](#funktioner)
- [Kom igång](#kom-igång)
- [Kommandon](#kommandon)
- [Så fungerar sparfilen](#så-fungerar-sparfilen)
- [Säkerhetskopiering och återställning](#säkerhetskopiering-och-återställning)
- [PWA och offline](#pwa-och-offline)
- [Nollkostnadsarkitektur](#nollkostnadsarkitektur)
- [Projektstruktur](#projektstruktur)
- [Tester](#tester)
- [Innehållssäkerhet](#innehållssäkerhet)

---

## Vad RogueDay är

Kärnfantasin är enkel: *vardagen har invaderats, och det är dags att slå tillbaka.*

Du trycker på **HITTA ETT UPPDRAG**, väljer dina filter, och slår tärningen. Spelet ger dig tre
val — **TRYGGT**, **VILT** och **FARLIGT** — med olika sällsynthet och belöning. Du accepterar
ett, gör det på riktigt, och trycker **SLUTFÖR UPPDRAGET**.

Det är inte en att-göra-lista. Det är en roguelike där sysslorna är fienderna.

## Funktioner

| System | Beskrivning |
| --- | --- |
| **Uppdragsbibliotek** | 271 handskrivna uppdrag i 22 kategorier, med full metadata |
| **Filtrering** | Tid (5/15/30/60 min), energi, plats och sinnesstämning respekteras strikt |
| **Tre val** | Varje tärningsslag ger tre alternativ med stigande risk och belöning |
| **Sällsynthet** | Vanlig 45% · Ovanlig 28% · Sällsynt 17% · Episk 8% · Legendarisk 2% |
| **Nivåer** | 50 nivåer med stigande XP-kurva och 25 datadrivna titlar |
| **Guld och loot** | 10 föremålstyper, kistor, buffar och en väska |
| **Veckoboss** | 14 bossar i deterministisk lokal veckorotation |
| **Uppdragskedjor** | 6 flerdelade kedjor med bonus, märke och kista på slutet |
| **Dagens uppdrag** | Ett deterministiskt uppdrag per lokal kalenderdag, med bonus |
| **Kaos-läge** | 8 kaosmodifierare: förbannelser, speedruns, mysterieuppdrag, dubbel-XP-vad |
| **Slumphändelser** | 6 händelser som aldrig straffar spelaren hårt |
| **Märken** | 85 märken i 9 kategorier, varav flera hemliga |
| **Svit** | Lokala kalenderdagar, med svitsköld som skyddar en missad dag |
| **Statistik** | Fullständig och äkta — inga påhittade siffror |
| **Historik** | Överlever omladdning, omstart och stängd webbläsare |

## Kom igång

Kräver Node 18 eller senare.

```bash
npm install
npm run dev
```

Öppna adressen som skrivs ut (normalt `http://localhost:5173`).

För en produktionsbyggnad:

```bash
npm run build
npm run preview
```

Innehållet i `dist/` är helt statiskt. Lägg det på vilken statisk värd som helst — GitHub Pages,
Netlify, en USB-sticka, vad som helst. Bygget använder relativa sökvägar (`base: './'`), så det
fungerar även från en underkatalog.

## Kommandon

| Kommando | Vad det gör |
| --- | --- |
| `npm run dev` | Startar utvecklingsservern |
| `npm run build` | Typkontrollerar och bygger till `dist/` |
| `npm run preview` | Serverar den byggda appen lokalt |
| `npm run typecheck` | Kör TypeScript utan att bygga |
| `npm test` | Kör hela testsviten en gång |
| `npm run test:watch` | Kör testerna i bevakningsläge |
| `npm run icons` | Genererar PWA-ikonerna lokalt (inga beroenden) |

## Så fungerar sparfilen

Detta är projektets viktigaste system, och det är byggt för att inte gå sönder.

**Ett enda auktoritativt tillstånd.** Hela spelet lever i ett `RogueDaySave`-objekt. Varje
spelhändelse producerar ett nytt sådant objekt, som sedan skrivs via en enda modul.

**En enda modul rör lagringen.** `src/persistence/storage.ts` är den enda filen i hela
projektet som anropar `localStorage`. Det finns inga utspridda `setItem`-anrop någon annanstans
— ett test kontrollerar detta aktivt.

**Nycklar:**

```
rogueDay.save.v1        huvudsparfil
rogueDay.save.backup    säkerhetskopia
```

**Startordning vid varje sidladdning:**

1. Konstruera standardvärden
2. Läs `rogueDay.save.v1`
3. Tolka JSON
4. Validera strukturen
5. Migrera om schemaversionen är äldre
6. Fyll i saknade fält från standardvärdena
7. Sätt det auktoritativa tillståndet
8. Rendera

Standardvärden skrivs **aldrig** innan en befintlig sparfil lästs, och en laddad sparfil skrivs
**aldrig** över av standardvärden efteråt. `loadGame()` skriver ingenting alls.

**Atomisk skrivning.** Innan huvudsparfilen ersätts kopieras den föregående giltiga versionen
till backup-platsen. Om huvudsparfilen är skadad vid start återställs säkerhetskopian
automatiskt. Är båda skadade startar spelet om från början i stället för att krascha.

**Autosparning** sker efter varje meningsfull händelse: accepterat uppdrag, avklarat uppdrag,
övergivet uppdrag, omkastning, använt föremål, löst händelse, ändrad inställning, ändrat namn
och importerad sparfil. Dessutom sparas allt en sista gång när fliken stängs.

**Centrala funktioner** i `storage.ts`:

```ts
loadGame()          // läser, validerar, migrerar och slår ihop
saveGame(state)     // backup-rotation + skrivning
resetGame()         // raderar båda nycklarna
validateSave(x)     // strukturkontroll
migrateSave(x)      // schemauppgradering
exportSave(state)   // JSON + filnamn
importSave(json)    // validerad import
readDiagnostics()   // vad som faktiskt ligger i lagringen
testSaveRoundTrip() // skriv, läs tillbaka, jämför
```

## Säkerhetskopiering och återställning

Under **DATA**:

- **SÄKERHETSKOPIERA SPARFIL** laddar ner hela sparfilen som JSON, till exempel
  `rogue-day-backup-2026-09-04.json`.
- **ÅTERSTÄLL SPARFIL** låter dig välja en JSON-fil. Den valideras och migreras först, sedan
  visas en sammanfattning (nivå, XP, guld, historikposter, märken) och en varning innan den
  ersätter din nuvarande progression.
- **SPARNINGSDIAGNOSTIK** visar vad som faktiskt ligger i `localStorage` just nu — inte vad
  appen tror. **TESTA SPARNING** skriver det aktuella tillståndet, läser tillbaka det direkt
  ur lagringen, jämför XP, nivå, guld, historik, märken, boss-HP och namn, och rapporterar
  `SPARNINGSTEST GODKÄNT` eller exakt vilket fält som avvek.
- **NOLLSTÄLL ÄVENTYRET** kräver uttrycklig bekräftelse och raderar både huvudsparfilen och
  säkerhetskopian.

## PWA och offline

RogueDay är en installerbar PWA.

- `public/manifest.webmanifest` — namn, färger, `display: standalone`, ikoner i 192, 512 och
  maskable, samt SVG.
- `public/sw.js` — service worker. Navigeringar hämtas nätverk-först med cachat skal som
  reserv (så en ny version plockas upp när du är online, men spelet öppnas ändå offline).
  Allt annat serveras cache-först.
- `scripts/generate-icons.mjs` — genererar ikonerna lokalt. Den skriver PNG-filerna för hand
  med Nodes inbyggda `zlib`; inga bildbibliotek, ingen nedladdning.

Efter första besöket fungerar spelet helt utan nätverk. Inget moment i spelet kräver
uppkoppling.

Service workern registreras bara i produktionsbygget (`import.meta.env.PROD`), så
utvecklingsläget inte serverar gammal cache.

## Nollkostnadsarkitektur

RogueDay kostar 0 kr att driva. Det finns:

- ingen backend, ingen databas, ingen autentisering
- ingen AI vid körning, inga API-nycklar
- ingen analys, ingen telemetri, ingen spårning
- inga externa tjänster, inga typsnitt från CDN
- inga köp för riktiga pengar — guld är enbart spelvaluta

Körberoendena är exakt `react` och `react-dom`. All speldata, alla ikoner och alla ljud
genereras eller ingår lokalt. Ljudet skapas i webbläsaren med Web Audio API och är avstängt
som standard.

Din spelardata lämnar aldrig din enhet.

## Projektstruktur

```
src/
  app/          GameProvider, reducer, App-skalet
  components/   HUD, navigation, modaler, delade UI-delar
  data/         uppdrag, bossar, märken, loot, händelser, nivåer, kedjor
  game/         spellogik: val, XP, boss, loot, svit, märken, slutförande
  hooks/        useSound (Web Audio)
  persistence/  defaults, validering, migrering, lagring
  screens/      Uppdrag, Boss, Historik, Märken, Data, Onboarding
  styles/       tokens, bas, layout, komponenter, spel, animationer
  test/         testhjälpare och integrationstester
  types/        domäntyper
public/         manifest, service worker, ikoner
scripts/        lokal ikongenerering
```

Statiskt innehåll är skilt från spellogik. Uppdragsbiblioteket ligger i datafiler, bossar för
sig, märken för sig, lagring för sig. Det finns ingen `App.tsx` på 5000 rader.

## Tester

```bash
npm test
```

309 tester täcker bland annat:

- uppdragsfiltrering, sällsynthet och urval
- XP-beräkning och nivåprogression
- guld, loot, kistor och buffar
- bossskada och deterministisk veckorotation
- historik, statistik och märkeslåsning
- svitberäkning inklusive sköld, tidszonsbyten och årsskifte
- kedjeprogression och dagliga uppdragets stabilitet
- serialisering, laddning, migrering, backup-återställning
- JSON-export, JSON-import, skadad sparfil, nollställning
- service workerns install-, activate- och fetch-logik mot en mockad scope
- hela appen genom React Testing Library, inklusive tangentbordsnavigering

Nyckeltestet heter **`persists complete progression across full reload`** och gör exakt det
specifikationen kräver: skapar ett spel, slutför ett uppdrag, sparar, förstör tillståndet i
minnet, laddar från lagringen, verifierar XP, historik, statistik och boss-HP, slutför ett
andra uppdrag, sparar, laddar om igen och kontrollerar att **båda** historikposterna finns kvar.

## Innehållssäkerhet

Alla uppdrag är vardagliga, lagliga och ofarliga. Biblioteket innehåller inget om farlig
bilkörning, eld, vapen, olagligheter, höga höjder, extrem träning, svält, medicinering,
självskada, droger, trakasserier eller olaga intrång. Hälso- och rörelseuppdrag är milda och
alldagliga — dricka vatten, sträcka på sig, ta en promenad.

Ett automatiskt test kör hela biblioteket mot en lista med förbjudna mönster vid varje körning.

Kaos-läget är lekfullt, inte farligt: städa baklänges, gör något med fel hand, sätt en timer,
lägg telefonen i ett annat rum. Allt går att avbryta när som helst.

---

*RogueDay körs lokalt, sparar lokalt och tillhör dig.*
