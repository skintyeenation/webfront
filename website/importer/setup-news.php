<?php
/**
 * Create a /news/ page and designate it as WordPress's "Posts page" so it
 * auto-renders the post archive (latest news, paginated). Visitors land on the
 * static home at /, and /news/ shows the blog-style listing of every post.
 *
 * Run via:  wp eval-file /importer/setup-news.php
 * Idempotent.
 */

declare(strict_types=1);

$news = get_page_by_path('news');
if (!$news) {
    $news_id = wp_insert_post([
        'post_type'    => 'page',
        'post_status'  => 'publish',
        'post_title'   => 'News',
        'post_name'    => 'news',
        'post_content' => '',  // ignored when page_for_posts points here
    ]);
    if (is_wp_error($news_id) || !$news_id) {
        echo "[news] failed to create page\n";
        exit(1);
    }
    echo "[news] created /news/ page (#$news_id)\n";
} else {
    $news_id = $news->ID;
    echo "[news] using existing /news/ page (#$news_id)\n";
}

update_option('page_for_posts', $news_id);
echo "[news] page_for_posts -> #$news_id (WP will render the post archive at /news/)\n";
