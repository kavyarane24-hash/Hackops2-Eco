// User-facing copy. Citizen strings are bilingual (English / Hindi).
import type { Language } from '@/types';

export const APP_NAME = 'EnviroIntel';
export const APP_FULL_NAME = 'Environmental Intelligence & Compliance Management System';

const citizen = {
  en: {
    title: 'Report air pollution',
    subtitle: 'Tell us what you see. Your report goes straight to the monitoring team.',
    description: 'What is happening?',
    descriptionHelp: 'Describe the smoke, smell or dust, where it comes from and how long it has been going on.',
    descriptionPlaceholder: 'e.g. Thick black smoke from garbage burning near the park since 7 pm…',
    language: 'Complaint language',
    location: 'Location',
    locationHelp: 'Click the map to drop a pin, or use your current location.',
    address: 'Address or landmark',
    addressPlaceholder: 'e.g. Near Sector 7 market gate',
    useMyLocation: 'Use my location',
    evidence: 'Photos or videos (optional)',
    evidenceHelp: 'JPEG, PNG or WEBP up to 10 MB; videos up to 50 MB.',
    name: 'Your name (optional)',
    contact: 'Phone or email (optional)',
    submit: 'Submit complaint',
    submitting: 'Submitting…',
    successTitle: 'Complaint submitted',
    successBody: 'Save this ID to track your complaint.',
    myComplaints: 'My complaints',
    noComplaints: 'You have not submitted any complaints yet.',
    errText: 'Please describe the problem (at least 15 characters).',
    errLocation: 'Please pick a location on the map.',
    errAddress: 'Please add an address or landmark.',
    track: 'Track',
    fillSample: 'Fill sample complaint',
  },
  hi: {
    title: 'वायु प्रदूषण की शिकायत करें',
    subtitle: 'आप जो देख रहे हैं वह बताएं। आपकी शिकायत सीधे निगरानी टीम तक पहुंचेगी।',
    description: 'क्या हो रहा है?',
    descriptionHelp: 'धुएं, गंध या धूल का विवरण दें, वह कहां से आ रहा है और कब से।',
    descriptionPlaceholder: 'जैसे: पार्क के पास शाम 7 बजे से कचरा जलने का घना काला धुआं…',
    language: 'शिकायत की भाषा',
    location: 'स्थान',
    locationHelp: 'नक्शे पर क्लिक करके पिन लगाएं, या अपना वर्तमान स्थान उपयोग करें।',
    address: 'पता या पहचान चिह्न',
    addressPlaceholder: 'जैसे: सेक्टर 7 बाज़ार गेट के पास',
    useMyLocation: 'मेरा स्थान उपयोग करें',
    evidence: 'फोटो या वीडियो (वैकल्पिक)',
    evidenceHelp: 'JPEG, PNG या WEBP 10 MB तक; वीडियो 50 MB तक।',
    name: 'आपका नाम (वैकल्पिक)',
    contact: 'फोन या ईमेल (वैकल्पिक)',
    submit: 'शिकायत दर्ज करें',
    submitting: 'दर्ज हो रही है…',
    successTitle: 'शिकायत दर्ज हो गई',
    successBody: 'अपनी शिकायत ट्रैक करने के लिए यह आईडी सहेजें।',
    myComplaints: 'मेरी शिकायतें',
    noComplaints: 'आपने अभी तक कोई शिकायत दर्ज नहीं की है।',
    errText: 'कृपया समस्या का विवरण दें (कम से कम 15 अक्षर)।',
    errLocation: 'कृपया नक्शे पर स्थान चुनें।',
    errAddress: 'कृपया पता या पहचान चिह्न जोड़ें।',
    track: 'ट्रैक करें',
    fillSample: 'नमूना शिकायत भरें',
  },
} satisfies Record<Language, Record<string, string>>;

export type CitizenCopy = (typeof citizen)['en'];
export const citizenCopy = (lang: Language): CitizenCopy => citizen[lang];


export const ROLE_LABEL = {
  citizen: 'Citizen',
  admin: 'Admin',
  stakeholder: 'Stakeholder',
  field: 'Field Officer',
} as const;
