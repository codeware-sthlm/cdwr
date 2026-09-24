import type { SiteDefinition } from '../site-definition';

/**
 * The Bamse workspace, as it is seeded in preview.
 *
 * Transcribed from `seed.preview.ts` and `custom-seed.ts` rather than
 * invented, so a preview deployment keeps showing what it showed before.
 *
 * Swedish, because the tenant is.
 */

export const bamse: SiteDefinition = {
  name: 'bamse',
  description: 'The Bamse workspace seeded in preview',

  forms: [
    {
      title: 'Contact',
      emailLabel: 'Din e-post',
      emailPlaceholder: 'du@exempel.se',
      submitLabel: 'Hör av dig',
      confirmation: 'Tack! Vi hör av oss inom kort.',
      subject: 'Nytt meddelande från {{email}}',
      emailTo: 'hello@bamse.dev'
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
      name: 'Filyta',
      slug: 'file-area',
      brand: { color: 'green-500', icon: 'EyeIcon' }
    }
  ],

  categories: [
    {
      name: 'Biodling',
      slug: 'biodling'
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
      name: 'Hem',
      slug: 'home',
      layout: [
        {
          blockType: 'hero',
          badge: 'Bamse',
          heading: 'Välkommen till Bamses värld',
          lede: 'Världens starkaste björn och hans trogna vänner – äventyr, vänskap och viktiga livslektioner.',
          actions: [
            {
              link: {
                type: 'custom',
                url: '/bamse',
                label: 'Möt Bamse',
                newTab: false
              },
              emphasis: 'primary'
            },
            {
              link: {
                type: 'custom',
                url: '/skalman',
                label: 'Träffa Skalman',
                newTab: false
              },
              emphasis: 'secondary'
            }
          ]
        },
        {
          blockType: 'feature-cards',
          eyebrow: 'Karaktärer',
          heading: 'Bamses vänner',
          intro:
            'Från världens starkaste björn till den kloka sköldpaddan – möt de älskade karaktärerna i Bamses värld.',
          columns: '3',
          items: [
            {
              brand: {
                icon: 'HeartIcon',
                color: 'yellow-500'
              },
              title: 'Bamse',
              description:
                'Världens starkaste björn, känd för sin vänlighet och sitt mod att hjälpa dem som behöver det.'
            },
            {
              brand: {
                icon: 'SparklesIcon',
                color: 'orange-400'
              },
              title: 'Lille Skutt',
              description:
                'Den modiga kaninen som alltid visar stort hjärtemod när det verkligen gäller.'
            },
            {
              brand: {
                icon: 'LightBulbIcon',
                color: 'teal-500'
              },
              title: 'Skalman',
              description:
                'Den kloke sköldpaddan vars uppfinningar och visdom är ovärderliga för gängets äventyr.'
            }
          ]
        },
        {
          blockType: 'callout',
          showMark: true,
          heading: 'Nyfiken på Bamse?',
          body: 'Utforska berättelserna om vänskap, mod och godhet i Bamses värld.',
          link: {
            type: 'custom',
            url: '/bamse',
            label: 'Läs mer',
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
    },
    {
      name: 'Bamse',
      slug: 'bamse',
      header: 'Bamse: Världens Starkaste Björn',
      layout: [
        {
          blockType: 'content',
          columns: [
            {
              size: 'full',
              richText: {
                markdown:
                  '## Om Bamse\n\nBamse är världens starkaste björn, känd för sin vänlighet och mod. Tillsammans med sina vänner, Lille Skutt och Skalman, upplever han många äventyr och lär ut viktiga livslektioner.\n\n## Styrka och Vänskap\n\nBamse använder sin styrka för att hjälpa andra och bekämpa orättvisor. Hans vänskap och lojalitet gör honom till en älskad hjälte i den svenska barnlitteraturen.'
              }
            }
          ]
        }
      ]
    },
    {
      name: 'Lille Skutt',
      slug: 'lille-skutt',
      header: 'Lille Skutt: Den Modiga Kaninen',
      layout: [
        {
          blockType: 'content',
          columns: [
            {
              size: 'full',
              richText: {
                markdown:
                  '## Om Lille Skutt\n\nLille Skutt är en modig kanin och en av Bamses bästa vänner. Trots sin rädsla för det mesta, visar han stort mod när det verkligen gäller.\n\n## Mod och Loajalitet\n\nLille Skutt är alltid där för att stödja Bamse och hans vänner. Hans mod och lojalitet gör honom till en viktig del av gänget och en älskad karaktär i Bamses värld.'
              }
            }
          ]
        }
      ]
    },
    {
      name: 'Skalman',
      slug: 'skalman',
      header: 'Skalman: Den Kloka Sköldpaddan',
      layout: [
        {
          blockType: 'content',
          columns: [
            {
              size: 'full',
              richText: {
                markdown:
                  '## Om Skalman\n\nSkalman är en klok sköldpadda och en av Bamses närmaste vänner. Han är känd för sina uppfinningar och sin kärlek till mat, särskilt pannkakor.\n\n## Visdom och Uppfinningsrikedom\n\nSkalman använder sin visdom och uppfinningsrikedom för att hjälpa Bamse och Lille Skutt i deras äventyr. Hans kloka råd och innovativa lösningar gör honom till en ovärderlig medlem av gänget.'
              }
            }
          ]
        }
      ]
    },
    {
      name: 'Vargen',
      slug: 'vargen',
      header: 'Vargen: Den Listiga Skurken',
      layout: [
        {
          blockType: 'content',
          columns: [
            {
              size: 'full',
              richText: {
                markdown:
                  '## Om Vargen\n\nVargen är den listiga skurken i Bamses värld. Trots sina många försök att stjäla Bamses dunderhonung, misslyckas han alltid på grund av sin egen klumpighet och Bamses styrka.\n\n## List och Komik\n\nVargens ständiga försök att överlista Bamse och hans vänner ger upphov till många komiska situationer. Hans envishet och misslyckanden gör honom till en underhållande karaktär i berättelserna.'
              }
            }
          ]
        }
      ]
    },
    {
      name: 'Farmor',
      slug: 'farmor',
      header: 'Farmor: Den Omtänksamma Äldre Damen',
      layout: [
        {
          blockType: 'content',
          columns: [
            {
              size: 'full',
              richText: {
                markdown:
                  '## Om Farmor\n\nFarmor är Bamses omtänksamma och kloka farmor. Hon tar hand om Bamse och hans vänner, och hennes kök är alltid fullt av god mat och kärlek.\n\n## Omtanke och Visdom\n\nFarmors kärlek och visdom är en viktig del av Bamses värld. Hon ger råd och stöd till Bamse och hans vänner, och hennes närvaro skapar en känsla av trygghet och värme i berättelserna.'
              }
            }
          ]
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
        lookupSlug: 'bamse'
      }
    },
    {
      reference: {
        relationTo: 'pages',
        lookupSlug: 'lille-skutt'
      }
    },
    {
      reference: {
        relationTo: 'pages',
        lookupSlug: 'skalman'
      }
    },
    {
      reference: {
        relationTo: 'pages',
        lookupSlug: 'vargen'
      }
    },
    {
      reference: {
        relationTo: 'pages',
        lookupSlug: 'farmor'
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
      title: 'Bamses Styrka',
      slug: 'bamses-styrka',
      content:
        '## Bamses Styrka\n\n> "Styrka kommer från vänskap och mod."\n\nBamse är världens starkaste björn:\n\n* Styrka från dunderhonung\n* Mod och vänskap\n* Skyddar de svaga\n* Lär ut viktiga värderingar\n\n## Äventyr och Lärdomar\n\nBamses äventyr:\n\n* Hjälper vänner i nöd\n* Bekämpar orättvisor\n* Lär ut moral och etik\n* Inspirerar till godhet\n\n> "Med styrka kommer ansvar."',
      createdAt: '2026-10-15',
      authors: [
        {
          lookupEmail: 'bamse@local.dev'
        }
      ],
      categories: [
        {
          lookupSlug: 'biodling'
        }
      ]
    },
    {
      title: 'Vänskapens Kraft',
      slug: 'vanskapens-kraft',
      content:
        '## Vänskapens Kraft\n\n> "Vänskap är den största styrkan."\n\nBamse och hans vänner visar:\n\n* Vikten av samarbete\n* Att stå upp för varandra\n* Att hjälpa de som behöver det mest\n* Att sprida godhet och vänlighet\n\n## Lärdomar\n\nVänskapens lärdomar:\n\n* Styrka genom gemenskap\n* Mod att göra det rätta\n* Att värdera och respektera andra\n* Att inspirera till positiva handlingar\n\n> "Med vänskap kommer ansvar."',
      createdAt: '2026-10-20',
      authors: [
        {
          lookupEmail: 'bamse@local.dev'
        }
      ]
    },
    {
      title: 'Skalman och Uppfinningarnas Värld',
      slug: 'skalman-och-uppfinningarnas-varld',
      content:
        '## Skalman och Uppfinningarnas Värld\n\n> "Uppfinningar gör världen bättre."\n\nSkalman är en mästare på uppfinningar:\n\n* Skapande av innovativa lösningar\n* Teknologiska framsteg\n* Vetenskapliga upptäckter\n* Inspirerar till kreativitet\n\n## Äventyr och Lärdomar\n\nSkalmans äventyr:\n\n* Hjälper vänner med uppfinningar\n* Löser problem med kreativitet\n* Lär ut vetenskap och teknik\n* Inspirerar till innovation\n\n> "Med kunskap kommer ansvar."',
      createdAt: '2026-10-25',
      authors: [
        {
          lookupEmail: 'bamse@local.dev'
        },
        {
          lookupEmail: 'skutt@local.dev'
        }
      ]
    },
    {
      title: 'Vargens List och Komik',
      slug: 'vargens-list-och-komik',
      content:
        '## Vargens List och Komik\n\n> "List och humor går hand i hand."\n\nVargen är känd för sin list och komik:\n\n* Skicklig på att lösa problem\n* Använder humor för att lätta upp stämningen\n* Inspirerar till kreativt tänkande\n* Lär ut vikten av att tänka utanför boxen\n\n## Äventyr och Lärdomar\n\nVargens äventyr:\n\n* Hjälper vänner med kluriga situationer\n* Löser problem med list\n* Lär ut vikten av humor och kreativitet\n* Inspirerar till positiva handlingar\n\n> "Med list och humor kommer ansvar."',
      createdAt: '2026-10-30',
      authors: [
        {
          lookupEmail: 'bamse@local.dev'
        },
        {
          lookupEmail: 'skutt@local.dev'
        }
      ]
    },
    {
      title: 'Farmors Omtanke och Visdom',
      slug: 'farmors-omtanke-och-visdom',
      content:
        '## Farmors Omtanke och Visdom\n\n> "Omtanke och visdom går hand i hand."\n\nFarmor är känd för sin omtanke och visdom:\n\n* Skicklig på att ge råd\n* Inspirerar till eftertanke\n* Lär ut vikten av empati\n* Inspirerar till godhet\n\n## Äventyr och Lärdomar\n\nFarmors äventyr:\n\n* Hjälper vänner med kloka råd\n* Löser problem med visdom\n* Lär ut vikten av omtanke och empati\n* Inspirerar till positiva handlingar\n\n> "Med omtanke och visdom kommer ansvar."',
      createdAt: '2026-11-05',
      authors: [
        {
          lookupEmail: 'skutt@local.dev'
        }
      ],
      categories: [
        {
          lookupSlug: 'biodling'
        }
      ]
    }
  ]
};

export default bamse;
