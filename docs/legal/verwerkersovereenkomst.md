# Verwerkersovereenkomst Klasbak

<!-- Bron: deze repository. Pas dit document aan in dezelfde wijziging die de verwerking van persoonsgegevens verandert (zie CLAUDE.md, "Legal documents"). -->

Versie van 24 november 2026.

Deze overeenkomst legt vast hoe ITRW als verwerker persoonsgegevens verwerkt voor de school wanneer het Klasbak levert, de software voor scholen, zoals artikel 28 van de AVG (GDPR) vereist. Het is een ontwerp: velden tussen \[haken\] vult u in, en de DPO van de school of een jurist leest het na vóór ondertekening.

## Artikel 1 – Partijen

**De verwerkingsverantwoordelijke:** \[naam van de school of het schoolbestuur\], met zetel te \[adres\], ondernemingsnummer \[nummer\], vertegenwoordigd door \[naam, functie\]. Hierna: _de school_.

**De verwerker:** InTheRealWorld BV, besloten vennootschap, met zetel te Burgemeester Van Ackerwijk A 39, 9240 Zele, ondernemingsnummer en btw-nummer BE 0729.814.043, vertegenwoordigd door \[naam, functie\]. Hierna: _ITRW_.

De school bepaalt waarom en waarvoor persoonsgegevens worden verwerkt, en op welke rechtsgrond. ITRW verwerkt ze alleen om Klasbak te leveren.

## Artikel 2 – Onderwerp en duur

ITRW levert de school Klasbak, online software voor scholen die uit modules bestaat. De schoolbibliotheek is er altijd: catalogus, uitleenbalie, lezersbeheer, etiketten en lezerskaarten. Welke andere modules de school gebruikt, zet ze zelf aan in de instellingen. Daarvoor host ITRW de software en de gegevens, houdt ze beschikbaar en veilig, en lost problemen op.

Zet de school de module Materiaal aan, dan levert ITRW ook een overzicht van het materiaal van de school, zoals Chromebooks, tablets en opladers: wat er is, waar het staat en, als de school dat wil, aan welke leerling of leerkracht een toestel is uitgegeven. Zolang de school de module niet aanzet, verwerkt ITRW daarvoor geen persoonsgegevens.

Zet de school de module Schoolfoto’s aan, dan levert ITRW ook een platform om schoolfoto’s op te laden, aan leerlingen te koppelen en aan ouders te bezorgen. De school, of een fotograaf die zij inhuurt, neemt de foto’s; ouders downloaden de originele bestanden met een persoonlijke code. Zolang de school de module niet aanzet, verwerkt ITRW geen foto’s.

Deze overeenkomst geldt zolang ITRW Klasbak voor de school levert. Ze eindigt automatisch wanneer die dienstverlening stopt; artikel 11 regelt wat er dan met de gegevens gebeurt.

Bij strijdigheid met andere afspraken tussen partijen gaat deze overeenkomst voor wat de bescherming van persoonsgegevens betreft.

## Artikel 3 – Welke gegevens, van wie, waarvoor en hoe lang

ITRW verwerkt alleen de gegevens hieronder, alleen voor het doel dat erbij staat. Er worden geen bijzondere categorieën van gegevens verwerkt (zoals gezondheid of afkomst), geen geboortedatum of adres, en er gebeurt geen profilering, tracking of gezichtsherkenning. Foto’s van leerlingen worden alleen verwerkt als de school de module Schoolfoto’s gebruikt, zoals hieronder beschreven.

| Betrokkenen                                                                                 | Gegevens                                                                                                                                                                                                                                             | Doel                                                                                          | Bewaartermijn                                                                                                                                                                                                                                            |
| ------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Lezers: leerlingen en leerkrachten                                                          | Voornaam, achternaam, klas, soort lezer, kaartnummer, actief of niet; optioneel een e-mailadres                                                                                                                                                      | Boeken uitlenen en terugvragen, lezerskaarten maken                                           | Tot de school de lezer verwijdert                                                                                                                                                                                                                        |
| Lezers                                                                                      | Leesgeschiedenis: welk boek, uitleen- en terugbrengdatum, verlengingen                                                                                                                                                                               | Uitleningen opvolgen, te laat ingeleverde boeken terugvragen                                  | Lopende uitleningen: tot het boek terug is. Daarna automatisch gewist na een termijn die de school instelt (standaard 365 dagen); alleen anonieme maandtotalen blijven                                                                                   |
| Lezers, alleen met de module Materiaal                                                      | Welk toestel iemand kreeg (soort, merk en model, label, serienummer), sinds wanneer, optioneel tot wanneer, en wanneer en in welke staat het terugkwam                                                                                               | Bijhouden wie welk materiaal van de school heeft en het terugvragen                           | Zolang het toestel uitgegeven is. Daarna automatisch gewist na dezelfde termijn als de leesgeschiedenis (standaard 365 dagen)                                                                                                                            |
| Leerlingen (en leerkrachten) op een fotodag, alleen met de module Schoolfoto’s              | Schoolfoto’s (portretten en klasfoto’s), gekoppeld aan naam en klas; per fotodag of de leerling niet gefotografeerd mag worden; een downloadcode per leerling. Locatie- en cameragegevens (EXIF, GPS) worden vóór het opladen uit de foto verwijderd | Schoolfoto’s nemen, sorteren en de originele bestanden aan de ouders van de leerling bezorgen | Tot de einddatum die de school per fotodag kiest (standaard 30 dagen, ten laatste 31 augustus van het schooljaar van de foto’s); de nacht erna automatisch gewist, samen met de codes. Een fotodag die de school verwijdert, wordt dezelfde nacht gewist |
| Medewerkers van de school: beheerders, bibliothecarissen, materiaalbeheerders en fotografen | Naam, gebruikersnaam, optioneel e-mailadres, rol, tweestapsverificatie aan of uit; het wachtwoord alleen als versleutelde hash                                                                                                                       | Aanmelden en toegang beperken tot wie bevoegd is                                              | Tot de school het account verwijdert                                                                                                                                                                                                                     |
| Medewerkers                                                                                 | Wijzigingslogboek: wie wat wijzigde en wanneer (alleen veldnamen, geen inhoud)                                                                                                                                                                       | Verantwoording en fouten opsporen                                                             | 2 jaar, daarna automatisch gewist                                                                                                                                                                                                                        |
| Alle gebruikers                                                                             | Technische logbestanden: tijdstip, gevraagde functie, resultaat. Zonder IP-adres, namen of zoekopdrachten                                                                                                                                            | Storingen opsporen en de dienst beveiligen                                                    | 30 dagen                                                                                                                                                                                                                                                 |

Backups van de database bestaan 35 dagen; wat gewist is, verdwijnt dus uiterlijk na 35 dagen ook uit de backups. Schoolfoto’s staan niet in de backups: een gewiste foto is meteen weg. Deze termijnen gelden tenzij de school schriftelijk iets anders vraagt.

## Artikel 4 – Verplichtingen van de verwerker

ITRW:

1. verwerkt de gegevens alleen op schriftelijke instructie van de school, zoals vastgelegd in deze overeenkomst en in de instellingen die de school in de software kiest. Vindt ITRW een instructie in strijd met de AVG, dan meldt het dat meteen aan de school;
2. gebruikt de gegevens nooit voor eigen doeleinden, verkoopt ze niet en deelt ze met niemand buiten artikel 5;
3. laat alleen medewerkers bij de gegevens die dat voor de dienst nodig hebben, en alleen als zij gebonden zijn aan geheimhouding;
4. helpt de school bij haar eigen verplichtingen: verzoeken van betrokkenen (artikel 8), beveiliging, datalekken en, waar nodig, een gegevensbeschermingseffectbeoordeling (DPIA);
5. houdt een register bij van de verwerkingen die het voor de school uitvoert;
6. werkt mee met de Gegevensbeschermingsautoriteit als die daarom vraagt, en brengt de school daarvan op de hoogte, tenzij de wet dat verbiedt.

Vraagt de school om ondersteuning die buiten de normale dienstverlening valt, dan spreken partijen vooraf een redelijke vergoeding af.

## Artikel 5 – Subverwerkers

De school geeft toestemming voor de subverwerker hieronder. ITRW legt aan elke subverwerker minstens dezelfde verplichtingen op als in deze overeenkomst en blijft tegenover de school verantwoordelijk voor diens nakoming.

| Subverwerker                                                               | Wat                                                                              | Waar de gegevens staan                       |
| -------------------------------------------------------------------------- | -------------------------------------------------------------------------------- | -------------------------------------------- |
| Amazon Web Services EMEA SARL, 38 Avenue John F. Kennedy, L-1855 Luxemburg | Hosting: database, bestanden, aanmelding, versleutelde doorgifte naar de browser | AWS-regio Ierland (eu-west-1), Europese Unie |

Deze diensten ontvangen bewust **geen** persoonsgegevens en zijn dus geen subverwerkers:

| Dienst                                                                         | Wat ze krijgen                                                                                                                                                      |
| ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Open Library, Google Books, open data van de Nederlandse openbare bibliotheken | Alleen het ISBN van een boek, om titel, auteur en omslag op te zoeken. Omslagen worden op de eigen server bewaard, zodat bezoekers niets bij deze diensten opvragen |
| GitHub                                                                         | Alleen de broncode van de software                                                                                                                                  |
| Domeinbeheerder van de school                                                  | Alleen DNS-instellingen voor het webadres                                                                                                                           |

Wil ITRW een subverwerker toevoegen of vervangen, dan meldt het dat minstens 30 dagen vooraf. De school kan binnen die termijn gemotiveerd bezwaar maken. Vinden partijen geen oplossing, dan mag de school de dienstverlening beëindigen zonder kosten.

Een fotograaf die de school inhuurt om schoolfoto’s te nemen, werkt in opdracht van de school en is geen subverwerker van ITRW. De school maakt met die fotograaf zelf de nodige afspraken (een verwerkersovereenkomst of een gelijkwaardige regeling) en maakt in de software een account met de rol fotograaf voor hem aan. Met die rol kan de fotograaf alleen foto’s opladen en sorteren, met de naam, klas en kaartnummer van de leerlingen; downloadcodes en andere gegevens ziet hij niet. De school schakelt het account uit zodra de opdracht klaar is.

## Artikel 6 – Beveiliging

ITRW neemt passende technische en organisatorische maatregelen (artikel 32 AVG). Die staan hieronder; ITRW houdt ze op peil en verlaagt het niveau niet zonder de school te verwittigen.

| Maatregel              | Hoe                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Versleuteling          | Alle verkeer via HTTPS (TLS 1.2 of hoger, HSTS); database en bestanden versleuteld opgeslagen                                                                                                                                                                                                                                                                                                                                                          |
| Toegang in de software | Alleen aangemelde medewerkers zien lezersgegevens; tweestapsverificatie verplicht voor alle medewerkers (beheerders, bibliothecarissen, materiaalbeheerders en fotografen); rollen beperken wat elk mag (bv. alleen beheerders verwijderen lezers of wijzigen instellingen); een materiaalbeheerder of fotograaf ziet alleen zijn eigen module; de server controleert dit bij elk verzoek                                                              |
| Toegang tot de hosting | Alleen bevoegde medewerkers van ITRW, met persoonlijke accounts en tweestapsverificatie; elk onderdeel van de software krijgt alleen de rechten die het nodig heeft                                                                                                                                                                                                                                                                                    |
| Gegevensminimalisatie  | Geen gegevens die de school voor de gebruikte modules niet nodig heeft; geen persoonsgegevens in logbestanden; boekomslagen op eigen server                                                                                                                                                                                                                                                                                                            |
| Bewaartermijnen        | Automatisch wissen van oude leesgeschiedenis, wie welk materiaal had, logbestanden en verlopen schoolfoto’s (artikel 3)                                                                                                                                                                                                                                                                                                                                |
| Verantwoording         | Wijzigingslogboek van wie wat wijzigde en wanneer                                                                                                                                                                                                                                                                                                                                                                                                      |
| Schoolfoto’s           | Aparte opslag die nooit openbaar is; elke foto is alleen bereikbaar via een link die na een uur vervalt. Ouders zien alleen de foto’s van hun eigen kind, met een persoonlijke code van 12 tekens die niet te raden is, en alleen tot de einddatum. Locatie- en cameragegevens worden in de browser verwijderd vóór het opladen. Geen gezichtsherkenning: foto’s worden aan een leerling gekoppeld via een foto van de leerlingenkaart of de klaslijst |
| Beschikbaarheid        | Doorlopende backups (herstel tot op elk moment van de laatste 35 dagen); beveiliging tegen per ongeluk verwijderen                                                                                                                                                                                                                                                                                                                                     |
| Bewaking               | Automatische alarmen bij fouten, met melding aan ITRW                                                                                                                                                                                                                                                                                                                                                                                                  |
| Webbeveiliging         | Strikte beveiligingsheaders (Content Security Policy); alleen echte afbeeldingen worden aanvaard als upload                                                                                                                                                                                                                                                                                                                                            |
| Onderhoud              | Software-afhankelijkheden worden automatisch op bekende kwetsbaarheden gecontroleerd                                                                                                                                                                                                                                                                                                                                                                   |

## Artikel 7 – Datalekken

ITRW meldt een inbreuk op de beveiliging van de gegevens zonder onredelijke vertraging aan de school, en uiterlijk binnen 48 uur nadat het de inbreuk ontdekt. Zo kan de school, als dat nodig is, binnen 72 uur melden bij de Gegevensbeschermingsautoriteit.

De melding bevat, voor zover bekend:

- wat er gebeurde en wanneer;
- welke gegevens en hoeveel betrokkenen het ongeveer raakt;
- de waarschijnlijke gevolgen;
- wat ITRW al deed en voorstelt om de gevolgen te beperken;
- een contactpersoon bij ITRW.

Wat nog niet bekend is, vult ITRW aan zodra het dat weet. ITRW meldt een lek niet zelf aan de autoriteit of aan betrokkenen; dat beslist de school. ITRW houdt alle lekken bij, ook kleine.

## Artikel 8 – Rechten van betrokkenen

Leerlingen, ouders en leerkrachten richten hun verzoeken (inzage, verbetering, wissen, beperking) aan de school. De school kan de meeste zelf afhandelen in de software:

- **Inzage:** een beheerder downloadt alle gegevens van een lezer, inclusief de leesgeschiedenis en het materiaal dat de lezer kreeg;
- **Verbetering:** medewerkers passen de gegevens van een lezer aan;
- **Wissen:** een beheerder verwijdert een lezer met de volledige leesgeschiedenis en de schoolfoto’s, zodra alle boeken en al het uitgegeven materiaal terug zijn.
- **Bezwaar tegen schoolfoto’s:** een beheerder duidt per fotodag aan dat een leerling niet gefotografeerd mag worden; van die leerling worden geen foto’s opgeladen en er komt geen downloadcode. Een verloren of misbruikt strookje vervangt de school door een nieuwe code; de oude werkt dan meteen niet meer.

Komt een verzoek rechtstreeks bij ITRW binnen, dan stuurt ITRW het onverwijld door naar de school en beantwoordt het niet zelf. Waar de software niet volstaat, helpt ITRW de school binnen 5 werkdagen.

## Artikel 9 – Doorgifte buiten de EER

De gegevens worden opgeslagen in de Europese Unie (Ierland) en ITRW brengt ze niet over naar landen buiten de Europese Economische Ruimte. Webverkeer loopt via het wereldwijde netwerk van Amazon CloudFront, versleuteld en zonder dat persoonsgegevens daar worden bewaard. Schoolfoto’s gaan niet via dat netwerk, maar rechtstreeks van en naar de opslag in Ierland.

Voor zover Amazon Web Services toch toegang tot gegevens zou krijgen van buiten de EER, gelden de waarborgen uit de verwerkersovereenkomst van AWS: de standaardcontractbepalingen van de Europese Commissie en het EU-VS-gegevensprivacykader. ITRW verandert de opslaglocatie niet zonder voorafgaande schriftelijke toestemming van de school.

## Artikel 10 – Audits en informatie

ITRW geeft de school op verzoek alle informatie die nodig is om aan te tonen dat het deze overeenkomst naleeft, zoals een beschrijving van de maatregelen in artikel 6 en de certificeringen van de subverwerker (bv. ISO 27001 van AWS).

De school, of een onafhankelijke deskundige die zij aanwijst en die aan geheimhouding gebonden is, mag de naleving controleren, maximaal één keer per jaar en na een aankondiging van minstens 30 dagen, tenzij er een concrete aanwijzing is van een inbreuk. Elke partij draagt haar eigen kosten.

## Artikel 11 – Einde: teruggave en verwijdering

Bij het einde van de dienstverlening, of eerder op verzoek van de school:

1. bezorgt ITRW de school binnen 30 dagen een volledige uitvoer van haar gegevens (catalogus, exemplaren, lezers, uitleningen, materiaal en uitgiftes, en de gegevens over fotodagen en foto’s) in een gangbaar formaat, zoals CSV of JSON. De fotobestanden zelf horen daar niet bij: ouders downloaden ze tijdens de fotodag, en ze worden mee verwijderd;
2. verwijdert ITRW daarna alle persoonsgegevens van de school, inclusief de accounts van medewerkers, binnen 30 dagen na de uitvoer of na het verzoek van de school;
3. verdwijnen de gegevens uit de backups uiterlijk 35 dagen later;
4. bevestigt ITRW de verwijdering schriftelijk.

ITRW bewaart alleen gegevens die het wettelijk moet bewaren, en meldt dat dan aan de school. De verplichtingen over vertrouwelijkheid blijven ook na het einde gelden.

## Artikel 12 – Aansprakelijkheid

Elke partij is aansprakelijk voor schade die voortvloeit uit haar eigen tekortkoming in deze overeenkomst of in de AVG, volgens artikel 82 AVG. De aansprakelijkheid van ITRW is beperkt tot \[bedrag, bv. het totaal dat de school in de 12 maanden voor het schadegeval betaalde\], behalve bij opzet of grove nalatigheid. Boetes die de Gegevensbeschermingsautoriteit een partij oplegt, draagt die partij zelf.

## Artikel 13 – Toepasselijk recht en geschillen

Op deze overeenkomst is het Belgisch recht van toepassing. Partijen proberen een geschil eerst in onderling overleg op te lossen. Lukt dat niet binnen 30 dagen, dan zijn de rechtbanken van \[arrondissement, bv. dat van de zetel van de school\] bevoegd.

## Ondertekening

Opgemaakt in twee exemplaren te \[plaats\] op \[datum\]; elke partij erkent een exemplaar ontvangen te hebben.

| Voor de school       | Voor InTheRealWorld BV |
| -------------------- | ---------------------- |
| Naam: \[naam\]       | Naam: \[naam\]         |
| Functie: \[functie\] | Functie: \[functie\]   |
| Handtekening:        | Handtekening:          |

Contactpersoon gegevensbescherming bij de school (DPO): \[naam, e-mail\]. Contactpersoon bij ITRW voor datalekken en vragen: \[naam\], tim@itrw.be, \[telefoon\].
