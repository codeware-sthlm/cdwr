import type { FaqDefinition } from '../platform-definition';

/**
 * Curated FAQ entries for the admin help drawer, grouped by topic.
 *
 * Static content rather than generated, since the entries must make sense
 * to a non-technical editor. This list is the source in every environment,
 * production included: `applyPlatformFaq` creates or updates each entry at
 * host boot, matched on its English question, and never deletes one. An
 * edit made through the admin is overwritten at the next boot, so change
 * the text here. Within a topic the drawer follows the admin order, and a
 * new entry is added last.
 *
 * Every admin label named in an answer is the label the admin shows, in the
 * language of that answer.
 */
export const faq: ReadonlyArray<FaqDefinition> = [
  // Pages
  {
    topic: 'pages',
    question: {
      en: 'What is a block?',
      sv: 'Vad är ett block?'
    },
    answer: {
      en: 'A block is one section of a page, such as a heading with a picture, a text or a form. You build a page by putting blocks after each other in the Layout builder.',
      sv: 'Ett block är en del av en sida, till exempel en rubrik med bild, en text eller ett formulär. Du bygger en sida genom att lägga block efter varandra i Innehållsbyggaren.'
    }
  },
  {
    topic: 'pages',
    question: {
      en: 'How do I add, move or remove a section on a page?',
      sv: 'Hur lägger jag till, flyttar eller tar bort en del av en sida?'
    },
    answer: {
      en: 'Open the page and press Add block in the Layout builder. To move or remove a section, open the menu on its row and choose Move Up, Move Down or Remove.',
      sv: 'Öppna sidan och tryck på Lägg till block i Innehållsbyggaren. För att flytta eller ta bort en del öppnar du menyn på dess rad och väljer Flytta upp, Flytta ner eller Ta bort.'
    }
  },
  {
    topic: 'pages',
    question: {
      en: 'Can I see how my page looks on a phone?',
      sv: 'Kan jag se hur min sida ser ut på en mobil?'
    },
    answer: {
      en: 'Yes. Open the page and press Live Preview, then choose Mobile. The preview follows your changes while you write.',
      sv: 'Ja. Öppna sidan och tryck på Förhandsgranskning, och välj sedan Mobile. Förhandsgranskningen följer dina ändringar medan du skriver.'
    }
  },

  // Drafts & versions
  {
    topic: 'drafts',
    question: {
      en: 'What is a draft?',
      sv: 'Vad är ett utkast?'
    },
    answer: {
      en: 'A draft is a saved version that only you and your teammates can see. Nothing changes on your website until you press Publish.',
      sv: 'Ett utkast är en sparad version som bara du och dina kollegor kan se. Inget ändras på din webbplats förrän du trycker på Publicera.'
    }
  },
  {
    topic: 'drafts',
    question: {
      en: 'Who can see my changes?',
      sv: 'Vem kan se mina ändringar?'
    },
    answer: {
      en: 'Only people who can log in here see your drafts. Visitors to your website only see what you have published.',
      sv: 'Bara personer som kan logga in här ser dina utkast. Besökare på din webbplats ser bara det du har publicerat.'
    }
  },
  {
    topic: 'drafts',
    question: {
      en: 'Can I undo a mistake?',
      sv: 'Kan jag ångra ett misstag?'
    },
    answer: {
      en: 'Yes. Every time you save, a version is kept. Open the document and look for Versions to bring back an earlier one.',
      sv: 'Ja. Varje gång du sparar behålls en version. Öppna dokumentet och leta efter Versioner för att ta tillbaka en tidigare.'
    }
  },
  {
    topic: 'drafts',
    question: {
      en: 'Is my work saved automatically?',
      sv: 'Sparas mitt arbete automatiskt?'
    },
    answer: {
      en: 'Yes. Pages, posts and tours are saved as a draft every few seconds while you write. The website does not change until you press Publish.',
      sv: 'Ja. Sidor, inlägg och resor sparas som utkast med några sekunders mellanrum medan du skriver. Webbplatsen ändras inte förrän du trycker på Publicera.'
    }
  },

  // Menu
  {
    topic: 'navigation',
    question: {
      en: 'How do I add a page to the menu?',
      sv: 'Hur lägger jag till en sida i menyn?'
    },
    answer: {
      en: 'Open Navigation under Site Setup, press Add Navigation item and pick the page under Navigate to. Press Save when you are done.',
      sv: 'Öppna Navigation under Inställningar, tryck på Lägg till Navigationsobjekt och välj sidan under Navigera till. Tryck på Spara när du är klar.'
    }
  },
  {
    topic: 'navigation',
    question: {
      en: 'How do I rename a menu item?',
      sv: 'Hur byter jag namn på ett menyval?'
    },
    answer: {
      en: 'Open the item in Navigation, choose Custom link label and write the new name under Link label. Without it, the menu uses the name of the page.',
      sv: 'Öppna menyvalet i Navigation, välj Anpassad länktext och skriv det nya namnet under Länktext. Annars använder menyn sidans namn.'
    }
  },

  // Site settings
  {
    topic: 'site-settings',
    question: {
      en: 'How do I change the name or icon of my site?',
      sv: 'Hur ändrar jag webbplatsens namn eller ikon?'
    },
    answer: {
      en: 'Open Site Settings under Site Setup. On the General tab you change Application name and Icon.',
      sv: 'Öppna Webbplatsinställningar under Inställningar. På fliken Allmänt ändrar du Namnet på applikationen och Ikon.'
    }
  },
  {
    topic: 'site-settings',
    question: {
      en: 'How do I change the contact details in the footer?',
      sv: 'Hur ändrar jag kontaktuppgifterna i sidfoten?'
    },
    answer: {
      en: 'Open Site Settings and go to the Footer tab. Under Contact you add your email, phone or social media.',
      sv: 'Öppna Webbplatsinställningar och gå till fliken Sidfot. Under Kontakt lägger du till din e-post, ditt telefonnummer eller sociala medier.'
    }
  },
  {
    topic: 'site-settings',
    question: {
      en: 'How do I change the look of my site?',
      sv: 'Hur ändrar jag hur min webbplats ser ut?'
    },
    answer: {
      en: 'Open Site Settings and go to the General tab. There you pick Themes and a Default theme, and under Appearance you choose light, dark or let the visitor decide.',
      sv: 'Öppna Webbplatsinställningar och gå till fliken Allmänt. Där väljer du Teman och ett Standardtema, och under Utseende väljer du ljust, mörkt eller låter besökaren bestämma.'
    }
  },
  {
    topic: 'site-settings',
    question: {
      en: 'Where do I set the privacy page?',
      sv: 'Var anger jag integritetssidan?'
    },
    answer: {
      en: 'Open Site Settings and go to the Legal tab. Choose your page under Privacy page, or press Create a starter privacy page and read it through before you publish.',
      sv: 'Öppna Webbplatsinställningar och gå till fliken Juridiskt. Välj din sida under Integritetssida, eller tryck på Skapa utkast till integritetssida och läs igenom den innan du publicerar.'
    }
  },

  // Search & help
  {
    topic: 'search-help',
    question: {
      en: 'Where did my page go?',
      sv: 'Var tog min sida vägen?'
    },
    answer: {
      en: 'Press the search button in the top bar (or Cmd+K / Ctrl+K on the keyboard) and type part of the name. You can open it straight from the results.',
      sv: 'Tryck på sökknappen i verktygsfältet (eller Cmd+K / Ctrl+K på tangentbordet) och skriv en del av namnet. Du kan öppna den direkt från resultatet.'
    }
  },
  {
    topic: 'search-help',
    question: {
      en: 'Can I see the getting started list again?',
      sv: 'Kan jag se kom igång-listan igen?'
    },
    answer: {
      en: 'Yes. Open the search (Cmd+K / Ctrl+K) and choose Show getting started. The list appears on the start page.',
      sv: 'Ja. Öppna sökningen (Cmd+K / Ctrl+K) och välj Visa kom igång. Listan visas på startsidan.'
    }
  },

  // Account & sign-in
  {
    topic: 'account',
    question: {
      en: 'How do I change my password?',
      sv: 'Hur byter jag lösenord?'
    },
    answer: {
      en: 'Open Account settings and press Change Password. If you have forgotten it, press Forgot password? on the login page and follow the email.',
      sv: 'Öppna Kontoinställningar och tryck på Byt lösenord. Har du glömt det trycker du på Glömt lösenordet? på inloggningssidan och följer mejlet.'
    }
  },
  {
    topic: 'account',
    question: {
      en: 'I have a new phone. What happens to my authenticator app?',
      sv: 'Jag har fått en ny mobil. Hur gör jag med autentiseringsappen?'
    },
    answer: {
      en: 'The codes only exist in the app on your old phone. Ask a workspace administrator or Codeware to help you set it up again on the new one.',
      sv: 'Koderna finns bara i appen på din gamla mobil. Be en administratör i arbetsytan eller Codeware om hjälp att ställa in den igen på den nya.'
    }
  },
  {
    topic: 'account',
    question: {
      en: 'What is the difference between interface language and content language?',
      sv: 'Vad är skillnaden mellan gränssnittsspråk och innehållsspråk?'
    },
    answer: {
      en: 'Interface language changes the menus and buttons you see. Content language chooses which language version of a page or post you are editing. You can change both from the search (Cmd+K / Ctrl+K).',
      sv: 'Gränssnittsspråk ändrar menyerna och knapparna du ser. Innehållsspråk väljer vilken språkversion av en sida eller ett inlägg du redigerar. Du kan ändra båda från sökningen (Cmd+K / Ctrl+K).'
    }
  },

  // Statistics
  {
    topic: 'statistics',
    question: {
      en: 'How do I get a login to the statistics?',
      sv: 'Hur får jag en inloggning till statistiken?'
    },
    answer: {
      en: 'Open Visitors on the start page and press Get a statistics login, then Email me the login. The username and password are sent to your email address.',
      sv: 'Öppna Besökare på startsidan och tryck på Skaffa en inloggning till statistiken, och sedan på Mejla inloggningen till mig. Användarnamn och lösenord skickas till din e-postadress.'
    }
  },
  {
    topic: 'statistics',
    question: {
      en: 'What do visitors and page views mean?',
      sv: 'Vad betyder besökare och sidvisningar?'
    },
    answer: {
      en: 'Visitors is how many different people came to your site. Page views is how many pages they opened in total, so one visitor can give many page views.',
      sv: 'Besökare är hur många olika personer som varit på din webbplats. Sidvisningar är hur många sidor de öppnade sammanlagt, så en besökare kan ge många sidvisningar.'
    }
  },

  // Images & files
  {
    topic: 'media',
    question: {
      en: 'How do I add a picture?',
      sv: 'Hur lägger jag till en bild?'
    },
    answer: {
      en: 'Go to Media in the menu and create a new item, or drag the picture into the upload area. After that you can use it in your pages and posts.',
      sv: 'Gå till Media i menyn och skapa ett nytt objekt, eller dra bilden till uppladdningsytan. Därefter kan du använda den i dina sidor och inlägg.'
    }
  },
  {
    topic: 'media',
    question: {
      en: 'How do I put a PDF, such as a trip program, on my site?',
      sv: 'Hur lägger jag en PDF, till exempel ett reseprogram, på min webbplats?'
    },
    answer: {
      en: 'Upload the PDF under Media and give it a tag under Tags. Then add a File Area block to your page and choose the same tag, and the PDF is listed there for visitors to open.',
      sv: 'Ladda upp PDF:en under Media och ge den en etikett under Etiketter. Lägg sedan till ett Filyta-block på din sida och välj samma etikett, så visas PDF:en där för besökarna att öppna.'
    }
  },

  // Forms & messages
  {
    topic: 'forms',
    question: {
      en: 'Where do the messages from my forms arrive?',
      sv: 'Var hamnar meddelandena från mina formulär?'
    },
    answer: {
      en: 'Press Read new messages on the start page, or look under Forms & Messages in the menu. Messages are also emailed to the addresses set under Notify these addresses on the Forms tab in Site Settings.',
      sv: 'Tryck på Läs nya meddelanden på startsidan, eller titta under Formulär & Meddelanden i menyn. Meddelandena mejlas också till adresserna under Meddela dessa adresser på fliken Formulär i Webbplatsinställningar.'
    }
  },
  {
    topic: 'forms',
    question: {
      en: 'Are the messages from my forms deleted after a while?',
      sv: 'Raderas meddelandena från mina formulär efter ett tag?'
    },
    answer: {
      en: 'Only if you choose it. Under Keep submissions for (days) on the Forms tab in Site Settings, you set how many days messages are kept, and older ones are then deleted every night. Leave it empty and they stay until you delete them.',
      sv: 'Bara om du väljer det. Under Spara inskickade meddelanden i (dagar) på fliken Formulär i Webbplatsinställningar anger du hur många dagar meddelanden sparas, och äldre raderas då varje natt. Lämnar du det tomt ligger de kvar tills du raderar dem.'
    }
  },
  {
    topic: 'forms',
    question: {
      en: 'Where do signups for a tour arrive?',
      sv: 'Var hamnar anmälningarna till en resa?'
    },
    answer: {
      en: 'Under Tour signups in the menu, where you can search across all tours, and on each tour itself. They are also emailed to the addresses set under Notify these addresses on the Tour signups tab in Site Settings.',
      sv: 'Under Reseanmälningar i menyn, där du kan söka över alla resor, och på varje resa. De mejlas också till adresserna under Meddela dessa adresser på fliken Reseanmälningar i Webbplatsinställningar.'
    }
  },
  {
    topic: 'forms',
    question: {
      en: 'How long are the details in a tour signup kept?',
      sv: 'Hur länge sparas uppgifterna i en reseanmälan?'
    },
    answer: {
      en: 'Names, emails and phone numbers are cleared a set number of days after the tour departs, 365 unless you change it. Party sizes and statuses are kept. You set the days on the Tour signups tab in Site Settings, and the signup form tells customers the same number.',
      sv: 'Namn, e-post och telefonnummer rensas ett visst antal dagar efter avresan, 365 om du inte ändrar det. Antal personer och status behålls. Du anger antalet dagar på fliken Reseanmälningar i Webbplatsinställningar, och anmälningsformuläret visar kunderna samma siffra.'
    }
  }
];
