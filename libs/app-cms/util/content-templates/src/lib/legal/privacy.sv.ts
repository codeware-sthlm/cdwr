/** Swedish counterpart of {@link privacyEn} */
export const privacySv = `> **Utkast — läs igenom innan du publicerar.** Texten beskriver vilka uppgifter den här webbplatsen samlar in och varför. Den är en utgångspunkt, inte juridisk rådgivning. Stäm av den mot hur ni faktiskt arbetar, fyll i det som är markerat, lägg till annat ni samlar in och låt någon granska texten om du är osäker.

# Integritet

{{tenantName}} ansvarar för de personuppgifter du lämnar på den här webbplatsen. Här förklarar vi vad vi samlar in, varför, hur länge vi sparar uppgifterna och vilka tjänster vi tar hjälp av för att driva webbplatsen.

## Formulär

När du skickar ett meddelande via ett formulär på webbplatsen sparar vi det du har skrivit och när du skickade meddelandet. Vilka uppgifter det gäller beror på formuläret — oftast ditt namn, din e-postadress och själva meddelandet.

Vi använder uppgifterna för att svara dig och hantera det du frågar om. Den rättsliga grunden är vårt berättigade intresse av att kunna svara den som kontaktar oss, eller att vidta åtgärder inför ett avtal när det är ett avtal du frågar om.

Bara de på {{tenantName}} som hanterar ditt meddelande kan läsa det, och de får veta att det har kommit in via mejl. Om formuläret skickar en kopia till dig skickas den på samma sätt.

{{#formsRetentionDays}}
Meddelanden raderas {{formsRetentionDays}} dagar efter att de skickades.
{{/formsRetentionDays}}
{{^formsRetentionDays}}
Vi sparar meddelanden tills vi raderar dem. **Fyll i:** hur länge det är, eller ange en sparandetid under Formulär i webbplatsens inställningar så att meddelandena raderas automatiskt.
{{/formsRetentionDays}}

{{#tourSignups}}
## Reseanmälningar

När du anmäler dig till en resa frågar vi efter:

- ditt namn
- din e-postadress
- ditt telefonnummer (valfritt)
- hur många personer anmälan gäller

Vi registrerar också när du anmälde dig och om du godkänt våra villkor.

Vi använder uppgifterna för att genomföra resan du anmält dig till: bekräfta din plats, nå dig om något kring avresan ändras och veta hur många som reser. Är resan full sparar vi dina uppgifter i en kö så att vi kan erbjuda dig en plats om någon blir ledig.

Den rättsliga grunden är att fullgöra vårt avtal med dig. Vi använder inte dina anmälningsuppgifter för marknadsföring om du inte bett om det.

Bara de på {{tenantName}} som arrangerar resorna kan se din anmälan. Vi delar inte anmälan med andra, förutom när en leverantör behöver ett passagerarnamn för att kunna utföra en del av resan — ett hotell eller ett transportbolag till exempel.

Ditt namn, din e-postadress och ditt telefonnummer rensas {{tourRetentionDays}} dagar efter avresan. Därefter sparar vi bara antalet resenärer och anmälans status, vilket inte säger något om vem du är.
{{/tourSignups}}

## Var uppgifterna lagras

Webbplatsen och de uppgifter du skickar via den lagras hos driftleverantörer inom EU, som hanterar uppgifterna åt oss.

## E-post

{{#sendgrid}}
Vi skickar e-post via Twilio SendGrid, ett amerikanskt företag som levererar mejlen åt oss. Din e-postadress och mejlets innehåll förs därför över till USA. Twilio är certifierat enligt EU–US Data Privacy Framework, och certifieringen är grunden för överföringen.
{{/sendgrid}}
{{^sendgrid}}
Vi skickar e-post via en tjänst som levererar mejlen åt oss. **Fyll i:** vilken leverantör det är och var leverantören behandlar uppgifterna.
{{/sendgrid}}

{{#errorMonitoring}}
## Felövervakning

När något går fel på webbplatsen skickas en felrapport till Sentry, en tjänst som hjälper oss att hitta och rätta fel. Rapporten visar vilken sida du var på och vilken webbläsare du använder{{#errorMonitoringEu}}, och den lagras inom EU{{/errorMonitoringEu}}. Den innehåller inte din IP-adress eller något du har fyllt i på sidan. Vi spelar inte in vad du gör på sidan, och rapporterna används bara för att rätta fel.

Den rättsliga grunden är vårt berättigade intresse av att webbplatsen fungerar.
{{/errorMonitoring}}

{{#humanCheck}}
## Skydd mot skräppost

Våra formulär använder Cloudflare Turnstile för att skilja människor från automatiskt utskickad skräppost. På sidor med formulär kontrollerar tjänsten signaler från din webbläsare. Den sätter inga egna cookies, och Cloudflare använder signalerna åt oss och bara för det ändamålet.
{{/humanCheck}}

## Cookies och din webbläsare

Vi använder inga cookies för spårning eller reklam, så det finns inget att godkänna. Webbplatsen kommer bara ihåg val som du själv gör:

- vilket tema du väljer, i en cookie som sparas i ett år
- ljust eller mörkt läge när du byter, i webbläsarens lokala lagring eller i en cookie som sparas i ett år

Ingenting sparas förrän du gör ett val.

## Dina rättigheter

Du kan begära ett utdrag över de uppgifter vi har om dig, be oss rätta dem eller be oss radera dem. Skriv till {{contactEmail}} så svarar vi.

Du kan också vända dig till dataskyddsmyndigheten i ditt land om du tycker att vi hanterat dina uppgifter fel.

## Kontakt

{{tenantName}} {{contactEmail}}`;
