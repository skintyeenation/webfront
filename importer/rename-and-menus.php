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

// page_slug => new short title
$renames = [
    'about-our-community'         => 'About',
    'our-history'                 => 'History',
    'cultural-heritage'           => 'Culture',
    'skin-tyee-nation-leadership' => 'Leadership',
    'administration-operations'   => 'Administration',
    'major-projects'              => 'Projects',
    'announcements'               => 'Announcements',
    'stay-informed'               => 'Stay Informed',
    'gallery'                     => 'Gallery',
    'q-a'                         => 'Q&A',
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

build_menu('primary', [
    'about-our-community',
    'our-history',
    'cultural-heritage',
    'skin-tyee-nation-leadership',
    'administration-operations',
    'major-projects',
], $slug_to_id, 'primary');

build_menu('footer', [
    'announcements',
    'stay-informed',
    'gallery',
    'q-a',
], $slug_to_id, 'footer_menu');

echo "[done]\n";
