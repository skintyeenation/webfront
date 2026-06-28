import { fundingByArea } from '@skintyee/models';
import { PROGRAM_AREAS } from './constants';

// The "Funding 101" training course — a plain-language breakdown of the dense ISC
// Program Guide. One intro module + one per program area (only those with real
// programs) + a calendar module.
export interface LearnModule { slug: string; title: string; blurb: string }

const AREAS_WITH_PROGRAMS = PROGRAM_AREAS.filter((a) =>
  fundingByArea(a.slug).some((p) => (p.paw?.length || p.dci?.length || p.requirements?.length)),
);

export const LEARN_MODULES: LearnModule[] = [
  { slug: 'funding-101', title: 'Funding 101', blurb: 'The basics — how federal funding actually works.' },
  ...AREAS_WITH_PROGRAMS.map((a) => ({ slug: a.slug, title: a.name, blurb: a.desc })),
  { slug: 'calendar', title: 'The funding calendar', blurb: 'Every apply + report deadline, in one place.' },
];

export const learnModule = (slug: string) => LEARN_MODULES.find((m) => m.slug === slug);

// Area-module plain-language intros (the "what this area is about" framing on top
// of the structured program cards).
export const AREA_INTRO: Record<string, string> = {
  housing:
    'Housing money is about getting safe homes built, bought, and kept up on reserve. Almost all of it runs through your FNIIP (the community’s capital plan) and the Capital Facilities & Maintenance Program — and the Nation applies, not individual members.',
  education:
    'Education funding follows your students. Most of it is calculated from the Nominal Roll (the October count of eligible students) and covers K-12 instruction, tuition, student supports, and post-secondary sponsorship.',
  'lands-economic-development':
    'This area helps the Nation manage its lands and grow its economy — operating a lands office, planning and pursuing business opportunities, and protecting the environment. It also carries the governance + emergency programs that don’t fit elsewhere.',
  social:
    'Social Development is the safety net — last-resort income assistance, assisted living, and family-violence prevention for people ordinarily resident on reserve, delivered through your Band Social Development Worker.',
  'child-family-services':
    'This area keeps First Nations children safe, supported, and connected to family and culture — prevention and protection services, Jordan’s Principle (products/services a child needs, when they need them), and support for taking on jurisdiction.',
};
