<?php
/**
 * Add prose content to posts that imported as image-only — the original
 * Site123 page rendered the message as a graphic, so the imported HTML
 * has just an <img> with no readable copy.
 *
 * Run via:  wp eval-file /importer/add-event-post-content.php
 * Idempotent: detects an existing "st-event-intro" marker and skips.
 */

declare(strict_types=1);

const EVENT_INTROS = [
    'red-dress-day-1' => <<<'HTML'
<div class="st-event-intro">
<p>Red Dress Day is the National Day of Awareness for <strong>Missing and Murdered Indigenous Women, Girls, and Two-Spirit people (MMIWG2S+)</strong>, observed on <strong>May 5</strong> each year. Red dresses are hung in public spaces and along roadsides &mdash; from porches to community halls to school gymnasiums &mdash; as a visual reminder of those who have been lost to gendered and racialized violence, and of the families still waiting for answers.</p>
<p>The observance grew out of the <em>REDress Project</em>, an installation begun in 2010 by M&eacute;tis artist Jaime Black. Each empty red dress stands for an Indigenous woman, girl, or Two-Spirit person who is missing or has been murdered. The colour red was chosen because, in some teachings, it is the only colour the spirits can see &mdash; calling them home.</p>
<p>Skin Tyee First Nation members gather on Red Dress Day to honour the lives behind the statistics, support affected families, and recommit to the work of prevention, justice, and healing in our community. We invite all members and allies to wear red, hang a dress, and take a moment of silence on May 5.</p>
</div>
HTML,

    'stn-christmas-community-dinner' => <<<'HTML'
<div class="st-event-intro">
<p>The <strong>Skin Tyee Nation Family Christmas Dinner</strong> is one of our most-anticipated gatherings of the year &mdash; a chance for members on and off reserve, Elders, families, and friends to come together for a shared meal, fellowship, and celebration before the holidays.</p>
<p>The dinner is held each <strong>December at the Island Gospel Church</strong> (Hwy 35, Burns Lake), with doors open from <strong>10:00 AM to 3:00 PM</strong>. Hot food, dessert, and refreshments are provided. The afternoon includes time for visiting, traditional gift exchanges for the children, music, and a visit from Santa for the younger members.</p>
<p>This is a family-friendly event open to all Skin Tyee members and invited guests. If you'd like to help with set-up, food preparation, or hosting on the day, please reach out to the Band Administration office in Southbank &mdash; volunteers are always welcome.</p>
</div>
HTML,

    'to-our-k-12-and-post-secondary-students-of-stn' => <<<'HTML'
<div class="st-event-intro">
<h2>Congratulations</h2>
<p>To all our graduates, from kindergarten to Grade 12 &mdash; <strong>congratulations!</strong></p>
<p>On behalf of the entire community, we celebrate your dedication, perseverance, and growth. Whether you&rsquo;re stepping into a new grade or embarking on new adventures beyond school, the STN Councillors and Band Members are incredibly proud of you.</p>
<p>Take pride in this achievement and move forward with confidence. Your future is bright, and we know you&rsquo;ll make it shine. Keep dreaming, keep learning, and most of all, keep believing in yourself!</p>
<p><em>&mdash; STN Councillors &amp; Band Members</em></p>
</div>
HTML,
];

const MARKER = 'st-event-intro';

foreach (EVENT_INTROS as $slug => $intro_html) {
    $rows = get_posts([
        'post_type'   => ['post', 'page'],
        'name'        => $slug,
        'numberposts' => 1,
        'post_status' => 'any',
    ]);
    if (empty($rows)) {
        echo "[event-intro] not found: $slug\n";
        continue;
    }
    $p = $rows[0];
    if (strpos($p->post_content, MARKER) !== false) {
        echo "[event-intro] $slug (#{$p->ID}): already has intro, skipping\n";
        continue;
    }
    $new = $intro_html . "\n" . $p->post_content;
    $res = wp_update_post(['ID' => $p->ID, 'post_content' => $new], true);
    if (is_wp_error($res)) {
        echo "[event-intro] failed for $slug: " . $res->get_error_message() . "\n";
        continue;
    }
    echo "[event-intro] $slug (#{$p->ID}): intro prepended\n";
}

echo "[event-intro] done\n";
