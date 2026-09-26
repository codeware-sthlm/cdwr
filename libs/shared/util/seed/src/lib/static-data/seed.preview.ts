// This file is custom generated and should not be edited unless necessary.

import { capitalize } from '@codeware/shared/util/pure';

import { faqData } from './faq-data';
import { readMediaFiles, readStockMediaFiles } from './read-media-files';

const tenantSlug = {
  bamse: 'bamse',
  marvel: 'marvel',
  starWars: 'star-wars'
} as const;

const tenant = {
  bamse: { apiKey: 'b1e5c8c9-8c9b-4a1d-9c3a-7f0e5d6a1b2c' },
  marvel: { apiKey: 'd6480d2c-a74c-4ecb-81c4-278dfd11cc1c' },
  starWars: { apiKey: '8a5af03d-7382-40af-bb75-ee12c62ace23' }
} as const;

const tenantApiKeys = Object.values(tenant).map((tenant) => tenant.apiKey);

// Extract the record values, which are the final string representations of the tenant slugs.
export type TenantSlug = (typeof tenantSlug)[keyof typeof tenantSlug];

/**
 * Seed data for **PREVIEW** environment.
 *
 * @param remoteDataUrl Required for seeding media files from remote URL.
 * @returns Base seed data for the application.
 */
export const seedData = (remoteDataUrl: string | undefined) => {
  const mediaFiles = readMediaFiles(remoteDataUrl);
  const stockFiles = Object.fromEntries(
    readStockMediaFiles(remoteDataUrl).map(({ filePath, filename }) => [
      filename,
      filePath
    ])
  );
  if (mediaFiles.length === 0) {
    console.error('No media files found for seeding.');
  }

  return {
    categories: [
      {
        name: 'Spacecrafts',
        slug: 'spacecrafts',
        tenant: { lookupApiKey: tenant.starWars.apiKey }
      },
      {
        name: 'Technology',
        slug: 'technology',
        tenant: { lookupApiKey: tenant.marvel.apiKey }
      },
      {
        name: 'Biodling',
        slug: 'biodling',
        tenant: { lookupApiKey: tenant.bamse.apiKey }
      }
    ],
    faq: faqData(),
    // All tenants are seeded with media files
    media: tenantApiKeys.flatMap((lookupApiKey) =>
      mediaFiles.map(({ filePath, filename }) => ({
        alt: capitalize(filename.replace(/-/g, ' ').replace(/\.[^/.]+$/, '')),
        external: true,
        filename,
        filePath,
        tags: [{ lookupSlug: 'file-area' }],
        tenant: { lookupApiKey }
      }))
    ),
    pages: [
      // =========
      // Star Wars
      // =========
      {
        name: 'Home',
        slug: 'home',
        tenant: { lookupApiKey: tenant.starWars.apiKey },
        hero: {
          badge: 'Star Wars',
          heading: 'Welcome to the Galaxy Archives',
          lede: 'Explore the stories of those who shaped the fate of the galaxy — from legendary Jedi Masters to brave Rebel leaders.',
          actions: [
            {
              link: { url: '/obi-wan-kenobi', label: 'Discover Obi-Wan' },
              emphasis: 'primary' as const
            },
            {
              link: { url: '/luke-skywalker', label: 'Luke Skywalker' },
              emphasis: 'secondary' as const
            }
          ]
        },
        featureCards: {
          eyebrow: 'Characters',
          heading: 'Iconic Heroes of the Galaxy',
          intro:
            'From Jedi Knights to rebel leaders, discover the remarkable individuals who determined the fate of a galaxy far, far away.',
          columns: '3' as const,
          items: [
            {
              brand: { icon: 'ShieldCheckIcon', color: 'blue-400' },
              title: 'Obi-Wan Kenobi',
              description:
                'Legendary Jedi Master whose training of Anakin and Luke Skywalker changed the fate of the galaxy.'
            },
            {
              brand: { icon: 'StarIcon', color: 'yellow-400' },
              title: 'Luke Skywalker',
              description:
                'Farm boy turned Jedi Knight whose belief in redemption brought balance to the Force.'
            },
            {
              brand: { icon: 'BoltIcon', color: 'red-500' },
              title: 'Darth Vader',
              description:
                "Dark Lord of the Sith and the Emperor's enforcer, with a destiny that shocked the galaxy."
            }
          ]
        },
        callout: {
          showMark: true,
          heading: 'May the Force be with you.',
          body: 'Read our in-depth articles on galactic history and the ways of the Force.',
          link: { url: '/obi-wan-kenobi', label: 'Read the archives' }
        }
      },
      {
        name: 'Obi-Wan',
        slug: 'obi-wan-kenobi',
        header: 'Obi-Wan Kenobi: The Legendary Jedi Master',
        layoutContent:
          "## The Negotiator\n\nObi-Wan Kenobi, also known as Ben Kenobi, was a legendary Jedi Master who served the Galactic Republic during its final years. Renowned for his skills as a negotiator, he earned his nickname through his preferred approach to conflict resolution.\n\n## Legacy of Training\n\nAs a Jedi Master, Obi-Wan was responsible for training Anakin Skywalker, who would later become Darth Vader. Years later, he would also become Luke Skywalker's first mentor in the ways of the Force, setting in motion events that would eventually lead to the fall of the Galactic Empire.",
        tenant: { lookupApiKey: tenant.starWars.apiKey }
      },
      {
        name: 'Leia',
        slug: 'princess-leia',
        header: 'Princess Leia Organa: Leader of the Rebellion',
        layoutContent:
          "## Royal Heritage\n\nPrincess Leia Organa of Alderaan was one of the Rebellion's greatest leaders. Adopted daughter of Bail and Breha Organa, she grew up as part of Alderaan's royal family while secretly being trained in politics and resistance.\n\n## Rebel Leader\n\nAs a leader of the Rebel Alliance, Leia demonstrated exceptional tactical ability and unwavering courage. Her diplomatic skills, combined with her fierce determination, made her an instrumental figure in the fight against the Empire.",
        tenant: { lookupApiKey: tenant.starWars.apiKey }
      },
      {
        name: 'Luke',
        slug: 'luke-skywalker',
        header: 'Luke Skywalker: The Last Jedi',
        layoutContent:
          '## Journey to Becoming a Jedi\n\nLuke Skywalker began his journey as a simple moisture farmer on Tatooine before discovering his connection to the Force. Under the guidance of Obi-Wan Kenobi and later Master Yoda, he embarked on the path to become a Jedi Knight.\n\n## Hero of the Rebellion\n\nAs the pilot who destroyed the first Death Star and later a full-fledged Jedi Knight, Luke became a symbol of hope for the Rebel Alliance. His unwavering belief in the good within his father ultimately led to the redemption of Anakin Skywalker and the downfall of the Empire.',
        tenant: { lookupApiKey: tenant.starWars.apiKey }
      },
      {
        name: 'Yoda',
        slug: 'master-yoda',
        header: 'Master Yoda: The Wise Jedi Master',
        layoutContent:
          '## Grand Master of the Jedi Order\n\nFor over 800 years, Yoda trained Jedi as the Grand Master of the Jedi Order. His wisdom, deep connection to the Force, and unique teaching methods helped shape generations of Jedi Knights.\n\n## Legacy of Wisdom\n\nEven in exile after the fall of the Republic, Yoda continued to serve the light side of the Force. His training of Luke Skywalker proved crucial in preserving the Jedi ways and ultimately bringing balance to the Force.',
        tenant: { lookupApiKey: tenant.starWars.apiKey }
      },
      {
        name: 'Darth Vader',
        slug: 'darth-vader',
        header: 'Darth Vader: Dark Lord of the Sith',
        layoutContent:
          "## Rise of Vader\n\nOnce a powerful Jedi Knight, Anakin Skywalker was seduced by the dark side of the Force and became Darth Vader. As the Emperor's chief enforcer, he helped hunt down the remaining Jedi and establish Imperial rule across the galaxy.\n\n## The Empire's Enforcer\n\nAs a Dark Lord of the Sith, Vader commanded the Empire's military might with terrifying efficiency. His mastery of the Force and tactical brilliance made him one of the most feared figures in the galaxy.",
        tenant: { lookupApiKey: tenant.starWars.apiKey }
      },
      // ======
      // Marvel
      // ======
      {
        name: 'Home',
        slug: 'home',
        tenant: { lookupApiKey: tenant.marvel.apiKey },
        hero: {
          badge: 'Marvel',
          heading: 'Welcome to the Marvel Universe',
          lede: "Earth's mightiest heroes, assembled. Explore the stories of remarkable individuals who protect our world from threats beyond imagination.",
          actions: [
            {
              link: { url: '/iron-man', label: 'Meet the Avengers' },
              emphasis: 'primary' as const
            },
            {
              link: { url: '/spider-man', label: 'Spider-Man' },
              emphasis: 'secondary' as const
            }
          ]
        },
        featureCards: {
          eyebrow: 'Heroes',
          heading: "Earth's Mightiest Heroes",
          intro:
            "From genius inventors to gods of thunder, the Avengers represent humanity's best defence against the forces of evil.",
          columns: '3' as const,
          items: [
            {
              brand: { icon: 'CpuChipIcon', color: 'red-500' },
              title: 'Iron Man',
              description:
                'Genius inventor Tony Stark built a suit of armour and became a founding Avenger.'
            },
            {
              brand: { icon: 'BoltIcon', color: 'yellow-400' },
              title: 'Thor',
              description:
                'Asgardian God of Thunder, wielding Mjolnir as a bridge between two worlds.'
            },
            {
              brand: { icon: 'ShieldCheckIcon', color: 'blue-600' },
              title: 'Black Widow',
              description:
                'Elite spy Natasha Romanoff whose skills and loyalty have saved the world countless times.'
            }
          ]
        },
        callout: {
          showMark: true,
          heading: 'Avengers, assemble.',
          body: "Dive into the science, history and stories behind Marvel's most iconic characters.",
          link: { url: '/iron-man', label: 'Explore the universe' }
        }
      },
      {
        name: 'Iron Man',
        slug: 'iron-man',
        header: 'Tony Stark: The Armored Avenger',
        layoutContent:
          '## Genius Inventor\n\nTony Stark transformed from a brilliant weapons inventor into a hero who would reshape the future of technology and heroism. His revolutionary Iron Man suit represents the pinnacle of human innovation and determination.\n\n## Leader and Protector\n\nAs a founding member of the Avengers, Tony has dedicated his genius and resources to protecting Earth. His journey from self-centered businessman to selfless hero has inspired generations.',
        tenant: { lookupApiKey: tenant.marvel.apiKey }
      },
      {
        name: 'Thor',
        slug: 'thor',
        header: 'Thor: God of Thunder',
        layoutContent:
          "## Asgardian Heritage\n\nThor, son of Odin, wields the mighty hammer Mjolnir as the God of Thunder. His journey between Asgard and Earth has made him a unique bridge between two worlds.\n\n## Mighty Avenger\n\nAs one of Earth's mightiest heroes, Thor brings both godlike power and noble wisdom to the defense of humanity. His growth from an arrogant prince to a humble protector demonstrates the true meaning of worthiness.",
        tenant: { lookupApiKey: tenant.marvel.apiKey }
      },
      {
        name: 'Spider-Man',
        slug: 'spider-man',
        header: 'Peter Parker: The Amazing Spider-Man',
        layoutContent:
          '## Origin Story\n\nBitten by a radioactive spider, Peter Parker gained extraordinary abilities. Living by his uncle\'s words that "with great power comes great responsibility," he became one of New York\'s greatest protectors.\n\n## Friendly Neighborhood Hero\n\nBalancing everyday life with heroic duties, Spider-Man represents the best of both worlds. His wit, intelligence, and unwavering sense of responsibility make him a unique figure in the superhero community.',
        tenant: { lookupApiKey: tenant.marvel.apiKey }
      },
      {
        name: 'Black Widow',
        slug: 'black-widow',
        header: 'Natasha Romanoff: Master Spy and Avenger',
        layoutContent:
          "## Elite Agent\n\nNatasha Romanoff's journey from Russian spy to Avenger is a testament to the power of redemption. Her unparalleled skills in espionage and combat make her one of the world's deadliest operatives.\n\n## Heart of the Team\n\nDespite lacking superhuman powers, Black Widow's strategic mind and unwavering loyalty have made her essential to the Avengers. Her sacrifices and dedication have helped save the world numerous times.",
        tenant: { lookupApiKey: tenant.marvel.apiKey }
      },
      {
        name: 'Hulk',
        slug: 'hulk',
        header: 'Bruce Banner: The Incredible Hulk',
        layoutContent:
          "## Scientific Genius\n\nDr. Bruce Banner's exposure to gamma radiation transformed him into the incredibly powerful Hulk. His struggle to balance his brilliant scientific mind with the raw power of the Hulk defines his unique journey.\n\n## Strongest Avenger\n\nDespite being feared by many, the Hulk has proven himself a hero time and again. Banner's scientific genius combined with Hulk's raw strength makes him one of Earth's most formidable defenders.",
        tenant: { lookupApiKey: tenant.marvel.apiKey }
      },
      // =====
      // Bamse
      // =====
      {
        name: 'Hem',
        slug: 'home',
        tenant: { lookupApiKey: tenant.bamse.apiKey },
        hero: {
          badge: 'Bamse',
          heading: 'Välkommen till Bamses värld',
          lede: 'Världens starkaste björn och hans trogna vänner – äventyr, vänskap och viktiga livslektioner.',
          actions: [
            {
              link: { url: '/bamse', label: 'Möt Bamse' },
              emphasis: 'primary' as const
            },
            {
              link: { url: '/skalman', label: 'Träffa Skalman' },
              emphasis: 'secondary' as const
            }
          ]
        },
        featureCards: {
          eyebrow: 'Karaktärer',
          heading: 'Bamses vänner',
          intro:
            'Från världens starkaste björn till den kloka sköldpaddan – möt de älskade karaktärerna i Bamses värld.',
          columns: '3' as const,
          items: [
            {
              brand: { icon: 'HeartIcon', color: 'yellow-500' },
              title: 'Bamse',
              description:
                'Världens starkaste björn, känd för sin vänlighet och sitt mod att hjälpa dem som behöver det.'
            },
            {
              brand: { icon: 'SparklesIcon', color: 'orange-400' },
              title: 'Lille Skutt',
              description:
                'Den modiga kaninen som alltid visar stort hjärtemod när det verkligen gäller.'
            },
            {
              brand: { icon: 'LightBulbIcon', color: 'teal-500' },
              title: 'Skalman',
              description:
                'Den kloke sköldpaddan vars uppfinningar och visdom är ovärderliga för gängets äventyr.'
            }
          ]
        },
        callout: {
          showMark: true,
          heading: 'Nyfiken på Bamse?',
          body: 'Utforska berättelserna om vänskap, mod och godhet i Bamses värld.',
          link: { url: '/bamse', label: 'Läs mer' }
        }
      },
      {
        name: 'Bamse',
        slug: 'bamse',
        header: 'Bamse: Världens Starkaste Björn',
        layoutContent:
          '## Om Bamse\n\nBamse är världens starkaste björn, känd för sin vänlighet och mod. Tillsammans med sina vänner, Lille Skutt och Skalman, upplever han många äventyr och lär ut viktiga livslektioner.\n\n## Styrka och Vänskap\n\nBamse använder sin styrka för att hjälpa andra och bekämpa orättvisor. Hans vänskap och lojalitet gör honom till en älskad hjälte i den svenska barnlitteraturen.',
        tenant: { lookupApiKey: tenant.bamse.apiKey }
      },
      {
        name: 'Lille Skutt',
        slug: 'lille-skutt',
        header: 'Lille Skutt: Den Modiga Kaninen',
        layoutContent:
          '## Om Lille Skutt\n\nLille Skutt är en modig kanin och en av Bamses bästa vänner. Trots sin rädsla för det mesta, visar han stort mod när det verkligen gäller.\n\n## Mod och Loajalitet\n\nLille Skutt är alltid där för att stödja Bamse och hans vänner. Hans mod och lojalitet gör honom till en viktig del av gänget och en älskad karaktär i Bamses värld.',
        tenant: { lookupApiKey: tenant.bamse.apiKey }
      },
      {
        name: 'Skalman',
        slug: 'skalman',
        header: 'Skalman: Den Kloka Sköldpaddan',
        layoutContent:
          '## Om Skalman\n\nSkalman är en klok sköldpadda och en av Bamses närmaste vänner. Han är känd för sina uppfinningar och sin kärlek till mat, särskilt pannkakor.\n\n## Visdom och Uppfinningsrikedom\n\nSkalman använder sin visdom och uppfinningsrikedom för att hjälpa Bamse och Lille Skutt i deras äventyr. Hans kloka råd och innovativa lösningar gör honom till en ovärderlig medlem av gänget.',
        tenant: { lookupApiKey: tenant.bamse.apiKey }
      },
      {
        name: 'Vargen',
        slug: 'vargen',
        header: 'Vargen: Den Listiga Skurken',
        layoutContent:
          '## Om Vargen\n\nVargen är den listiga skurken i Bamses värld. Trots sina många försök att stjäla Bamses dunderhonung, misslyckas han alltid på grund av sin egen klumpighet och Bamses styrka.\n\n## List och Komik\n\nVargens ständiga försök att överlista Bamse och hans vänner ger upphov till många komiska situationer. Hans envishet och misslyckanden gör honom till en underhållande karaktär i berättelserna.',
        tenant: { lookupApiKey: tenant.bamse.apiKey }
      },
      {
        name: 'Farmor',
        slug: 'farmor',
        header: 'Farmor: Den Omtänksamma Äldre Damen',
        layoutContent:
          '## Om Farmor\n\nFarmor är Bamses omtänksamma och kloka farmor. Hon tar hand om Bamse och hans vänner, och hennes kök är alltid fullt av god mat och kärlek.\n\n## Omtanke och Visdom\n\nFarmors kärlek och visdom är en viktig del av Bamses värld. Hon ger råd och stöd till Bamse och hans vänner, och hennes närvaro skapar en känsla av trygghet och värme i berättelserna.',
        tenant: { lookupApiKey: tenant.bamse.apiKey }
      }
    ],
    stockMedia: [
      {
        alt: 'A vineyard hut among green vines above a wide plain',
        subject: 'vineyard hut',
        credit: 'FLUX 1.1 pro ultra via Replicate',
        licence: 'AI generated — commercial use permitted',
        filename: 'stock-hut-1.jpg',
        filePath: stockFiles['stock-hut-1.jpg']
      },
      {
        alt: 'A stone vineyard hut on a slope under soft overcast light',
        subject: 'vineyard hut',
        credit: 'FLUX 1.1 pro ultra via Replicate',
        licence: 'AI generated — commercial use permitted',
        filename: 'stock-hut-2.jpg',
        filePath: stockFiles['stock-hut-2.jpg']
      },
      {
        alt: 'A river loop below vineyard slopes, village on the bend',
        subject: 'river valley',
        credit: 'FLUX 1.1 pro ultra via Replicate',
        licence: 'AI generated — commercial use permitted',
        filename: 'stock-rivervalley-1.jpg',
        filePath: stockFiles['stock-rivervalley-1.jpg']
      },
      {
        alt: 'A river loop seen over a dry stone wall from the vineyards',
        subject: 'river valley',
        credit: 'FLUX 1.1 pro ultra via Replicate',
        licence: 'AI generated — commercial use permitted',
        filename: 'stock-rivervalley-2.jpg',
        filePath: stockFiles['stock-rivervalley-2.jpg']
      },
      {
        alt: 'Rolling vineyard country framed by vine leaves',
        subject: 'rolling hills',
        credit: 'FLUX 1.1 pro ultra via Replicate',
        licence: 'AI generated — commercial use permitted',
        filename: 'stock-rollinghills-2.jpg',
        filePath: stockFiles['stock-rollinghills-2.jpg']
      },
      {
        alt: 'Steep terraced vineyards above a valley town',
        subject: 'terraces',
        credit: 'FLUX 1.1 pro ultra via Replicate',
        licence: 'AI generated — commercial use permitted',
        filename: 'stock-terraces-1.jpg',
        filePath: stockFiles['stock-terraces-1.jpg']
      },
      {
        alt: 'Terraced vineyard slopes under a pale overcast sky',
        subject: 'terraces',
        credit: 'FLUX 1.1 pro ultra via Replicate',
        licence: 'AI generated — commercial use permitted',
        filename: 'stock-terraces-2.jpg',
        filePath: stockFiles['stock-terraces-2.jpg']
      },
      {
        alt: 'Layered vineyard terraces rising up a valley side',
        subject: 'terraces',
        credit: 'FLUX 1.1 pro ultra via Replicate',
        licence: 'AI generated — commercial use permitted',
        filename: 'stock-terraces-3.jpg',
        filePath: stockFiles['stock-terraces-3.jpg']
      },
      {
        alt: 'A wine village with a church spire below green slopes',
        subject: 'village',
        credit: 'FLUX 1.1 pro ultra via Replicate',
        licence: 'AI generated — commercial use permitted',
        filename: 'stock-village-1.jpg',
        filePath: stockFiles['stock-village-1.jpg']
      },
      {
        alt: 'Red tiled roofs of a wine village seen through vine leaves',
        subject: 'village',
        credit: 'FLUX 1.1 pro ultra via Replicate',
        licence: 'AI generated — commercial use permitted',
        filename: 'stock-village-2.jpg',
        filePath: stockFiles['stock-village-2.jpg']
      },
      {
        alt: 'A village church spire above the vineyards',
        subject: 'village',
        credit: 'FLUX 1.1 pro ultra via Replicate',
        licence: 'AI generated — commercial use permitted',
        filename: 'stock-village-3.jpg',
        filePath: stockFiles['stock-village-3.jpg']
      },
      {
        alt: 'Trellised vine rows running toward distant hills',
        subject: 'vine rows',
        credit: 'FLUX 1.1 pro ultra via Replicate',
        licence: 'AI generated — commercial use permitted',
        filename: 'stock-vinerows-1.jpg',
        filePath: stockFiles['stock-vinerows-1.jpg']
      },
      {
        alt: 'Vine rows behind a dry stone wall on a hillside',
        subject: 'vine rows',
        credit: 'FLUX 1.1 pro ultra via Replicate',
        licence: 'AI generated — commercial use permitted',
        filename: 'stock-vinerows-2.jpg',
        filePath: stockFiles['stock-vinerows-2.jpg']
      }
    ],
    places: [
      {
        name: 'Mos Eisley Cantina',
        kind: 'restaurant',
        url: 'https://example.com/mos-eisley-cantina',
        note: 'Loud, cheap and open late.',
        tenant: { lookupApiKey: tenant.starWars.apiKey }
      },
      {
        name: 'Lars Homestead',
        kind: 'activity',
        url: 'https://example.com/lars-homestead',
        note: 'Moisture farm on the edge of the dune sea.',
        tenant: { lookupApiKey: tenant.starWars.apiKey }
      },
      {
        name: 'Golden City Design Halls',
        kind: 'activity',
        url: 'https://example.com/design-halls',
        note: 'Guided afternoons only, no photography.',
        tenant: { lookupApiKey: tenant.marvel.apiKey }
      },
      {
        name: 'Border Tribe Camp',
        kind: 'hotel',
        url: 'https://example.com/border-tribe-camp',
        note: 'Canvas and high grazing country.',
        tenant: { lookupApiKey: tenant.marvel.apiKey }
      },
      {
        name: 'Stugbyn vid tjärnen',
        kind: 'hotel',
        url: 'https://example.com/stugbyn',
        note: 'Stugor med plats för hela familjen.',
        tenant: { lookupApiKey: tenant.bamse.apiKey }
      }
    ],
    posts: [
      {
        title: 'The Rise and Fall of the Empire',
        slug: 'rise-and-fall-of-empire',
        createdAt: '2026-09-01',
        authors: [{ lookupEmail: 'yoda@local.dev' }],
        categories: [],
        content:
          '## The Birth of Imperial Rule\n\nThe transformation of the Republic into the Empire stands as one of the most significant events in galactic history.\n\n> "So this is how liberty dies... with thunderous applause." - Padmé Amidala\n\nThe key factors that enabled Palpatine\'s rise to power:\n\n* The manipulation of the Trade Federation\n* The engineered Clone Wars\n* The systematic dismantling of democratic institutions\n* The turning of Anakin Skywalker\n\n## The Rebellion Rises\n\nFrom the ashes of the Republic, hope emerged. The Rebel Alliance formed from:\n\n* Disillusioned Senators\n* Former Republic military officers\n* Oppressed planetary systems\n* Idealistic freedom fighters\n\n> "The more you tighten your grip, Tarkin, the more star systems will slip through your fingers."\n\n## Legacy\n\nThe Empire\'s fall teaches us that:\n\n* No military might can overcome the will of free peoples\n* Hope remains strongest in the darkest times\n* The light side of the Force will always prevail',
        tenant: { lookupApiKey: tenant.starWars.apiKey }
      },
      {
        title: 'Jedi Training Methods',
        slug: 'jedi-training-methods',
        createdAt: '2026-09-15',
        authors: [{ lookupEmail: 'luke@local.dev' }],
        categories: [],
        content:
          '## Traditional Approaches\n\n> "A Jedi must have the deepest commitment, the most serious mind." - Master Yoda\n\nThe path to becoming a Jedi requires:\n\n* Meditation and Force attunement\n* Lightsaber combat training\n* Study of Jedi philosophy\n* Practical application of Force abilities\n\n## Modern Adaptations\n\nThe changing galaxy has necessitated new training methods:\n\n* Accelerated combat training\n* Focus on practical Force applications\n* Emphasis on stealth and survival\n* Integration of modern technology\n\n> "Your focus determines your reality."\n\nRemember that the Force:\n\n* Flows through all living things\n* Requires balance and harmony\n* Demands patience and discipline',
        tenant: { lookupApiKey: tenant.starWars.apiKey }
      },
      {
        title: 'Spacecraft of the Rebellion',
        slug: 'spacecraft-of-rebellion',
        createdAt: '2026-09-30',
        authors: [
          { lookupEmail: 'luke@local.dev' },
          { lookupEmail: 'yoda@local.dev' }
        ],
        categories: [{ lookupSlug: 'spacecrafts' }],
        content:
          '## Famous Vessels\n\nThe Rebel Alliance relied on various spacecraft to combat the Empire:\n\n* X-wing Starfighter\n  * Versatile and agile\n  * Equipped with hyperdrive\n  * Proven track record\n* Y-wing Bomber  * Durable design\n  * Heavy payload capacity\n\n> "She may not look like much, but she\'s got it where it counts, kid."\n\n## Iconic Modifications\n\nThe most successful modifications included:\n\n* Enhanced shield generators\n* Modified weapon systems\n* Upgraded navigation computers\n\n> "Great shot kid, that was one in a million!"\n\nMaintenance tips:\n\n* Regular hyperdrive alignment\n* Frequent shield calibration\n* Careful power distribution',
        tenant: { lookupApiKey: tenant.starWars.apiKey }
      },
      {
        title: 'Evolution of the Avengers',
        slug: 'evolution-of-avengers',
        createdAt: '2026-10-05',
        authors: [{ lookupEmail: 'thor@local.dev' }],
        categories: [],
        content:
          '## The Initiative\n\n> "There was an idea... to bring together a group of remarkable people."\n\nThe original team formed from:\n\n* Tony Stark - Technical genius\n* Steve Rogers - Natural leader\n* Thor - Asgardian strength\n* Bruce Banner - Scientific brilliance\n* Natasha Romanoff - Strategic expertise\n* Clint Barton - Precision and skill\n\n## Team Dynamics\n\nKey factors in the team\'s success:\n\n* Complementary abilities\n* Trust building\n* Shared mission focus\n* Adaptability in crisis\n\n> "We may not be able to save the Earth, but you can be damn sure we\'ll avenge it."\n\nLessons learned:\n\n* Unity overcomes individual limitations\n* Leadership requires sacrifice\n* Heroes can come from anywhere',
        tenant: { lookupApiKey: tenant.marvel.apiKey }
      },
      {
        title: 'Science of Super Soldiers',
        slug: 'science-of-super-soldiers',
        createdAt: '2026-10-10',
        authors: [{ lookupEmail: 'hulk@local.dev' }],
        categories: [],
        content:
          '## Historical Development\n\nThe super soldier program revolutionized human enhancement:\n\n* Dr. Erskine\'s Original Formula\n  * Enhanced strength\n  * Improved agility\n  * Accelerated healing\n* Modern Attempts\n  * Various successes and failures\n  * Ethical considerations\n\n> "The serum amplifies everything that is inside. Good becomes great; bad becomes worse."\n\n## Current Research\n\nAreas of ongoing investigation:\n\n* Genetic modification\n* Biological enhancement\n* Technological integration\n* Neural advancement\n\n> "Our very strength invites challenge. Challenge incites conflict. And conflict... breeds catastrophe."',
        tenant: { lookupApiKey: tenant.marvel.apiKey }
      },
      {
        title: 'Tech Revolution',
        slug: 'tech-revolution',
        createdAt: '2026-10-12',
        authors: [{ lookupEmail: 'hulk@local.dev' }],
        categories: [{ lookupSlug: 'technology' }],
        content:
          '## Arc Reactor Technology\n\n> "Sometimes you gotta run before you can walk."\n\nKey innovations include:\n\n* Miniaturized power sources\n* Clean energy applications\n* Advanced propulsion systems\n* Neural interface developments\n\n## Future of Combat Suits\n\nNext-generation features:\n\n* Nano-tech integration\n* AI-driven responses\n* Adaptive armor systems\n* Multi-environment functionality\n\n> "The suit and I are one."\n\nSafety protocols:\n\n* Biometric security\n* Emergency protocols\n* Power management\n* Environmental controls',
        tenant: { lookupApiKey: tenant.marvel.apiKey }
      },
      // =====
      // Bamse
      // =====
      {
        title: 'Bamses Styrka',
        slug: 'bamses-styrka',
        createdAt: '2026-10-15',
        authors: [{ lookupEmail: 'bamse@local.dev' }],
        categories: [{ lookupSlug: 'biodling' }],
        content:
          '## Bamses Styrka\n\n> "Styrka kommer från vänskap och mod."\n\nBamse är världens starkaste björn:\n\n* Styrka från dunderhonung\n* Mod och vänskap\n* Skyddar de svaga\n* Lär ut viktiga värderingar\n\n## Äventyr och Lärdomar\n\nBamses äventyr:\n\n* Hjälper vänner i nöd\n* Bekämpar orättvisor\n* Lär ut moral och etik\n* Inspirerar till godhet\n\n> "Med styrka kommer ansvar."',
        tenant: { lookupApiKey: tenant.bamse.apiKey }
      },
      {
        title: 'Vänskapens Kraft',
        slug: 'vanskapens-kraft',
        createdAt: '2026-10-20',
        authors: [{ lookupEmail: 'bamse@local.dev' }],
        categories: [],
        content:
          '## Vänskapens Kraft\n\n> "Vänskap är den största styrkan."\n\nBamse och hans vänner visar:\n\n* Vikten av samarbete\n* Att stå upp för varandra\n* Att hjälpa de som behöver det mest\n* Att sprida godhet och vänlighet\n\n## Lärdomar\n\nVänskapens lärdomar:\n\n* Styrka genom gemenskap\n* Mod att göra det rätta\n* Att värdera och respektera andra\n* Att inspirera till positiva handlingar\n\n> "Med vänskap kommer ansvar."',
        tenant: { lookupApiKey: tenant.bamse.apiKey }
      },
      {
        title: 'Skalman och Uppfinningarnas Värld',
        slug: 'skalman-och-uppfinningarnas-varld',
        createdAt: '2026-10-25',
        authors: [
          { lookupEmail: 'bamse@local.dev' },
          { lookupEmail: 'skutt@local.dev' }
        ],
        categories: [],
        content:
          '## Skalman och Uppfinningarnas Värld\n\n> "Uppfinningar gör världen bättre."\n\nSkalman är en mästare på uppfinningar:\n\n* Skapande av innovativa lösningar\n* Teknologiska framsteg\n* Vetenskapliga upptäckter\n* Inspirerar till kreativitet\n\n## Äventyr och Lärdomar\n\nSkalmans äventyr:\n\n* Hjälper vänner med uppfinningar\n* Löser problem med kreativitet\n* Lär ut vetenskap och teknik\n* Inspirerar till innovation\n\n> "Med kunskap kommer ansvar."',
        tenant: { lookupApiKey: tenant.bamse.apiKey }
      },
      {
        title: 'Vargens List och Komik',
        slug: 'vargens-list-och-komik',
        createdAt: '2026-10-30',
        authors: [
          { lookupEmail: 'bamse@local.dev' },
          { lookupEmail: 'skutt@local.dev' }
        ],
        categories: [],
        content:
          '## Vargens List och Komik\n\n> "List och humor går hand i hand."\n\nVargen är känd för sin list och komik:\n\n* Skicklig på att lösa problem\n* Använder humor för att lätta upp stämningen\n* Inspirerar till kreativt tänkande\n* Lär ut vikten av att tänka utanför boxen\n\n## Äventyr och Lärdomar\n\nVargens äventyr:\n\n* Hjälper vänner med kluriga situationer\n* Löser problem med list\n* Lär ut vikten av humor och kreativitet\n* Inspirerar till positiva handlingar\n\n> "Med list och humor kommer ansvar."',
        tenant: { lookupApiKey: tenant.bamse.apiKey }
      },
      {
        title: 'Farmors Omtanke och Visdom',
        slug: 'farmors-omtanke-och-visdom',
        createdAt: '2026-11-05',
        authors: [{ lookupEmail: 'skutt@local.dev' }],
        categories: [{ lookupSlug: 'biodling' }],
        content:
          '## Farmors Omtanke och Visdom\n\n> "Omtanke och visdom går hand i hand."\n\nFarmor är känd för sin omtanke och visdom:\n\n* Skicklig på att ge råd\n* Inspirerar till eftertanke\n* Lär ut vikten av empati\n* Inspirerar till godhet\n\n## Äventyr och Lärdomar\n\nFarmors äventyr:\n\n* Hjälper vänner med kloka råd\n* Löser problem med visdom\n* Lär ut vikten av omtanke och empati\n* Inspirerar till positiva handlingar\n\n> "Med omtanke och visdom kommer ansvar."',
        tenant: { lookupApiKey: tenant.bamse.apiKey }
      }
    ],
    // All tenants get file area and color-coded tags for testing purposes
    tags: tenantApiKeys.flatMap((lookupApiKey) => {
      const isBamse = lookupApiKey === tenant.bamse.apiKey;
      return [
        {
          name: isBamse ? 'Indigo' : 'Indigo',
          slug: 'indigo',
          brand: { color: 'indigo-500', icon: 'TagIcon' },
          tenant: { lookupApiKey }
        },
        {
          name: isBamse ? 'Orange' : 'Orange',
          slug: 'orange',
          brand: { color: 'orange-500', icon: 'TagIcon' },
          tenant: { lookupApiKey }
        },
        {
          name: isBamse ? 'Teal' : 'Teal',
          slug: 'teal',
          brand: { color: 'teal-500', icon: 'TagIcon' },
          tenant: { lookupApiKey }
        },
        {
          name: isBamse ? 'Filyta' : 'File area',
          slug: 'file-area',
          brand: { color: 'green-500', icon: 'EyeIcon' },
          tenant: { lookupApiKey }
        }
      ];
    }),
    tenants: [
      {
        name: 'Star Wars',
        slug: tenantSlug.starWars,
        // The tenant the `demo` deployment serves in preview
        deployment: 'demo',
        description: 'Star Wars inspired tenant.',
        locale: 'en',
        supportedLocales: ['en', 'sv'],
        apiKey: tenant.starWars.apiKey
      },
      {
        name: 'Marvel',
        slug: tenantSlug.marvel,
        description: 'Marvel inspired tenant.',
        locale: 'en',
        supportedLocales: ['en', 'sv'],
        apiKey: tenant.marvel.apiKey
      },
      {
        name: 'Bamse',
        slug: tenantSlug.bamse,
        description: 'Bamse-inspirerad tenant.',
        locale: 'sv',
        supportedLocales: ['sv'],
        apiKey: tenant.bamse.apiKey
      }
    ],
    tours: [
      {
        title: 'Tatooine Twin Sunset Tour',
        slug: 'tatooine-twin-sunset-tour',
        summary:
          'Five days in the dune sea, ending each evening with two suns going down at once.',
        destination: 'Mos Eisley, Tatooine',
        duration: '5 days',
        price: 1900,
        currency: 'EUR',
        departureDate: '2027-05-10',
        bookingDeadline: '2027-03-10',
        heroImage: 'stock-rollinghills-2.jpg',
        intent: 'booking' as const,
        included: [
          'All ground transfers',
          'Four nights, full board',
          'Local guide'
        ],
        notIncluded: ['Flights', 'Personal insurance'],
        itinerary: [
          {
            places: ['Mos Eisley Cantina'],
            title: 'Arrival & cantina dinner',
            description: 'Landing at the spaceport and a first meal in town.'
          },
          {
            places: ['Lars Homestead'],
            title: 'The dune sea',
            description:
              'Skiff across the sand with a stop at the old homestead.'
          },
          {
            title: 'Jundland Wastes',
            description:
              'Rock formations, moisture farms and a very careful guide.'
          },
          {
            title: 'Podracing canyon',
            description:
              'The Boonta Eve course, walked at a safe and human pace.'
          },
          {
            title: 'Departure',
            description: 'One last sunset, then the ride out.'
          }
        ],
        content:
          "## What's included\nAll ground transfers, four nights, full board and a guide who knows which caves to avoid.\n\n## Good to know\nDaytime temperatures are extreme. Travel is scheduled around them.\n",
        tenant: { lookupApiKey: tenant.starWars.apiKey }
      },
      {
        title: 'Wakanda Highlands Trek',
        slug: 'wakanda-highlands-trek',
        summary:
          'Six days across the terraces and the border tribe lands, ending in the golden city.',
        destination: 'Wakanda',
        duration: '6 days',
        price: 2600,
        currency: 'EUR',
        departureDate: '2027-09-06',
        bookingDeadline: '2027-07-06',
        heroImage: 'stock-terraces-3.jpg',
        intent: 'booking' as const,
        included: [
          'Five nights, all meals',
          'Permits',
          'Local guide throughout'
        ],
        notIncluded: ['Flights', 'Personal insurance'],
        itinerary: [
          {
            title: 'Arrival',
            description:
              'Transfer from the border and an evening with our hosts.'
          },
          {
            title: 'The terraces',
            description:
              'Walking the farmed slopes with the families who work them.'
          },
          {
            title: 'River day',
            description: 'Down to the falls, with time to swim.'
          },
          {
            places: ['Border Tribe Camp'],
            title: 'Border lands',
            description: 'High grazing country and a night under canvas.'
          },
          {
            places: ['Golden City Design Halls'],
            title: 'The golden city',
            description:
              'Into the capital, with a guided afternoon in the design halls.'
          },
          {
            title: 'Departure',
            description: 'A slow morning before the flight home.'
          }
        ],
        content:
          "## What's included\nFive nights, all meals, permits and a local guide throughout.\n\n## Good to know\nPhotography is restricted in parts of the capital. Your guide will say where.\n",
        tenant: { lookupApiKey: tenant.marvel.apiKey }
      },
      {
        title: 'Skogsvandring i Bamses dalar',
        slug: 'skogsvandring-i-bamses-dalar',
        summary:
          'Tre dagar i skogen för hela familjen, med dunderhonung till frukost.',
        destination: 'Höga skogen, Sverige',
        duration: '3 dagar',
        price: 4200,
        currency: 'SEK',
        departureDate: '2027-07-19',
        bookingDeadline: '2027-05-19',
        heroImage: 'stock-hut-2.jpg',
        intent: 'booking' as const,
        included: ['Två nätter i stuga', 'Alla måltider', 'Guide'],
        notIncluded: ['Resa till och från stugbyn'],
        itinerary: [
          {
            places: ['Stugbyn vid tjärnen'],
            title: 'Ankomst och lägereld',
            description:
              'Incheckning i stugbyn och korvgrillning när det mörknar.'
          },
          {
            title: 'Vandring till berget',
            description: 'En lugn dagsvandring med matsäck och bad i tjärnen.'
          },
          {
            title: 'Hemfärd',
            description: 'Frukost, avslutande lek och hemresa.'
          }
        ],
        content:
          '## Det här ingår\nTvå nätter i stuga, alla måltider och en guide som tycker om barn.\n\n## Bra att veta\nPassar barn från fyra år. Ta med stövlar.\n',
        tenant: { lookupApiKey: tenant.bamse.apiKey }
      }
    ],
    users: [
      // =========
      // Star Wars
      // =========
      {
        name: 'Yoda',
        description: 'Admin access to Star Wars',
        email: 'yoda@local.dev',
        password: '',
        role: 'user',
        locale: 'en',
        tenants: [
          {
            lookupApiKey: tenant.starWars.apiKey,
            role: 'admin'
          }
        ]
      },
      {
        name: 'Luke',
        description: 'User access to Star Wars',
        email: 'luke@local.dev',
        password: '',
        role: 'user',
        locale: 'en',
        tenants: [{ lookupApiKey: tenant.starWars.apiKey, role: 'user' }]
      },
      // ======
      // Marvel
      // ======
      {
        name: 'Hulk',
        description: 'Admin access to Marvel',
        email: 'hulk@local.dev',
        password: '',
        role: 'user',
        locale: 'en',
        tenants: [
          {
            lookupApiKey: tenant.marvel.apiKey,
            role: 'admin'
          }
        ]
      },
      {
        name: 'Thor',
        description: 'User access to Marvel',
        email: 'thor@local.dev',
        password: '',
        role: 'user',
        locale: 'en',
        tenants: [{ lookupApiKey: tenant.marvel.apiKey, role: 'user' }]
      },
      // =====
      // Bamse
      // =====
      {
        name: 'Bamse',
        description: 'Admin access to Bamse',
        email: 'bamse@local.dev',
        password: '',
        role: 'user',
        locale: 'sv',
        tenants: [{ lookupApiKey: tenant.bamse.apiKey, role: 'admin' }]
      },
      {
        name: 'Lille Skutt',
        description: 'User access to Bamse',
        email: 'skutt@local.dev',
        password: '',
        role: 'user',
        locale: 'sv',
        tenants: [{ lookupApiKey: tenant.bamse.apiKey, role: 'user' }]
      },
      // ======================================
      // System user with access to all tenants
      // ======================================
      {
        name: 'System User',
        description: 'Access to manage the system',
        email: 'system@local.dev',
        password: '',
        role: 'system-user',
        locale: 'en',
        tenants: []
      }
    ]
  };
};
