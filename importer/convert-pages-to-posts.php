<?php
/**
 * Convert specific Site123-imported pages into WP posts so they appear in
 * the right category archive (Events / Programs) and the Community page
 * Announcements feed picks them up.
 *
 * Also drops the /stay-informed/ page entirely (announcements + news handle
 * what it used to contain).
 *
 * Run via:  wp eval-file /importer/convert-pages-to-posts.php
 * Idempotent.
 */

declare(strict_types=1);

// page slug => [category slugs to assign]
const CONVERSIONS = [
    'orange-shirt-day'              => ['events'],
    'red-dress-day-1'               => ['events'],
    'stn-christmas-community-dinner'=> ['events'],
    'the-moose-hide-campaign'       => ['programs', 'general'],
];

global $wpdb;

foreach (CONVERSIONS as $slug => $cat_slugs) {
    $row = get_page_by_path($slug);
    if (!$row) {
        echo "[convert] not found: $slug\n";
        continue;
    }
    if ($row->post_type === 'post') {
        echo "[convert] already a post: $slug\n";
    } else {
        // wp_update_post can change post_type. Page hierarchy fields (parent)
        // are cleared via direct DB so they don't linger on the post.
        $wpdb->update($wpdb->posts,
            ['post_type' => 'post', 'post_parent' => 0],
            ['ID' => $row->ID]
        );
        clean_post_cache($row->ID);
        echo "[convert] $slug (#{$row->ID}): page -> post\n";
    }
    // Assign categories (REPLACE)
    $cat_ids = [];
    foreach ($cat_slugs as $cs) {
        $term = get_term_by('slug', $cs, 'category');
        if ($term) $cat_ids[] = (int) $term->term_id;
    }
    if (!empty($cat_ids)) {
        wp_set_post_categories($row->ID, $cat_ids, false);
        echo "[convert]   categories -> [" . implode(',', $cat_slugs) . "]\n";
    }
}

// Drop the /stay-informed/ page — its content (food security info etc.) is
// now handled by category archives + the Community page sections.
$stay = get_page_by_path('stay-informed');
if ($stay) {
    wp_delete_post($stay->ID, true);
    echo "[convert] deleted /stay-informed/ page (#{$stay->ID})\n";
}

echo "[convert] done\n";
