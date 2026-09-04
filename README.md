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
- [CI](#ci)
- [Publicering](#publicering)
- [Innehållssäkerhet](#innehållssäkerhet)

Djupsystemen i V2 — tier-utmaningar, fokustimer, marknad, förmågor, bosstaktik
och belöningsspecifikationen — beskrivs i [docs/v2.md](docs/v2.md).

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
| **Nivåer** | 50 nivåer, 25 datadrivna titlar, förmågeval var femte nivå |
| **Guld och loot** | 10 föremålstyper, kistor, buffar och en väska |
| **Veckoboss** | 14 bossar med svagheter, faser och balanserad HP |
| **Uppdragskedjor** | 6 flerdelade kedjor med bonus, märke och kista på slutet |
| **Dagens uppdrag** | Ett deterministiskt uppdrag per lokal kalenderdag, med bonus |
| **Kaos-läge** | 8 kaosmodifierare: förbannelser, speedruns, mysterieuppdrag, dubbel-XP-vad |
| **Slumphändelser** | 6 händelser som aldrig straffar spelaren hårt |
| **Märken** | 85 märken i 9 kategorier, varav flera hemliga |
| **Svit** | Lokala kalenderdagar, med svitsköld som skyddar en missad dag |
| **Statistik** | Fullständig och äkta — inga påhittade siffror |
| **Historik** | Överlever omladdning, omstart och stängd webbläsare |
| **Tier-utmaningar** | 17 utmaningar som gör VILT och FARLIGT till verkligt olika spelsätt |
| **Fokustimer** | Valfri, byggd på riktiga tidsstämplar — straffar aldrig |
| **Marknad** | Deterministiskt dagligt utbud att spendera guld på |
| **Förmågor** | 30 milstolpeförmågor i tre teman |
| **Bosstaktik** | Svagheter, motstånd och fasrepliker per boss |
| **Belöningsspecifikation** | Varje XP och guldmynt redovisas post för post |

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

Nycklarna är oförändrade sedan 1.0. Schemat är version 2; en sparfil från
version 1 migreras automatiskt vid inläsning utan att förlora någonting. Se
[docs/v2.md](docs/v2.md#sparfil-v1--v2).

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
  data/         uppdrag, bossar, märken, loot, händelser, nivåer, kedjor,
                utmaningar, förmågor
  game/         spellogik: val, XP, boss, loot, svit, märken, slutförande,
                marknad, förmågor, fokustimer
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

430 tester täcker bland annat:

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
- hårda filter som aldrig får tummas på (tid, energi, plats)
- tier-utmaningar och att en riskabel nivå aldrig är värd mindre än en trygg
- fokustimerns tidsstämpelmatematik, paus, återupptagning och omstart
- marknadens deterministiska dagsutbud, köp, slutsålda varor och rabatter
- förmågor: upplåsning, val, validering och faktisk effekt
- bossars svagheter, motstånd och att varje fas utlöses exakt en gång
- bossbalans genom simulerad veckospelning
- att belöningsposterna summerar till exakt den ändring som sker
- migrering v1 → v2 mot en komplett v1-sparfil
- hela appen genom React Testing Library, inklusive tangentbordsnavigering

Nyckeltestet heter **`persists complete progression across full reload`** och gör exakt det
specifikationen kräver: skapar ett spel, slutför ett uppdrag, sparar, förstör tillståndet i
minnet, laddar från lagringen, verifierar XP, historik, statistik och boss-HP, slutför ett
andra uppdrag, sparar, laddar om igen och kontrollerar att **båda** historikposterna finns kvar.

## CI

`.github/workflows/ci.yml` körs vid push och pull request mot `main` och kör
`npm ci`, `npm run typecheck`, `npm test` och `npm run build` på Node 22. Den
kontrollerar också att bygget producerar de statiska filerna en publicering
behöver. Ingen deploy sker automatiskt.

## Publicering

Adress när publiceringen är aktiverad:
**https://jimmy7610.github.io/Rogueday/**

Publiceringen sker automatiskt. Varje push till `main` kör
`.github/workflows/pages.yml`, som typkontrollerar, testar och bygger projektet
och därefter publicerar innehållet i `dist/` till GitHub Pages. Misslyckas något
steg publiceras ingenting, och den tidigare versionen ligger kvar.

### Engångsinställning

GitHub Pages måste slås på en gång per repo innan arbetsflödet kan publicera:

**Settings → Pages → Build and deployment → Source → `GitHub Actions`**

Utan den inställningen stannar arbetsflödet på steget *Configure Pages*. Bygget
och testerna körs ändå, så ingenting trasigt hinner publiceras. När den är på
räcker det att köra om arbetsflödet (Actions → *Deploy to GitHub Pages* →
*Re-run all jobs*) eller pusha på nytt.

Bygget använder relativ bas (`base: './'` i `vite.config.ts`), så alla resurser
begärs från `/Rogueday/` i stället för domänens rot. Det gäller även manifestet,
ikonerna och service workern, vars scope därmed stannar inom projektets sökväg.
`src/test/pages.test.ts` låser fast det, och arbetsflödet kontrollerar dessutom
det byggda resultatet innan något publiceras.

Spelardata påverkas inte av publiceringen. Sparfilen ligger i `localStorage` för
det ursprung sidan körs på, så en lokal utvecklingskopia och den publicerade
versionen har varsin sparfil.

Behöver du bygga och granska exakt det som publiceras:

```bash
npm run build
npm run preview
```

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
