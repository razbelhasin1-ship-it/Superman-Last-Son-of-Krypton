/**
 * Daily Planet front page generator (pause screen, results cards). Pure + seeded.
 * Tone follows the run (spec 11.2): high collateral makes the paper cautious, hope makes it glow,
 * nothing yet makes it wonder who the flying man is. Original copy only.
 */
import { Rng } from '../core/rng.ts';

export interface PaperState {
  /** In-game day number (1-based) and hour (0..24). */
  day: number;
  hour: number;
  hope: number;
  collateral: number;
  saves: number;
  booms: number;
  /** m/s */
  topSpeed: number;
  distanceKm: number;
  discoveries: number;
  /** Most recent first. */
  incidents: { headline: string; saved: number }[];
}

export type PaperTone = 'mystery' | 'hopeful' | 'cautious' | 'mixed';

export interface FrontPage {
  tone: PaperTone;
  headline: string;
  deck: string;
  briefs: string[];
  dateline: string;
}

const LEADS: Record<PaperTone, string[]> = {
  mystery: [
    'WHO IS THE FLYING MAN?',
    'A MAN IN THE SKY OVER METROPOLIS',
    'CITY LOOKS UP: STRANGER SOARS ABOVE SKYLINE',
    'NOT A BIRD, NOT A PLANE',
  ],
  hopeful: [
    'METROPOLIS HAS A GUARDIAN',
    'THE CITY BREATHES EASIER',
    'HOPE TAKES FLIGHT',
    'A FRIEND IN THE SKY',
  ],
  cautious: [
    'WINDOWS RATTLE AS FLIER BREAKS SOUND BARRIER',
    'HERO OR HAZARD? COUNCIL ASKS FOR CARE',
    'BOOMS OVER DOWNTOWN LEAVE CITY ON EDGE',
    'POWER WITHOUT CAUTION?',
  ],
  mixed: [
    'SKYBORNE RESCUER DIVIDES OPINION',
    'THANKS — AND A FEW CRACKED WINDOWS',
    'GRATITUDE WITH A SIDE OF SHATTERED GLASS',
  ],
};

const DECKS: Record<PaperTone, string[]> = {
  mystery: [
    'Witnesses describe a figure in blue and red crossing the skyline faster than sound.',
    'Pilots, commuters and one very surprised pigeon-feeder report the same thing: a man, flying.',
  ],
  hopeful: [
    'Rescuers, neighbours and strangers alike describe a quiet, kind presence who never stays for thanks.',
    'From the harbour to Uptown, people are pointing at the sky — and smiling.',
  ],
  cautious: [
    'Residents ask the city’s new protector to keep his sonic booms above the clouds.',
    'Insurers report a spike in claims for broken glass; officials urge a lighter touch.',
  ],
  mixed: [
    'He saves the day, then the windows pay. Readers write in by the thousand.',
    'Grateful survivors and grumbling glaziers share the letters page.',
  ],
};

function clock(hour: number): string {
  const h = ((Math.floor(hour) % 24) + 24) % 24;
  const m = Math.floor((hour - Math.floor(hour)) * 60 + 1e-6);
  const ap = h < 12 ? 'AM' : 'PM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, '0')} ${ap}`;
}

export function toneOf(s: PaperState): PaperTone {
  const deeds = s.hope + s.collateral + s.saves + s.booms;
  if (deeds < 1) return 'mystery';
  if (s.collateral >= 12 && s.collateral > s.hope * 0.8) return 'cautious';
  if (s.collateral >= 6 && s.collateral > s.hope * 0.35) return 'mixed';
  return s.hope > 0 || s.saves > 0 ? 'hopeful' : 'mystery';
}

export function frontPage(s: PaperState, seed: number): FrontPage {
  const rng = new Rng(`paper-${seed}-${s.day}-${Math.round(s.hope)}-${Math.round(s.collateral)}-${s.saves}`);
  const tone = toneOf(s);
  const latest = s.incidents[0];
  const headline = latest ? latest.headline : rng.pick(LEADS[tone]);
  const deck = latest
    ? `${latest.saved} ${latest.saved === 1 ? 'person' : 'people'} safe tonight. ${rng.pick(DECKS[tone === 'mystery' ? 'hopeful' : tone])}`
    : rng.pick(DECKS[tone]);
  const briefs: string[] = [];
  if (s.topSpeed > 343) briefs.push(`RADAR CLOCKS FLIER AT MACH ${(s.topSpeed / 343).toFixed(1)}`);
  else if (s.topSpeed > 30) briefs.push(`SPOTTED CRUISING AT ${Math.round(s.topSpeed * 3.6)} KM/H`);
  if (s.distanceKm >= 1) briefs.push(`${Math.round(s.distanceKm).toLocaleString('en-US')} KM FLOWN OVER THE CITY`);
  if (s.saves > 0) briefs.push(`${s.saves} RESCUE${s.saves === 1 ? '' : 'S'} CONFIRMED BY CITY HALL`);
  if (s.discoveries > 0) briefs.push(`SEEN OVER ${s.discoveries} LANDMARK${s.discoveries === 1 ? '' : 'S'}`);
  if (s.booms > 0) briefs.push(`${s.booms} SONIC BOOM${s.booms === 1 ? '' : 'S'} REPORTED`);
  for (const inc of s.incidents.slice(1, 3)) briefs.push(inc.headline);
  if (briefs.length === 0) briefs.push('WEATHER: CLEAR SKIES, LIGHT WINDS ALOFT');
  const dateline = `METROPOLIS · DAY ${s.day} · ${clock(s.hour)}`;
  return { tone, headline, deck, briefs: briefs.slice(0, 4), dateline };
}
