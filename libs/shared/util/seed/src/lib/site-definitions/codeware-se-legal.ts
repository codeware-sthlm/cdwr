/**
 * The legal pages of codeware.se, rendered once from the platform's legal
 * templates. The seed lib cannot import the templates, so the text lives here
 * and a spec in `app-cms-feature-seed` fails when the two drift apart.
 */

/** What the templates were filled with; the drift spec renders with the same */
export const codewareSeLegalVars = {
  published: true,
  forms: false,
  tenantName: 'Codeware Sthlm',
  contactEmail: 'hello@codeware.se',
  tourSignups: false,
  tourRetentionDays: 365,
  formsRetentionDays: null,
  humanCheck: false,
  sendgrid: true,
  errorMonitoring: true,
  errorMonitoringEu: true,
  analytics: true
} as const;

export const codewareSePrivacyMarkdown =
  '# Integritet\n\nCodeware Sthlm ansvarar för de personuppgifter du lämnar på den här webbplatsen. Här förklarar vi vad vi samlar in, varför, hur länge vi sparar uppgifterna och vilka tjänster vi tar hjälp av för att driva webbplatsen.\n\n## Var uppgifterna lagras\n\nWebbplatsen och de uppgifter du skickar via den lagras hos driftleverantörer inom EU, som hanterar uppgifterna åt oss.\n\n## E-post\n\nVi skickar e-post via Twilio SendGrid, ett amerikanskt företag som levererar mejlen åt oss. Din e-postadress och mejlets innehåll förs därför över till USA. Twilio är certifierat enligt EU–US Data Privacy Framework, och certifieringen är grunden för överföringen.\n\n## Felövervakning\n\nNär något går fel på webbplatsen skickas en felrapport till Sentry, en tjänst som hjälper oss att hitta och rätta fel. Rapporten visar vilken sida du var på och vilken webbläsare du använder, och den lagras inom EU. Den innehåller inte din IP-adress eller något du har fyllt i på sidan. Rapporterna används inte för att följa vad du gör på sidan, bara för att rätta fel.\n\nDen rättsliga grunden är vårt berättigade intresse av att webbplatsen fungerar.\n\n## Besöksstatistik\n\nVi räknar besöken på webbplatsen med Umami, en statistiktjänst som drivs för vår räkning. Tjänsten sätter inga cookies och sparar ingenting i din webbläsare. För varje sidvisning registreras vilken sida du besöker, vilken webbplats du kom från, vilken webbläsare, vilket operativsystem, vilken typ av enhet, vilken skärmstorlek och vilket språk du använder, samt ungefär var du befinner dig (land, region och ort). Vid en del besök registreras också var på sidan du klickar och hur långt ner du scrollar. Din IP-adress används för att avgöra var du ungefär befinner dig och, tillsammans med uppgifterna om din webbläsare, för att känna igen besök från samma webbläsare under innevarande månad. Själva IP-adressen sparas inte. Vi använder statistiken för att se vilka sidor som läses och hur webbplatsen används, inte för att ta reda på vem du är.\n\nDen rättsliga grunden är vårt berättigade intresse av att veta hur webbplatsen används.\n\n## Cookies och din webbläsare\n\nVi använder inga cookies för spårning eller reklam, så det finns inget att godkänna. Webbplatsen kommer bara ihåg val som du själv gör:\n\n- vilket tema du väljer, i en cookie som sparas i ett år\n- ljust eller mörkt läge när du byter, i webbläsarens lokala lagring eller i en cookie som sparas i ett år\n\nIngenting sparas förrän du gör ett val.\n\n## Dina rättigheter\n\nDu kan begära ett utdrag över de uppgifter vi har om dig, be oss rätta dem eller be oss radera dem. Skriv till hello@codeware.se så svarar vi.\n\nDu kan också vända dig till dataskyddsmyndigheten i ditt land om du tycker att vi hanterat dina uppgifter fel.\n\n## Kontakt\n\nCodeware Sthlm hello@codeware.se';
