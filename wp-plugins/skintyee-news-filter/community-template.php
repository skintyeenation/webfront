<?php
/**
 * /community/ — hero + intro pulled from the page itself, then
 * Events / Programs / Announcements grouped sections rendered live.
 */
get_header();

if (have_posts()) the_post();

$hero_id  = get_post_thumbnail_id();
$hero_url = $hero_id ? wp_get_attachment_image_url($hero_id, 'full') : '';
$intro_html = apply_filters('the_content', get_the_content());
?>
<div class="st-cat-page">
    <?php if ($hero_url): ?>
    <div class="st-cat-hero">
        <img src="<?php echo esc_url($hero_url); ?>" alt="<?php echo esc_attr(get_the_title()); ?>">
        <h1><?php the_title(); ?></h1>
    </div>
    <?php else: ?>
    <div class="st-cat-wrap"><h1><?php the_title(); ?></h1></div>
    <?php endif; ?>

    <?php if (trim(wp_strip_all_tags($intro_html)) !== ''): ?>
    <div class="st-cat-intro"><?php echo $intro_html; ?></div>
    <?php endif; ?>

    <div class="st-cat-wrap">
        <?php foreach (SKINTYEE_COMMUNITY_GROUPS as $slug) {
            skintyee_render_cat_section($slug, SKINTYEE_COMMUNITY_LIMIT);
        } ?>
    </div>
</div>
<?php
get_footer();
