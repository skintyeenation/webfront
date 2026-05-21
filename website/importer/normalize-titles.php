<?php
/**
 * Normalize ALL-CAPS imported page/post titles to title case.
 * Site123 had many titles screaming-shouted; once imported they remained.
 *
 * Acronyms in $KEEP_UPPER stay uppercase; everything else is lowercased
 * then title-cased with small words ($SMALL_WORDS) staying lower except at
 * the start.
 *
 * Run via:  wp eval-file /importer/normalize-titles.php
 * Idempotent.
 */

declare(strict_types=1);

const KEEP_UPPER = ['STN', 'FNHA', 'BC', 'MMIWG', 'OYEP', 'MCFD', 'STFN', 'TC', 'NIHB', 'STN.'];
const SMALL_WORDS = ['a','an','and','the','of','in','on','at','to','for','with','by','as','or','from','via','&'];

function st_smart_title_case(string $s): string {
    // Only retitle if 80%+ uppercase letters (avoid touching mixed-case)
    $letters = preg_replace('/[^A-Za-z]/', '', $s);
    if ($letters === '' ) return $s;
    $upper = preg_replace('/[^A-Z]/', '', $letters);
    if (strlen($upper) / max(1, strlen($letters)) < 0.8) return $s;

    // Lowercase the lot, then re-case word-by-word.
    $words = preg_split('/(\s+|-)/', strtolower($s), -1, PREG_SPLIT_DELIM_CAPTURE);
    $result = [];
    $idx = 0;
    $word_count = 0;
    foreach ($words as $w) {
        if ($w === '' || ctype_space($w) || $w === '-') {
            $result[] = $w;
            $idx++;
            continue;
        }
        $word_count++;
        $upper_form = strtoupper($w);
        if (in_array($upper_form, KEEP_UPPER, true)) {
            $result[] = $upper_form;
        } elseif ($word_count > 1 && in_array($w, SMALL_WORDS, true)) {
            $result[] = $w;
        } else {
            $result[] = ucfirst($w);
        }
        $idx++;
    }
    return implode('', $result);
}

$types = ['post', 'page'];
$updated = 0;
$scanned = 0;
foreach ($types as $type) {
    $posts = get_posts(['post_type' => $type, 'numberposts' => -1, 'post_status' => 'any']);
    foreach ($posts as $p) {
        $scanned++;
        $new = st_smart_title_case($p->post_title);
        // Strip trailing punctuation that's stylistic at best in a title.
        $new = rtrim($new, " \t\n\r:;,.");
        if ($new !== $p->post_title) {
            wp_update_post(['ID' => $p->ID, 'post_title' => $new]);
            echo "[titles] $type #{$p->ID}: \"{$p->post_title}\" -> \"$new\"\n";
            $updated++;
        }
    }
}
echo "[titles] scanned $scanned, updated $updated\n";
