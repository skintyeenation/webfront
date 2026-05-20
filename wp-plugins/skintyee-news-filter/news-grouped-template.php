<?php
/**
 * /news/ blog index — News + Announcements grouped sections.
 */
get_header();
?>
<div class="st-cat-page">
    <div class="st-cat-wrap">
        <?php foreach (SKINTYEE_NEWS_GROUPS as $slug) {
            skintyee_render_cat_section($slug, SKINTYEE_NEWS_LIMIT);
        } ?>
    </div>
</div>
<?php
get_footer();
