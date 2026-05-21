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
    // Strip the related-article-container div via DOMDocument — regex with
    // .*? closing on a specific count of </div> doesn't handle the nested
    // 3-card structure correctly (first attempt left two of the three cards
    // behind on some posts). DOMDocument removes the entire matching element
    // and all its descendants in one shot.
    if (str_contains($content, 'related-article-container')) {
        $dom = new DOMDocument();
        $prev = libxml_use_internal_errors(true);
        $dom->loadHTML('<?xml encoding="UTF-8"?><div id="__st_root">' . $content . '</div>',
                       LIBXML_HTML_NOIMPLIED | LIBXML_HTML_NODEFDTD);
        libxml_clear_errors();
        libxml_use_internal_errors($prev);
        $xp = new DOMXPath($dom);
        foreach ($xp->query('//div[contains(concat(" ", normalize-space(@class), " "), " related-article-container ")]') as $node) {
            $node->parentNode->removeChild($node);
        }
        $root = $dom->getElementById('__st_root');
        if ($root) {
            $new = '';
            foreach ($root->childNodes as $child) {
                $new .= $dom->saveHTML($child);
            }
            $content = $new;
        }
    }
    // Strip any <h1> whose text matches the post title — Astra (and most
    // themes) render the post title in the template header already, so a
    // duplicate h1 inside the body reads as a doubled heading.
    $title_normalized = strtolower(trim(preg_replace('/\s+/', ' ', strip_tags($p->post_title))));
    $content = preg_replace_callback(
        '~<h1\b[^>]*>(.*?)</h1>~is',
        function ($m) use ($title_normalized) {
            $heading = strtolower(trim(preg_replace('/\s+/', ' ', strip_tags($m[1]))));
            // Match if either is a prefix of the other (handles short titles
            // that got expanded in the imported h1 or vice versa).
            if ($heading === $title_normalized
                || str_starts_with($heading, $title_normalized)
                || str_starts_with($title_normalized, $heading)) {
                return '';
            }
            return $m[0];
        },
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
