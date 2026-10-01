import type { FaqDefinition } from '../platform-definition';

/**
 * Curated FAQ entries for the admin help drawer.
 *
 * Static content rather than generated, since the entries must make sense
 * to a non-technical editor in dev and QA environments. The list also
 * doubles as the copy-source for one-time manual entry in production.
 */
export const faq: ReadonlyArray<FaqDefinition> = [
  {
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
    question: {
      en: 'How do I add a picture?',
      sv: 'Hur lägger jag till en bild?'
    },
    answer: {
      en: 'Go to Photos & Files in the menu and create a new item, or drag the picture into the upload area. After that you can use it in your pages and posts.',
      sv: 'Gå till Bilder & Filer i menyn och skapa ett nytt objekt, eller dra bilden till uppladdningsytan. Därefter kan du använda den i dina sidor och inlägg.'
    }
  },
  {
    question: {
      en: 'Can I undo a mistake?',
      sv: 'Kan jag ångra ett misstag?'
    },
    answer: {
      en: 'Yes. Every time you save, a version is kept. Open the document and look for Versions to bring back an earlier one.',
      sv: 'Ja. Varje gång du sparar behålls en version. Öppna dokumentet och leta efter Versioner för att ta tillbaka en tidigare.'
    }
  }
];
