import type {
  I18n,
  I18nClient,
  NestedKeysStripped,
  TFunction
} from '@payloadcms/translations';
import { enTranslations } from '@payloadcms/translations/languages/en';
import z from 'zod';

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const customTranslationsSchema = z.object({
  authentication: z.object({
    cannotAssignToWorkspace: z.string(),
    cannotRemoveFromWorkspace: z.string(),
    crossTenantDenied: z.string()
  }),
  collection: z.object({
    cardWithSuffix: z.string(),
    socialMediaWithSuffix: z.string()
  }),
  dashboard: z.object({
    badgeDraft: z.string(),
    badgeNew: z.string(),
    badgePublished: z.string(),
    contentLead: z.string(),
    continueEditing: z.string(),
    emptyActivitySub: z.string(),
    emptyActivityTitle: z.string(),
    emptyCta: z.string(),
    emptyDraftsSub: z.string(),
    emptyDraftsTitle: z.string(),
    gettingStartedDismiss: z.string(),
    gettingStartedSub: z.string(),
    gettingStartedTitle: z.string(),
    heading: z.string(),
    items: z.string(),
    lead: z.string(),
    limitLabel: z.string(),
    newButton: z.string(),
    openToEdit: z.string(),
    recentActivity: z.string(),
    tabAllContent: z.string(),
    tabHome: z.string(),
    tabPlatform: z.string(),
    taskAddPage: z.string(),
    taskAddPageSub: z.string(),
    taskEditMenu: z.string(),
    taskEditMenuSub: z.string(),
    taskInviteTeammate: z.string(),
    taskInviteTeammateSub: z.string(),
    taskReadMessages: z.string(),
    taskReadMessagesSub: z.string(),
    taskReadMessagesSubCount: z.string(),
    taskUploadImage: z.string(),
    taskUploadImageSub: z.string(),
    taskWritePost: z.string(),
    taskWritePostSub: z.string()
  }),
  domains: z.object({
    actionFailed: z.string(),
    active: z.string(),
    apexNote: z.string(),
    check: z.string(),
    checkedAt: z.string(),
    compareResolvers: z.string(),
    copyRecord: z.string(),
    dnsLede: z.string(),
    dnsNameHint: z.string(),
    dnsOwnershipLede: z.string(),
    dnsSettledLede: z.string(),
    dnsTrafficLede: z.string(),
    dnsValidationLede: z.string(),
    hasIssues: z.string(),
    heading: z.string(),
    issuedBy: z.string(),
    issuedHeading: z.string(),
    issuesActiveHeading: z.string(),
    issuesHeading: z.string(),
    mismatchBody: z.string(),
    mismatchForceLogout: z.string(),
    mismatchHeading: z.string(),
    mismatchOpenExpected: z.string(),
    neverChecked: z.string(),
    notRequested: z.string(),
    ownerPlatform: z.string(),
    ownerWorkspace: z.string(),
    paused: z.string(),
    pending: z.string(),
    rateLimited: z.string(),
    remove: z.string(),
    request: z.string(),
    resolversAgree: z.string(),
    resolversDisagree: z.string(),
    resolversHeading: z.string(),
    resolversNegativeCache: z.string(),
    resolversNoAnswer: z.string(),
    resolversUnreachable: z.string(),
    restart: z.string(),
    restartHint: z.string(),
    saveFirst: z.string()
  }),
  forms: z.object({
    notificationRecipient: z.string(),
    notificationRecipientMissing: z.string(),
    notificationSettingsLink: z.string()
  }),
  formSubmissions: z.object({
    allForms: z.string(),
    deletedForm: z.string(),
    empty: z.string(),
    emptyTitle: z.string(),
    exportCsv: z.string(),
    exportNeedsForm: z.string(),
    filterByForm: z.string(),
    markAllRead: z.string(),
    noValues: z.string(),
    notificationFailed: z.string(),
    notificationFailedDetail: z.string(),
    notificationNoRecipient: z.string(),
    notificationNoRecipientDetail: z.string(),
    orphanedField: z.string(),
    pageOf: z.string(),
    received: z.string(),
    total: z.string(),
    unread: z.string(),
    unreadOnly: z.string()
  }),
  general: z.object({ clearSelectedColor: z.string() }),
  help: z.object({
    drawerDescription: z.string(),
    drawerTitle: z.string(),
    empty: z.string(),
    loadError: z.string(),
    loading: z.string(),
    manageFaq: z.string(),
    openHelp: z.string()
  }),
  media: z.object({
    calloutDescriptions: z.string(),
    calloutTitle: z.string()
  }),
  nav: z.object({
    accountSettings: z.string(),
    collapseSidebar: z.string(),
    colorSchemeAuto: z.string(),
    colorSchemeDark: z.string(),
    colorSchemeLight: z.string(),
    contentLocale: z.string(),
    contentLocaleAria: z.string(),
    create: z.string(),
    expandSidebar: z.string(),
    home: z.string(),
    interfaceLanguage: z.string(),
    logOut: z.string(),
    newBlogPost: z.string(),
    newPage: z.string(),
    noMatches: z.string(),
    openSidebar: z.string(),
    platformGroup: z.string(),
    roleEditor: z.string(),
    roleSystemAdmin: z.string(),
    searchPlaceholder: z.string(),
    themeLibrary: z.string(),
    uploadMedia: z.string()
  }),
  platform: z.object({
    buildTitle: z.string(),
    buildUnstamped: z.string(),
    domainsMetric: z.string(),
    domainsNone: z.string(),
    domainsOpen: z.string(),
    domainsSheetSub: z.string(),
    domainsTitle: z.string(),
    integrationsAllConfigured: z.string(),
    integrationsEmailMissing: z.string(),
    integrationsEmailNotDelivered: z.string(),
    integrationsIncomplete: z.string(),
    integrationsMetric: z.string(),
    integrationsNotProduction: z.string(),
    integrationsOpen: z.string(),
    integrationsSheetSub: z.string(),
    integrationsTitle: z.string(),
    labelEmail: z.string(),
    labelInfisical: z.string(),
    labelSentry: z.string(),
    labelStorage: z.string(),
    mailDeliveryAllDelivered: z.string(),
    mailDeliveryFailures: z.string(),
    mailDeliveryMetric: z.string(),
    mailDeliveryNoSends: z.string(),
    mailDeliveryOpen: z.string(),
    mailDeliverySheetSub: z.string(),
    mailDeliveryTitle: z.string(),
    modeHost: z.string(),
    modeTenant: z.string(),
    notConfigured: z.string(),
    summaryAllActive: z.string(),
    summaryExpiring: z.string(),
    summaryIssues: z.string(),
    summaryNotRequested: z.string(),
    summaryPaused: z.string(),
    summaryPending: z.string()
  }),
  palette: z.object({
    aboutDescription: z.string(),
    aboutTitle: z.string(),
    actionAbout: z.string(),
    actionGettingStarted: z.string(),
    actionHelp: z.string(),
    dialogDescription: z.string(),
    dialogTitle: z.string(),
    groupActions: z.string(),
    groupNavigation: z.string(),
    groupRecent: z.string(),
    groupWorkspaces: z.string(),
    noResults: z.string(),
    openPalette: z.string(),
    placeholder: z.string(),
    searchError: z.string(),
    searching: z.string(),
    untitled: z.string(),
    workspaceAll: z.string()
  }),
  provisioning: z.object({
    checkAgain: z.string(),
    checkFailed: z.string(),
    checking: z.string(),
    detailKeyMismatch: z.string(),
    detailMissingFolder: z.string(),
    detailMissingKey: z.string(),
    detailNoRules: z.string(),
    detailNotDeployed: z.string(),
    detailNotProvisioned: z.string(),
    detailReady: z.string(),
    detailUnreadable: z.string(),
    noDeployment: z.string(),
    open: z.string(),
    optionalKeys: z.string(),
    preview: z.string(),
    production: z.string(),
    sheetSub: z.string(),
    stateKeyMismatch: z.string(),
    stateMissingFolder: z.string(),
    stateMissingKey: z.string(),
    stateNoRules: z.string(),
    stateNotDeployed: z.string(),
    stateNotProvisioned: z.string(),
    stateReady: z.string(),
    stateUnreadable: z.string(),
    title: z.string()
  }),
  tourSignups: z.object({
    anonymize: z.string(),
    anonymizeConfirm: z.string(),
    allTours: z.string(),
    anonymized: z.string(),
    booked: z.string(),
    cancel: z.string(),
    cancelled: z.string(),
    email: z.string(),
    empty: z.string(),
    emptyUnsaved: z.string(),
    export: z.string(),
    fillSummary: z.string(),
    filterByTour: z.string(),
    full: z.string(),
    heading: z.string(),
    moveDown: z.string(),
    moveUp: z.string(),
    name: z.string(),
    notes: z.string(),
    legalDraft: z.string(),
    legalMissing: z.string(),
    legalSettingsLink: z.string(),
    partySize: z.string(),
    privacyPage: z.string(),
    termsPage: z.string(),
    people: z.string(),
    phone: z.string(),
    peopleOne: z.string(),
    promote: z.string(),
    queuePosition: z.string(),
    reorderHint: z.string(),
    restore: z.string(),
    saveFailed: z.string(),
    saved: z.string(),
    seatsFreeWithQueue: z.string(),
    seatsLeft: z.string(),
    signedUp: z.string(),
    starterFailed: z.string(),
    starterLede: z.string(),
    starterPrivacy: z.string(),
    starterTerms: z.string(),
    status: z.string(),
    statusChanged: z.string(),
    termsAccepted: z.string(),
    waiting: z.string(),
    waitingCount: z.string(),
    waitingHeading: z.string(),
    overbooked: z.string()
  }),
  validation: z.object({
    bookingDeadlineAfterDeparture: z.string(),
    bookingNeedsDeparture: z.string(),
    defaultThemeNotSelected: z.string(),
    deploymentCharacters: z.string(),
    deploymentHyphens: z.string(),
    deploymentReserved: z.string(),
    deploymentTooLong: z.string(),
    domainDuplicate: z.string(),
    domainMalformed: z.string(),
    domainNoPathOrPort: z.string(),
    domainNoScheme: z.string(),
    domainNoWildcard: z.string(),
    domainOnePrimary: z.string(),
    domainTaken: z.string(),
    fontRestricted: z.string(),
    formNeedsRecipient: z.string(),
    labelNameTaken: z.string(),
    labelNotFound: z.string(),
    labelWrongType: z.string(),
    mustBelongToWorkspace: z.string(),
    notSupportedLocale: z.string(),
    phoneNumber: z.string(),
    platformSettingsSingleton: z.string(),
    signupWouldOverbook: z.string(),
    themeNameBuiltIn: z.string(),
    themeNameInvalid: z.string(),
    themeNameReserved: z.string(),
    themesRequired: z.string(),
    tourClosedForSignups: z.string(),
    urlInvalid: z.string()
  })
});

type CustomTranslations = z.infer<typeof customTranslationsSchema>;

export const customTranslations: Record<'en' | 'sv', CustomTranslations> = {
  en: {
    authentication: {
      cannotAssignToWorkspace:
        "You don't have permission to assign users to this workspace.",
      cannotRemoveFromWorkspace:
        "You don't have permission to remove users from this workspace.",
      crossTenantDenied:
        'Access denied. This workspace is not accessible without proper tenant access.'
    },
    collection: {
      cardWithSuffix: 'Card {{suffix}}',
      socialMediaWithSuffix: 'Social Media {{suffix}}'
    },
    dashboard: {
      badgeDraft: 'Draft',
      badgeNew: 'New',
      badgePublished: 'Published',
      contentLead:
        'Everything on your site, grouped by what it does. Open a card to manage its content, or create something new right away.',
      continueEditing: 'Continue editing',
      emptyActivitySub: 'Content you and your team edit will show up here.',
      emptyActivityTitle: 'No activity yet',
      emptyCta: 'Write a post',
      emptyDraftsSub: 'Drafts you are working on will appear here.',
      emptyDraftsTitle: 'No drafts to resume',
      gettingStartedDismiss: 'Hide this checklist',
      gettingStartedSub:
        'A few steps to get your site going. They tick off by themselves as you go.',
      gettingStartedTitle: 'Getting started',
      heading: 'What would you like to do?',
      items: '{{count}} items',
      lead: "Welcome back, {{name}}. Pick a task and we'll open the right place.",
      limitLabel: 'Number of items to show',
      newButton: 'New',
      openToEdit: 'Open to edit',
      recentActivity: 'Recent activity',
      tabAllContent: 'All content',
      tabHome: 'Home',
      tabPlatform: 'Platform',
      taskAddPage: 'Add a page',
      taskAddPageSub: 'Create a new page on the website',
      taskEditMenu: 'Edit the menu',
      taskEditMenuSub: 'Change what appears in navigation',
      taskInviteTeammate: 'Invite a teammate',
      taskInviteTeammateSub: 'Give someone access to the CMS',
      taskReadMessages: 'Read new messages',
      taskReadMessagesSub: 'Check form submissions',
      taskReadMessagesSubCount: '{{count}} unread messages',
      taskUploadImage: 'Upload an image',
      taskUploadImageSub: 'Put photos or files in the library',
      taskWritePost: 'Write a blog post',
      taskWritePostSub: 'Add a new article to the blog'
    },
    domains: {
      actionFailed: 'Fly could not be reached. Try again in a moment.',
      active: 'Active',
      apexNote:
        'This is the domain itself rather than a subdomain, so a CNAME is not allowed — it needs A and AAAA records pointing at the app’s IP addresses.',
      check: 'Check now',
      checkedAt: 'Checked {{when}}',
      compareResolvers: 'Compare resolvers',
      copyRecord: 'Copy the DNS target',
      dnsLede: 'Create this record where the domain’s DNS is managed:',
      dnsNameHint:
        'Record names are written in full — a registrar that appends the domain itself only wants the part before it.',
      dnsOwnershipLede:
        'Only needed if the app has no IPv6 address, or if traffic reaches it through a CDN or proxy:',
      dnsSettledLede:
        'These are the records the domain runs on. They stay needed — remove one and the domain stops answering, certificate or not:',
      dnsTrafficLede:
        'Point the domain at the app, where the domain’s DNS is managed. Without this record the domain answers nowhere, certificate or not:',
      dnsValidationLede:
        'Optional, and only worth adding to have the certificate issued before the domain points here:',
      hasIssues: 'has issues',
      heading: 'Certificates',
      issuedBy: 'Issued by',
      issuedHeading: 'Certificates issued for this domain:',
      issuesActiveHeading:
        'The certificate is issued, and Fly’s last check still had this to say about the domain:',
      issuesHeading:
        'Fly’s own diagnosis from its last check — it doesn’t have to match the records suggested below:',
      mismatchBody:
        'You reached the admin on {{origin}}, but this deployment answers as {{expected}} and accepts a session from nowhere else. Signing in here cannot work until its domain settings are put right.',
      mismatchForceLogout: 'Clear the session and sign in again',
      mismatchHeading: 'This is not the address the app answers as',
      mismatchOpenExpected: 'Open the address it answers as',
      neverChecked: 'never checked',
      notRequested: 'No certificate yet',
      ownerPlatform: 'the platform',
      ownerWorkspace: 'the workspace',
      paused: 'Paused',
      pending: 'Waiting for DNS',
      rateLimited:
        'Let’s Encrypt has paused new attempts for this domain until {{when}}. Retrying before then only extends the pause.',
      remove: 'Remove certificate',
      resolversAgree:
        'Every resolver agrees. If the domain still will not load for you, the stale answer is on your own side — your router, your ISP or this machine, not the record.',
      resolversDisagree:
        'The resolvers do not agree yet, which is what a record still spreading looks like. Give it time rather than changing anything.',
      resolversHeading: 'What the public resolvers see',
      resolversNegativeCache:
        'This zone tells resolvers to remember a “does not exist” answer for up to {{seconds}} seconds, so a record created recently can stay invisible that long.',
      resolversNoAnswer: 'no record yet',
      resolversUnreachable: 'could not be reached',
      request: 'Request certificate',
      restart: 'Restart app',
      restartHint:
        'A newly validated domain only takes effect after the app restarts.',
      saveFirst: 'Save to request a certificate for this domain.'
    },
    forms: {
      notificationRecipient:
        'An email left without "Email To" will go to: {{recipients}}',
      notificationRecipientMissing:
        'An email left without "Email To" has nowhere to go — this workspace has no generic recipient set. Remove this notification email if none is wanted.',
      notificationSettingsLink: 'Set a generic recipient in Site Settings'
    },
    formSubmissions: {
      allForms: 'All forms',
      deletedForm: 'Deleted form',
      empty: 'Messages sent through your forms will show up here.',
      emptyTitle: 'No messages',
      exportCsv: 'Export CSV',
      exportNeedsForm: 'Pick a form to export its messages',
      filterByForm: 'Filter by form',
      markAllRead: 'Mark page as read',
      noValues: 'This message has no values.',
      notificationFailed: 'Not delivered',
      notificationFailedDetail:
        'The notification email for this message could not be delivered.',
      notificationNoRecipient: 'No recipient',
      notificationNoRecipientDetail:
        "This message's notification email had no recipient to send to — check the form's or workspace's notification settings, or remove the notification email from the form if none is wanted.",
      orphanedField: 'This field is no longer part of the form',
      pageOf: 'Page {{page}} of {{total}}',
      received: 'Received {{when}}',
      total: '{{count}} messages',
      unread: 'Unread',
      unreadOnly: 'Unread only'
    },
    general: {
      clearSelectedColor: 'Clear selected color'
    },
    help: {
      drawerDescription: 'Answers to common questions',
      drawerTitle: 'Help',
      empty: 'No help topics have been added yet.',
      loadError: 'Could not load the help topics. Try again.',
      loading: 'Loading…',
      manageFaq: 'Manage FAQ',
      openHelp: 'Help'
    },
    media: {
      calloutDescriptions: `Tags can be used to organize your files and be displayed in the web site file area.
You can assign multiple tags to a file.`,
      calloutTitle: 'Organize files with tags'
    },
    nav: {
      accountSettings: 'Account settings',
      collapseSidebar: 'Collapse sidebar',
      colorSchemeAuto: 'System mode',
      colorSchemeDark: 'Dark mode',
      colorSchemeLight: 'Light mode',
      contentLocale: 'Content',
      contentLocaleAria: 'Content language',
      create: 'Create',
      expandSidebar: 'Expand sidebar',
      home: 'Home',
      interfaceLanguage: 'Interface language',
      logOut: 'Log out',
      newBlogPost: 'New blog post',
      newPage: 'New page',
      noMatches: 'No matches',
      openSidebar: 'Open menu',
      platformGroup: 'Platform',
      roleEditor: 'Editor',
      roleSystemAdmin: 'System admin',
      searchPlaceholder: 'Filter menu…',
      themeLibrary: 'Theme library',
      uploadMedia: 'Upload media'
    },
    platform: {
      buildTitle: 'Environment & build',
      buildUnstamped:
        'Running in production without a commit or build time — this build cannot be traced back to a commit.',
      domainsMetric: '{{count}} domains',
      domainsNone: 'No custom domains configured',
      domainsOpen: 'Show every domain',
      domainsSheetSub:
        'Every custom domain across the platform. Open one to check it or change its records.',
      domainsTitle: 'Domains & certificates',
      integrationsAllConfigured: 'Every integration is set up',
      integrationsEmailMissing:
        'No email is configured — messages this app sends go nowhere',
      integrationsEmailNotDelivered:
        'Email is going to a test inbox, not to the people it is addressed to',
      integrationsIncomplete: '{{count}} not set up',
      integrationsMetric: '{{count}} of {{total}} set up',
      integrationsNotProduction:
        'Not production, so a test inbox here is expected',
      integrationsOpen: 'Show every integration',
      integrationsSheetSub:
        'What this deployment resolved at start-up. Values are set outside the CMS.',
      integrationsTitle: 'Integrations',
      labelEmail: 'Email',
      labelInfisical: 'Secrets',
      labelSentry: 'Error tracking',
      labelStorage: 'File storage',
      mailDeliveryAllDelivered: 'All notifications delivered',
      mailDeliveryFailures: '{{count}} failed to send',
      mailDeliveryMetric: '{{count}} notifications this week',
      mailDeliveryNoSends: 'No notifications sent this week',
      mailDeliveryOpen: 'Show every failure',
      mailDeliverySheetSub:
        'Form submissions from the last 7 days whose notification email did not send.',
      mailDeliveryTitle: 'Mail delivery',
      modeHost: 'host',
      modeTenant: 'workspace',
      notConfigured: 'Not set up',
      summaryAllActive: 'All certificates active',
      summaryExpiring: '{{count}} expiring within two weeks',
      summaryIssues: '{{count}} with unresolved issues',
      summaryNotRequested: '{{count}} without a certificate',
      summaryPaused: '{{count}} paused by the certificate authority',
      summaryPending: '{{count}} waiting for DNS'
    },
    palette: {
      aboutDescription: 'Build and deployment details for this app',
      aboutTitle: 'About',
      actionAbout: 'About',
      actionGettingStarted: 'Show getting started',
      actionHelp: 'Open help',
      dialogDescription: 'Search content and run quick actions',
      dialogTitle: 'Command palette',
      groupActions: 'Quick actions',
      groupNavigation: 'Go to',
      groupRecent: 'Recent',
      groupWorkspaces: 'Workspaces',
      noResults: 'No results for "{{query}}"',
      openPalette: 'Search',
      placeholder: 'Search or jump to…',
      searchError: 'Search failed. Try again.',
      searching: 'Searching…',
      untitled: 'Untitled',
      workspaceAll: 'All workspaces'
    },
    provisioning: {
      checkAgain: 'Check again',
      checkFailed: 'Could not read the Infisical setup.',
      checking: 'Reading Infisical…',
      detailKeyMismatch: '{{count}} with a different API key',
      detailMissingFolder: 'Named in DEPLOY_RULES, but no app folder',
      detailMissingKey: '{{count}} without PAYLOAD_API_KEY',
      detailNoRules: 'DEPLOY_RULES could not be read',
      detailNotDeployed: 'Not deployed by DEPLOY_RULES',
      detailNotProvisioned: 'Nothing set up in Infisical yet',
      detailReady: '{{count}} ready to deploy',
      detailUnreadable: 'This app cannot read its environment in Infisical',
      noDeployment:
        'Give this workspace a deployment name and save it to see its Infisical setup.',
      open: 'Show every environment',
      optionalKeys: 'Optional settings: {{keys}}',
      preview: 'Preview',
      production: 'Production',
      sheetSub:
        'What Infisical holds for this workspace in the environment this app runs in, and whether DEPLOY_RULES deploys it there. Key values are compared on the server and never shown.',
      stateKeyMismatch: 'Different key',
      stateMissingFolder: 'No app folder',
      stateMissingKey: 'Key missing',
      stateNoRules: 'No deploy rules',
      stateNotDeployed: 'Not deployed',
      stateNotProvisioned: 'Not set up',
      stateReady: 'Ready',
      stateUnreadable: 'Cannot read',
      title: 'Infisical setup'
    },
    tourSignups: {
      anonymize: 'Clear passenger data',
      anonymizeConfirm:
        'Clear the name, email, phone and notes on every signup for this tour? Party sizes and statuses are kept. This cannot be undone.',
      allTours: 'All tours',
      anonymized: 'Personal data cleared',
      booked: 'Booked',
      cancel: 'Cancel signup',
      cancelled: 'Cancelled',
      email: 'Email',
      empty: 'Nobody has signed up yet.',
      emptyUnsaved: 'Save the tour first — signups arrive once it exists.',
      export: 'Export passenger list',
      fillSummary: '{{booked}} of {{max}} places taken',
      filterByTour: 'Filter by tour',
      full: 'Full',
      heading: 'Signups',
      legalDraft: 'draft, not published',
      legalMissing: 'not set',
      legalSettingsLink: 'Set up in Site Settings',
      moveDown: 'Move down the queue',
      moveUp: 'Move up the queue',
      name: 'Name',
      notes: 'Notes',
      partySize: 'Party size',
      privacyPage: 'Privacy page',
      termsPage: 'Terms page',
      people: '{{count}} people',
      phone: 'Phone',
      peopleOne: '1 person',
      promote: 'Move to booked',
      queuePosition: 'Queue position',
      reorderHint:
        'Drag to set the order you will offer places in. Signup times stay as they were.',
      restore: 'Restore signup',
      saveFailed: 'Could not save the change.',
      saved: 'Saved',
      seatsFreeWithQueue:
        '{{count}} places are free and {{name}} is first in the waiting list. New signups join the queue, so a place is only filled when you promote someone.',
      seatsLeft: '{{count}} places left',
      signedUp: 'Signed up',
      starterFailed: 'Could not create the page.',
      starterLede:
        'No page yet? Create a draft from our template, then review and publish it — it describes how signups are handled here, but it is not legal advice.',
      starterPrivacy: 'Create a starter privacy page',
      starterTerms: 'Create a starter terms page',
      status: 'Status',
      statusChanged: 'Status changed',
      termsAccepted: 'Terms accepted',
      waiting: 'Waiting list',
      waitingCount: '+{{count}} waiting',
      waitingHeading: 'Waiting list',
      overbooked: 'Overbooked'
    },
    validation: {
      bookingDeadlineAfterDeparture:
        'The booking deadline must be on or before the departure date.',
      bookingNeedsDeparture:
        'A tour can only be booked once it has a departure date. Use "Register interest" while the date is unconfirmed.',
      defaultThemeNotSelected:
        '"{{theme}}" is not one of the selected themes ({{themes}}).',
      deploymentCharacters:
        '"{{name}}" can only use lowercase letters, digits and hyphens.',
      deploymentHyphens:
        '"{{name}}" cannot start or end with a hyphen, or have two in a row.',
      deploymentReserved:
        '"{{name}}" would clash with the names preview deployments are given. Choose a name that does not start with "pr-" and a number.',
      deploymentTooLong:
        '"{{name}}" is too long. Use at most {{max}} characters.',
      domainDuplicate: '"{{hostname}}" is listed more than once.',
      domainMalformed: '"{{hostname}}" is not a valid domain name.',
      domainNoPathOrPort:
        'Enter the domain on its own — no path, port or query string.',
      domainNoScheme: 'Enter the domain on its own, without "https://".',
      domainNoWildcard:
        'Wildcard domains are not supported. Add each subdomain separately.',
      domainOnePrimary:
        'Only one domain per app can be the primary one. "{{app}}" has several.',
      domainTaken: '"{{hostname}}" already belongs to {{owner}}.',
      fontRestricted:
        '{{fonts}} is licensed to the platform and can only be set by a system administrator.',
      formNeedsRecipient:
        'One of the notification emails has no "Email To", and this workspace has no generic recipient set. Add one here, set a generic recipient in Site Settings → Forms, or remove this notification email if none is wanted.',
      labelNameTaken: 'A "{{type}}" label named "{{name}}" already exists.',
      labelNotFound: 'The selected label no longer exists.',
      labelWrongType: 'Expected a "{{expected}}" label but got "{{actual}}".',
      mustBelongToWorkspace: 'User must belong to a workspace.',
      notSupportedLocale: `Selected locale "{{locale}}" is not supported by the current tenant.
Supported locales: {{locales}}`,
      phoneNumber: 'Please enter a valid phone number',
      platformSettingsSingleton:
        'Platform settings already exist. Edit the existing document instead of creating another.',
      signupWouldOverbook:
        'Only {{available}} of {{max}} places are left and this signup needs {{people}}. Cancel a booking or raise the maximum first.',
      themeNameBuiltIn:
        '"{{name}}" is already a built-in theme. Pick another name.',
      themeNameInvalid:
        'Use lowercase letters, numbers and single dashes, e.g. "deep-ocean".',
      themeNameReserved:
        '"{{name}}" is reserved — it would be indistinguishable from the light and dark setting.',
      themesRequired:
        'Select at least one theme, either a built-in one or one of your own.',
      tourClosedForSignups: 'This tour is closed for signups.',
      urlInvalid: 'Please enter a valid URL'
    }
  },
  sv: {
    authentication: {
      cannotAssignToWorkspace:
        'Du har inte behörighet att tilldela användare till den här arbetsytan.',
      cannotRemoveFromWorkspace:
        'Du har inte behörighet att ta bort användare från den här arbetsytan.',
      crossTenantDenied:
        'Åtkomst nekad. Den här arbetsytan är inte tillgänglig utan rätt behörighet.'
    },
    collection: {
      cardWithSuffix: 'Kort {{suffix}}',
      socialMediaWithSuffix: 'Sociala Medier {{suffix}}'
    },
    dashboard: {
      badgeDraft: 'Utkast',
      badgeNew: 'Ny',
      badgePublished: 'Publicerad',
      contentLead:
        'Allt på din webbplats, grupperat efter funktion. Öppna ett kort för att hantera innehållet, eller skapa något nytt direkt.',
      continueEditing: 'Fortsätt redigera',
      emptyActivitySub: 'Innehåll som du och ditt team redigerar visas här.',
      emptyActivityTitle: 'Ingen aktivitet ännu',
      emptyCta: 'Skriv ett inlägg',
      emptyDraftsSub: 'Utkast som du arbetar med visas här.',
      emptyDraftsTitle: 'Inga utkast att fortsätta med',
      gettingStartedDismiss: 'Dölj den här checklistan',
      gettingStartedSub:
        'Några steg för att komma igång med din webbplats. De bockas av automatiskt medan du arbetar.',
      gettingStartedTitle: 'Kom igång',
      heading: 'Vad vill du göra?',
      items: '{{count}} objekt',
      lead: 'Välkommen tillbaka, {{name}}. Välj en uppgift så öppnar vi rätt ställe.',
      limitLabel: 'Antal poster som visas',
      newButton: 'Ny',
      openToEdit: 'Öppna för att redigera',
      recentActivity: 'Senaste aktivitet',
      tabAllContent: 'Allt innehåll',
      tabHome: 'Hem',
      tabPlatform: 'Plattform',
      taskAddPage: 'Lägg till en sida',
      taskAddPageSub: 'Skapa en ny sida på webbplatsen',
      taskEditMenu: 'Redigera menyn',
      taskEditMenuSub: 'Ändra vad som visas i navigeringen',
      taskInviteTeammate: 'Bjud in en kollega',
      taskInviteTeammateSub: 'Ge någon åtkomst till CMS:et',
      taskReadMessages: 'Läs nya meddelanden',
      taskReadMessagesSub: 'Kontrollera formulärsvar',
      taskReadMessagesSubCount: '{{count}} olästa meddelanden',
      taskUploadImage: 'Ladda upp en bild',
      taskUploadImageSub: 'Lägg bilder eller filer i biblioteket',
      taskWritePost: 'Skriv ett blogginlägg',
      taskWritePostSub: 'Lägg till en ny artikel på bloggen'
    },
    domains: {
      actionFailed: 'Fly gick inte att nå. Försök igen om en stund.',
      active: 'Aktivt',
      apexNote:
        'Det här är själva domänen och inte en underdomän, så CNAME är inte tillåtet — den behöver A- och AAAA-poster som pekar på appens IP-adresser.',
      check: 'Kontrollera nu',
      checkedAt: 'Kontrollerad {{when}}',
      compareResolvers: 'Jämför DNS-servrar',
      copyRecord: 'Kopiera DNS-målet',
      dnsLede: 'Skapa den här posten där domänens DNS hanteras:',
      dnsNameHint:
        'Postnamnen skrivs fullständigt — hos en registrar som lägger till domänen själv anges bara delen före den.',
      dnsOwnershipLede:
        'Behövs bara om appen saknar IPv6-adress, eller om trafiken når den via ett CDN eller en proxy:',
      dnsSettledLede:
        'Det här är posterna domänen vilar på. De behövs fortsatt — tas någon bort slutar domänen svara, certifikat eller inte:',
      dnsTrafficLede:
        'Peka domänen mot appen, där domänens DNS hanteras. Utan den här posten svarar domänen ingenstans, certifikat eller inte:',
      dnsValidationLede:
        'Valfri, och behövs bara för att få certifikatet utfärdat innan domänen pekar hit:',
      hasIssues: 'har problem',
      heading: 'Certifikat',
      issuedBy: 'Utfärdat av',
      issuedHeading: 'Certifikat utfärdade för den här domänen:',
      issuesActiveHeading:
        'Certifikatet är utfärdat, men Flys senaste kontroll hade ändå det här att säga om domänen:',
      issuesHeading:
        'Flys egen diagnos från senaste kontrollen — den behöver inte stämma överens med posterna som föreslås nedan:',
      mismatchBody:
        'Du nådde adminet på {{origin}}, men den här driftsättningen svarar som {{expected}} och accepterar ingen session från någon annan adress. Att logga in här fungerar inte förrän domäninställningarna är rättade.',
      mismatchForceLogout: 'Rensa sessionen och logga in igen',
      mismatchHeading: 'Det här är inte adressen appen svarar som',
      mismatchOpenExpected: 'Öppna adressen den svarar som',
      neverChecked: 'aldrig kontrollerad',
      notRequested: 'Inget certifikat ännu',
      ownerPlatform: 'plattformen',
      ownerWorkspace: 'arbetsytan',
      paused: 'Pausat',
      pending: 'Väntar på DNS',
      rateLimited:
        'Let’s Encrypt har pausat nya försök för domänen till {{when}}. Att försöka igen dessförinnan förlänger bara pausen.',
      remove: 'Ta bort certifikat',
      resolversAgree:
        'Alla DNS-servrar är överens. Om domänen ändå inte laddas för dig sitter det gamla svaret på din egen sida — din router, din operatör eller den här datorn, inte posten.',
      resolversDisagree:
        'DNS-servrarna är inte överens ännu, vilket är precis hur en post som fortfarande sprids ser ut. Vänta hellre än att ändra något.',
      resolversHeading: 'Vad de publika DNS-servrarna ser',
      resolversNegativeCache:
        'Zonen ber DNS-servrar minnas ett ”finns inte”-svar i upp till {{seconds}} sekunder, så en nyss skapad post kan vara osynlig så länge.',
      resolversNoAnswer: 'ingen post ännu',
      resolversUnreachable: 'gick inte att nå',
      request: 'Begär certifikat',
      restart: 'Starta om app',
      restartHint:
        'En nyligen validerad domän börjar gälla först efter att appen har startats om.',
      saveFirst: 'Spara för att begära ett certifikat för domänen.'
    },
    forms: {
      notificationRecipient:
        'Ett mejl utan "E-post till" går till: {{recipients}}',
      notificationRecipientMissing:
        'Ett mejl utan "E-post till" har ingenstans att ta vägen — arbetsytan saknar en allmän mottagare. Ta bort notismejlet om inget behövs.',
      notificationSettingsLink:
        'Ange en allmän mottagare i Webbplatsinställningar'
    },
    formSubmissions: {
      allForms: 'Alla formulär',
      deletedForm: 'Borttaget formulär',
      empty: 'Meddelanden som skickas via dina formulär visas här.',
      emptyTitle: 'Inga meddelanden',
      exportCsv: 'Exportera CSV',
      exportNeedsForm: 'Välj ett formulär för att exportera dess meddelanden',
      filterByForm: 'Filtrera på formulär',
      markAllRead: 'Markera sidan som läst',
      noValues: 'Det här meddelandet innehåller inga värden.',
      notificationFailed: 'Ej levererat',
      notificationFailedDetail:
        'Meddelandets e-postavisering kunde inte levereras.',
      notificationNoRecipient: 'Ingen mottagare',
      notificationNoRecipientDetail:
        'Meddelandets e-postavisering saknade en mottagare att skickas till — kontrollera formulärets eller arbetsytans aviseringsinställningar, eller ta bort notismejlet från formuläret om inget behövs.',
      orphanedField: 'Fältet ingår inte längre i formuläret',
      pageOf: 'Sida {{page}} av {{total}}',
      received: 'Mottaget {{when}}',
      total: '{{count}} meddelanden',
      unread: 'Oläst',
      unreadOnly: 'Endast olästa'
    },
    general: {
      clearSelectedColor: 'Ta bort vald färg'
    },
    help: {
      drawerDescription: 'Svar på vanliga frågor',
      drawerTitle: 'Hjälp',
      empty: 'Inga hjälpavsnitt har lagts till ännu.',
      loadError: 'Kunde inte ladda hjälpavsnitten. Försök igen.',
      loading: 'Laddar…',
      manageFaq: 'Hantera vanliga frågor',
      openHelp: 'Hjälp'
    },
    media: {
      calloutDescriptions: `Använd etiketter för att organisera dina filer och då kunna visa dem på webbplatsens filyta.
Du kan tilldela flera etiketter till en fil.`,
      calloutTitle: 'Organisera filer med etiketter'
    },
    nav: {
      accountSettings: 'Kontoinställningar',
      collapseSidebar: 'Fäll ihop sidofältet',
      colorSchemeAuto: 'Systemläge',
      colorSchemeDark: 'Mörkt läge',
      colorSchemeLight: 'Ljust läge',
      contentLocale: 'Innehåll',
      contentLocaleAria: 'Innehållsspråk',
      create: 'Skapa',
      expandSidebar: 'Expandera sidofältet',
      home: 'Hem',
      interfaceLanguage: 'Gränssnittsspråk',
      logOut: 'Logga ut',
      newBlogPost: 'Nytt blogginlägg',
      newPage: 'Ny sida',
      noMatches: 'Inga träffar',
      openSidebar: 'Öppna menyn',
      platformGroup: 'Plattform',
      roleEditor: 'Redaktör',
      roleSystemAdmin: 'Systemadministratör',
      searchPlaceholder: 'Filtrera menyn…',
      themeLibrary: 'Temabibliotek',
      uploadMedia: 'Ladda upp media'
    },
    platform: {
      buildTitle: 'Miljö & bygge',
      buildUnstamped:
        'Kör i produktion utan commit eller byggtid — bygget går inte att spåra till en commit.',
      domainsMetric: '{{count}} domäner',
      domainsNone: 'Inga egna domäner konfigurerade',
      domainsOpen: 'Visa alla domäner',
      domainsSheetSub:
        'Alla egna domäner på plattformen. Öppna en för att kontrollera den eller ändra dess poster.',
      domainsTitle: 'Domäner & certifikat',
      integrationsAllConfigured: 'Alla integrationer är uppsatta',
      integrationsEmailMissing:
        'Ingen e-post är konfigurerad — meddelanden appen skickar går ingenstans',
      integrationsEmailNotDelivered:
        'E-posten går till en testinkorg, inte till mottagarna',
      integrationsIncomplete: '{{count}} är inte uppsatta',
      integrationsMetric: '{{count}} av {{total}} uppsatta',
      integrationsNotProduction:
        'Inte produktion, så en testinkorg är väntat här',
      integrationsOpen: 'Visa alla integrationer',
      integrationsSheetSub:
        'Vad den här driftsättningen läste in vid start. Värdena sätts utanför CMS:et.',
      integrationsTitle: 'Integrationer',
      labelEmail: 'E-post',
      labelInfisical: 'Hemligheter',
      labelSentry: 'Felrapportering',
      labelStorage: 'Fillagring',
      mailDeliveryAllDelivered: 'Alla aviseringar levererade',
      mailDeliveryFailures: '{{count}} kunde inte skickas',
      mailDeliveryMetric: '{{count}} aviseringar denna vecka',
      mailDeliveryNoSends: 'Inga aviseringar skickade denna vecka',
      mailDeliveryOpen: 'Visa alla fel',
      mailDeliverySheetSub:
        'Formulärsvar från de senaste 7 dagarna vars e-postavisering inte skickades.',
      mailDeliveryTitle: 'E-postleverans',
      modeHost: 'värd',
      modeTenant: 'arbetsyta',
      notConfigured: 'Inte uppsatt',
      summaryAllActive: 'Alla certifikat är aktiva',
      summaryExpiring: '{{count}} går ut inom två veckor',
      summaryIssues: '{{count}} med olösta problem',
      summaryNotRequested: '{{count}} utan certifikat',
      summaryPaused: '{{count}} pausade av certifikatutfärdaren',
      summaryPending: '{{count}} väntar på DNS'
    },
    palette: {
      aboutDescription: 'Bygg- och distributionsdetaljer för appen',
      aboutTitle: 'Om',
      actionAbout: 'Om',
      actionGettingStarted: 'Visa kom igång',
      actionHelp: 'Öppna hjälpen',
      dialogDescription: 'Sök innehåll och kör snabbåtgärder',
      dialogTitle: 'Kommandopalett',
      groupActions: 'Snabbåtgärder',
      groupNavigation: 'Gå till',
      groupRecent: 'Senaste',
      groupWorkspaces: 'Arbetsytor',
      noResults: 'Inga träffar för "{{query}}"',
      openPalette: 'Sök',
      placeholder: 'Sök eller hoppa till…',
      searchError: 'Sökningen misslyckades. Försök igen.',
      searching: 'Söker…',
      untitled: 'Namnlös',
      workspaceAll: 'Alla arbetsytor'
    },
    provisioning: {
      checkAgain: 'Kontrollera igen',
      checkFailed: 'Det gick inte att läsa konfigurationen i Infisical.',
      checking: 'Läser från Infisical…',
      detailKeyMismatch: '{{count}} med en annan API-nyckel',
      detailMissingFolder:
        'Namngiven i DEPLOY_RULES, men mappen för appen saknas',
      detailMissingKey: '{{count}} utan PAYLOAD_API_KEY',
      detailNoRules: 'DEPLOY_RULES gick inte att läsa',
      detailNotDeployed: 'Driftsätts inte enligt DEPLOY_RULES',
      detailNotProvisioned: 'Inget är konfigurerat i Infisical än',
      detailReady: '{{count}} redo att driftsättas',
      detailUnreadable: 'Den här appen kan inte läsa sin miljö i Infisical',
      noDeployment:
        'Ge arbetsytan ett namn för driftsättning och spara den för att se konfigurationen i Infisical.',
      open: 'Visa alla miljöer',
      optionalKeys: 'Valfria inställningar: {{keys}}',
      preview: 'Förhandsversion',
      production: 'Produktion',
      sheetSub:
        'Det som finns i Infisical för arbetsytan i den miljö som den här appen körs i, och om DEPLOY_RULES driftsätter den där. Nyckelvärdena jämförs på servern och visas aldrig.',
      stateKeyMismatch: 'Annan nyckel',
      stateMissingFolder: 'Mapp saknas',
      stateMissingKey: 'Nyckel saknas',
      stateNoRules: 'Regler saknas',
      stateNotDeployed: 'Driftsätts inte',
      stateNotProvisioned: 'Inte konfigurerad',
      stateReady: 'Redo',
      stateUnreadable: 'Kan inte läsas',
      title: 'Konfiguration i Infisical'
    },
    tourSignups: {
      anonymize: 'Rensa passageraruppgifter',
      anonymizeConfirm:
        'Vill du rensa namn, e-post, telefon och anteckningar på alla anmälningar för den här resan? Antal personer och status behålls. Detta går inte att ångra.',
      allTours: 'Alla resor',
      anonymized: 'Personuppgifter rensade',
      booked: 'Bokad',
      cancel: 'Avboka',
      cancelled: 'Avbokad',
      email: 'E-post',
      empty: 'Ingen har anmält sig ännu.',
      emptyUnsaved: 'Spara resan först — anmälningar kommer när den finns.',
      export: 'Exportera passagerarlista',
      fillSummary: '{{booked}} av {{max}} platser tagna',
      filterByTour: 'Filtrera på resa',
      full: 'Fullbokad',
      heading: 'Anmälningar',
      legalDraft: 'utkast, ej publicerad',
      legalMissing: 'inte vald',
      legalSettingsLink: 'Ställ in i Webbplatsinställningar',
      moveDown: 'Flytta ned i kön',
      moveUp: 'Flytta upp i kön',
      name: 'Namn',
      notes: 'Anteckningar',
      partySize: 'Antal personer',
      privacyPage: 'Integritetssida',
      termsPage: 'Villkorssida',
      people: '{{count}} personer',
      phone: 'Telefon',
      peopleOne: '1 person',
      promote: 'Gör till bokad',
      queuePosition: 'Köplats',
      reorderHint:
        'Dra för att ställa in i vilken ordning du erbjuder platser. Anmälningstiderna påverkas inte.',
      restore: 'Återställ anmälan',
      saveFailed: 'Det gick inte att spara ändringen.',
      saved: 'Sparat',
      seatsFreeWithQueue:
        '{{count}} platser är lediga och {{name}} står först i kön. Nya anmälningar hamnar i kön, så en plats fylls bara när du flyttar upp någon.',
      seatsLeft: '{{count}} platser kvar',
      signedUp: 'Anmäld',
      starterFailed: 'Det gick inte att skapa sidan.',
      starterLede:
        'Saknar du sida? Skapa ett utkast från vår mall, läs igenom och publicera — den beskriver hur anmälningar hanteras här, men är inte juridisk rådgivning.',
      starterPrivacy: 'Skapa utkast till integritetssida',
      starterTerms: 'Skapa utkast till villkorssida',
      status: 'Status',
      statusChanged: 'Status ändrad',
      termsAccepted: 'Villkor godkända',
      waiting: 'Väntelista',
      waitingCount: '+{{count}} i kö',
      waitingHeading: 'Väntelista',
      overbooked: 'Överbokad'
    },
    validation: {
      bookingDeadlineAfterDeparture:
        'Sista bokningsdag måste vara samma dag som eller före avresedatum.',
      bookingNeedsDeparture:
        'En resa kan bara bokas när den har ett avresedatum. Använd "Intresseanmälan" så länge datumet inte är fastställt.',
      defaultThemeNotSelected:
        '"{{theme}}" är inte ett av de valda temana ({{themes}}).',
      deploymentCharacters:
        '"{{name}}" får bara innehålla små bokstäver, siffror och bindestreck.',
      deploymentHyphens:
        '"{{name}}" får inte börja eller sluta med bindestreck, och får inte ha två bindestreck i rad.',
      deploymentReserved:
        '"{{name}}" krockar med de namn som förhandsversioner får. Välj ett namn som inte börjar med "pr-" följt av en siffra.',
      deploymentTooLong:
        '"{{name}}" är för långt. Använd högst {{max}} tecken.',
      domainDuplicate: '"{{hostname}}" förekommer flera gånger.',
      domainMalformed: '"{{hostname}}" är inte ett giltigt domännamn.',
      domainNoPathOrPort:
        'Ange enbart domänen — utan sökväg, port eller frågesträng.',
      domainNoScheme: 'Ange enbart domänen, utan "https://".',
      domainNoWildcard:
        'Wildcard-domäner stöds inte. Lägg till varje underdomän för sig.',
      domainOnePrimary:
        'Bara en domän per app kan vara den primära. "{{app}}" har flera.',
      domainTaken: '"{{hostname}}" tillhör redan {{owner}}.',
      fontRestricted:
        '{{fonts}} är licensierat till plattformen och kan bara väljas av en systemadministratör.',
      formNeedsRecipient:
        'Ett av notismejlen saknar "E-post till", och arbetsytan har ingen allmän mottagare inställd. Ange en här, ange en allmän mottagare i Webbplatsinställningar → Formulär, eller ta bort det här notismejlet om inget behövs.',
      labelNameTaken:
        'Det finns redan en etikett av typen "{{type}}" med namnet "{{name}}".',
      labelNotFound: 'Den valda etiketten finns inte längre.',
      labelWrongType:
        'Förväntade en etikett av typen "{{expected}}" men fick "{{actual}}".',
      mustBelongToWorkspace: 'Användaren måste tillhöra en arbetsyta.',
      notSupportedLocale: `Valt språk "{{locale}}" stöds inte av den aktuella arbetsytan.
Språk som stöds: {{locales}}`,
      phoneNumber: 'Ange ett giltigt telefonnummer',
      platformSettingsSingleton:
        'Plattformsinställningar finns redan. Redigera det befintliga dokumentet istället för att skapa ett nytt.',
      signupWouldOverbook:
        'Endast {{available}} av {{max}} platser återstår och anmälan behöver {{people}}. Avboka någon eller höj maxantalet först.',
      themeNameBuiltIn:
        '"{{name}}" är redan ett inbyggt tema. Välj ett annat namn.',
      themeNameInvalid:
        'Använd små bokstäver, siffror och enkla bindestreck, t.ex. "deep-ocean".',
      themeNameReserved:
        '"{{name}}" är reserverat — det skulle inte gå att skilja från inställningen för ljust och mörkt.',
      themesRequired:
        'Välj minst ett tema, antingen ett inbyggt eller ett eget.',
      tourClosedForSignups: 'Resan är stängd för anmälan.',
      urlInvalid: 'Ange en giltig webbadress'
    }
  }
};

/**
 * Re-type a Payload `t` so our own translation keys resolve.
 *
 * Accepts the client variant too, for admin views that render on the server
 * and only get `i18n` from `ServerProps`.
 */
export const customT = (t: I18n['t'] | I18nClient['t']) =>
  t as TFunction<TranslationsKeys>;

export type TranslationsObject = CustomTranslations & typeof enTranslations;
export type TranslationsKeys = NestedKeysStripped<TranslationsObject>;
