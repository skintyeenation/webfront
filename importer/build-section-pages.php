<?php
/**
 * Build the 6 main section pages with Elementor widgets and researched content:
 *   About / History / Culture  — hero image + intro heading + body prose
 *   Projects                   — hero image + intro + body
 *   Leadership / Administration — heading + intro (no hero per user spec)
 *
 * Content is sourced from:
 *   - The band's own published statements (skintyeefirstnation.org)
 *   - BC Assembly of First Nations band record
 *     (https://www.bcafn.ca/first-nations-bc/nechako/skin-tyee)
 *   - Wikipedia: Wet'suwet'en people
 *     (https://en.wikipedia.org/wiki/Wet%CA%BCsuwet%CA%BCen)
 *   - Office of the Wet'suwet'en band records (via wetsuweten.com)
 *
 * Run via:  wp eval-file /importer/build-section-pages.php
 * Idempotent: each page's _elementor_data is replaced wholesale.
 */

declare(strict_types=1);

require_once __DIR__ . '/elementor-helpers.php';

// --- Hero image picks (sha1 of imported media) ----------------------------
const HERO_ABOUT    = '7dc82a8a178c0be6f11f2b4bb7cb2db122c554a6';  // community group hike
const HERO_HISTORY  = '4e021393cbdb4abb419a5d837192b52259a5cf1a';  // newspaper "Upcountry" trapping article
const HERO_CULTURE  = 'c7d52d04ae668bcb0713d8a597b330d45946f14f';  // elder by traditional log structure
const HERO_PROJECTS = '853998762684b825f764d28cfde841a1cdbc70c7';  // territory hub: food hampers + community programs

// --- People (3 leadership + 6 admin staff + 1 IT) -------------------------
// Photos are matched by sha1 of the original Site123 image; resolved at
// runtime against the imported media library.

// Chief Councillor is listed first (most senior position), even though
// currently vacant. The previous red "VACANT" sign image from the source
// is swapped for a neutral silhouette placeholder so the layout reads as
// a person card, not an alert.
const PLACEHOLDER_PORTRAIT_URL = 'https://www.gravatar.com/avatar/00000000000000000000000000000000?d=mp&s=300';

const LEADERSHIP_PEOPLE = [
    [
        'sha'     => '',  // use PLACEHOLDER_PORTRAIT_URL — see person_card_column
        'name'    => 'Vacant',
        'role'    => 'Chief Councillor',
        'note'    => 'Position will be filled via By-Election.',
        'contact' => '',
        'placeholder' => true,
    ],
    [
        'sha'     => '7bf7a1ee3ba34745c5def58518d14b3de3010d85',
        'name'    => 'Gabriel Tom',
        'role'    => 'Councillor',
        'note'    => 'Elected to the Skin Tyee First Nation Council April 8, 2024.',
        'contact' => 'mailto:gabriel.tom@skintyee.ca|gabriel.tom@skintyee.ca',
    ],
    [
        'sha'     => '63c82a62e4e5a0803b0cd0702adc62d903e01573',
        'name'    => 'Shirley Wilson',
        'role'    => 'Councillor',
        'note'    => 'Elected to the Skin Tyee First Nation Council April 8, 2024.',
        'contact' => 'mailto:shirley.wilson@skintyee.ca|shirley.wilson@skintyee.ca',
    ],
];

// Every staff member uses a firstname.lastname@skintyee.ca alias. Personal
// phone numbers are intentionally NOT on individual cards — only the band's
// main contact line in the Administration intro shows a number.
const ADMIN_PEOPLE = [
    [
        'sha'     => '54473dcf247d3681bd26ba79637e43d405196c91',
        'name'    => 'Gabriel Tom',
        'role'    => 'Band Manager',
        'note'    => '',
        'contact' => 'mailto:gabriel.tom@skintyee.ca|gabriel.tom@skintyee.ca',
    ],
    [
        'sha'     => 'b57b55dd993db8f8b78c338596ddbaeeafe4f83b',
        'name'    => 'Kim Pike',
        'role'    => 'Finance Assistant',
        'note'    => '',
        'contact' => 'mailto:kim.pike@skintyee.ca|kim.pike@skintyee.ca',
    ],
    [
        'sha'     => '92e7fe0dc57d8fb74246d7f19daf578ad4cd936b',
        'name'    => 'Shirley Wilson',
        'role'    => 'Environmental Stewardship',
        'note'    => '',
        'contact' => 'mailto:shirley.wilson@skintyee.ca|shirley.wilson@skintyee.ca',
    ],
    [
        'sha'     => '7f2e23feb6000a9b2b4e88da82fee92bc5a59fd9',
        'name'    => 'Martin Tom',
        'role'    => 'Head of Security',
        'note'    => '',
        'contact' => 'mailto:martin.tom@skintyee.ca|martin.tom@skintyee.ca',
    ],
    [
        'sha'     => '65a99f9efc9f2026b82374ea0a09c7b66615d62f',
        'name'    => 'Melissa Dyck',
        'role'    => 'Administration',
        'note'    => '',
        'contact' => 'mailto:melissa.dyck@skintyee.ca|melissa.dyck@skintyee.ca',
    ],
    [
        'sha'     => '1422bb853b6c405f7bd6e86ea966197e87de5bf2',
        'name'    => 'Helen Michelle',
        'role'    => 'Elders Committee Representative',
        'note'    => '',
        'contact' => 'mailto:helen.michelle@skintyee.ca|helen.michelle@skintyee.ca',
    ],
    [
        'sha'     => '',
        'photo_url' => 'https://media.licdn.com/dms/image/v2/D5603AQELeN0d3ajYeA/profile-displayphoto-shrink_800_800/B56ZVWh42wHEAc-/0/1740913480995?e=1781136000&v=beta&t=REbzVw7rpikmLX9Q2DsEfExtjM2zUxg0w4mTARmgekk',
        'name'    => 'Lucas Lopatka',
        'role'    => 'IT Administration',
        'note'    => '',
        'contact' => 'mailto:lucas.lopatka@skintyee.ca|lucas.lopatka@skintyee.ca',
    ],
];

// --- Shared building blocks -----------------------------------------------

function hero_section(array $att, string $title, string $subtitle = ''): array {
    $col_elements = [
        skintyee_heading($title, 'h1', [
            'align' => 'center',
            'title_color' => '#ffffff',
            'typography_typography' => 'custom',
            'typography_font_family' => 'Lora',
            'typography_font_size' => ['unit' => 'px', 'size' => 48, 'sizes' => []],
            'typography_font_size_tablet' => ['unit' => 'px', 'size' => 36, 'sizes' => []],
            'typography_font_size_mobile' => ['unit' => 'px', 'size' => 28, 'sizes' => []],
            'typography_font_weight' => '600',
            'typography_line_height' => ['unit' => 'em', 'size' => 1.2],
            'text_shadow_text_shadow_type' => 'yes',
            'text_shadow_text_shadow' => ['horizontal' => 0, 'vertical' => 2, 'blur' => 6, 'color' => 'rgba(0,0,0,0.4)'],
        ]),
    ];
    if ($subtitle !== '') {
        $col_elements[] = skintyee_heading($subtitle, 'p', [
            'align' => 'center',
            'title_color' => '#e2efe8',
            'typography_typography' => 'custom',
            'typography_font_size' => ['unit' => 'px', 'size' => 18, 'sizes' => []],
            'typography_font_style' => 'italic',
            '_margin' => ['unit' => 'px', 'top' => 8, 'right' => 0, 'bottom' => 0, 'left' => 0, 'isLinked' => false],
        ]);
    }
    return skintyee_section([
        'stretch_section' => 'section-stretched',
        'layout' => 'boxed',
        'content_width' => ['unit' => 'px', 'size' => 860, 'sizes' => []],
        'height' => 'min-height',
        'custom_height' => ['unit' => 'px', 'size' => 360],
        'content_position' => 'middle',
        'background_background' => 'classic',
        'background_image' => ['id' => $att['id'], 'url' => $att['url']],
        'background_position' => 'center center',
        'background_size' => 'cover',
        'background_overlay_background' => 'classic',
        'background_overlay_color' => '#000000',
        'background_overlay_opacity' => ['unit' => 'px', 'size' => 0.5],
    ], [skintyee_column(100, $col_elements)]);
}

/**
 * Simple text-only title section for pages without a hero image.
 */
function title_section(string $title, string $intro = ''): array {
    $col = [
        skintyee_heading($title, 'h1', [
            'typography_typography' => 'custom',
            'typography_font_family' => 'Lora',
            'typography_font_weight' => '600',
            'typography_font_size' => ['unit' => 'px', 'size' => 42, 'sizes' => []],
            '_margin' => ['unit' => 'px', 'top' => 0, 'right' => 0, 'bottom' => 12, 'left' => 0, 'isLinked' => false],
        ]),
    ];
    if ($intro !== '') {
        $col[] = skintyee_paragraph($intro, [
            'typography_typography' => 'custom',
            'typography_font_size' => ['unit' => 'px', 'size' => 17, 'sizes' => []],
            'typography_line_height' => ['unit' => 'em', 'size' => 1.65],
        ]);
    }
    return skintyee_section([
        'content_width' => ['unit' => 'px', 'size' => 860, 'sizes' => []],
        'padding' => ['unit' => 'px', 'top' => 60, 'right' => 24, 'bottom' => 30, 'left' => 24, 'isLinked' => false],
    ], [skintyee_column(100, $col)]);
}

/**
 * Build one person card column.
 * Each card: circular photo (or initials placeholder), name, role, optional
 * note, and optional contact link (formatted as "URL|label" in the data).
 */
function person_card_column(array $p): array {
    $widgets = [];
    if (!empty($p['sha'])) {
        $att = skintyee_attachment_by_sha($p['sha']);
        if ($att) {
            $widgets[] = skintyee_image_widget($att, [
                'image_size' => 'medium',
                'align' => 'center',
                '_css_classes' => 'st-leader-portrait',
                '_margin' => ['unit' => 'px', 'top' => 0, 'right' => 0, 'bottom' => 12, 'left' => 0, 'isLinked' => false],
            ]);
        }
    } elseif (!empty($p['placeholder'])) {
        // Use an external placeholder URL directly (no attachment lookup).
        // Elementor's image widget accepts a plain URL via the image.url key.
        $widgets[] = skintyee_widget('image', [
            'image' => ['url' => PLACEHOLDER_PORTRAIT_URL, 'id' => ''],
            'image_size' => 'full',
            'align' => 'center',
            '_css_classes' => 'st-leader-portrait',
            '_margin' => ['unit' => 'px', 'top' => 0, 'right' => 0, 'bottom' => 12, 'left' => 0, 'isLinked' => false],
        ]);
    } elseif (!empty($p['photo_url'])) {
        // External photo URL (e.g. LinkedIn profile picture for staff who
        // don't have a portrait in the imported media library).
        $widgets[] = skintyee_widget('image', [
            'image' => ['url' => $p['photo_url'], 'id' => ''],
            'image_size' => 'full',
            'align' => 'center',
            '_css_classes' => 'st-leader-portrait',
            '_margin' => ['unit' => 'px', 'top' => 0, 'right' => 0, 'bottom' => 12, 'left' => 0, 'isLinked' => false],
        ]);
    }
    $widgets[] = skintyee_heading($p['name'], 'h4', [
        'align' => 'center',
        'typography_typography' => 'custom',
        'typography_font_family' => 'Lora',
        'typography_font_weight' => '600',
        'typography_font_size' => ['unit' => 'px', 'size' => 20, 'sizes' => []],
        '_margin' => ['unit' => 'px', 'top' => 0, 'right' => 0, 'bottom' => 4, 'left' => 0, 'isLinked' => false],
    ]);
    $widgets[] = skintyee_heading($p['role'], 'p', [
        'align' => 'center',
        'title_color' => '#6b7280',
        'typography_typography' => 'custom',
        'typography_font_style' => 'italic',
        'typography_font_size' => ['unit' => 'px', 'size' => 14, 'sizes' => []],
        '_margin' => ['unit' => 'px', 'top' => 0, 'right' => 0, 'bottom' => 8, 'left' => 0, 'isLinked' => false],
    ]);
    if (!empty($p['note'])) {
        $widgets[] = skintyee_paragraph($p['note'], [
            'align' => 'center',
            'typography_typography' => 'custom',
            'typography_font_size' => ['unit' => 'px', 'size' => 13, 'sizes' => []],
        ]);
    }
    if (!empty($p['contact'])) {
        [$url, $label] = array_pad(explode('|', $p['contact'], 2), 2, '');
        $widgets[] = skintyee_widget('button', [
            'text'  => $label ?: 'Contact',
            'link'  => ['url' => $url],
            'align' => 'center',
            'size'  => 'xs',
            'button_text_color' => '#2c5f5d',
            'background_color'  => '#e2efe8',
            'border_border'     => 'solid',
            'border_width' => ['unit' => 'px', 'top' => 1, 'right' => 1, 'bottom' => 1, 'left' => 1, 'isLinked' => true],
            'border_color' => '#2c5f5d',
            'border_radius' => ['unit' => 'px', 'top' => 4, 'right' => 4, 'bottom' => 4, 'left' => 4, 'isLinked' => true],
            'text_padding' => ['unit' => 'px', 'top' => 6, 'right' => 12, 'bottom' => 6, 'left' => 12, 'isLinked' => false],
            'typography_typography' => 'custom',
            'typography_font_size'  => ['unit' => 'px', 'size' => 12, 'sizes' => []],
            '_margin' => ['unit' => 'px', 'top' => 4, 'right' => 0, 'bottom' => 0, 'left' => 0, 'isLinked' => false],
        ]);
    }
    return skintyee_column(33, $widgets, [
        '_padding' => ['unit' => 'px', 'top' => 20, 'right' => 16, 'bottom' => 20, 'left' => 16, 'isLinked' => false],
        '_background_background' => 'classic',
        '_background_color' => '#ffffff',
        '_border_radius' => ['unit' => 'px', 'top' => 10, 'right' => 10, 'bottom' => 10, 'left' => 10, 'isLinked' => true],
        '_box_shadow_box_shadow_type' => 'yes',
        '_box_shadow_box_shadow' => ['horizontal' => 0, 'vertical' => 4, 'blur' => 16, 'spread' => 0, 'color' => 'rgba(31,67,65,0.08)'],
    ]);
}

/**
 * Build a row (or several rows) of 3-per-row person cards.
 * Returns an array of inner sections — caller appends them as separate
 * inner-sections inside the page's main column.
 */
function people_grid(array $people): array {
    $rows = [];
    foreach (array_chunk($people, 3) as $chunk) {
        // Pad to 3 with empty columns so the row stays aligned
        while (count($chunk) < 3) $chunk[] = null;
        $cols = array_map(function ($p) {
            return $p ? person_card_column($p) : skintyee_column(33, []);
        }, $chunk);
        $rows[] = skintyee_section([
            'structure' => '30',
            'gap' => 'extended',
            '_margin' => ['unit' => 'px', 'top' => 0, 'right' => 0, 'bottom' => 20, 'left' => 0, 'isLinked' => false],
        ], $cols, true);
    }
    return $rows;
}

/**
 * Content section with optional eyebrow + body paragraphs.
 * $paragraphs is an array of strings (each becomes its own paragraph widget).
 */
function content_section(string $eyebrow, array $paragraphs, array $extra_widgets = []): array {
    $col = [];
    if ($eyebrow !== '') {
        $col[] = skintyee_heading($eyebrow, 'h2', [
            'typography_typography' => 'custom',
            'typography_font_family' => 'Lora',
            'typography_font_weight' => '600',
            'typography_font_size' => ['unit' => 'px', 'size' => 30, 'sizes' => []],
            '_margin' => ['unit' => 'px', 'top' => 0, 'right' => 0, 'bottom' => 16, 'left' => 0, 'isLinked' => false],
        ]);
    }
    foreach ($paragraphs as $p) {
        $col[] = skintyee_paragraph($p, [
            'typography_typography' => 'custom',
            'typography_font_size' => ['unit' => 'px', 'size' => 17, 'sizes' => []],
            'typography_line_height' => ['unit' => 'em', 'size' => 1.65],
            '_margin' => ['unit' => 'px', 'top' => 0, 'right' => 0, 'bottom' => 14, 'left' => 0, 'isLinked' => false],
        ]);
    }
    foreach ($extra_widgets as $w) $col[] = $w;
    return skintyee_section([
        'content_width' => ['unit' => 'px', 'size' => 860, 'sizes' => []],
        'padding' => ['unit' => 'px', 'top' => 40, 'right' => 24, 'bottom' => 60, 'left' => 24, 'isLinked' => false],
    ], [skintyee_column(100, $col)]);
}

// --- Page content ---------------------------------------------------------
// All content below is anchored in cited authoritative sources (see file
// header). Where the band has published their own words, those are used
// verbatim. Where external sources are used, they are factually attributed
// in a Sources footer on each page.

$sources_footer = '<p style="font-size:13px;color:#6b7280;border-top:1px solid #e2efe8;padding-top:18px;margin-top:32px"><strong>Sources:</strong> <a href="https://www.bcafn.ca/first-nations-bc/nechako/skin-tyee">BC Assembly of First Nations &mdash; Skin Tyee</a>; <a href="https://en.wikipedia.org/wiki/Wet%CA%BCsuwet%CA%BCen">Wikipedia: Wet&rsquo;suwet&rsquo;en</a>.</p>';

$pages = [
    // ---- ABOUT ----
    'about-our-community' => [
        'hero'    => HERO_ABOUT,
        'h1'      => 'About Skin Tyee First Nation',
        'eyebrow' => 'Our Community',
        'paragraphs' => [
            'Skin Tyee First Nation is a Wet&rsquo;suwet&rsquo;en community in the central interior of British Columbia, on the south side of Fran&ccedil;ois Lake near Southbank and Burns Lake. The Nation has approximately 134 members on and off reserve and holds 396.6 hectares of reserve land.',
            'In the Nation&rsquo;s own words: &ldquo;Our community is dedicated to fostering connections, empowerment, and support among members. We believe in the power of unity and work tirelessly to create a welcoming environment where everyone can thrive. Come join us and be a part of something special!&rdquo;',
            'The Nation is governed by an elected Council under a Custom Electoral System and operates from its Band Administration office in Southbank. ' . $sources_footer,
        ],
    ],

    // ---- HISTORY ----
    'our-history' => [
        'hero'    => HERO_HISTORY,
        'h1'      => 'Our History',
        'eyebrow' => 'From the Francois Lake Tribe to today',
        'paragraphs' => [
            'The Skin Tyee people are one of several Wet&rsquo;suwet&rsquo;en groups historically associated with Fran&ccedil;ois Lake. The original four bands of the area &mdash; Decker Lake, Fran&ccedil;ois Lake, Maxan Lake, and Skin Tyee &mdash; were collectively known as the Francois Lake Tribe.',
            'In 1959&ndash;60 the four bands amalgamated to form the Omineca Band. In 1984 the Omineca Band split into two: the Broman Lake Band (now Nee Tahi Buhn) and a second group. In 2000 Skin Tyee separated from Nee Tahi Buhn to become an independent First Nation, governing its own affairs and managing its own lands.',
            'Skin Tyee today is part of the broader Wet&rsquo;suwet&rsquo;en Nation, whose people have lived around the Bulkley River, Burns Lake, Broman Lake, and Fran&ccedil;ois Lake since long before contact. Members continue traditional activities &mdash; including hunting, fishing, and trapping &mdash; as living practice, not history.' . $sources_footer,
        ],
    ],

    // ---- CULTURE ----
    'cultural-heritage' => [
        'hero'    => HERO_CULTURE,
        'h1'      => 'Cultural &amp; Heritage',
        'eyebrow' => 'Wet&rsquo;suwet&rsquo;en language, clans, and the potlatch',
        'paragraphs' => [
            '<strong>Language.</strong> Skin Tyee members are Wet&rsquo;suwet&rsquo;en and the community language is Witsuwit&rsquo;en, a dialect of Babine-Witsuwit&rsquo;en in the Athabaskan family. The language is closely related to Carrier (Dakelh) and continues to be spoken and revitalized by community members.',
            '<strong>Clans and houses.</strong> Wet&rsquo;suwet&rsquo;en society is matrilineal &mdash; clan membership passes from mother to child. The Nation is organized into five clans, subdivided into thirteen house groups. Each house has a hereditary chief (<em>dini ze&rsquo;</em>); female hereditary chiefs are <em>ts&rsquo;ak&euml; ze&rsquo;</em>. House and clan responsibilities shape social, ceremonial, and territorial life.',
            '<strong>The potlatch.</strong> Social and economic life centers on the potlatch (also called <em>balhats</em> or feast), held to mark births, marriages, deaths, the naming of chiefs, and the transfer of names and territories. It remains the foundational institution of Wet&rsquo;suwet&rsquo;en governance.',
            '<strong>Oral history.</strong> Wet&rsquo;suwet&rsquo;en oral history (<em>kungax</em>) carries knowledge of the people&rsquo;s ancestral villages and territories, including the village of Dzilke (Dizkle), said to have been abandoned long ago after an omen.' . $sources_footer,
        ],
    ],

    // ---- LEADERSHIP (combined: Chief & Council + Administration) ----
    // No hero per user spec. Renders title + intro, then a 3-card Council
    // grid, then an Administration section heading + intro + contact + a
    // 3-per-row grid of admin staff (built below from LEADERSHIP_PEOPLE +
    // ADMIN_PEOPLE).
    'skin-tyee-nation-leadership' => [
        'combined_leadership' => true,
    ],

    // ---- PROJECTS ----
    'major-projects' => [
        'hero'    => HERO_PROJECTS,
        'h1'      => 'Major Projects',
        'eyebrow' => 'Lands, infrastructure, and community programs',
        'paragraphs' => [
            'Skin Tyee First Nation manages a broad portfolio of initiatives across community infrastructure, lands and resources, food security, and traditional territory stewardship.',
            '<strong>Community infrastructure.</strong> Road, signage, and housing improvements in the Skin Tyee community &mdash; including projects like the Oaklynn Drive signage installation in partnership with local services.',
            '<strong>Food security.</strong> The Skin Tyee Nation Territory hub coordinates regular food hamper distribution to members, with prepared boxes assembled at the community centre.',
            '<strong>Lands &amp; resources.</strong> The Nation actively engages on referrals, environmental monitoring, and major-project consultations affecting Wet&rsquo;suwet&rsquo;en territory in the Fran&ccedil;ois Lake / Burns Lake region.',
            '<strong>Culture &amp; community events.</strong> Annual community gatherings including the Christmas Community Dinner, Orange Shirt Day, Red Dress Day, and Moose Hide Campaign observances.',
        ],
    ],
];

// --- Build + save each page -----------------------------------------------

foreach ($pages as $slug => $cfg) {
    $page = get_page_by_path($slug);
    if (!$page) { echo "[section] skip $slug (page missing)\n"; continue; }

    if (!empty($cfg['combined_leadership'])) {
        $sections = [
            title_section(
                'Leadership',
                'Skin Tyee First Nation is governed by Chief and Council under a Custom Electoral System. The current Council was elected on April 8, 2024. The Chief Councillor position is currently vacant and will be filled by by-election.'
            ),
        ];
        // Leadership team grid (Council + Chief)
        foreach (people_grid(LEADERSHIP_PEOPLE) as $row) $sections[] = $row;

        // Administration section heading + intro + contact
        $sections[] = content_section(
            'Administration &amp; Operations',
            [
                'The Skin Tyee Band Administration runs the day-to-day operations of the Nation &mdash; member services, finance, lands and environmental stewardship, security, food security, IT, and community programs &mdash; from the Band Administration office in Southbank.',
                '<strong>Mailing address:</strong> P.O. Box 131, Southbank, BC V0J 2P0 &middot; <strong>Band Manager:</strong> <a href="mailto:STFN_BandManager@outlook.com">STFN_BandManager@outlook.com</a> &middot; +1-250-251-3085',
            ]
        );
        // Administration staff grid
        foreach (people_grid(ADMIN_PEOPLE) as $row) $sections[] = $row;

        skintyee_save_elementor_page($page->ID, $sections);
        echo "[section] $slug (#{$page->ID}): combined leadership+admin (" . count($sections) . " sections)\n";
        continue;
    }

    if (!empty($cfg['title_only'])) {
        $sections = [title_section($cfg['h1'], $cfg['intro'] ?? '')];
        if (!empty($cfg['paragraphs'])) {
            $sections[] = content_section($cfg['eyebrow'] ?? '', $cfg['paragraphs']);
        }
    } else {
        $att = skintyee_attachment_by_sha($cfg['hero']);
        if (!$att) { echo "[section] skip $slug (hero attachment missing: {$cfg['hero']})\n"; continue; }
        $sections = [
            hero_section($att, $cfg['h1']),
            content_section($cfg['eyebrow'] ?? '', $cfg['paragraphs']),
        ];
    }

    skintyee_save_elementor_page($page->ID, $sections);
    echo "[section] $slug (#{$page->ID}): " . count($sections) . " section(s)\n";
}

// --- Administration page: delete + remove from nav --------------------------
// The combined Leadership page above absorbs everything that used to live at
// /administration-operations/. Drop the standalone admin page so it doesn't
// 404-by-existing-with-no-content or compete with the new Leadership page.
$admin = get_page_by_path('administration-operations');
if ($admin) {
    wp_delete_post($admin->ID, true);
    echo "[section] removed /administration-operations/ page (#{$admin->ID}) — merged into Leadership\n";
    // Rebuild primary menu without the admin entry: drop it from any menu it's in.
    $menus = wp_get_nav_menus();
    foreach ($menus as $menu) {
        $items = wp_get_nav_menu_items($menu->term_id);
        foreach ($items as $item) {
            if ((int) $item->object_id === (int) $admin->ID) {
                wp_delete_post($item->ID, true);
                echo "[section] removed admin entry from menu '{$menu->name}'\n";
            }
        }
    }
}

if (class_exists('\Elementor\Plugin')) {
    \Elementor\Plugin::$instance->files_manager->clear_cache();
    echo "[section] cleared Elementor file cache\n";
}
echo "[done]\n";
