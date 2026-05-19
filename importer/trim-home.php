<?php
/**
 * Tone down the home page: keep only the first N top-level <section> blocks
 * from the imported Site123 content. The st-hero and st-testimonial blocks
 * (which we added separately) are always preserved.
 *
 * Run via:  wp eval-file /importer/trim-home.php
 * Idempotent.
 */

declare(strict_types=1);

const KEEP_SECTIONS = 2;  // about + first leadership grid

$home = get_page_by_path('home');
if (!$home) { echo "[trim] no home page\n"; exit(1); }

$content = $home->post_content;

// Split off the hero so we can keep it as-is.
$hero = '';
if (preg_match('/<!-- st-hero:start -->.*?<!-- st-hero:end -->\s*/s', $content, $m)) {
    $hero = $m[0];
    $content = str_replace($hero, '', $content);
}
// Split off the testimonial similarly.
$testimonial = '';
if (preg_match('/<!-- st-testimonial:start -->.*?<!-- st-testimonial:end -->\s*/s', $content, $m)) {
    $testimonial = $m[0];
    $content = str_replace($testimonial, '', $content);
}

// Strip everything except the first KEEP_SECTIONS top-level <section> blocks
// from the remaining imported content.
$kept = 0;
$trimmed = preg_replace_callback(
    '/<section\b[^>]*>.*?<\/section>/s',
    function ($m) use (&$kept) {
        if ($kept < KEEP_SECTIONS) {
            $kept++;
            return $m[0];
        }
        return '';
    },
    $content
);

// Strip any now-empty wrapper divs left behind.
for ($i = 0; $i < 3; $i++) {
    $trimmed = preg_replace('/<(div|p)[^>]*>\s*<\/\1>/', '', $trimmed);
}

$new_content = $hero . $trimmed . $testimonial;
wp_update_post(['ID' => $home->ID, 'post_content' => $new_content]);

echo "[trim] home: kept hero + $kept section(s) + testimonial\n";
echo "[trim] content length: " . strlen($content) . " -> " . strlen($new_content) . "\n";
