<?php
/**
 * Rename post slugs that don't match their titles. Site123 imported posts with
 * generic blog-template slugs (e.g. "9-steps-to-starting-a-business") even
 * though the actual title is "Water Boil Advisory".
 *
 * Run via:  wp eval-file /importer/fix-post-slugs.php
 * Idempotent — only renames if the current slug is the bad one.
 */

declare(strict_types=1);

const SLUG_RENAMES = [
    // current slug => proper slug
    '9-steps-to-starting-a-business'                  => 'water-boil-advisory',
    '7-big-things-a-start-up-must-have-to-succeed'    => 'wild-fires',
    'how-to-make-extra-money'                         => 'potential-measles-exposure-advisory-vancouver',
];

$updated = 0;
foreach (SLUG_RENAMES as $old => $new) {
    $rows = get_posts(['post_type' => 'post', 'name' => $old, 'numberposts' => 1, 'post_status' => 'any']);
    if (empty($rows)) continue;
    $id = (int) $rows[0]->ID;
    $title = $rows[0]->post_title;
    wp_update_post(['ID' => $id, 'post_name' => $new]);
    echo "[slugs] #$id ($title): $old -> $new\n";
    $updated++;
}
echo "[slugs] $updated slugs renamed\n";
