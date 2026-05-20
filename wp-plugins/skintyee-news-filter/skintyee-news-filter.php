<?php
/**
 * Plugin Name: Skintyee News Filter
 * Description: Replaces the default /news/ blog index with a grouped layout
 *              that renders one section per top-level category
 *              (Events / Programs / News / Announcements), each with the
 *              latest posts in that category as cards.
 * Version: 0.2.0
 */

// Top-level category slugs to render, in display order.
const SKINTYEE_NEWS_GROUPS = ['events', 'programs', 'news', 'announcements'];
const SKINTYEE_NEWS_PER_GROUP = 6;

// Swap the blog-index template for our grouped renderer.
add_filter('template_include', function ($template) {
    if (is_admin() || !is_home()) return $template;
    $custom = __DIR__ . '/news-grouped-template.php';
    return file_exists($custom) ? $custom : $template;
});

// Inline styles for the grouped layout. Loaded only on the blog index.
add_action('wp_enqueue_scripts', function () {
    if (!is_home()) return;
    wp_register_style('skintyee-news-groups', false, [], '0.2.0');
    wp_enqueue_style('skintyee-news-groups');
    wp_add_inline_style('skintyee-news-groups', <<<CSS
.st-news-wrap { max-width: 1200px; margin: 0 auto; padding: 2.5rem 1.25rem; }
.st-news-group { margin-bottom: 3rem; }
.st-news-group-head { display: flex; align-items: baseline; justify-content: space-between; border-bottom: 2px solid #e6e6e6; padding-bottom: .5rem; margin-bottom: 1.5rem; }
.st-news-group-head h2 { margin: 0; font-size: 1.75rem; line-height: 1.2; }
.st-news-group-head .st-view-all { font-size: .95rem; text-decoration: none; }
.st-news-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 1.5rem; }
@media (max-width: 900px) { .st-news-grid { grid-template-columns: repeat(2, 1fr); } }
@media (max-width: 600px) { .st-news-grid { grid-template-columns: 1fr; } }
.st-news-card { background: #fff; border-radius: 6px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,.08); display: flex; flex-direction: column; }
.st-news-card-thumb { aspect-ratio: 400 / 350; background: #f3f3f3; overflow: hidden; }
.st-news-card-thumb img { width: 100%; height: 100%; object-fit: cover; display: block; }
.st-news-card-body { padding: 1rem 1.1rem 1.2rem; display: flex; flex-direction: column; gap: .5rem; flex: 1; }
.st-news-card-meta { font-size: .8rem; text-transform: uppercase; letter-spacing: .04em; color: #777; }
.st-news-card-title { font-size: 1.05rem; line-height: 1.35; margin: 0; }
.st-news-card-title a { text-decoration: none; color: inherit; }
.st-news-card-excerpt { font-size: .9rem; color: #555; margin: 0; }
.st-news-empty { color: #888; font-style: italic; }
CSS);
});
