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
    'orange-shirt-day'                  => ['events'],
    'red-dress-day-1'                   => ['events'],
    'stn-christmas-community-dinner'    => ['events'],
    'the-moose-hide-campaign'           => ['programs', 'general'],
    'mcfd-learning-fund-for-youth-adults'=> ['programs', 'youth', 'education'],
    'how-to-pick-a-name-for-your-startup'=> ['programs', 'youth'],  // Outland Youth Employment Program announcement
];

global $wpdb;

foreach (CONVERSIONS as $slug => $cat_slugs) {
    // get_page_by_path expects the full hierarchical path; many of these
    // pages are children of /youth/ etc. Look up by post_name across both
    // post_types so the script catches the page regardless of nesting.
    $rows = get_posts([
        'post_type'   => ['page', 'post'],
        'name'        => $slug,
        'numberposts' => 1,
        'post_status' => 'any',
    ]);
    if (empty($rows)) {
        echo "[convert] not found: $slug\n";
        continue;
    }
    $row = $rows[0];
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

// Drop pages whose role is replaced by category archives.
const PAGES_TO_DELETE = [
    'stay-informed',  // Announcements + News cover what this used to surface
    'youth',          // -> /category/programs/youth/
    'men',            // -> /category/programs/men/
];
foreach (PAGES_TO_DELETE as $page_slug) {
    $rows = get_posts(['post_type' => 'page', 'name' => $page_slug, 'numberposts' => 1, 'post_status' => 'any']);
    if (empty($rows)) continue;
    wp_delete_post($rows[0]->ID, true);
    echo "[convert] deleted /$page_slug/ page (#{$rows[0]->ID})\n";
}

echo "[convert] done\n";
