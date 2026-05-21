<?php
/**
 * Populate Astra's Main Sidebar (sidebar-1) with two poster image widgets.
 *
 * Any page configured with a right-sidebar layout will render these widgets in
 * its sidebar column. The Elementor home deliberately uses no-sidebar (its
 * posters live in an Elementor column instead), so this script is for other
 * pages where the user might want a sidebar later.
 *
 * Run via:  wp eval-file /importer/set-sidebar-widgets.php
 * Idempotent: clears sidebar-1 and any prior _st_sidebar-marked widgets first.
 */

declare(strict_types=1);

const SIDEBAR_SHAS = [
    '5ea7046d786a33e55c97eca0c9091d0928474ab7',
    'd9c203ca983a5705c3a7b1ae69474c738b7b0eb4',
];

global $wpdb;
$attachment_ids = [];
foreach (SIDEBAR_SHAS as $sha) {
    $row = $wpdb->get_row($wpdb->prepare(
        "SELECT p.ID FROM {$wpdb->posts} p
         JOIN {$wpdb->postmeta} m ON m.post_id = p.ID
         WHERE p.post_type='attachment' AND m.meta_key='_skintyee_sha1' AND m.meta_value=%s LIMIT 1",
        $sha
    ));
    if ($row) $attachment_ids[] = (int) $row->ID;
}

// Reset sidebar-1 widget list.
$sidebars_widgets = wp_get_sidebars_widgets();
$sidebars_widgets['sidebar-1'] = [];
wp_set_sidebars_widgets($sidebars_widgets);

// Drop any prior media_image widget instances created by this script (marked
// with _st_sidebar so we don't accidentally remove widgets the user added).
$existing = get_option('widget_media_image', []);
if (is_array($existing)) {
    foreach ($existing as $k => $v) {
        if (is_array($v) && !empty($v['_st_sidebar'])) unset($existing[$k]);
    }
}

$max_index = is_array($existing)
    ? max(array_filter(array_keys($existing), 'is_int') ?: [0])
    : 0;

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
        '_st_sidebar'   => true,
    ];
    $widget_refs[] = "media_image-$max_index";
}
$existing['_multiwidget'] = 1;
update_option('widget_media_image', $existing);

$sidebars_widgets = wp_get_sidebars_widgets();
$sidebars_widgets['sidebar-1'] = $widget_refs;
wp_set_sidebars_widgets($sidebars_widgets);

echo "[sidebar-widgets] added " . count($attachment_ids) . " image widget(s) to Main Sidebar\n";
