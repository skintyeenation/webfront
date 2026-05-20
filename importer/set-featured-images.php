<?php
/**
 * Set a featured image on every published post that doesn't already have one.
 *
 * Strategy: scan post_content for the first <img>, extract a sha1 from the
 * filename, and look up the matching attachment in the media library. Falls
 * back to attaching by URL match if the sha lookup misses. This mirrors how
 * build-home-elementor.php picks card images, but stores the result as a real
 * featured image so any theme/template can use the_post_thumbnail().
 *
 * Run via:  wp eval-file /importer/set-featured-images.php
 * Idempotent.
 */

declare(strict_types=1);

function st_first_content_image_url(string $html): string {
    if (preg_match('/<img[^>]+src=[\'"]([^\'"]+)[\'"]/', $html, $m)) {
        return $m[1];
    }
    return '';
}

function st_sha_from_url(string $url): string {
    if (preg_match('~/([a-f0-9]{40})(?:-\d+x\d+)?\.(?:jpg|jpeg|png|gif|webp)~i', $url, $m)) {
        return $m[1];
    }
    return '';
}

function st_attachment_id_by_sha(string $sha): int {
    global $wpdb;
    // Look up by the original filename stored in _wp_attached_file.
    $row = $wpdb->get_var($wpdb->prepare(
        "SELECT post_id FROM {$wpdb->postmeta}
         WHERE meta_key = '_wp_attached_file' AND meta_value LIKE %s
         LIMIT 1",
        '%' . $wpdb->esc_like($sha) . '%'
    ));
    return $row ? (int) $row : 0;
}

function st_attachment_id_by_url(string $url): int {
    // attachment_url_to_postid handles size-suffix stripping and uploads-dir
    // normalization for us.
    return (int) attachment_url_to_postid($url);
}

$posts = get_posts([
    'post_type'   => 'post',
    'post_status' => 'publish',
    'numberposts' => -1,
]);

$set = $skipped_has = $skipped_no_image = $missed = 0;
foreach ($posts as $p) {
    if (get_post_thumbnail_id($p->ID)) { $skipped_has++; continue; }
    $url = st_first_content_image_url($p->post_content);
    if (!$url) { $skipped_no_image++; continue; }

    $att = 0;
    $sha = st_sha_from_url($url);
    if ($sha) $att = st_attachment_id_by_sha($sha);
    if (!$att) $att = st_attachment_id_by_url($url);

    if (!$att) {
        echo "[featured] no attachment for #{$p->ID} ({$p->post_title}) — src={$url}\n";
        $missed++;
        continue;
    }
    set_post_thumbnail($p->ID, $att);
    echo "[featured] #{$p->ID} <- attachment #{$att}\n";
    $set++;
}

echo "[featured] done: set=$set, already-had=$skipped_has, no-image-in-content=$skipped_no_image, missed=$missed\n";
