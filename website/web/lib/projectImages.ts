// Small square thumbnail per major project (slug -> Unsplash). Curated/topical,
// visually verified; reused thematically within a sector.
const U = (id: string) => `https://images.unsplash.com/photo-${id}?w=200&h=200&fit=crop&q=70`;

const PROJECT_IMAGES: Record<string, string> = {
  // Oil & Gas
  'coastal-gaslink-benefit': U('1559510981-10719ce4266a'), // pipeline
  'natural-gas-revenue-sharing': U('1653352639753-8debcc830014'), // refinery
  'lng-workforce-training': U('1504328345606-18bbc8c9d7d1'), // welder / trades training
  'pipeline-row-monitoring': U('1473773508845-188df298d2d1'), // aerial right-of-way through forest
  // Minerals & Mining
  'mineral-exploration-agreement': U('1637254019271-1efb74a1009a'), // mountain
  'geoscience-mapping': U('1709489662983-3674d790b224'), // open-pit mine
  'reclamation-standards-review': U('1500382017468-9049fed747ef'), // reclaimed/restored land
  // Housing & Economic Development
  'southbank-housing-development': U('1728344430621-f6b58ef4a108'), // modular home
  'band-owned-enterprise': U('1517048676732-d65bc937f952'), // meeting
  'elder-housing-renovations': U('1626684496076-07e23c6361ff'), // home in the hills
  'community-economic-plan': U('1454165804606-c3d57bc86b40'), // economic planning session
  // Forestry & Conservation
  'community-forest-tenure': U('1634672652995-ee7525bce595'), // lumber
  'salmon-habitat-restoration': U('1616459943793-f4fca51b6647'), // salmon
  'wildfire-fuel-management': U('1615092296061-e2ccfeb2f3d6'), // wildfire
  'caribou-habitat-stewardship': U('1484406566174-9da000fda645'), // cervid in forest
  // Telecommunications
  'rural-broadband-expansion': U('1744679596626-1699b156942f'), // cell tower
  'emergency-communications-upgrade': U('1558494949-ef010cbdcc31'), // network / comms equipment
  'public-wifi-hotspots': U('1606904825846-647eb07f5be2'), // Wi-Fi router
};

export const projectImage = (slug: string): string | undefined => PROJECT_IMAGES[slug];

// Large variant for the full-width sector carousel — the 200px thumbnails look blurry when
// upscaled into a 400px hero, so request the SAME curated photo at 1000×600 (Picsum fallback
// by slug). Same image, just not scaled down — so it stays relevant to the project.
export const projectImageLarge = (slug: string): string =>
  PROJECT_IMAGES[slug]?.replace('w=200&h=200', 'w=1000&h=600') ??
  `https://picsum.photos/seed/${slug}/1000/600`;
