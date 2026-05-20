<?php
/**
 * Build the home page entirely as typed Elementor widgets — no dumping of
 * imported HTML into a text-editor widget. Each piece (heading, paragraph,
 * image, leadership card) is a discrete element you can edit visually in
 * the Elementor UI.
 *
 * Page structure (top to bottom):
 *   - Full-width hero section: lake bg, dark overlay, white slogan + subtitle
 *   - 2-column body section (stretched, 1400px content width):
 *       Left col (66%): About heading + paragraph + BC map image, then
 *                       Leadership heading + 3-col inner section with one
 *                       card per councillor (image, name, role, election note)
 *       Right col (33%): Two poster images stacked
 *   - Full-width testimonial: dark-teal bg, italic slogan, attribution
 *
 * Run via:  wp eval-file /importer/build-home-elementor.php
 * Idempotent: wipes prior _elementor_data each run.
 */

declare(strict_types=1);

require_once __DIR__ . '/elementor-helpers.php';

const LOGO_SHA       = '48facf18c1a083b1df0535f7f59ed091a0c39d2c';  // thunderbird, header logo
const HERO_SHA       = '7e8ebbafda693524c7e2e203a95f6348a69233ba';
const BC_MAP_SHA     = '7ccd337afb24f226ec96d6bc25fff792ea3d0064';
const SIDEBAR_SHAS   = [
    '5ea7046d786a33e55c97eca0c9091d0928474ab7',
    'd9c203ca983a5705c3a7b1ae69474c738b7b0eb4',
];
const LEADERSHIP = [
    [
        'sha'  => '7bf7a1ee3ba34745c5def58518d14b3de3010d85',
        'name' => 'Gabriel Tom',
        'role' => 'Councillor',
        'note' => 'Elected to the Skin Tyee First Nation Council April 8, 2024',
    ],
    [
        'sha'  => '63c82a62e4e5a0803b0cd0702adc62d903e01573',
        'name' => 'Shirley Wilson',
        'role' => 'Councillor',
        'note' => 'Elected to the Skin Tyee First Nation Council April 8, 2024',
    ],
    [
        'sha'  => '7f266b3e16e1cfecc55ac39a5cc47587afcb7e27',
        'name' => 'Vacant',
        'role' => 'Chief Councillor',
        'note' => 'Position will be filled via By-Election',
    ],
];
const ABOUT_BODY = 'Our community is dedicated to fostering connections, empowerment, and support among members. We believe in the power of unity and work tirelessly to create a welcoming environment where everyone can thrive. Come join us and be a part of something special!';
const SLOGAN     = '&ldquo;Enpowering Our Future: Unity, Strength, Prosperity.&rdquo;';
const SUBTITLE   = 'Building a Brighter Tomorrow Together';

// --- gather attachments ----------------------------------------------------

$home = get_page_by_path('home');
if (!$home) { echo "[elementor] no home page\n"; exit(1); }

global $wpdb;
// Site identity: set the header logo to the thunderbird image. Attachment IDs
// are re-assigned by MySQL on each fresh install, so we have to look up by sha.
$logo = attachment_by_sha(LOGO_SHA);
if ($logo) {
    set_theme_mod('custom_logo', $logo['id']);
    echo "[site] header logo set to attachment #{$logo['id']}\n";
}

$hero = attachment_by_sha(HERO_SHA);
$bc   = attachment_by_sha(BC_MAP_SHA);
$sidebar = array_filter(array_map('attachment_by_sha', SIDEBAR_SHAS));
$leaders = [];
foreach (LEADERSHIP as $L) {
    $att = attachment_by_sha($L['sha']);
    if ($att) $leaders[] = array_merge($L, ['att' => $att]);
}
if (!$hero) { echo "[elementor] missing hero attachment\n"; exit(1); }

// --- 1. Hero section -------------------------------------------------------

$hero_section = section([
    'stretch_section' => 'section-stretched',  // bg image spans viewport
    'layout' => 'boxed',                       // but content is boxed-narrow
    'content_width' => ['unit' => 'px', 'size' => 860, 'sizes' => []],
    'gap' => 'no',
    'height' => 'min-height',
    'custom_height' => ['unit' => 'px', 'size' => 520],
    'content_position' => 'middle',
    'background_background' => 'classic',
    'background_image' => ['id' => $hero['id'], 'url' => $hero['url']],
    'background_position' => 'center center',
    'background_size' => 'cover',
    'background_overlay_background' => 'classic',
    'background_overlay_color' => '#000000',
    'background_overlay_opacity' => ['unit' => 'px', 'size' => 0.45],
], [
    column(100, [
        heading(SLOGAN, 'h1', [
            'align' => 'center',
            'title_color' => '#ffffff',
            'typography_typography' => 'custom',
            'typography_font_family' => 'Lora',
            'typography_font_size' => ['unit' => 'px', 'size' => 44, 'sizes' => []],
            'typography_font_size_tablet' => ['unit' => 'px', 'size' => 34, 'sizes' => []],
            'typography_font_size_mobile' => ['unit' => 'px', 'size' => 26, 'sizes' => []],
            'typography_font_weight' => '600',
            'typography_line_height' => ['unit' => 'em', 'size' => 1.2],
            'text_shadow_text_shadow_type' => 'yes',
            'text_shadow_text_shadow' => ['horizontal' => 0, 'vertical' => 2, 'blur' => 6, 'color' => 'rgba(0,0,0,0.4)'],
        ]),
        heading(SUBTITLE, 'p', [
            'align' => 'center',
            'title_color' => '#e2efe8',
            'typography_typography' => 'custom',
            'typography_font_size' => ['unit' => 'px', 'size' => 22, 'sizes' => []],
            'typography_font_style' => 'italic',
            '_margin' => ['unit' => 'px', 'top' => 10, 'right' => 0, 'bottom' => 0, 'left' => 0, 'isLinked' => false],
        ]),
    ]),
]);

// --- 2. Body section: about + leadership grid (left col), posters (right col)

$about_widgets = [
    heading('About Our Community', 'h2', [
        'typography_typography' => 'custom',
        'typography_font_family' => 'Lora',
        'typography_font_weight' => '600',
    ]),
    paragraph(ABOUT_BODY, [
        'typography_typography' => 'custom',
        'typography_font_size' => ['unit' => 'px', 'size' => 17, 'sizes' => []],
        'typography_line_height' => ['unit' => 'em', 'size' => 1.7],
    ]),
];
if ($bc) {
    $about_widgets[] = image_widget($bc, [
        'align' => 'center',
        'width' => ['unit' => 'px', 'size' => 380, 'sizes' => []],
        '_margin' => ['unit' => 'px', 'top' => 16, 'right' => 0, 'bottom' => 16, 'left' => 0, 'isLinked' => false],
    ]);
}

$leadership_widgets = [
    heading('Skin Tyee Nation Leadership', 'h2', [
        'typography_typography' => 'custom',
        'typography_font_family' => 'Lora',
        'typography_font_weight' => '600',
        '_margin' => ['unit' => 'px', 'top' => 40, 'right' => 0, 'bottom' => 16, 'left' => 0, 'isLinked' => false],
    ]),
];

// 3-column inner section for leadership cards
$leader_columns = [];
foreach ($leaders as $L) {
    $leader_columns[] = column(33, [
        image_widget($L['att'], [
            'image_size' => 'medium',
            'align' => 'center',
            '_css_classes' => 'st-leader-portrait',
            '_margin' => ['unit' => 'px', 'top' => 0, 'right' => 0, 'bottom' => 12, 'left' => 0, 'isLinked' => false],
        ]),
        heading($L['name'], 'h4', [
            'align' => 'center',
            'typography_typography' => 'custom',
            'typography_font_family' => 'Lora',
            'typography_font_weight' => '600',
            'typography_font_size' => ['unit' => 'px', 'size' => 20, 'sizes' => []],
            '_margin' => ['unit' => 'px', 'top' => 0, 'right' => 0, 'bottom' => 4, 'left' => 0, 'isLinked' => false],
        ]),
        heading($L['role'], 'p', [
            'align' => 'center',
            'title_color' => '#6b7280',
            'typography_typography' => 'custom',
            'typography_font_style' => 'italic',
            'typography_font_size' => ['unit' => 'px', 'size' => 14, 'sizes' => []],
            '_margin' => ['unit' => 'px', 'top' => 0, 'right' => 0, 'bottom' => 8, 'left' => 0, 'isLinked' => false],
        ]),
        paragraph($L['note'], [
            'align' => 'center',
            'typography_typography' => 'custom',
            'typography_font_size' => ['unit' => 'px', 'size' => 13, 'sizes' => []],
            '_padding' => ['unit' => 'px', 'top' => 0, 'right' => 8, 'bottom' => 0, 'left' => 8, 'isLinked' => false],
        ]),
    ], [
        '_padding' => ['unit' => 'px', 'top' => 16, 'right' => 12, 'bottom' => 16, 'left' => 12, 'isLinked' => false],
        '_background_background' => 'classic',
        '_background_color' => '#ffffff',
        '_border_radius' => ['unit' => 'px', 'top' => 8, 'right' => 8, 'bottom' => 8, 'left' => 8, 'isLinked' => true],
        '_box_shadow_box_shadow_type' => 'yes',
        '_box_shadow_box_shadow' => ['horizontal' => 0, 'vertical' => 4, 'blur' => 12, 'spread' => 0, 'color' => 'rgba(31,67,65,0.08)'],
    ]);
}

$leadership_widgets[] = section(['structure' => '30', 'gap' => 'extended'], $leader_columns, true);

$main_col = column(66, array_merge($about_widgets, $leadership_widgets), [
    '_padding' => ['unit' => 'px', 'top' => 0, 'right' => 24, 'bottom' => 0, 'left' => 0, 'isLinked' => false],
]);

$sidebar_widgets = [];
foreach ($sidebar as $img) {
    $sidebar_widgets[] = image_widget($img, [
        'image_size' => 'full',
        'align' => 'center',
        '_margin' => ['unit' => 'px', 'top' => 0, 'right' => 0, 'bottom' => 24, 'left' => 0, 'isLinked' => false],
    ]);
}
$sidebar_col = column(33, $sidebar_widgets);

$body_section = section([
    'structure' => '20',  // 2-column 66/33
    'stretch_section' => 'section-stretched',
    'content_width' => ['unit' => 'px', 'size' => 1400, 'sizes' => []],
    'gap' => 'extended',
    'padding' => ['unit' => 'px', 'top' => 70, 'right' => 32, 'bottom' => 70, 'left' => 32, 'isLinked' => false],
], [$main_col, $sidebar_col]);

// --- 3. Latest News section (between body + testimonial) ------------------
// Fetches the 3 most recent published posts, builds a "featured + 2 small"
// layout, and links to /news/ for the full archive.

$news_posts = get_posts([
    'post_type'   => 'post',
    'numberposts' => 3,
    'orderby'     => 'date',
    'order'       => 'DESC',
    'post_status' => 'publish',
]);

function post_card_data($p): array {
    $img = '';
    if (preg_match('/<img[^>]+src=[\'"]([^\'"]+)[\'"]/', $p->post_content, $m)) {
        $img = $m[1];
    }
    $excerpt = $p->post_excerpt ?: wp_trim_words(strip_tags(strip_shortcodes($p->post_content)), 28);
    return [
        'title'   => $p->post_title,
        'url'     => get_permalink($p->ID),
        'image'   => $img,
        'excerpt' => $excerpt,
        'date'    => get_the_date('M j, Y', $p),
    ];
}

function news_card_widgets(array $card, bool $featured): array {
    $widgets = [];
    if ($card['image']) {
        $widgets[] = widget('image', [
            'image' => ['url' => $card['image']],
            'image_size' => $featured ? 'large' : 'medium',
            'link_to' => 'custom',
            'link' => ['url' => $card['url']],
            '_margin' => ['unit' => 'px', 'top' => 0, 'right' => 0, 'bottom' => 12, 'left' => 0, 'isLinked' => false],
        ]);
    }
    $widgets[] = heading($card['title'], $featured ? 'h3' : 'h4', [
        'link' => ['url' => $card['url']],
        'typography_typography' => 'custom',
        'typography_font_family' => 'Lora',
        'typography_font_weight' => '600',
        'typography_font_size' => ['unit' => 'px', 'size' => $featured ? 26 : 18, 'sizes' => []],
        '_margin' => ['unit' => 'px', 'top' => 0, 'right' => 0, 'bottom' => 4, 'left' => 0, 'isLinked' => false],
    ]);
    $widgets[] = heading($card['date'], 'p', [
        'title_color' => '#6b7280',
        'typography_typography' => 'custom',
        'typography_font_size' => ['unit' => 'px', 'size' => 12, 'sizes' => []],
        'typography_text_transform' => 'uppercase',
        'typography_letter_spacing' => ['unit' => 'px', 'size' => 1.5, 'sizes' => []],
        '_margin' => ['unit' => 'px', 'top' => 0, 'right' => 0, 'bottom' => 10, 'left' => 0, 'isLinked' => false],
    ]);
    $widgets[] = paragraph($card['excerpt'] . '&hellip;', [
        'typography_typography' => 'custom',
        'typography_font_size' => ['unit' => 'px', 'size' => $featured ? 16 : 14, 'sizes' => []],
        'typography_line_height' => ['unit' => 'em', 'size' => 1.55],
    ]);
    return $widgets;
}

$news_section = null;
if (!empty($news_posts)) {
    $cards = array_map('post_card_data', $news_posts);
    $featured = array_shift($cards);
    $small = $cards;  // 0–2 more cards

    $card_col_style = [
        '_padding' => ['unit' => 'px', 'top' => 20, 'right' => 20, 'bottom' => 20, 'left' => 20, 'isLinked' => false],
        '_background_background' => 'classic',
        '_background_color' => '#ffffff',
        '_border_radius' => ['unit' => 'px', 'top' => 8, 'right' => 8, 'bottom' => 8, 'left' => 8, 'isLinked' => true],
        '_box_shadow_box_shadow_type' => 'yes',
        '_box_shadow_box_shadow' => ['horizontal' => 0, 'vertical' => 4, 'blur' => 16, 'spread' => 0, 'color' => 'rgba(31,67,65,0.08)'],
    ];

    $featured_col = column(60, news_card_widgets($featured, true), $card_col_style);

    // Right column: inner section with 2 stacked smaller card columns.
    $small_cols = [];
    foreach ($small as $s) {
        $small_cols[] = column(100, news_card_widgets($s, false), $card_col_style);
    }
    while (count($small_cols) < 2) {
        $small_cols[] = column(100, [paragraph('More to come.')]);
    }

    $right_inner = section([
        'structure' => '10',  // single column = stack
        'gap' => 'extended',
    ], [$small_cols[0]], true);
    $right_inner2 = section([
        'structure' => '10',
        'gap' => 'extended',
    ], [$small_cols[1]], true);

    $small_col = column(40, [$right_inner, $right_inner2]);

    $news_label = heading('Latest News', 'h2', [
        'align' => 'center',
        'typography_typography' => 'custom',
        'typography_font_family' => 'Lora',
        'typography_font_weight' => '600',
        '_margin' => ['unit' => 'px', 'top' => 0, 'right' => 0, 'bottom' => 8, 'left' => 0, 'isLinked' => false],
    ]);
    $news_subtitle = heading('Stay informed with announcements + community news', 'p', [
        'align' => 'center',
        'title_color' => '#4b5563',
        'typography_typography' => 'custom',
        'typography_font_style' => 'italic',
        'typography_font_size' => ['unit' => 'px', 'size' => 16, 'sizes' => []],
        '_margin' => ['unit' => 'px', 'top' => 0, 'right' => 0, 'bottom' => 32, 'left' => 0, 'isLinked' => false],
    ]);
    $view_all = widget('button', [
        'text' => 'View all news →',
        'link' => ['url' => home_url('/news/')],
        'align' => 'center',
        'button_text_color' => '#ffffff',
        'background_color' => '#2c5f5d',
        'hover_color' => '#ffffff',
        'button_background_hover_color' => '#1f4341',
        'border_radius' => ['unit' => 'px', 'top' => 6, 'right' => 6, 'bottom' => 6, 'left' => 6, 'isLinked' => true],
        '_margin' => ['unit' => 'px', 'top' => 32, 'right' => 0, 'bottom' => 0, 'left' => 0, 'isLinked' => false],
    ]);

    $news_row = section([
        'structure' => '4060',
        'gap' => 'extended',
    ], [$featured_col, $small_col], true);

    $news_section = section([
        'stretch_section' => 'section-stretched',
        'content_width' => ['unit' => 'px', 'size' => 1280, 'sizes' => []],
        'background_background' => 'classic',
        'background_color' => '#e2efe8',
        'padding' => ['unit' => 'px', 'top' => 80, 'right' => 32, 'bottom' => 80, 'left' => 32, 'isLinked' => false],
    ], [
        column(100, [$news_label, $news_subtitle, $news_row, $view_all]),
    ]);
}

// --- 4. Testimonial section ------------------------------------------------

$testimonial_section = section([
    'stretch_section' => 'section-stretched',
    'layout' => 'full_width',
    'background_background' => 'classic',
    'background_color' => '#1f4341',
    'padding' => ['unit' => 'px', 'top' => 80, 'right' => 24, 'bottom' => 80, 'left' => 24, 'isLinked' => false],
], [
    column(100, [
        heading(SLOGAN, 'p', [
            'align' => 'center',
            'title_color' => '#e2efe8',
            'typography_typography' => 'custom',
            'typography_font_family' => 'Lora',
            'typography_font_size' => ['unit' => 'px', 'size' => 30, 'sizes' => []],
            'typography_font_style' => 'italic',
            'typography_font_weight' => '500',
            'typography_line_height' => ['unit' => 'em', 'size' => 1.35],
        ]),
        heading('&mdash; SKIN TYEE FIRST NATION', 'p', [
            'align' => 'center',
            'title_color' => '#9fc6bd',
            'typography_typography' => 'custom',
            'typography_font_size' => ['unit' => 'px', 'size' => 13, 'sizes' => []],
            'typography_letter_spacing' => ['unit' => 'px', 'size' => 2.5, 'sizes' => []],
            'typography_text_transform' => 'uppercase',
            '_margin' => ['unit' => 'px', 'top' => 12, 'right' => 0, 'bottom' => 0, 'left' => 0, 'isLinked' => false],
        ]),
    ]),
]);

// --- assemble + save -------------------------------------------------------

$data = array_values(array_filter([$hero_section, $body_section, $news_section, $testimonial_section]));
$json = wp_json_encode($data);
if ($json === false) { echo "[elementor] json encode failed\n"; exit(1); }

$elementor_version = defined('ELEMENTOR_VERSION') ? ELEMENTOR_VERSION : '4.0.9';

// Clear post_content so Elementor's data is the single source of truth.
wp_update_post(['ID' => $home->ID, 'post_content' => '']);

update_post_meta($home->ID, '_elementor_edit_mode', 'builder');
update_post_meta($home->ID, '_elementor_template_type', 'wp-page');
update_post_meta($home->ID, '_elementor_version', $elementor_version);
update_post_meta($home->ID, '_elementor_data', wp_slash($json));
update_post_meta($home->ID, '_wp_page_template', 'elementor_header_footer');
update_post_meta($home->ID, 'site-sidebar-layout', 'no-sidebar');

// Wipe Astra's per-page CSS cache so its container width updates.
$wpdb->query("DELETE FROM {$wpdb->postmeta} WHERE post_id = {$home->ID} AND meta_key LIKE 'astra-%'");

if (class_exists('\Elementor\Plugin')) {
    \Elementor\Plugin::$instance->files_manager->clear_cache();
    echo "[elementor] cleared Elementor file cache\n";
}

echo "[elementor] home rebuilt: 3 sections, " . strlen($json) . " bytes\n";
echo "[elementor] widgets: 1 hero heading + 1 subtitle, " . count($about_widgets)
   . " about widgets, 1 leadership heading + " . count($leaders) . " leadership cards (each 4 widgets), "
   . count($sidebar_widgets) . " sidebar images, 2 testimonial widgets\n";
