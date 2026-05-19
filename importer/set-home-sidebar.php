<?php
/**
 * Strip a set of images from the home page content and surface them as a
 * right-hand sidebar widget area instead. No theme files touched.
 *
 * Run via:  wp eval-file /importer/set-home-sidebar.php
 * Idempotent.
 */

declare(strict_types=1);

$SIDEBAR_IMAGE_SHAS = [
    '5ea7046d786a33e55c97eca0c9091d0928474ab7',
    'd9c203ca983a5705c3a7b1ae69474c738b7b0eb4',
];

$home = get_page_by_path('home');
if (!$home) { echo "[sidebar] no home page\n"; exit(1); }

global $wpdb;

$attachment_ids = [];
$urls_to_strip  = [];
foreach ($SIDEBAR_IMAGE_SHAS as $sha) {
    $row = $wpdb->get_row($wpdb->prepare(
        "SELECT p.ID, p.guid FROM {$wpdb->posts} p
         JOIN {$wpdb->postmeta} m ON m.post_id = p.ID
         WHERE p.post_type='attachment' AND m.meta_key='_skintyee_sha1' AND m.meta_value=%s LIMIT 1",
        $sha
    ));
    if (!$row) { echo "[sidebar] missing attachment for sha1=$sha\n"; continue; }
    $attachment_ids[] = (int) $row->ID;
    $urls_to_strip[]  = $row->guid;
}

// --- 1. Strip <img> tags whose src points at those URLs from home content.
//     Also strip any wrapping <a> or empty parent figure if they become empty.
$content = $home->post_content;
foreach ($urls_to_strip as $url) {
    // Use DOM-ish regex: img tag containing that URL anywhere in attrs
    $url_esc = preg_quote($url, '/');
    // remove a wrapping <a> tag that only contains this img
    $content = preg_replace('/<a[^>]*>\s*<img[^>]*' . $url_esc . '[^>]*>\s*<\/a>/', '', $content);
    // remove the bare img
    $content = preg_replace('/<img[^>]*' . $url_esc . '[^>]*>/', '', $content);
}
// Tidy up: remove empty figure/div wrappers that may be left behind
$content = preg_replace('/<(figure|div)[^>]*>\s*<\/\1>/', '', $content);
$content = preg_replace('/<(figure|div)[^>]*>\s*<\/\1>/', '', $content); // run twice for nested

wp_update_post(['ID' => $home->ID, 'post_content' => $content]);
echo "[sidebar] stripped " . count($urls_to_strip) . " images from home content\n";

// --- 2. Make the home page use Astra's right-sidebar layout.
update_post_meta($home->ID, 'site-sidebar-layout', 'right-sidebar');
update_post_meta($home->ID, 'site-content-layout', 'default');
echo "[sidebar] set home to use right-sidebar layout\n";

// --- 3. Add the images as media_image widgets to Main Sidebar (sidebar-1).
//     Reset sidebar-1 so the script is idempotent.
$sidebars_widgets = wp_get_sidebars_widgets();
$sidebars_widgets['sidebar-1'] = [];
wp_set_sidebars_widgets($sidebars_widgets);

// Remove any prior st-sidebar widget instances.
$existing = get_option('widget_media_image', []);
if (is_array($existing)) {
    foreach ($existing as $k => $v) {
        if (is_array($v) && !empty($v['_st_sidebar'])) unset($existing[$k]);
    }
}

// Create one media_image widget per attachment.
$max_index = is_array($existing) ? max(array_filter(array_keys($existing), 'is_int') ?: [0]) : 0;
$widget_refs = [];
foreach ($attachment_ids as $aid) {
    $max_index++;
    $existing[$max_index] = [
        'attachment_id' => $aid,
        'url'           => '',
        'title'         => '',
        'size'          => 'medium',
        'width'         => 0,
        'height'        => 0,
        'caption'       => '',
        'alt'           => '',
        'link_type'     => 'none',
        'link_url'      => '',
        'image_classes' => 'st-sidebar-img',
        'link_classes'  => '',
        'link_rel'      => '',
        'link_target_blank' => false,
        'image_title'   => '',
        '_st_sidebar'   => true,  // marker so re-runs can clean up
    ];
    $widget_refs[] = "media_image-$max_index";
}
$existing['_multiwidget'] = 1;
update_option('widget_media_image', $existing);

$sidebars_widgets = wp_get_sidebars_widgets();
$sidebars_widgets['sidebar-1'] = $widget_refs;
wp_set_sidebars_widgets($sidebars_widgets);

echo "[sidebar] added " . count($attachment_ids) . " image widget(s) to Main Sidebar\n";
echo "[done]\n";
