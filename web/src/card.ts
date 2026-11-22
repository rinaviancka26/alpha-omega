import cardJson from './card.generated.json';

export type Member = { name: string; role: string; worksIn: 'command' | 'workspace' | 'server'; character: string; details: string | null };
export type Card = {
  appName: string; theme: string; artStyle: string; pixelArt: boolean; officeSetting: string;
  uiAccent: string; uiAccentName: string | null; team: Member[]; rooms: Record<string, string>;
};
export const CARD = cardJson as Card;
export const LEAD = CARD.team[0];
export const TEAM_NAMES = CARD.team.map((m) => m.name);
export const memberByName = (n: string) => CARD.team.find((m) => m.name === n);

/** Set the UI accent exactly once, as a CSS variable. */
export function applyAccent() {
  document.documentElement.style.setProperty('--accent', CARD.uiAccent);
}
