// Dutch (Flemish) content of the site. Only what the app does today.
export default {
  lang: 'nl-BE',
  meta: {
    title: 'Klasbak: degelijke, betaalbare software voor je school',
    description:
      'Open-source software voor de school. Een schoolbib die vlot uitleent, met een catalogus met echte kaften, etiketten, lezerskaarten en statistieken. En een overzicht van de Chromebooks en ander materiaal. In de browser, gegevens in de EU, €10 per maand voor alles.',
  },
  nav: {
    features: 'Functies',
    video: 'Video',
    privacy: 'Privacy',
    price: 'Prijs',
    faq: 'Vragen',
    contact: 'Starten',
    switchLabel: 'English',
    skip: 'Naar de inhoud',
    menu: 'Menu',
  },
  hero: {
    eyebrow: 'Open source · Gemaakt in Vlaanderen',
    title: 'Software voor je school, degelijk en betaalbaar.',
    lead: 'Klasbak begint met wat elke school nodig heeft: een schoolbib die uitleent in twee scans, en een overzicht van de Chromebooks en ander materiaal. Alles in de browser, klaar om te gebruiken, voor één prijs.',
    primary: 'Starten met je school',
    secondary: 'Bekijk het in actie',
    facts: ['€10 per maand', 'Geen installatie', 'Gegevens in de EU'],
    deskAlt:
      'De uitleenbalie: een leerling staat aan de balie, met twee net uitgeleende boeken en hun terugbrengdatum.',
    phoneAlt: 'De catalogus op een smartphone, met de kaften van de boeken.',
    badge: 'Uitgeleend',
    badgeText: 'Vakanties tellen vanzelf niet mee',
  },
  strip: [
    { value: '1 prijs', label: 'voor de schoolbib en het materiaal' },
    { value: '0', label: 'installaties: het werkt in de browser' },
    { value: 'EU', label: 'gegevens in Europa, versleuteld' },
    { value: 'MIT', label: 'open source, zelf hosten mag' },
  ],
  week: {
    kicker: 'Een week in de bib',
    title: 'Gemaakt voor de mensen die de bib draaiende houden',
    lead: 'De ouder die op dinsdag de balie doet, de leerkracht met een klasbib, de kinderen die een boek komen kiezen. Zo ziet hun week eruit.',
  },
  features: [
    {
      id: 'balie',
      kicker: 'Maandagochtend',
      title: 'Uitlenen in twee scans',
      text: 'Kaart scannen, boek scannen, klaar. De terugbrengdatum slaat vakanties en sluitingsdagen vanzelf over. Een boek terugbrengen is één scan, ook zonder kaart.',
      points: [
        'Werkt met een gewone streepjescodescanner of de camera van je laptop',
        'Een dubbele scan doet niets dubbel',
        'Verlengen met één klik, een ticketje voor in de boekentas',
      ],
      image: 'desk',
      alt: 'De uitleenbalie met een leerling en twee uitgeleende boeken.',
    },
    {
      id: 'catalogus',
      kicker: 'Op school en thuis',
      title: 'Een catalogus met echte kaften',
      text: 'Zoeken op titel, auteur, onderwerp of AVI-niveau, met de resultaten terwijl je typt. Op elke gsm, zonder app en zonder aan te melden.',
      points: [
        'Zie meteen hoeveel exemplaren er beschikbaar zijn',
        'Filters op soort, AVI-niveau en beschikbaarheid',
        'In het Nederlands en het Engels',
      ],
      image: 'catalogue',
      alt: 'De catalogus met kaften van kinderboeken en filters.',
    },
    {
      id: 'nieuw',
      kicker: 'De doos met nieuwe boeken',
      title: 'Van doos tot rek in een paar minuten',
      text: 'Scan het ISBN: titel, auteur, uitgever en kaft vullen zich vanzelf in uit open bibliotheekbronnen. Vul het AVI-niveau en de leeftijd aan, en elk exemplaar krijgt een eigen barcode.',
      points: [
        'Etiketten om af te drukken op gewone etiketvellen',
        'Een half gebruikt vel? Begin gewoon bij het volgende label',
        'Plaats en status per exemplaar: beschadigd, verloren, afgevoerd',
      ],
      image: 'new-title',
      alt: 'Een nieuwe titel, gevonden via het ISBN, met kaft en gegevens.',
    },
    {
      id: 'september',
      kicker: 'September',
      title: 'Een nieuw schooljaar zonder overtypen',
      text: 'Importeer de leerlingenlijst uit Informat, Wisa of Smartschool, als Excel- of CSV-bestand. Voor er iets verandert, zie je wie nieuw is, wie een nieuwe klas krijgt en wie vertrok.',
      points: [
        'Leerlingen houden hun kaart, ook in een nieuwe klas',
        'Vertrokken leerlingen met één vinkje op inactief',
        'Lezerskaarten per klas, om te lamineren',
      ],
      image: 'import',
      alt: 'De import van een leerlingenlijst met een overzicht van wat er verandert.',
    },
    {
      id: 'cijfers',
      kicker: 'Voor de directie',
      title: 'Hoeveel wordt er gelezen?',
      text: 'Per maand, per klas en per AVI-niveau. De toppers van de school, en de boeken die niemand meeneemt. Een rapport voor de directie of de gemeente, als PDF of CSV.',
      points: [
        'Altijd anoniem: tellen wat er uitgeleend wordt, nooit wie wat las',
        'Per schooljaar, ook de vorige jaren',
        'Een overzicht van de wisselcollecties van dat jaar',
      ],
      image: 'statistics',
      alt: 'De statistieken van het schooljaar met cijfers en een grafiek per maand.',
    },
    {
      id: 'materiaal',
      kicker: 'Voor de ICT-coördinator',
      title: 'Weten welk materiaal er is en waar het ligt',
      text: 'Ook de Chromebooks, tablets en opladers van de school staan erin, als je dat wil. Per soort zie je hoeveel er zijn, en per toestel waar het ligt en hoe het ermee staat. Een nieuwe levering scan je in één keer in.',
      points: [
        'Scan het label of het serienummer op het toestel, en je hebt de fiche',
        'Filter op een plaats, zoals Kar A, om snel te controleren',
        'Beschikbaar, in herstelling, vermist of afgevoerd',
        'Een eigen account voor de ICT-coördinator, zonder toegang tot de bib',
      ],
      image: 'equipment',
      video: {
        config: 'equipmentYoutubeId',
        target: 'video-materiaal',
        label: 'Bekijk het in drie minuten',
      },
      alt: 'Het overzicht van het materiaal: per soort hoeveel er vrij zijn, en daaronder elk toestel met zijn plaats en status.',
    },
  ],
  more: {
    title: 'En verder',
    items: [
      {
        title: 'Mijn boeken',
        text: 'Een tablet bij de deur: leerlingen scannen hun kaart en zien welke boeken thuis liggen. Na twintig seconden verdwijnt alles weer.',
        image: 'my-books',
        alt: 'Het scherm Mijn boeken met de boeken van een leerling.',
      },
      {
        title: 'Herinneringsbriefjes',
        text: 'Per leerling een strookje met de boeken die te laat zijn, per klas. Geen e-mails, geen ouders die moeten inloggen.',
        image: 'reminder',
        alt: 'Een herinneringsbriefje voor een leerling.',
      },
      {
        title: 'Lezerskaarten',
        text: 'Kaarten met naam, klas en barcode, per klas om uit te knippen en te lamineren. Met de naam en het logo van je school.',
        image: 'cards',
        alt: 'Lezerskaarten met barcode.',
      },
      {
        title: 'Wisselcollecties',
        text: 'Boeken van de openbare bib houden hun etiket en leen je gewoon mee uit. Bij het terugbrengen klopt de lijst.',
        image: 'exchange',
        alt: 'Een wisselcollectie met de boeken en waar ze zijn.',
      },
    ],
  },
  video: {
    kicker: 'Zie het in actie',
    title: 'Een rondleiding van tien minuten',
    webinar:
      'Een gewone week in de bib, hoofdstuk per hoofdstuk: de uitleenbalie, de leerlingen, nieuwe boeken, het nieuwe schooljaar, wisselcollecties, de cijfers en privacy.',
    play: 'Speel de webinar af',
    playNote: 'De video komt van YouTube; die laden we pas als je op afspelen klikt.',
    soon: 'De webinar staat binnenkort online.',
    equipment: {
      title: 'Materiaal, in drie minuten',
      text: 'Voor de ICT-coördinator: een levering inscannen, labels afdrukken, een toestel terugvinden en af en toe een kar controleren.',
      play: 'Speel de webinar over Materiaal af',
    },
  },
  privacy: {
    kicker: 'Veilig en privacyvriendelijk',
    title: 'Gegevens van kinderen verdienen zorg',
    points: [
      { title: 'In Europa', text: 'Alles staat in een datacenter in Ierland en is versleuteld.' },
      {
        title: 'Alleen het team',
        text: 'Wie de bib of het materiaal beheert, meldt aan met een wachtwoord en een code op de gsm.',
      },
      {
        title: 'Zo weinig mogelijk',
        text: 'Geen geboortedatum, adres of foto. Een e-mailadres is niet nodig.',
      },
      {
        title: 'Vanzelf gewist',
        text: 'De leesgeschiedenis is privé en wordt gewist na de bewaartermijn die de school kiest.',
      },
      {
        title: 'Rechten met één klik',
        text: 'De gegevens van een leerling downloaden of wissen, als ouders erom vragen.',
      },
      {
        title: 'Duidelijke afspraken',
        text: 'Een verwerkersovereenkomst hoort erbij, en een privacypagina in gewone taal.',
      },
    ],
  },
  price: {
    kicker: 'Prijs',
    title: 'Eén prijs, alles inbegrepen',
    hosted: {
      name: 'Klasbak',
      per: 'per maand, per school',
      note: 'excl. btw',
      points: [
        'Een eigen installatie, met gegevens in de EU',
        'Updates en beveiligingsfixes',
        'Back-ups: elk moment van de laatste 35 dagen',
        'De schoolbib en Materiaal, en wat er nog bijkomt',
        'Geen limiet op leerlingen, boeken of toestellen',
        'Hulp per e-mail',
        'Verwerkersovereenkomst',
      ],
      cta: 'Starten met je school',
    },
    self: {
      name: 'Zelf hosten',
      amount: 'Gratis',
      per: 'open source (MIT)',
      text: 'Liever alles zelf in handen? Installeer de app in je eigen AWS-account. De handleiding staat bij de broncode.',
      cta: 'Bekijk de broncode',
    },
  },
  start: {
    kicker: 'Zo start je',
    title: 'Vandaag mailen, binnenkort uitlenen',
    steps: [
      {
        title: 'Stuur een mailtje',
        text: 'Vertel kort over jullie school. Vragen stellen of een rondleiding vragen mag ook.',
      },
      {
        title: 'Wij zetten Klasbak klaar',
        text: 'Met de naam en het logo van je school, en een account voor wie de bib of het materiaal beheert.',
      },
      {
        title: 'Importeer en leen uit',
        text: 'De leerlingenlijst uit je schooladministratie, de boeken scan je in met hun ISBN.',
      },
    ],
    needs: 'Wat je nodig hebt',
    needsList: [
      'Een computer met een browser',
      'Een streepjescodescanner, of de camera van een laptop of tablet',
      'Etiketvellen voor de labels',
    ],
  },
  faq: {
    title: 'Veelgestelde vragen',
    items: [
      {
        q: 'Moeten we iets installeren?',
        a: 'Nee. Klasbak werkt in de browser, op een computer, een tablet of een gsm.',
      },
      {
        q: 'Welke scanner hebben we nodig?',
        a: 'Elke streepjescodescanner die zich als een toetsenbord gedraagt, met kabel of bluetooth. Zonder scanner gebruik je de camera van een laptop of tablet.',
      },
      {
        q: 'Hebben leerlingen een e-mailadres of wachtwoord nodig?',
        a: 'Nee. Leerlingen hebben een kaart met een barcode. Alleen wie de bib beheert, meldt aan.',
      },
      {
        q: 'Kunnen we onze bestaande catalogus overzetten?',
        a: 'Een import uit een ander bibliotheekprogramma zit er nog niet in. Boeken met een ISBN scan je snel in: de gegevens en de kaft zoeken we voor je op.',
      },
      {
        q: 'Kunnen we er ook onze Chromebooks in bijhouden?',
        a: 'Ja. Zet Materiaal aan in de instellingen. Je ziet wat de school heeft en waar het ligt. Geef je een toestel mee aan een leerling, dan kan je ook dat noteren.',
      },
      {
        q: 'Komt er nog meer bij?',
        a: 'Dat is de bedoeling. Klasbak bestaat uit modules die je aanzet als je ze nodig hebt, allemaal voor dezelfde prijs. Wat er eerst komt, hangt af van wat scholen vragen. Een idee? Mail het ons.',
      },
      {
        q: 'Is het echt open source?',
        a: 'Ja, onder de MIT-licentie. Je mag de broncode bekijken, aanpassen en de app zelf hosten.',
      },
      {
        q: 'Waar staan onze gegevens?',
        a: 'In een eigen installatie per school, bij Amazon Web Services in Ierland (Europese Unie), versleuteld.',
      },
    ],
  },
  cta: {
    title: 'Klaar om te starten?',
    text: 'Stuur een mailtje, en we helpen je op weg.',
    button: 'Mail naar',
  },
  footer: {
    tagline:
      'Degelijke, betaalbare open-source software voor de school: de schoolbib, het materiaal, en wat nog volgt.',
    by: 'Een project van',
    vat: 'btw',
    source: 'Broncode',
    privacy:
      'Deze site gebruikt geen cookies en volgt je niet. YouTube laadt pas als je de webinar afspeelt.',
  },
};
