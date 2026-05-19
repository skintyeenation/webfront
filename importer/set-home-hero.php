<?php
/**
 * Replace the imported Site123 hero section on the home page with a clean
 * full-bleed cover hero using the chosen image.
 *
 * Run via:  wp eval-file /importer/set-home-hero.php
 * Idempotent: removes the prior st-hero block before adding a fresh one.
 */

declare(strict_types=1);

$HERO_SHA1 = '7e8ebbafda693524c7e2e203a95f6348a69233ba';
$HEADLINE  = '"Enpowering Our Future: Unity, Strength, Prosperity."';
$SUBTITLE  = 'Building a Brighter Tomorrow Together';

$home = get_page_by_path('home');
if (!$home) {
    echo "[hero] no home page found\n";
    exit(1);
}

global $wpdb;
$row = $wpdb->get_row($wpdb->prepare(
    "SELECT ID, guid FROM {$wpdb->posts} p
     JOIN {$wpdb->postmeta} m ON m.post_id = p.ID
     WHERE p.post_type = 'attachment'
       AND m.meta_key = '_skintyee_sha1'
       AND m.meta_value = %s
     LIMIT 1",
    $HERO_SHA1
));
if (!$row) {
    echo "[hero] no attachment found for sha1=$HERO_SHA1\n";
    exit(1);
}
$hero_url = $row->guid;

$content = $home->post_content;

// Strip any prior st-hero / st-testimonial so the script is safely re-runnable.
$content = preg_replace('/<!-- st-hero:start -->.*?<!-- st-hero:end -->\s*/s', '', $content);
$content = preg_replace('/<!-- st-testimonial:start -->.*?<!-- st-testimonial:end -->\s*/s', '', $content);

// Also strip the imported Site123 hero (the first <section> with header text
// layout), which we are replacing. Match conservatively: the first <section>
// only if it contains the Empowering quote.
$content = preg_replace_callback(
    '/<section\b[^>]*>.*?<\/section>/s',
    function ($m) use (&$replaced) {
        if (!isset($replaced) && (stripos($m[0], 'Enpowering') !== false || stripos($m[0], 'Empowering') !== false)) {
            $replaced = true;
            return '';  // drop the original Site123 hero
        }
        return $m[0];
    },
    $content,
    1
);

// Build the new hero block (Gutenberg cover block).
$hero_block = <<<HTML
<!-- st-hero:start -->
<!-- wp:cover {"url":"$hero_url","dimRatio":40,"overlayColor":"black","minHeight":520,"minHeightUnit":"px","contentPosition":"center center","align":"full"} -->
<div class="wp-block-cover alignfull is-light" style="min-height:520px">
  <span aria-hidden="true" class="wp-block-cover__background has-black-background-color has-background-dim-40 has-background-dim"></span>
  <img class="wp-block-cover__image-background" alt="" src="$hero_url" data-object-fit="cover"/>
  <div class="wp-block-cover__inner-container">
    <!-- wp:heading {"textAlign":"center","level":1,"style":{"color":{"text":"#ffffff"},"typography":{"fontSize":"3.4rem","fontStyle":"normal","fontWeight":"600","lineHeight":"1.15"}}} -->
    <h1 class="wp-block-heading has-text-align-center" style="color:#ffffff;font-size:3.4rem;font-style:normal;font-weight:600;line-height:1.15">$HEADLINE</h1>
    <!-- /wp:heading -->
    <!-- wp:paragraph {"align":"center","style":{"color":{"text":"#ffffff"},"typography":{"fontSize":"1.4rem","fontStyle":"italic"}}} -->
    <p class="has-text-align-center" style="color:#ffffff;font-size:1.4rem;font-style:italic">$SUBTITLE</p>
    <!-- /wp:paragraph -->
  </div>
</div>
<!-- /wp:cover -->
<!-- st-hero:end -->

HTML;

// Testimonial block (mirrors the Outdoor Adventure 02 demo's testimonial section,
// with the demo's lorem ipsum quote replaced by the Skin Tyee slogan).
$testimonial_block = <<<HTML
<!-- st-testimonial:start -->
<!-- wp:group {"align":"full","style":{"spacing":{"padding":{"top":"5rem","bottom":"5rem","left":"1.5rem","right":"1.5rem"}},"color":{"background":"#1f4341"}},"layout":{"type":"constrained","contentSize":"820px"}} -->
<div class="wp-block-group alignfull has-background" style="background-color:#1f4341;padding:5rem 1.5rem">
  <!-- wp:paragraph {"align":"center","style":{"color":{"text":"#e2efe8"},"typography":{"fontSize":"2rem","fontStyle":"italic","fontWeight":"500","lineHeight":"1.35","letterSpacing":"-0.01em"}}} -->
  <p class="has-text-align-center" style="color:#e2efe8;font-size:2rem;font-style:italic;font-weight:500;letter-spacing:-0.01em;line-height:1.35">"Enpowering Our Future: Unity, Strength, Prosperity."</p>
  <!-- /wp:paragraph -->
  <!-- wp:paragraph {"align":"center","style":{"color":{"text":"#9fc6bd"},"typography":{"fontSize":"0.95rem","textTransform":"uppercase","letterSpacing":"0.12em"}}} -->
  <p class="has-text-align-center" style="color:#9fc6bd;font-size:0.95rem;letter-spacing:0.12em;text-transform:uppercase">— Skin Tyee First Nation</p>
  <!-- /wp:paragraph -->
</div>
<!-- /wp:group -->
<!-- st-testimonial:end -->

HTML;

$content = $hero_block . $content . $testimonial_block;

wp_update_post([
    'ID'           => $home->ID,
    'post_content' => $content,
]);

echo "[hero] applied to home (page #{$home->ID}) using $hero_url\n";
