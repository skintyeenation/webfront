<?php
/**
 * Split the "Burns Lake District News Articles" page into separate
 * News-category posts (one per article reference), then delete the
 * original page. Also converts "Let the Preparations Begin" to an
 * Events post.
 *
 * Run via:  wp eval-file /importer/split-burns-lake-news.php
 * Idempotent.
 */

declare(strict_types=1);

// Each entry becomes a single News post.
const BURNS_LAKE_ARTICLES = [
    [
        'slug'  => 'internal-shakeup-skin-tyee-locked-out-of-bank-funds',
        'title' => 'Internal shakeup leaves Skin Tyee First Nation locked out of bank funds',
        'date'  => '2024-12-14 08:42:00',
        'url'   => 'https://www.burnslakelakesdistrictnews.com/local-news/internal-shakeup-leaves-skin-tyee-first-nation-locked-out-of-bank-funds-7659013',
        'source'=> 'Burns Lake District News',
    ],
    [
        'slug'  => 'former-skin-tyee-band-manager-faces-weapon-charges',
        'title' => 'Former Skin Tyee Nation band manager faces weapon charges',
        'date'  => '2024-11-25 10:49:00',
        'url'   => 'https://www.burnslakelakesdistrictnews.com/local-news/former-skin-tyee-nation-band-manager-faces-weapon-charges-7663471',
        'source'=> 'Burns Lake District News',
    ],
];

function st_upsert_news_post(array $a): int {
    $existing = get_posts(['post_type' => 'post', 'name' => $a['slug'], 'numberposts' => 1, 'post_status' => 'any']);
    $body = '<p><em>Originally published in the ' . esc_html($a['source']) . ' on ' . esc_html(date('F j, Y', strtotime($a['date']))) . '.</em></p>'
          . '<p><a href="' . esc_url($a['url']) . '" target="_blank" rel="noopener">Read the full article &rarr;</a></p>';
    $args = [
        'post_type'    => 'post',
        'post_status'  => 'publish',
        'post_title'   => $a['title'],
        'post_name'    => $a['slug'],
        'post_content' => $body,
        'post_date'    => $a['date'],
        'post_date_gmt'=> get_gmt_from_date($a['date']),
    ];
    if (!empty($existing)) {
        $args['ID'] = $existing[0]->ID;
        $id = wp_update_post($args);
    } else {
        $id = wp_insert_post($args);
    }
    if (is_wp_error($id) || !$id) {
        echo "[burns-lake] failed to upsert {$a['slug']}\n";
        return 0;
    }
    // Categorize under News
    $news = get_term_by('slug', 'news', 'category');
    if ($news) wp_set_post_categories((int) $id, [(int) $news->term_id], false);
    echo "[burns-lake] " . (!empty($existing) ? 'updated' : 'created') . " {$a['slug']} (#$id)\n";
    return (int) $id;
}

foreach (BURNS_LAKE_ARTICLES as $a) {
    st_upsert_news_post($a);
}

// Delete the original Burns Lake page once articles are split out.
$page = get_posts(['post_type' => 'page', 'name' => 'burns-lake-district-news-articles', 'numberposts' => 1, 'post_status' => 'any']);
if (!empty($page)) {
    wp_delete_post($page[0]->ID, true);
    echo "[burns-lake] deleted /burns-lake-district-news-articles/ page (#{$page[0]->ID})\n";
}

// --- "Let the Preparations Begin" -> Events post --------------------------
$prep = get_posts(['post_type' => 'page', 'name' => 'let-the-preparations-begin', 'numberposts' => 1, 'post_status' => 'any']);
if (!empty($prep)) {
    global $wpdb;
    $wpdb->update($wpdb->posts,
        ['post_type' => 'post', 'post_parent' => 0],
        ['ID' => $prep[0]->ID]
    );
    clean_post_cache($prep[0]->ID);
    $events = get_term_by('slug', 'events', 'category');
    if ($events) wp_set_post_categories((int) $prep[0]->ID, [(int) $events->term_id], false);
    echo "[burns-lake] converted /let-the-preparations-begin/ to post (#{$prep[0]->ID}) under Events\n";
}

echo "[burns-lake] done\n";
