import type { SiteDefinition } from '../site-definition';

/**
 * The Sun workspace, as it is seeded in development.
 *
 * Transcribed from `seed.development.ts` and `custom-seed.ts` rather than
 * invented, so what a developer sees after `nx re-seed cms` does not change
 * with this format.
 *
 * Swedish, because the tenant is. A definition states one locale — the
 * tenant that names it decides which.
 */

export const sun: SiteDefinition = {
  name: 'sun',
  description: 'The Sun workspace seeded in development',

  forms: [
    {
      title: 'Contact',
      emailLabel: 'Din e-post',
      emailPlaceholder: 'du@exempel.se',
      submitLabel: 'Hör av dig',
      confirmation: 'Tack! Vi hör av oss inom kort.',
      subject: 'Nytt meddelande från {{email}}',
      emailTo: 'hello@sun.dev'
    }
  ],

  tags: [
    {
      name: 'Indigo',
      slug: 'indigo',
      brand: { color: 'indigo-500', icon: 'TagIcon' }
    },
    {
      name: 'Orange',
      slug: 'orange',
      brand: { color: 'orange-500', icon: 'TagIcon' }
    },
    {
      name: 'Teal',
      slug: 'teal',
      brand: { color: 'teal-500', icon: 'TagIcon' }
    },
    {
      name: 'File area',
      slug: 'file-area',
      brand: { color: 'green-500', icon: 'EyeIcon' }
    }
  ],

  categories: [
    {
      name: 'Solaktivitet',
      slug: 'solar-activity'
    },
    {
      name: 'Solsystem',
      slug: 'solar-system'
    }
  ],

  media: [
    {
      filename: 'abstract-image-1.jpg',
      external: true,
      alt: 'Abstract image 1',
      tags: [
        {
          lookupSlug: 'file-area'
        }
      ]
    },
    {
      filename: 'abstract-image-2.jpg',
      external: true,
      alt: 'Abstract image 2',
      tags: [
        {
          lookupSlug: 'file-area'
        }
      ]
    },
    {
      filename: 'abstract-image-3.jpg',
      external: true,
      alt: 'Abstract image 3',
      tags: [
        {
          lookupSlug: 'file-area'
        }
      ]
    },
    {
      filename: 'data-1.json',
      external: true,
      alt: 'Data 1',
      tags: [
        {
          lookupSlug: 'file-area'
        }
      ]
    },
    {
      filename: 'data-2.json',
      external: true,
      alt: 'Data 2',
      tags: [
        {
          lookupSlug: 'file-area'
        }
      ]
    },
    {
      filename: 'document-1.pdf',
      external: true,
      alt: 'Document 1',
      tags: [
        {
          lookupSlug: 'file-area'
        }
      ]
    },
    {
      filename: 'document-2.pdf',
      external: true,
      alt: 'Document 2',
      tags: [
        {
          lookupSlug: 'file-area'
        }
      ]
    },
    {
      filename: 'text-1.txt',
      external: true,
      alt: 'Text 1',
      tags: [
        {
          lookupSlug: 'file-area'
        }
      ]
    },
    {
      filename: 'text-2.txt',
      external: true,
      alt: 'Text 2',
      tags: [
        {
          lookupSlug: 'file-area'
        }
      ]
    },
    {
      filename: 'word-1.docx',
      external: true,
      alt: 'Word 1',
      tags: [
        {
          lookupSlug: 'file-area'
        }
      ]
    },
    {
      filename: 'word-2.docx',
      external: true,
      alt: 'Word 2',
      tags: [
        {
          lookupSlug: 'file-area'
        }
      ]
    }
  ],

  pages: [
    {
      name: 'Posts',
      slug: 'posts',
      layout: [
        {
          blockType: 'posts',
          title: 'Artiklar',
          description: 'Tankar om programmering, produktdesign och mer.',
          limit: 10
        }
      ]
    },
    {
      name: 'Resor',
      slug: 'tours',
      layout: [
        {
          blockType: 'tours',
          title: 'Resor',
          description: 'Guidade resor med små sällskap och stora smaker.',
          limit: 10
        }
      ]
    },
    {
      name: 'Filområde',
      slug: 'file-area',
      header: 'Filområde',
      layout: [
        {
          blockType: 'file-area',
          tags: [
            {
              lookupSlug: 'file-area'
            }
          ],
          files: null
        }
      ]
    },
    {
      name: 'Solfläckar',
      slug: 'solar-flares',
      header: 'Kraftfulla utbrott på solens yta',
      layout: [
        {
          blockType: 'content',
          columns: [
            {
              size: 'full',
              richText: {
                markdown:
                  '## Solfläckar ☀️\nSolfläckar är massiva explosioner på solens yta som frigör energi, ljus och hög hastighet partiklar i rymden.\n### Bildning och påverkan\nSolfläckar uppstår nära solfläckar, tillfälliga mörka fläckar på solens yta där intensiva magnetfält uppträder. Dessa magnetfält kan bli vridna och plötsligt återansluta, vilket frigör enorma mängder energi. En typisk stor flare kan frigöra energi motsvarande miljontals 100-megaton vätebomber som exploderar samtidigt.\n\nFrekvensen av solfläckar följer den 11-åriga solcykeln, med fler fläckar under solmaximum när solfläckaktiviteten är högst. Fläckar klassificeras efter deras röntgenljusstyrka, med de mest kraftfulla som X-klass fläckar, följt av M, C, B och A-klass fläckar i minskande ordning av intensitet.\n\nStrålningen från solfläckar kan störa radiokommunikation, GPS-navigering och elnät på jorden. De kan också utgöra en strålningsrisk för astronauter och elektronisk utrustning i rymden. Den mest kraftfulla registrerade fläcken, Carrington-händelsen 1859, orsakade norrsken synliga så långt söderut som Karibien och störde telegrafsystem världen över.\n\nNASA och andra rymdorganisationer övervakar kontinuerligt solen för fläckaktivitet med satelliter som Solar Dynamics Observatory (SDO) och Solar and Heliospheric Observatory (SOHO). Dessa observationer hjälper forskare att bättre förstå solfysik och ge tidiga varningar om potentiellt störande solhändelser.\n\nSolfläckar är ofta associerade med koronala massutkast (CMEs), massiva moln av solplasma som kan färdas genom rymden med hastigheter på flera miljoner miles per timme, och potentiellt nå jorden inom 1-3 dagar.\n'
              }
            }
          ]
        }
      ]
    },
    {
      name: 'Solvinden',
      slug: 'solar-wind',
      header: 'Strömmen av partiklar från solen',
      layout: [
        {
          blockType: 'content',
          columns: [
            {
              size: 'full',
              richText: {
                markdown:
                  '## Solvinden 🌞\nSolvinden är en kontinuerlig ström av laddade partiklar (främst elektroner och protoner) som strömmar ut från solen i alla riktningar.\n### Egenskaper och effekter\nSolvinden har sitt ursprung i solens korona, det yttersta lagret av solens atmosfär där temperaturerna överstiger en miljon grader Celsius. Vid dessa temperaturer kan solens gravitation inte hålla kvar de snabbt rörliga partiklarna, vilket gör att de kan undkomma ut i rymden.\n\nSolvinden färdas med hastigheter som varierar från 300 till 800 kilometer per sekund (ungefär 1 till 2 miljoner miles per timme). Den bär med sig solens magnetfält, vilket skapar det vi kallar heliosfären - en enorm bubbla av solens inflytande som sträcker sig långt bortom Pluto.\n\nNär solvinden interagerar med jordens magnetfält skapas en skyddande magnetosfär runt vår planet, som skyddar oss från mycket av solens strålning. Vissa partiklar kan dock tränga in nära polerna och kollidera med atmosfäriska molekyler, vilket skapar de vackra norrsken (aurora borealis) och sydsken (aurora australis).\n\nSolvinden är inte uniform utan varierar i densitet, temperatur och hastighet. "Snabb" solvind kommer från koronala hål, områden där solens magnetfält sträcker sig ut i rymden utan att återvända. "Långsam" solvind kommer från områden nära solens ekvator under perioder med låg solaktivitet.\n\nInteraktionen mellan solvinden och det interstellära mediet skapar en gräns som kallas heliopausen, som Voyager-sonden korsade 2012 och blev de första människotillverkade objekten att komma in i interstellärt utrymme.\n'
              }
            }
          ]
        }
      ]
    },
    {
      name: 'Solens dynamo',
      slug: 'solar-dynamo',
      header: 'Motorn bakom solaktiviteten',
      layout: [
        {
          blockType: 'content',
          columns: [
            {
              size: 'full',
              richText: {
                markdown:
                  '## Solens dynamo 🧲☀️\nSolens dynamo är mekanismen som genererar solens magnetfält och driver dess 11-åriga aktivitetscykel.\n### Hur det fungerar\nSolens dynamo fungerar genom de kombinerade effekterna av differentialrotation och konvektion inom solen. Solen roterar inte som en solid kropp - dess ekvator fullbordar en rotation på cirka 25 dagar, medan polerna tar cirka 35 dagar. Denna differentialrotation sträcker och lindar magnetfältlinjerna, medan konvektionsströmmar lyfter och vrider dem.\n\nDenna process skapar en självförsörjande dynamoeffekt som kontinuerligt regenererar solens magnetfält. Med tiden blir fältet alltmer komplext och vridet, vilket leder till ökande antal solfläckar, flares och andra magnetiska fenomen - det vi observerar som solens maximala period i cykeln.\n\nSå småningom blir magnetfältet så trassligt att det i princip "återställer" sig självt i en process som kallas magnetisk rekoppling. Fältet förenklas och byter polaritet, vilket börjar nästa cykel med att de magnetiska nord- och sydpolerna byts. Denna fullständiga cykel, från en polaritet till samma polaritet igen, tar cirka 22 år (två 11-åriga solfläckscykler).\n\nSolens dynamo fungerar inte med konstant hastighet. Historiska register visar perioder med ovanligt låg aktivitet, såsom Maunder Minimum (1645-1715), när solfläckar var extremt sällsynta och Europa upplevde en "Liten istid." Detta antyder en potentiell koppling mellan solens magnetiska aktivitet och jordens klimat, även om det exakta sambandet fortfarande är ett aktivt forskningsområde.\n\nStudier av solens dynamo hjälper forskare att förutsäga solaktivitet, vilket är avgörande för att förutse rymdväderhändelser som kan påverka satelliter, elnät och telekommunikation på jorden.\n'
              }
            }
          ]
        }
      ]
    },
    {
      name: 'Hem',
      slug: 'home',
      layout: [
        {
          blockType: 'hero',
          badge: 'Sun',
          heading: 'Sommar och sol.',
          lede: 'Solen är den centrala stjärnan i vårt planetsystem, runt vilken planeter, månar och asteroider kretsar.',
          actions: [
            {
              link: {
                type: 'custom',
                url: '/solar-flares',
                label: 'Utforska',
                newTab: false
              },
              emphasis: 'primary'
            },
            {
              link: {
                type: 'custom',
                url: '/solar-wind',
                label: 'Solvinden',
                newTab: false
              },
              emphasis: 'secondary'
            }
          ]
        },
        {
          blockType: 'feature-cards',
          eyebrow: 'Utforska',
          heading: 'Vår stjärna – solen',
          intro:
            'Från mäktiga solutbrott till mystiska solcykler – utforska vetenskapen bakom vår livgivande stjärna.',
          columns: '3',
          items: [
            {
              brand: {
                icon: 'BoltIcon',
                color: 'orange-500'
              },
              title: 'Solfläckar',
              description:
                'Massiva explosioner på solens yta som frigör enorm energi och påverkar hela solsystemet.'
            },
            {
              brand: {
                icon: 'GlobeAltIcon',
                color: 'sky-400'
              },
              title: 'Solvinden',
              description:
                'Den kontinuerliga strömmen av laddade partiklar som strömmar ut från solen i alla riktningar.'
            },
            {
              brand: {
                icon: 'Cog6ToothIcon',
                color: 'blue-400'
              },
              title: 'Solens dynamo',
              description:
                'Mekanismen som genererar solens magnetfält och driver dess 11-åriga aktivitetscykel.'
            }
          ]
        },
        {
          blockType: 'callout',
          showMark: true,
          heading: 'Nyfiken på solen?',
          body: 'Fördjupa dig i vår samling av artiklar om solaktivitet och solsystemet.',
          link: {
            type: 'custom',
            url: '/solar-flares',
            label: 'Läs artiklar',
            newTab: false
          }
        },
        {
          blockType: 'form',
          form: {
            lookupTitle: 'Contact'
          },
          enableIntro: true,
          introContent: {
            markdown:
              '## Nyfiken? Hör av dig.\n\nEtt fält, inget mer. Lämna din e-post så tar vi det därifrån.'
          }
        }
      ]
    }
  ],

  // `seed.ts` navigated every page but home; `customSeed` appended the
  // listings with their own labels. Both are ordinary content
  navigation: [
    {
      reference: {
        relationTo: 'pages',
        lookupSlug: 'solar-flares'
      }
    },
    {
      reference: {
        relationTo: 'pages',
        lookupSlug: 'solar-wind'
      }
    },
    {
      reference: {
        relationTo: 'pages',
        lookupSlug: 'solar-dynamo'
      }
    },
    {
      reference: {
        relationTo: 'pages',
        lookupSlug: 'posts'
      },
      label: 'Artiklar'
    },
    {
      reference: {
        relationTo: 'pages',
        lookupSlug: 'tours'
      },
      label: 'Resor'
    },
    {
      reference: {
        relationTo: 'pages',
        lookupSlug: 'file-area'
      },
      label: 'Filområde'
    }
  ],

  posts: [
    {
      title: 'Solens Kärna',
      slug: 'the-solar-core',
      content:
        '# Solens Kärna\nI hjärtat av vår sol ligger dess kärna, en region med extrema förhållanden där kärnfusion driver vårt solsystem. Trots att den är relativt liten—och upptar endast cirka 20-25% av solens radie—innehåller kärnan ungefär 60% av solens massa på grund av dess otroliga densitet.\n\nKärnans temperatur når otroliga 15 miljoner grader Celsius (27 miljoner grader Fahrenheit), och dess tryck överstiger 200 miljarder gånger jordens atmosfärstryck. Under dessa extrema förhållanden tvingas väte-kärnor samman för att bilda helium genom kärnfusion, vilket frigör enorma mängder energi i processen.\n\nDenna energi, initialt i form av gammastrålar, påbörjar en resa som tar tusentals år att nå solens yta och slutligen jorden. Partiklarna interagerar otaliga gånger på vägen utåt, förlorar gradvis energi och omvandlas från gammastrålar till synligt ljus som slutligen strålar ut i rymden.\n\n## Detektion och Studier\nMänniskor har aldrig direkt observerat solens kärna—den är dold under tusentals kilometer av het plasma. Forskare har dock utvecklat geniala metoder för att studera den indirekt.\n\nHelioseismologi, studiet av oscillationer som sprider sig genom solen, tillåter astronomer att "se" inuti vår stjärna på samma sätt som seismologer använder jordbävningsvågor för att studera jordens inre. Dessutom kan neutriner—nästan masslösa subatomära partiklar som produceras under fusionsreaktioner—undkomma kärnan direkt och detekteras på jorden, vilket ger ett realtidsfönster in i de nukleära processerna som sker i solens centrum.\n\n',
      createdAt: '2026-11-01',
      authors: [
        {
          lookupEmail: 'rigel@local.dev'
        }
      ],
      categories: [
        {
          lookupSlug: 'solar-activity'
        }
      ]
    },
    {
      title: 'Solens Cykler',
      slug: 'solar-cycles',
      content:
        '# Solens Cykler\nSolen, långt från att vara ett statiskt objekt, går igenom regelbundna cykler av aktivitet som påverkar vårt solsystem på djupet. Den mest framträdande av dessa är den ungefär 11-åriga solfläckscykeln, under vilken antalet solfläckar—mörka, magnetiskt intensiva områden på solens yta—stiger och sjunker i ett relativt förutsägbart mönster.\n\nVid solminimum kan solen visa få eller inga solfläckar under dagar eller veckor. När aktiviteten ökar mot solmaximum kan dussintals solfläckar dyka upp samtidigt, åtföljda av ökade solutbrott, koronamassutkastningar och andra energirika fenomen. Dessa cykler har observerats och registrerats sedan tidigt 1600-tal, vilket ger en av astronomins längsta kontinuerliga dataserier.\n\nSolcykeln är faktiskt ett magnetiskt fenomen. Under varje cykel reverserar solens magnetfält helt polaritet, vilket innebär att en full magnetisk cykel tar ungefär 22 år—två 11-åriga solfläckscykler. Denna reversering sker vid solmaximum, när fältet är som mest trassligt och kaotiskt.\n\n## Effekter på jorden\nSolcykler har många effekter på jorden och mänsklig teknik. Under solmaximum kan ökad solaktivitet störa radiokommunikation, skada satelliter, skapa strålningsrisker för astronauter och till och med orsaka strömavbrott. De spektakulära norrsken och sydsken blir mer frekventa och synliga på lägre latituder under dessa aktiva perioder.\n\nForskare har också identifierat potentiella kopplingar mellan solcykler och jordens klimat, även om dessa samband är komplexa och föremål för pågående forskning. Historiska register visar perioder av ovanligt låg solaktivitet, såsom Maunder Minimum (1645-1715), som sammanföll med en period av kallare temperaturer i Europa känd som "Lilla istiden." Att förstå dessa samband är fortfarande viktigt för klimatforskning.\n\n',
      createdAt: '2026-11-15',
      authors: [
        {
          lookupEmail: 'rigel@local.dev'
        }
      ],
      categories: [
        {
          lookupSlug: 'solar-activity'
        }
      ]
    },
    {
      title: 'Heliosfären',
      slug: 'the-heliosphere',
      content:
        '# Heliosfären\nHeliosfären är den enorma bubbelliknande regionen i rymden som domineras av solens magnetfält och solvind. Denna skyddande kappa skyddar vårt solsystem från den hårda interstellära strålningsmiljön och representerar solens sfär av fysisk påverkan.\n\nSolvinden—en ström av laddade partiklar som kontinuerligt strömmar utåt från solen i alla riktningar—skapar och upprätthåller heliosfären. När denna supersoniska vind färdas utåt, saktar den slutligen ner när den möter motstånd från det interstellära mediet, vilket bildar en gräns kallad termination shock. Bortom detta ligger heliosheath, en turbulent region där solvinden komprimeras och saktas ytterligare.\n\nDen yttersta gränsen för heliosfären är heliopausen, där trycket från solvinden balanserar med trycket från det interstellära mediet. Detta markerar den verkliga kanten av vårt solsystem när det gäller solens partikel- och magnetpåverkan. Bortom detta ligger interstellär rymd.\n\n## Utforskning och upptäckt\nÅr 2012 blev NASAs Voyager 1-rymdfarkost det första människotillverkade objektet att korsa heliopausen och gå in i interstellär rymd, följt av Voyager 2 år 2018. Dessa historiska korsningar gav oöverträffade data om gränsvillkoren mellan vårt solsystem och interstellär rymd.\n\nFormen på heliosfären har varit föremål för vetenskaplig debatt. Även om den ofta avbildas som kometliknande med en lång svans, tyder nyare forskning på att den kan vara mer sfärisk eller croissantformad. Interstellar Boundary Explorer (IBEX)-uppdraget har kartlagt gränsregionerna sedan 2008 och avslöjat oväntade funktioner, inklusive ett "band" av energirika neutrala atomer som verkar vara i linje med det lokala interstellära magnetfältet.\n\n',
      createdAt: '2026-12-01',
      authors: [
        {
          lookupEmail: 'rigel@local.dev'
        }
      ],
      categories: [
        {
          lookupSlug: 'solar-system'
        }
      ]
    },
    {
      title: 'Solens Atmosfär',
      slug: 'the-suns-atmosphere',
      content:
        '# Solens Atmosfär\nTill skillnad från jordens atmosfär med dess väldefinierade gräns, består solens atmosfär av flera distinkta lager som sträcker sig från dess synliga yta ut i rymden. Dessa lager uppvisar fascinerande och ibland kontraintuitiva egenskaper som fortsätter att utmana vår förståelse av stjärnfysik.\n\nFotosfären, eller solens synliga "yta", markerar det lägsta lagret av solens atmosfär. Detta relativt tunna lager (cirka 500 kilometer tjockt) har en temperatur på omkring 5 500°C (10 000°F) och är där det mesta av solens synliga ljus härstammar från. Fotosfärens granulära utseende avslöjar konvektionsceller där het plasma stiger, kyls och sjunker tillbaka.\n\nOvanför fotosfären ligger kromosfären, ett lager på cirka 2 000 kilometer som framträder som en tunn röd kant under totala solförmörkelser. Mot normalt förväntat, stiger temperaturen faktiskt genom kromosfären och når cirka 20 000°C vid dess övre gräns. Denna temperaturinversion representerar ett av de pågående mysterierna inom solfysiken.\n\n## Den Mystiska Koronan\nDet yttersta lagret av solens atmosfär är koronan, en tunn men extremt het region som sträcker sig miljontals kilometer ut i rymden. Med temperaturer som överstiger 1 miljon grader Celsius, är koronan mystiskt hundratals gånger varmare än lagren nedanför—ett fenomen känt som koronal uppvärmningsproblemet.\n\nKoronan är normalt osynlig på grund av fotosfärens överväldigande ljusstyrka, men blir spektakulärt synlig under totala solförmörkelser som en pärlvitt halo runt den mörklagda solen. Rymdbaserade instrument med koronografer, som blockerar solens skiva, tillåter forskare att studera koronan kontinuerligt. Koronan har ingen bestämd yttergräns och övergår gradvis till solvinden som fyller heliosfären.\n\n',
      createdAt: '2026-12-15',
      authors: [
        {
          lookupEmail: 'ross@local.dev'
        }
      ],
      categories: [
        {
          lookupSlug: 'solar-activity'
        }
      ]
    }
  ]
};

export default sun;
