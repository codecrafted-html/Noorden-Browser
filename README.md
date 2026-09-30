# Noorder Browser 2.2

Een zelfstandige desktopbrowser voor macOS en Windows, met een Chrome-achtige interface en geheugenbesparing. Dit is een ontwikkelversie, geen volledige vervanger voor alle Chrome-functies.

## Wat is nieuw?

- Afgeronde tabs en adresbalk, bladwijzerbalk en standaard donkere weergave (licht blijft instelbaar). Website-favicons verschijnen in tabs en bladwijzers; een eigen kompaslogo wordt gebruikt voor Noorder en de app.
- Startpagina met zoekfunctie en snelkoppelingen. Websites ontvangen Nederlands (België) als voorkeurstaal; Google-zoekopdrachten vragen Nederlandse resultaten uit België. Sites die je land via IP-adres, account of cookies bepalen kunnen een andere regio blijven tonen.
- Tabs openen, sluiten, verslepen, vastzetten en terughalen.
- Prestatiepagina met geladen/slapende tabs en een RAM-indicatie wanneer het besturingssysteem die beschikbaar stelt.
- Ongebruikte tabs slapen standaard na 5 minuten (2, 5, 15 of uit). Hun WebContents worden gesloten; bij activeren wordt de pagina opnieuw geladen, met herstel van de navigatiegeschiedenis.
- Lege tabs en de prestatiepagina delen de interface en krijgen geen apart web-rendererproces.
- Actieve tabs, gewijzigde invoervelden, afspelende media, downloads, vastgezette tabs, pagina’s met ingesloten frames en websites in de uitzonderingenlijst blijven wakker.
- Bladwijzers en instellingen worden lokaal bewaard. De tablijst zelf wordt niet tussen app-sessies opgeslagen.
- Website-rechten voor camera, microfoon, klembord en automatische downloads zijn per website instelbaar. Downloads tonen voortgang en kunnen worden geopend of in de map getoond.
- Geschiedenis, tabbladgroepen, zoeken op pagina, zoom, afdrukken, PDF opslaan en browsegegevens wissen. Uitgepakte extensies kunnen lokaal worden geladen voor zover Electron hun API ondersteunt.
- Nieuwe en privévensters gebruiken afzonderlijke profielen. Privégegevens worden verwijderd bij afsluiten van het privévenster.

Tijdelijke paginastatus kan na slapen verloren gaan. Detectie van invoer en media is conservatief maar kan niet elke webapp begrijpen. Gebruik **Altijd actief** voor belangrijke webapps, gesprekken of werk dat niet verloren mag gaan. Er is geen benchmark die aantoont dat Noorder minder RAM gebruikt dan Chrome. Electron heeft zelf ook een geheugenbasislast.

## Download gebruiken

### Windows (x64)

Pak het volledige Windows-zipbestand uit. Open `Noorder Browser.exe` in die map. De exe heeft de andere bestanden nodig. Deze ontwikkelbuild is niet commercieel ondertekend.

### macOS

Download de DMG voor Apple Silicon (M-chip) of Intel bij [GitHub Releases](https://github.com/codecrafted-html/Noorden-Browser/releases). Open de DMG en sleep **Noorder Browser** naar **Programma’s**. Er is geen installatiescript nodig.

Deze ontwikkelbuild is lokaal ondertekend tijdens het bouwen, maar niet met een Apple Developer ID genotariseerd. Als macOS de eerste start blokkeert, open **Systeeminstellingen → Privacy en beveiliging → Open toch**. Voor een installatie zonder deze beveiligingsmelding is een Apple Developer ID-handtekening plus notarisatie nodig. De DMG moet nog op een echte Mac van de gebruiker worden getest.

## Zelf starten en bouwen

Installeer Node.js en voer in deze map uit:

```sh
npm ci
npm start
```

Bouwen op macOS:

```sh
npm run dist:mac
```

Bouwen op Windows:

```sh
npm run dist:win
```

De repository bevat de actuele broncode. **Actions → Bouw en publiceer Noorder Browser → Run workflow** bouwt op macOS en Windows en zet beide DMG’s, het Windows-installatiebestand, de ZIP’s en de updatebestanden automatisch bij [Releases](https://github.com/codecrafted-html/Noorden-Browser/releases). Een tag zoals `v2.3.0` start dezelfde releaseworkflow. GitHub voegt automatisch een broncodearchief toe.

## Updates

Noorder controleert in een geïnstalleerde app kort na het starten en vervolgens iedere zes uur op een nieuwe GitHub-release. Nieuwe versies worden gedownload en bovenaan gemeld. Open **Instellingen → Automatische updates** om direct te controleren of om een gedownloade update met **Herstart en installeer** toe te passen. De Windows-installatie gebruikt NSIS. Gebruik voor automatische updates de installer, niet de losse Windows-ZIP.

Op Mac staat een universele ZIP naast de DMG voor het updateprotocol. De huidige Mac-app heeft nog geen Apple Developer ID-handtekening en notarisatie; macOS kan een automatische installatie weigeren. Gebruik in dat geval **Releases openen** om de nieuwe DMG zelf te installeren. Een Developer ID-handtekening en notarisatie zijn nodig om dit betrouwbaar automatisch te laten verlopen.

## Sneltoetsen

| Sneltoets | Actie |
| --- | --- |
| Ctrl/⌘ + L | Adresbalk |
| Ctrl/⌘ + T | Nieuw tabblad |
| Ctrl/⌘ + W | Tabblad sluiten |
| Ctrl/⌘ + Shift + T | Gesloten tabblad terughalen |
| Ctrl/⌘ + D | Bladwijzer aan/uit |
| Ctrl/⌘ + R | Herladen |
| Ctrl + Tab / Ctrl + Shift + Tab | Ander tabblad |
| Ctrl/⌘ + 1…9 | Naar tabblad (9 = laatste) |
| Alt + ← / → | Terug / vooruit |

Rechtermuisklik op een tabblad: vastzetten, website altijd actief houden, nu slapen, dupliceren of sluiten.

## Tests en grenzen

`npm test` controleert adresverwerking, instellingen en beschermingsregels. `tests/smoke.cjs` en `tests/features.cjs` testen de echte Electron-app via Playwright en lokale HTTP-fixtures. Hiervoor is Playwright plus een grafische omgeving nodig; in de Linux-testomgeving is Xvfb gebruikt. De sandbox-uitschakeling in dit testscript is uitsluitend voor de geïsoleerde testcontainer. De geleverde app configureert sandboxing en context-isolatie voor websites.

De testrun controleerde navigatie/terug/vooruit, bladwijzers, lichte/donkere UI, slapen/herstellen, echte toetsenbordinvoer, vastzetten, uitzonderingen en automatisch slapen. Vijf geladen web-views gingen naar nul en konden opnieuw worden geladen. OS-geheugencijfers waren in de geïsoleerde testcontainer niet betrouwbaar beschikbaar; de app toont dan geen verzonnen nulmeting. Zie `tests/test-results.json`. macOS- en Windows-bundels zijn op pakketinhoud gecontroleerd, maar nog niet op native machines gestart.

Websites krijgen geen Node.js of browser-IPC-toegang. Locatie en onbekende sitepermissies blijven standaard uitgeschakeld. Extensies worden alleen vanuit een uitgepakte lokale map geladen en Electron ondersteunt slechts een deel van de Chrome-extensie-API. De wachtwoordenoptie opent de beheerder van het besturingssysteem; er is geen ingebouwde autofill. Synchronisatie, DRM-ondersteuning en een beveiligingsreputatieservice ontbreken. Mac-updates blijven afhankelijk van een Apple Developer ID-handtekening. Google Lens opent de Lens-website; Cast naar een televisie is niet ingebouwd. Webcompatibiliteit is daardoor niet gelijk aan die van Google Chrome. Werk Electron regelmatig bij en test opnieuw voordat je dit breed distribueert.

Maker: Thijs. Gebouwd met Electron 44.4.5. App-versie 2.3.0.
