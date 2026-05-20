<?php
/**
 * Strip imported Site123 wrappers from post content:
 *   - dataPageBreadcrumbs section at the top (the "Home / Stay Informed /
 *     Post Title" links bleed through and show as plain text in the home
 *     news cards' excerpts, and as a redundant breadcrumb on the post page)
 *   - related-article-container div at the bottom (3 cards linking to
 *     other posts via the original Site123 /stay-informed/<slug> paths,
 *     which still work but are out of place under our new layout)
 *
 * Run via:  wp eval-file /importer/clean-post-content.php
 * Idempotent: regex match-and-strip, safe to re-run.
 */

declare(strict_types=1);

$posts = get_posts([
    'post_type'   => 'post',
    'numberposts' => -1,
    'post_status' => 'publish',
]);

$updated = 0;
foreach ($posts as $p) {
    $original = $p->post_content;
    $content = $original;

    // PREVIOUS BUG: stripping the whole <section class="dataPageBreadcrumbs">
    // ate the ENTIRE post body because Site123 wraps all the post content
    // inside that same section. The breadcrumb itself is just the inner
    // .breadcrumb-wrap div — strip that, leave the wrapping section alone.
    //
    // Structure:
    //   <section class="bg-primary dataPageBreadcrumbs">
    //     <div class="breadcrumb-wrap">       <-- strip THIS only
    //       <ol class="breadcrumb"><li>...</li></ol>
    //     </div>
    //     <div class="container">             <-- this is the post body, keep
    //       ...all the actual content...
    //     </div>
    //   </section>
    $content = preg_replace(
        '~<div\b[^>]*\bbreadcrumb-wrap\b[^>]*>\s*<ol[^>]*\bbreadcrumb\b[^>]*>.*?</ol>\s*</div>~s',
        '',
        $content
    );
    // Strip the related-article-container row at the bottom — these are
    // Site123-rendered "related" cards pointing at the original /stay-informed/
    // post URLs. Match the div + close.
    $content = preg_replace(
        '~<div\b[^>]*\brelated-article-container\b[^>]*>.*?</div>\s*</div>\s*</div>~s',
        '',
        $content
    );
    // Tidy any empty wrappers left behind
    for ($i = 0; $i < 3; $i++) {
        $content = preg_replace('~<(div|section)[^>]*>\s*</\1>~', '', $content);
    }

    if ($content !== $original) {
        wp_update_post(['ID' => $p->ID, 'post_content' => $content]);
        $updated++;
        echo "[clean-posts] cleaned #{$p->ID} ({$p->post_title})\n";
    }
}

echo "[clean-posts] $updated of " . count($posts) . " posts updated\n";
