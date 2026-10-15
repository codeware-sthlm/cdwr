import type {
  StarterLocale,
  StarterPage,
  StarterPurpose
} from './starter-types';

type Card = { title: string; description: string };

type PurposeCopy = {
  lede: string;
  cardsEyebrow: string;
  cardsHeading: string;
  cardsIntro: string;
  cards: [Card, Card, Card];
  /** A second home block, for purposes that ask something of the visitor */
  join?: string;
};

export type StarterCopy = {
  /** Read aloud for the hero's illustration */
  illustrationLabel: string;
  pageNames: Record<Exclude<StarterPage, 'privacy'> | 'home', string>;
  contactAction: string;
  purposes: Record<StarterPurpose, PurposeCopy>;
  about: Record<StarterPurpose, string>;
  contact: {
    form: {
      title: string;
      emailLabel: string;
      emailPlaceholder: string;
      submitLabel: string;
      confirmation: string;
      subject: string;
    };
    intro: string;
  };
  news: {
    heading: string;
    intro: string;
    postTitle: string;
    postContent: string;
  };
  footerTagline: Record<StarterPurpose, string>;
};

export const STARTER_COPY: Record<StarterLocale, StarterCopy> = {
  en: {
    illustrationLabel:
      'Ideas in orbit around a calm centre, and a connection forming between them',
    pageNames: {
      home: 'Home',
      about: 'About',
      contact: 'Contact',
      news: 'News'
    },
    contactAction: 'Get in touch',
    purposes: {
      business: {
        lede: 'Describe what your company does and who it is for, in a sentence or two. Edit this text to make it yours.',
        cardsEyebrow: 'What we offer',
        cardsHeading: 'Our services',
        cardsIntro: 'Replace these three cards with the services you offer.',
        cards: [
          {
            title: 'First service',
            description:
              'Describe what you offer and what your customers get out of it.'
          },
          {
            title: 'Second service',
            description: 'Describe another service, and who it is meant for.'
          },
          {
            title: 'Third service',
            description:
              'Describe a third service, or delete this card if you do not need it.'
          }
        ]
      },
      portfolio: {
        lede: 'Introduce yourself and your work in a sentence or two. Edit this text to make it yours.',
        cardsEyebrow: 'Portfolio',
        cardsHeading: 'Selected work',
        cardsIntro: 'Replace these three cards with projects you are proud of.',
        cards: [
          {
            title: 'First project',
            description: 'Describe the project, your part in it and the result.'
          },
          {
            title: 'Second project',
            description:
              'Describe another project and what you learned from it.'
          },
          {
            title: 'Third project',
            description:
              'Describe a third project, or delete this card if you do not need it.'
          }
        ]
      },
      association: {
        lede: 'Describe what your association stands for and who it welcomes. Edit this text to make it yours.',
        cardsEyebrow: 'What we do',
        cardsHeading: 'Our activities',
        cardsIntro:
          'Replace these three cards with what your association does.',
        cards: [
          {
            title: 'First activity',
            description:
              'Describe an activity, when it takes place and who can take part.'
          },
          {
            title: 'Second activity',
            description: 'Describe another activity your members enjoy.'
          },
          {
            title: 'Third activity',
            description:
              'Describe a third activity, or delete this card if you do not need it.'
          }
        ],
        join: '## Join us\n\nDescribe how to become a member, what it costs and what members get. Edit this text to make it yours.'
      }
    },
    about: {
      business:
        '## About us\n\nTell the story of your company: who you are, what you believe in and why customers choose you. Edit this text to make it yours.',
      portfolio:
        '## About me\n\nTell visitors who you are, what you do and what you care about. Edit this text to make it yours.',
      association:
        '## About the association\n\nTell visitors when the association was founded, what it stands for and who runs it. Edit this text to make it yours.'
    },
    contact: {
      form: {
        title: 'Contact',
        emailLabel: 'Your email',
        emailPlaceholder: 'you@example.com',
        submitLabel: 'Send',
        confirmation: 'Thank you! We will get back to you soon.',
        subject: 'New message from {{email}}'
      },
      intro:
        '## Get in touch\n\nLeave your email address and we will reply. Edit this text to say what visitors can contact you about.'
    },
    news: {
      heading: 'News',
      intro: 'The latest from us.',
      postTitle: 'Welcome to our new site',
      postContent:
        'Write a first post to tell visitors what is new. Edit or delete this post, then add your own in the admin.\n'
    },
    footerTagline: {
      business: 'Describe your company in one line.',
      portfolio: 'Describe yourself in one line.',
      association: 'Describe your association in one line.'
    }
  },
  sv: {
    illustrationLabel:
      'Idéer i omlopp kring en lugn mittpunkt, och en förbindelse som knyts mellan dem',
    pageNames: {
      home: 'Hem',
      about: 'Om oss',
      contact: 'Kontakt',
      news: 'Nyheter'
    },
    contactAction: 'Kontakta oss',
    purposes: {
      business: {
        lede: 'Beskriv vad ditt företag gör och vem det riktar sig till, i en eller två meningar. Ändra texten så att den blir din.',
        cardsEyebrow: 'Vad vi erbjuder',
        cardsHeading: 'Våra tjänster',
        cardsIntro: 'Byt ut de tre korten mot de tjänster du erbjuder.',
        cards: [
          {
            title: 'Första tjänsten',
            description:
              'Beskriv vad du erbjuder och vad kunderna får ut av tjänsten.'
          },
          {
            title: 'Andra tjänsten',
            description:
              'Beskriv ytterligare en tjänst och vem tjänsten är till för.'
          },
          {
            title: 'Tredje tjänsten',
            description:
              'Beskriv en tredje tjänst, eller ta bort kortet om du inte behöver det.'
          }
        ]
      },
      portfolio: {
        lede: 'Presentera dig själv och ditt arbete i en eller två meningar. Ändra texten så att den blir din.',
        cardsEyebrow: 'Portfölj',
        cardsHeading: 'Utvalda arbeten',
        cardsIntro: 'Byt ut de tre korten mot arbeten du är stolt över.',
        cards: [
          {
            title: 'Första arbetet',
            description:
              'Beskriv arbetet, vilken roll du hade och vad det ledde till.'
          },
          {
            title: 'Andra arbetet',
            description:
              'Beskriv ytterligare ett arbete och vad du lärde dig av det.'
          },
          {
            title: 'Tredje arbetet',
            description:
              'Beskriv ett tredje arbete, eller ta bort kortet om du inte behöver det.'
          }
        ]
      },
      association: {
        lede: 'Beskriv vad föreningen står för och vilka som är välkomna. Ändra texten så att den blir er.',
        cardsEyebrow: 'Vad vi gör',
        cardsHeading: 'Våra aktiviteter',
        cardsIntro: 'Byt ut de tre korten mot det som föreningen gör.',
        cards: [
          {
            title: 'Första aktiviteten',
            description:
              'Beskriv en aktivitet, när den äger rum och vem som kan delta.'
          },
          {
            title: 'Andra aktiviteten',
            description:
              'Beskriv ytterligare en aktivitet som medlemmarna uppskattar.'
          },
          {
            title: 'Tredje aktiviteten',
            description:
              'Beskriv en tredje aktivitet, eller ta bort kortet om du inte behöver det.'
          }
        ],
        join: '## Bli medlem\n\nBeskriv hur man blir medlem, vad medlemskapet kostar och vad medlemmarna får. Ändra texten så att den blir er.'
      }
    },
    about: {
      business:
        '## Om oss\n\nBerätta företagets historia: vilka ni är, vad ni tror på och varför kunderna väljer er. Ändra texten så att den blir er.',
      portfolio:
        '## Om mig\n\nBerätta för besökarna vem du är, vad du gör och vad du brinner för. Ändra texten så att den blir din.',
      association:
        '## Om föreningen\n\nBerätta för besökarna när föreningen bildades, vad den står för och vilka som driver den. Ändra texten så att den blir er.'
    },
    contact: {
      form: {
        title: 'Kontakt',
        emailLabel: 'Din e-postadress',
        emailPlaceholder: 'du@exempel.se',
        submitLabel: 'Skicka',
        confirmation: 'Tack! Vi återkommer så snart vi kan.',
        subject: 'Nytt meddelande från {{email}}'
      },
      intro:
        '## Kontakta oss\n\nLämna din e-postadress så svarar vi. Ändra texten så att den berättar vad besökarna kan kontakta er om.'
    },
    news: {
      heading: 'Nyheter',
      intro: 'Det senaste från oss.',
      postTitle: 'Välkommen till vår nya webbplats',
      postContent:
        'Skriv ett första inlägg som berättar för besökarna vad som är nytt. Ändra eller ta bort det här inlägget och lägg sedan till egna i administrationen.\n'
    },
    footerTagline: {
      business: 'Beskriv ditt företag i en rad.',
      portfolio: 'Beskriv dig själv i en rad.',
      association: 'Beskriv föreningen i en rad.'
    }
  }
};
