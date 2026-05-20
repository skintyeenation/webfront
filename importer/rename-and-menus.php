<?php
/**
 * Renames imported pages to short titles and splits the nav into two menus:
 *   primary (header):  About, History, Culture, Leadership, Administration, Projects
 *   footer  (footer):  Announcements, Stay Informed, Gallery, Q&A
 *
 * Run via:  wp eval-file /importer/rename-and-menus.php
 * Idempotent.
 */

declare(strict_types=1);

// page_slug => new short title.
// 'news' is included so it lands in $slug_to_id and can be referenced by the
// footer menu below — the page itself is created earlier by setup-news.php.
// 'community' is created later by build-section-pages.php if it doesn't exist;
// the rename here is a no-op on first run but ensures it lands in $slug_to_id.
$renames = [
    'about-our-community'         => 'About',
    'our-history'                 => 'History',
    'community'                   => 'Community',
    'skin-tyee-nation-leadership' => 'Leadership',
    'administration-operations'   => 'Administration',
    'major-projects'              => 'Projects',
    'announcements'               => 'Announcements',
    'stay-informed'               => 'Stay Informed',
    'gallery'                     => 'Gallery',
    'q-a'                         => 'Q&A',
    'news'                        => 'News',
];

$slug_to_id = [];
foreach ($renames as $slug => $title) {
    $p = get_page_by_path($slug);
    if (!$p) {
        echo "  [rename-miss] $slug\n";
        continue;
    }
    wp_update_post([
        'ID'         => $p->ID,
        'post_title' => $title,
    ]);
    $slug_to_id[$slug] = $p->ID;
    echo "  [rename] $slug -> '$title' (#{$p->ID})\n";
}

// --- Rebuild the two menus from scratch ---
function build_menu(string $name, array $page_slugs, array $slug_to_id, string $location): void {
    // Delete existing menu with this name
    $existing = wp_get_nav_menu_object($name);
    if ($existing) {
        wp_delete_nav_menu($existing->term_id);
    }
    $menu_id = wp_create_nav_menu($name);
    foreach ($page_slugs as $slug) {
        if (empty($slug_to_id[$slug])) {
            echo "  [menu-miss:$name] $slug\n";
            continue;
        }
        wp_update_nav_menu_item($menu_id, 0, [
            'menu-item-title'     => get_the_title($slug_to_id[$slug]),
            'menu-item-object'    => 'page',
            'menu-item-object-id' => $slug_to_id[$slug],
            'menu-item-type'      => 'post_type',
            'menu-item-status'    => 'publish',
        ]);
    }
    // Assign to theme location
    $locations = get_theme_mod('nav_menu_locations', []);
    $locations[$location] = $menu_id;
    set_theme_mod('nav_menu_locations', $locations);
    echo "  [menu] '$name' built with " . count($page_slugs) . " items -> location '$location'\n";
}

// Note: administration-operations is folded into the Leadership page, and
// cultural-heritage's content is folded into About — the Culture nav slot
// is now the new Community page.
build_menu('primary', [
    'about-our-community',
    'our-history',
    'community',
    'skin-tyee-nation-leadership',
    'major-projects',
], $slug_to_id, 'primary');

build_menu('footer', [
    'news',
    'announcements',
    'stay-informed',
    'gallery',
    'q-a',
], $slug_to_id, 'footer_menu');

echo "[done]\n";
