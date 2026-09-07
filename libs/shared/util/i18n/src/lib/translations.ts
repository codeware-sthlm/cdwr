export type SupportedLocale = 'en' | 'sv';

export type TranslationKey =
  | 'about.built'
  | 'about.commit'
  | 'about.environment'
  | 'about.release'
  | 'about.version'
  | 'colorScheme.currentClickFor'
  | 'colorScheme.dark'
  | 'colorScheme.light'
  | 'colorScheme.switchTo'
  | 'colorScheme.system'
  | 'error.contactAdmin'
  | 'error.landingPageNotFound'
  | 'error.landingPageNotFoundDescription'
  | 'error.landingPageRenderFailed'
  | 'error.pageRenderFailed'
  | 'error.somethingWentWrong'
  | 'error.unableToLoadContent'
  | 'fileArea.download'
  | 'iconPicker.dialogDescription'
  | 'iconPicker.dialogTitle'
  | 'iconPicker.noIconsFound'
  | 'iconPicker.searchClearButton'
  | 'iconPicker.searchFieldPlaceholder'
  | 'iconPicker.labelSelect'
  | 'imageCrop.cancel'
  | 'imageCrop.chooseImage'
  | 'imageCrop.confirm'
  | 'imageCrop.confirming'
  | 'imageCrop.cropError'
  | 'imageCrop.noFileChosen'
  | 'imageCrop.zoom'
  | 'image.loadFailed'
  | 'iconCrop.currentIconAlt'
  | 'iconCrop.drawerTitle'
  | 'iconCrop.mediaFallback'
  | 'iconCrop.remove'
  | 'iconCrop.replace'
  | 'iconCrop.uploadAndCrop'
  | 'iconCrop.uploadFailed'
  | 'iconCrop.uploadFailedStatus'
  | 'svgPreview.browseStudio'
  | 'fileArea.noFiles'
  | 'fileArea.previewNotAvailable'
  | 'fileArea.search'
  | 'fileArea.sort'
  | 'fileArea.sortDateNewest'
  | 'fileArea.sortDateOldest'
  | 'fileArea.sortNameAsc'
  | 'fileArea.sortNameDesc'
  | 'fileArea.sortSizeLargest'
  | 'fileArea.sortSizeSmallest'
  | 'fileArea.typeAudio'
  | 'fileArea.typeDocument'
  | 'fileArea.typeImage'
  | 'fileArea.typeOther'
  | 'fileArea.typePdf'
  | 'fileArea.typePresentation'
  | 'fileArea.typeSpreadsheet'
  | 'fileArea.typeVideo'
  | 'fileArea.viewGrid'
  | 'fileArea.viewList'
  | 'form.submitSuccess'
  | 'form.submitFailed'
  | 'form.submitFailedDescription'
  | 'navigation.footer'
  | 'navigation.menu'
  | 'navigation.primary'
  | 'navigation.title'
  | 'notFound.description'
  | 'notFound.goHome'
  | 'notFound.title'
  | 'posts.readMore'
  | 'social.clickToCopy'
  | 'social.copied'
  | 'social.copyFailed'
  | 'theme.select'
  | 'tours.addToCalendar'
  | 'tours.backToTours'
  | 'tours.bookBefore'
  | 'tours.datesToBeConfirmed'
  | 'tours.badgeFull'
  | 'tours.badgeQueue'
  | 'tours.bookingLede'
  | 'tours.bookTour'
  | 'tours.day'
  | 'tours.departure'
  | 'tours.duration'
  | 'tours.included'
  | 'tours.itinerary'
  | 'tours.notIncluded'
  | 'tours.perPerson'
  | 'tours.price'
  | 'tours.interestLede'
  | 'tours.print'
  | 'tourSignupEmail.bookedBody'
  | 'tourSignupEmail.departureLabel'
  | 'tourSignupEmail.detailsHeading'
  | 'tourSignupEmail.greeting'
  | 'tourSignupEmail.notificationBody'
  | 'tourSignupEmail.notificationHeading'
  | 'tourSignupEmail.peopleLabel'
  | 'tourSignupEmail.privacyLink'
  | 'tourSignupEmail.promotedBody'
  | 'tourSignupEmail.questions'
  | 'tourSignupEmail.firstInQueueLabel'
  | 'tourSignupEmail.openTour'
  | 'tourSignupEmail.seatsFreeLabel'
  | 'tourSignupEmail.seatsFreedAction'
  | 'tourSignupEmail.seatsFreedBody'
  | 'tourSignupEmail.subjectSeatsFreed'
  | 'tourSignupEmail.statusLabel'
  | 'tourSignupEmail.statusBooked'
  | 'tourSignupEmail.statusWaiting'
  | 'tourSignupEmail.subjectBooked'
  | 'tourSignupEmail.subjectNotification'
  | 'tourSignupEmail.subjectPromoted'
  | 'tourSignupEmail.subjectWaiting'
  | 'tourSignupEmail.termsLink'
  | 'tourSignupEmail.tourLabel'
  | 'tourSignupEmail.waitingBody'
  | 'tourSignup.acceptTerms'
  | 'tourSignup.acceptTermsRequired'
  | 'tourSignup.dataNotice'
  | 'tourSignup.dataNoticeRetention'
  | 'tourSignup.privacyLink'
  | 'tourSignup.termsLink'
  | 'tourSignup.email'
  | 'tourSignup.failed'
  | 'tourSignup.full'
  | 'tourSignup.queueOnly'
  | 'tourSignup.queueOnlyCount'
  | 'tourSignup.queueOnlyCountOne'
  | 'tourSignup.queueOnlyLede'
  | 'tourSignup.fullLede'
  | 'tourSignup.joinWaitingList'
  | 'tourSignup.name'
  | 'tourSignup.people'
  | 'tourSignup.peopleHelp'
  | 'tourSignup.phone'
  | 'tourSignup.phoneOptional'
  | 'tourSignup.required'
  | 'tourSignup.seatsLeft'
  | 'tourSignup.seatsLeftOne'
  | 'tourSignup.signupsClosed'
  | 'tourSignup.submit'
  | 'tourSignup.submitting'
  | 'tourSignup.successBooked'
  | 'tourSignup.successWaiting'
  | 'tourSignup.title'
  | 'tourSignup.tooManyPeople'
  | 'tours.registerInterest'
  | 'tours.signUpBefore'
  | 'tours.share'
  | 'tours.shareCopied'
  | 'tours.shareFailed'
  | 'tours.viewItinerary';

const translations: Record<SupportedLocale, Record<TranslationKey, string>> = {
  en: {
    'about.built': 'Built',
    'about.commit': 'Commit',
    'about.environment': 'Environment',
    'about.release': 'Release',
    'about.version': 'Version',
    'colorScheme.currentClickFor': 'Current: {{current}}, click for {{next}}',
    'colorScheme.dark': 'dark',
    'colorScheme.light': 'light',
    'colorScheme.switchTo': 'Switch to {{colorScheme}} appearance',
    'colorScheme.system': 'system preference',
    'error.contactAdmin':
      'Please contact the administrator if the problem persists.',
    'error.landingPageNotFound': 'Landing page was not found',
    'error.landingPageNotFoundDescription':
      'Please create a page in the CMS and assign it to be a landing page.',
    'error.landingPageRenderFailed': 'The landing page could not be rendered.',
    'error.pageRenderFailed':
      "The page you're looking for could not be rendered.",
    'error.somethingWentWrong': 'Something went wrong!',
    'error.unableToLoadContent':
      'Unable to load application content. Please try again later.',
    'iconPicker.dialogDescription': 'Choose the best suited icon',
    'iconPicker.dialogTitle': 'Select an Icon',
    'iconPicker.noIconsFound': 'No icons found...',
    'iconPicker.searchClearButton': 'Clear search',
    'iconPicker.searchFieldPlaceholder': 'Search icon...',
    'iconPicker.labelSelect': 'Select icon',
    'imageCrop.cancel': 'Cancel',
    'imageCrop.chooseImage': 'Choose image',
    'imageCrop.confirm': 'Confirm',
    'imageCrop.confirming': 'Uploading…',
    'imageCrop.cropError': 'Failed to process the image. Please try again.',
    'imageCrop.noFileChosen': 'No file chosen',
    'imageCrop.zoom': 'Zoom',
    'image.loadFailed': 'Image failed to load.',
    'iconCrop.currentIconAlt': 'Current icon',
    'iconCrop.drawerTitle': 'Crop Icon (1:1)',
    'iconCrop.mediaFallback': 'Media #{{id}}',
    'iconCrop.remove': 'Remove',
    'iconCrop.replace': 'Replace',
    'iconCrop.uploadAndCrop': 'Upload & Crop',
    'iconCrop.uploadFailed': 'Upload failed',
    'iconCrop.uploadFailedStatus': 'Upload failed ({{status}}): {{message}}',
    'svgPreview.browseStudio': 'Browse Studio',
    'fileArea.download': 'Download',
    'fileArea.noFiles': 'No files',
    'fileArea.previewNotAvailable': 'Preview not available for this file type',
    'fileArea.search': 'Search...',
    'fileArea.sort': 'Sort',
    'fileArea.sortDateNewest': 'Newest first',
    'fileArea.sortDateOldest': 'Oldest first',
    'fileArea.sortNameAsc': 'Name (A-Z)',
    'fileArea.sortNameDesc': 'Name (Z-A)',
    'fileArea.sortSizeLargest': 'Size (largest)',
    'fileArea.sortSizeSmallest': 'Size (smallest)',
    'fileArea.typeAudio': 'Audio',
    'fileArea.typeDocument': 'Document',
    'fileArea.typeImage': 'Image',
    'fileArea.typeOther': 'Other',
    'fileArea.typePdf': 'PDF',
    'fileArea.typePresentation': 'Presentation',
    'fileArea.typeSpreadsheet': 'Spreadsheet',
    'fileArea.typeVideo': 'Video',
    'fileArea.viewGrid': 'Grid view',
    'fileArea.viewList': 'List view',
    'form.submitSuccess': 'Form submitted successfully',
    'form.submitFailed': 'Form submission failed',
    'form.submitFailedDescription': 'Please try again.',
    'navigation.footer': 'Footer',
    'navigation.menu': 'Menu',
    'navigation.primary': 'Main',
    'navigation.title': 'Navigation',
    'notFound.description':
      'Sorry, we could not find the page you were looking for.',
    'notFound.goHome': 'Go back home',
    'notFound.title': 'Page not found',
    'posts.readMore': 'Read more',
    'social.clickToCopy': 'Click to copy',
    'social.copied': 'Copied',
    'social.copyFailed': 'Failed to copy to clipboard',
    'theme.select': 'Select theme',
    'tours.addToCalendar': 'Add to calendar',
    'tours.backToTours': 'Go back to tours',
    'tours.bookBefore': 'Book before',
    'tours.badgeFull': 'Full',
    'tours.badgeQueue': 'Waiting list',
    'tours.datesToBeConfirmed': 'Dates to be confirmed',
    'tours.bookingLede':
      'Send us a request and we will confirm your place. Bookings close {{date}}.',
    'tours.bookTour': 'Book this tour',
    'tours.day': 'Day {{day}}',
    'tours.departure': 'Departure',
    'tours.duration': 'Duration',
    'tours.included': "What's included",
    'tours.itinerary': 'Itinerary',
    'tours.notIncluded': 'Not included',
    'tours.perPerson': 'per person',
    'tours.price': 'Price',
    'tours.interestLede':
      'Tell us you are interested and we will be in touch once the departure is confirmed. Nothing is binding.',
    'tours.print': 'Print this tour',
    'tourSignupEmail.bookedBody':
      'Your place on {{tour}} is confirmed. We will be in touch closer to departure with the practical details.',
    'tourSignupEmail.departureLabel': 'Departure',
    'tourSignupEmail.detailsHeading': 'Your signup',
    'tourSignupEmail.greeting': 'Hi {{name}},',
    'tourSignupEmail.notificationBody':
      '{{name}} signed up for {{tour}} for {{people}} people.',
    'tourSignupEmail.notificationHeading': 'New signup',
    'tourSignupEmail.peopleLabel': 'Travellers',
    'tourSignupEmail.privacyLink': 'How we handle your data',
    'tourSignupEmail.promotedBody':
      'A place has opened up on {{tour}} and it is yours. Your signup is now confirmed.',
    'tourSignupEmail.questions':
      'Just reply to this email if anything is unclear.',
    'tourSignupEmail.firstInQueueLabel': 'First in the waiting list',
    'tourSignupEmail.openTour': 'Open the tour',
    'tourSignupEmail.seatsFreeLabel': 'Places free',
    'tourSignupEmail.seatsFreedAction':
      'New signups join the waiting list rather than taking these places, so the tour only fills again when you move someone up.',
    'tourSignupEmail.seatsFreedBody':
      '{{count}} places are free on {{tour}}. {{name}} is first in the waiting list, for {{people}}.',
    'tourSignupEmail.subjectSeatsFreed': 'Places are free on {{tour}}',
    'tourSignupEmail.statusLabel': 'Status',
    'tourSignupEmail.statusBooked': 'Confirmed',
    'tourSignupEmail.statusWaiting': 'Waiting list',
    'tourSignupEmail.subjectBooked': 'Your place on {{tour}} is confirmed',
    'tourSignupEmail.subjectNotification': 'New signup for {{tour}}',
    'tourSignupEmail.subjectPromoted': 'A place has opened up on {{tour}}',
    'tourSignupEmail.subjectWaiting':
      'You are on the waiting list for {{tour}}',
    'tourSignupEmail.termsLink': 'Terms',
    'tourSignupEmail.tourLabel': 'Tour',
    'tourSignupEmail.waitingBody':
      '{{tour}} is fully booked, so you are on the waiting list. We will be in touch as soon as a place opens up — nothing is charged and you are free to change your mind.',
    'tourSignup.acceptTerms': 'I accept the terms',
    'tourSignup.acceptTermsRequired': 'Please accept the terms to sign up',
    'tourSignup.dataNotice':
      'We store your name, email, phone number and party size to run this tour.',
    'tourSignup.dataNoticeRetention':
      'Your details are cleared {{days}} days after departure.',
    'tourSignup.privacyLink': 'How we handle your data',
    'tourSignup.termsLink': 'Read the terms',
    'tourSignup.email': 'Email',
    'tourSignup.failed': 'Your signup could not be sent. Please try again.',
    'tourSignup.full': 'This tour is full',
    'tourSignup.queueOnly': 'Places are offered from the waiting list',
    'tourSignup.queueOnlyCount':
      '{{count}} places left — offered to the waiting list first',
    'tourSignup.queueOnlyCountOne':
      '1 place left — offered to the waiting list first',
    'tourSignup.queueOnlyLede':
      'Others are already waiting for a place on this tour, so signups join the waiting list in turn. We will be in touch when it is your turn.',
    'tourSignup.fullLede':
      'Join the waiting list and we will be in touch if a place opens up.',
    'tourSignup.joinWaitingList': 'Join the waiting list',
    'tourSignup.name': 'Name',
    'tourSignup.people': 'Number of travellers',
    'tourSignup.peopleHelp': 'Including yourself.',
    'tourSignup.phone': 'Phone',
    'tourSignup.phoneOptional': 'Optional, but useful on the day of departure.',
    'tourSignup.required': 'Please fill in this field',
    'tourSignup.seatsLeft': '{{count}} places left',
    'tourSignup.seatsLeftOne': '1 place left',
    'tourSignup.signupsClosed': 'Signups for this tour are closed.',
    'tourSignup.submit': 'Send signup',
    'tourSignup.submitting': 'Sending…',
    'tourSignup.successBooked':
      'Thank you! Your signup is registered and we have sent you a confirmation.',
    'tourSignup.successWaiting':
      'Thank you! You are on the waiting list and we will be in touch if a place opens up.',
    'tourSignup.title': 'Sign up',
    'tourSignup.tooManyPeople': 'Please enter a number between 1 and {{max}}',
    'tours.registerInterest': 'Register interest',
    'tours.signUpBefore': 'Sign up before',
    'tours.share': 'Share this tour',
    'tours.shareCopied': 'Link copied to clipboard',
    'tours.shareFailed': 'Could not copy the link',
    'tours.viewItinerary': 'View full itinerary'
  },
  sv: {
    'about.built': 'Byggd',
    'about.commit': 'Commit',
    'about.environment': 'Miljö',
    'about.release': 'Utgåva',
    'about.version': 'Version',
    'colorScheme.currentClickFor':
      'Nuvarande: {{current}}, klicka för {{next}}',
    'colorScheme.dark': 'mörkt',
    'colorScheme.light': 'ljust',
    'colorScheme.switchTo': 'Byt till {{colorScheme}} utseende',
    'colorScheme.system': 'systeminställning',
    'error.contactAdmin': 'Kontakta administratören om problemet kvarstår.',
    'error.landingPageNotFound': 'Startsida hittades inte',
    'error.landingPageNotFoundDescription':
      'Skapa en sida i CMS och tilldela den som startsida.',
    'error.landingPageRenderFailed': 'Startsidan kunde inte visas.',
    'error.pageRenderFailed': 'Sidan du söker kunde inte visas.',
    'error.somethingWentWrong': 'Något gick fel!',
    'error.unableToLoadContent':
      'Det gick inte att ladda innehållet. Försök igen senare.',
    'iconPicker.dialogDescription': 'Välj den mest lämpade ikonen',
    'iconPicker.dialogTitle': 'Välj en ikon',
    'iconPicker.noIconsFound': 'Inga ikoner hittades...',
    'iconPicker.searchClearButton': 'Rensa sökning',
    'iconPicker.searchFieldPlaceholder': 'Sök ikon...',
    'iconPicker.labelSelect': 'Välj ikon',
    'imageCrop.cancel': 'Avbryt',
    'imageCrop.chooseImage': 'Välj bild',
    'imageCrop.confirm': 'Bekräfta',
    'imageCrop.confirming': 'Laddar upp…',
    'imageCrop.cropError': 'Kunde inte bearbeta bilden. Försök igen.',
    'imageCrop.noFileChosen': 'Ingen fil vald',
    'imageCrop.zoom': 'Zoom',
    'image.loadFailed': 'Bilden kunde inte laddas.',
    'iconCrop.currentIconAlt': 'Aktuell ikon',
    'iconCrop.drawerTitle': 'Beskär ikon (1:1)',
    'iconCrop.mediaFallback': 'Media #{{id}}',
    'iconCrop.remove': 'Ta bort',
    'iconCrop.replace': 'Ersätt',
    'iconCrop.uploadAndCrop': 'Ladda upp och beskär',
    'iconCrop.uploadFailed': 'Uppladdning misslyckades',
    'iconCrop.uploadFailedStatus':
      'Uppladdning misslyckades ({{status}}): {{message}}',
    'svgPreview.browseStudio': 'Bläddra i studio',
    'fileArea.download': 'Ladda ner',
    'fileArea.noFiles': 'Inga filer',
    'fileArea.previewNotAvailable':
      'Förhandsgranskning ej tillgänglig för den här filtypen',
    'fileArea.search': 'Sök...',
    'fileArea.sort': 'Sortera',
    'fileArea.sortDateNewest': 'Nyast först',
    'fileArea.sortDateOldest': 'Äldst först',
    'fileArea.sortNameAsc': 'Namn (A-Ö)',
    'fileArea.sortNameDesc': 'Namn (Ö-A)',
    'fileArea.sortSizeLargest': 'Storlek (störst)',
    'fileArea.sortSizeSmallest': 'Storlek (minst)',
    'fileArea.typeAudio': 'Ljud',
    'fileArea.typeDocument': 'Dokument',
    'fileArea.typeImage': 'Bild',
    'fileArea.typeOther': 'Övrigt',
    'fileArea.typePdf': 'PDF',
    'fileArea.typePresentation': 'Presentation',
    'fileArea.typeSpreadsheet': 'Kalkylark',
    'fileArea.typeVideo': 'Video',
    'fileArea.viewGrid': 'Rutnätsvy',
    'fileArea.viewList': 'Listvy',
    'form.submitSuccess': 'Formuläret skickades in',
    'form.submitFailed': 'Formuläret kunde inte skickas in',
    'form.submitFailedDescription': 'Försök igen.',
    'navigation.footer': 'Sidfot',
    'navigation.menu': 'Meny',
    'navigation.primary': 'Huvudmeny',
    'navigation.title': 'Navigation',
    'notFound.description': 'Tyvärr kunde vi inte hitta sidan du letade efter.',
    'notFound.goHome': 'Gå tillbaka till startsidan',
    'notFound.title': 'Sidan hittades inte',
    'posts.readMore': 'Läs mer',
    'social.clickToCopy': 'Klicka för att kopiera',
    'social.copied': 'Kopierad',
    'social.copyFailed': 'Kopiering misslyckades',
    'theme.select': 'Välj tema',
    'tours.addToCalendar': 'Lägg till i kalendern',
    'tours.backToTours': 'Tillbaka till resor',
    'tours.bookBefore': 'Boka senast',
    'tours.badgeFull': 'Fullbokad',
    'tours.badgeQueue': 'Väntelista',
    'tours.datesToBeConfirmed': 'Datum ej fastställt',
    'tours.bookingLede':
      'Skicka en förfrågan så bekräftar vi din plats. Bokningen stänger {{date}}.',
    'tours.bookTour': 'Boka den här resan',
    'tours.day': 'Dag {{day}}',
    'tours.departure': 'Avresa',
    'tours.duration': 'Längd',
    'tours.included': 'Det här ingår',
    'tours.itinerary': 'Resplan',
    'tours.notIncluded': 'Ingår inte',
    'tours.perPerson': 'per person',
    'tours.price': 'Pris',
    'tours.interestLede':
      'Meddela att du är intresserad så hör vi av oss när avresan är bekräftad. Ingenting är bindande.',
    'tours.print': 'Skriv ut resan',
    'tourSignupEmail.bookedBody':
      'Din plats på {{tour}} är bekräftad. Vi hör av oss närmare avresan med praktiska detaljer.',
    'tourSignupEmail.departureLabel': 'Avresa',
    'tourSignupEmail.detailsHeading': 'Din anmälan',
    'tourSignupEmail.greeting': 'Hej {{name}},',
    'tourSignupEmail.notificationBody':
      '{{name}} har anmält sig till {{tour}} för {{people}} personer.',
    'tourSignupEmail.notificationHeading': 'Ny anmälan',
    'tourSignupEmail.peopleLabel': 'Resenärer',
    'tourSignupEmail.privacyLink': 'Så hanterar vi dina uppgifter',
    'tourSignupEmail.promotedBody':
      'En plats har blivit ledig på {{tour}} och den är din. Din anmälan är nu bekräftad.',
    'tourSignupEmail.questions': 'Svara på det här mejlet om något är oklart.',
    'tourSignupEmail.firstInQueueLabel': 'Först i kön',
    'tourSignupEmail.openTour': 'Öppna resan',
    'tourSignupEmail.seatsFreeLabel': 'Lediga platser',
    'tourSignupEmail.seatsFreedAction':
      'Nya anmälningar hamnar i kön istället för att ta platserna, så resan fylls igen först när du flyttar upp någon.',
    'tourSignupEmail.seatsFreedBody':
      '{{count}} platser är lediga på {{tour}}. {{name}} står först i kön, för {{people}} personer.',
    'tourSignupEmail.subjectSeatsFreed': 'Lediga platser på {{tour}}',
    'tourSignupEmail.statusLabel': 'Status',
    'tourSignupEmail.statusBooked': 'Bekräftad',
    'tourSignupEmail.statusWaiting': 'Väntelista',
    'tourSignupEmail.subjectBooked': 'Din plats på {{tour}} är bekräftad',
    'tourSignupEmail.subjectNotification': 'Ny anmälan till {{tour}}',
    'tourSignupEmail.subjectPromoted': 'En plats har blivit ledig på {{tour}}',
    'tourSignupEmail.subjectWaiting': 'Du står i kön till {{tour}}',
    'tourSignupEmail.termsLink': 'Villkor',
    'tourSignupEmail.tourLabel': 'Resa',
    'tourSignupEmail.waitingBody':
      '{{tour}} är fullbokad, så du står i kön. Vi hör av oss så snart en plats blir ledig — inget debiteras och du kan ändra dig när du vill.',
    'tourSignup.acceptTerms': 'Jag godkänner villkoren',
    'tourSignup.acceptTermsRequired': 'Godkänn villkoren för att anmäla dig',
    'tourSignup.dataNotice':
      'Vi sparar ditt namn, din e-post, ditt telefonnummer och antal resenärer för att genomföra resan.',
    'tourSignup.dataNoticeRetention':
      'Dina uppgifter rensas {{days}} dagar efter avresan.',
    'tourSignup.privacyLink': 'Så hanterar vi dina uppgifter',
    'tourSignup.termsLink': 'Läs villkoren',
    'tourSignup.email': 'E-post',
    'tourSignup.failed': 'Anmälan kunde inte skickas. Försök igen.',
    'tourSignup.full': 'Resan är fullbokad',
    'tourSignup.queueOnly': 'Platser erbjuds från väntelistan',
    'tourSignup.queueOnlyCount':
      '{{count}} platser kvar — erbjuds först till väntelistan',
    'tourSignup.queueOnlyCountOne':
      '1 plats kvar — erbjuds först till väntelistan',
    'tourSignup.queueOnlyLede':
      'Andra väntar redan på plats på den här resan, så anmälningar ställs i kön i tur och ordning. Vi hör av oss när det är din tur.',
    'tourSignup.fullLede':
      'Ställ dig i kön så hör vi av oss om en plats blir ledig.',
    'tourSignup.joinWaitingList': 'Ställ mig i kön',
    'tourSignup.name': 'Namn',
    'tourSignup.people': 'Antal resenärer',
    'tourSignup.peopleHelp': 'Inklusive dig själv.',
    'tourSignup.phone': 'Telefon',
    'tourSignup.phoneOptional': 'Valfritt, men bra att ha på avresedagen.',
    'tourSignup.required': 'Fyll i det här fältet',
    'tourSignup.seatsLeft': '{{count}} platser kvar',
    'tourSignup.seatsLeftOne': '1 plats kvar',
    'tourSignup.signupsClosed': 'Anmälan till den här resan är stängd.',
    'tourSignup.submit': 'Skicka anmälan',
    'tourSignup.submitting': 'Skickar…',
    'tourSignup.successBooked':
      'Tack! Din anmälan är registrerad och vi har skickat en bekräftelse.',
    'tourSignup.successWaiting':
      'Tack! Du står i kön och vi hör av oss om en plats blir ledig.',
    'tourSignup.title': 'Anmäl dig',
    'tourSignup.tooManyPeople': 'Ange ett antal mellan 1 och {{max}}',
    'tours.registerInterest': 'Intresseanmälan',
    'tours.signUpBefore': 'Anmälan senast',
    'tours.share': 'Dela resan',
    'tours.shareCopied': 'Länken kopierad',
    'tours.shareFailed': 'Kunde inte kopiera länken',
    'tours.viewItinerary': 'Visa hela resplanen'
  }
} as const;

/**
 * Translate a key to the given locale.
 *
 * Falls back to English if the locale is not supported.
 * Supports simple `{{variable}}` interpolation via the `vars` argument.
 */
export function t(
  locale: string,
  key: TranslationKey,
  vars?: Record<string, string>
): string {
  const lang: SupportedLocale =
    locale in translations ? (locale as SupportedLocale) : 'en';

  let result: string = translations[lang][key] ?? translations.en[key] ?? key;

  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      result = result.replace(`{{${k}}}`, v);
    }
  }

  return result;
}
