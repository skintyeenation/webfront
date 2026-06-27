// Small square thumbnail per major project (slug -> Unsplash). Curated/topical,
// visually verified; reused thematically within a sector.
const U = (id: string) => `https://images.unsplash.com/photo-${id}?w=200&h=200&fit=crop&q=70`;

const PROJECT_IMAGES: Record<string, string> = {
  // Oil & Gas
  'coastal-gaslink-benefit': U('1559510981-10719ce4266a'), // pipeline
  'natural-gas-revenue-sharing': U('1653352639753-8debcc830014'), // refinery
  'lng-workforce-training': U('1653352639753-8debcc830014'), // refinery
  'pipeline-row-monitoring': U('1559510981-10719ce4266a'), // pipeline
  // Minerals & Mining
  'mineral-exploration-agreement': U('1637254019271-1efb74a1009a'), // mountain
  'geoscience-mapping': U('1709489662983-3674d790b224'), // open-pit mine
  'reclamation-standards-review': U('1709489662983-3674d790b224'), // open-pit mine
  // Housing & Economic Development
  'southbank-housing-development': U('1728344430621-f6b58ef4a108'), // modular home
  'band-owned-enterprise': U('1517048676732-d65bc937f952'), // meeting
  'elder-housing-renovations': U('1626684496076-07e23c6361ff'), // home in the hills
  'community-economic-plan': U('1517048676732-d65bc937f952'), // meeting
  // Forestry & Conservation
  'community-forest-tenure': U('1634672652995-ee7525bce595'), // lumber
  'salmon-habitat-restoration': U('1616459943793-f4fca51b6647'), // salmon
  'wildfire-fuel-management': U('1615092296061-e2ccfeb2f3d6'), // wildfire
  'caribou-habitat-stewardship': U('1634672652995-ee7525bce595'), // forest
  // Telecommunications
  'rural-broadband-expansion': U('1744679596626-1699b156942f'), // cell tower
  'emergency-communications-upgrade': U('1744679596626-1699b156942f'), // cell tower
  'public-wifi-hotspots': U('1744679596626-1699b156942f'), // cell tower
};

export const projectImage = (slug: string): string | undefined => PROJECT_IMAGES[slug];
