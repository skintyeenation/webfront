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

// --- helpers ----------------------------------------------------------------

function el_id(): string { return substr(bin2hex(random_bytes(4)), 0, 7); }

function attachment_by_sha(string $sha): ?array {
    global $wpdb;
    $row = $wpdb->get_row($wpdb->prepare(
        "SELECT p.ID, p.guid FROM {$wpdb->posts} p
         JOIN {$wpdb->postmeta} m ON m.post_id = p.ID
         WHERE p.post_type='attachment' AND m.meta_key='_skintyee_sha1' AND m.meta_value=%s LIMIT 1",
        $sha
    ));
    return $row ? ['id' => (int) $row->ID, 'url' => $row->guid] : null;
}

function widget(string $type, array $settings, array $elements = []): array {
    return [
        'id' => el_id(),
        'elType' => 'widget',
        'widgetType' => $type,
        'settings' => $settings,
        'elements' => $elements,
    ];
}

function column(int $size, array $elements, array $extra_settings = []): array {
    return [
        'id' => el_id(),
        'elType' => 'column',
        'settings' => array_merge(['_column_size' => $size, '_inline_size' => $size], $extra_settings),
        'elements' => $elements,
    ];
}

function section(array $settings, array $columns, bool $inner = false): array {
    $s = [
        'id' => el_id(),
        'elType' => 'section',
        'settings' => $settings,
        'elements' => $columns,
    ];
    if ($inner) $s['isInner'] = true;
    return $s;
}

function heading(string $title, string $size = 'h2', array $extra = []): array {
    return widget('heading', array_merge(['title' => $title, 'header_size' => $size], $extra));
}

function paragraph(string $text, array $extra = []): array {
    return widget('text-editor', array_merge(['editor' => '<p>' . $text . '</p>'], $extra));
}

function image_widget(array $att, array $extra = []): array {
    return widget('image', array_merge([
        'image' => ['id' => $att['id'], 'url' => $att['url']],
        'image_size' => 'medium_large',
    ], $extra));
}

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
    'stretch_section' => 'section-stretched',
    'layout' => 'full_width',
    'gap' => 'no',
    'height' => 'min-height',
    'custom_height' => ['unit' => 'px', 'size' => 560],
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
            'typography_font_size' => ['unit' => 'px', 'size' => 56, 'sizes' => []],
            'typography_font_size_tablet' => ['unit' => 'px', 'size' => 40, 'sizes' => []],
            'typography_font_size_mobile' => ['unit' => 'px', 'size' => 28, 'sizes' => []],
            'typography_font_weight' => '600',
            'typography_line_height' => ['unit' => 'em', 'size' => 1.15],
            'text_shadow_text_shadow_type' => 'yes',
            'text_shadow_text_shadow' => ['horizontal' => 0, 'vertical' => 2, 'blur' => 6, 'color' => 'rgba(0,0,0,0.4)'],
        ]),
        heading(SUBTITLE, 'p', [
            'align' => 'center',
            'title_color' => '#e2efe8',
            'typography_typography' => 'custom',
            'typography_font_size' => ['unit' => 'px', 'size' => 22, 'sizes' => []],
            'typography_font_style' => 'italic',
            '_margin' => ['unit' => 'px', 'top' => 8, 'right' => 0, 'bottom' => 0, 'left' => 0, 'isLinked' => false],
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

// --- 3. Testimonial section ------------------------------------------------

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

$data = [$hero_section, $body_section, $testimonial_section];
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
