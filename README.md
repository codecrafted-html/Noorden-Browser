# Noorder Browser

Noorder voor macOS is gebaseerd op de volledige [Search-broncode van Office Commun](https://github.com/driceroland/Search). Het is een native WebKit-browser met verticale of horizontale tabs, gesplitste weergave, leesmodus, advertentieblokkering en slapende tabs. Noorder voor Windows gebruikt Electron en biedt de vertrouwde Noorder-functies, met de tabbladen standaard links. De macOS-specifieke functies zijn niet naar Windows geport.

## Installeren

[Download de nieuwste release](https://github.com/codecrafted-html/Noorden-Browser/releases/latest).

| Platform | Bestand | Installatie |
| --- | --- | --- |
| Mac met M-chip, macOS 14+ | macOS-arm64.pkg of .dmg | Open het pakket of sleep de app naar Programma’s. |
| Mac met Intel, macOS 14+ | macOS-x86_64.pkg of .dmg | Open het pakket of sleep de app naar Programma’s. |
| Windows x64 | Setup.exe | Voer de installer uit; de losse ZIP is ook beschikbaar. |

De eerste overstap van Electron 2.x naar de native Mac-app gebeurt handmatig. Sluit Noorder eerst. De nieuwe Mac-versie heeft een eigen profiel en importeert het oude profiel niet automatisch. De Mac-app controleert bij het openen en elk uur op nieuwe releases. Gebruik **Settings → About → Check now**; een gevonden update opent de downloadpagina. Het app-pakket is ad hoc ondertekend; de installers zijn niet genotariseerd. Zonder eigen Apple-profiel werken iCloud-sync en de voorbehouden passkeyfuncties niet. De Windows-installer ondersteunt de bestaande in-app updater.

## Bouwen

- Mac: Xcode met de macOS 26 SDK, Swift en Node.js. In een Git-checkout: `npm run dist:mac`. Dit maakt de DMG, PKG en ZIP in `dist/`.
- Windows: `npm ci`, `npm test`, `npm start`. `npm run dist:win` bouwt de installer.
- De GitHub-workflow bouwt beide Mac-architecturen en Windows en publiceert de bestanden samen.

## Herkomst en onderhoud

De map [macos/](macos/) bevat de volledige upstream Git-tree van commit [0db0202](https://github.com/driceroland/Search/commit/0db020253422154dad4b11d603a7d426d8ad2271), Search 1.0.17, inclusief tests, prototype, engine, tools en [MIT-licentie](macos/LICENSE). `scripts/build-macos.sh` past `scripts/noorder-macos.patch` op een tijdelijke kopie toe. Zo zijn de Noorder-wijzigingen apart te beoordelen. Het licentiebestand wordt ook in de Mac-app meegeleverd. Noorder: Thijs. Search: © 2026 Office Commun.
