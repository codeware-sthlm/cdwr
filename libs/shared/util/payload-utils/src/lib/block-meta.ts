/* AUTO-GENERATED — do not edit manually. Run `pnpm nx sync` to update. */

import type { BlockSlug } from '@codeware/shared/util/payload-types';

/** What a definition says, per locale. `en` is always written. */
export type LocalizedText = Record<string, string>;

/** One field an editor fills in, as the admin presents it. */
export type BlockFieldMeta = {
  name: string;
  type: string;
  required?: boolean;
  /** Shown only when a sibling field says so, so `required` applies then */
  conditional?: boolean;
  localized?: boolean;
  label?: LocalizedText;
  description?: LocalizedText;
  /** For a blocks field: the slugs it accepts */
  blocks?: Array<string>;
  /** For a group or an array, the fields inside it */
  fields?: Array<BlockFieldMeta>;
};

/**
 * A layout field that offers blocks.
 *
 * `posts` and `tours` are absent on purpose: they gate their blocks inside a
 * Lexical editor config, which cannot be read from the block definitions.
 */
export type BlockHost = 'pages' | 'reusable-content' | 'content';

export type BlockMeta = {
  slug: BlockSlug;
  label: LocalizedText;
  /** Empty means registered and rendered, but not offered anywhere */
  availableIn: Array<BlockHost>;
  fields: Array<BlockFieldMeta>;
};

/**
 * Every registered block, and what an editor fills in for it.
 *
 * Keyed by `BlockSlug`, so a block registered in Payload without an entry
 * here stops the build — the same guarantee `blocksMap` gives the renderer.
 * `nx sync --check` is what keeps the values current.
 */
export const BLOCK_META: Record<BlockSlug, BlockMeta> = {
  about: {
    slug: 'about',
    label: {
      en: 'About',
      sv: 'Om'
    },
    availableIn: ['pages'],
    fields: [
      {
        name: 'heading',
        type: 'text',
        label: {
          en: 'Heading',
          sv: 'Rubrik'
        },
        description: {
          en: 'Optional heading shown above the deployment details.',
          sv: 'Valfri rubrik som visas ovanför distributionsdetaljerna.'
        }
      }
    ]
  },
  'block-gallery': {
    slug: 'block-gallery',
    label: {
      en: 'Block gallery',
      sv: 'Blockgalleri'
    },
    availableIn: ['pages'],
    fields: [
      {
        name: 'eyebrow',
        type: 'text',
        localized: true,
        label: {
          en: 'Eyebrow',
          sv: 'Överrubrik'
        },
        description: {
          en: 'Small uppercase label shown above the heading',
          sv: 'Liten versal etikett som visas ovanför rubriken'
        }
      },
      {
        name: 'heading',
        type: 'text',
        required: true,
        localized: true,
        label: {
          en: 'Heading',
          sv: 'Rubrik'
        }
      },
      {
        name: 'intro',
        type: 'textarea',
        localized: true,
        label: {
          en: 'Intro',
          sv: 'Ingress'
        },
        description: {
          en: 'Short paragraph below the heading',
          sv: 'Kort stycke under rubriken'
        }
      },
      {
        name: 'mode',
        type: 'select',
        required: true,
        label: {
          en: 'Mode',
          sv: 'Läge'
        },
        description: {
          en: 'The index lists everything registered. The browser shows one block with its fields and an example, and steps to the next.',
          sv: 'Indexet listar allt som är registrerat. Bläddraren visar ett block med dess fält och ett exempel, och stegar vidare till nästa.'
        }
      }
    ]
  },
  callout: {
    slug: 'callout',
    label: {
      en: 'Callout',
      sv: 'Callout'
    },
    availableIn: ['pages'],
    fields: [
      {
        name: 'showMark',
        type: 'checkbox',
        label: {
          en: 'Show brand mark',
          sv: 'Visa varumärke'
        }
      },
      {
        name: 'heading',
        type: 'text',
        required: true,
        localized: true,
        label: {
          en: 'Heading',
          sv: 'Rubrik'
        }
      },
      {
        name: 'body',
        type: 'textarea',
        localized: true,
        label: {
          en: 'Body',
          sv: 'Text'
        }
      },
      {
        name: 'image',
        type: 'upload',
        label: {
          en: 'Image',
          sv: 'Bild'
        },
        description: {
          en: 'Optional. Sits beside the text and turns the band into a two-column section.',
          sv: 'Valfri. Placeras bredvid texten och gör bandet tvåspaltigt.'
        }
      },
      {
        name: 'link',
        type: 'group',
        fields: [
          {
            name: 'type',
            type: 'radio'
          },
          {
            name: 'newTab',
            type: 'checkbox',
            label: {
              en: 'Open in new tab',
              sv: 'Öppna i ny flik'
            }
          },
          {
            name: 'reference',
            type: 'relationship',
            required: true,
            conditional: true,
            label: {
              en: 'Document to link to',
              sv: 'Dokument att länka till'
            }
          },
          {
            name: 'url',
            type: 'text',
            required: true,
            conditional: true,
            label: {
              en: 'Custom URL',
              sv: 'Anpassad URL'
            },
            description: {
              en: 'Add protocol (http:// or https://) if the link is external',
              sv: 'Lägg till protokoll (http:// eller https://) om länken är extern'
            }
          },
          {
            name: 'label',
            type: 'text',
            required: true,
            localized: true,
            label: {
              en: 'Label',
              sv: 'Etikett'
            }
          }
        ]
      }
    ]
  },
  card: {
    slug: 'card',
    label: {
      en: 'Card',
      sv: 'Kort'
    },
    availableIn: ['pages', 'reusable-content', 'content'],
    fields: [
      {
        name: 'cards',
        type: 'array',
        fields: [
          {
            name: 'brand',
            type: 'group',
            label: {
              en: 'Branding',
              sv: 'Märkning'
            },
            description: {
              en: 'Select an icon and color that represent the card',
              sv: 'Välj en ikon och färg som representerar kortet'
            },
            fields: [
              {
                name: 'icon',
                type: 'text',
                label: {
                  en: 'Icon',
                  sv: 'Ikon'
                }
              },
              {
                name: 'color',
                type: 'text',
                label: {
                  en: 'Color',
                  sv: 'Färg'
                }
              }
            ]
          },
          {
            name: 'title',
            type: 'text',
            required: true,
            localized: true,
            label: {
              en: 'Title',
              sv: 'Titel'
            }
          },
          {
            name: 'description',
            type: 'text',
            localized: true,
            label: {
              en: 'Description',
              sv: 'Beskrivning'
            },
            description: {
              en: 'A text that will complement the title',
              sv: 'En text som ska komplettera titeln'
            }
          },
          {
            name: 'content',
            type: 'textarea',
            required: true,
            localized: true,
            label: {
              en: 'Main content',
              sv: 'Huvudinnehåll'
            }
          },
          {
            name: 'enableLink',
            type: 'checkbox',
            label: {
              en: 'Card link',
              sv: 'Länk på kortet'
            },
            description: {
              en: 'Let the card link to a page or external URL',
              sv: 'Låt kortet länka till en sida eller en extern URL'
            }
          },
          {
            name: 'link',
            type: 'group',
            conditional: true,
            fields: [
              {
                name: 'type',
                type: 'radio'
              },
              {
                name: 'newTab',
                type: 'checkbox',
                label: {
                  en: 'Open in new tab',
                  sv: 'Öppna i ny flik'
                }
              },
              {
                name: 'reference',
                type: 'relationship',
                required: true,
                conditional: true,
                label: {
                  en: 'Document to link to',
                  sv: 'Dokument att länka till'
                }
              },
              {
                name: 'url',
                type: 'text',
                required: true,
                conditional: true,
                label: {
                  en: 'Custom URL',
                  sv: 'Anpassad URL'
                },
                description: {
                  en: 'Add protocol (http:// or https://) if the link is external',
                  sv: 'Lägg till protokoll (http:// eller https://) om länken är extern'
                }
              },
              {
                name: 'navTrigger',
                type: 'radio',
                label: {
                  en: 'Navigation trigger',
                  sv: 'Navigering aktiveras'
                }
              },
              {
                name: 'label',
                type: 'text',
                required: true,
                conditional: true,
                localized: true,
                label: {
                  en: 'Link label',
                  sv: 'Länk text'
                }
              }
            ]
          }
        ]
      }
    ]
  },
  code: {
    slug: 'code',
    label: {
      en: 'Code',
      sv: 'Kod'
    },
    availableIn: ['pages', 'reusable-content', 'content'],
    fields: [
      {
        name: 'language',
        type: 'select',
        required: true,
        label: {
          en: 'Language',
          sv: 'Språk'
        }
      },
      {
        name: 'code',
        type: 'code',
        required: true
      }
    ]
  },
  content: {
    slug: 'content',
    label: {
      en: 'Content',
      sv: 'Innehåll'
    },
    availableIn: ['pages', 'reusable-content'],
    fields: [
      {
        name: 'columns',
        type: 'array',
        fields: [
          {
            name: 'size',
            type: 'select',
            label: {
              en: 'Width',
              sv: 'Bredd'
            }
          },
          {
            name: 'richText',
            type: 'richText',
            localized: true
          },
          {
            name: 'blocks',
            type: 'blocks',
            blocks: [
              'card',
              'code',
              'form',
              'image',
              'reusable-content',
              'social-media',
              'spacing'
            ]
          }
        ]
      }
    ]
  },
  'feature-cards': {
    slug: 'feature-cards',
    label: {
      en: 'Feature cards',
      sv: 'Funktionskort'
    },
    availableIn: ['pages'],
    fields: [
      {
        name: 'eyebrow',
        type: 'text',
        localized: true,
        label: {
          en: 'Eyebrow',
          sv: 'Överrubrik'
        },
        description: {
          en: 'Small uppercase label shown above the heading',
          sv: 'Liten versal etikett som visas ovanför rubriken'
        }
      },
      {
        name: 'heading',
        type: 'text',
        required: true,
        localized: true,
        label: {
          en: 'Heading',
          sv: 'Rubrik'
        }
      },
      {
        name: 'intro',
        type: 'textarea',
        localized: true,
        label: {
          en: 'Intro',
          sv: 'Ingress'
        },
        description: {
          en: 'Short paragraph below the heading',
          sv: 'Kort stycke under rubriken'
        }
      },
      {
        name: 'columns',
        type: 'select',
        label: {
          en: 'Columns',
          sv: 'Kolumner'
        },
        description: {
          en: 'Desktop column count. Auto fits to the number of items.',
          sv: 'Antal kolumner på desktop. Auto anpassar efter antal objekt.'
        }
      },
      {
        name: 'items',
        type: 'array',
        label: {
          en: 'Cards',
          sv: 'Kort'
        },
        fields: [
          {
            name: 'brand',
            type: 'group',
            label: {
              en: 'Branding',
              sv: 'Märkning'
            },
            description: {
              en: 'Icon and color for this item',
              sv: 'Ikon och färg för objektet'
            },
            fields: [
              {
                name: 'icon',
                type: 'text',
                label: {
                  en: 'Icon',
                  sv: 'Ikon'
                }
              },
              {
                name: 'color',
                type: 'text',
                label: {
                  en: 'Color',
                  sv: 'Färg'
                }
              }
            ]
          },
          {
            name: 'title',
            type: 'text',
            required: true,
            localized: true,
            label: {
              en: 'Title',
              sv: 'Titel'
            }
          },
          {
            name: 'description',
            type: 'textarea',
            required: true,
            localized: true,
            label: {
              en: 'Description',
              sv: 'Beskrivning'
            }
          }
        ]
      }
    ]
  },
  'feature-section': {
    slug: 'feature-section',
    label: {
      en: 'Feature section',
      sv: 'Funktionssektion'
    },
    availableIn: ['pages'],
    fields: [
      {
        name: 'eyebrow',
        type: 'text',
        localized: true,
        label: {
          en: 'Eyebrow',
          sv: 'Överrubrik'
        },
        description: {
          en: 'Small uppercase label shown above the heading',
          sv: 'Liten versal etikett som visas ovanför rubriken'
        }
      },
      {
        name: 'heading',
        type: 'text',
        required: true,
        localized: true,
        label: {
          en: 'Heading',
          sv: 'Rubrik'
        }
      },
      {
        name: 'intro',
        type: 'textarea',
        localized: true,
        label: {
          en: 'Intro',
          sv: 'Ingress'
        },
        description: {
          en: 'Short paragraph below the heading',
          sv: 'Kort stycke under rubriken'
        }
      },
      {
        name: 'enableLink',
        type: 'checkbox',
        label: {
          en: 'Show a link below the intro',
          sv: 'Visa en länk under ingressen'
        }
      },
      {
        name: 'link',
        type: 'group',
        conditional: true,
        fields: [
          {
            name: 'type',
            type: 'radio'
          },
          {
            name: 'newTab',
            type: 'checkbox',
            label: {
              en: 'Open in new tab',
              sv: 'Öppna i ny flik'
            }
          },
          {
            name: 'reference',
            type: 'relationship',
            required: true,
            conditional: true,
            label: {
              en: 'Document to link to',
              sv: 'Dokument att länka till'
            }
          },
          {
            name: 'url',
            type: 'text',
            required: true,
            conditional: true,
            label: {
              en: 'Custom URL',
              sv: 'Anpassad URL'
            },
            description: {
              en: 'Add protocol (http:// or https://) if the link is external',
              sv: 'Lägg till protokoll (http:// eller https://) om länken är extern'
            }
          },
          {
            name: 'label',
            type: 'text',
            required: true,
            localized: true,
            label: {
              en: 'Label',
              sv: 'Etikett'
            }
          }
        ]
      },
      {
        name: 'media',
        type: 'upload',
        label: {
          en: 'Visual',
          sv: 'Bild'
        },
        description: {
          en: 'The image that carries the claim above it.',
          sv: 'Bilden som bär påståendet ovanför.'
        }
      },
      {
        name: 'subFeatures',
        type: 'array',
        label: {
          en: 'Supporting points',
          sv: 'Stödpunkter'
        },
        description: {
          en: 'Shown as one divided row beneath the visual. Two to four reads best.',
          sv: 'Visas som en delad rad under bilden. Två till fyra fungerar bäst.'
        },
        fields: [
          {
            name: 'title',
            type: 'text',
            required: true,
            localized: true,
            label: {
              en: 'Title',
              sv: 'Titel'
            }
          },
          {
            name: 'body',
            type: 'textarea',
            required: true,
            localized: true,
            label: {
              en: 'Body',
              sv: 'Text'
            }
          }
        ]
      }
    ]
  },
  'file-area': {
    slug: 'file-area',
    label: {
      en: 'File Area',
      sv: 'Filyta'
    },
    availableIn: ['pages', 'reusable-content'],
    fields: [
      {
        name: 'tags',
        type: 'relationship',
        label: {
          en: 'Tags',
          sv: 'Etiketter'
        },
        description: {
          en: 'Select tags that represent the files to show in the file area.',
          sv: 'Välj etiketter som representerar de filer som ska visas i filområdet.'
        }
      },
      {
        name: 'files',
        type: 'array',
        fields: [
          {
            name: 'media',
            type: 'relationship'
          }
        ]
      }
    ]
  },
  form: {
    slug: 'form',
    label: {
      en: 'Forms',
      sv: 'Formulär'
    },
    availableIn: ['pages', 'reusable-content', 'content'],
    fields: [
      {
        name: 'form',
        type: 'relationship',
        required: true
      },
      {
        name: 'enableIntro',
        type: 'checkbox',
        label: {
          en: 'Add an introduction to the form',
          sv: 'Lägg till en introduktion till formuläret'
        }
      },
      {
        name: 'introContent',
        type: 'richText',
        conditional: true,
        label: {
          en: 'Introduction',
          sv: 'Introduktion'
        }
      }
    ]
  },
  hero: {
    slug: 'hero',
    label: {
      en: 'Hero',
      sv: 'Hero'
    },
    availableIn: ['pages'],
    fields: [
      {
        name: 'badge',
        type: 'text',
        localized: true,
        label: {
          en: 'Badge',
          sv: 'Etikett'
        },
        description: {
          en: 'Optional pill above the headline. The tenant logo is shown automatically when available.',
          sv: 'Valfri etikett ovanför rubriken. Arbetsgruppens logotyp visas automatiskt när den är tillgänglig.'
        }
      },
      {
        name: 'heading',
        type: 'text',
        required: true,
        localized: true,
        label: {
          en: 'Headline',
          sv: 'Rubrik'
        }
      },
      {
        name: 'lede',
        type: 'textarea',
        required: true,
        localized: true,
        label: {
          en: 'Introduction',
          sv: 'Introduktion'
        },
        description: {
          en: 'The part that hooks the reader and conveys the most essential information (often answering who, what, when, where, why).',
          sv: 'Den del som fångar läsaren och förmedlar den mest väsentliga informationen (ofta svar på vem, vad, när, var, varför).'
        }
      },
      {
        name: 'media',
        type: 'upload',
        label: {
          en: 'Visual',
          sv: 'Bild'
        },
        description: {
          en: 'Shown below the actions. What makes the claim above checkable rather than asserted.',
          sv: 'Visas under knapparna. Det som gör påståendet ovanför kontrollerbart i stället för påstått.'
        }
      },
      {
        name: 'actions',
        type: 'array',
        label: {
          en: 'Actions',
          sv: 'Åtgärder'
        },
        fields: [
          {
            name: 'link',
            type: 'group',
            fields: [
              {
                name: 'type',
                type: 'radio'
              },
              {
                name: 'newTab',
                type: 'checkbox',
                label: {
                  en: 'Open in new tab',
                  sv: 'Öppna i ny flik'
                }
              },
              {
                name: 'reference',
                type: 'relationship',
                required: true,
                conditional: true,
                label: {
                  en: 'Document to link to',
                  sv: 'Dokument att länka till'
                }
              },
              {
                name: 'url',
                type: 'text',
                required: true,
                conditional: true,
                label: {
                  en: 'Custom URL',
                  sv: 'Anpassad URL'
                },
                description: {
                  en: 'Add protocol (http:// or https://) if the link is external',
                  sv: 'Lägg till protokoll (http:// eller https://) om länken är extern'
                }
              },
              {
                name: 'label',
                type: 'text',
                required: true,
                localized: true,
                label: {
                  en: 'Label',
                  sv: 'Etikett'
                }
              }
            ]
          },
          {
            name: 'emphasis',
            type: 'select',
            label: {
              en: 'Emphasis',
              sv: 'Betoning'
            }
          }
        ]
      }
    ]
  },
  image: {
    slug: 'image',
    label: {
      en: 'Image',
      sv: 'Bild'
    },
    availableIn: ['pages', 'reusable-content', 'content'],
    fields: [
      {
        name: 'media',
        type: 'upload',
        required: true,
        label: {
          en: 'Image',
          sv: 'Bild'
        },
        description: {
          en: 'Select an image.',
          sv: 'Välj en bild.'
        }
      }
    ]
  },
  media: {
    slug: 'media',
    label: {
      en: 'Media',
      sv: 'Media'
    },
    availableIn: [],
    fields: [
      {
        name: 'media',
        type: 'upload',
        required: true
      }
    ]
  },
  'pill-list': {
    slug: 'pill-list',
    label: {
      en: 'Pill list',
      sv: 'Etikettlista'
    },
    availableIn: ['pages'],
    fields: [
      {
        name: 'eyebrow',
        type: 'text',
        localized: true,
        label: {
          en: 'Eyebrow',
          sv: 'Överrubrik'
        },
        description: {
          en: 'Small uppercase label shown above the heading',
          sv: 'Liten versal etikett som visas ovanför rubriken'
        }
      },
      {
        name: 'heading',
        type: 'text',
        required: true,
        localized: true,
        label: {
          en: 'Heading',
          sv: 'Rubrik'
        }
      },
      {
        name: 'intro',
        type: 'textarea',
        localized: true,
        label: {
          en: 'Intro',
          sv: 'Ingress'
        },
        description: {
          en: 'Short paragraph below the heading',
          sv: 'Kort stycke under rubriken'
        }
      },
      {
        name: 'surface',
        type: 'select',
        label: {
          en: 'Surface',
          sv: 'Yta'
        },
        description: {
          en: 'Background treatment',
          sv: 'Bakgrund'
        }
      },
      {
        name: 'items',
        type: 'array',
        label: {
          en: 'Pills',
          sv: 'Etiketter'
        },
        fields: [
          {
            name: 'label',
            type: 'text',
            required: true,
            label: {
              en: 'Label',
              sv: 'Etikett'
            },
            description: {
              en: 'e.g. "my-package"',
              sv: 't.ex. "mitt-paket"'
            }
          },
          {
            name: 'url',
            type: 'text',
            label: {
              en: 'URL',
              sv: 'URL'
            },
            description: {
              en: 'Optional external link',
              sv: 'Valfri extern länk'
            }
          }
        ]
      }
    ]
  },
  posts: {
    slug: 'posts',
    label: {
      en: 'Posts Listing',
      sv: 'Inlägglista'
    },
    availableIn: ['pages'],
    fields: [
      {
        name: 'title',
        type: 'text',
        required: true,
        localized: true,
        label: {
          en: 'Title',
          sv: 'Titel'
        }
      },
      {
        name: 'description',
        type: 'textarea',
        localized: true,
        label: {
          en: 'Description',
          sv: 'Beskrivning'
        }
      },
      {
        name: 'limit',
        type: 'number',
        required: true,
        label: {
          en: 'Max posts',
          sv: 'Max inlägg'
        },
        description: {
          en: 'Maximum number of posts to display',
          sv: 'Maximalt antal inlägg att visa'
        }
      }
    ]
  },
  'reusable-content': {
    slug: 'reusable-content',
    label: {
      en: 'Reusable Content',
      sv: 'Delat Innehåll'
    },
    availableIn: ['pages', 'content'],
    fields: [
      {
        name: 'reusableContent',
        type: 'relationship',
        required: true
      },
      {
        name: 'refId',
        type: 'text',
        label: {
          en: 'Reference',
          sv: 'Referens'
        },
        description: {
          en: 'Optional reference that can be used to identify this block with CSS or JavaScript.',
          sv: 'Valfri referens som kan användas för att identifiera blocket med CSS eller JavaScript.'
        }
      }
    ]
  },
  showcase: {
    slug: 'showcase',
    label: {
      en: 'Showcase',
      sv: 'Showcase'
    },
    availableIn: ['pages'],
    fields: [
      {
        name: 'eyebrow',
        type: 'text',
        localized: true,
        label: {
          en: 'Eyebrow',
          sv: 'Överrubrik'
        },
        description: {
          en: 'Small uppercase label shown above the heading',
          sv: 'Liten versal etikett som visas ovanför rubriken'
        }
      },
      {
        name: 'heading',
        type: 'text',
        required: true,
        localized: true,
        label: {
          en: 'Heading',
          sv: 'Rubrik'
        }
      },
      {
        name: 'intro',
        type: 'textarea',
        localized: true,
        label: {
          en: 'Intro',
          sv: 'Ingress'
        },
        description: {
          en: 'Short paragraph below the heading',
          sv: 'Kort stycke under rubriken'
        }
      },
      {
        name: 'enableHeaderLink',
        type: 'checkbox',
        label: {
          en: 'Show link in the header',
          sv: 'Visa länk i rubriken'
        }
      },
      {
        name: 'link',
        type: 'group',
        conditional: true,
        fields: [
          {
            name: 'type',
            type: 'radio'
          },
          {
            name: 'newTab',
            type: 'checkbox',
            label: {
              en: 'Open in new tab',
              sv: 'Öppna i ny flik'
            }
          },
          {
            name: 'reference',
            type: 'relationship',
            required: true,
            conditional: true,
            label: {
              en: 'Document to link to',
              sv: 'Dokument att länka till'
            }
          },
          {
            name: 'url',
            type: 'text',
            required: true,
            conditional: true,
            label: {
              en: 'Custom URL',
              sv: 'Anpassad URL'
            },
            description: {
              en: 'Add protocol (http:// or https://) if the link is external',
              sv: 'Lägg till protokoll (http:// eller https://) om länken är extern'
            }
          },
          {
            name: 'label',
            type: 'text',
            required: true,
            localized: true,
            label: {
              en: 'Label',
              sv: 'Etikett'
            }
          }
        ]
      },
      {
        name: 'items',
        type: 'array',
        label: {
          en: 'Items',
          sv: 'Objekt'
        },
        fields: [
          {
            name: 'tag',
            type: 'text',
            localized: true,
            label: {
              en: 'Tag',
              sv: 'Etikett'
            },
            description: {
              en: 'Small badge, e.g. "Platform"',
              sv: 'Liten etikett, t.ex. "Plattform"'
            }
          },
          {
            name: 'title',
            type: 'text',
            required: true,
            localized: true,
            label: {
              en: 'Title',
              sv: 'Titel'
            }
          },
          {
            name: 'description',
            type: 'textarea',
            required: true,
            localized: true,
            label: {
              en: 'Description',
              sv: 'Beskrivning'
            }
          },
          {
            name: 'meta',
            type: 'text',
            label: {
              en: 'Meta',
              sv: 'Meta'
            },
            description: {
              en: 'Monospace line, e.g. "Nx · Payload · Postgres"',
              sv: 'Monospace-rad, t.ex. "Nx · Payload · Postgres"'
            }
          },
          {
            name: 'link',
            type: 'group',
            fields: [
              {
                name: 'type',
                type: 'radio'
              },
              {
                name: 'newTab',
                type: 'checkbox',
                label: {
                  en: 'Open in new tab',
                  sv: 'Öppna i ny flik'
                }
              },
              {
                name: 'reference',
                type: 'relationship',
                required: true,
                conditional: true,
                label: {
                  en: 'Document to link to',
                  sv: 'Dokument att länka till'
                }
              },
              {
                name: 'url',
                type: 'text',
                required: true,
                conditional: true,
                label: {
                  en: 'Custom URL',
                  sv: 'Anpassad URL'
                },
                description: {
                  en: 'Add protocol (http:// or https://) if the link is external',
                  sv: 'Lägg till protokoll (http:// eller https://) om länken är extern'
                }
              },
              {
                name: 'label',
                type: 'text',
                required: true,
                localized: true,
                label: {
                  en: 'Label',
                  sv: 'Etikett'
                }
              }
            ]
          }
        ]
      }
    ]
  },
  'social-media': {
    slug: 'social-media',
    label: {
      en: 'Social Media',
      sv: 'Sociala Media'
    },
    availableIn: ['pages', 'reusable-content', 'content'],
    fields: [
      {
        name: 'social',
        type: 'array',
        label: {
          en: 'Social Media Links',
          sv: 'Länkar till sociala medier'
        },
        fields: [
          {
            name: 'platform',
            type: 'select',
            required: true,
            label: {
              en: 'Platform',
              sv: 'Plattform'
            }
          },
          {
            name: 'email',
            type: 'email',
            required: true,
            conditional: true,
            label: {
              en: 'Email',
              sv: 'E-post'
            }
          },
          {
            name: 'phone',
            type: 'text',
            required: true,
            conditional: true,
            label: {
              en: 'Phone',
              sv: 'Telefon'
            }
          },
          {
            name: 'url',
            type: 'text',
            required: true,
            conditional: true,
            label: {
              en: 'URL',
              sv: 'URL'
            }
          },
          {
            name: 'withLabel',
            type: 'checkbox',
            label: {
              en: 'With label',
              sv: 'Med text'
            }
          },
          {
            name: 'label',
            type: 'text',
            conditional: true,
            label: {
              en: 'Icon label',
              sv: 'Ikon text'
            },
            description: {
              en: 'Short text to display next to the icon',
              sv: 'Kort text som visas bredvid ikonen'
            }
          }
        ]
      },
      {
        name: 'direction',
        type: 'radio',
        conditional: true,
        label: {
          en: 'Direction',
          sv: 'Riktning'
        },
        description: {
          en: 'How the social media links are displayed',
          sv: 'Hur länkarna ska visas'
        }
      }
    ]
  },
  spacing: {
    slug: 'spacing',
    label: {
      en: 'Empty Spacing',
      sv: 'Tomrum'
    },
    availableIn: ['pages', 'reusable-content', 'content'],
    fields: [
      {
        name: 'size',
        type: 'select',
        required: true,
        label: {
          en: 'Size',
          sv: 'Storlek'
        },
        description: {
          en: 'Regular spacing size matches the default spacing between blocks',
          sv: '"Regular" matchar det normala avståndet som finns mellan block'
        }
      },
      {
        name: 'divider',
        type: 'checkbox',
        label: {
          en: 'Horizontal divider',
          sv: 'Horisontell linje'
        }
      },
      {
        name: 'color',
        type: 'text',
        conditional: true,
        label: {
          en: 'Color',
          sv: 'Färg'
        },
        description: {
          en: 'Override divider theme color',
          sv: 'Sätt en annan färg än temats för divider'
        }
      }
    ]
  },
  testimonial: {
    slug: 'testimonial',
    label: {
      en: 'Testimonial',
      sv: 'Omdöme'
    },
    availableIn: ['pages'],
    fields: [
      {
        name: 'quote',
        type: 'textarea',
        required: true,
        localized: true,
        label: {
          en: 'Quote',
          sv: 'Citat'
        },
        description: {
          en: 'In their words, not yours. One or two sentences carry further than a paragraph.',
          sv: 'Med deras ord, inte dina. En eller två meningar bär längre än ett stycke.'
        }
      },
      {
        name: 'author',
        type: 'group',
        label: {
          en: 'Attribution',
          sv: 'Källa'
        },
        fields: [
          {
            name: 'name',
            type: 'text',
            required: true,
            label: {
              en: 'Name',
              sv: 'Namn'
            }
          },
          {
            name: 'role',
            type: 'text',
            localized: true,
            label: {
              en: 'Role and company',
              sv: 'Roll och företag'
            }
          },
          {
            name: 'avatar',
            type: 'upload',
            label: {
              en: 'Portrait',
              sv: 'Porträtt'
            }
          }
        ]
      },
      {
        name: 'logo',
        type: 'upload',
        label: {
          en: 'Company mark',
          sv: 'Företagsmärke'
        },
        description: {
          en: 'Shown beside the quote. Leave empty when the name is enough.',
          sv: 'Visas bredvid citatet. Lämna tomt när namnet räcker.'
        }
      },
      {
        name: 'enableLink',
        type: 'checkbox',
        label: {
          en: 'Link to the longer story',
          sv: 'Länka till hela berättelsen'
        }
      },
      {
        name: 'link',
        type: 'group',
        conditional: true,
        fields: [
          {
            name: 'type',
            type: 'radio'
          },
          {
            name: 'newTab',
            type: 'checkbox',
            label: {
              en: 'Open in new tab',
              sv: 'Öppna i ny flik'
            }
          },
          {
            name: 'reference',
            type: 'relationship',
            required: true,
            conditional: true,
            label: {
              en: 'Document to link to',
              sv: 'Dokument att länka till'
            }
          },
          {
            name: 'url',
            type: 'text',
            required: true,
            conditional: true,
            label: {
              en: 'Custom URL',
              sv: 'Anpassad URL'
            },
            description: {
              en: 'Add protocol (http:// or https://) if the link is external',
              sv: 'Lägg till protokoll (http:// eller https://) om länken är extern'
            }
          },
          {
            name: 'label',
            type: 'text',
            required: true,
            localized: true,
            label: {
              en: 'Label',
              sv: 'Etikett'
            }
          }
        ]
      }
    ]
  },
  tours: {
    slug: 'tours',
    label: {
      en: 'Tour Listing',
      sv: 'Reslista'
    },
    availableIn: ['pages'],
    fields: [
      {
        name: 'title',
        type: 'text',
        required: true,
        localized: true,
        label: {
          en: 'Title',
          sv: 'Titel'
        }
      },
      {
        name: 'description',
        type: 'textarea',
        localized: true,
        label: {
          en: 'Description',
          sv: 'Beskrivning'
        }
      },
      {
        name: 'limit',
        type: 'number',
        required: true,
        label: {
          en: 'Max tours',
          sv: 'Max resor'
        },
        description: {
          en: 'Maximum number of tours to display',
          sv: 'Maximalt antal resor att visa'
        }
      }
    ]
  }
};
