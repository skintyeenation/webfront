<?php
/**
 * Split the combined "FNHA News" post into two separate posts — one per topic.
 * The original FNHA News post combined two unrelated FNHA stories at the
 * source; here we replace it with two cleanly-titled posts and put the
 * original in the trash.
 *
 * Run via:  wp eval-file /importer/split-fnha-news.php
 * Idempotent: if the two new posts already exist, just re-asserts their
 * content. Skips the trash step if the original is already gone.
 */

declare(strict_types=1);

const VIRTUAL_DOCTOR_SLUG = 'first-nations-virtual-doctor-of-the-day';
const VIRTUAL_DOCTOR_TITLE = 'First Nations Virtual Doctor of the Day';
const VIRTUAL_DOCTOR_CONTENT = <<<'HTML'
<p><img src="http://localhost:8080/wp-content/uploads/2026/05/81025486a1f2f1262121aa46cd528720b6de9f37.jpg" alt="First Nations Virtual Doctor of the Day" /></p>
<p>The First Nations Health Authority (FNHA) offers a Virtual Doctor of the Day service for community members. Connect with a primary-care physician by video or phone — no referral required.</p>
<p>Learn more via <a href="https://www.fnha.ca/what-we-do/ehealth/virtual-doctor-of-the-day">fnha.ca/what-we-do/ehealth/virtual-doctor-of-the-day</a>.</p>
HTML;

const BARBY_SLUG = 'fnha-30x30-active-challenge-community-wellness-champion-barby-skalin';
const BARBY_TITLE = 'FNHA 30×30 Active Challenge: Community Wellness Champion Barby Skalin';
const BARBY_CONTENT = <<<'HTML'
<p><img src="http://localhost:8080/wp-content/uploads/2026/05/c2b15c96727934ac86483f89724abe5690b034a8.jpg" alt="Barby Skalin — FNHA 30x30 Active Challenge" /></p>
<p><em>Barby Skaling — traditional name <strong>Yahalli</strong> — comes from the Gitksan Wet'suwet'en Nation in Moricetown, BC (Kyah Wiget) and is of Witsuwit'en/Gitxsan ancestry. She belongs to the Laksilyu clan (the house of many eyes). She lives on the traditional territory of the Lhleidli Tenneh in Prince George. She is sharing her story to inspire others during the FNHA's 30×30 Active Challenge for the month of June.</em></p>
<p>Barby Skaling began her physical wellness journey back in the 1990s while living in Vancouver. At the time, Barby says, she was at the beginning of many life changes — living as a single mother, working through hardships, overcoming addiction, and rebuilding feelings of self-love and worth.</p>
<p>She joined a Vancouver dragon boat team and undertook weight training, canoe paddling, dieting and running. It was her first time running, and the experience led her to seeing the annual Vancouver Sun Run on television. Barby had to give it a try. "I just registered and ran with the crowd," she recalls. "I experienced many challenges during my run with massive blisters, injured toenails, slipping on ice, running in the cold rain with no proper attire… the list goes on!"</p>
<p>That first experience was the beginning of a 30-plus-year tradition that includes running on her Carrier Sekani Family Services Sun Run team for the past 14 years. Running changed everything for Barby — physical exercise helps her mental health and gives her a more positive outlook in daily life.</p>
<p>"My small successes motivate me to achieve beyond what I can do right now. I don't think about age — I do this for my own well-being," says Barby, adding one of her biggest accomplishments was hiking Mount Robson.</p>
<p>Read more on the FNHA site: <a href="https://www.fnha.ca/about/news-and-events/news/30x30-active-challenge-community-wellness-champion-barby-skaling">FNHA — 30×30 Active Challenge: Community Wellness Champion Barby Skalin</a>.</p>
HTML;

function upsert_split_post(string $slug, string $title, string $content, array $cat_slugs): int {
    $existing = get_posts(['post_type' => 'post', 'name' => $slug, 'numberposts' => 1, 'post_status' => 'any']);
    $args = [
        'post_type'    => 'post',
        'post_status'  => 'publish',
        'post_title'   => $title,
        'post_name'    => $slug,
        'post_content' => $content,
    ];
    if (!empty($existing)) {
        $args['ID'] = $existing[0]->ID;
        $id = wp_update_post($args);
    } else {
        $id = wp_insert_post($args);
    }
    if (is_wp_error($id) || !$id) {
        echo "[split] failed: $slug\n";
        return 0;
    }
    // Assign categories
    $cat_ids = [];
    foreach ($cat_slugs as $cs) {
        $term = get_term_by('slug', $cs, 'category');
        if ($term) $cat_ids[] = (int) $term->term_id;
    }
    if (!empty($cat_ids)) {
        wp_set_post_categories((int) $id, $cat_ids, false);
    }
    echo "[split] " . (!empty($existing) ? 'updated' : 'created') . " $slug (#$id) -> [" . implode(',', $cat_slugs) . "]\n";
    return (int) $id;
}

upsert_split_post(VIRTUAL_DOCTOR_SLUG, VIRTUAL_DOCTOR_TITLE, VIRTUAL_DOCTOR_CONTENT, ['announcements', 'health']);
upsert_split_post(BARBY_SLUG, BARBY_TITLE, BARBY_CONTENT, ['announcements', 'health', 'news']);

// Trash the original combined post so it doesn't show up alongside the splits.
$original = get_posts(['post_type' => 'post', 'name' => 'fnha-news', 'numberposts' => 1, 'post_status' => 'any']);
if (!empty($original)) {
    wp_trash_post((int) $original[0]->ID);
    echo "[split] trashed original 'fnha-news' (#{$original[0]->ID})\n";
}

echo "[split] done\n";
