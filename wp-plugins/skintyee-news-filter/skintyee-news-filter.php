<?php
/**
 * Plugin Name: Skintyee News Filter
 * Description: Filters the /news/ page query to show only posts in the 'News'
 *              category and increases posts_per_page so older imported news
 *              (Burns Lake District articles from 2024) is visible without
 *              having to paginate.
 * Version: 0.1.0
 */

add_action('pre_get_posts', function ($query) {
    if (is_admin() || !$query->is_main_query()) return;
    // The /news/ page is set as page_for_posts in WP options, so its
    // posts-page query is_home() (NOT is_category()).
    if (!$query->is_home()) return;

    $news = get_term_by('slug', 'news', 'category');
    if (!$news) return;

    $query->set('category__in', [(int) $news->term_id]);
    $query->set('posts_per_page', 20);
});
