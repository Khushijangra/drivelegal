export const synonymMap: Record<string, string[]> = {
  'without wearing helmet': ['protective headgear', 'head protection', 'without wearing helmet', 'riding bareheaded', 'no helmet fine', 'challan for missing helmet', 'two wheeler head gear', 'forgetting to wear helmet', 'pillion without helmet', 'helmet', 'headgear'],
  'drunken driving': ['drunk driving', 'drinking and driving', 'driving under influence', 'alcohol limit', 'intoxicated driving', 'dui penalty', 'dwi fine', 'drunk at the wheel', 'beer and driving', 'breathalyzer fail', 'alcohol', 'drunk', 'drunken', 'intoxicated', 'dui', 'dwi', 'beers', 'beer'],
  'triple riding on two-wheeler': ['triple riding', 'three persons', 'three people', '3 people', 'triple ride', 'three riders', 'carrying two pillions', 'extra passenger', 'tripling', 'extra pillion', '3 persons', 'two pillions', 'two of my friends riding with me', 'three people on one motorcycle'],
  'driving commercial vehicle without badge': ['commercial badge', 'transport badge', 'driving taxi without badge', 'cab driver no badge', 'commercial license badge missing', 'auto rickshaw badge', 'psv badge requirement', 'badge fine', 'badge challan', 'driving transport vehicle without authorization', 'badge'],
  'improper obstructive parking': ['no parking', 'parking violation', 'parked in wrong place', 'wrong parking fine', 'parking on footpath', 'obstructing traffic parking', 'tow away zone', 'parking ticket', 'illegal parking', 'parked incorrectly', 'wrong parking', 'parking'],
  'not wearing seat belt': ['seatbelt', 'safety belt', 'without seat belt', 'driving without seatbelt', 'not wearing seatbelt', 'car seatbelt fine', 'passenger no seatbelt', 'seatbelt challan', 'unbelted driving', 'driver seat belt', 'seat belt'],
  'using mobile phone while driving': ['mobile phone', 'talking on phone', 'using cell phone', 'texting while driving', 'calling while riding', 'phone fine', 'mobile while driving', 'holding phone', 'earphones while driving', 'bluetooth calling driving', 'cell phone'],
  'jumping red light': ['jumping red light', 'traffic signal violation', 'running a red light', 'red signal jump', 'breaking traffic light', 'crossing on red', 'red light challan', 'ignoring stop signal', 'signal jump', 'traffic light fine', 'traffic signal', 'red light', 'stop signal light', 'red signal'],
  'driving unregistered vehicle': ['no rc', 'without registration', 'registration certificate missing', 'driving unregistered vehicle', 'rc book missing', 'vehicle registration fine', 'no papers rc', 'unregistered car', 'invalid rc', 'registration challan', 'valid registration', 'rc', 'registration certificate', 'expired registration', 'rc book', 'fake number plate', 'defective number plate', 'number plate'],
  'driving without valid pollution under control certificate': ['pollution', 'puc certificate', 'modified silencer', 'loud exhaust', 'smoke emission', 'no puc', 'pollution under control missing', 'loud bullet silencer', 'blast silencer', 'emission violation', 'pollution under control', 'puc'],
  'driving without valid insurance': ['valid insurance', 'insurance', 'driving without valid insurance documents', 'no insurance'],
  'altered silencer loud exhaust': ['modified silencer', 'exhaust', 'loud silencer', 'blast', 'loud exhaust'],
  'tinted glass black films': ['sun films', 'tinted windows', 'black film', 'tinted glass'],
  'riding two-wheeler without proper footwear': ['without shoes', 'proper footwear', 'chappals', 'slippers', 'footwear'],
  'overloading of goods vehicle': ['overloaded', 'overloading goods', 'excess weight', 'overloading a goods vehicle penalty'],
  'not giving way to emergency vehicle': ['emergency vehicle', 'fire engine', 'ambulance', 'blocking emergency vehicles like ambulance', 'blocked an ambulance'],
  'underage juvenile driving': ['minor', 'underage driving', 'juvenile', 'underage driving penalty for parents', '17 years old'],
  'driving without rear view mirror': ['rear view mirrors', 'side mirrors', 'without mirrors', 'riding a motorcycle without side mirrors', 'side mirror'],
  'disobeying orders of authorities': ['disobeying traffic police', 'refusing to share documents', 'disobeying orders', 'refusing to show papers', 'refuse to show documents', 'not showing license to cop', 'disobedience of direction', 'refusing to share documents with traffic police'],
  'general violation of any provision of the motor vehicles act': ['learner license l plates', 'not displaying l plates', 'l plate violation', 'general violation', 'no l plates', 'driving on learner license without l plate', 'not displaying L plates for learner license'],
  'exceeding speed limit': ['speeding', 'overspeed', 'overspeeding', 'speed limit', 'fast driving', 'race', 'racing', 'trial of speed'],
  'dangerous or unsafe driving': ['dangerous driving', 'unsafe vehicle', 'dangerously', 'reckless', 'zig-zag', 'dangerous vehicle', 'unsafe condition']
};

function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function expandSynonyms(query: string): string {
  let expanded = query.toLowerCase();
  
  // Find any matching synonyms and append the canonical key
  for (const [canonical, phrases] of Object.entries(synonymMap)) {
    for (const phrase of phrases) {
      const escaped = escapeRegExp(phrase.toLowerCase());
      const regex = new RegExp(`\\b${escaped}\\b`, 'i');
      if (regex.test(expanded) && !expanded.includes(canonical)) {
        expanded += ` ${canonical}`;
        break; // Only append canonical once per category
      }
    }
  }
  
  return expanded;
}
