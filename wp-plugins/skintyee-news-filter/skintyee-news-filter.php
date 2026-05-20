<?php
/**
 * Plugin Name: Skintyee Category Sections
 * Description: Custom templates for the /news/ and /community/ pages that
 *              render top-level WP categories as grouped 3-up card grids
 *              with "View all" links.
 *              - /news/      : News + Announcements
 *              - /community/ : Events + Programs + Announcements
 * Version: 0.3.0
 */

// Slugs of the categories rendered on each page, in display order.
const SKINTYEE_NEWS_GROUPS      = ['news', 'announcements'];
const SKINTYEE_COMMUNITY_GROUPS = ['events', 'programs', 'announcements'];
const SKINTYEE_NEWS_LIMIT       = 6;
const SKINTYEE_COMMUNITY_LIMIT  = 3;

// Swap in our templates for the blog index and the /community/ page.
add_filter('template_include', function ($template) {
    if (is_admin()) return $template;
    if (is_home()) {
        $t = __DIR__ . '/news-grouped-template.php';
        return file_exists($t) ? $t : $template;
    }
    if (is_page('community')) {
        $t = __DIR__ . '/community-template.php';
        return file_exists($t) ? $t : $template;
    }
    return $template;
});

// Shared inline styles (loaded on both pages so they stay consistent).
add_action('wp_enqueue_scripts', function () {
    if (!(is_home() || is_page('community'))) return;
    wp_register_style('skintyee-cat-sections', false, [], '0.3.0');
    wp_enqueue_style('skintyee-cat-sections');
    wp_add_inline_style('skintyee-cat-sections', <<<CSS
/* .st-cat-page wraps everything so Astra's .ast-container (display:flex)
   has a single 100% child instead of laying our blocks side-by-side. */
.st-cat-page { width: 100%; }
.st-cat-wrap { max-width: 1200px; margin: 0 auto; padding: 2.5rem 1.25rem; }
/* Matches the Elementor hero spec in importer/build-section-pages.php
   (hero_section): 360px min-height, dark 50% overlay, centered Lora 48px
   white title with text-shadow. Keeps community visually consistent with
   About / History / Projects heroes. */
.st-cat-hero { position: relative; width: 100%; min-height: 360px; display: flex; align-items: center; justify-content: center; overflow: hidden; margin-bottom: 2.5rem; }
.st-cat-hero img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; object-position: center center; display: block; }
.st-cat-hero::after { content: ""; position: absolute; inset: 0; background: rgba(0, 0, 0, 0.5); }
.st-cat-hero h1 { position: relative; z-index: 2; max-width: 860px; padding: 0 1.25rem; margin: 0; text-align: center; color: #fff; font-family: "Lora", Georgia, serif; font-weight: 600; font-size: 48px; line-height: 1.2; text-shadow: 0 2px 6px rgba(0, 0, 0, 0.4); }
@media (max-width: 900px) { .st-cat-hero h1 { font-size: 36px; } }
@media (max-width: 600px) { .st-cat-hero h1 { font-size: 28px; } }
.st-cat-intro { max-width: 900px; margin: 0 auto 2.5rem; padding: 0 1.25rem; font-size: 1.05rem; line-height: 1.6; color: #333; }
.st-cat-intro p { margin: 0 0 1rem; }
.st-cat-group { margin-bottom: 3rem; }
.st-cat-group-head { display: flex; align-items: baseline; justify-content: space-between; border-bottom: 2px solid #e6e6e6; padding-bottom: .5rem; margin-bottom: 1.5rem; }
.st-cat-group-head h2 { margin: 0; font-size: 1.75rem; line-height: 1.2; }
.st-cat-group-head .st-view-all { font-size: .95rem; text-decoration: none; white-space: nowrap; }
.st-cat-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 1.5rem; }
@media (max-width: 900px) { .st-cat-grid { grid-template-columns: repeat(2, 1fr); } }
@media (max-width: 600px) { .st-cat-grid { grid-template-columns: 1fr; } }
.st-cat-card { background: #fff; border-radius: 6px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,.08); display: flex; flex-direction: column; }
.st-cat-card-thumb { aspect-ratio: 400 / 350; background: #f3f3f3; overflow: hidden; }
.st-cat-card-thumb img { width: 100%; height: 100%; object-fit: cover; display: block; }
.st-cat-card-body { padding: 1rem 1.1rem 1.2rem; display: flex; flex-direction: column; gap: .5rem; flex: 1; }
.st-cat-card-meta { font-size: .8rem; text-transform: uppercase; letter-spacing: .04em; color: #777; }
.st-cat-card-chips { display: flex; flex-wrap: wrap; gap: .35rem; }
.st-cat-card-chips a { font-size: .72rem; text-transform: uppercase; letter-spacing: .05em; background: #eef3f7; color: #2a5a7a; padding: .2rem .55rem; border-radius: 999px; text-decoration: none; line-height: 1.4; }
.st-cat-card-chips a:hover { background: #dce7ef; }
.st-cat-card-title { font-size: 1.05rem; line-height: 1.35; margin: 0; }
.st-cat-card-title a { text-decoration: none; color: inherit; }
.st-cat-card-excerpt { font-size: .9rem; color: #555; margin: 0; }
.st-cat-empty { color: #888; font-style: italic; }
CSS);
});

/**
 * Render one category section: header (title + View all link) and a grid of
 * up to $limit post cards in $term_slug.
 */
function skintyee_render_cat_section(string $term_slug, int $limit): void {
    $term = get_term_by('slug', $term_slug, 'category');
    if (!$term) return;

    $q = new WP_Query([
        'post_type'      => 'post',
        'post_status'    => 'publish',
        'posts_per_page' => $limit,
        'cat'            => (int) $term->term_id,
        'orderby'        => 'date',
        'order'          => 'DESC',
        'ignore_sticky_posts' => true,
    ]);
    ?>
    <section class="st-cat-group">
        <div class="st-cat-group-head">
            <h2><?php echo esc_html($term->name); ?></h2>
            <a class="st-view-all" href="<?php echo esc_url(get_term_link($term)); ?>">View all <?php echo esc_html(strtolower($term->name)); ?> &rarr;</a>
        </div>
        <?php if ($q->have_posts()): ?>
            <div class="st-cat-grid">
            <?php while ($q->have_posts()): $q->the_post();
                $tid = get_post_thumbnail_id();
                $thumb_url = $tid ? wp_get_attachment_image_url($tid, 'skintyee_card') : '';
                if (!$thumb_url && $tid) {
                    $thumb_url = wp_get_attachment_image_url($tid, 'medium');
                }
            ?>
                <article class="st-cat-card">
                    <?php if ($thumb_url): ?>
                        <a class="st-cat-card-thumb" href="<?php the_permalink(); ?>">
                            <img src="<?php echo esc_url($thumb_url); ?>" alt="<?php echo esc_attr(get_the_title()); ?>" loading="lazy">
                        </a>
                    <?php endif; ?>
                    <div class="st-cat-card-body">
                        <?php
                        // Subcategory chips: children of the current top-level term
                        // that this post is also assigned to. Lets a "Programs > Youth"
                        // post show a "Youth" chip when rendered in the Programs section.
                        $post_cats = get_the_category();
                        $subcats = array_filter($post_cats, fn($c) => (int) $c->parent === (int) $term->term_id);
                        if (!empty($subcats)): ?>
                            <div class="st-cat-card-chips">
                            <?php foreach ($subcats as $sc): ?>
                                <a href="<?php echo esc_url(get_term_link($sc)); ?>"><?php echo esc_html($sc->name); ?></a>
                            <?php endforeach; ?>
                            </div>
                        <?php endif; ?>
                        <div class="st-cat-card-meta"><?php echo esc_html(get_the_date()); ?></div>
                        <h3 class="st-cat-card-title"><a href="<?php the_permalink(); ?>"><?php the_title(); ?></a></h3>
                        <p class="st-cat-card-excerpt"><?php echo esc_html(wp_trim_words(get_the_excerpt(), 22, '&hellip;')); ?></p>
                    </div>
                </article>
            <?php endwhile; wp_reset_postdata(); ?>
            </div>
        <?php else: ?>
            <p class="st-cat-empty">No <?php echo esc_html(strtolower($term->name)); ?> posts yet.</p>
        <?php endif; ?>
    </section>
    <?php
}
