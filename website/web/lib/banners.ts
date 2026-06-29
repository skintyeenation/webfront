// Custom banners — a small, data-driven feature for awareness/commemoration (and any other)
// highlights shown on the home page between News and Notifications. Each banner has a title,
// optional subheading, an image OR an icon, a description, and an optional date. Add/edit
// entries here; the CustomBanners component renders them as news-style cards.
export type Banner = {
  title: string;
  subheading?: string;
  description: string;
  image?: string; // path under /public (takes precedence over icon)
  icon?: string; // emoji/glyph shown when there's no image
  date?: string; // optional
  href?: string; // optional outbound link
  fit?: 'cover' | 'contain'; // how the image sits in the card header (default cover)
  bg?: string; // header background (for 'contain' images, fills the letterbox seamlessly)
};

export const CUSTOM_BANNERS: Banner[] = [
  {
    title: 'Orange Shirt Day',
    subheading: 'Every Child Matters',
    date: 'September 30',
    image: '/img/banners/orange-shirt.svg',
    href: 'https://orangeshirtday.org/',
    description:
      'Honouring residential school survivors and the children who never came home. Phyllis Webstad’s orange shirt — taken from her on her first day at school — became a symbol of the loss of identity and culture, and a promise that every child matters.',
  },
  {
    title: 'Moose Hide Campaign',
    subheading: 'Standing against violence',
    image: '/img/banners/moose-hide.png',
    fit: 'contain',
    bg: '#d2aa67',
    href: 'https://moosehidecampaign.ca/',
    description:
      'A movement to end violence against women and children. Wearing a moose hide pin is a commitment to safer communities — sparking conversation, raising awareness, and calling on everyone, especially men and boys, to take a stand.',
  },
  {
    title: 'Red Dress Day',
    subheading: 'MMIWG2S Awareness',
    date: 'May 5',
    image: '/img/banners/red-dress.svg',
    href: 'https://www.rcaanc-cirnac.gc.ca/eng/1448633299414/1534526892399',
    description:
      'In honour of Missing and Murdered Indigenous Women, Girls, and Two-Spirit People. We remember. We honour. We stand for justice.',
  },
];
