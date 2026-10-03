import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { translations } from './translations';

export const supportedLanguages = [
  { code: 'en', name: 'English', locale: 'en-US' },
  { code: 'fr', name: 'Français', locale: 'fr-CA' },
  { code: 'it', name: 'Italiano', locale: 'it-IT' },
  { code: 'es', name: 'Español', locale: 'es-ES' },
  { code: 'zh-CN', name: '简体中文', locale: 'zh-CN' },
  { code: 'ru', name: 'Русский', locale: 'ru-RU' },
] as const;

export type Language = typeof supportedLanguages[number]['code'];
const languageCodes = new Set<string>(supportedLanguages.map(language => language.code));
const LanguageContext = createContext<{ language: Language; setLanguage: (language: Language) => void } | null>(null);
let activeLanguage: Language = 'en';
export const currentLanguage = () => activeLanguage;
const normalize = (value: string) => value.replace(/\s+/g, ' ').trim();
const editorialTranslations: Partial<Record<Language, Record<string, string>>> = {
  fr: {
    'RECOVER — Find the revenue you already earned': 'RECOVER — Retrouvez les revenus que votre entreprise a déjà générés',
    "RECOVER finds revenue your business already earned but hasn't collected.": 'RECOVER retrouve les revenus que votre entreprise a déjà générés, mais pas encore encaissés.',
    'RECOVER finds money.': 'RECOVER retrouve les revenus oubliés.', 'RECOVER found': 'RECOVER a retrouvé',
    'in forgotten revenue.': 'de revenus oubliés.', 'recovered.': 'récupérés.',
    'Abandoned quote': 'Devis sans réponse', 'Missed call': 'Appel manqué', 'Unpaid invoice': 'Facture impayée',
    'Expired subscription': 'Abonnement expiré', 'Abandoned cart': 'Panier abandonné', 'Forgotten lead': 'Prospect oublié',
    'Make the next move clear': 'Clarifiez la prochaine étape', 'Recover with confidence': 'Récupérez vos revenus en toute confiance',
    'THE REVENUE IS ALREADY THERE': 'LES REVENUS SONT DÉJÀ LÀ', 'A QUICK BACK-OF-THE-ENVELOPE': 'UNE ESTIMATION RAPIDE',
    'Human approved. Consent aware. Revenue focused.': 'Approbation humaine. Consentement vérifié. Axé sur les revenus.',
    'One view across the systems where opportunity tends to get left behind.': 'Une vue d’ensemble des systèmes où des occasions de revenus peuvent être oubliées.',
    'RECOVER connects the dots across the tools you already use, then helps your team close the loop with a little less chasing.': 'RECOVER relie les données des outils que vous utilisez déjà et aide votre équipe à assurer le suivi, avec moins de relances manuelles.',
    'RECOVER stores the account, integration and customer data needed to identify recovery opportunities and run approved workflows. Workspace data is tenant isolated. OAuth tokens and provider credentials are encrypted at rest in production deployments. You may export or delete your data from workspace settings.': 'RECOVER conserve les données de compte, d’intégration et de clientèle nécessaires pour repérer les occasions de recouvrement et exécuter les parcours approuvés. Les données sont isolées par espace de travail. En production, les jetons OAuth et les identifiants des fournisseurs sont chiffrés au repos. Vous pouvez exporter ou supprimer vos données dans les paramètres de l’espace de travail.',
    'RECOVER helps businesses identify and act on revenue opportunities. You remain responsible for your customer relationships, message content, payment terms, and applicable laws. Usage fees apply only to recovered revenue attributed to RECOVER and confirmed as paid.': 'RECOVER aide les entreprises à repérer les occasions de revenus et à y donner suite. Vous demeurez responsable de vos relations avec la clientèle, du contenu des messages, des modalités de paiement et du respect des lois applicables. Les frais variables s’appliquent uniquement aux revenus récupérés attribués à RECOVER et dont le paiement est confirmé.',
    'RECOVER provides consent tracking, opt-out handling, quiet hours and human approval controls. Configure these controls for each jurisdiction and channel before enabling outreach. Email must identify the sender and honor opt-out requests. SMS and voice require documented consent and must honor STOP and quiet-hour rules. Collections-adjacent actions always require a human decision. This product is not legal advice; consult counsel for your jurisdictions.': 'RECOVER permet de consigner les consentements, de traiter les désabonnements, de définir des plages horaires de silence et d’exiger une approbation humaine. Configurez ces contrôles pour chaque juridiction et chaque canal avant d’activer les communications. Les courriels doivent identifier l’expéditeur et respecter les demandes de désabonnement. Les SMS et les appels vocaux exigent un consentement documenté; respectez les demandes « STOP » et les plages horaires de silence. Toute action liée au recouvrement de créances exige une décision humaine. Ce produit ne constitue pas un avis juridique; consultez un professionnel pour les juridictions concernées.',
    'The address may have changed. Head back to RECOVER to find your way.': 'Cette adresse a peut-être changé. Retournez à RECOVER pour reprendre votre navigation.',
    'Language': 'Langue',
    'Overview': 'Vue d’ensemble', 'Quotes': 'Devis', 'Carts': 'Paniers', 'Calls': 'Appels',
    'Mark recovered': 'Confirmer la récupération', 'Recovered': 'Récupérée', 'New': 'Nouvelle', 'Draft ready': 'Brouillon prêt', 'Needs approval': 'À approuver', 'In progress': 'En cours', 'Dismissed': 'Ignorée',
    'vs. last month': 'par rapport au mois dernier', 'of found revenue': 'des revenus repérés', '8 opportunities need a look': '8 occasions à examiner', '+3.2% from last month': '+3,2 % par rapport au mois dernier',
    'YOUR REVENUE, REFOUND': 'VOTRE REVENU, RETROUVÉ', 'JUST FOUND': 'NOUVELLE OCCASION', 'Found vs. recovered': 'Revenus repérés et récupérés',
    'What could': 'Que représentent', 'slipping away': 'ces revenus', 'cost?': 'perdus ?', 'We only win when': 'Nous gagnons seulement quand', 'you bring money home.': 'vous récupérez vos revenus.',
    'Found revenue trends upward over the last month': 'Les revenus repérés progressent depuis un mois',
    "That's revenue that was already yours. Let's bring more of it home.": 'Ces revenus vous revenaient déjà. Récupérons-en davantage.',
    '© 2026 RECOVER': '© 2026 RECOVER',
  },
  it: {
    'RECOVER — Find the revenue you already earned': 'RECOVER — Ritrova i ricavi che la tua azienda ha già generato',
    "RECOVER finds revenue your business already earned but hasn't collected.": 'RECOVER ritrova i ricavi già generati dalla tua azienda ma non ancora incassati.',
    'RECOVER finds money.': 'RECOVER ritrova i ricavi dimenticati.', 'RECOVER found': 'RECOVER ha trovato',
    'in forgotten revenue.': 'di ricavi dimenticati.', 'recovered.': 'recuperati.',
    'Abandoned quote': 'Preventivo senza risposta', 'Missed call': 'Chiamata persa', 'Unpaid invoice': 'Fattura non pagata',
    'Expired subscription': 'Abbonamento scaduto', 'Abandoned cart': 'Carrello abbandonato', 'Forgotten lead': 'Potenziale cliente dimenticato',
    'Make the next move clear': 'Chiarisci il prossimo passo', 'Recover with confidence': 'Recupera i ricavi con sicurezza',
    'THE REVENUE IS ALREADY THERE': 'I RICAVI CI SONO GIÀ', 'A QUICK BACK-OF-THE-ENVELOPE': 'UNA STIMA RAPIDA',
    'Human approved. Consent aware. Revenue focused.': 'Con approvazione umana. Consenso verificato. Focalizzato sul recupero dei ricavi.',
    'One view across the systems where opportunity tends to get left behind.': 'Una panoramica dei sistemi in cui possono sfuggire opportunità di ricavo.',
    'RECOVER connects the dots across the tools you already use, then helps your team close the loop with a little less chasing.': 'RECOVER collega i dati degli strumenti che già utilizzi e aiuta il tuo team a seguire ogni opportunità, con meno solleciti manuali.',
    'RECOVER stores the account, integration and customer data needed to identify recovery opportunities and run approved workflows. Workspace data is tenant isolated. OAuth tokens and provider credentials are encrypted at rest in production deployments. You may export or delete your data from workspace settings.': 'RECOVER conserva i dati dell’account, delle integrazioni e dei clienti necessari per individuare opportunità di recupero e avviare flussi di lavoro approvati. I dati sono isolati per area di lavoro. In produzione, i token OAuth e le credenziali dei provider sono cifrati quando archiviati. Puoi esportare o eliminare i tuoi dati dalle impostazioni dell’area di lavoro.',
    'RECOVER helps businesses identify and act on revenue opportunities. You remain responsible for your customer relationships, message content, payment terms, and applicable laws. Usage fees apply only to recovered revenue attributed to RECOVER and confirmed as paid.': 'RECOVER aiuta le aziende a individuare e cogliere opportunità di ricavo. Resti responsabile dei rapporti con i clienti, dei contenuti dei messaggi, delle condizioni di pagamento e delle leggi applicabili. Le commissioni variabili si applicano solo ai ricavi recuperati attribuiti a RECOVER e confermati come pagati.',
    'RECOVER provides consent tracking, opt-out handling, quiet hours and human approval controls. Configure these controls for each jurisdiction and channel before enabling outreach. Email must identify the sender and honor opt-out requests. SMS and voice require documented consent and must honor STOP and quiet-hour rules. Collections-adjacent actions always require a human decision. This product is not legal advice; consult counsel for your jurisdictions.': 'RECOVER consente di registrare i consensi, gestire le richieste di disiscrizione, impostare le fasce orarie di silenzio e richiedere l’approvazione di una persona. Configura questi controlli per ogni giurisdizione e canale prima di attivare i messaggi. Le e-mail devono identificare il mittente e rispettare le richieste di disiscrizione. SMS e chiamate vocali richiedono un consenso documentato; rispetta le richieste «STOP» e le fasce orarie di silenzio. Ogni azione relativa al recupero crediti richiede una decisione umana. Questo prodotto non costituisce consulenza legale: consulta un professionista per le giurisdizioni interessate.',
    'The address may have changed. Head back to RECOVER to find your way.': 'L’indirizzo potrebbe essere cambiato. Torna a RECOVER per continuare.',
    'Language': 'Lingua',
    'Overview': 'Panoramica', 'Quotes': 'Preventivi', 'Carts': 'Carrelli', 'Calls': 'Chiamate',
    'Mark recovered': 'Conferma il recupero', 'Recovered': 'Recuperata', 'New': 'Nuova', 'Draft ready': 'Bozza pronta', 'Needs approval': 'Da approvare', 'In progress': 'In corso', 'Dismissed': 'Ignorata',
    'vs. last month': 'rispetto al mese scorso', 'of found revenue': 'dei ricavi individuati', '8 opportunities need a look': '8 opportunità da esaminare', '+3.2% from last month': '+3,2% rispetto al mese scorso',
    'YOUR REVENUE, REFOUND': 'I RICAVI CHE TI SPETTANO', 'JUST FOUND': 'NUOVA OPPORTUNITÀ', 'Found vs. recovered': 'Ricavi individuati e recuperati',
    'What could': 'Quanto costa', 'slipping away': 'il fatturato', 'cost?': 'perso?', 'We only win when': 'Vincoliamo il nostro successo a quando', 'you bring money home.': 'recuperi i tuoi ricavi.',
    '© 2026 RECOVER': '© 2026 RECOVER',
    "That's revenue that was already yours. Let's bring more of it home.": 'Questi ricavi erano già tuoi. Recuperiamone altri.',
  },
  es: {
    'RECOVER — Find the revenue you already earned': 'RECOVER — Encuentra los ingresos que tu empresa ya ha generado',
    "RECOVER finds revenue your business already earned but hasn't collected.": 'RECOVER encuentra los ingresos que tu empresa ya ha generado, pero aún no ha cobrado.',
    'RECOVER finds money.': 'RECOVER encuentra ingresos olvidados.', 'RECOVER found': 'RECOVER encontró',
    'in forgotten revenue.': 'en ingresos olvidados.', 'recovered.': 'recuperados.',
    'Abandoned quote': 'Presupuesto sin respuesta', 'Missed call': 'Llamada perdida', 'Unpaid invoice': 'Factura impagada',
    'Expired subscription': 'Suscripción caducada', 'Abandoned cart': 'Carrito abandonado', 'Forgotten lead': 'Cliente potencial olvidado',
    'Make the next move clear': 'Aclara el siguiente paso', 'Recover with confidence': 'Recupera ingresos con confianza',
    'THE REVENUE IS ALREADY THERE': 'LOS INGRESOS YA ESTÁN AHÍ', 'A QUICK BACK-OF-THE-ENVELOPE': 'UNA ESTIMACIÓN RÁPIDA',
    'Human approved. Consent aware. Revenue focused.': 'Con aprobación humana. Consentimiento registrado. Enfocado en recuperar ingresos.',
    'One view across the systems where opportunity tends to get left behind.': 'Una sola vista de los sistemas donde pueden quedar oportunidades de ingresos sin atender.',
    'RECOVER connects the dots across the tools you already use, then helps your team close the loop with a little less chasing.': 'RECOVER reúne la información de las herramientas que ya utiliza y ayuda a su equipo a dar seguimiento a cada oportunidad, con menos gestiones manuales.',
    'RECOVER stores the account, integration and customer data needed to identify recovery opportunities and run approved workflows. Workspace data is tenant isolated. OAuth tokens and provider credentials are encrypted at rest in production deployments. You may export or delete your data from workspace settings.': 'RECOVER almacena los datos de cuenta, integraciones y clientes necesarios para detectar oportunidades de recuperación y ejecutar flujos de trabajo aprobados. Los datos se aíslan por espacio de trabajo. En producción, los tokens de OAuth y las credenciales de los proveedores se cifran cuando están almacenados. Puede exportar o eliminar sus datos desde la configuración del espacio de trabajo.',
    'RECOVER helps businesses identify and act on revenue opportunities. You remain responsible for your customer relationships, message content, payment terms, and applicable laws. Usage fees apply only to recovered revenue attributed to RECOVER and confirmed as paid.': 'RECOVER ayuda a las empresas a detectar oportunidades de ingresos y actuar sobre ellas. Usted sigue siendo responsable de sus relaciones con los clientes, el contenido de los mensajes, las condiciones de pago y el cumplimiento de las leyes aplicables. Las tarifas variables solo se aplican a los ingresos recuperados atribuidos a RECOVER cuyo pago esté confirmado.',
    'RECOVER provides consent tracking, opt-out handling, quiet hours and human approval controls. Configure these controls for each jurisdiction and channel before enabling outreach. Email must identify the sender and honor opt-out requests. SMS and voice require documented consent and must honor STOP and quiet-hour rules. Collections-adjacent actions always require a human decision. This product is not legal advice; consult counsel for your jurisdictions.': 'RECOVER permite registrar el consentimiento, gestionar las solicitudes de exclusión, establecer horarios de silencio y exigir aprobación humana. Configure estos controles para cada jurisdicción y canal antes de activar los mensajes. Los correos electrónicos deben identificar al remitente y respetar las solicitudes de baja. Los SMS y las llamadas requieren consentimiento documentado; respete las solicitudes «STOP» y los horarios de silencio. Toda acción relacionada con el cobro de deudas requiere una decisión humana. Este producto no constituye asesoramiento legal; consulte a un profesional en las jurisdicciones pertinentes.',
    'The address may have changed. Head back to RECOVER to find your way.': 'Es posible que la dirección haya cambiado. Vuelva a RECOVER para continuar.',
    'Language': 'Idioma',
    'Overview': 'Resumen', 'Quotes': 'Presupuestos', 'Carts': 'Carritos', 'Calls': 'Llamadas',
    'Mark recovered': 'Confirmar recuperación', 'Recovered': 'Recuperada', 'New': 'Nueva', 'Draft ready': 'Borrador listo', 'Needs approval': 'Requiere aprobación', 'In progress': 'En curso', 'Dismissed': 'Descartada',
    'vs. last month': 'respecto al mes pasado', 'of found revenue': 'de los ingresos detectados', '8 opportunities need a look': '8 oportunidades por revisar', '+3.2% from last month': '+3,2 % respecto al mes pasado',
    'YOUR REVENUE, REFOUND': 'LOS INGRESOS QUE YA GENERASTE', 'JUST FOUND': 'NUEVA OPORTUNIDAD', 'Found vs. recovered': 'Ingresos detectados y recuperados',
    'What could': '¿Cuánto cuesta', 'slipping away': 'el ingreso que se escapa', 'cost?': '?', 'We only win when': 'Solo ganamos cuando', 'you bring money home.': 'recuperas tus ingresos.',
    '© 2026 RECOVER': '© 2026 RECOVER',
    "That's revenue that was already yours. Let's bring more of it home.": 'Esos ingresos ya eran suyos. Recuperemos más.',
  },
  'zh-CN': {
    'RECOVER — Find the revenue you already earned': 'RECOVER — 找回企业已经创造但尚未收回的收入',
    "RECOVER finds revenue your business already earned but hasn't collected.": 'RECOVER 帮助企业找回已创造但尚未收回的收入。',
    'RECOVER finds money.': 'RECOVER 找回被遗忘的收入。', 'RECOVER found': 'RECOVER 找到了',
    'in forgotten revenue.': '被遗忘的收入。', 'recovered.': '已追回。',
    'Abandoned quote': '待跟进报价', 'Missed call': '未接来电', 'Unpaid invoice': '未付款发票',
    'Expired subscription': '已过期订阅', 'Abandoned cart': '被遗弃的购物车', 'Forgotten lead': '被遗忘的潜在客户',
    'Make the next move clear': '明确下一步行动', 'Recover with confidence': '安心追回收入',
    'THE REVENUE IS ALREADY THERE': '收入其实一直都在', 'A QUICK BACK-OF-THE-ENVELOPE': '快速估算',
    'Human approved. Consent aware. Revenue focused.': '人工审批。记录同意状态。专注追回收入。',
    'One view across the systems where opportunity tends to get left behind.': '在一个界面中查看可能遗漏收入机会的各个业务系统。',
    'RECOVER connects the dots across the tools you already use, then helps your team close the loop with a little less chasing.': 'RECOVER 汇总您现有业务工具中的信息，帮助团队跟进每个机会，减少手动催办。',
    'RECOVER stores the account, integration and customer data needed to identify recovery opportunities and run approved workflows. Workspace data is tenant isolated. OAuth tokens and provider credentials are encrypted at rest in production deployments. You may export or delete your data from workspace settings.': 'RECOVER 会保存识别收入追回机会和执行已批准工作流所需的账户、集成及客户数据。各工作区的数据相互隔离。在生产环境中，OAuth 令牌和服务商凭据均采用静态加密。您可以在工作区设置中导出或删除数据。',
    'RECOVER helps businesses identify and act on revenue opportunities. You remain responsible for your customer relationships, message content, payment terms, and applicable laws. Usage fees apply only to recovered revenue attributed to RECOVER and confirmed as paid.': 'RECOVER 帮助企业识别收入机会并采取行动。您仍需对客户关系、消息内容、付款条款及适用法律负责。只有归因于 RECOVER 且已确认收款的追回收入，才会产生按量费用。',
    'RECOVER provides consent tracking, opt-out handling, quiet hours and human approval controls. Configure these controls for each jurisdiction and channel before enabling outreach. Email must identify the sender and honor opt-out requests. SMS and voice require documented consent and must honor STOP and quiet-hour rules. Collections-adjacent actions always require a human decision. This product is not legal advice; consult counsel for your jurisdictions.': 'RECOVER 提供同意记录、退订处理、免打扰时段和人工审批控制。启用联系客户前，请按司法辖区和沟通渠道配置这些控制。电子邮件必须注明发件人，并尊重退订请求。发送短信和语音信息前必须留存同意记录，并遵守 STOP 退订请求及免打扰时段。任何与债务催收相关的操作都必须由人工决定。本产品不构成法律意见；请咨询熟悉相关司法辖区的专业人士。',
    'The address may have changed. Head back to RECOVER to find your way.': '此地址可能已更改。返回 RECOVER 继续浏览。',
    'Language': '语言',
    'Overview': '总览', 'Quotes': '报价', 'Carts': '购物车', 'Calls': '来电',
    'Mark recovered': '确认已追回', 'Recovered': '已追回', 'New': '新建', 'Draft ready': '草稿已就绪', 'Needs approval': '待审批', 'In progress': '进行中', 'Dismissed': '已忽略',
    'vs. last month': '较上月', 'of found revenue': '占已发现收入', '8 opportunities need a look': '有 8 个机会待查看', '+3.2% from last month': '较上月增长 3.2%',
    'YOUR REVENUE, REFOUND': '找回本应属于您的收入', 'JUST FOUND': '刚刚发现', 'Found vs. recovered': '已发现与已追回收入',
    'What could': '收入流失', 'slipping away': '会带来什么', 'cost?': '代价？', 'We only win when': '只有当您', 'you bring money home.': '追回收入，我们才会获益。',
    '© 2026 RECOVER': '© 2026 RECOVER',
    "That's revenue that was already yours. Let's bring more of it home.": '这些收入本就属于您。让我们再追回更多。',
  },
  ru: {
    'RECOVER — Find the revenue you already earned': 'RECOVER — Найдите выручку, которую ваш бизнес уже заработал',
    "RECOVER finds revenue your business already earned but hasn't collected.": 'RECOVER находит выручку, которую ваш бизнес уже заработал, но ещё не получил.',
    'RECOVER finds money.': 'RECOVER находит забытые доходы.', 'RECOVER found': 'RECOVER обнаружил',
    'in forgotten revenue.': 'забытой выручки.', 'recovered.': 'возвращено.',
    'Abandoned quote': 'Забытое коммерческое предложение', 'Missed call': 'Пропущенный звонок', 'Unpaid invoice': 'Неоплаченный счёт',
    'Expired subscription': 'Истёкшая подписка', 'Abandoned cart': 'Брошенная корзина', 'Forgotten lead': 'Забытый потенциальный клиент',
    'Make the next move clear': 'Определите следующий шаг', 'Recover with confidence': 'Возвращайте выручку уверенно',
    'THE REVENUE IS ALREADY THERE': 'ЭТА ВЫРУЧКА УЖЕ ЕСТЬ', 'A QUICK BACK-OF-THE-ENVELOPE': 'БЫСТРАЯ ОЦЕНКА',
    'Human approved. Consent aware. Revenue focused.': 'Только с одобрения человека. С учётом согласия. Нацелено на возврат выручки.',
    'One view across the systems where opportunity tends to get left behind.': 'Единый обзор систем, в которых могут теряться возможности получить выручку.',
    'RECOVER connects the dots across the tools you already use, then helps your team close the loop with a little less chasing.': 'RECOVER объединяет данные из привычных вам систем и помогает команде доводить каждую возможность до результата с меньшим числом ручных напоминаний.',
    'RECOVER stores the account, integration and customer data needed to identify recovery opportunities and run approved workflows. Workspace data is tenant isolated. OAuth tokens and provider credentials are encrypted at rest in production deployments. You may export or delete your data from workspace settings.': 'RECOVER хранит данные учётной записи, интеграций и клиентов, необходимые для выявления возможностей вернуть выручку и запуска одобренных сценариев. Данные изолированы по рабочим пространствам. В производственной среде токены OAuth и учётные данные поставщиков зашифрованы при хранении. Вы можете экспортировать или удалить данные в настройках рабочего пространства.',
    'RECOVER helps businesses identify and act on revenue opportunities. You remain responsible for your customer relationships, message content, payment terms, and applicable laws. Usage fees apply only to recovered revenue attributed to RECOVER and confirmed as paid.': 'RECOVER помогает компаниям находить возможности вернуть выручку и работать с ними. Вы отвечаете за отношения с клиентами, содержание сообщений, условия оплаты и соблюдение применимых законов. Переменная плата взимается только с подтверждённой оплаты, отнесённой к RECOVER.',
    'RECOVER provides consent tracking, opt-out handling, quiet hours and human approval controls. Configure these controls for each jurisdiction and channel before enabling outreach. Email must identify the sender and honor opt-out requests. SMS and voice require documented consent and must honor STOP and quiet-hour rules. Collections-adjacent actions always require a human decision. This product is not legal advice; consult counsel for your jurisdictions.': 'RECOVER помогает фиксировать согласие, обрабатывать отказы от сообщений, задавать часы тишины и требовать одобрения человека. Настройте правила для каждой юрисдикции и канала до начала рассылок. В электронных письмах нужно указывать отправителя и выполнять запросы об отписке. Для SMS и голосовых сообщений требуется зафиксированное согласие; необходимо выполнять запросы STOP и соблюдать часы тишины. Любые действия по взысканию задолженности требуют решения человека. Это не юридическая консультация; обратитесь к специалисту в соответствующих юрисдикциях.',
    'The address may have changed. Head back to RECOVER to find your way.': 'Возможно, адрес изменился. Вернитесь на RECOVER, чтобы продолжить.',
    'Language': 'Язык',
    'Overview': 'Обзор', 'Quotes': 'Предложения', 'Carts': 'Корзины', 'Calls': 'Звонки',
    'Mark recovered': 'Подтвердить возврат', 'Recovered': 'Возвращена', 'New': 'Новая', 'Draft ready': 'Черновик готов', 'Needs approval': 'Требует одобрения', 'In progress': 'В работе', 'Dismissed': 'Отклонена',
    'vs. last month': 'к прошлому месяцу', 'of found revenue': 'от найденной выручки', '8 opportunities need a look': 'Нужно проверить 8 возможностей', '+3.2% from last month': '+3,2% к прошлому месяцу',
    'YOUR REVENUE, REFOUND': 'ВЕРНИТЕ ЗАРАБОТАННУЮ ВЫРУЧКУ', 'JUST FOUND': 'ТОЛЬКО ЧТО НАЙДЕНО', 'Found vs. recovered': 'Найденная и возвращённая выручка',
    'What could': 'Сколько стоит', 'slipping away': 'упущенная выручка', 'cost?': '?', 'We only win when': 'Мы зарабатываем, только когда', 'you bring money home.': 'вы возвращаете свою выручку.',
    '© 2026 RECOVER': '© 2026 RECOVER',
    "That's revenue that was already yours. Let's bring more of it home.": 'Эта выручка уже принадлежала вам. Вернём ещё больше.',
  },
};

export function translateText(value: string, language: Language): string {
  const leading = value.match(/^\s*/)?.[0] ?? '';
  const trailing = value.match(/\s*$/)?.[0] ?? '';
  const content = value.slice(leading.length, value.length - trailing.length || undefined);
  const key = normalize(content);
  const translated = editorialTranslations[language]?.[key] ?? translations[language]?.[key];
  return translated ? `${leading}${translated}${trailing}` : value;
}

function browserLanguage(): Language {
  if (typeof navigator === 'undefined') return 'en';
  const candidates = navigator.languages?.length ? navigator.languages : [navigator.language];
  for (const candidate of candidates) {
    const code = candidate.toLowerCase();
    if (code.startsWith('zh')) return 'zh-CN';
    const base = code.split('-')[0];
    if (languageCodes.has(base)) return base as Language;
  }
  return 'en';
}

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const saved = typeof localStorage === 'undefined' ? null : localStorage.getItem('recover-language');
  const initial = saved && languageCodes.has(saved) ? saved as Language : browserLanguage();
  const [language, setLanguageState] = useState<Language>(() => { activeLanguage = initial; return initial; });
  const [ready, setReady] = useState(Boolean(saved && languageCodes.has(saved)));

  const setLanguage = useCallback((next: Language) => {
    activeLanguage = next;
    setLanguageState(next);
    localStorage.setItem('recover-language', next);
  }, []);

  useEffect(() => {
    document.documentElement.lang = language;
    document.body.classList.add('dark-theme');
    document.title = translateText('RECOVER — Find the revenue you already earned', language);
    document.querySelector('meta[name="description"]')?.setAttribute('content', translateText("RECOVER finds revenue your business already earned but hasn't collected.", language));
  }, [language]);

  useEffect(() => {
    let active = true;
    const deadline = window.setTimeout(() => { if (active) setReady(true); }, 1200);
    fetch('/api/locale', { credentials: 'omit', cache: 'no-store', headers: { accept: 'application/json' } })
      .then(response => response.ok ? response.json() : Promise.reject(new Error('Locale lookup unavailable')))
      .then((result: { language?: string }) => {
        if (!active) return;
        const savedChoice = localStorage.getItem('recover-language');
        if ((!savedChoice || !languageCodes.has(savedChoice)) && result.language && languageCodes.has(result.language)) {
          activeLanguage = result.language as Language;
          setLanguageState(result.language as Language);
        }
      })
      .catch(() => { /* Browser language is the fallback when GeoIP is unavailable. */ })
      .finally(() => {
        window.clearTimeout(deadline);
        if (active) setReady(true);
      });
    return () => { active = false; window.clearTimeout(deadline); };
  }, []);

  return <LanguageContext.Provider value={{ language, setLanguage }}>
    {ready ? children : <main className="locale-boot" aria-label="RECOVER"><span>RECOVER</span><i/></main>}
  </LanguageContext.Provider>;
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (!context) throw new Error('useLanguage must be used inside LanguageProvider');
  return context;
}

export function LanguageSwitcher({ className = '' }: { className?: string }) {
  const { language, setLanguage } = useLanguage();
  return <label className={`language-switcher ${className}`.trim()}>
    <span className="sr-only">{translateText('Language', language)}</span>
    <select aria-label={translateText('Language', language)} value={language} onChange={event => setLanguage(event.target.value as Language)}>
      {supportedLanguages.map(option => <option key={option.code} value={option.code}>{option.name}</option>)}
    </select>
  </label>;
}

const textAttributes = new Set(['placeholder', 'title', 'aria-label', 'alt']);
const contentProps = new Set(['label', 'title', 'desc', 'description', 'subtitle', 'sub', 'emptyTitle', 'actionLabel']);

function localizeNode(node: React.ReactNode, language: Language): React.ReactNode {
  if (typeof node === 'string') return translateText(node, language);
  if (Array.isArray(node)) return node.map((child, index) => <React.Fragment key={index}>{localizeNode(child, language)}</React.Fragment>);
  if (!React.isValidElement<Record<string, unknown>>(node)) return node;

  const props = { ...node.props };
  for (const [key, value] of Object.entries(props)) {
    if (typeof value === 'string' && (textAttributes.has(key) || contentProps.has(key))) {
      props[key] = translateText(value, language);
    }
  }
  if ('children' in props) props.children = localizeNode(props.children as React.ReactNode, language);
  return React.cloneElement(node, props);
}

export function LocalizedTree({ children }: { children: React.ReactNode }) {
  const { language } = useLanguage();
  return <>{localizeNode(children, language)}</>;
}

export function languageLocale(language: Language): string {
  return supportedLanguages.find(option => option.code === language)?.locale ?? 'en-US';
}
