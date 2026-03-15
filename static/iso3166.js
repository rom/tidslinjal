/* ============================================================
   ISO 3166-1 Country / Language Code Data
   Provides alpha-2 ↔ alpha-3 mappings for countries and languages.
   ============================================================ */
'use strict';

// ISO 3166-1 country codes: alpha-2 → { alpha3, name }
const ISO3166_COUNTRIES = {
  AF: { alpha3: 'AFG', name: 'Afghanistan' },
  AL: { alpha3: 'ALB', name: 'Albania' },
  DZ: { alpha3: 'DZA', name: 'Algeria' },
  AD: { alpha3: 'AND', name: 'Andorra' },
  AO: { alpha3: 'AGO', name: 'Angola' },
  AG: { alpha3: 'ATG', name: 'Antigua and Barbuda' },
  AR: { alpha3: 'ARG', name: 'Argentina' },
  AM: { alpha3: 'ARM', name: 'Armenia' },
  AU: { alpha3: 'AUS', name: 'Australia' },
  AT: { alpha3: 'AUT', name: 'Austria' },
  AZ: { alpha3: 'AZE', name: 'Azerbaijan' },
  BS: { alpha3: 'BHS', name: 'Bahamas' },
  BH: { alpha3: 'BHR', name: 'Bahrain' },
  BD: { alpha3: 'BGD', name: 'Bangladesh' },
  BB: { alpha3: 'BRB', name: 'Barbados' },
  BY: { alpha3: 'BLR', name: 'Belarus' },
  BE: { alpha3: 'BEL', name: 'Belgium' },
  BZ: { alpha3: 'BLZ', name: 'Belize' },
  BJ: { alpha3: 'BEN', name: 'Benin' },
  BT: { alpha3: 'BTN', name: 'Bhutan' },
  BO: { alpha3: 'BOL', name: 'Bolivia' },
  BA: { alpha3: 'BIH', name: 'Bosnia and Herzegovina' },
  BW: { alpha3: 'BWA', name: 'Botswana' },
  BR: { alpha3: 'BRA', name: 'Brazil' },
  BN: { alpha3: 'BRN', name: 'Brunei' },
  BG: { alpha3: 'BGR', name: 'Bulgaria' },
  BF: { alpha3: 'BFA', name: 'Burkina Faso' },
  BI: { alpha3: 'BDI', name: 'Burundi' },
  CV: { alpha3: 'CPV', name: 'Cabo Verde' },
  KH: { alpha3: 'KHM', name: 'Cambodia' },
  CM: { alpha3: 'CMR', name: 'Cameroon' },
  CA: { alpha3: 'CAN', name: 'Canada' },
  CF: { alpha3: 'CAF', name: 'Central African Republic' },
  TD: { alpha3: 'TCD', name: 'Chad' },
  CL: { alpha3: 'CHL', name: 'Chile' },
  CN: { alpha3: 'CHN', name: 'China' },
  CO: { alpha3: 'COL', name: 'Colombia' },
  KM: { alpha3: 'COM', name: 'Comoros' },
  CG: { alpha3: 'COG', name: 'Congo' },
  CD: { alpha3: 'COD', name: 'Congo (DRC)' },
  CR: { alpha3: 'CRI', name: 'Costa Rica' },
  CI: { alpha3: 'CIV', name: "Côte d'Ivoire" },
  HR: { alpha3: 'HRV', name: 'Croatia' },
  CU: { alpha3: 'CUB', name: 'Cuba' },
  CY: { alpha3: 'CYP', name: 'Cyprus' },
  CZ: { alpha3: 'CZE', name: 'Czechia' },
  DK: { alpha3: 'DNK', name: 'Denmark' },
  DJ: { alpha3: 'DJI', name: 'Djibouti' },
  DM: { alpha3: 'DMA', name: 'Dominica' },
  DO: { alpha3: 'DOM', name: 'Dominican Republic' },
  EC: { alpha3: 'ECU', name: 'Ecuador' },
  EG: { alpha3: 'EGY', name: 'Egypt' },
  SV: { alpha3: 'SLV', name: 'El Salvador' },
  GQ: { alpha3: 'GNQ', name: 'Equatorial Guinea' },
  ER: { alpha3: 'ERI', name: 'Eritrea' },
  EE: { alpha3: 'EST', name: 'Estonia' },
  SZ: { alpha3: 'SWZ', name: 'Eswatini' },
  ET: { alpha3: 'ETH', name: 'Ethiopia' },
  FJ: { alpha3: 'FJI', name: 'Fiji' },
  FI: { alpha3: 'FIN', name: 'Finland' },
  FR: { alpha3: 'FRA', name: 'France' },
  GA: { alpha3: 'GAB', name: 'Gabon' },
  GM: { alpha3: 'GMB', name: 'Gambia' },
  GE: { alpha3: 'GEO', name: 'Georgia' },
  DE: { alpha3: 'DEU', name: 'Germany' },
  GH: { alpha3: 'GHA', name: 'Ghana' },
  GR: { alpha3: 'GRC', name: 'Greece' },
  GD: { alpha3: 'GRD', name: 'Grenada' },
  GT: { alpha3: 'GTM', name: 'Guatemala' },
  GN: { alpha3: 'GIN', name: 'Guinea' },
  GW: { alpha3: 'GNB', name: 'Guinea-Bissau' },
  GY: { alpha3: 'GUY', name: 'Guyana' },
  HT: { alpha3: 'HTI', name: 'Haiti' },
  HN: { alpha3: 'HND', name: 'Honduras' },
  HU: { alpha3: 'HUN', name: 'Hungary' },
  IS: { alpha3: 'ISL', name: 'Iceland' },
  IN: { alpha3: 'IND', name: 'India' },
  ID: { alpha3: 'IDN', name: 'Indonesia' },
  IR: { alpha3: 'IRN', name: 'Iran' },
  IQ: { alpha3: 'IRQ', name: 'Iraq' },
  IE: { alpha3: 'IRL', name: 'Ireland' },
  IL: { alpha3: 'ISR', name: 'Israel' },
  IT: { alpha3: 'ITA', name: 'Italy' },
  JM: { alpha3: 'JAM', name: 'Jamaica' },
  JP: { alpha3: 'JPN', name: 'Japan' },
  JO: { alpha3: 'JOR', name: 'Jordan' },
  KZ: { alpha3: 'KAZ', name: 'Kazakhstan' },
  KE: { alpha3: 'KEN', name: 'Kenya' },
  KI: { alpha3: 'KIR', name: 'Kiribati' },
  KP: { alpha3: 'PRK', name: 'North Korea' },
  KR: { alpha3: 'KOR', name: 'South Korea' },
  KW: { alpha3: 'KWT', name: 'Kuwait' },
  KG: { alpha3: 'KGZ', name: 'Kyrgyzstan' },
  LA: { alpha3: 'LAO', name: 'Laos' },
  LV: { alpha3: 'LVA', name: 'Latvia' },
  LB: { alpha3: 'LBN', name: 'Lebanon' },
  LS: { alpha3: 'LSO', name: 'Lesotho' },
  LR: { alpha3: 'LBR', name: 'Liberia' },
  LY: { alpha3: 'LBY', name: 'Libya' },
  LI: { alpha3: 'LIE', name: 'Liechtenstein' },
  LT: { alpha3: 'LTU', name: 'Lithuania' },
  LU: { alpha3: 'LUX', name: 'Luxembourg' },
  MG: { alpha3: 'MDG', name: 'Madagascar' },
  MW: { alpha3: 'MWI', name: 'Malawi' },
  MY: { alpha3: 'MYS', name: 'Malaysia' },
  MV: { alpha3: 'MDV', name: 'Maldives' },
  ML: { alpha3: 'MLI', name: 'Mali' },
  MT: { alpha3: 'MLT', name: 'Malta' },
  MH: { alpha3: 'MHL', name: 'Marshall Islands' },
  MR: { alpha3: 'MRT', name: 'Mauritania' },
  MU: { alpha3: 'MUS', name: 'Mauritius' },
  MX: { alpha3: 'MEX', name: 'Mexico' },
  FM: { alpha3: 'FSM', name: 'Micronesia' },
  MD: { alpha3: 'MDA', name: 'Moldova' },
  MC: { alpha3: 'MCO', name: 'Monaco' },
  MN: { alpha3: 'MNG', name: 'Mongolia' },
  ME: { alpha3: 'MNE', name: 'Montenegro' },
  MA: { alpha3: 'MAR', name: 'Morocco' },
  MZ: { alpha3: 'MOZ', name: 'Mozambique' },
  MM: { alpha3: 'MMR', name: 'Myanmar' },
  NA: { alpha3: 'NAM', name: 'Namibia' },
  NR: { alpha3: 'NRU', name: 'Nauru' },
  NP: { alpha3: 'NPL', name: 'Nepal' },
  NL: { alpha3: 'NLD', name: 'Netherlands' },
  NZ: { alpha3: 'NZL', name: 'New Zealand' },
  NI: { alpha3: 'NIC', name: 'Nicaragua' },
  NE: { alpha3: 'NER', name: 'Niger' },
  NG: { alpha3: 'NGA', name: 'Nigeria' },
  MK: { alpha3: 'MKD', name: 'North Macedonia' },
  NO: { alpha3: 'NOR', name: 'Norway' },
  OM: { alpha3: 'OMN', name: 'Oman' },
  PK: { alpha3: 'PAK', name: 'Pakistan' },
  PW: { alpha3: 'PLW', name: 'Palau' },
  PA: { alpha3: 'PAN', name: 'Panama' },
  PG: { alpha3: 'PNG', name: 'Papua New Guinea' },
  PY: { alpha3: 'PRY', name: 'Paraguay' },
  PE: { alpha3: 'PER', name: 'Peru' },
  PH: { alpha3: 'PHL', name: 'Philippines' },
  PL: { alpha3: 'POL', name: 'Poland' },
  PT: { alpha3: 'PRT', name: 'Portugal' },
  QA: { alpha3: 'QAT', name: 'Qatar' },
  RO: { alpha3: 'ROU', name: 'Romania' },
  RU: { alpha3: 'RUS', name: 'Russia' },
  RW: { alpha3: 'RWA', name: 'Rwanda' },
  KN: { alpha3: 'KNA', name: 'Saint Kitts and Nevis' },
  LC: { alpha3: 'LCA', name: 'Saint Lucia' },
  VC: { alpha3: 'VCT', name: 'Saint Vincent and the Grenadines' },
  WS: { alpha3: 'WSM', name: 'Samoa' },
  SM: { alpha3: 'SMR', name: 'San Marino' },
  ST: { alpha3: 'STP', name: 'São Tomé and Príncipe' },
  SA: { alpha3: 'SAU', name: 'Saudi Arabia' },
  SN: { alpha3: 'SEN', name: 'Senegal' },
  RS: { alpha3: 'SRB', name: 'Serbia' },
  SC: { alpha3: 'SYC', name: 'Seychelles' },
  SL: { alpha3: 'SLE', name: 'Sierra Leone' },
  SG: { alpha3: 'SGP', name: 'Singapore' },
  SK: { alpha3: 'SVK', name: 'Slovakia' },
  SI: { alpha3: 'SVN', name: 'Slovenia' },
  SB: { alpha3: 'SLB', name: 'Solomon Islands' },
  SO: { alpha3: 'SOM', name: 'Somalia' },
  ZA: { alpha3: 'ZAF', name: 'South Africa' },
  SS: { alpha3: 'SSD', name: 'South Sudan' },
  ES: { alpha3: 'ESP', name: 'Spain' },
  LK: { alpha3: 'LKA', name: 'Sri Lanka' },
  SD: { alpha3: 'SDN', name: 'Sudan' },
  SR: { alpha3: 'SUR', name: 'Suriname' },
  SE: { alpha3: 'SWE', name: 'Sweden' },
  CH: { alpha3: 'CHE', name: 'Switzerland' },
  SY: { alpha3: 'SYR', name: 'Syria' },
  TW: { alpha3: 'TWN', name: 'Taiwan' },
  TJ: { alpha3: 'TJK', name: 'Tajikistan' },
  TZ: { alpha3: 'TZA', name: 'Tanzania' },
  TH: { alpha3: 'THA', name: 'Thailand' },
  TL: { alpha3: 'TLS', name: 'Timor-Leste' },
  TG: { alpha3: 'TGO', name: 'Togo' },
  TO: { alpha3: 'TON', name: 'Tonga' },
  TT: { alpha3: 'TTO', name: 'Trinidad and Tobago' },
  TN: { alpha3: 'TUN', name: 'Tunisia' },
  TR: { alpha3: 'TUR', name: 'Turkey' },
  TM: { alpha3: 'TKM', name: 'Turkmenistan' },
  TV: { alpha3: 'TUV', name: 'Tuvalu' },
  UG: { alpha3: 'UGA', name: 'Uganda' },
  UA: { alpha3: 'UKR', name: 'Ukraine' },
  AE: { alpha3: 'ARE', name: 'United Arab Emirates' },
  GB: { alpha3: 'GBR', name: 'United Kingdom' },
  US: { alpha3: 'USA', name: 'United States' },
  UY: { alpha3: 'URY', name: 'Uruguay' },
  UZ: { alpha3: 'UZB', name: 'Uzbekistan' },
  VU: { alpha3: 'VUT', name: 'Vanuatu' },
  VA: { alpha3: 'VAT', name: 'Vatican City' },
  VE: { alpha3: 'VEN', name: 'Venezuela' },
  VN: { alpha3: 'VNM', name: 'Vietnam' },
  YE: { alpha3: 'YEM', name: 'Yemen' },
  ZM: { alpha3: 'ZMB', name: 'Zambia' },
  ZW: { alpha3: 'ZWE', name: 'Zimbabwe' },
};

// Language code → associated country code (for flag/label display)
// Maps ISO 639-1 language codes to the primary ISO 3166-1 country
const LANG_TO_COUNTRY = {
  en: 'GB',
  sv: 'SE',
  fr: 'FR',
  fi: 'FI',
  da: 'DK',
  de: 'DE',
  no: 'NO',
  nb: 'NO',
  nn: 'NO',
  es: 'ES',
  it: 'IT',
  pt: 'PT',
  nl: 'NL',
  pl: 'PL',
  cs: 'CZ',
  sk: 'SK',
  hu: 'HU',
  ro: 'RO',
  bg: 'BG',
  hr: 'HR',
  sl: 'SI',
  et: 'EE',
  lv: 'LV',
  lt: 'LT',
  el: 'GR',
  tr: 'TR',
  uk: 'UA',
  ru: 'RU',
  ja: 'JP',
  zh: 'CN',
  ko: 'KR',
  ar: 'SA',
};

// Build reverse lookup: alpha-3 → alpha-2
const _alpha3ToAlpha2 = {};
for (const [a2, info] of Object.entries(ISO3166_COUNTRIES)) {
  _alpha3ToAlpha2[info.alpha3] = a2;
}

/**
 * Convert a country code between alpha-2 and alpha-3 formats.
 * @param {string} code  - alpha-2 or alpha-3 country code
 * @param {string} format - 'alpha2' or 'alpha3'
 * @returns {string} the code in the requested format, or the input unchanged if not found
 */
function countryCode(code, format) {
  if (!code) return code;
  const upper = code.toUpperCase();
  if (format === 'alpha3') {
    const entry = ISO3166_COUNTRIES[upper];
    return entry ? entry.alpha3 : upper;
  }
  // format === 'alpha2' or default
  if (ISO3166_COUNTRIES[upper]) return upper; // already alpha-2
  return _alpha3ToAlpha2[upper] || upper;
}

/**
 * Get the display abbreviation for a country code, respecting the user's format preference.
 * @param {string} alpha2Code - ISO 3166-1 alpha-2 code (e.g. 'SE')
 * @returns {string} abbreviation in the user's preferred format
 */
function countryAbbr(alpha2Code) {
  const fmt = (state.preferences && state.preferences.country_code_format) || 'alpha2';
  return countryCode(alpha2Code, fmt);
}

/**
 * Get the display abbreviation for a language code, using its associated country.
 * @param {string} langCode - ISO 639-1 language code (e.g. 'en', 'sv')
 * @returns {string} abbreviation in the user's preferred format
 */
function langAbbr(langCode) {
  const country = LANG_TO_COUNTRY[(langCode || '').toLowerCase()];
  if (!country) return (langCode || '').toUpperCase();
  return countryAbbr(country);
}

/**
 * Get the full country name for a code (alpha-2 or alpha-3).
 * @param {string} code - country code
 * @returns {string} full country name, or the code if not found
 */
function countryName(code) {
  if (!code) return '';
  const upper = code.toUpperCase();
  if (ISO3166_COUNTRIES[upper]) return ISO3166_COUNTRIES[upper].name;
  const a2 = _alpha3ToAlpha2[upper];
  return a2 ? ISO3166_COUNTRIES[a2].name : upper;
}
