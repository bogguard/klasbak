// English content of the site. Same structure as nl.mjs.
export default {
  lang: 'en',
  meta: {
    title: 'Klasbak: solid, affordable software for your school',
    description:
      'Open-source software for schools. A school library that lends in two scans, with a catalogue with real covers, labels, reader cards and statistics. And an overview of your Chromebooks and other equipment. In the browser, data in the EU, €10 a month for everything.',
  },
  nav: {
    features: 'Features',
    video: 'Video',
    privacy: 'Privacy',
    price: 'Price',
    faq: 'Questions',
    contact: 'Get started',
    switchLabel: 'Nederlands',
    skip: 'Skip to content',
    menu: 'Menu',
  },
  hero: {
    eyebrow: 'Open source · Made in Flanders',
    title: 'Software for your school, solid and affordable.',
    lead: 'Klasbak starts with what every school needs: a school library that lends in two scans, and an overview of the Chromebooks and other equipment. All in the browser, ready to use, for one price.',
    primary: 'Get started with your school',
    secondary: 'See it in action',
    facts: ['€10 a month', 'Nothing to install', 'Data in the EU'],
    deskAlt: 'The lending desk: a pupil at the desk, with two books just lent and their due dates.',
    phoneAlt: 'The catalogue on a smartphone, with the books’ covers.',
    badge: 'Lent',
    badgeText: 'Holidays are skipped automatically',
  },
  strip: [
    { value: '1 price', label: 'for the library and the equipment' },
    { value: '0', label: 'installs: it runs in the browser' },
    { value: 'EU', label: 'data in Europe, encrypted' },
    { value: 'MIT', label: 'open source, self-hosting welcome' },
  ],
  week: {
    kicker: 'A week in the library',
    title: 'Made for the people who keep the library running',
    lead: 'The parent who runs the desk on Tuesdays, the teacher with a classroom library, the children choosing a book. This is their week.',
  },
  features: [
    {
      id: 'desk',
      kicker: 'Monday morning',
      title: 'Lending in two scans',
      text: 'Scan the card, scan the book, done. The due date skips holidays and closed days by itself. Returning a book is one scan, even without the card.',
      points: [
        'Works with an ordinary barcode scanner or your laptop’s camera',
        'Scanning twice never does anything twice',
        'Renew with one click, print a slip for the school bag',
      ],
      image: 'desk',
      alt: 'The lending desk with a pupil and two books lent.',
    },
    {
      id: 'catalogue',
      kicker: 'At school and at home',
      title: 'A catalogue with real covers',
      text: 'Search by title, author, subject or reading level, with results as you type. On any phone, without an app and without signing in.',
      points: [
        'See right away how many copies are available',
        'Filter by type, reading level and availability',
        'In Dutch and English',
      ],
      image: 'catalogue',
      alt: 'The catalogue with children’s book covers and filters.',
    },
    {
      id: 'new',
      kicker: 'The box of new books',
      title: 'From box to shelf in minutes',
      text: 'Scan the ISBN: title, author, publisher and cover fill in from open library sources. Add the reading level and age, and every copy gets its own barcode.',
      points: [
        'Labels to print on ordinary label sheets',
        'A half-used sheet? Just start at the next label',
        'Location and status per copy: damaged, lost, withdrawn',
      ],
      image: 'new-title',
      alt: 'A new title found by its ISBN, with cover and details.',
    },
    {
      id: 'september',
      kicker: 'September',
      title: 'A new school year without retyping',
      text: 'Import the pupil list from your school administration software as an Excel or CSV file. Before anything changes, you see who is new, who moves to a new class and who has left.',
      points: [
        'Pupils keep their card, even in a new class',
        'Set pupils who left to inactive with one tick',
        'Reader cards per class, ready to laminate',
      ],
      image: 'import',
      alt: 'Importing a pupil list, with an overview of what changes.',
    },
    {
      id: 'figures',
      kicker: 'For the head teacher',
      title: 'How much is being read?',
      text: 'Per month, per class and per reading level. The school’s favourites, and the books nobody takes home. A report for the school board or the municipality, as PDF or CSV.',
      points: [
        'Always anonymous: counting what is lent, never who read what',
        'Per school year, including previous years',
        'An overview of that year’s exchange collections',
      ],
      image: 'statistics',
      alt: 'The school year’s statistics with figures and a chart per month.',
    },
    {
      id: 'equipment',
      kicker: 'For the ICT coordinator',
      title: 'Know what equipment you have and where it is',
      text: 'The school’s Chromebooks, tablets and chargers can go in too, if you like. See how many you have of each kind, and for every device where it is and how it’s doing. A new delivery is scanned in one go.',
      points: [
        'Scan the label or the serial number on the device to open its record',
        'Filter on a place, like Cart A, for a quick check',
        'Available, in repair, missing or withdrawn',
        'An account of their own for the ICT coordinator, without access to the library',
      ],
      image: 'equipment',
      video: {
        config: 'equipmentYoutubeId',
        target: 'video-materiaal',
        label: 'Watch it in three minutes',
      },
      alt: 'The equipment overview: how many are free per kind, and below it every device with its place and status.',
    },
  ],
  more: {
    title: 'And also',
    items: [
      {
        title: 'My books',
        text: 'A tablet by the door: pupils scan their card and see which books they have at home. After twenty seconds it all disappears again.',
        image: 'my-books',
        alt: 'The My books screen showing a pupil’s books.',
      },
      {
        title: 'Reminder slips',
        text: 'One slip per pupil listing their overdue books, sorted by class. No emails, no parents who need to sign in.',
        image: 'reminder',
        alt: 'A reminder slip for a pupil.',
      },
      {
        title: 'Reader cards',
        text: 'Cards with name, class and barcode, per class, to cut out and laminate. With your school’s name and logo.',
        image: 'cards',
        alt: 'Reader cards with barcodes.',
      },
      {
        title: 'Exchange collections',
        text: 'Books from the public library keep their own label and are lent like your own. When they go back, the list adds up.',
        image: 'exchange',
        alt: 'An exchange collection with its books and where they are.',
      },
    ],
  },
  video: {
    kicker: 'See it in action',
    title: 'A ten-minute tour',
    webinar:
      'An ordinary week in the library, chapter by chapter: the desk, the pupils, new books, the new school year, exchange collections, the figures and privacy. In Dutch, with Dutch subtitles.',
    play: 'Play the webinar',
    playNote: 'The video comes from YouTube; it only loads when you press play.',
    soon: 'The webinar will be online soon.',
    equipment: {
      title: 'Equipment, in three minutes',
      text: 'For the ICT coordinator: scanning in a delivery, printing labels, finding a device and checking a cart now and then. In Dutch, with Dutch subtitles.',
      play: 'Play the webinar about equipment',
    },
  },
  privacy: {
    kicker: 'Safe and privacy-friendly',
    title: 'Children’s data deserves care',
    points: [
      { title: 'In Europe', text: 'Everything is stored in a data centre in Ireland, encrypted.' },
      {
        title: 'Only the team',
        text: 'Whoever runs the library or the equipment signs in with a password and a code on their phone.',
      },
      {
        title: 'As little as possible',
        text: 'No date of birth, address or photo. An email address isn’t needed.',
      },
      {
        title: 'Removed automatically',
        text: 'Reading history is private and removed after the retention period the school chooses.',
      },
      {
        title: 'Rights in one click',
        text: 'Download or erase a pupil’s data when parents ask.',
      },
      {
        title: 'Clear agreements',
        text: 'A data processing agreement is included, and a privacy page in plain language.',
      },
    ],
  },
  price: {
    kicker: 'Price',
    title: 'One price, everything included',
    hosted: {
      name: 'Klasbak',
      per: 'a month, per school',
      note: 'excl. VAT',
      points: [
        'Your own installation, with data in the EU',
        'Updates and security fixes',
        'Backups: any moment of the last 35 days',
        'The school library and Equipment, and whatever comes next',
        'No limit on pupils, books or devices',
        'Help by email',
        'Data processing agreement',
      ],
      cta: 'Get started with your school',
    },
    self: {
      name: 'Self-hosted',
      amount: 'Free',
      per: 'open source (MIT)',
      text: 'Rather keep everything in your own hands? Install the app in your own AWS account. The guide comes with the source code.',
      cta: 'View the source code',
    },
  },
  start: {
    kicker: 'Getting started',
    title: 'Email today, lend books soon',
    steps: [
      {
        title: 'Send an email',
        text: 'Tell us briefly about your school. Questions or a guided tour are welcome too.',
      },
      {
        title: 'We set up Klasbak',
        text: 'With your school’s name and logo, and an account for whoever runs the library or the equipment.',
      },
      {
        title: 'Import and start lending',
        text: 'The pupil list from your school administration; books are scanned in by their ISBN.',
      },
    ],
    needs: 'What you need',
    needsList: [
      'A computer with a browser',
      'A barcode scanner, or the camera of a laptop or tablet',
      'Label sheets for the book labels',
    ],
  },
  faq: {
    title: 'Frequently asked questions',
    items: [
      {
        q: 'Do we need to install anything?',
        a: 'No. Klasbak runs in the browser, on a computer, a tablet or a phone.',
      },
      {
        q: 'Which scanner do we need?',
        a: 'Any barcode scanner that behaves like a keyboard, wired or bluetooth. Without a scanner, use the camera of a laptop or tablet.',
      },
      {
        q: 'Do pupils need an email address or password?',
        a: 'No. Pupils have a card with a barcode. Only the people who run the library sign in.',
      },
      {
        q: 'Can we bring over our existing catalogue?',
        a: 'Importing from other library software isn’t available yet. Books with an ISBN are scanned in quickly: we look up the details and the cover for you.',
      },
      {
        q: 'Can we keep track of our Chromebooks too?',
        a: 'Yes. Switch on Equipment in the settings. You see what the school has and where it is. If a device goes home with a pupil, you can note that too.',
      },
      {
        q: 'Will there be more?',
        a: 'That’s the plan. Klasbak is made of modules you switch on when you need them, all for the same price. What comes first depends on what schools ask for. Got an idea? Email us.',
      },
      {
        q: 'Is it really open source?',
        a: 'Yes, under the MIT licence. You may read the source code, change it and host the app yourself.',
      },
      {
        q: 'Where is our data stored?',
        a: 'In a separate installation per school, at Amazon Web Services in Ireland (European Union), encrypted.',
      },
    ],
  },
  cta: {
    title: 'Ready to get started?',
    text: 'Send us an email and we’ll help you on your way.',
    button: 'Email',
  },
  footer: {
    tagline:
      'Solid, affordable open-source software for schools: the library, the equipment, and what comes next.',
    by: 'A project by',
    vat: 'VAT',
    source: 'Source code',
    privacy:
      'This site uses no cookies and doesn’t track you. YouTube only loads when you play the webinar.',
  },
};
