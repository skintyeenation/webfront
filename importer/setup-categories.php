<?php
/**
 * Set up the hierarchical category taxonomy and reassign existing imported
 * posts. Posts can belong to multiple categories — that's how the WP
 * category taxonomy works by default.
 *
 * Top-level:
 *   Events
 *   Programs
 *   News
 *   Announcements
 *
 * Sub-categories:
 *   Announcements > Health, Safety, Council
 *   Programs      > General, Youth, Men, Women, Education
 *
 * Run via:  wp eval-file /importer/setup-categories.php
 * Idempotent — safe to re-run.
 */

declare(strict_types=1);

const CATEGORY_TREE = [
    'events'         => ['name' => 'Events',        'parent' => null],
    'programs'       => ['name' => 'Programs',      'parent' => null],
    'news'           => ['name' => 'News',          'parent' => null],
    'announcements'  => ['name' => 'Announcements', 'parent' => null],

    'health'         => ['name' => 'Health',        'parent' => 'announcements'],
    'safety'         => ['name' => 'Safety',        'parent' => 'announcements'],
    'council'        => ['name' => 'Council',       'parent' => 'announcements'],

    'general'        => ['name' => 'General',       'parent' => 'programs'],
    'youth'          => ['name' => 'Youth',         'parent' => 'programs'],
    'men'            => ['name' => 'Men',           'parent' => 'programs'],
    'women'          => ['name' => 'Women',         'parent' => 'programs'],
    'education'      => ['name' => 'Education',     'parent' => 'programs'],
];

// post slug => [category slugs it should be in].
// Each line lists the proper slug (after fix-post-slugs.php has run); the
// old Site123 slugs (e.g. "9-steps-...") will be migrated by that script.
const POST_CATEGORY_MAP = [
    'to-our-k-12-and-post-secondary-students-of-stn' => ['announcements', 'council', 'education', 'youth'],
    'potential-measles-exposure-advisory-vancouver'  => ['announcements', 'health'],
    'non-insured-health-benefits-program-updates'    => ['announcements', 'health'],
    'water-boil-advisory'                            => ['announcements', 'health'],  // water contamination = health alert
    'wild-fires'                                     => ['announcements', 'safety'],
    'tsleil-waututh-nation-skills-centre-employment-training' => ['programs', 'education', 'general'],
    // Posts created by split-fnha-news.php (replaces the original 'fnha-news')
    'first-nations-virtual-doctor-of-the-day'        => ['announcements', 'health'],
    'fnha-30x30-active-challenge-community-wellness-champion-barby-skalin' => ['announcements', 'health', 'news'],
];

// --- 1. Create / find categories, recording slug -> term_id ----------------

$slug_to_id = [];
foreach (CATEGORY_TREE as $slug => $info) {
    $existing = get_term_by('slug', $slug, 'category');
    if ($existing) {
        $slug_to_id[$slug] = (int) $existing->term_id;
        continue;
    }
    $parent_id = 0;
    if ($info['parent'] !== null && isset($slug_to_id[$info['parent']])) {
        $parent_id = $slug_to_id[$info['parent']];
    }
    $res = wp_insert_term($info['name'], 'category', [
        'slug'   => $slug,
        'parent' => $parent_id,
    ]);
    if (is_wp_error($res)) {
        echo "[cats] failed to create '$slug': " . $res->get_error_message() . "\n";
        continue;
    }
    $slug_to_id[$slug] = (int) $res['term_id'];
    echo "[cats] created '$slug' (#{$res['term_id']})" . ($info['parent'] ? " under '{$info['parent']}'" : '') . "\n";
}

// Pass 2: fix parents in case order-of-creation left any orphaned.
foreach (CATEGORY_TREE as $slug => $info) {
    if ($info['parent'] !== null && isset($slug_to_id[$slug], $slug_to_id[$info['parent']])) {
        wp_update_term($slug_to_id[$slug], 'category', ['parent' => $slug_to_id[$info['parent']]]);
    }
}

// --- 2. Reassign posts -----------------------------------------------------

$assigned = 0;
foreach (POST_CATEGORY_MAP as $post_slug => $cat_slugs) {
    $rows = get_posts(['post_type' => 'post', 'name' => $post_slug, 'numberposts' => 1, 'post_status' => 'any']);
    if (empty($rows)) {
        echo "[cats] post not found: $post_slug\n";
        continue;
    }
    $post_id = (int) $rows[0]->ID;
    $cat_ids = [];
    foreach ($cat_slugs as $cs) {
        if (isset($slug_to_id[$cs])) $cat_ids[] = $slug_to_id[$cs];
    }
    // REPLACE all categories (not append) so re-runs converge.
    wp_set_post_categories($post_id, $cat_ids, false);
    echo "[cats] $post_slug -> [" . implode(',', $cat_slugs) . "]\n";
    $assigned++;
}

// --- 3. Cleanup: drop the old 'Stay Informed' category (now unused) -------

$stay = get_term_by('slug', 'stay-informed', 'category');
if ($stay) {
    // Only delete if it has no posts assigned (they've all been reassigned above)
    $remaining = get_posts([
        'post_type'   => 'post',
        'category'    => $stay->term_id,
        'numberposts' => 1,
    ]);
    if (empty($remaining)) {
        wp_delete_term($stay->term_id, 'category');
        echo "[cats] deleted 'stay-informed' category (empty)\n";
    } else {
        echo "[cats] kept 'stay-informed' (still has posts)\n";
    }
}

// --- 4. Ensure Uncategorized has no posts (default for posts created without
//        explicit categories). We leave the term in place — WP requires a
//        default fallback — but nothing should be in it after re-assignment.
$uncat = get_term_by('slug', 'uncategorized', 'category');
if ($uncat) {
    $orphans = get_posts(['post_type' => 'post', 'category' => $uncat->term_id, 'numberposts' => -1]);
    if (!empty($orphans)) {
        echo "[cats] " . count($orphans) . " posts still in Uncategorized — review manually\n";
    }
}

echo "[cats] $assigned posts reassigned, " . count($slug_to_id) . " categories in tree\n";
