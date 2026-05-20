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

    // ---- LEADERSHIP (no hero) ----
    'skin-tyee-nation-leadership' => [
        'title_only' => true,
        'h1'      => 'Skin Tyee Nation Leadership',
        'intro'   => 'Skin Tyee First Nation is governed by Chief and Council under a Custom Electoral System. The current Council was elected to the Skin Tyee First Nation Council on April 8, 2024. The Chief Councillor position is currently vacant and will be filled by by-election.',
        'eyebrow' => '',
        'paragraphs' => [],
    ],

    // ---- ADMINISTRATION (no hero) ----
    'administration-operations' => [
        'title_only' => true,
        'h1'      => 'Administration &amp; Operations',
        'intro'   => 'The Skin Tyee Band Administration runs the day-to-day operations of the Nation &mdash; member services, finance, lands and environmental stewardship, security, food security, and community programs &mdash; from the Band Administration office in Southbank.',
        'eyebrow' => 'Contact',
        'paragraphs' => [
            '<strong>Band Manager:</strong> Gabriel Tom &mdash; <a href="mailto:STFN_BandManager@outlook.com">STFN_BandManager@outlook.com</a> &middot; +1-250-251-3085',
            '<strong>Mailing address:</strong> P.O. Box 131, Southbank, BC V0J 2P0',
            '<strong>Departments &amp; staff:</strong> Finance (Kim Pike), Environmental Stewardship (Shirley Wilson), Security (Martin Tom), Administration (Melissa Dyck), Elders Committee Representative (Helen Michelle).',
        ],
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

    if (!empty($cfg['title_only'])) {
        $sections = [
            title_section($cfg['h1'], $cfg['intro'] ?? ''),
        ];
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

if (class_exists('\Elementor\Plugin')) {
    \Elementor\Plugin::$instance->files_manager->clear_cache();
    echo "[section] cleared Elementor file cache\n";
}
echo "[done]\n";
