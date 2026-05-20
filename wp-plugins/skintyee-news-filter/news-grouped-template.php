<?php
/**
 * Custom template for the /news/ blog index. Renders one section per
 * top-level category (Events / Programs / News / Announcements) with
 * the latest posts as cards.
 */

get_header();
?>
<div class="st-news-wrap">
<?php foreach (SKINTYEE_NEWS_GROUPS as $slug):
    $term = get_term_by('slug', $slug, 'category');
    if (!$term) continue;

    $q = new WP_Query([
        'post_type'      => 'post',
        'post_status'    => 'publish',
        'posts_per_page' => SKINTYEE_NEWS_PER_GROUP,
        'cat'            => (int) $term->term_id,
        'orderby'        => 'date',
        'order'          => 'DESC',
        'ignore_sticky_posts' => true,
    ]);
?>
    <section class="st-news-group">
        <div class="st-news-group-head">
            <h2><?php echo esc_html($term->name); ?></h2>
            <a class="st-view-all" href="<?php echo esc_url(get_term_link($term)); ?>">View all <?php echo esc_html(strtolower($term->name)); ?> &rarr;</a>
        </div>
        <?php if ($q->have_posts()): ?>
            <div class="st-news-grid">
            <?php while ($q->have_posts()): $q->the_post();
                $thumb_id  = get_post_thumbnail_id();
                $thumb_url = $thumb_id ? wp_get_attachment_image_url($thumb_id, 'skintyee_card') : '';
                if (!$thumb_url && $thumb_id) {
                    $thumb_url = wp_get_attachment_image_url($thumb_id, 'medium');
                }
            ?>
                <article class="st-news-card">
                    <?php if ($thumb_url): ?>
                        <a class="st-news-card-thumb" href="<?php the_permalink(); ?>">
                            <img src="<?php echo esc_url($thumb_url); ?>" alt="<?php echo esc_attr(get_the_title()); ?>" loading="lazy">
                        </a>
                    <?php endif; ?>
                    <div class="st-news-card-body">
                        <div class="st-news-card-meta"><?php echo esc_html(get_the_date()); ?></div>
                        <h3 class="st-news-card-title"><a href="<?php the_permalink(); ?>"><?php the_title(); ?></a></h3>
                        <p class="st-news-card-excerpt"><?php echo esc_html(wp_trim_words(get_the_excerpt(), 22, '&hellip;')); ?></p>
                    </div>
                </article>
            <?php endwhile; wp_reset_postdata(); ?>
            </div>
        <?php else: ?>
            <p class="st-news-empty">No <?php echo esc_html(strtolower($term->name)); ?> posts yet.</p>
        <?php endif; ?>
    </section>
<?php endforeach; ?>
</div>
<?php
get_footer();
